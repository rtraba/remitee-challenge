// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Immutable per-escrow authority; exact deposits and one terminal payout.
/// @dev Assumes ordinary, non-rebasing token economics. No administrative withdrawals.
contract Escrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant CANCEL_WINDOW = 2 hours;
    uint256 public constant TTL = 7 days;

    enum State {
        Pending,
        CancelledBySender,
        Released,
        Rejected,
        Expired
    }

    struct EscrowData {
        address sender;
        address beneficiary;
        address token;
        uint256 amount;
        uint256 cancelDeadline;
        uint256 expiresAt;
        State state;
    }

    struct EscrowStatus {
        State recordedState;
        bool expiredByTime;
        bool canCancel;
        bool canConfirm;
        bool canReject;
        bool canRecover;
    }

    mapping(uint256 => EscrowData) private escrows;
    uint256 private nextId = 1;

    error EscrowNotFound(uint256 id);
    error InvalidAmount();
    error InvalidBeneficiary(address beneficiary);
    error InvalidToken(address token);
    error UnsupportedDepositAmount(uint256 expected, uint256 balanceBefore, uint256 balanceAfter);
    error UnauthorizedSender(uint256 id, address caller);
    error UnauthorizedBeneficiary(uint256 id, address caller);
    error EscrowNotPending(uint256 id, State state);
    error CancellationWindowClosed(uint256 id, uint256 deadline);
    error EscrowDeadlinePassed(uint256 id, uint256 expiresAt);
    error EscrowNotExpired(uint256 id, uint256 expiresAt);

    event EscrowCreated(
        uint256 indexed id,
        address indexed sender,
        address indexed beneficiary,
        address token,
        uint256 amount,
        uint256 cancelDeadline,
        uint256 expiresAt
    );
    event EscrowCancelled(uint256 indexed id);
    event EscrowReleased(uint256 indexed id);
    event EscrowRejected(uint256 indexed id);
    event EscrowExpired(uint256 indexed id);

    modifier onlySender(uint256 id) {
        if (_existing(id).sender != msg.sender) revert UnauthorizedSender(id, msg.sender);
        _;
    }

    modifier onlyBeneficiary(uint256 id) {
        if (_existing(id).beneficiary != msg.sender) revert UnauthorizedBeneficiary(id, msg.sender);
        _;
    }

    modifier onlyPending(uint256 id) {
        if (!_pending(escrows[id])) revert EscrowNotPending(id, escrows[id].state);
        _;
    }

    modifier withinCancellationWindow(uint256 id) {
        if (!_beforeCancellation(escrows[id], block.timestamp)) {
            revert CancellationWindowClosed(id, escrows[id].cancelDeadline);
        }
        _;
    }

    modifier beforeExpiry(uint256 id) {
        if (!_beforeExpiry(escrows[id], block.timestamp)) revert EscrowDeadlinePassed(id, escrows[id].expiresAt);
        _;
    }

    modifier afterExpiry(uint256 id) {
        if (_beforeExpiry(escrows[id], block.timestamp)) revert EscrowNotExpired(id, escrows[id].expiresAt);
        _;
    }

    function createEscrow(address token, address beneficiary, uint256 amount)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (amount == 0) revert InvalidAmount();
        if (beneficiary == address(0) || beneficiary == msg.sender) revert InvalidBeneficiary(beneficiary);
        if (token.code.length == 0) revert InvalidToken(token);
        uint256 beforeBalance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 afterBalance = IERC20(token).balanceOf(address(this));
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != amount) {
            revert UnsupportedDepositAmount(amount, beforeBalance, afterBalance);
        }
        // Receipt is validated before recording an obligation. The guard prevents callbacks
        // from creating or resolving a partially funded escrow; a failure rolls back the token.
        id = nextId++;
        uint256 deadline = block.timestamp + CANCEL_WINDOW;
        uint256 expiry = block.timestamp + TTL;
        escrows[id] = EscrowData(msg.sender, beneficiary, token, amount, deadline, expiry, State.Pending);
        emit EscrowCreated(id, msg.sender, beneficiary, token, amount, deadline, expiry);
    }

    function cancelEscrow(uint256 id)
        external
        nonReentrant
        onlySender(id)
        onlyPending(id)
        withinCancellationWindow(id)
    {
        _pay(id, State.CancelledBySender, escrows[id].sender);
        emit EscrowCancelled(id);
    }

    function confirmEscrow(uint256 id) external nonReentrant onlyBeneficiary(id) onlyPending(id) beforeExpiry(id) {
        _pay(id, State.Released, escrows[id].beneficiary);
        emit EscrowReleased(id);
    }

    function rejectEscrow(uint256 id) external nonReentrant onlyBeneficiary(id) onlyPending(id) beforeExpiry(id) {
        _pay(id, State.Rejected, escrows[id].sender);
        emit EscrowRejected(id);
    }

    function recoverExpired(uint256 id) external nonReentrant onlySender(id) onlyPending(id) afterExpiry(id) {
        _pay(id, State.Expired, escrows[id].sender);
        emit EscrowExpired(id);
    }

    function getEscrow(uint256 id) external view returns (EscrowData memory) {
        return _existing(id);
    }

    function getEscrowStatus(uint256 id) external view returns (EscrowStatus memory status) {
        EscrowData storage e = _existing(id);
        bool pending = _pending(e);
        bool unexpired = _beforeExpiry(e, block.timestamp);
        status = EscrowStatus(
            e.state,
            pending && !unexpired,
            pending && _beforeCancellation(e, block.timestamp),
            pending && unexpired,
            pending && unexpired,
            pending && !unexpired
        );
    }

    function _existing(uint256 id) private view returns (EscrowData storage e) {
        e = escrows[id];
        if (e.sender == address(0)) revert EscrowNotFound(id);
    }

    function _pending(EscrowData storage e) private view returns (bool) {
        return e.state == State.Pending;
    }

    function _beforeCancellation(EscrowData storage e, uint256 timestamp) private view returns (bool) {
        return timestamp < e.cancelDeadline;
    }

    function _beforeExpiry(EscrowData storage e, uint256 timestamp) private view returns (bool) {
        return timestamp < e.expiresAt;
    }

    function _pay(uint256 id, State state, address recipient) private {
        EscrowData storage e = escrows[id];
        e.state = state;
        IERC20(e.token).safeTransfer(recipient, e.amount);
    }
}
