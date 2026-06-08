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

/**
 * Merge a multi-rule cluster into one rule. Keeps the oldest id + createdAt, sums counters,
 * records provenance (mergedFrom/mergedAt). On any AI or parse failure, returns the cluster's
 * highest net-helpfulness rule unchanged (graceful degradation — never throws).
 * @param {Array} cluster  length >= 2
 * @param {object} deps
 * @param {(p:{systemPrompt:string,userPrompt:string})=>Promise<string>} deps.aiComplete
 * @param {() => number} deps.now
 * @param {{error?:Function}} [deps.logger]
 * @returns {Promise<object>} the merged (or best-fallback) rule
 */
const DEFAULT_THRESHOLD = 0.6

export async function mergeRuleCluster(cluster, deps) {
  const { aiComplete, now, logger = console } = deps
  const oldest = cluster[0]
  const { helpful, harmful } = sumCounters(cluster)

  try {
    const raw = await aiComplete(buildMergePrompt(cluster))
    const { mergedRule } = JSON.parse(raw)
    if (!mergedRule || typeof mergedRule !== 'string') throw new Error('no mergedRule')

    return {
      id: oldest.id,
      category: oldest.category,
      helpful,
      harmful,
      text: mergedRule.trim(),
      createdAt: oldest.createdAt,
      mergedFrom: cluster.map(r => r.id),
      mergedAt: now(),
    }
  } catch (err) {
    logger.error?.(`[analyzer] merge failed (${err.message}) — keeping best rule`)
    return [...cluster].sort(
      (a, b) => ((b.helpful ?? 0) - (b.harmful ?? 0)) - ((a.helpful ?? 0) - (a.harmful ?? 0)),
    )[0]
  }
}

/**
 * BulletpointAnalyzer (ACE Step 13). Group by category → cluster near-duplicates by Jaccard
 * → merge each multi-rule cluster via the model (counters summed). Singletons pass through
 * untouched. Pure w.r.t. persistence: returns the next playbook, never saves.
 * @param {Array} playbook
 * @param {object} deps
 * @param {(p:{systemPrompt:string,userPrompt:string})=>Promise<string>} deps.aiComplete
 * @param {() => number} [deps.now]
 * @param {number} [deps.threshold]
 * @param {{log?:Function,error?:Function}} [deps.logger]
 * @returns {Promise<Array>} the consolidated playbook
 */
export async function runBulletpointAnalyzer(playbook, deps) {
  const { aiComplete, now = () => Date.now(), threshold = DEFAULT_THRESHOLD, logger = console } = deps
  const pb = playbook ?? []
  logger.log?.(`[analyzer] running on ${pb.length} rules (threshold ${threshold})`)

  const byCategory = groupByCategory(pb)
  const result = []

  for (const [category, rules] of Object.entries(byCategory)) {
    const clusters = findSimilarClusters(rules, threshold)
    logger.log?.(`[analyzer] ${category}: ${rules.length} rules → ${clusters.length} clusters`)

    for (const cluster of clusters) {
      if (cluster.length === 1) {
        result.push(cluster[0])
        continue
      }
      const merged = await mergeRuleCluster(cluster, { aiComplete, now, logger })
      result.push(merged)
      logger.log?.(`[analyzer] merged [${cluster.map(r => r.id).join(', ')}] → [${merged.id}]`)
    }
  }

  logger.log?.(`[analyzer] ${pb.length} → ${result.length} rules`)
  return result
}

// Lazy-import venice so pure-function tests never load its module graph (reflector.js pattern).
const defaultAiComplete = async (p) => {
  const { completeJSON } = await import('../venice.js')
  return completeJSON(p)
}

/**
 * Bind analyzer deps once and return the single-arg `analyzer(playbook) => Promise<Array>`
 * that createCurator threads in as `deps.analyzer` (curator.js:124 `await analyzer(next)`).
 * @param {object} [deps]
 * @param {Function} [deps.aiComplete]  default: venice completeJSON (lazy)
 * @param {() => number} [deps.now]
 * @param {number} [deps.threshold]
 * @param {object} [deps.logger]
 * @returns {(playbook:Array)=>Promise<Array>}
 */
export function createAnalyzer(deps = {}) {
  const { aiComplete = defaultAiComplete, now, threshold, logger, onMemoryEvent } = deps
  return async (playbook) => {
    const before = playbook?.length ?? 0
    const result = await runBulletpointAnalyzer(playbook, { aiComplete, now, threshold, logger })
    onMemoryEvent?.({ stage: 'bullet', payload: { merged: Math.max(0, before - result.length) } })
    return result
  }
}
