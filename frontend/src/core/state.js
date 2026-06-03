// State / Action / Reward formalization for the autonomous rebalance agent.
// Inspired by FinRL: State = what the agent observes, Action = what it can do,
// Reward = how success is measured. Pure functions only — no network, no AI, no I/O.
//
// Adapted to Vibing Farmer data shapes:
//  - positions: positionsStore map { [vaultAddr]: { vaultName, balance, unclaimedRewards } }
//    where `balance` is USDC wei (6 decimals). Enriched via VAULT_CATALOG (apy/protocol/risk).
//  - pools: VAULT_CATALOG / DeFiLlama-enriched vault objects.

export const USDC_DECIMALS = 6

/** Convert a USDC wei string (6-dec) to a USD number. USDC is pegged 1:1 to USD. */
export function usdcWeiToUsd(weiStr) {
  if (weiStr == null) return 0
  try {
    return Number(BigInt(weiStr)) / 10 ** USDC_DECIMALS
  } catch {
    return 0
  }
}
