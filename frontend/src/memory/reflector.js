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
