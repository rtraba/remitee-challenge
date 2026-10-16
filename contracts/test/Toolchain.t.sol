// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
contract ToolchainTest is Test {
    function testCompilerAndCheatcodes() public { vm.warp(100); assertEq(block.timestamp, 100); }
}
