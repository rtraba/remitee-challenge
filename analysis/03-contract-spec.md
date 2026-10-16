# Escrow contract specification

Status: core interface, lifecycle, authorization, and token policy accepted. Detailed error/event/test definitions below are the execution specification, not implementation code.

## Scope and dependencies

One non-upgradeable Solidity 0.8.x contract, named Escrow (use EscrowData for the struct to avoid name collision). Foundry tests and Anvil local node. Use compatible pinned OpenZeppelin SafeERC20 and ReentrancyGuard dependencies. Verify exact versions before implementation. No ownership, administrative roles, allowlist, pause, upgrade, rescue, or arbitrary withdrawal functions.

## Storage and interface

Public constants CANCEL_WINDOW = 2 hours and TTL = 7 days. Sequential uint256 identifiers start at 1. Do not optimize field widths for this delivery without a demonstrated need.

EscrowData: address sender; address beneficiary; address token; uint256 amount; uint256 cancelDeadline; uint256 expiresAt; State state.

State enum: Pending, CancelledBySender, Released, Rejected, Expired. An unknown mapping entry must not be mistaken for Pending: identifiers are valid only after successful creation. Use a single existence predicate consistently (e.g. sender != address(0)).

Public entry points:

- createEscrow(address token, address beneficiary, uint256 amount) external nonReentrant returns (uint256 id)
- cancelEscrow(uint256 id) external nonReentrant onlySender(id) onlyPending(id) withinCancellationWindow(id)
- confirmEscrow(uint256 id) external nonReentrant onlyBeneficiary(id) onlyPending(id) beforeExpiry(id)
- rejectEscrow(uint256 id) external nonReentrant onlyBeneficiary(id) onlyPending(id) beforeExpiry(id)
- recoverExpired(uint256 id) external nonReentrant onlySender(id) onlyPending(id) afterExpiry(id)
- getEscrow(uint256 id) external view returns (EscrowData memory)
- getEscrowStatus(uint256 id) external view returns (EscrowStatus memory)

Use escrow-specific access modifiers, checking existence before address comparison. Reads remain public. Sender and beneficiary never change. No global participant roles.

## Creation

1. Reject amount == 0, beneficiary == address(0), beneficiary == msg.sender, and token addresses with no deployed code (including address(0)). Token code is necessary but does not prove ERC-20 correctness.
2. Read contract token balance, invoke safeTransferFrom(msg.sender, address(this), amount), and read balance again.
3. Require a nonnegative increase exactly equal to amount. Handle a reduced balance as an unsupported deposit rather than allowing subtraction underflow to obscure the cause.
4. Allocate ID, persist sender/beneficiary/token/amount and deadlines derived from the creation block timestamp, and emit EscrowCreated.

Creation is guarded against reentrancy throughout. Persist only after confirming receipt; creation is the justified exception to the usual effects-before-interactions ordering because received funds must be validated. Any failure rolls back the transfer, ID allocation, storage, and logs. No partially created escrow becomes externally actionable.

## Resolution and time boundaries

All resolution actions require an existing escrow, correct actor, Pending state, and valid time window. Define consistent validation order: reentrancy guard, existence/authorization, Pending, then time. Test meaningful combined-invalid cases so error expectations are deterministic.

| Action | Actor | Condition | New state | Transfer recipient |
| --- | --- | --- | --- | --- |
| cancelEscrow | Sender | timestamp < cancelDeadline | CancelledBySender | Sender |
| confirmEscrow | Beneficiary | timestamp < expiresAt | Released | Beneficiary |
| rejectEscrow | Beneficiary | timestamp < expiresAt | Rejected | Sender |
| recoverExpired | Sender | timestamp >= expiresAt | Expired | Sender |

Before the cancellation deadline, beneficiary confirmation/rejection is also available. Transactions are ordered by chain execution; the first valid resolution wins. At cancelDeadline cancellation is forbidden. At expiresAt confirmation/rejection are forbidden and recovery is allowed.

Update state before safeTransfer, and emit the resolution event only after successful transfer. Failed transfers revert state and logs. Never bypass transfer failure or mark resolution successful without paying the required recipient. Events cannot persist from a reverted transaction.

Time passing does not update contract state. Expired on-chain means recovery was executed successfully, not merely that TTL elapsed.

## Derived lifecycle and shared validation

EscrowStatus: State recordedState; bool expiredByTime; bool canCancel; bool canConfirm; bool canReject; bool canRecover.

getEscrowStatus requires an existing ID and evaluates at block.timestamp. It does not mutate storage. Flags describe action eligibility for the designated party under lifecycle rules, independent of msg.sender, allowance, token availability, or transfer success.

- expiredByTime = Pending && timestamp >= expiresAt.
- canCancel = Pending && timestamp < cancelDeadline.
- canConfirm = canReject = Pending && timestamp < expiresAt.
- canRecover = Pending && timestamp >= expiresAt.
- Every flag is false for every terminal state, including recorded Expired.

Use a small set of internal pure predicates accepting EscrowData (or the necessary fields) and a timestamp. Separate state and time predicates so modifiers can produce precise errors. Reuse these predicates in both the status query and modifiers; do not maintain a second interpretation of deadlines. Avoid state-class inheritance, external calls to this contract for validation, and extra time-derived values in storage.

