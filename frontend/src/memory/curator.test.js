import { describe, it, expect } from 'vitest'
import { tokenize, jaccardSimilarity } from './curator.js'

describe('tokenize', () => {
  it('lowercases, strips punctuation, drops words of length <= 3', () => {
    const set = tokenize('Avoid TVL drop >20% in pools!')
    expect(set.has('avoid')).toBe(true)
    expect(set.has('pools')).toBe(true)
    expect(set.has('drop')).toBe(true)
    expect(set.has('in')).toBe(false)   // length 2, dropped
    expect(set.has('tvl')).toBe(false)  // length 3, dropped
  })

  it('returns a Set (deduped words)', () => {
    const set = tokenize('gas gas gas budget')
    expect(set instanceof Set).toBe(true)
    expect(set.size).toBe(1) // 'budget' only ('gas' is length 3, dropped same as 'tvl')
  })
})

describe('jaccardSimilarity', () => {
  it('returns 1 for identical sets', () => {
    expect(jaccardSimilarity(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1)
  })

  it('returns 0 for disjoint sets', () => {
    expect(jaccardSimilarity(new Set(['a']), new Set(['b']))).toBe(0)
  })

  it('returns intersection/union for partial overlap', () => {
    // {a,b,c} vs {b,c,d} → intersection 2, union 4 → 0.5
    expect(jaccardSimilarity(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd']))).toBe(0.5)
  })

  it('returns 0 when both sets are empty (no divide-by-zero)', () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0)
  })
})
