// gates.js — Step 4: Fast-fail Gates (FinRL Turbulence Index + hard risk constraints).
// PURE FUNCTIONS ONLY — no async, no AI, no network. Fast, instant, zero cost.
// First line of defense: if a gate fails, the loop sleeps without spending AI credit.

const DEFAULTS = {
  TURBULENCE_CRITICAL: 0.75,    // market-chaos ceiling (0–1)
  MIN_APY_DELTA_PERCENT: 2.0,   // minimum APY improvement worth a rebalance
  MIN_TVL_USD: 5_000_000,       // ignore thin pools
  MAX_GAS_USD: 25,              // skip the cycle if a tx costs more than this
  MIN_COOLDOWN_HOURS: 12,       // don't churn positions
}

const GAS_UNITS_PER_REBALANCE = 300_000 // typical DeFi swap+approve+deposit
const MAX_CANDIDATES = 5                 // cap sent downstream to simulation

/** Weighted-average APY of currently held positions. 0 when none. */
export function getCurrentPortfolioAPY(state) {
  const positions = state.positions ?? []
  if (positions.length === 0) return 0
  const totalValue = positions.reduce((s, p) => s + (p.amountUSD ?? 0), 0)
  if (totalValue === 0) return 0
  return positions.reduce(
    (s, p) => s + (p.currentAPY ?? 0) * (p.amountUSD ?? 0) / totalValue,
    0,
  )
}
