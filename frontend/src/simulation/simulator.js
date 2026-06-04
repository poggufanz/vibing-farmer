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

/** Tilt the three scenario probabilities by turbulence, sentiment, and trend. Normalized to sum 1. */
export function assignScenarioProbabilities(context) {
  let bull = 0.33, base = 0.34, bear = 0.33

  if (context.turbulenceIndex > 0.5) { bear += 0.15; bull -= 0.15 }
  if (context.newsSentiment === 'positive') { bull += 0.10; bear -= 0.10 }
  if (context.newsSentiment === 'negative') { bear += 0.10; bull -= 0.10 }
  if (context.marketTrend === 'uptrend') { bull += 0.07; bear -= 0.07 }
  if (context.marketTrend === 'downtrend') { bear += 0.07; bull -= 0.07 }

  const total = bull + base + bear
  return { bull: bull / total, base: base / total, bear: bear / total }
}

/**
 * Assemble the single context object every scenario shares. Enriched with REAL
 * numbers (portfolio value, gas, turbulence, sentiment, trend) so the AI reasons
 * about facts rather than hallucinating them.
 *
 * @param {Array}  candidates   rebalance candidates from gates (normalized pool shape)
 * @param {object} state        canonical State from createState()
 * @param {() => Promise<'positive'|'neutral'|'negative'>} getSentiment  injected
 */
export async function buildSimulationContext(candidates, state, getSentiment) {
  const newsSentiment = await getSentiment()
  const portfolioValueUSD = (state.positions ?? []).reduce((s, p) => s + (p.amountUSD ?? 0), 0)

  return {
    candidates: (candidates ?? []).slice(0, 5).map((p) => ({
      id: p.id,
      protocol: p.protocol,
      apy: p.apy ?? 0,
      tvlUsd: p.tvlUsd ?? 0,
      tvlTrend3d: (p.tvlDelta24h ?? 0) * 3, // rough 3-day estimate from 24h delta
      ilRisk: p.ilRisk ?? 'low',
      audited: p.audited ?? false,
    })),
    portfolioValueUSD,
    gasPrice: state.gasPrice ?? 0,
    ethPrice: state.ethPriceUSD ?? 0,
    turbulenceIndex: state.turbulenceIndex ?? 0,
    marketVolatility: state.marketVolatility ?? 0,
    newsSentiment,
    marketTrend: calculateMarketTrend(state.pools),
  }
}

const SCENARIO_ASSUMPTIONS = {
  bull: 'DeFi market rallying. TVL growing. APYs stable. Gas affordable. Low IL risk.',
  base: 'DeFi market flat. TVL stable. APYs as reported. Gas normal. Moderate IL risk.',
  bear: 'DeFi market declining. TVL shrinking 10-20%. APYs may compress. Gas elevated. High IL risk.',
}

const SCENARIO_SYSTEM_PROMPT =
  'You are a DeFi simulation engine. Output ONLY valid JSON. No explanation.'

/**
 * Run a single market scenario through the injected AI completion fn.
 * Returns `{ scenario, ...parsedVerdict }`. On any failure (network or bad JSON)
 * returns a protective zero-yield verdict so one scenario never poisons the loop.
 *
 * @param {'bull'|'base'|'bear'} scenario
 * @param {object} context  from buildSimulationContext()
 * @param {(p:{systemPrompt:string,userPrompt:string}) => Promise<string>} aiComplete
 */
export async function simulateScenario(scenario, context, aiComplete) {
  const gasUsdPerTx = (context.gasPrice * GAS_UNITS_PER_REBALANCE * context.ethPrice) / 1e9

  const userPrompt = `You are a DeFi yield simulation engine.

Market scenario: ${scenario.toUpperCase()}
Assumptions: ${SCENARIO_ASSUMPTIONS[scenario]}

Portfolio: $${context.portfolioValueUSD.toFixed(0)} USD
Current gas: ${context.gasPrice} gwei (~$${gasUsdPerTx.toFixed(2)} per tx)
News sentiment: ${context.newsSentiment}
Market trend: ${context.marketTrend}
Turbulence: ${(context.turbulenceIndex * 100).toFixed(0)}%

Top candidates:
${context.candidates.map((p) =>
  `- ${p.protocol}: APY ${p.apy.toFixed(2)}%, TVL $${(p.tvlUsd / 1e6).toFixed(1)}M, IL risk: ${p.ilRisk}, audited: ${p.audited}`
).join('\n')}

Given this ${scenario} scenario, what is the realistic outcome if we rebalance to the best candidate?
Estimate projected net yield (after gas and IL) over 7 days.

Respond ONLY in valid JSON:
{
  "recommendedPool": "protocol-name",
  "projectedNetYieldUSD": 0.00,
  "projectedILPercent": 0.00,
  "estimatedGasCostUSD": 0.00,
  "confidence": 0.00,
  "keyRisk": "one sentence max"
}`

  try {
    const raw = await aiComplete({ systemPrompt: SCENARIO_SYSTEM_PROMPT, userPrompt })
    return { scenario, ...JSON.parse(raw) }
  } catch (err) {
    return { scenario, projectedNetYieldUSD: 0, confidence: 0, keyRisk: `simulation failed: ${err.message}` }
  }
}

/** Probability-weighted expected net yield across the three scenarios. */
export function computeExpectedValue(bull, base, bear, weights) {
  return (
    (bull.projectedNetYieldUSD ?? 0) * weights.bull +
    (base.projectedNetYieldUSD ?? 0) * weights.base +
    (bear.projectedNetYieldUSD ?? 0) * weights.bear
  )
}
