// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {Escrow} from "../src/Escrow.sol";
import {TestToken, HostileToken, NoReturnToken} from "./Tokens.sol";

contract EscrowTest is Test {
    Escrow e;
    TestToken token;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address eve = address(0xE);
    uint256 constant AMOUNT = 100;

    function setUp() public {
        vm.warp(1000);
        e = new Escrow();
        token = new TestToken();
        token.mint(alice, 10000);
        vm.prank(alice);
        token.approve(address(e), type(uint256).max);
    }

    function create() internal returns (uint256) {
        vm.prank(alice);
        return e.createEscrow(address(token), bob, AMOUNT);
    }

    function act(uint256 action, uint256 id) internal {
        if (action == 0) e.cancelEscrow(id);
        else if (action == 1) e.confirmEscrow(id);
        else if (action == 2) e.rejectEscrow(id);
        else e.recoverExpired(id);
    }

    function actor(uint256 action) internal view returns (address) {
        return action == 0 || action == 3 ? alice : bob;
    }

    function testCreation() public {
        vm.recordLogs();
        uint256 id = create();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(id, 1);
        Escrow.EscrowData memory d = e.getEscrow(id);
        assertEq(d.sender, alice);
        assertEq(d.beneficiary, bob);
        assertEq(d.token, address(token));
        assertEq(d.amount, 100);
        assertEq(d.cancelDeadline, 8200);
        assertEq(d.expiresAt, 605800);
        assertEq(uint256(d.state), 0);
        assertEq(logs.length, 2);
        Vm.Log memory l = logs[1];
        assertEq(l.emitter, address(e));
        assertEq(l.topics[0], keccak256("EscrowCreated(uint256,address,address,address,uint256,uint256,uint256)"));
        assertEq(uint256(l.topics[1]), 1);
        assertEq(address(uint160(uint256(l.topics[2]))), alice);
        assertEq(address(uint160(uint256(l.topics[3]))), bob);
        assertEq(l.data, abi.encode(address(token), 100, 8200, 605800));
        assertEq(token.balanceOf(address(e)), 100);
        assertEq(create(), 2);
        assertEq(e.CANCEL_WINDOW(), 7200);
        assertEq(e.TTL(), 604800);
    }

    function testResolutionsAndTerminalPermanence() public {
        string[4] memory names =
            ["EscrowCancelled(uint256)", "EscrowReleased(uint256)", "EscrowRejected(uint256)", "EscrowExpired(uint256)"];
        for (uint256 action; action < 4; action++) {
            vm.warp(1000);
            uint256 id = create();
            if (action == 3) vm.warp(605800);
            uint256 senderBefore = token.balanceOf(alice);
            uint256 beneficiaryBefore = token.balanceOf(bob);
            vm.recordLogs();
            vm.prank(actor(action));
            act(action, id);
            Vm.Log[] memory logs = vm.getRecordedLogs();
            assertEq(logs.length, 2);
            assertEq(logs[1].topics[0], keccak256(bytes(names[action])));
            assertEq(uint256(logs[1].topics[1]), id);
            assertEq(uint256(e.getEscrow(id).state), action + 1);
            assertEq(token.balanceOf(address(e)), 0);
            assertEq(token.balanceOf(alice), senderBefore + (action == 1 ? 0 : 100));
            assertEq(token.balanceOf(bob), beneficiaryBefore + (action == 1 ? 100 : 0));
            assertFlags(id, false, false, false, false, false);
            for (uint256 next; next < 4; next++) {
                vm.expectRevert(abi.encodeWithSelector(Escrow.EscrowNotPending.selector, id, Escrow.State(action + 1)));
                vm.prank(actor(next));
                act(next, id);
            }
        }
    }

    function assertFlags(uint256 id, bool expired, bool cancel, bool confirm, bool reject, bool recover)
        internal
        view
    {
        Escrow.EscrowStatus memory s = e.getEscrowStatus(id);
        assertEq(uint256(s.recordedState), uint256(e.getEscrow(id).state));
        assertEq(s.expiredByTime, expired);
        assertEq(s.canCancel, cancel);
        assertEq(s.canConfirm, confirm);
        assertEq(s.canReject, reject);
        assertEq(s.canRecover, recover);
    }

    function testEveryTimeBoundaryAndStatusAgreement() public {
        uint256 id = create();
        assertFlags(id, false, true, true, true, false);
        vm.warp(8199);
        assertFlags(id, false, true, true, true, false);
        vm.prank(alice);
        e.cancelEscrow(id);
        for (uint256 offset; offset < 2; offset++) {
            vm.warp(1000);
            id = create();
            vm.warp(8200 + offset);
            assertFlags(id, false, false, true, true, false);
            vm.expectRevert(abi.encodeWithSelector(Escrow.CancellationWindowClosed.selector, id, 8200));
            vm.prank(alice);
            e.cancelEscrow(id);
        }
        for (uint256 action = 1; action < 4; action++) {
            for (uint256 boundary; boundary < 3; boundary++) {
                vm.warp(1000);
                id = create();
                vm.warp(605799 + boundary);
                bool expired = boundary > 0;
                assertFlags(id, expired, false, !expired, !expired, expired);
                if (action < 3 && expired) {
                    vm.expectRevert(abi.encodeWithSelector(Escrow.EscrowDeadlinePassed.selector, id, 605800));
                }
                if (action == 3 && !expired) {
                    vm.expectRevert(abi.encodeWithSelector(Escrow.EscrowNotExpired.selector, id, 605800));
                }
                vm.prank(actor(action));
                act(action, id);
            }
        }
    }

    function testUnknownAndUnauthorizedValidationOrder() public {
        for (uint256 a; a < 4; a++) {
            vm.expectRevert(abi.encodeWithSelector(Escrow.EscrowNotFound.selector, 0));
            act(a, 0);
        }
        vm.expectRevert(abi.encodeWithSelector(Escrow.EscrowNotFound.selector, 99));
        e.getEscrow(99);
        vm.expectRevert(abi.encodeWithSelector(Escrow.EscrowNotFound.selector, 99));
        e.getEscrowStatus(99);
        uint256 id = create();
        token.mint(eve, 100);
        vm.startPrank(eve);
        token.approve(address(e), 100);
        e.createEscrow(address(token), alice, 100);
        vm.stopPrank();
        vm.warp(700000);
        for (uint256 a; a < 4; a++) {
            bytes4 sel = a == 0 || a == 3 ? Escrow.UnauthorizedSender.selector : Escrow.UnauthorizedBeneficiary.selector;
            vm.expectRevert(abi.encodeWithSelector(sel, id, eve));
            vm.prank(eve);
            act(a, id);
        }
        vm.expectRevert(abi.encodeWithSelector(Escrow.UnauthorizedSender.selector, id, bob));
        vm.prank(bob);
        e.cancelEscrow(id);
        vm.expectRevert(abi.encodeWithSelector(Escrow.UnauthorizedBeneficiary.selector, id, alice));
        vm.prank(alice);
        e.confirmEscrow(id);
    }

    function testInvalidCreationAndAllowanceBalanceRollback() public {
        vm.expectRevert(Escrow.InvalidAmount.selector);
        vm.prank(alice);
        e.createEscrow(address(token), bob, 0);
        address[2] memory bad = [address(0), alice];
        for (uint256 i; i < 2; i++) {
            vm.expectRevert(abi.encodeWithSelector(Escrow.InvalidBeneficiary.selector, bad[i]));
            vm.prank(alice);
            e.createEscrow(address(token), bad[i], 1);
        }
        for (uint256 i; i < 2; i++) {
            address t = i == 0 ? address(0) : eve;
            vm.expectRevert(abi.encodeWithSelector(Escrow.InvalidToken.selector, t));
            vm.prank(alice);
            e.createEscrow(t, bob, 1);
        }
        vm.prank(eve);
        token.approve(address(e), 1);
        vm.expectRevert();
        vm.prank(eve);
        e.createEscrow(address(token), bob, 1);
        vm.prank(alice);
        token.approve(address(e), 0);
        vm.expectRevert();
        vm.prank(alice);
        e.createEscrow(address(token), bob, 1);
        vm.prank(alice);
        token.approve(address(e), 100);
        assertEq(create(), 1);
    }

    function testNoReturnAndTokenIsolation() public {
        NoReturnToken n = new NoReturnToken();
        n.mint(alice, 500);
        vm.startPrank(alice);
        n.approve(address(e), 500);
        uint256 id = e.createEscrow(address(n), bob, 100);
        uint256 id2 = e.createEscrow(address(n), bob, 200);
        vm.stopPrank();
        uint256 standard = create();
        vm.prank(bob);
        e.confirmEscrow(id);
        assertEq(n.balanceOf(bob), 100);
        assertEq(n.balanceOf(address(e)), 200);
        assertEq(token.balanceOf(address(e)), 100);
        vm.prank(alice);
        e.cancelEscrow(id2);
        vm.prank(bob);
        e.rejectEscrow(standard);
        assertEq(n.balanceOf(alice), 400);
        assertEq(token.balanceOf(alice), 10000);
    }

    function testHostileDepositsAndPayoutRollback() public {
        HostileToken h = new HostileToken();
        h.mint(alice, 1000);
        h.mint(address(e), 10);
        vm.prank(alice);
        h.approve(address(e), 1000);
        for (uint256 m = 1; m <= 4; m++) {
            h.configure(HostileToken.Mode(m), address(0), "");
            vm.expectRevert();
            vm.prank(alice);
            e.createEscrow(address(h), bob, 100);
            assertEq(h.balanceOf(alice), 1000);
            assertEq(h.balanceOf(address(e)), 10);
            vm.expectRevert(abi.encodeWithSelector(Escrow.EscrowNotFound.selector, 1));
            e.getEscrow(1);
        }
        h.configure(HostileToken.Mode.Normal, address(0), "");
        vm.prank(alice);
        uint256 id = e.createEscrow(address(h), bob, 100);
        assertEq(id, 1);
        for (uint256 a; a < 4; a++) {
            for (uint256 m = 1; m <= 2; m++) {
                vm.warp(a == 3 ? 605800 : 1000);
                h.configure(HostileToken.Mode(m), address(0), "");
                vm.expectRevert();
                vm.prank(actor(a));
                act(a, id);
                assertEq(uint256(e.getEscrow(id).state), 0);
                assertEq(h.balanceOf(address(e)), 110);
                assertEq(h.balanceOf(bob), 0);
            }
        }
    }

    function testCallbackGuardCreationAndEveryPayout() public {
        HostileToken h = new HostileToken();
        h.mint(alice, 1000);
        vm.prank(alice);
        h.approve(address(e), 1000);
        bytes[5] memory calls = [
            abi.encodeCall(e.createEscrow, (address(h), bob, 1)),
            abi.encodeCall(e.cancelEscrow, (1)),
            abi.encodeCall(e.confirmEscrow, (1)),
            abi.encodeCall(e.rejectEscrow, (1)),
            abi.encodeCall(e.recoverExpired, (1))
        ];
        for (uint256 a; a < 5; a++) {
            vm.warp(1000);
            h.configure(HostileToken.Mode.CallbackPropagated, address(e), calls[a]);
            vm.expectRevert(bytes("CALLBACK_FAILED"));
            vm.prank(alice);
            e.createEscrow(address(h), bob, 100);
            h.configure(HostileToken.Mode.CallbackCaught, address(e), calls[a]);
            vm.prank(alice);
            uint256 id = e.createEscrow(address(h), bob, 100);
            assertFalse(h.callbackSucceeded());
            if (a % 4 == 3) vm.warp(605800);
            h.configure(HostileToken.Mode.CallbackPropagated, address(e), calls[a]);
            vm.expectRevert(bytes("CALLBACK_FAILED"));
            vm.prank(actor(a % 4));
            act(a % 4, id);
            assertEq(uint256(e.getEscrow(id).state), 0);
            if (a % 4 == 3) vm.warp(605800);
            h.configure(HostileToken.Mode.CallbackCaught, address(e), calls[a]);
            vm.prank(actor(a % 4));
            act(a % 4, id);
            assertFalse(h.callbackSucceeded());
        }
    }
}
