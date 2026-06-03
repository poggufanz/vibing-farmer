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

/** FinRL turbulence guard: when the market is too chaotic, do nothing. */
export function checkTurbulence(state, thresholds) {
  if (state.turbulenceIndex >= thresholds.TURBULENCE_CRITICAL) {
    return {
      pass: false,
      name: 'turbulence',
      reason: `Market turbulence too high: ${(state.turbulenceIndex * 100).toFixed(1)}% (max: ${(thresholds.TURBULENCE_CRITICAL * 100).toFixed(0)}%)`,
    }
  }
  return { pass: true, name: 'turbulence' }
}

/** Anti-churn guard: enforce a minimum gap between rebalances. */
export function checkCooldown(state, thresholds) {
  if (state.timeSinceLastRebalance < thresholds.MIN_COOLDOWN_HOURS) {
    return {
      pass: false,
      name: 'cooldown',
      reason: `Cooldown active: ${state.timeSinceLastRebalance.toFixed(1)}h since last rebalance (min: ${thresholds.MIN_COOLDOWN_HOURS}h)`,
    }
  }
  return { pass: true, name: 'cooldown' }
}

/** Estimate the USD cost of a rebalance tx and reject if it blows the budget. */
export function checkGasBudget(state, thresholds) {
  const gasCostETH = (state.gasPrice * GAS_UNITS_PER_REBALANCE) / 1e9
  const gasCostUSD = gasCostETH * state.ethPriceUSD

  if (gasCostUSD > thresholds.MAX_GAS_USD) {
    return {
      pass: false,
      name: 'gas',
      reason: `Gas too expensive: $${gasCostUSD.toFixed(2)} (max: $${thresholds.MAX_GAS_USD})`,
    }
  }
  return { pass: true, name: 'gas', estimatedGasUSD: gasCostUSD }
}

/**
 * Find pools worth moving into. A pool qualifies when it is not a protocol we
 * already hold, beats current portfolio APY by MIN_APY_DELTA_PERCENT, and meets
 * MIN_TVL_USD. Positions are keyed by vault address and pools by DeFiLlama id,
 * so "already held" is matched on protocol, the only reliable join.
 */
export function checkCandidatesExist(state, thresholds) {
  const currentAPY = getCurrentPortfolioAPY(state)
  const heldProtocols = new Set((state.positions ?? []).map(p => p.protocol))

  const candidates = (state.pools ?? [])
    .filter(pool =>
      !heldProtocols.has(pool.protocol) &&
      (pool.apy - currentAPY) >= thresholds.MIN_APY_DELTA_PERCENT &&
      pool.tvlUsd >= thresholds.MIN_TVL_USD
    )
    .slice(0, MAX_CANDIDATES)

  if (candidates.length === 0) {
    return {
      pass: false,
      name: 'candidates',
      reason: `No pools with APY > current (${currentAPY.toFixed(2)}%) + ${thresholds.MIN_APY_DELTA_PERCENT}% delta and TVL >= $${thresholds.MIN_TVL_USD}`,
    }
  }

  return { pass: true, name: 'candidates', candidates }
}
