// frontend/src/strategy/simulation.js
// Lightweight Monte Carlo "alternate futures" engine for the /strategy wizard.
// Adapts the cadCAD/curvesim parameter-sweep pattern (planning/inspiration/cadCAD.md §9)
// to DeFi yield: N runs = alternate futures, the scenario sweep = different assumptions
// (bull/base/bear), aggregate per scenario = the outcome distribution, and the
// probability-weighted mean = expected value. The differentiator is context richness —
// scenario drift/volatility/gas are enriched from live turbulence + gas signals.
// Pure functions only — RNG and state are injected; no React, no network, no storage.

import { makeRng, gaussian } from './rng.js'

export const DEFAULT_HORIZON_DAYS = 30
export const DEFAULT_RUNS = 100

/** Static scenario sweep (the cadCAD `M` parameter set). weight = scenario probability. */
export const SCENARIOS = [
  { name: 'bull', apyDriftPct: 2.0, apyVolPct: 1.5, gasMultiplier: 0.8, weight: 0.25 },
  { name: 'base', apyDriftPct: 0.0, apyVolPct: 1.0, gasMultiplier: 1.0, weight: 0.5 },
  { name: 'bear', apyDriftPct: -3.0, apyVolPct: 2.5, gasMultiplier: 1.5, weight: 0.25 },
]

/** Weighted APY of an allocation: allocation-carried apy wins, else the universe observation. */
function blendApy(allocations, state) {
  const byAddr = new Map((state.universe || []).map((v) => [String(v.address).toLowerCase(), v]))
  return (allocations || []).reduce((s, a) => {
    const obs = byAddr.get(String(a.address).toLowerCase()) || {}
    const apy = Number(a.apy != null ? a.apy : obs.apy) || 0
    return s + (Number(a.allocation) || 0) * apy
  }, 0)
}

/**
 * Simulate ONE alternate future for the proposed allocation.
 * @param {Array<{address:string, allocation:number, apy?:number}>} allocations weights sum to ~1
 * @param {Object} state StrategyState (uses state.capital.amountUsdc + state.universe)
 * @param {{apyDriftPct:number, apyVolPct:number, gasMultiplier:number}} params scenario assumptions
 * @param {() => number} rng injected uniform generator
 * @param {{horizonDays?:number, entryGasUsdc?:number}} [opts]
 * @returns {{netYieldUsdc:number, finalApy:number, blendedApy:number}}
 */
export function simulatePath(allocations, state, params, rng, opts = {}) {
  const horizonDays = opts.horizonDays || DEFAULT_HORIZON_DAYS
  const entryGasUsdc = opts.entryGasUsdc != null ? opts.entryGasUsdc : 0.5
  const capital = Number(state.capital?.amountUsdc) || 0
  const blendedApy = blendApy(allocations, state)

  let apy = blendedApy
  let cumulative = 0
  const drift = (Number(params.apyDriftPct) || 0) / 365
  const vol = (Number(params.apyVolPct) || 0) / 365
  for (let d = 0; d < horizonDays; d++) {
    apy = Math.max(0, apy + drift + gaussian(rng, 0, vol))
    cumulative += (capital * (apy / 100)) / 365
  }
  const gasCost = entryGasUsdc * (Number(params.gasMultiplier) || 1)
  return {
    netYieldUsdc: +(cumulative - gasCost).toFixed(2),
    finalApy: +apy.toFixed(2),
    blendedApy: +blendedApy.toFixed(2),
  }
}
