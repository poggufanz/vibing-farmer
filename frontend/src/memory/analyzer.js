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

/**
 * Greedy single-pass clustering by Jaccard text similarity. Each rule joins the first
 * cluster whose seed (cluster[0]) it is at least `threshold`-similar to; otherwise it seeds
 * a new cluster. Reuses the curator tokenizer/jaccard so dedup is consistent across the module.
 * @param {Array<{text:string}>} rules  rules of ONE category
 * @param {number} threshold  0..1 similarity cutoff
 * @returns {Array<Array>} clusters (each a non-empty array of rules)
 */
export function findSimilarClusters(rules, threshold) {
  const used = new Set()
  const clusters = []

  for (let i = 0; i < (rules ?? []).length; i++) {
    if (used.has(i)) continue
    const cluster = [rules[i]]
    used.add(i)
    const seedTokens = tokenize(rules[i].text)

    for (let j = i + 1; j < rules.length; j++) {
      if (used.has(j)) continue
      if (jaccardSimilarity(seedTokens, tokenize(rules[j].text)) >= threshold) {
        cluster.push(rules[j])
        used.add(j)
      }
    }

    clusters.push(cluster)
  }

  return clusters
}

/**
 * Sum helpful/harmful across a cluster (ACE: merging must preserve empirical evidence).
 * @param {Array<{helpful?:number, harmful?:number}>} cluster
 * @returns {{helpful:number, harmful:number}}
 */
export function sumCounters(cluster) {
  return cluster.reduce(
    (acc, r) => ({ helpful: acc.helpful + (r.helpful ?? 0), harmful: acc.harmful + (r.harmful ?? 0) }),
    { helpful: 0, harmful: 0 },
  )
}

/**
 * Build the { systemPrompt, userPrompt } pair asking the model to merge a cluster of
 * similar rules into one. Pure: no AI call here (mirrors reflector.buildFailureInsightPrompt).
 * @param {Array<{id:string, helpful?:number, harmful?:number, text:string}>} cluster
 * @returns {{systemPrompt:string, userPrompt:string}}
 */
export function buildMergePrompt(cluster) {
  const systemPrompt =
    'You are a DeFi rule consolidator. Merge similar rules into one. Output ONLY valid JSON. No explanation.'

  const lines = cluster
    .map(r => `[${r.id}] helpful=${r.helpful ?? 0} harmful=${r.harmful ?? 0} :: ${r.text}`)
    .join('\n')

  const userPrompt = `These DeFi strategy rules cover similar ground and should be merged into one comprehensive rule:

${lines}

Merge them into a single, precise, actionable rule that captures all key insights.
Keep it under 30 words. Be specific.

Respond ONLY in valid JSON:
{
  "mergedRule": "the merged rule text"
}`

  return { systemPrompt, userPrompt }
}
