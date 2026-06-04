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

// Each specialist gets a genuinely different mandate — this is what makes the
// council more than "ask the same question three times" (TradingAgents pattern).
export const SPECIALIST_PROMPTS = {
  riskAuditor: `You are a DeFi Risk Auditor. Your SOLE job: assess protocol safety and IL risk.
Evaluate: smart contract audit recency, TVL stability (3-day trend), impermanent loss exposure, protocol track record.
Be conservative. When in doubt, vote HOLD. Protect the portfolio from rug pulls and IL traps.
Output ONLY valid JSON. Never explain outside the JSON.`,

  gasChecker: `You are a DeFi Gas Efficiency Analyst. Your SOLE job: determine if gas cost is economically justified.
Calculate: gas cost in USD, APY delta, daily yield improvement, breakeven period (gas_cost / daily_yield_delta).
Rule: if breakeven > 30 days, vote HOLD regardless of other factors.
Output ONLY valid JSON. Never explain outside the JSON.`,

  strategyGuard: `You are a DeFi Strategy Compliance Officer. Your SOLE job: enforce the user's declared strategy parameters.
Check: is the proposed action within risk tolerance? Does the target protocol appear on the whitelist? Is diversification maintained?
No exceptions. If it violates the user's strategy, vote HOLD.
Output ONLY valid JSON. Never explain outside the JSON.`,
}

/**
 * Consult one specialist. Returns `{ role, ...verdict }`. On any failure (network
 * or bad JSON) returns a protective HOLD so a broken specialist never votes EXECUTE.
 *
 * @param {'riskAuditor'|'gasChecker'|'strategyGuard'} role
 * @param {object} context           shared council context from buildCouncilContext()
 * @param {Array}  playbookForRole    this role's playbook slice
 * @param {(p:{systemPrompt:string,userPrompt:string}) => Promise<string>} aiComplete
 * @returns {Promise<object>} verdict
 */
export async function consultSpecialist(role, context, playbookForRole, aiComplete) {
  const playbookText = formatPlaybookForCouncil(playbookForRole)

  const userPrompt = `Relevant rules from your playbook:
${playbookText}

Decision context:
${JSON.stringify(context, null, 2)}

Provide your specialist verdict.

Respond ONLY in valid JSON:
{
  "decision": "EXECUTE" or "HOLD",
  "confidence": 0.00,
  "keyReason": "max 15 words",
  "citedRules": ["defi-001", "defi-003"],
  "newInsight": "a new rule worth adding, or null"
}`

  try {
    const raw = await aiComplete({ systemPrompt: SPECIALIST_PROMPTS[role], userPrompt })
    return { role, ...JSON.parse(raw) }
  } catch (err) {
    // Protective default — a specialist that can't speak does not get to approve a trade.
    return { role, decision: 'HOLD', confidence: 0, keyReason: `specialist unavailable: ${err.message}`, citedRules: [], newInsight: null }
  }
}
