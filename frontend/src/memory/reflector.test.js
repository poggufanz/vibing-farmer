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
