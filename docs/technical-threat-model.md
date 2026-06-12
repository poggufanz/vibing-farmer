# Threat Model — Vibing Farmer (Base Sepolia)

## 1. Max-loss formula

Per agent, worst case loss = `capPerPeriod × ceil((expiry − now) / periodDuration)`.

Example: cap 100 USDC, period 1 day, expiry +7 days → max 700 USDC at risk for that one agent, never the whole wallet. Fixed-window allows up to `2×cap` across a single boundary (documented, matches MetaMask enforcer behavior).

## 2. Compromised server — can vs cannot (post-Phase 1)

| Attacker with the server / a worker key CAN | CANNOT |
|---|---|
| Trigger a deposit of the scoped token, into the scoped vault, credited to the scope owner, ≤ remaining cap | Redirect funds to any other address (vault+owner derived from on-chain scope) |
| Replay nothing (execId idempotency) | Exceed `capPerPeriod` |
| — | Deposit after `expiry` or after `revokeAgent` |
| — | Touch a token/vault it was not scoped to |
| — | Custody user funds (balance is asserted 0 throughout) |

## 3. Relayer trust (1Shot)

1Shot can censor/delay during a crash. Mitigation: a **worker-signed EIP-712 fallback** — the same worker key that signs the relayer path re-broadcasts the identical `AgentDeposit` signature via the project's own RPC. This is NOT a separate user signature; the user is not in the loop at submit time (that is the whole point of the scoped session key). The fallback therefore inherits the exact same on-chain caps and cannot exceed scope. **[VERIFY own-RPC broadcast path on Base Sepolia.]**

## 4. AI output is untrusted input

Venice AI strategy/skill JSON is schema-validated client-side and bounded by on-chain caps. A malicious/hallucinated plan cannot exceed the registry scope.

## 5. Key-material exposure (honest)

The sealed key is at rest under a KDF-derived secret (`keyStore`); the secret is re-derived from the session passphrase and never stored. At sign time the key becomes a `0x`-hex JS string — immutable, therefore **not zeroizable**. We minimize the exposure window (open → sign → drop reference); we do NOT claim the in-memory key is wiped. Byte buffers (derived secret, raw key bytes) ARE zeroized. Roadmap: move sealing/signing into a KMS so the plaintext key never enters JS.

## 6. Destructive-test results

Filled in from Phase 4, Task 4 (live "stolen key" / mid-plan revoke / relayer-down drills).
