import { describe, it, expect } from 'vitest'
import { groupByCategory, findSimilarClusters } from './analyzer.js'

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
