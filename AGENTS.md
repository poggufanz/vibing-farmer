# AGENTS.md

This file provides guidance to OpenCode when working with code in this repository.

## Project: YIELD VIBING

Hackathon: MetaMask Smart Accounts Kit x 1Shot API x Venice AI Dev Cook Off  
Deadline: 15 Juni 2026 | Prize: $11,000 | Solo

**Core product:** Automated vault deposit flow for yield farmers. User sets scoped permissions once (ERC-7715), agent executes swap → approve → deposit without repeated MetaMask popups.

> **Note:** All docs in `docs/` are written in Indonesian (Bahasa Indonesia).

---

## Current Phase

Timeline: 20 days total (26 Mei – 15 Juni 2026)

| Phase | Days | Focus |
|-------|------|-------|
| 1 — Foundation | 1–3 | Solidity review + EIP-7702/ERC-7715 study |
| 2 — Smart Contract | 4–8 | VaultDepositor.sol + tests |
| 3 — Integration | 9–13 | 1Shot + frontend + end-to-end Sepolia test |
| 4 — Polish | 14–17 | Bug fix, Venice AI, demo video |
| 5 — Buffer | 18–20 | Submission |

**All 4 spikes resolved. ✅ See `docs/spikes/` for full findings. Key decisions below.**

---

## Directory Structure

```
design/                              # UI prototype — WRITTEN, use as implementation reference
  YIELD VIBING Prototype.html        # v2 current — React 18 + Babel CDN, entrypoint
  YIELD VIBING Prototype v1.html     # v1 snapshot (AI-slop baseline, do not copy)
  styles.css                         # v2 design tokens + all components
  styles-v1.css                      # v1 snapshot only
  src/
    app.jsx                          # State machine, right rail, palette picker
    components.jsx                   # Icon, Sidebar, TopBar, StepRail
    screens.jsx                      # 6 screen components + RECOMMENDATION data
    tweaks-panel.jsx                 # Host protocol + Tweak form controls
    *-v1.jsx                         # v1 snapshots only

contracts/                           # PLANNED — not written yet
  VaultDepositor.sol
  MockVault.sol
test/
  VaultDepositor.t.sol
script/
  Deploy.s.sol
frontend/                            # PLANNED — implement from design/ prototype
  index.html
  app.js                             # ethers.js v6 wallet + contract logic
  venice.js
  relay.js
  style.css
docs/                                # All in Indonesian
  teknis-arsitektur.md
  teknis-blockchain-penggunaan.md
  teknis-keamanan-privasi.md
  teknis-api-events.md
  teknis-database.md
  produk-demo-skenario.md            # Demo script — read before recording
  produk-fitur-lengkap.md
  produk-user-stories.md
  bisnis-dampak-model.md
  bisnis-roadmap-backlog.md
  spikes/                            # All 4 spikes 🔴 Not Started — resolve before Phase 2
```

---

## Commands

### Smart Contracts (Foundry)

```bash
# Install Foundry (first time)
curl -L https://foundry.paradigm.xyz | bash && foundryup

# Build
forge build

# Test all
forge test

# Single test with verbose output
forge test --match-test testFunctionName -vvv

# Fuzz test
forge test --match-test testFuzz -vvv --fuzz-runs 1000

# Coverage (target ≥ 80%)
forge coverage

# Deploy to Sepolia
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC --broadcast --verify
```

### Design Prototype (current)

```bash
# Serve the v2 prototype (open in browser)
npx serve design/
# Then open: http://localhost:3000/YIELD%20VIBING%20Prototype.html
```

The prototype uses React 18.3.1 + Babel 7 via CDN. Each `.jsx` file runs as a `<script type="text/babel">` tag and exports globals via `Object.assign(window, { ... })` — no bundler, no imports.

### Frontend (planned — not written yet)

```bash
# Serve locally once frontend/ exists
npx serve frontend/
```

### Environment Variables

Copy `.env.example` → `.env` before any deployment or API testing:

```bash
SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
PRIVATE_KEY=0x...           # deployer key (never commit)
ONESHOT_API_KEY=...         # 1Shot API key
VENICE_API_KEY=...          # Venice AI API key
VAULT_DEPOSITOR_ADDRESS=0x...  # filled after deploy
MOCK_VAULT_ADDRESS=0x...       # filled after deploy
```

