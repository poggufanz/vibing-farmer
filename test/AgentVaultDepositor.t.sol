// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentVaultDepositor} from "../contracts/AgentVaultDepositor.sol";
import {MockVault} from "../contracts/MockVault.sol";

contract AgentVaultDepositorTest is Test {
    AgentVaultDepositor depositor;
    MockVault vaultA;
    MockVault vaultB;

    address user = address(0xBEEF);
    bytes32 agentId1 = keccak256("agent-1");
    bytes32 agentId2 = keccak256("agent-2");
    uint256 maxAmount = 100e6; // 100 USDC
    uint256 expiry; // set in setUp

    function setUp() public {
        depositor = new AgentVaultDepositor();
        vaultA = new MockVault("MockVault USDC-A", address(0));
        vaultB = new MockVault("MockVault USDC-B", address(0));
        expiry = block.timestamp + 1 days;
    }

    // ─── Grant / Revoke ───────────────────────────────────────────────────────

    function test_grantAgentPermission_stores_permission() public {
        vm.prank(user);
        depositor.grantAgentPermission(agentId1, address(vaultA), maxAmount, expiry);

        (address vault, uint256 max, uint256 used, uint256 exp, bool active) =
            depositor.agentPermissions(user, agentId1);

        assertEq(vault, address(vaultA));
        assertEq(max, maxAmount);
        assertEq(used, 0);
        assertEq(exp, expiry);
        assertTrue(active);
    }

    function test_grantAgentPermission_reverts_zero_vault() public {
        vm.prank(user);
        vm.expectRevert(AgentVaultDepositor.InvalidVault.selector);
        depositor.grantAgentPermission(agentId1, address(0), maxAmount, expiry);
    }

    function test_grantAgentPermission_reverts_zero_amount() public {
        vm.prank(user);
        vm.expectRevert(AgentVaultDepositor.InvalidAmount.selector);
        depositor.grantAgentPermission(agentId1, address(vaultA), 0, expiry);
    }

    function test_grantAgentPermission_reverts_past_expiry() public {
        vm.prank(user);
        vm.expectRevert(AgentVaultDepositor.InvalidExpiry.selector);
        depositor.grantAgentPermission(agentId1, address(vaultA), maxAmount, block.timestamp);
    }

    function test_revokeAgentPermission_sets_inactive() public {
        vm.startPrank(user);
        depositor.grantAgentPermission(agentId1, address(vaultA), maxAmount, expiry);
        depositor.revokeAgentPermission(agentId1);
        vm.stopPrank();

        (,,,, bool active) = depositor.agentPermissions(user, agentId1);
        assertFalse(active);
    }

    // ─── executeAgentDeposit — Success Path ───────────────────────────────────

    function test_executeAgentDeposit_success() public {
        uint256 amount = 50e6;

        vm.prank(user);
        depositor.grantAgentPermission(agentId1, address(vaultA), maxAmount, expiry);

        depositor.executeAgentDeposit(agentId1, user, address(vaultA), amount);

        // shares received in vault
        assertEq(vaultA.balanceOf(user), amount);

        // usedAmount updated
        (, , uint256 used,,) = depositor.agentPermissions(user, agentId1);
        assertEq(used, amount);
    }

    function test_executeAgentDeposit_emits_all_events() public {
        uint256 amount = 50e6;

        vm.prank(user);
        depositor.grantAgentPermission(agentId1, address(vaultA), maxAmount, expiry);

        vm.expectEmit(true, true, false, true);
        emit AgentVaultDepositor.AgentStarted(agentId1, user, address(vaultA));

        vm.expectEmit(true, true, false, true);
        emit AgentVaultDepositor.SwapExecuted(agentId1, user, amount, amount);

        vm.expectEmit(true, true, false, true);
        emit AgentVaultDepositor.ApproveExecuted(agentId1, user, address(vaultA), amount);

        vm.expectEmit(true, true, false, true);
        emit AgentVaultDepositor.DepositExecuted(agentId1, user, address(vaultA), amount, amount);

        vm.expectEmit(true, true, false, true);
        emit AgentVaultDepositor.AgentCompleted(agentId1, user, address(vaultA), amount);

        depositor.executeAgentDeposit(agentId1, user, address(vaultA), amount);
    }

    function test_executeAgentDeposit_accumulates_used_amount() public {
        vm.prank(user);
        depositor.grantAgentPermission(agentId1, address(vaultA), maxAmount, expiry);

        depositor.executeAgentDeposit(agentId1, user, address(vaultA), 30e6);
        depositor.executeAgentDeposit(agentId1, user, address(vaultA), 40e6);

        (, , uint256 used,,) = depositor.agentPermissions(user, agentId1);
        assertEq(used, 70e6);
    }

    // ─── executeAgentDeposit — Parallel Agents ───────────────────────────────

    function test_parallel_agents_independent_vaults() public {
        vm.startPrank(user);
        depositor.grantAgentPermission(agentId1, address(vaultA), maxAmount, expiry);
        depositor.grantAgentPermission(agentId2, address(vaultB), maxAmount, expiry);
        vm.stopPrank();

        depositor.executeAgentDeposit(agentId1, user, address(vaultA), 60e6);
        depositor.executeAgentDeposit(agentId2, user, address(vaultB), 80e6);

        assertEq(vaultA.balanceOf(user), 60e6);
        assertEq(vaultB.balanceOf(user), 80e6);

        (, , uint256 used1,,) = depositor.agentPermissions(user, agentId1);
        (, , uint256 used2,,) = depositor.agentPermissions(user, agentId2);
        assertEq(used1, 60e6);
        assertEq(used2, 80e6);
    }

    function test_parallel_agents_same_vault_allowed() public {
        bytes32 agentId3 = keccak256("agent-3");

        vm.startPrank(user);
        depositor.grantAgentPermission(agentId1, address(vaultA), maxAmount, expiry);
        depositor.grantAgentPermission(agentId3, address(vaultA), maxAmount, expiry);
        vm.stopPrank();

        depositor.executeAgentDeposit(agentId1, user, address(vaultA), 50e6);
        depositor.executeAgentDeposit(agentId3, user, address(vaultA), 50e6);

        assertEq(vaultA.totalAssets(), 100e6);
    }

    // ─── executeAgentDeposit — Fail Paths ────────────────────────────────────

    function test_revert_permission_not_active() public {
        // No grant at all
        vm.expectRevert(AgentVaultDepositor.PermissionNotActive.selector);
        depositor.executeAgentDeposit(agentId1, user, address(vaultA), 50e6);
    }

    function test_revert_after_revoke() public {
        vm.startPrank(user);
        depositor.grantAgentPermission(agentId1, address(vaultA), maxAmount, expiry);
        depositor.revokeAgentPermission(agentId1);
        vm.stopPrank();

        vm.expectRevert(AgentVaultDepositor.PermissionNotActive.selector);
        depositor.executeAgentDeposit(agentId1, user, address(vaultA), 50e6);
    }

    function test_revert_permission_expired() public {
        vm.prank(user);
        depositor.grantAgentPermission(agentId1, address(vaultA), maxAmount, expiry);

        // Warp past expiry
        vm.warp(expiry + 1);

        vm.expectRevert(AgentVaultDepositor.PermissionExpired.selector);
        depositor.executeAgentDeposit(agentId1, user, address(vaultA), 50e6);
    }

    function test_revert_vault_mismatch() public {
        vm.prank(user);
        depositor.grantAgentPermission(agentId1, address(vaultA), maxAmount, expiry);

        // Pass vaultB but permission is for vaultA
        vm.expectRevert(AgentVaultDepositor.VaultMismatch.selector);
        depositor.executeAgentDeposit(agentId1, user, address(vaultB), 50e6);
    }

    function test_revert_amount_exceeds_permission() public {
        vm.prank(user);
        depositor.grantAgentPermission(agentId1, address(vaultA), maxAmount, expiry);

        // maxAmount = 100e6, try depositing 101e6
        vm.expectRevert(AgentVaultDepositor.AmountExceedsPermission.selector);
        depositor.executeAgentDeposit(agentId1, user, address(vaultA), 101e6);
    }

    function test_revert_cumulative_amount_exceeds_permission() public {
        vm.prank(user);
        depositor.grantAgentPermission(agentId1, address(vaultA), maxAmount, expiry);

        depositor.executeAgentDeposit(agentId1, user, address(vaultA), 60e6);

        // 60e6 used, maxAmount = 100e6, trying 50e6 more = 110e6 total → revert
        vm.expectRevert(AgentVaultDepositor.AmountExceedsPermission.selector);
        depositor.executeAgentDeposit(agentId1, user, address(vaultA), 50e6);
    }

    function test_used_amount_not_updated_on_revert() public {
        vm.prank(user);
        depositor.grantAgentPermission(agentId1, address(vaultA), maxAmount, expiry);

        // This will revert
        vm.expectRevert(AgentVaultDepositor.AmountExceedsPermission.selector);
        depositor.executeAgentDeposit(agentId1, user, address(vaultA), 200e6);

        // usedAmount should still be 0
        (, , uint256 used,,) = depositor.agentPermissions(user, agentId1);
        assertEq(used, 0);
    }

    // ─── Fuzz Tests ───────────────────────────────────────────────────────────

    function testFuzz_deposit_within_limit_succeeds(uint256 amount) public {
        // Bound amount: 1 wei to maxAmount
        amount = bound(amount, 1, maxAmount);

        vm.prank(user);
        depositor.grantAgentPermission(agentId1, address(vaultA), maxAmount, expiry);

        depositor.executeAgentDeposit(agentId1, user, address(vaultA), amount);

        assertEq(vaultA.balanceOf(user), amount);
        (, , uint256 used,,) = depositor.agentPermissions(user, agentId1);
        assertEq(used, amount);
    }

    function testFuzz_deposit_over_limit_reverts(uint256 amount) public {
        // Bound amount: maxAmount+1 to maxAmount*10
        amount = bound(amount, maxAmount + 1, maxAmount * 10);

        vm.prank(user);
        depositor.grantAgentPermission(agentId1, address(vaultA), maxAmount, expiry);

        vm.expectRevert(AgentVaultDepositor.AmountExceedsPermission.selector);
        depositor.executeAgentDeposit(agentId1, user, address(vaultA), amount);
    }

    function testFuzz_cumulative_used_amount_never_exceeds_max(
        uint256 amount1,
        uint256 amount2
    ) public {
        amount1 = bound(amount1, 1, maxAmount);
        amount2 = bound(amount2, 1, maxAmount);

        vm.prank(user);
        depositor.grantAgentPermission(agentId1, address(vaultA), maxAmount, expiry);

        depositor.executeAgentDeposit(agentId1, user, address(vaultA), amount1);

        (, , uint256 used,,) = depositor.agentPermissions(user, agentId1);
        assertEq(used, amount1);

        uint256 remaining = maxAmount - used;
        if (amount2 <= remaining) {
            depositor.executeAgentDeposit(agentId1, user, address(vaultA), amount2);
            (, , uint256 usedAfter,,) = depositor.agentPermissions(user, agentId1);
            assertLe(usedAfter, maxAmount);
        } else {
            vm.expectRevert(AgentVaultDepositor.AmountExceedsPermission.selector);
            depositor.executeAgentDeposit(agentId1, user, address(vaultA), amount2);
        }
    }

    function testFuzz_different_agentIds_dont_interfere(bytes32 id1, bytes32 id2) public {
        vm.assume(id1 != id2);

        vm.startPrank(user);
        depositor.grantAgentPermission(id1, address(vaultA), maxAmount, expiry);
        depositor.grantAgentPermission(id2, address(vaultB), maxAmount, expiry);
        vm.stopPrank();

        uint256 amount1 = 40e6;
        uint256 amount2 = 60e6;

        depositor.executeAgentDeposit(id1, user, address(vaultA), amount1);
        depositor.executeAgentDeposit(id2, user, address(vaultB), amount2);

        (, , uint256 used1,,) = depositor.agentPermissions(user, id1);
        (, , uint256 used2,,) = depositor.agentPermissions(user, id2);

        assertEq(used1, amount1);
        assertEq(used2, amount2);
    }
}
