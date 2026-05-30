# Blockchain — Vibing Farmer

> **Skill Reference:** blockchain-developer + web3-expert
> **Version:** 2.0 | **Date:** May 27, 2026
> **Purpose:** Technical documentation of blockchain integration: on-chain vs. off-chain components, smart contract scopes, audit trails, and risk analysis

---

## 1. Role of the Blockchain

The blockchain serves as the **execution layer** and the **per-agent permission enforcer** — not as a data store. All permission validations and deposit executions occur on-chain, ensuring they are tamper-proof and fully verifiable per agent.

**Network:** Sepolia testnet (Ethereum)  
**EIPs Utilized:**
- **EIP-7702:** Set code for EOA — persistently upgrades an EOA to a smart account (Pectra, Mar 5, 2025)
- **ERC-7715:** Scoped permission request via `wallet_requestExecutionPermissions` (per agent)
- **ERC-7710:** Smart contract delegation — interface to relay permissioned transactions via 1Shot

---

## 2. On-Chain vs. Off-Chain Components

### On-Chain

| Component | Contract | Description |
|-----------|----------|-------------|
| Per-agent permission validation | `AgentVaultDepositor.sol` | Checks scope per agentId prior to execution |
| Swap execution | `AgentVaultDepositor.sol` | Interface to DEX (mocked for testnet) |
| Vault deposit | `AgentVaultDepositor.sol` | Deposits into the ERC-4626 vault designated for the agent |
| Mock vaults A + B | `MockVault.sol` × 2 | Simulates two ERC-4626 vault instances |
| EOA upgrade | EIP-7702 (via MetaMask Flask) | Sets code for smart account behavior |

### Off-Chain

| Component | Technology | Description |
|-----------|------------|-------------|
| AI coordinator | Venice AI API | Strategy generation + skill auto-generation per agent |
| Gas relay | 1Shot Permissionless Relayer | Submits transactions on-chain without the user paying gas |
| Orchestrator Agent | JavaScript (frontend) | Receives the plan, dispatches Worker Agents in parallel |
| Worker Agents | JavaScript (frontend) | Single-vault Swap → Approve → Deposit sequence per agent |
| Skill files | JSON (local) | Per-agent skill configuration, user-approved |
| Memory files | JSON (local) | Per-agent execution logs, append-only |
| UI + graph | HTML/JS + vis.js | Frontend triggering all flows + real-time visualization |
| Permission UI | MetaMask Flask | User approves/revokes ERC-7715 permissions per agent |

---

## 3. Smart Contract Scope

### `AgentVaultDepositor.sol`

**State:**

```solidity
struct AgentPermission {
    address allowedVault;   // specific vault per agent
    uint256 maxAmount;      // USDC limit amount
    uint256 usedAmount;     // amount already executed
    uint256 expiresAt;      // expiry timestamp
    bool isActive;          // permission status
}

// Per-user, per-agent permission (nested mapping)
mapping(address user => mapping(bytes32 agentId => AgentPermission)) public agentPermissions;
```

**Core Functions:**

```solidity
// Grants permission for a single agent (called by user before execution)
function grantAgentPermission(
    bytes32 agentId,
    address vault,
    uint256 maxAmount,
    uint256 expiresAt
) external;

// Executes deposit for a single agent (CEI pattern, called via 1Shot relay)
function executeAgentDeposit(
    bytes32 agentId,
    address user,
    address vault,
    uint256 amount
) external nonReentrant;

// Revokes permission for a single agent
function revokeAgentPermission(bytes32 agentId) external;

// View: checks if permission is valid
function validateAgentPermission(
    bytes32 agentId,
    address user,
    address vault,
    uint256 amount
) external view returns (bool);
```

**Events (all of which are tracked by the frontend and vis.js graph):**

```solidity
event AgentStarted(bytes32 indexed agentId, address indexed user, address vault);
event SwapExecuted(bytes32 indexed agentId, address indexed user, uint256 amountIn, uint256 amountOut);
event ApproveExecuted(bytes32 indexed agentId, address indexed user, address vault, uint256 amount);
event DepositExecuted(bytes32 indexed agentId, address indexed user, address vault, uint256 amount, uint256 shares);
event AgentCompleted(bytes32 indexed agentId, address indexed user, address vault, uint256 shares);
event AgentFailed(bytes32 indexed agentId, address indexed user, string reason);
```

