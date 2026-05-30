Created At: 2026-05-30T13:59:04Z
Completed At: 2026-05-30T13:59:04Z
File Path: `file:///c:/SharredData/project/competition/yield-vibing/docs/bisnis-roadmap-backlog.md`

# Roadmap & Backlog — Vibing Farmer

> **Skill Reference:** architecture-designer + finance-expert
> **Version:** 2.0 | **Date:** May 27, 2026
> **Purpose:** 20-day hackathon roadmap, feature prioritization, and risk management

---

## 1. Roadmap Summary

Deadline: **June 15, 2026** (20 days from May 26).  
Submission platform: HackQuest.  
Target: End-to-end multi-vault deposit automation demo with an agent swarm on Sepolia + a 3–5 minute video.

**4 target tracks:** Best Agent ($3,000) + Best Venice AI ($3,000) + Best A2A Coordination ($3,000) + Best 1Shot ($1,000 USDC) = **$10,000 out of a $11,000 prize pool.**

---

## 2. Priority Matrix (MoSCoW)

### Must Have

| ID | Feature | Track |
|----|-------|-------|
| M1 | Wallet connect + EIP-7702 account upgrade | Qualification |
| M2 | ERC-7715 permission grant UI per agent | Qualification |
| M3 | AgentVaultDepositor.sol (per-agent permission + execution) | Core |
| M4 | 1Shot API relay for all agent transactions | 1Shot Track |
| M5 | Venice AI: strategy generation + skill auto-generation per agent | Venice Track |
| M6 | Skill review + edit UI (user approves prior to execution) | Agent Track |
| M7 | Orchestrator Agent: parallel Worker dispatch | A2A Track |
| M8 | Worker Agent: single vault Swap→Approve→Deposit | Agent Track |
| M9 | Agent memory files: write + display | Agent Track |
| M10 | vis.js Network graph: real-time agent visualization | Agent Track |
| M11 | End-to-end flow on Sepolia testnet | Demo |
| M12 | Demo video (3–5 minutes) | Submission |

### Should Have

| ID | Feature | Rationale |
|----|-------|--------|
| S1 | Agent memory displayed in vis.js node details | Strengthens the Agent track |
| S2 | Permission boundary enforcement (revert on exceed) per agent | Security & judging quality |
| S3 | MockVault × 2 instances for demo of 2 parallel Workers | Demo completeness |
| S4 | Skill edit capability (user modifies slippage, amount) | UX for judging |

### Could Have

| ID | Feature | Rationale |
|----|-------|--------|
| C1 | Memory-aware Venice AI re-prompting | Added value for the Agent track |
| C2 | APY comparison UI across vaults | More compelling for the demo |
| C3 | ≥ 3 parallel Workers (expandable N) | Strengthens the A2A track |

### Won't Have (Explicitly Out of Scope)

| Feature | Reason for Exclusion |
|-------|-------------------|
| Cross-chain bridging | Too complex, adds no value for judging |
| Remove liquidity automation | High-stakes, timing-sensitive, out of scope |
| Custom AMM/DEX | Reinventing the wheel, not aligned with hackathon value |
| Mainnet deployment | Unsafe for demo, testnet is sufficient |
| Mobile breakpoints | Not a judging requirement |

---

## 3. Milestones per Phase

### Phase 1: Foundation (Days 1–3 | May 26–28)

> **Note:** All 4 spikes are already resolved ✅. Spike review does not need to be repeated — proceed directly to understanding the architecture and technical preparations.

| Day | Deliverable | Complete |
|------|-------------|---------|
| Day 1 | Solidity review: storage, events, modifiers, access control | [ ] |
| Day 1 | Security patterns: CEI pattern, ReentrancyGuard, revert vs. silent fail | [ ] |
| Day 2 | Read `GETTING_STARTED.md` end-to-end: contract spec, build order, skill schema | [ ] |
| Day 2 | Understand the Skill System: JSON schema per agent, Venice AI → skills.js → worker.js flow | [ ] |
| Day 3 | Review the design prototype (`design/Vibing Farmer Prototype.html`) — UI reference before writing contracts | [ ] |
| Day 3 | Setup check: `forge build` OK · `.env.example` → `.env` · `agents/memory/` directory exists | [ ] |
| Day 3 | Verify `contracts/AgentVaultDepositor.sol` + `test/AgentVaultDepositor.t.sol` are ready to be populated | [ ] |

**Milestone gate:** `forge build` compiles successfully (green). All skeleton files are correctly named. Skill schema is thoroughly understood. Ready to implement logic in Phase 2.

### Phase 2: Smart Contracts (Days 4–8 | May 29 – June 2)

