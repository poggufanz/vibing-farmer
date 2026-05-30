<p align="center">
  <img src="frontend/public/vibing_farmer.logo.png" alt="Vibing Farmer Logo" width="100%" />
</p>

# Vibing Farmer

> **Set once. Vibe forever.**

Most yield farming is exhausting. You find two or three vaults, swap into the assets, approve the spenders, and deposit repeating a click-heavy loop over and over. Vibing Farmer changes this. We coordinate an AI agent swarm that automates this entire flow in parallel. You set your terms, review the worker skills once, and let the agents do the rest.

---

## How it works

1. **Strategy Generation**: Venice AI evaluates your intent (deposit amount, risk tolerance, and number of target vaults) to compile a custom multi-vault allocation plan and action-level agent skills.
2. **User Review**: You inspect the auto-generated skill JSON in an interactive editor. You can adjust slippage parameters, set spend caps, or approve them as-is.
3. **Smart Account Upgrade**: A single EIP-7702 signature upgrades your MetaMask Flask account into a temporary smart account.
4. **Batched Permission**: You authorize scoped worker agents via an ERC-7715 batched permission request. Each agent is strictly confined to its assigned vault and budget.
5. **Parallel Execution**: The Orchestrator Agent spawns parallel Worker Agents to execute the transactions. Each worker carries out its specific Swap → Approve → Deposit sequence gaslessly via the 1Shot Permissionless Relayer.
6. **Real-time Monitoring**: The frontend visualizes the active agent swarm, execution stages, and persistent agent memories in a live network graph.

---

## System Architecture

```
User Input (amount, risk, # vaults)
        │
        ▼
Venice AI Coordinator
  ├── Generate multi-vault strategy
  └── Auto-generate skill set per agent per step
        │
        ▼
User Reviews & Approves Skills
        │
        ▼
Orchestrator Agent
  ├── Worker Agent 1 → Vault A (Swap→Approve→Deposit)
  ├── Worker Agent 2 → Vault B (Swap→Approve→Deposit)
  └── Worker Agent N → Vault N (parallel)
        │
        │ All via ERC-7715 permission + 1Shot Relay
        ▼
AgentVaultDepositor.sol (Sepolia)
  └── MockVault.sol × N (ERC-4626)
        │
        ▼
Agent Memory + vis.js Graph (real-time)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity ^0.8.24, Foundry |
| Frontend | HTML/CSS/JS + ethers.js v6 + vis.js Network |
| AI Coordinator | Venice AI API (Llama-3.3-70b, OpenAI-compatible) |
| Relay | 1Shot Permissionless Relayer (JSON-RPC) |
| Wallet | MetaMask Flask 13.9+ (Smart Accounts Kit) |
| Network | Ethereum Sepolia (for now is testnet) |

---

## Quick Start

See [GETTING_STARTED.md](GETTING_STARTED.md) to set up your environment, fund your wallet on Sepolia, and run the client.

---

## Documentation

All core design decisions, requirements, and guides are fully documented in English:

| Document | Focus |
|-----|-----|
| [technical-architecture.md](docs/technical-architecture.md) | High-level system architecture, design principles, ADRs, and NFRs |
| [technical-blockchain-usage.md](docs/technical-blockchain-usage.md) | On-chain contract boundaries, audit trails, and delegation scope |
| [technical-security-privacy.md](docs/technical-security-privacy.md) | Threat modeling, security controls, and regulatory compliance |
| [technical-api-events.md](docs/technical-api-events.md) | Core event schemas, API request/response structures, and error routing |
| [technical-database.md](docs/technical-database.md) | Local storage, agent memory structures, and data retention guidelines |
| [product-demo-scenario.md](docs/product-demo-scenario.md) | Step-by-step walkthrough and narrative script for the video demo |
| [product-features-complete.md](docs/product-features-complete.md) | Detailed functional requirements and priority matrices |
| [product-user-stories.md](docs/product-user-stories.md) | User personas, journey maps, and exhaustive acceptance criteria |
| [business-impact-model.md](docs/business-impact-model.md) | Market pain points, value propositions, and KPI impact metrics |
| [business-roadmap-backlog.md](docs/business-roadmap-backlog.md) | Comprehensive development roadmap, backlog items, and risk matrix |

---

## The Vision

Most Web3 tools treat users like transaction-signing robots. We wanted to build something that feels like a natural step toward Web4. You express your investment intent once, AI coordinates the strategy and drafts the boundaries, and parallel worker agents carry it out. 

Blockchain shouldn't be the interface; it is the cryptographic boundary that keeps the agents completely honest.