Explicit lifecycle modifiers:

- onlyPending(id): EscrowNotPending on terminal states.
- withinCancellationWindow(id): CancellationWindowClosed when timestamp >= cancelDeadline.
- beforeExpiry(id): EscrowDeadlinePassed when timestamp >= expiresAt.
- afterExpiry(id): EscrowNotExpired when timestamp < expiresAt.

The function declarations above compose modifiers in the displayed order. Authorization modifiers validate existence first, followed by state and time modifiers. Keep repeated storage access straightforward; do not sacrifice clarity for speculative gas optimization.

The transaction body executes the validated transition, transfer, and event. Transition targets are fixed by the entry point, never accepted as caller-supplied arbitrary state. A helper may share payout mechanics if that reduces duplication while preserving explicit events and recipients.

API distinction: Pending past TTL has recordedState Pending, effective status Expired, recoverable true, and no resolution transaction. After successful recovery it has recordedState Expired, effective status Expired, recoverable false, and a resolution transaction. Preserve this distinction even though both effective statuses are Expired. Block depth governs event confirmation policy, not deadline passage.

## Events

- EscrowCreated(uint256 indexed id, address indexed sender, address indexed beneficiary, address token, uint256 amount, uint256 cancelDeadline, uint256 expiresAt)
- EscrowCancelled(uint256 indexed id)
- EscrowReleased(uint256 indexed id)
- EscrowRejected(uint256 indexed id)
- EscrowExpired(uint256 indexed id)

Creation plus a resolution event suffices to reconstruct each escrow. Transaction hash, chain/contract identity, block number/hash, transaction index, and log index come from log metadata. Terminal events do not need to duplicate immutable creation fields. Emit exactly one creation event and one event for any successful resolution.

## Custom errors

Suggested concrete signatures:

- EscrowNotFound(uint256 id)
- InvalidAmount()
- InvalidBeneficiary(address beneficiary)
- InvalidToken(address token)
- UnsupportedDepositAmount(uint256 expected, uint256 balanceBefore, uint256 balanceAfter)
- UnauthorizedSender(uint256 id, address caller)
- UnauthorizedBeneficiary(uint256 id, address caller)
- EscrowNotPending(uint256 id, State state)
- CancellationWindowClosed(uint256 id, uint256 deadline)
- EscrowDeadlinePassed(uint256 id, uint256 expiresAt)
- EscrowNotExpired(uint256 id, uint256 expiresAt)

Use OpenZeppelin/token errors for failed external transfers rather than wrapping every revert and losing useful information. Explain that token-originated reverts may differ from contract validation errors.

## Supported token model and limits

Support ordinary ERC-20 tokens and optional-return ERC-20 tokens through SafeERC20. Reject deposits with non-exact received amounts; fee-on-transfer behavior is unsupported. No permit path.

The deposit balance check is not a universal token certification mechanism. Rebasing, outbound-only fees, confiscation, dishonest balanceOf, pause/blacklist behavior, and malicious token economics are outside the supported assumptions. Document these limits. Do not introduce token registries or multiple payout balance checks without a reviewed change in scope. No contract can guarantee availability for arbitrary malicious tokens.

Accounting: each successful creation adds one fully funded obligation for that token; a successful resolution discharges it once. Keep no redundant aggregate accounting storage unless tests/implementation justify it. Unsolicited token transfers are not escrow deposits and cannot be withdrawn through administrative powers. Therefore contract balance may exceed pending liabilities; do not claim universal equality.

## Mandatory verification

Use independent escrows and token balances to verify:

- Creation storage, ID sequencing, exact receipt, deadlines, and event fields.
- Every resolution's state, correct recipient, amount, and event.
- All wrong-party cases, including an account that is an authorized party of a different escrow.
- Status-query flags before, at, and after both deadlines, and in every terminal state; agreement between reported eligibility and lifecycle checks for the designated actor.
- Unknown IDs on every read/action, including getEscrowStatus; zero amount; invalid beneficiary; invalid token.
- Every attempted action from each terminal state; no double payment.
- Cancellation at deadline - 1, deadline, deadline + 1.
- Confirmation and rejection at expiry - 1, expiry, expiry + 1.
- Recovery at expiry - 1, expiry, expiry + 1.
- Beneficiary resolution during the sender cancellation window.
- Multiple escrows sharing a token and escrows using different tokens remain isolated.
- Tokens with no return value succeed on deposit and payout.
- False-return, reverting transfers, insufficient balance/allowance fail without orphan storage, consumed IDs, logs, or changed terminal state.
- Fee-on-transfer deposit reverts atomically.
- Callback/reentrancy attempts during creation and outgoing transfer cannot create unauthorized or duplicate payouts. Distinguish callback failure from a token that catches that failure and completes a legitimate transfer.

Optional after mandatory delivery: bounded fuzz tests and invariants for solvency under standard-token assumptions, immutable parties, and terminal-state permanence. Include unsolicited transfers if asserting balance >= liabilities; equality requires an explicitly restricted model.

## Ready-to-implement gate

Contract behavior above is internally consistent. The complete test matrix and execution plan carry these requirements forward. Pin compatible dependency versions during execution preparation; detailed signatures may be adjusted consistently without changing accepted behavior. Do not treat this document alone as authorization to begin implementation.
