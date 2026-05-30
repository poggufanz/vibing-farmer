// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IVault {
    function deposit(uint256 assets, address receiver) external returns (uint256);
    function withdrawAssets(uint256 assets, address receiver, address owner) external returns (uint256);
    function claimRewards(address user) external returns (uint256);
}

/// @title AgentVaultDepositor
/// @notice Executes per-agent scoped vault deposits, withdrawals, and harvests.
///         Each agent has its own permission: vault, maxAmount, expiry, and
///         opt-in withdraw/harvest capabilities (default false).
///         CEI pattern + ReentrancyGuard on every execute* entry point.
contract AgentVaultDepositor is ReentrancyGuard {
    struct AgentPermission {
        address vault;
        uint256 maxAmount;
        uint256 usedAmount;
        uint256 expiresAt;
        bool active;
        bool allowWithdraw; // agent may withdraw on user's behalf
        bool allowHarvest;  // agent may claim/recompound rewards
    }

    mapping(address => mapping(bytes32 => AgentPermission)) public agentPermissions;

    // Events
    event AgentStarted(bytes32 indexed agentId, address indexed user, address vault);
    event SwapExecuted(bytes32 indexed agentId, address indexed user, uint256 amountIn, uint256 amountOut);
    event ApproveExecuted(bytes32 indexed agentId, address indexed user, address vault, uint256 amount);
    event DepositExecuted(bytes32 indexed agentId, address indexed user, address vault, uint256 amount, uint256 sharesReceived);
    event AgentCompleted(bytes32 indexed agentId, address indexed user, address vault, uint256 sharesReceived);
    event AgentFailed(bytes32 indexed agentId, address indexed user, string reason);
    event WithdrawExecuted(address indexed user, address vault, uint256 amount, uint256 shares);
    event HarvestExecuted(address indexed user, address vault, uint256 rewards);
    event HarvestRecompounded(address indexed user, address vault, uint256 rewards);

    // Custom errors
    error PermissionNotActive();
    error PermissionExpired();
    error VaultMismatch();
    error AmountExceedsPermission();
    error InvalidVault();
    error InvalidAmount();
    error InvalidExpiry();
    error WithdrawNotPermitted();
    error HarvestNotPermitted();

    /// @notice Grant permission to an agent to deposit into a specific vault.
    ///         Withdraw/harvest are opt-in via setAgentCapabilities (default false).
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
            active: true,
            allowWithdraw: false,
            allowHarvest: false
        });
    }

    /// @notice Opt an agent into withdraw and/or harvest capabilities.
    ///         Only the permission owner (msg.sender) can set them.
    function setAgentCapabilities(bytes32 agentId, bool allowWithdraw, bool allowHarvest) external {
        AgentPermission storage perm = agentPermissions[msg.sender][agentId];
        if (!perm.active) revert PermissionNotActive();
        perm.allowWithdraw = allowWithdraw;
        perm.allowHarvest = allowHarvest;
    }

    /// @notice Revoke an agent's permission immediately.
    function revokeAgentPermission(bytes32 agentId) external {
        agentPermissions[msg.sender][agentId].active = false;
    }

    /// @notice Execute a full Swap→Approve→Deposit flow for one agent.
    ///         CEI pattern: all checks before state update before external calls.
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
        emit SwapExecuted(agentId, user, amount, amount); // 1:1 mock swap
        emit ApproveExecuted(agentId, user, vault, amount);

        // Deposit to vault — try/catch so AgentFailed can be emitted on vault failure
        try IVault(vault).deposit(amount, user) returns (uint256 sharesReceived) {
            emit DepositExecuted(agentId, user, vault, amount, sharesReceived);
            emit AgentCompleted(agentId, user, vault, sharesReceived);
        } catch {
            perm.usedAmount -= amount; // undo — vault deposit did not happen
            emit AgentFailed(agentId, user, "Vault deposit failed");
        }
    }

    /// @notice Emergency withdraw — agent pulls assets from vault back to user.
    ///         Requires allowWithdraw. CEI + nonReentrant.
    function executeWithdraw(bytes32 agentId, address user, address vault, uint256 amount)
        external
        nonReentrant
    {
        AgentPermission storage perm = agentPermissions[user][agentId];
        if (!perm.active) revert PermissionNotActive();
        if (!perm.allowWithdraw) revert WithdrawNotPermitted();
        if (perm.vault != vault) revert VaultMismatch();

        uint256 shares = IVault(vault).withdrawAssets(amount, user, user);
        emit WithdrawExecuted(user, vault, amount, shares);
    }

    /// @notice Harvest — agent claims rewards and optionally recompounds them
    ///         back into the vault. Requires allowHarvest. CEI + nonReentrant.
    function executeHarvest(bytes32 agentId, address user, address vault, bool recompound)
        external
        nonReentrant
    {
        AgentPermission storage perm = agentPermissions[user][agentId];
        if (!perm.active) revert PermissionNotActive();
        if (!perm.allowHarvest) revert HarvestNotPermitted();
        if (perm.vault != vault) revert VaultMismatch();

        uint256 rewards = IVault(vault).claimRewards(user);

        if (recompound && rewards > 0) {
            IVault(vault).deposit(rewards, user); // pure-accounting recompound
            emit HarvestRecompounded(user, vault, rewards);
        } else {
            emit HarvestExecuted(user, vault, rewards);
        }
    }
}
