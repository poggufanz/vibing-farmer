import { describe, it, expect } from 'vitest'
import { groupByCategory, findSimilarClusters, sumCounters, buildMergePrompt, mergeRuleCluster } from './analyzer.js'

describe('groupByCategory', () => {
  it('buckets rules by their category field', () => {
    const rules = [
      { id: 'defi-001', category: 'risk', text: 'a' },
      { id: 'defi-002', category: 'gas', text: 'b' },
      { id: 'defi-003', category: 'risk', text: 'c' },
    ]
    const grouped = groupByCategory(rules)
    expect(Object.keys(grouped).sort()).toEqual(['gas', 'risk'])
    expect(grouped.risk.map(r => r.id)).toEqual(['defi-001', 'defi-003'])
    expect(grouped.gas.map(r => r.id)).toEqual(['defi-002'])
  })

  it('returns an empty object for an empty / nullish playbook', () => {
    expect(groupByCategory([])).toEqual({})
    expect(groupByCategory(null)).toEqual({})
  })
})

describe('findSimilarClusters', () => {
  it('groups near-duplicate rules into one cluster and leaves distinct rules alone', () => {
    const rules = [
      { id: 'defi-001', text: 'Avoid entering pools when total value locked drops sharply within three days' },
      { id: 'defi-002', text: 'Avoid entering pools when total value locked drops sharply within three days' },
      { id: 'defi-003', text: 'Stake governance tokens before the weekly snapshot to capture rewards' },
    ]
    const clusters = findSimilarClusters(rules, 0.6)
    // 001 + 002 merge (identical text); 003 stands alone.
    expect(clusters).toHaveLength(2)
    const big = clusters.find(c => c.length === 2)
    expect(big.map(r => r.id).sort()).toEqual(['defi-001', 'defi-002'])
    expect(clusters.find(c => c.length === 1)[0].id).toBe('defi-003')
  })

  it('returns one singleton cluster per rule when nothing is similar', () => {
    const rules = [
      { id: 'defi-001', text: 'Cap exposure to one protocol at sixty percent maximum' },
      { id: 'defi-002', text: 'Prefer audited vaults above ten thousand dollar positions' },
    ]
    const clusters = findSimilarClusters(rules, 0.6)
    expect(clusters).toHaveLength(2)
    expect(clusters.every(c => c.length === 1)).toBe(true)
  })

  it('returns an empty array for no rules', () => {
    expect(findSimilarClusters([], 0.6)).toEqual([])
  })
})

describe('sumCounters', () => {
  it('sums helpful and harmful across the cluster', () => {
    const cluster = [
      { id: 'a', helpful: 3, harmful: 1 },
      { id: 'b', helpful: 2, harmful: 0 },
    ]
    expect(sumCounters(cluster)).toEqual({ helpful: 5, harmful: 1 })
  })

  it('treats missing counters as zero', () => {
    const cluster = [{ id: 'a' }, { id: 'b', helpful: 4 }]
    expect(sumCounters(cluster)).toEqual({ helpful: 4, harmful: 0 })
  })
})

describe('buildMergePrompt', () => {
  const cluster = [
    { id: 'defi-001', helpful: 3, harmful: 1, text: 'Avoid pools with TVL dropping fast' },
    { id: 'defi-007', helpful: 2, harmful: 0, text: 'Skip pools when TVL is collapsing quickly' },
  ]

  it('returns a systemPrompt + userPrompt pair', () => {
    const { systemPrompt, userPrompt } = buildMergePrompt(cluster)
    expect(typeof systemPrompt).toBe('string')
    expect(typeof userPrompt).toBe('string')
  })

  it('demands JSON-only output and includes every rule text + id', () => {
    const { systemPrompt, userPrompt } = buildMergePrompt(cluster)
    expect(systemPrompt).toMatch(/ONLY valid JSON/i)
    expect(userPrompt).toContain('defi-001')
    expect(userPrompt).toContain('defi-007')
    expect(userPrompt).toContain('Avoid pools with TVL dropping fast')
    expect(userPrompt).toContain('Skip pools when TVL is collapsing quickly')
    expect(userPrompt).toContain('mergedRule') // shows the expected JSON shape
  })
})

describe('mergeRuleCluster', () => {
  const cluster = [
    { id: 'defi-001', category: 'risk', helpful: 3, harmful: 1, text: 'old text A', createdAt: 100 },
    { id: 'defi-007', category: 'risk', helpful: 2, harmful: 0, text: 'old text B', createdAt: 200 },
  ]

  it('merges via aiComplete, keeping oldest id+createdAt and summing counters', async () => {
    const aiComplete = async () => JSON.stringify({ mergedRule: 'One consolidated risk rule' })
    const merged = await mergeRuleCluster(cluster, { aiComplete, now: () => 999 })
    expect(merged.id).toBe('defi-001')         // oldest id retained
    expect(merged.createdAt).toBe(100)         // oldest createdAt retained
    expect(merged.category).toBe('risk')
    expect(merged.text).toBe('One consolidated risk rule')
    expect(merged.helpful).toBe(5)             // 3 + 2
    expect(merged.harmful).toBe(1)             // 1 + 0
    expect(merged.mergedFrom).toEqual(['defi-001', 'defi-007'])
    expect(merged.mergedAt).toBe(999)
  })

  it('falls back to the highest net-helpfulness rule when the AI call throws', async () => {
    const aiComplete = async () => { throw new Error('network down') }
    const merged = await mergeRuleCluster(cluster, { aiComplete, now: () => 999, logger: { error() {} } })
    // net helpfulness: 001 = 3-1 = 2, 007 = 2-0 = 2 → tie → first wins (001).
    expect(merged.id).toBe('defi-001')
    expect(merged.mergedFrom).toBeUndefined() // fallback returns an untouched original rule
  })

  it('falls back when the AI returns unparseable JSON', async () => {
    const aiComplete = async () => 'not json at all'
    const merged = await mergeRuleCluster(cluster, { aiComplete, now: () => 1, logger: { error() {} } })
    expect(merged.id).toBe('defi-001')
  })
})