---

## Architecture

```
User Wallet (EOA)
    │ EIP-7702: upgrade to smart account
    ▼
MetaMask Smart Accounts Kit
    │ ERC-7715: wallet_requestExecutionPermissions (vault, maxAmount, expiry)
    ▼
Frontend (orchestrator)
    │ builds calldata + permission context
    ▼
1Shot API Permissionless Relayer (EIP-7710)
    │ user pays 0 gas
    ▼
VaultDepositor.sol
    ├── validatePermission(user, vault, amount, permContext) — CHECKS
    ├── executeSwap(amount)                                  — INTERACTIONS
    ├── approve(vault, amount)
    └── deposit(amount) → MockVault.sol (ERC-4626)          — INTERACTIONS

Venice AI (pre-flow, off-chain)
    └── OpenAI-compatible REST API → vault recommendation JSON
```

### Key Contracts

- **`VaultDepositor.sol`** — `executeDeposit(user, vault, amount, permissionContext)` — validates ERC-7715 scope then executes swap → deposit. CEI pattern + OpenZeppelin ReentrancyGuard enforced.
- **`MockVault.sol`** — ERC-4626 mock. Implements `deposit()`, `balanceOf()`, `totalAssets()`. APY metadata lives off-chain (frontend mock), not on-chain.
- **`script/Deploy.s.sol`** — deploys both contracts to Sepolia.

### VaultDepositor Events (frontend must listen)

```solidity
PermissionGranted(address indexed user, address vault, uint256 maxAmount, uint256 expiresAt)
SwapExecuted(address indexed user, uint256 amountIn, uint256 amountOut)
DepositExecuted(address indexed user, address vault, uint256 amount, uint256 shares)
PermissionRevoked(address indexed user, address vault)
ExecutionFailed(address indexed user, string reason)
```

### User Flow

1. Connect wallet → EIP-7702 upgrades EOA to smart account
2. Venice AI (optional): user inputs risk level + amount → receives vault recommendation JSON
3. User grants ERC-7715 permission: `wallet_requestExecutionPermissions` (vault address, maxAmount, expiry)
4. Frontend → 1Shot API relay request with permission context
5. 1Shot → VaultDepositor: validates scope → executes swap → deposits to MockVault
6. Frontend listens to `SwapExecuted` + `DepositExecuted` events → updates status UI

---

## ADR Decisions (affect code choices)

| Decision | Chosen | Rejected | Reason |
|----------|--------|----------|--------|
| Contract framework | Foundry | Hardhat | Native Solidity tests, fast, DeFi standard |
| Frontend | React 18.3.1 + Babel CDN + ethers.js v6 | React + build pipeline | No build step; Babel transpiles JSX inline via `<script type="text/babel">` |
| AI layer | Venice AI | OpenAI/Anthropic | Required prize track, privacy-first |
| Vault | MockVault.sol (ERC-4626) | Real protocol | Full demo control, no external deps |

---

## Key Implementation Notes (updated from spike findings)

**⚠️ MetaMask Flask required** — NOT regular MetaMask Extension. Flask 13.9.0+ auto-upgrades EOA when requesting ERC-7715 permissions. Download: https://metamask.io/flask/

**EIP-7702 on Sepolia** — Live since March 5, 2025 (Pectra upgrade). No blockers.

**Frontend stack revision** — Add Viem via ESM CDN for EIP-7702/ERC-7715. Keep ethers.js v6 for contract events.
```html
<script type="module">
  import { createWalletClient, custom } from 'https://esm.sh/viem'
  import { erc7715ProviderActions } from 'https://esm.sh/@metamask/smart-accounts-kit/actions'
</script>
```
Fallback if SAK has no CDN build: call `window.ethereum.request({ method: 'wallet_requestExecutionPermissions', ... })` directly.

