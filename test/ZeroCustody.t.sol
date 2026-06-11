// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../contracts/AgentRegistry.sol";
import {AgentVaultDepositor} from "../contracts/AgentVaultDepositor.sol";
import {MockVault} from "../contracts/MockVault.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract ZeroCustodyTest is Test {
    AgentRegistry reg; AgentVaultDepositor dep; MockERC20 token; MockVault vault;
    address owner = address(0xA11CE);
    uint256 workerPk = 0xBEEF; address worker;

    function setUp() public {
        worker = vm.addr(workerPk);
        reg = new AgentRegistry();
        dep = new AgentVaultDepositor(address(reg), address(this));
        reg.setDepositor(address(dep));
        token = new MockERC20("USD Coin", "USDC", 6);
        vault = new MockVault("Vault USDC", address(token), 500);
        token.mint(owner, 1_000e6);
        vm.prank(owner); token.approve(address(dep), type(uint256).max);
        vm.prank(owner);
        reg.authorizeSessionKey(worker, address(vault), address(token), 100e6, 1 days, uint40(block.timestamp + 7 days));
    }

    function _sign(uint256 pk, uint256 amount, uint256 minAmount, bytes32 execId) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, dep.hashDeposit(amount, minAmount, execId));
        return abi.encodePacked(r, s, v);
    }

    function test_workerAndDepositorHoldNothingAfterFlow() public {
        dep.executeAgentDeposit(50e6, 50e6, keccak256("a"), _sign(workerPk, 50e6, 50e6, keccak256("a")));
        assertEq(token.balanceOf(worker), 0);
        assertEq(token.balanceOf(address(dep)), 0);
        assertEq(dep.reserves(address(token)), 0);
        assertEq(vault.balanceOf(worker), 0);
        assertGt(vault.balanceOf(owner), 0);
    }
}
