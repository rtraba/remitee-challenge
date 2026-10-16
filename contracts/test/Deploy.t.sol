// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {DeployLocal} from "../script/DeployLocal.s.sol";
contract DeployTest is Test {
    function testLocalScriptRejectsOtherChain() public {
        DeployLocal script = new DeployLocal(); vm.chainId(11155111);
        vm.expectRevert(bytes("LOCAL_ONLY")); script.deployLocal();
    }
}
