// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {MockVault} from "../contracts/MockVault.sol";
import {AgentVaultDepositor} from "../contracts/AgentVaultDepositor.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        // apyBps: conservative vault A = 480 (4.8%), balanced vault B = 610 (6.1%)
        MockVault vaultA = new MockVault("MockVault USDC-A", address(0), 480);
        MockVault vaultB = new MockVault("MockVault USDC-B", address(0), 610);
        // apyBps: C = 940 (9.4%, Pendle-like structured), D = 520 (5.2%, Fluid-like hybrid)
        MockVault vaultC = new MockVault("MockVault USDC-C", address(0), 940);
        MockVault vaultD = new MockVault("MockVault USDC-D", address(0), 520);
        AgentVaultDepositor depositor = new AgentVaultDepositor();

        vm.stopBroadcast();

        console.log("=== Vibing Farmer Deployment ===");
        console.log("VaultA (MockVault USDC-A):", address(vaultA));
        console.log("VaultB (MockVault USDC-B):", address(vaultB));
        console.log("VaultC (MockVault USDC-C):", address(vaultC));
        console.log("VaultD (MockVault USDC-D):", address(vaultD));
        console.log("AgentVaultDepositor:      ", address(depositor));
        console.log("================================");
        console.log("Copy these into .env:");
        console.log("AGENT_VAULT_DEPOSITOR_ADDRESS=", address(depositor));
        console.log("MOCK_VAULT_A_ADDRESS=", address(vaultA));
        console.log("MOCK_VAULT_B_ADDRESS=", address(vaultB));
        console.log("MOCK_VAULT_C_ADDRESS=", address(vaultC));
        console.log("MOCK_VAULT_D_ADDRESS=", address(vaultD));
    }
}
