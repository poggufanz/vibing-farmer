import { getCurrentPortfolioAPY } from '../core/gates.js'

const GAS_UNITS_PER_REBALANCE = 300_000 // typical DeFi swap+approve+deposit (matches gates/sim)

// council.js — Step 6: AI Council (TradingAgents-style specialist debate).
// Three specialists (Risk Auditor, Gas Checker, Strategy Guard) each see a
// different slice of the playbook and the SAME decision context, then emit a
// compressed EXECUTE/HOLD verdict. They run in parallel; any failure degrades to
// a protective HOLD so one bad AI call never forces a trade.
//
// Dependency-injected like simulator.js: `aiComplete` and `logger` are passed in
// so the module is testable with zero network/AI. createCouncilStage binds the
// real impls at wiring time (Step 14).

/**
 * Render a playbook rule array into the text block a specialist sees.
 * Sorted by net helpfulness so the most-trusted rules lead.
 *
 * NOTE: Step 8 (memory/playbook.js) will own the canonical version of this
 * formatter; this local copy gets deleted and imported from there once Step 8 lands.
 *
 * @param {Array<{id:string,helpful:number,harmful:number,text:string}>} [rules]
 * @returns {string}
 */
export function formatPlaybookForCouncil(rules) {
  if (!rules || rules.length === 0) return '(no rules yet)'
  return [...rules]
    .sort((a, b) => (b.helpful - b.harmful) - (a.helpful - a.harmful))
    .map(r => `[${r.id}] helpful=${r.helpful} harmful=${r.harmful} :: ${r.text}`)
    .join('\n')
}

/**
 * Split the playbook into the three specialist buckets by rule category.
 * @param {Array<{category:string}>} [playbook]
 * @returns {{riskAuditor:Array, gasChecker:Array, strategyGuard:Array}}
 */
export function filterPlaybookByRole(playbook) {
  const rules = playbook ?? []
  return {
    riskAuditor:   rules.filter(r => r.category === 'risk'),
    gasChecker:    rules.filter(r => r.category === 'gas'),
    strategyGuard: rules.filter(r => r.category === 'strategy'),
  }
}

/**
 * Assemble the single decision context every specialist shares. Pure: all numbers
 * are derived from already-fetched state + the simulation result. The proposed
 * pool is matched on PROTOCOL because sim.recommendedPool is a protocol name, not
 * a DeFiLlama pool id (same join gates.js uses).
 *
 * @param {object} sim     runSimulation() result { base, bull, bear, weights, expectedValue }
 * @param {object} state   canonical State from createState()
 * @param {object} config  strategy config
 * @returns {object} shared council context
 */
export function buildCouncilContext(sim, state, config) {
  const proposedPool = sim.base?.recommendedPool ?? null
  const poolDetails = (state.pools ?? []).find(p => p.protocol === proposedPool) ?? {}

  const estimatedGasCostUSD =
    (state.gasPrice * GAS_UNITS_PER_REBALANCE * state.ethPriceUSD) / 1e9

  const dailyYieldDelta = (sim.base?.projectedNetYieldUSD ?? 0) / 7
  const breakevenDays = dailyYieldDelta > 0 ? estimatedGasCostUSD / dailyYieldDelta : 999

  return {
    proposedPool,
    proposedPoolAPY: poolDetails.apy ?? 0,
    currentAPY: getCurrentPortfolioAPY(state),
    portfolioValueUSD: (state.positions ?? []).reduce((s, p) => s + (p.amountUSD ?? 0), 0),
    estimatedGasCostUSD,
    breakevenDays,
    expectedValue7d: sim.expectedValue,
    simulationScenarios: {
      bull: { yield: sim.bull?.projectedNetYieldUSD, probability: sim.weights?.bull },
      base: { yield: sim.base?.projectedNetYieldUSD, probability: sim.weights?.base },
      bear: { yield: sim.bear?.projectedNetYieldUSD, probability: sim.weights?.bear },
    },
    poolDetails,
    strategyConfig: {
      riskTolerance: config.riskTolerance,
      whitelist: config.whitelist,
      maxGasUSD: config.thresholds?.MAX_GAS_USD ?? 25,
    },
    turbulenceIndex: state.turbulenceIndex,
  }
}
