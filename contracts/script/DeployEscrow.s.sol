// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {Escrow} from "../src/Escrow.sol";

contract DeployEscrow is Script {
    function _deployEscrow() internal returns (Escrow) {
        return new Escrow();
    }

    function run() external returns (Escrow escrow) {
        vm.startBroadcast();
        escrow = _deployEscrow();
        vm.stopBroadcast();
    }
}
