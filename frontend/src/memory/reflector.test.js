import { describe, it, expect } from 'vitest'
import { dedupeCitedRules, tagRulesByOutcome } from './reflector.js'

describe('dedupeCitedRules', () => {
  it('returns unique ids preserving first-seen order', () => {
    expect(dedupeCitedRules(['defi-001', 'defi-002', 'defi-001'])).toEqual(['defi-001', 'defi-002'])
  })

  it('returns an empty array for null/undefined input', () => {
    expect(dedupeCitedRules(undefined)).toEqual([])
    expect(dedupeCitedRules(null)).toEqual([])
  })
})

describe('tagRulesByOutcome', () => {
  const playbook = [
    { id: 'defi-001', category: 'risk', helpful: 0, harmful: 0, text: 'a' },
    { id: 'defi-002', category: 'gas', helpful: 1, harmful: 0, text: 'b' },
  ]

  it('bumps helpful on every cited rule when the outcome was profit', () => {
    const next = tagRulesByOutcome(playbook, ['defi-001', 'defi-002'], true)
    expect(next[0].helpful).toBe(1)
    expect(next[1].helpful).toBe(2)
    expect(next[0].harmful).toBe(0)
  })

  it('bumps harmful on every cited rule when the outcome was a loss', () => {
    const next = tagRulesByOutcome(playbook, ['defi-001'], false)
    expect(next[0].harmful).toBe(1)
    expect(next[1].harmful).toBe(0) // not cited
  })

  it('does not mutate the input playbook', () => {
    tagRulesByOutcome(playbook, ['defi-001'], true)
    expect(playbook[0].helpful).toBe(0)
  })

  it('ignores cited ids that are not in the playbook', () => {
    const next = tagRulesByOutcome(playbook, ['zzz'], true)
    expect(next).toEqual(playbook)
  })
})

import { shouldLearnFromOutcome, buildFailureInsightPrompt } from './reflector.js'

describe('shouldLearnFromOutcome', () => {
  it('learns when the decision was a loss, regardless of accuracy', () => {
    expect(shouldLearnFromOutcome({ wasProfit: false, predictionAccuracyPct: 95 })).toBe(true)
  })

  it('learns when the prediction was badly off even on a profit', () => {
    expect(shouldLearnFromOutcome({ wasProfit: true, predictionAccuracyPct: 20 })).toBe(true)
  })

  it('does not learn from a profitable, well-predicted decision', () => {
    expect(shouldLearnFromOutcome({ wasProfit: true, predictionAccuracyPct: 80 })).toBe(false)
  })

  it('respects a custom minAccuracyPct threshold', () => {
    expect(shouldLearnFromOutcome({ wasProfit: true, predictionAccuracyPct: 50 }, 60)).toBe(true)
    expect(shouldLearnFromOutcome({ wasProfit: true, predictionAccuracyPct: 50 }, 40)).toBe(false)
  })
})

describe('buildFailureInsightPrompt', () => {
  const decision = {
    toVault: '0xVaultB',
    citedRules: ['defi-001', 'defi-003'],
    councilVerdicts: [{ role: 'riskAuditor', decision: 'EXECUTE', keyReason: 'looked safe' }],
    simResult: { expectedValue: 42 },
  }
  const outcome = { netResultUSD: -8.5, wasProfit: false, predictionAccuracyPct: 0 }

  it('produces a systemPrompt and userPrompt', () => {
    const { systemPrompt, userPrompt } = buildFailureInsightPrompt(decision, outcome)
    expect(typeof systemPrompt).toBe('string')
    expect(systemPrompt).toMatch(/JSON/)
    expect(typeof userPrompt).toBe('string')
  })

  it('embeds the decision + outcome facts the model needs', () => {
    const { userPrompt } = buildFailureInsightPrompt(decision, outcome)
    expect(userPrompt).toContain('0xVaultB')
    expect(userPrompt).toContain('defi-001')
    expect(userPrompt).toContain('42')      // expected value
    expect(userPrompt).toContain('-8.5')    // actual net
    expect(userPrompt).toMatch(/LOSS/)
  })

  it('labels a profitable-but-mispredicted decision as a success to repeat', () => {
    const { userPrompt } = buildFailureInsightPrompt(decision, { ...outcome, wasProfit: true })
    expect(userPrompt).toMatch(/PROFITABLE/)
  })
})
