// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../contracts/AgentRegistry.sol";
import {AgentVaultDepositor} from "../contracts/AgentVaultDepositor.sol";
import {MockVault} from "../contracts/MockVault.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract AgentVaultDepositorTest is Test {
    AgentRegistry reg;
    AgentVaultDepositor dep;
    MockERC20 token;
    MockVault vault;
    address owner = address(0xA11CE);
    uint256 workerPk = 0xA9E47; // worker has a private key — it SIGNS, never custodies
    address worker;             // = vm.addr(workerPk)
    address guardian = address(this);
    address relayer = address(0x5E1F); // arbitrary submitter (stands in for 1Shot)

    function setUp() public {
        worker = vm.addr(workerPk);
        reg = new AgentRegistry();
        dep = new AgentVaultDepositor(address(reg), guardian);
        reg.setDepositor(address(dep));
        token = new MockERC20("USD Coin", "USDC", 6);
        vault = new MockVault("Vault USDC", address(token), 500);

        token.mint(owner, 1_000e6);
        // NOTE: tests use max approval for brevity. The FRONTEND/demo must approve a
        // BOUNDED total cap (Phase 5) — do not copy type(uint256).max into production.
        vm.prank(owner);
        token.approve(address(dep), type(uint256).max);
        vm.prank(owner);
        reg.authorizeSessionKey(worker, address(vault), address(token), 100e6, 1 days, uint40(block.timestamp + 7 days));
    }

    function _execId(uint256 i) internal view returns (bytes32) {
        return keccak256(abi.encode(owner, address(vault), uint256(1), i));
    }

    /// Sign an AgentDeposit with `pk` over the depositor's EIP-712 digest.
    function _sign(uint256 pk, uint256 amount, uint256 minAmount, bytes32 execId) internal view returns (bytes memory) {
        bytes32 digest = dep.hashDeposit(amount, minAmount, execId);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_deposit_movesRealTokens_sharesToOwner() public {
        bytes memory sig = _sign(workerPk, 50e6, 50e6, _execId(0));
        vm.prank(relayer); // ANY submitter works — auth is the signature, not msg.sender
        uint256 shares = dep.executeAgentDeposit(50e6, 50e6, _execId(0), sig);
        assertGt(shares, 0);
        assertEq(vault.balanceOf(owner), shares);     // shares to OWNER, not worker
        assertEq(token.balanceOf(worker), 0);          // worker never custodies
        assertEq(token.balanceOf(relayer), 0);         // relayer never custodies
        assertEq(token.balanceOf(address(dep)), 0);    // no residue
        AgentRegistry.AgentScope memory s = reg.scopeOf(worker);
        assertEq(s.spentInPeriod, 50e6);
    }

    function test_replay_sameExecId_reverts() public {
        dep.executeAgentDeposit(50e6, 50e6, _execId(0), _sign(workerPk, 50e6, 50e6, _execId(0)));
        // even a freshly re-signed message with the same execId is dead (replay guard)
        // sign BEFORE expectRevert: _sign() calls dep.hashDeposit() (a staticcall), which
        // would otherwise be consumed as "the next call" by the cheatcode.
        bytes memory sig = _sign(workerPk, 10e6, 10e6, _execId(0));
        vm.expectRevert(abi.encodeWithSelector(AgentVaultDepositor.AlreadyExecuted.selector, _execId(0)));
        dep.executeAgentDeposit(10e6, 10e6, _execId(0), sig);
    }

    function test_capExceeded_reverts() public {
        dep.executeAgentDeposit(80e6, 80e6, _execId(0), _sign(workerPk, 80e6, 80e6, _execId(0)));
        bytes memory sig = _sign(workerPk, 80e6, 80e6, _execId(1));
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.CapExceeded.selector, 80e6, 20e6));
        dep.executeAgentDeposit(80e6, 80e6, _execId(1), sig);
    }

    function test_revokedAgent_cannotDeposit() public {
        bytes memory sig = _sign(workerPk, 10e6, 10e6, _execId(0));
        vm.prank(owner);
        reg.revokeAgent(worker);
        vm.expectRevert(AgentVaultDepositor.ScopeInactive.selector);
        dep.executeAgentDeposit(10e6, 10e6, _execId(0), sig);
    }

    function test_expiredScope_cannotDeposit() public {
        bytes memory sig = _sign(workerPk, 10e6, 10e6, _execId(0));
        skip(8 days);
        vm.expectRevert(AgentVaultDepositor.ScopeInactive.selector);
        dep.executeAgentDeposit(10e6, 10e6, _execId(0), sig);
    }

    function test_unscopedSigner_cannotDeposit() public {
        // a key with no registry scope: recovered signer has empty scope → ScopeInactive
        uint256 strangerPk = 0xBADBAD;
        bytes memory sig = _sign(strangerPk, 10e6, 10e6, _execId(0));
        vm.expectRevert(AgentVaultDepositor.ScopeInactive.selector);
        dep.executeAgentDeposit(10e6, 10e6, _execId(0), sig);
    }

    function test_tamperedAmount_breaksSignature() public {
        // sign for 10e6 but submit 90e6 → recovered signer differs from worker → wrong/empty scope
        bytes memory sig = _sign(workerPk, 10e6, 10e6, _execId(0));
        vm.expectRevert(); // recovered address has no matching scope (ScopeInactive) or cap mismatch
        dep.executeAgentDeposit(90e6, 90e6, _execId(0), sig);
    }

    function test_paused_blocksDeposit() public {
        bytes memory sig = _sign(workerPk, 10e6, 10e6, _execId(0));
        dep.pause(); // test contract is guardian
        vm.expectRevert(); // Pausable: EnforcedPause (before signature recovery)
        dep.executeAgentDeposit(10e6, 10e6, _execId(0), sig);
    }

    function test_workerBalanceAlwaysZero() public {
        dep.executeAgentDeposit(50e6, 50e6, _execId(0), _sign(workerPk, 50e6, 50e6, _execId(0)));
        assertEq(token.balanceOf(worker), 0);
    }
}
