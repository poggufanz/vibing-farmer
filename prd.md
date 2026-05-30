# Vibing Farmer — Product Requirements Document

**Hackathon:** MetaMask Smart Accounts Kit × 1Shot API × Venice AI Dev Cook Off  
**Deadline:** 15 Juni 2026 | **Prize:** $11,000 | **Mode:** Solo | **Platform:** HackQuest  
**Tagline:** "Set once. Vibe forever."

---

## Problem Statement

### Yield Farming UX is Broken

Yield farmers must execute **8+ manual transactions** per rebalance cycle:

1. Remove liquidity → sign approve/burn NFT
2. Receive raw tokens (ETH + USDC)
3. Swap tokens → sign approve + execute swap
4. Supply to lending protocol → sign supply + use as collateral
5. Borrow asset → sign execute borrow
6. Deposit to vault → sign approve + deposit & stake

**Every step = MetaMask popup + gas fee + risk of mis-click.**

### User Research (X/Twitter 2025–2026)

> "Are you tired of the tedious, multi-step dance of adjusting liquidity in DeFi?" — @John_Peace1

> "Normally it's: bridge → swap → find the right vault → deposit… and hope you didn't miss a step 😭" — @kokocodes

> "agent finance UX is still broken. Today you choose between: full wallet access (risky) • human over-control (co-approving every step)." — @0xYann_

> "only ~15–18% of wallet connects end in a real transaction." — @agnt_hub

---

## Solution: Vibing Farmer

### Elevator Pitch

> AI-coordinated agent swarm for automated multi-vault yield farming. Venice AI generates strategy and per-agent skill sets. User reviews and approves once. An Orchestrator Agent dispatches Worker Agents in parallel — each handling one complete vault flow. All transactions relay gas-free via 1Shot. Real-time vis.js graph tracks every agent's status and memory.

### What Makes This Different

| Feature | Vibing Farmer | DeleGate | Manual DeFi | Auto-compound bots |
|---------|--------------|---------|-------------|-------------------|
| Agent execution | Parallel multi-agent | Sequential | N/A | N/A |
| Skill system (user reviews) | ✅ | ❌ | ❌ | ❌ |
| Persistent agent memory (UI) | ✅ | ❌ | ❌ | ❌ |
| AI coordinator (strategy + skills) | Venice AI | Groq (no Venice track) | ❌ | ❌ |
| Gas-free relay | 1Shot (active) | Skips 1Shot | User pays | Depends on bot |
| Wallet control | Bounded ERC-7715 | Unknown | Full manual | Full access (risky) |
| A2A coordination track | ✅ | ❌ | ❌ | ❌ |

---

## Core Architecture

### 1. Venice AI Coordinator

- User inputs: amount, risk level, number of vaults
- Venice AI outputs:
  - Multi-vault allocation strategy (which vaults, how much each)
  - Auto-generated **skill set JSON** per agent per step type:
    - Swap step → generates swap skill (slippage tolerance, DEX preference, max retries)
    - Deposit step → generates deposit skill (maxAmount, vault address, expiry)
- User reviews and can edit generated skills in UI before approval

### 2. Skill System (Required)

Each agent receives a skill set JSON before execution:

```json
{
  "agentId": "worker-agent-1",
  "vaultAddress": "0xABCD...",
  "skills": {
    "swap": {
      "maxSlippage": 0.5,
      "dexPreference": "uniswap-v3",
      "maxRetries": 2,
      "timeoutSeconds": 30
    },
    "deposit": {
      "maxAmount": "50000000",
      "vaultAddress": "0xABCD...",
      "expiresAt": 1749686400
    }
  },
  "generatedBy": "venice-ai",
  "approvedByUser": true,
  "sessionId": "session-20260609-001"
}
```

Skills stored as files: `agents/session-{id}/agent-{n}-skills.json`

### 3. Agent Swarm (Parallel Execution)

- **Orchestrator Agent** (JavaScript, frontend):
  - Receives plan JSON from Venice AI
  - Dispatches N Worker Agents in parallel (`Promise.allSettled`)
  - Aggregates results → writes summary to memory

- **Worker Agents** (JavaScript, frontend, one per vault):
  - Each handles one complete vault deposit flow: Swap → Approve → Deposit
  - Uses assigned skill set (maxSlippage, dexPreference, maxRetries, etc.)
  - Sends all transactions via ERC-7715 scoped permission + 1Shot relay
  - Emits on-chain events per step: `AgentStarted`, `SwapExecuted`, `ApproveExecuted`, `DepositExecuted`, `AgentCompleted`, `AgentFailed`
  - Writes memory file after execution

### 4. Memory System (Required)

Each agent writes to a memory file after execution:

```json
{
  "agentId": "worker-agent-1",
  "sessionId": "session-20260609-001",
  "vault": "0xABCD...",
  "entries": [
    {
      "timestamp": 1748387200,
      "step": "swap",
      "status": "success",
      "gasUsed": 45000,
      "slippageActual": 0.12,
      "executionTimeMs": 4200,
      "lesson": "Vault A accepts 0.5% slippage reliably"
    },
    {
      "timestamp": 1748387260,
      "step": "deposit",
      "status": "success",
      "sharesReceived": "100023456",
      "executionTimeMs": 3800
    }
  ]
}
```

