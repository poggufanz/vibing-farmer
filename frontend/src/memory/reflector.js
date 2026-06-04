import { incrementCounter, pruneHarmfulRules } from './playbook.js'

// ─── Pure helpers (no I/O — unit-tested directly) ───────────────────────────────

/**
 * Unique cited-rule ids, preserving first-seen order. Tolerates null/undefined.
 * @param {string[]|null} [citedRules]
 * @returns {string[]}
 */
export function dedupeCitedRules(citedRules) {
  return [...new Set(citedRules ?? [])]
}

/**
 * Bump one counter on every cited rule: 'helpful' when the outcome was profit,
 * 'harmful' otherwise. Pure — reuses incrementCounter (immutable) per id.
 * @param {Array} playbook
 * @param {string[]} citedRules  already deduped
 * @param {boolean} wasProfit
 * @returns {Array} new playbook
 */
export function tagRulesByOutcome(playbook, citedRules, wasProfit) {
  const tag = wasProfit ? 'helpful' : 'harmful'
  return citedRules.reduce((pb, ruleId) => incrementCounter(pb, ruleId, tag), playbook ?? [])
}

const DEFAULT_MIN_ACCURACY_PCT = 40

/**
 * Whether this outcome is worth extracting a new rule from: any loss, or a profit whose
 * simulation prediction was badly off (accuracy below the threshold).
 * @param {{wasProfit:boolean, predictionAccuracyPct?:number}} outcome
 * @param {number} [minAccuracyPct]
 * @returns {boolean}
 */
export function shouldLearnFromOutcome(outcome, minAccuracyPct = DEFAULT_MIN_ACCURACY_PCT) {
  if (!outcome?.wasProfit) return true
  return (outcome.predictionAccuracyPct ?? 100) < minAccuracyPct
}

/**
 * Build the { systemPrompt, userPrompt } pair asking Venice to extract one concrete,
 * actionable DeFi rule from a decision's realized outcome. Pure: no AI call here.
 * @param {object} decision
 * @param {object} outcome
 * @returns {{systemPrompt:string, userPrompt:string}}
 */
export function buildFailureInsightPrompt(decision, outcome) {
  const systemPrompt =
    'You are a DeFi strategy learning system. Extract concrete, actionable rules from ' +
    'decision outcomes. Output ONLY valid JSON. No explanation.'

  const verdicts = (decision.councilVerdicts ?? []).map(v => ({
    role: v.role, decision: v.decision, reason: v.keyReason,
  }))

  const result = outcome.wasProfit ? 'PROFITABLE' : 'LOSS'
  const userPrompt = `A DeFi yield farming decision was made and evaluated after a 7-day delay.

Decision details:
- Vault chosen: ${decision.toVault}
- Council verdicts: ${JSON.stringify(verdicts)}
- Rules cited: ${(decision.citedRules ?? []).join(', ')}

Outcome:
- Expected (sim): $${(decision.simResult?.expectedValue ?? 0).toFixed(2)}
- Actual net: $${(outcome.netResultUSD ?? 0).toFixed(2)}
- Result: ${result}
- Prediction accuracy: ${(outcome.predictionAccuracyPct ?? 0).toFixed(0)}%

Based on this ${outcome.wasProfit ? 'success' : 'failure'}, what concrete DeFi rule should be
added to the playbook? It must be actionable, specific, and help repeat this success or
avoid this mistake.

Respond ONLY in valid JSON:
{
  "shouldAddRule": true or false,
  "ruleText": "the specific actionable rule",
  "category": "risk" or "gas" or "strategy",
  "reason": "why this rule would help"
}`

  return { systemPrompt, userPrompt }
}

/**
 * Ask the model for a new rule given a decision's outcome. Returns the parsed insight
 * `{ shouldAddRule, ruleText, category, reason }`, or null on any failure (network or bad
 * JSON) so the Reflector degrades gracefully.
 * @param {object} decision
 * @param {object} outcome
 * @param {(p:{systemPrompt:string,userPrompt:string})=>Promise<string>} aiComplete
 * @returns {Promise<object|null>}
 */
export async function extractInsightFromFailure(decision, outcome, aiComplete) {
  const prompt = buildFailureInsightPrompt(decision, outcome)
  try {
    const raw = await aiComplete(prompt)
    return JSON.parse(raw)
  } catch {
    return null
  }
}