| Day | Deliverable | Complete |
|------|-------------|---------|
| Day 4 | MockVault.sol — minimal ERC-4626, deploy 2 instances | [ ] |
| Day 5 | AgentVaultDepositor.sol — per-agent permission struct + grantAgentPermission | [ ] |
| Day 6 | AgentVaultDepositor.sol — executeAgentDeposit (CEI) + all events | [ ] |
| Day 7 | Security review: per-agent validation, no admin key, ReentrancyGuard | [ ] |
| Day 8 | Testing: success path, fail path, parallel agentId, fuzz (forge test) | [ ] |

**Milestone gate:** All `forge test` cases pass, coverage ≥ 80%.

### Phase 3: Integration (Days 9–13 | June 3–7)

| Day | Deliverable | Complete |
|------|-------------|---------|
| Day 9 | 1Shot relay integration: relay.js + test Sepolia relay | [ ] |
| Day 10 | wallet.js: EIP-7702 upgrade + ERC-7715 per-agent permission | [ ] |
| Day 11 | venice.js: strategy generation + skill auto-generation | [ ] |
| Day 12 | skills.js + memory.js: review UI + memory write/read | [ ] |
| Day 11 | worker.js: single vault agent workflow | [ ] |
| Day 12 | orchestrator.js: parallel dispatch + Promise.allSettled | [ ] |
| Day 13 | graph.js: vis.js Network + real-time event updates | [ ] |

**Milestone gate:** 2 Worker Agents run in parallel on Sepolia, with real-time graph updates.

### Phase 4: Polish & Ship (Days 14–17 | June 8–11)

| Day | Deliverable | Complete |
|------|-------------|---------|
| Day 14 | Bug fixes: edge cases, error handling, UX polish | [ ] |
| Day 15 | Memory UI in node details, skill edit capability | [ ] |
| Day 16 | README, comprehensive documentation, architecture diagram updates | [ ] |
| Day 17 | Demo video recording (3–5 minutes) | [ ] |

**Milestone gate:** Video uploaded, all qualification checklists successfully completed.

### Phase 5: Buffer (Days 18–20 | June 12–15)

| Day | Deliverable | Complete |
|------|-------------|---------|
| Day 18–19 | Buffer for unexpected issues | [ ] |
| Day 20 | Final submission on HackQuest (deadline June 15) | [ ] |

---

## 4. Core Feature Backlog

### Contracts (Priority: Critical)

- `AgentVaultDepositor.sol` — per-agent permission mapping, executeAgentDeposit, 6 events
- `MockVault.sol` — ERC-4626 mock, deploy 2 instances (VaultA and VaultB)
- `script/Deploy.s.sol` — deploy AgentVaultDepositor + 2 MockVaults to Sepolia
- Foundry tests: unit (per agent), integration (2 parallel agents), fuzz (amount edge cases)

### Frontend — Agent System (Priority: Critical)

- `orchestrator.js` — receives the Venice AI plan, dispatches Workers via Promise.allSettled
- `worker.js` — single vault Swap→Approve→Deposit, respecting skill parameters
- `skills.js` — generates + renders editable skill cards, writes to `agents/session-{id}/`
- `memory.js` — append-only memory writing, reading, and rendering in node details

### Frontend — Visualization (Priority: High)

- `graph.js` — vis.js Network: initializes the graph, updates node states from on-chain events
- Node states: idle (gray) → running (blue) → confirmed (green) → failed (red)
- Click handler: detail panel showing skill JSON + memory entries

### Frontend — Web3 (Priority: High)

- `wallet.js` — MetaMask Flask detection, EIP-7702, ERC-7715 per agent
- `relay.js` — 1Shot relay per Worker Agent, with a 1x retry on timeout
- `venice.js` — strategy + skill generation, 10-second timeout, hardcoded fallback

### Frontend — App (Priority: High)

- `app.js` — state machine: input → strategy → skills → permissions → execute → done
- `ui.js` — step tracker, status badges, Etherscan links

---

## 5. Risks & Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| vis.js graph does not render smoothly with event updates | Medium | Medium | Test with mock events prior to real contract deployment |
| Venice AI JSON output does not match skill schema | Medium | High | Validate output and fall back to hardcoded skill template |
| Promise.allSettled executes too fast — 1Shot rate limit | Low | Medium | Add delay between Worker dispatches if necessary |
| Solo burnout | High | High | Max 8 hours/day. If stuck > 2 hours → pivot or skip |
| Scope creep into features C2/C3 | Medium | High | Strict boundaries: 2 Workers + basic memory = MVP. No feature creep after Day 13 |
| AgentId collision among agents | Low | Medium | Use keccak256(agentId string) — deterministic |
| MetaMask Flask version incompatibility | Low | High | Test in a clean browser profile, document the exact working Flask version |
| 1Shot Permissionless Relayer down | Low | High | Verify relayer health on Day 9. Implement fallback: direct EOA transaction for the demo |
| Venice AI response is slow (> 10 seconds) | Low | Low | Timeout + hardcoded fallback strategy |
| Poor demo video quality | Low | Medium | Write script first, record last, max 5 minutes |
