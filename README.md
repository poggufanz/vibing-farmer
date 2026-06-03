<p align="center">
  <img src="frontend/public/vibing_farmer.logo.png" alt="Vibing Farmer Logo" width="100%" />
</p>

# Vibing Farmer

> Set once. Vibe forever.

Most yield farming is repetitive work: find a vault, swap the asset, approve the spender, deposit. Repeat for every protocol. Vibing Farmer does all of that in parallel. Venice AI picks the vaults, generates per-agent instructions, you approve them once, and the agents execute — no gas, no clicking.

---

## How it works

1. **Strategy generation** — AI takes your deposit amount, risk level, and vault count, then outputs an allocation plan and a skill file per agent.
2. **User review** — You read and optionally edit the generated skill JSON before any transaction is signed.
3. **Smart account upgrade** — One EIP-7702 signature upgrades your MetaMask Flask EOA into a smart account.
4. **Scoped permission** — An ERC-7715 batch permission request binds each worker agent to a single vault and spend cap.
5. **Parallel execution** — `OrchestratorAgent` runs N `WorkerAgent` instances via `Promise.allSettled`. Each does Swap → Approve → Deposit through the 1Shot EIP-7710 relayer, paying zero gas.
6. **Strategy attestation** — The Venice AI output is hashed (keccak256) and written on-chain via `AgentVaultDepositor.attestStrategy`. Anyone can reproduce that hash from the original JSON.
7. **Background monitoring** — A Web Worker (`backgroundAgent.worker.js`) polls positions, detects APY drops, triggers harvest, and surfaces alerts in the Agent Dashboard.

---

## Architecture

```
User input (amount · risk level · vault count)
                │
                ▼
        Venice AI
          ├── Multi-vault allocation
          └── Skill JSON per agent (swap + deposit constraints)
                │
                ▼
        User reviews skills → approves
                │
                ▼
        OrchestratorAgent  ──── attestStrategy on-chain
          │
    ┌─────┼─────┐
    ▼     ▼     ▼
 Worker Worker Worker   (one per vault, parallel)
   ERC-7715 scoped permission
   1Shot EIP-7710 relay (zero gas)
   AgentVaultDepositor.sol
   MockVault.sol (ERC-4626)
                │
                ▼
        Background Agent (Web Worker)
          Monitor · Harvest · Risk alerts · APY drift
```

---

## Deployed contracts — Ethereum Sepolia

| Contract | Address |
|----------|---------|
| AgentVaultDepositor (core) | `0xf1441BBC2fa6D37Ce7A5f6254a6A443B281d38f4` |
| MockVault A — Aave v3 USDC · 4.8% · low risk | `0x735f3a63D5be965E6B7564a2befeca0E316d09Ad` |
| MockVault B — Morpho Blue USDC · 6.1% · medium | `0x79007794Eb31B6a8439C38B604827012DBc0D771` |
| MockVault C — Pendle PT-USDC · 9.4% · high | `0xAABfc44939E6437446E6FBD4A4e3816C877e371C` |
| MockVault D — Fluid USDC · 5.2% · high | `0xdef19fED6Da53D3757779d27b9A2640547c30b6F` |
| USDC (Circle testnet) | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |

Verify on Etherscan: `https://sepolia.etherscan.io/address/<address>`  
Verify source on Sourcify: `https://sourcify.dev/#/lookup/11155111/<address>`

Test suite: 57 / 57 passing · Coverage: 93.3%

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Smart contracts | Solidity ^0.8.24, OpenZeppelin, Foundry |
| Frontend | React 18, Vite 5, React Router v6, Framer Motion |
| Web3 | MetaMask Smart Accounts Kit v1.6.0, Viem v2, ethers.js v6 |
| AI | Venice AI — OpenAI-compatible, zero-retention TEE |
| AI fallback | DeepSeek via server-side proxy (`/api/ai`) |
| Live yield data | DeFiLlama API — APY, TVL, 7-day history, sparklines |
| Gas abstraction | 1Shot API — EIP-7710 permissionless relayer, no API key |
| Wallet | MetaMask Flask 13.9+ (EIP-7702 + ERC-7715) |
| Network | Ethereum Sepolia (chain ID 11155111) |

---

## Contract security

`AgentVaultDepositor.sol` checks on every agent call and reverts if any fails:

- amount must be within `agentPermissions[user][agentId].maxAmount`
- vault must match `agentPermissions[user][agentId].allowedVault`
- `block.timestamp` must be before `expiresAt`
- Checks-Effects-Interactions order throughout
- `ReentrancyGuard` on `executeAgentDeposit`
- No owner or admin functions post-deploy

---

## Pages

| Route | Description |
|-------|-------------|
| `/` | Scroll-driven landing hero — 300vh sticky player morph via Framer Motion |
| `/strategy` | App — wallet connect, strategy wizard, portfolio |
| `/explorer` | On-chain verification: contracts, TVL, test stats. No wallet needed. |
| `/ecosystem` | Tech-stack reference — MetaMask, Venice AI, 1Shot, DeFiLlama |

---

## Skill system

Venice AI generates a typed skill file per agent before execution:

```json
{
  "agentId": "worker-agent-1",
  "vaultAddress": "0x735f3a63D5be965E6B7564a2befeca0E316d09Ad",
  "skills": {
    "swap": { "maxSlippage": 0.5, "dexPreference": "uniswap-v3", "maxRetries": 2, "timeoutSeconds": 30 },
    "deposit": { "maxAmount": "100000000", "vaultAddress": "0x735f...", "expiresAt": 1749686400 }
  },
  "generatedBy": "venice-ai",
  "approvedByUser": true
}
```

