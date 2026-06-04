import { tokenize, jaccardSimilarity } from './curator.js'

/**
 * Bucket playbook rules by their `category` field. Tolerates null/undefined.
 * @param {Array<{category?:string}>|null} rules
 * @returns {Record<string, Array>}
 */
export function groupByCategory(rules) {
  return (rules ?? []).reduce((acc, rule) => {
    const key = rule.category ?? 'strategy'
    ;(acc[key] ??= []).push(rule)
    return acc
  }, {})
}
