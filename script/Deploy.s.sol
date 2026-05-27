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

        MockVault vaultA = new MockVault("MockVault USDC-A", address(0));
        MockVault vaultB = new MockVault("MockVault USDC-B", address(0));
        AgentVaultDepositor depositor = new AgentVaultDepositor();

        vm.stopBroadcast();

        console.log("=== Vibing Farmer Deployment ===");
        console.log("VaultA (MockVault USDC-A):", address(vaultA));
        console.log("VaultB (MockVault USDC-B):", address(vaultB));
        console.log("AgentVaultDepositor:      ", address(depositor));
        console.log("================================");
        console.log("Copy these into .env:");
        console.log("AGENT_VAULT_DEPOSITOR_ADDRESS=", address(depositor));
        console.log("MOCK_VAULT_A_ADDRESS=", address(vaultA));
        console.log("MOCK_VAULT_B_ADDRESS=", address(vaultB));
    }
}
