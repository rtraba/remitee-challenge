// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {DeployEscrow} from "./DeployEscrow.s.sol";
import {Escrow} from "../src/Escrow.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
contract DemoToken is ERC20 {
    constructor(address recipient) ERC20("Local fixture token", "LOCAL") { _mint(recipient, 1000000 ether); }
}
contract DeployLocal is DeployEscrow {
    function deployLocal() external returns (DemoToken token, Escrow escrow) {
        require(block.chainid == 31337, "LOCAL_ONLY");
        vm.startBroadcast(); token = new DemoToken(msg.sender); escrow = _deployEscrow(); vm.stopBroadcast();
    }
}