Every field is editable in the Skills Drawer before approval. Files persist at `agents/session-{id}/agent-{n}-skills.json`.

---

## Prerequisites

- [MetaMask Flask 13.9+](https://metamask.io/flask/) — not regular MetaMask. Required for EIP-7702 + ERC-7715.
- Sepolia ETH for transactions the user signs directly (permission grants, strategy attestation)
- Sepolia USDC from the [Circle testnet faucet](https://faucet.circle.com)

---

## Quick start

```bash
cp .env.example .env
# fill in SEPOLIA_RPC and VENICE_API_KEY

cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` and connect MetaMask Flask.

---

## Environment variables

```env
SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
PRIVATE_KEY=0x...                                           # deployer — never commit
VENICE_API_KEY=...
AGENT_VAULT_DEPOSITOR_ADDRESS=0xf1441BBC2fa6D37Ce7A5f6254a6A443B281d38f4
MOCK_VAULT_ADDRESS=0x735f3a63D5be965E6B7564a2befeca0E316d09Ad
```

---

## Smart contract commands (WSL only)

Foundry runs in WSL. Never run `forge`/`cast`/`anvil` in PowerShell.

```bash
# Build
wsl -e bash -c "cd /mnt/c/SharredData/project/competition/yield-vibing && forge build"

# Test
wsl -e bash -c "cd /mnt/c/SharredData/project/competition/yield-vibing && forge test"

# Coverage
wsl -e bash -c "cd /mnt/c/SharredData/project/competition/yield-vibing && forge coverage"

# Deploy to Sepolia
wsl -e bash -c "cd /mnt/c/SharredData/project/competition/yield-vibing && forge script script/Deploy.s.sol --rpc-url \$SEPOLIA_RPC --broadcast --verify"
```

---

## Directory structure

```
contracts/
  AgentVaultDepositor.sol       # Core — permission checks, execution, strategy attestation
  MockVault.sol                 # ERC-4626 mock vault

test/
  AgentVaultDepositor.t.sol     # 57 tests — happy paths, violations, fuzz
  MockVault.t.sol               # ERC-4626 compliance

script/
  Deploy.s.sol                  # Deploys AgentVaultDepositor + 4 MockVaults

frontend/src/
  components/
    LandingHero.jsx             # Scroll-driven hero, Framer Motion
    NavBar.jsx                  # Shared nav (Landing, Explorer, Ecosystem)
    HomePage.jsx                # Portfolio, Market Pulse, alerts
    AgentDashboard.jsx          # Live agent status, harvest, alerts
    ExplorerPage.jsx            # On-chain verification, no wallet required
    EcosystemPage.jsx           # Tech-stack reference
    OnboardingFlow.jsx          # Strategy wizard
    SkillDrawer.jsx             # Skill viewer + editor
    WithdrawModal.jsx           # Withdraw + harvest
    VaultDetailPage.jsx         # Per-vault view
  orchestrator.js               # OrchestratorAgent — dispatches workers, attests strategy
  worker.js                     # WorkerAgent — single-vault flow
  agents/
    agentController.js          # Agent lifecycle
    backgroundAgent.worker.js   # Web Worker — monitor, harvest, risk alerts
  venice.js                     # Strategy + skill generation
  relay.js                      # 1Shot EIP-7710 relay
  wallet.js                     # EIP-7702 + ERC-7715 + MetaMask SAK
  attestation.js                # Strategy hash + on-chain attestation
  defiLlama.js                  # Live yield data
  apyHistory.js                 # APY history + sparklines
  positionsStore.js             # On-chain position reads
  history.js                    # Transaction + strategy history
  settingsStore.js              # User settings
  config.js                     # Addresses, ABIs, vault catalog

agents/                         # Runtime-generated, gitignored
  session-{id}/
    agent-{n}-skills.json
  memory/
    agent-{n}-memory.json

docs/                           # All in English
```

---

## Documentation

| Document | Focus |
|----------|-------|
| [technical-architecture.md](docs/technical-architecture.md) | System design, ADRs, NFRs, failure modes |
| [technical-blockchain-usage.md](docs/technical-blockchain-usage.md) | On-chain scope, audit trail, delegation boundaries |
| [technical-security-privacy.md](docs/technical-security-privacy.md) | Threat model, security controls |
| [technical-api-events.md](docs/technical-api-events.md) | Event schemas, payloads, error handling |
| [technical-database.md](docs/technical-database.md) | Agent memory, local storage, retention |
| [product-demo-scenario.md](docs/product-demo-scenario.md) | Demo walkthrough and script |
| [product-features-complete.md](docs/product-features-complete.md) | Functional requirements, MoSCoW priority |
| [product-user-stories.md](docs/product-user-stories.md) | Personas, journeys, acceptance criteria |
| [business-impact-model.md](docs/business-impact-model.md) | Market problem, value model, KPIs |
| [business-roadmap-backlog.md](docs/business-roadmap-backlog.md) | Roadmap, milestones, risk |

---

## Resources

- [MetaMask Smart Accounts Kit](https://docs.metamask.io/wallet/smart-accounts/)
- [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702)
- [ERC-7715](https://eips.ethereum.org/EIPS/eip-7715)
- [1Shot API](https://1shotapi.com/docs)
- [Venice AI](https://venice.ai)
- [DeFiLlama API](https://defillama.com/docs/api)