**Security constraints:**
- CEI pattern (Checks → Effects → Interactions) in `executeAgentDeposit`
- `require(amount <= agentPermissions[user][agentId].maxAmount - usedAmount)` — reverts if limit exceeded
- `require(vault == agentPermissions[user][agentId].allowedVault)` — reverts if vault differs
- `require(block.timestamp < agentPermissions[user][agentId].expiresAt)` — reverts if expired
- `require(agentPermissions[user][agentId].isActive)` — reverts if permission is inactive
- `nonReentrant` modifier (OpenZeppelin ReentrancyGuard)
- No admin keys or privileged roles

---

### `MockVault.sol`

**Interface:** ERC-4626 (Tokenized Vault Standard)

**Implemented Functions:**
- `deposit(uint256 assets, address receiver) returns (uint256 shares)`
- `balanceOf(address account) returns (uint256)`
- `totalAssets() returns (uint256)`
- `asset() returns (address)` — mock USDC address

**Deployment:** 2 instances for demo purposes (MockVault USDC-A and MockVault USDC-B)  
APY and vault metadata are stored off-chain (mocked in the frontend), not on-chain.

---

## 4. AgentId Generation

The `agentId` is a `bytes32` value used as the key in the `agentPermissions` mapping.

```javascript
// Frontend — generate agentId
const agentId = ethers.keccak256(ethers.toUtf8Bytes("worker-agent-1"));
// Result: 0x<32 bytes hash>
```

The agentId is deterministic from the session: same agentId string = same bytes32 = permissions can be reused if they haven't expired.

---

## 5. Audit Trail & Verification

Each execution step leaves on-chain evidence that can be audited and verified using Sepolia Etherscan:

| Step | On-Chain Evidence |
|------|-------------------|
| EOA upgrade | EIP-7702 authorization in transaction payload |
| Permission grant per agent | `agentPermissions` mapping updated (readable via `contract.agentPermissions(user, agentId)`) |
| Agent started | `AgentStarted` event emitted with `agentId` |
| Swap execution | `SwapExecuted` event emitted |
| Approve | `ApproveExecuted` event emitted |
| Vault deposit | `DepositExecuted` event + MockVault balance change |
| Gas relayed by 1Shot | `from` address is the 1Shot relayer (not the user's wallet) |
| Agent completed | `AgentCompleted` event emitted with shares minted |

**How to verify in the demo:**
1. Open Sepolia Etherscan using the transaction hash generated by the agent.
2. Show that the `from` address is the 1Shot relayer address (NOT the user's wallet).
3. Show the events order: `AgentStarted` → `SwapExecuted` → `ApproveExecuted` → `DepositExecuted` → `AgentCompleted`.
4. Show that the MockVault balance increases for both vaults (across 2 separate transaction hashes).
5. Show different `agentId` values for each Worker Agent, confirming parallel execution.

---

## 6. Risks & Mitigations

| Risk | Probability | Mitigation |
|------|-------------|------------|
| agentId collision between agents | Low | Generate using `keccak256(agentId_string)` — deterministic, collision-resistant |
| ERC-7715 in MetaMask Flask is not yet stable | Medium | Use the recommended Flask version. Test early (Day 3). |
| Reentrancy in AgentVaultDepositor | Low | CEI pattern + ReentrancyGuard from OpenZeppelin |
| Permission bypass via crafted calldata | Low | Rigorous validation: vault == allowedVault, amount <= maxAmount - usedAmount |
| 1Shot relay incompatible with EIP-7710 | Medium | Test the relay workflow on Day 9 before starting frontend integration |
| Multiple Workers race condition on-chain | Low | Per-agent permission mapping — no shared state between agents |
| MockVault A and B addresses swapped | Low | Hardcode the correct address per agentId in the skill file post-deployment |

---

## 7. Why the Blockchain is Core to the Solution

EIP-7702 + ERC-7715 + per-agent permissions are cryptographic primitives that solve real problems:

- **EIP-7702:** Enables the EOA to act as a smart contract without migrating wallets. The user continues to use their familiar MetaMask wallet.
- **ERC-7715:** Scoped, user-controlled, fine-grained permissions per agent. Agent 1 cannot access Agent 2's vault. Far safer than full wallet access.
- **Per-agent agentPermissions:** Every Worker Agent is strictly limited to its own vault, maximum deposit amount, and expiry time. These boundaries are cryptographically enforced on-chain, not just on the frontend.
- **ERC-7710 (via 1Shot):** Permissioned gas abstraction. Relayers cannot act outside the permitted scope.

Combining all three with parallel agent dispatch offers a genuine technical solution to DeFi UX and agent trust issues, validated by real-world market observations.
