import { generateRuleId, incrementCounter } from './playbook.js'

/**
 * Lowercase → strip non-alphanumerics → split on whitespace → keep words longer than 3 chars.
 * Returns a Set so callers can run set algebra directly. Mirrors the Step 13 analyzer tokenizer
 * (exported here so the analyzer can reuse it later — single source of truth).
 * @param {string} text
 * @returns {Set<string>}
 */
export function tokenize(text) {
  return new Set(
    (text ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3),
  )
}

/**
 * Jaccard index: |A ∩ B| / |A ∪ B|. Returns 0 for two empty sets (avoids 0/0).
 * @param {Set<string>} setA
 * @param {Set<string>} setB
 * @returns {number} 0..1
 */
export function jaccardSimilarity(setA, setB) {
  const intersection = new Set([...setA].filter(w => setB.has(w)))
  const union = new Set([...setA, ...setB])
  return union.size === 0 ? 0 : intersection.size / union.size
}

/**
 * First playbook rule whose text is at least `threshold` Jaccard-similar to `newText`,
 * or null. Default 0.65 matches the build-guide dedup cutoff.
 * @param {string} newText
 * @param {Array<{id:string,text:string}>} playbook
 * @param {number} [threshold]
 * @returns {object|null}
 */
export function findSimilarRule(newText, playbook, threshold = 0.65) {
  const newWords = tokenize(newText)
  for (const rule of playbook ?? []) {
    if (jaccardSimilarity(newWords, tokenize(rule.text)) >= threshold) return rule
  }
  return null
}

const MIN_RULE_TEXT_LENGTH = 10

/**
 * True only when the insight carries a string ruleText of at least 10 trimmed chars.
 * Guards the ADD path so blank / junk insights are no-ops.
 * @param {{ruleText?:unknown}|null} insight
 * @returns {boolean}
 */
export function isValidInsight(insight) {
  const text = insight?.ruleText
  return typeof text === 'string' && text.trim().length >= MIN_RULE_TEXT_LENGTH
}

const VALID_CATEGORIES = ['risk', 'gas', 'strategy']

/**
 * Construct a fresh, zero-counter playbook rule from an insight. Pure — caller appends it.
 * @param {{ruleText:string, category?:string, reason?:string}} insight
 * @param {Array} playbook       used only to pick the next free id
 * @param {{id?:string}|null} decision  provenance (sourceDecision)
 * @param {() => number} now      injected clock
 * @returns {object} new rule
 */
export function buildRuleFromInsight(insight, playbook, decision, now) {
  const category = VALID_CATEGORIES.includes(insight.category) ? insight.category : 'strategy'
  return {
    id: generateRuleId(playbook),
    category,
    helpful: 0,
    harmful: 0,
    text: insight.ruleText.trim(),
    createdAt: now(),
    sourceDecision: decision?.id ?? null,
    addedReason: insight.reason ?? null,
  }
}

const DEFAULT_MAX_PLAYBOOK_SIZE = 50

/**
 * Curate one insight into the playbook (ACE ADD). Pure w.r.t. persistence — returns the next
 * playbook array and NEVER saves; the Reflector persists once at the end of its run.
 *
 *  1. Invalid insight        → return playbook unchanged.
 *  2. Similar rule exists     → reinforce it (helpful++), return (no duplicate ADD).
 *  3. Otherwise               → append a fresh zero-counter rule.
 *  4. If the result exceeds maxSize AND an analyzer is injected → run the Step 13 dedup-merge.
 *
 * @param {{ruleText:string, category?:string, reason?:string}} insight
 * @param {{id?:string}|null} decision  provenance
 * @param {Array} playbook
 * @param {object} [deps]
 * @param {(pb:Array)=>Promise<Array>} [deps.analyzer]  Step 13 BulletpointAnalyzer (optional)
 * @param {() => number} [deps.now]
 * @param {number} [deps.maxSize]
 * @param {{log?:Function,error?:Function}} [deps.logger]
 * @returns {Promise<Array>} the next playbook
 */
export async function runCurator(insight, decision, playbook, deps = {}) {
  const { analyzer, now = () => Date.now(), maxSize = DEFAULT_MAX_PLAYBOOK_SIZE, logger = console } = deps
  const pb = playbook ?? []

  if (!isValidInsight(insight)) return pb

  const existing = findSimilarRule(insight.ruleText, pb)
  if (existing) {
    logger.log?.(`[curator] similar rule [${existing.id}] — reinforcing instead of adding`)
    return incrementCounter(pb, existing.id, 'helpful')
  }

  const rule = buildRuleFromInsight(insight, pb, decision, now)
  let next = [...pb, rule]
  logger.log?.(`[curator] added [${rule.id}] (${rule.category}): ${rule.text}`)

  if (next.length > maxSize && analyzer) {
    logger.log?.(`[curator] size ${next.length} > ${maxSize} — running analyzer dedup`)
    next = await analyzer(next)
  }

  return next
}

/**
 * Bind curator deps once and return the `(insight, decision, playbook) => Promise<Array>`
 * function that createReflector injects (reflector.js:181) and calls (reflector.js:136,147).
 *
 * The Step 13 analyzer stays optional: omit it until BulletpointAnalyzer is wired in main.js,
 * and oversized-playbook merges are simply skipped.
 *
 * @param {object} [deps]
 * @param {(pb:Array)=>Promise<Array>} [deps.analyzer]  Step 13 (optional)
 * @param {() => number} [deps.now]
 * @param {number} [deps.maxSize]
 * @param {object} [deps.logger]
 * @returns {(insight:object, decision:object, playbook:Array)=>Promise<Array>}
 */
export function createCurator(deps = {}) {
  const { analyzer, now, maxSize, logger } = deps
  return (insight, decision, playbook) =>
    runCurator(insight, decision, playbook, { analyzer, now, maxSize, logger })
}
