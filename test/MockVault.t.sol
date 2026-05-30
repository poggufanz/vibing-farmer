// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockVault} from "../contracts/MockVault.sol";

contract MockVaultTest is Test {
    MockVault vaultA;
    MockVault vaultB;
    address user = address(0xBEEF);

    function setUp() public {
        vaultA = new MockVault("MockVault USDC-A", address(0x1111), 480); // 4.8% APY
        vaultB = new MockVault("MockVault USDC-B", address(0x2222), 610); // 6.1% APY
    }

    function test_name_set_correctly() public view {
        assertEq(vaultA.name(), "MockVault USDC-A");
        assertEq(vaultB.name(), "MockVault USDC-B");
    }

    function test_asset_set_correctly() public view {
        assertEq(vaultA.asset(), address(0x1111));
        assertEq(vaultB.asset(), address(0x2222));
    }

    function test_deposit_returns_shares_one_to_one() public {
        uint256 amount = 100e6; // 100 USDC (6 decimals)
        uint256 sharesReceived = vaultA.deposit(amount, user);

        assertEq(sharesReceived, amount);
    }

    function test_deposit_updates_balance() public {
        uint256 amount = 100e6;
        vaultA.deposit(amount, user);

        assertEq(vaultA.balanceOf(user), amount);
    }

    function test_deposit_updates_total_assets() public {
        uint256 amount = 100e6;
        vaultA.deposit(amount, user);

        assertEq(vaultA.totalAssets(), amount);
    }

    function test_multiple_deposits_accumulate() public {
        vaultA.deposit(100e6, user);
        vaultA.deposit(50e6, user);

        assertEq(vaultA.balanceOf(user), 150e6);
        assertEq(vaultA.totalAssets(), 150e6);
    }

    function test_deposit_to_different_receivers() public {
        address user2 = address(0xDEAD);
        vaultA.deposit(100e6, user);
        vaultA.deposit(200e6, user2);

        assertEq(vaultA.balanceOf(user), 100e6);
        assertEq(vaultA.balanceOf(user2), 200e6);
        assertEq(vaultA.totalAssets(), 300e6);
    }

    function test_deposit_emits_event() public {
        uint256 amount = 50e6;
        vm.expectEmit(true, true, false, true);
        emit MockVault.Deposit(address(this), user, amount, amount);
        vaultA.deposit(amount, user);
    }

    function test_deposit_reverts_on_zero_assets() public {
        vm.expectRevert("Zero assets");
        vaultA.deposit(0, user);
    }

    function test_vaults_are_independent() public {
        vaultA.deposit(100e6, user);
        vaultB.deposit(200e6, user);

        assertEq(vaultA.balanceOf(user), 100e6);
        assertEq(vaultB.balanceOf(user), 200e6);
        assertEq(vaultA.totalAssets(), 100e6);
        assertEq(vaultB.totalAssets(), 200e6);
    }

    // ─── Yield Simulation ─────────────────────────────────────────────────────

    function test_apy_set_correctly() public view {
        assertEq(vaultA.apyBps(), 480);
        assertEq(vaultB.apyBps(), 610);
    }

    function test_convertToAssets_one_to_one() public view {
        assertEq(vaultA.convertToAssets(123e6), 123e6);
    }

    function test_getUnclaimedRewards_zero_before_deposit() public view {
        assertEq(vaultA.getUnclaimedRewards(user), 0);
    }

    function test_getUnclaimedRewards_zero_at_deposit_time() public {
        vaultA.deposit(1000e6, user);
        assertEq(vaultA.getUnclaimedRewards(user), 0); // no time elapsed
    }

    function test_getUnclaimedRewards_accrues_full_year() public {
        vaultA.deposit(1000e6, user); // 1000 USDC @ 4.8%
        vm.warp(block.timestamp + 365 days);
        // 1000e6 * 480 / 10000 = 48e6
        assertEq(vaultA.getUnclaimedRewards(user), 48e6);
    }

    function test_getUnclaimedRewards_accrues_partial() public {
        vaultA.deposit(1000e6, user);
        vm.warp(block.timestamp + 73 days); // 1/5 year
        assertEq(vaultA.getUnclaimedRewards(user), 9_600_000); // 48e6 / 5
    }

    function test_claimRewards_returns_and_resets_accrual() public {
        vaultA.deposit(1000e6, user);
        vm.warp(block.timestamp + 365 days);

        uint256 rewards = vaultA.claimRewards(user);
        assertEq(rewards, 48e6);
        assertEq(vaultA.getUnclaimedRewards(user), 0); // accrual reset
    }

    function test_claimRewards_emits_event() public {
        vaultA.deposit(1000e6, user);
        vm.warp(block.timestamp + 365 days);

        vm.expectEmit(true, false, false, true);
        emit MockVault.RewardsClaimed(user, 48e6);
        vaultA.claimRewards(user);
    }

    function test_claimRewards_reverts_when_no_rewards() public {
        vm.expectRevert("No rewards");
        vaultA.claimRewards(user);
    }

    // ─── Withdrawal ───────────────────────────────────────────────────────────

    function test_withdrawAssets_reduces_shares() public {
        vaultA.deposit(100e6, user);
        uint256 shares = vaultA.withdrawAssets(40e6, user, user);

        assertEq(shares, 40e6);
        assertEq(vaultA.balanceOf(user), 60e6);
        assertEq(vaultA.totalAssets(), 60e6);
    }

    function test_withdrawAssets_full_balance() public {
        vaultA.deposit(100e6, user);
        vaultA.withdrawAssets(100e6, user, user);
        assertEq(vaultA.balanceOf(user), 0);
    }

    function test_withdrawAssets_reverts_insufficient() public {
        vaultA.deposit(10e6, user);
        vm.expectRevert("Insufficient shares");
        vaultA.withdrawAssets(20e6, user, user);
    }

    function test_withdrawAssets_preserves_accrued_yield() public {
        vaultA.deposit(1000e6, user);
        vm.warp(block.timestamp + 365 days); // 48e6 accrued
        vaultA.withdrawAssets(1000e6, user, user); // burn all shares
        // accrued yield folded into unclaimedRewards, not lost
        assertEq(vaultA.getUnclaimedRewards(user), 48e6);
    }

    function test_withdrawAssets_emits_event() public {
        vaultA.deposit(100e6, user);
        vm.expectEmit(true, true, true, true);
        emit MockVault.Withdraw(address(this), user, user, 40e6, 40e6);
        vaultA.withdrawAssets(40e6, user, user);
    }
}
