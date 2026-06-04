// simulator.js — Step 5: Simulation Engine (lightweight ZX "alternate timeline").
// Runs 3 market scenarios (bull/base/bear) in parallel through the AI provider,
// weights them by live signals, and returns the probability-weighted expected value.
// The power is in the REAL context fed to each scenario, not the scenario count.
//
// Dependency-injected like loop.js: `aiComplete` and `getSentiment` are passed in so
// the module is testable with zero network/AI. Loop wiring binds the real impls via
// createSimulationStage. simulator.js intentionally does NOT statically import venice.js
// — the default aiComplete lazy-imports it so pure-function tests stay isolated.

const GAS_UNITS_PER_REBALANCE = 300_000 // typical DeFi swap+approve+deposit

const TREND_BAND = 0.03 // +/- average 24h TVL delta that still counts as "sideways"

/** Average 24h TVL movement across the candidate market -> coarse trend label. */
export function calculateMarketTrend(pools) {
  const list = pools ?? []
  if (list.length === 0) return 'sideways'
  const avg = list.reduce((s, p) => s + (p.tvlDelta24h ?? 0), 0) / list.length
  if (avg > TREND_BAND) return 'uptrend'
  if (avg < -TREND_BAND) return 'downtrend'
  return 'sideways'
}