Memory stored: `agents/memory/agent-{n}-memory.json`  
Memory displayed in vis.js node detail panel.  
Next execution reads memory for context (feeds back to Venice AI prompt).

### 5. Real-time vis.js Graph

- Force-directed network visualization (vis.js Network, NOT D3.js)
- **Nodes:** Orchestrator + Worker Agents + Vault targets
- **Edges:** dependency and communication between agents
- **Node states:** idle → running → confirmed → failed (color-coded)
- Updates in real-time from on-chain events (ethers.js `contract.on(...)`)
- Clicking a node opens detail panel: current step, skill being used, memory entries

### 6. Wallet & Permission Layer

- **EIP-7702:** EOA upgrade to smart account (MetaMask Flask 13.9+)
- **ERC-7715:** Scoped permission per agent (vault address, max amount, expiry)
- **1Shot Permissionless Relayer:** Gas abstraction — user pays 0 gas
- Permission scope visible and editable in UI before grant

---

## Functional Requirements

| ID | Feature | Priority |
|----|---------|---------|
| FR-01 | Venice AI strategy generation + skill auto-generation | Must |
| FR-02 | Skill review + edit UI before execution | Must |
| FR-03 | Orchestrator Agent: parallel Worker dispatch | Must |
| FR-04 | Worker Agent: Swap→Approve→Deposit per vault | Must |
| FR-05 | Agent memory files: write after execution | Must |
| FR-06 | vis.js graph: real-time agent network | Must |
| FR-07 | EIP-7702 wallet upgrade | Must |
| FR-08 | ERC-7715 permission grant per agent | Must |
| FR-09 | 1Shot relay for all agent transactions | Must |
| FR-10 | Permission revocation | Should |
| FR-11 | Memory-aware next execution (feed memory to Venice AI) | Could |

---

## Hackathon Qualification Checklist

- [ ] Uses MetaMask Smart Accounts Kit (EIP-7702 + ERC-7715) in main flow
- [ ] Demo video shows EIP-7702 upgrade + ERC-7715 permission grant
- [ ] 1Shot API relays agent deposit txs — demo shows `from` = relayer on Sepolia Etherscan
- [ ] Venice AI generates strategy + skill sets — shown before execution
- [ ] Skill review UI visible in demo
- [ ] Agent swarm (≥2 parallel Workers) visible in vis.js graph
- [ ] Agent memory displayed in node detail
- [ ] All 4 prize tracks demonstrable in ≤ 5 min video

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity ^0.8.24, Foundry |
| Frontend | HTML/CSS/JS + ethers.js v6 + vis.js Network |
| AI | Venice AI API (`llama-3.3-70b`, OpenAI-compatible) |
| Relay | 1Shot Permissionless Relayer (JSON-RPC, no API key) |
| Wallet | MetaMask Flask 13.9+ (Smart Accounts Kit) |
| Network | Ethereum Sepolia |
| Viem | ESM CDN (`esm.sh/viem`) for EIP-7702/ERC-7715 signing |

---

## Timeline

| Phase | Days | Deliverable |
|-------|------|------------|
| 1 — Foundation | 1–3 (26–28 Mei) | Solidity review, EIP-7702/ERC-7715 study, spike review |
| 2 — Smart Contract | 4–8 (29 Mei – 2 Juni) | AgentVaultDepositor.sol + MockVault.sol + forge tests |
| 3 — Integration | 9–13 (3–7 Juni) | 1Shot + Orchestrator + Worker agents + vis.js graph + Sepolia E2E |
| 4 — Polish | 14–17 (8–11 Juni) | Venice AI skill gen, memory UI, bug fixes, demo video |
| 5 — Buffer | 18–20 (12–15 Juni) | Final submission |

---

## Critical Failure Modes

| Failure | Mitigation |
|---------|-----------|
| EIP-7702 not live on Sepolia | Already verified — live since Mar 5 2025 |
| MetaMask Flask not available | Test on clean browser profile before demo |
| 1Shot relay timeout | Auto-retry 1x; Worker marks itself failed, others continue |
| Venice AI API key invalid | Test key before demo day |
| One Worker Agent fails | `Promise.allSettled()` — other Workers continue |
| Contract revert on permission exceeded | Design intent — show clear error in graph node |
| vis.js graph not rendering | Fallback: step-tracker list view |

---

## Resources

- MetaMask Smart Accounts Kit: https://docs.metamask.io/wallet/smart-accounts/
- EIP-7702: https://eips.ethereum.org/EIPS/eip-7702
- ERC-7715: https://eips.ethereum.org/EIPS/eip-7715
- 1Shot API: https://1shotapi.com/docs
- Venice AI: https://venice.ai/
- vis.js Network: https://visjs.github.io/vis-network/docs/network/
