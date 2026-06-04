import { describe, it, expect } from 'vitest'
import { tokenize, jaccardSimilarity, findSimilarRule, isValidInsight, buildRuleFromInsight } from './curator.js'

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

describe('findSimilarRule', () => {
  const playbook = [
    { id: 'defi-001', text: 'Avoid entering pools when total value locked drops sharply within three days' },
    { id: 'defi-002', text: 'Breakeven period under thirty days otherwise skip rebalance' },
  ]

  it('returns the matching rule when similarity >= threshold', () => {
    const hit = findSimilarRule(
      'Avoid entering pools when total value locked drops sharply within three days',
      playbook,
    )
    expect(hit?.id).toBe('defi-001')
  })

  it('returns null when nothing is similar enough', () => {
    expect(findSimilarRule('Stake governance tokens before snapshot', playbook)).toBeNull()
  })

  it('respects a custom threshold', () => {
    // Loose threshold catches a partial overlap that the default 0.65 would miss.
    const hit = findSimilarRule('Avoid entering pools when locked value drops', playbook, 0.3)
    expect(hit?.id).toBe('defi-001')
  })

  it('returns null for an empty playbook', () => {
    expect(findSimilarRule('anything here', [])).toBeNull()
  })
})

describe('isValidInsight', () => {
  it('accepts an insight with a non-trivial ruleText', () => {
    expect(isValidInsight({ ruleText: 'Avoid low-TVL pools under volatility' })).toBe(true)
  })

  it('rejects missing / empty / too-short ruleText', () => {
    expect(isValidInsight(null)).toBe(false)
    expect(isValidInsight({})).toBe(false)
    expect(isValidInsight({ ruleText: '   ' })).toBe(false)
    expect(isValidInsight({ ruleText: 'too short' })).toBe(false) // < 10 chars after trim
  })

  it('rejects a non-string ruleText', () => {
    expect(isValidInsight({ ruleText: 42 })).toBe(false)
  })
})

describe('buildRuleFromInsight', () => {
  const playbook = [{ id: 'defi-001', text: 'a' }, { id: 'defi-004', text: 'b' }]
  const decision = { id: 'dec-42' }

  it('builds a zeroed rule with the next generated id and trimmed text', () => {
    const rule = buildRuleFromInsight(
      { ruleText: '  Cap exposure to one protocol at 60%  ', category: 'strategy', reason: 'over-concentrated' },
      playbook, decision, () => 1748387200000,
    )
    expect(rule.id).toBe('defi-005')          // max(1,4) + 1
    expect(rule.text).toBe('Cap exposure to one protocol at 60%') // trimmed
    expect(rule.category).toBe('strategy')
    expect(rule.helpful).toBe(0)
    expect(rule.harmful).toBe(0)
    expect(rule.createdAt).toBe(1748387200000)
    expect(rule.sourceDecision).toBe('dec-42')
    expect(rule.addedReason).toBe('over-concentrated')
  })

  it('defaults category to strategy and tolerates a missing decision/reason', () => {
    const rule = buildRuleFromInsight({ ruleText: 'Some actionable rule text' }, [], null, () => 0)
    expect(rule.category).toBe('strategy')
    expect(rule.id).toBe('defi-001')
    expect(rule.sourceDecision).toBeNull()
    expect(rule.addedReason).toBeNull()
  })
})
