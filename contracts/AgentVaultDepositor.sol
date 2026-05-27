// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IVault {
    function deposit(uint256 assets, address receiver) external returns (uint256);
}

/// @title AgentVaultDepositor
/// @notice Executes per-agent scoped vault deposits.
///         Each agent has its own permission: vault, maxAmount, expiry.
///         CEI pattern + ReentrancyGuard on executeAgentDeposit.
contract AgentVaultDepositor is ReentrancyGuard {
    struct AgentPermission {
        address vault;
        uint256 maxAmount;
        uint256 usedAmount;
        uint256 expiresAt;
        bool active;
    }

    mapping(address => mapping(bytes32 => AgentPermission)) public agentPermissions;

    // Events
    event AgentStarted(bytes32 indexed agentId, address indexed user, address vault);
    event SwapExecuted(bytes32 indexed agentId, address indexed user, uint256 amountIn, uint256 amountOut);
    event ApproveExecuted(bytes32 indexed agentId, address indexed user, address vault, uint256 amount);
    event DepositExecuted(bytes32 indexed agentId, address indexed user, address vault, uint256 amount, uint256 sharesReceived);
    event AgentCompleted(bytes32 indexed agentId, address indexed user, address vault, uint256 sharesReceived);
    event AgentFailed(bytes32 indexed agentId, address indexed user, string reason);

    // Custom errors
    error PermissionNotActive();
    error PermissionExpired();
    error VaultMismatch();
    error AmountExceedsPermission();
    error InvalidVault();
    error InvalidAmount();
    error InvalidExpiry();

    /// @notice Grant permission to an agent to deposit into a specific vault.
    function grantAgentPermission(
        bytes32 agentId,
        address vault,
        uint256 maxAmount,
        uint256 expiresAt
    ) external {
        if (vault == address(0)) revert InvalidVault();
        if (maxAmount == 0) revert InvalidAmount();
        if (expiresAt <= block.timestamp) revert InvalidExpiry();

        agentPermissions[msg.sender][agentId] = AgentPermission({
            vault: vault,
            maxAmount: maxAmount,
            usedAmount: 0,
            expiresAt: expiresAt,
            active: true
        });
    }

    /// @notice Revoke an agent's permission immediately.
    function revokeAgentPermission(bytes32 agentId) external {
        agentPermissions[msg.sender][agentId].active = false;
    }

    /// @notice Execute a full Swap→Approve→Deposit flow for one agent.
    ///         CEI pattern: all checks before state update before external calls.
    ///         nonReentrant prevents reentrancy on vault.deposit() callback.
    function executeAgentDeposit(
        bytes32 agentId,
        address user,
        address vault,
        uint256 amount
    ) external nonReentrant {
        AgentPermission storage perm = agentPermissions[user][agentId];

        // CHECKS — revert immediately on any violation
        if (!perm.active) revert PermissionNotActive();
        if (block.timestamp >= perm.expiresAt) revert PermissionExpired();
        if (perm.vault != vault) revert VaultMismatch();
        if (perm.usedAmount + amount > perm.maxAmount) revert AmountExceedsPermission();

        // EFFECTS — update state before external calls
        perm.usedAmount += amount;

        // INTERACTIONS — emit events + call vault
        emit AgentStarted(agentId, user, vault);

        // Swap step (mocked — no real DEX for hackathon demo)
        emit SwapExecuted(agentId, user, amount, amount); // 1:1 mock swap

        // Approve step (mocked — no real ERC20.approve() needed for MockVault)
        emit ApproveExecuted(agentId, user, vault, amount);

        // Deposit to vault — try/catch so AgentFailed can be emitted on vault failure
        try IVault(vault).deposit(amount, user) returns (uint256 sharesReceived) {
            emit DepositExecuted(agentId, user, vault, amount, sharesReceived);
            emit AgentCompleted(agentId, user, vault, sharesReceived);
        } catch {
            // Undo usedAmount — vault deposit did not happen
            perm.usedAmount -= amount;
            emit AgentFailed(agentId, user, "Vault deposit failed");
        }
    }
}
