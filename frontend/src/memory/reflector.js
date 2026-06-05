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

// ─── Orchestrator (injected I/O — runs after the outcome tracker) ────────────────

/**
 * Reflect on one evaluated decision. Loads the playbook once, tags cited rules, optionally
 * routes council-flagged + failure-extracted insights to the Curator (Step 12), prunes
 * net-harmful rules, then saves once. Never throws — AI failures degrade to null insights.
 *
 * @param {object} decision  evaluated decision-log entry (executor.buildExecuteEntry shape)
 * @param {object} outcome   { actualYieldUSD, netResultUSD, wasProfit, predictionAccuracyPct }
 * @param {object} deps
 * @param {{load:Function, save:Function}} deps.playbookStore  from createPlaybookStore()
 * @param {(p:{systemPrompt:string,userPrompt:string})=>Promise<string>} deps.aiComplete
 * @param {(insight:object, decision:object, playbook:Array)=>Promise<Array>} [deps.curator]  Step 12 (optional)
 * @param {number} [deps.minAccuracyPct]
 * @param {{log?:Function,error?:Function}} [deps.logger]
 * @returns {Promise<Array>} the evolved playbook
 */
export async function runReflector(decision, outcome, deps) {
  const { playbookStore, aiComplete, curator, minAccuracyPct, logger = console } = deps

  let playbook = playbookStore.load()

  // 1. Counter layer — tag every cited rule (deduped) by outcome.
  const citedRules = dedupeCitedRules(decision.citedRules)
  playbook = tagRulesByOutcome(playbook, citedRules, outcome.wasProfit)
  logger.log?.(`[reflector] ${decision.id}: tagged ${citedRules.length} rules ${outcome.wasProfit ? 'helpful' : 'harmful'}`)

  // 2. Council-flagged insights captured during deliberation → Curator ADD.
  if (curator) {
    for (const ruleText of decision.councilInsights ?? []) {
      if (!ruleText) continue
      playbook = await curator(
        { ruleText, category: 'strategy', reason: 'council flagged during deliberation' },
        decision,
        playbook,
      )
    }

    // 3. Extract a new rule from a loss or a badly-mispredicted profit → Curator ADD.
    if (shouldLearnFromOutcome(outcome, minAccuracyPct)) {
      const insight = await extractInsightFromFailure(decision, outcome, aiComplete)
      if (insight?.shouldAddRule) {
        playbook = await curator(insight, decision, playbook)
      }
    }
  }

  // 4. Prune consistently-harmful rules, then persist once.
  playbook = pruneHarmfulRules(playbook)
  playbookStore.save(playbook)
  logger.log?.(`[reflector] ${decision.id}: playbook now ${playbook.length} rules`)

  return playbook
}

// ─── Default AI path + factory ───────────────────────────────────────────────────

// Lazy-import venice so pure-function tests never load its module graph (council.js pattern).
const defaultAiComplete = async (p) => {
  const { completeJSON } = await import('../venice.js')
  return completeJSON(p)
}

/**
 * Bind real deps once and return the `reflector(decision, outcome)` function that
 * createOutcomeEvaluator (Step 10) injects and calls (outcomeTracker.js:245).
 *
 * @param {object} deps
 * @param {{load:Function, save:Function}} deps.playbookStore  required — createPlaybookStore()
 * @param {Function} [deps.aiComplete]   default: venice completeJSON (lazy)
 * @param {Function} [deps.curator]      Step 12 (optional until wired)
 * @param {number} [deps.minAccuracyPct]
 * @param {object} [deps.logger]
 * @returns {(decision:object, outcome:object)=>Promise<Array>}
 */
export function createReflector(deps) {
  const { playbookStore, aiComplete = defaultAiComplete, curator, minAccuracyPct, logger } = deps
  return (decision, outcome) =>
    runReflector(decision, outcome, { playbookStore, aiComplete, curator, minAccuracyPct, logger })
}