**ERC-7715 architecture** — VaultDepositor uses its OWN `permissions` mapping for on-chain enforcement. ERC-7715 shown in the FRONTEND for demo story. `context` from MetaMask response stored in `sessionStorage` for display.
```solidity
// VaultDepositor.sol permission storage
mapping(address user => Permission) public permissions;
function grantPermission(address vault, uint256 maxAmount, uint256 expiresAt) external
function executeDeposit(address user, uint256 amount, address vault) external  // called by 1Shot
function revokePermission() external
```

**1Shot API** — Use **Permissionless Relayer**. No API key, no account, no dashboard. POST to `https://relayer.1shotapi.com/relayers` (JSON-RPC). Pass `permissionContext` + `delegationManager` from ERC-7715 response. Verify exact method name from OpenRPC spec at that endpoint.

**ethers.js version:** Use v6. v6 has breaking changes from v5 (BigInt not BigNumber, `provider.getSigner()` is async).

**Venice AI:** `https://api.venice.ai/api/v1` (OpenAI-compatible). Model: `llama-3.3-70b` or `venice-uncensored`. Use `response_format: { type: 'json_object' }` + `venice_parameters: { include_venice_system_prompt: false }`. Use OpenAI SDK via ESM CDN (`https://esm.sh/openai`) pointing at Venice baseURL. Timeout: 10s with hardcoded fallback.

**Security — enforce in VaultDepositor:**
- Amount ≤ user-defined maxAmount (revert if exceeded, never silent fail)
- Vault address == user-approved vault (revert if different)
- `block.timestamp < expiresAt` (revert if permission expired)
- CEI pattern: all checks before all interactions
- No privileged admin roles post-deploy
- ReentrancyGuard on `executeDeposit`

---

## Technical Spikes

All resolved ✅. See `docs/spikes/` for full research. Summary:

| Spike | Status | Key Finding |
|-------|--------|-------------|
| EIP-7702 + MetaMask SAK | ✅ | Sepolia live since Mar 5 2025. Use Viem ESM CDN. Flask 13.9+ required. |
| ERC-7715 scoped permissions | ✅ | VaultDepositor uses own storage (not DelegationManager). ERC-7715 for UI only. |
| 1Shot API relayer | ✅ | Use Permissionless Relayer (`relayer.1shotapi.com/relayers`). No API key. Pure JSON-RPC. |
| Venice AI capabilities | ✅ | OpenAI-compatible. Model: `llama-3.3-70b`. Use OpenAI SDK via ESM CDN. |

---

## Critical Failure Modes

| Failure | Mitigation |
|---------|-----------|
| EIP-7702 not live on Sepolia | Verify Day 1 before writing any contract |
| MetaMask permission dialog doesn't appear | Test on clean browser profile before recording demo |
| 1Shot relay timeout | Auto-retry 1x; show clear error to user |
| Venice AI API key invalid | Test key before demo day |
| Contract revert on permission exceeded | Design intent — show clear error message, not blank failure |

---

## Hackathon Qualification Checklist

- [ ] Uses MetaMask Smart Accounts Kit (EIP-7702 + ERC-7715) in main flow
- [ ] Demo video shows EIP-7702 upgrade + ERC-7715 permission grant
- [ ] 1Shot API relays the deposit tx — demo shows `from` = relayer on Sepolia Etherscan
- [ ] Venice AI recommendation shown before permission grant step
- [ ] All 3 prize tracks demonstrable in ≤ 5 min video

## Prize Tracks

- Best Agent — $3,000
- Best use of Venice AI — $3,000
- Best Use of 1Shot Permissionless Relayer — $1,000 USDC

---

## Key Docs

- [Design system + component spec](DESIGN.md) — read before touching any frontend/UI code
- [Architecture + ADRs + NFRs + failure modes](docs/teknis-arsitektur.md)
- [On-chain scope + audit trail + risks](docs/teknis-blockchain-penggunaan.md)
- [Security constraints](docs/teknis-keamanan-privasi.md)
- [Demo script](docs/produk-demo-skenario.md) — read before recording
- MetaMask Smart Accounts Kit: https://docs.metamask.io/wallet/smart-accounts/
- EIP-7702: https://eips.ethereum.org/EIPS/eip-7702
- ERC-7715: https://eips.ethereum.org/EIPS/eip-7715
- 1Shot API: https://1shotapi.com/docs
- Venice AI: https://venice.ai/
