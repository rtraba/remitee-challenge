// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestToken is ERC20 {
    constructor() ERC20("Fixture", "FIX") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract HostileToken is TestToken {
    enum Mode {
        Normal,
        FalseReturn,
        Revert,
        Fee,
        ReduceBalance,
        CallbackCaught,
        CallbackPropagated
    }

    Mode public mode;
    address public target;
    bytes public callData;
    bool public callbackSucceeded;

    function configure(Mode m, address t, bytes memory d) external {
        mode = m;
        target = t;
        callData = d;
    }

    function _attack() private returns (bool) {
        if (mode == Mode.FalseReturn) return false;
        require(mode != Mode.Revert, "TOKEN_REVERT");
        if (mode == Mode.CallbackCaught || mode == Mode.CallbackPropagated) {
            (bool ok,) = target.call(callData);
            callbackSucceeded = ok;
            if (mode == Mode.CallbackPropagated) require(ok, "CALLBACK_FAILED");
        }
        return true;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (!_attack()) return false;
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (!_attack()) return false;
        if (mode == Mode.ReduceBalance) {
            _burn(to, 1);
            return true;
        }
        bool ok = super.transferFrom(from, to, amount);
        if (mode == Mode.Fee) _burn(to, 1);
        return ok;
    }
}

contract NoReturnToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 value) external {
        balanceOf[to] += value;
    }

    function approve(address to, uint256 value) external {
        allowance[msg.sender][to] = value;
    }

    function transfer(address to, uint256 value) external {
        _move(msg.sender, to, value);
    }

    function transferFrom(address from, address to, uint256 value) external {
        allowance[from][msg.sender] -= value;
        _move(from, to, value);
    }

    function _move(address from, address to, uint256 value) private {
        balanceOf[from] -= value;
        balanceOf[to] += value;
    }
}
