import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PLAYBOOK,
  incrementCounter,
  pruneHarmfulRules,
  formatPlaybookForCouncil,
  generateRuleId,
} from './playbook.js'

describe('DEFAULT_PLAYBOOK', () => {
  it('seeds five categorized rules with zeroed counters', () => {
    expect(DEFAULT_PLAYBOOK).toHaveLength(5)
    for (const rule of DEFAULT_PLAYBOOK) {
      expect(rule.id).toMatch(/^defi-\d{3}$/)
      expect(['risk', 'gas', 'strategy']).toContain(rule.category)
      expect(rule.helpful).toBe(0)
      expect(rule.harmful).toBe(0)
      expect(typeof rule.text).toBe('string')
    }
  })

  it('uses unique ids', () => {
    const ids = DEFAULT_PLAYBOOK.map(r => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('incrementCounter', () => {
  const playbook = [
    { id: 'defi-001', category: 'risk', helpful: 1, harmful: 0, text: 'a' },
    { id: 'defi-002', category: 'gas', helpful: 0, harmful: 0, text: 'b' },
  ]

  it('immutably bumps the named counter on the matching rule only', () => {
    const next = incrementCounter(playbook, 'defi-001', 'helpful')
    expect(next[0].helpful).toBe(2)
    expect(next[1].helpful).toBe(0)
    expect(playbook[0].helpful).toBe(1) // original untouched
  })

  it('can bump the harmful counter', () => {
    const next = incrementCounter(playbook, 'defi-002', 'harmful')
    expect(next[1].harmful).toBe(1)
  })

  it('returns the list unchanged when no id matches', () => {
    expect(incrementCounter(playbook, 'zzz', 'helpful')).toEqual(playbook)
  })

  it('returns an empty array for undefined input', () => {
    expect(incrementCounter(undefined, 'defi-001', 'helpful')).toEqual([])
  })
})

describe('pruneHarmfulRules', () => {
  it('keeps rules with fewer than minEvals total evaluations', () => {
    const playbook = [{ id: 'defi-001', helpful: 0, harmful: 4, text: 'a' }] // 4 evals < 5
    expect(pruneHarmfulRules(playbook, 5)).toHaveLength(1)
  })

  it('prunes rules where harmful > helpful*2 once minEvals is reached', () => {
    const playbook = [
      { id: 'defi-001', helpful: 1, harmful: 5, text: 'bad' },  // 6 evals, 5 > 2 → prune
      { id: 'defi-002', helpful: 4, harmful: 2, text: 'good' }, // 6 evals, 2 < 8 → keep
    ]
    const pruned = pruneHarmfulRules(playbook, 5)
    expect(pruned.map(r => r.id)).toEqual(['defi-002'])
  })

  it('returns an empty array for undefined input', () => {
    expect(pruneHarmfulRules(undefined)).toEqual([])
  })
})

describe('formatPlaybookForCouncil', () => {
  it('returns a placeholder for an empty or missing playbook', () => {
    expect(formatPlaybookForCouncil([])).toBe('(no rules yet)')
    expect(formatPlaybookForCouncil(undefined)).toBe('(no rules yet)')
  })

  it('renders id, counters, and text for each rule', () => {
    const text = formatPlaybookForCouncil([
      { id: 'defi-001', category: 'risk', helpful: 3, harmful: 1, text: 'Avoid TVL drops >20%.' },
    ])
    expect(text).toContain('defi-001')
    expect(text).toContain('helpful=3')
    expect(text).toContain('harmful=1')
    expect(text).toContain('Avoid TVL drops >20%.')
  })

  it('sorts by net helpfulness (helpful - harmful) descending', () => {
    const text = formatPlaybookForCouncil([
      { id: 'defi-low', helpful: 0, harmful: 3, text: 'low' },
      { id: 'defi-high', helpful: 5, harmful: 0, text: 'high' },
    ])
    expect(text.indexOf('defi-high')).toBeLessThan(text.indexOf('defi-low'))
  })
})

describe('generateRuleId', () => {
  it('returns defi-001 for an empty playbook', () => {
    expect(generateRuleId([])).toBe('defi-001')
  })

  it('returns the next zero-padded id above the current max', () => {
    expect(generateRuleId([{ id: 'defi-001' }, { id: 'defi-009' }])).toBe('defi-010')
  })

  it('ignores ids that do not parse as defi-NNN', () => {
    expect(generateRuleId([{ id: 'defi-003' }, { id: 'merged-x' }])).toBe('defi-004')
  })
})

import { createPlaybookStore } from './playbook.js'

const memoryStorage = (seed = null) => {
  let data = seed
  return {
    read: () => data,
    write: (rules) => { data = rules },
    snapshot: () => data,
  }
}

describe('createPlaybookStore', () => {
  it('load() seeds DEFAULT_PLAYBOOK on first read and stamps createdAt with the clock', () => {
    const storage = memoryStorage(null)
    const store = createPlaybookStore({ storage, now: () => 1748387200000 })

    const loaded = store.load()

    expect(loaded).toHaveLength(5)
    expect(loaded.every(r => r.createdAt === 1748387200000)).toBe(true)
    expect(storage.snapshot()).toHaveLength(5)
  })

  it('load() returns the stored playbook without reseeding when one exists', () => {
    const stored = [{ id: 'defi-007', category: 'risk', helpful: 2, harmful: 0, text: 'x', createdAt: 1 }]
    const storage = memoryStorage(stored)
    const store = createPlaybookStore({ storage, now: () => 999 })
    expect(store.load()).toEqual(stored)
    expect(storage.snapshot()).toEqual(stored)
  })

  it('save() persists the given rules', () => {
    const storage = memoryStorage([])
    const store = createPlaybookStore({ storage, now: () => 1 })
    const rules = [{ id: 'defi-001', category: 'gas', helpful: 0, harmful: 0, text: 'r', createdAt: 1 }]
    store.save(rules)
    expect(storage.snapshot()).toEqual(rules)
  })

  it('increment() bumps a counter and writes the result back', () => {
    const storage = memoryStorage([
      { id: 'defi-001', category: 'risk', helpful: 0, harmful: 0, text: 'r', createdAt: 1 },
    ])
    const store = createPlaybookStore({ storage, now: () => 1 })
    store.increment('defi-001', 'helpful')
    expect(storage.snapshot()[0].helpful).toBe(1)
  })

  it('prune() removes net-harmful rules and writes the result back', () => {
    const storage = memoryStorage([
      { id: 'defi-001', helpful: 1, harmful: 5, text: 'bad', createdAt: 1 },
      { id: 'defi-002', helpful: 4, harmful: 0, text: 'good', createdAt: 1 },
    ])
    const store = createPlaybookStore({ storage, now: () => 1 })
    const remaining = store.prune(5)
    expect(remaining.map(r => r.id)).toEqual(['defi-002'])
    expect(storage.snapshot().map(r => r.id)).toEqual(['defi-002'])
  })

  it('all() returns the current stored rules (seeding if empty)', () => {
    const storage = memoryStorage(null)
    const store = createPlaybookStore({ storage, now: () => 5 })
    expect(store.all()).toHaveLength(5)
  })
})
