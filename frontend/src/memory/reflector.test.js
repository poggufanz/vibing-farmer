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

import { extractInsightFromFailure } from './reflector.js'

describe('extractInsightFromFailure', () => {
  const decision = { toVault: '0xV', citedRules: ['defi-001'], councilVerdicts: [], simResult: { expectedValue: 10 } }
  const outcome = { netResultUSD: -5, wasProfit: false, predictionAccuracyPct: 0 }

  it('parses the AI JSON into an insight object', async () => {
    const aiComplete = async () => JSON.stringify({
      shouldAddRule: true, ruleText: 'Avoid vault X under high gas', category: 'gas', reason: 'lost money',
    })
    const insight = await extractInsightFromFailure(decision, outcome, aiComplete)
    expect(insight.shouldAddRule).toBe(true)
    expect(insight.ruleText).toContain('Avoid vault X')
    expect(insight.category).toBe('gas')
  })

  it('passes the built prompt through to aiComplete', async () => {
    let received = null
    const aiComplete = async (p) => { received = p; return '{"shouldAddRule":false}' }
    await extractInsightFromFailure(decision, outcome, aiComplete)
    expect(received.systemPrompt).toMatch(/JSON/)
    expect(received.userPrompt).toContain('0xV')
  })

  it('returns null when the AI call throws', async () => {
    const aiComplete = async () => { throw new Error('network down') }
    expect(await extractInsightFromFailure(decision, outcome, aiComplete)).toBeNull()
  })

  it('returns null when the AI returns invalid JSON', async () => {
    const aiComplete = async () => 'not json'
    expect(await extractInsightFromFailure(decision, outcome, aiComplete)).toBeNull()
  })
})

import { runReflector } from './reflector.js'

// In-memory playbook store matching createPlaybookStore's load()/save() surface.
const fakeStore = (seed) => {
  let rules = seed
  return { load: () => rules, save: (r) => { rules = r }, snapshot: () => rules }
}

const baseDecision = {
  id: 'dec-1',
  toVault: '0xV',
  citedRules: ['defi-001', 'defi-001', 'defi-002'], // dup on purpose
  councilInsights: [],
  councilVerdicts: [],
  simResult: { expectedValue: 10 },
}

describe('runReflector', () => {
  const seed = () => ([
    { id: 'defi-001', category: 'risk', helpful: 0, harmful: 0, text: 'a' },
    { id: 'defi-002', category: 'gas', helpful: 0, harmful: 0, text: 'b' },
  ])

  it('tags cited rules helpful on profit and persists once (deduped)', async () => {
    const store = fakeStore(seed())
    const pb = await runReflector(
      baseDecision,
      { wasProfit: true, netResultUSD: 5, predictionAccuracyPct: 90 },
      { playbookStore: store, aiComplete: async () => '{}', logger: { log() {}, error() {} } },
    )
    expect(pb.find(r => r.id === 'defi-001').helpful).toBe(1) // deduped: bumped once, not twice
    expect(pb.find(r => r.id === 'defi-002').helpful).toBe(1)
    expect(store.snapshot().find(r => r.id === 'defi-001').helpful).toBe(1)
  })

  it('tags cited rules harmful on a loss', async () => {
    const store = fakeStore(seed())
    const pb = await runReflector(
      baseDecision,
      { wasProfit: false, netResultUSD: -5, predictionAccuracyPct: 0 },
      { playbookStore: store, aiComplete: async () => '{"shouldAddRule":false}', logger: { log() {}, error() {} } },
    )
    expect(pb.find(r => r.id === 'defi-001').harmful).toBe(1)
  })

  it('routes a failure-extracted rule to the curator', async () => {
    const store = fakeStore(seed())
    const curatorCalls = []
    const curator = async (insight, decision, playbook) => {
      curatorCalls.push(insight)
      return [...playbook, { id: 'defi-009', category: insight.category, helpful: 0, harmful: 0, text: insight.ruleText }]
    }
    const aiComplete = async () => JSON.stringify({ shouldAddRule: true, ruleText: 'new rule', category: 'risk', reason: 'x' })

    const pb = await runReflector(
      baseDecision,
      { wasProfit: false, netResultUSD: -5, predictionAccuracyPct: 0 },
      { playbookStore: store, aiComplete, curator, logger: { log() {}, error() {} } },
    )
    expect(curatorCalls).toHaveLength(1)
    expect(pb.some(r => r.id === 'defi-009')).toBe(true)
  })

  it('routes council-flagged insights to the curator', async () => {
    const store = fakeStore(seed())
    const seen = []
    const curator = async (insight, decision, playbook) => { seen.push(insight.ruleText); return playbook }
    await runReflector(
      { ...baseDecision, councilInsights: ['council idea A'] },
      { wasProfit: true, netResultUSD: 5, predictionAccuracyPct: 90 },
      { playbookStore: store, aiComplete: async () => '{}', curator, logger: { log() {}, error() {} } },
    )
    expect(seen).toContain('council idea A')
  })

  it('does NOT call the AI or curator on a profitable, well-predicted decision with no council insights', async () => {
    const store = fakeStore(seed())
    let aiCalled = false
    const curator = async (_i, _d, pb) => pb
    await runReflector(
      baseDecision,
      { wasProfit: true, netResultUSD: 5, predictionAccuracyPct: 90 },
      { playbookStore: store, aiComplete: async () => { aiCalled = true; return '{}' }, curator, logger: { log() {}, error() {} } },
    )
    expect(aiCalled).toBe(false)
  })

  it('skips rule-adding when no curator is injected (counters + prune still run)', async () => {
    const store = fakeStore(seed())
    const pb = await runReflector(
      baseDecision,
      { wasProfit: false, netResultUSD: -5, predictionAccuracyPct: 0 },
      { playbookStore: store, aiComplete: async () => JSON.stringify({ shouldAddRule: true, ruleText: 'x', category: 'risk' }), logger: { log() {}, error() {} } },
    )
    expect(pb.find(r => r.id === 'defi-001').harmful).toBe(1) // still tagged
    expect(pb).toHaveLength(2) // nothing added without a curator
  })

  it('prunes consistently-harmful rules before saving', async () => {
    const store = fakeStore([
      { id: 'defi-001', category: 'risk', helpful: 1, harmful: 5, text: 'bad' },
      { id: 'defi-002', category: 'gas', helpful: 4, harmful: 0, text: 'good' },
    ])
    const pb = await runReflector(
      { ...baseDecision, citedRules: ['defi-001'] },
      { wasProfit: false, netResultUSD: -5, predictionAccuracyPct: 0 },
      { playbookStore: store, aiComplete: async () => '{"shouldAddRule":false}', logger: { log() {}, error() {} } },
    )
    expect(pb.map(r => r.id)).toEqual(['defi-002']) // defi-001 had 1 helpful / 6 harmful → pruned
  })
})

import { createReflector } from './reflector.js'

describe('createReflector', () => {
  const seed = () => ([{ id: 'defi-001', category: 'risk', helpful: 0, harmful: 0, text: 'a' }])

  it('returns a 2-arg reflector(decision, outcome) that evolves + persists the playbook', async () => {
    const store = fakeStore(seed())
    const reflect = createReflector({
      playbookStore: store,
      aiComplete: async () => '{"shouldAddRule":false}',
      logger: { log() {}, error() {} },
    })
    expect(typeof reflect).toBe('function')
    expect(reflect.length).toBe(2) // (decision, outcome) — matches outcomeTracker call site

    await reflect(
      { id: 'dec-1', toVault: '0xV', citedRules: ['defi-001'], councilInsights: [], simResult: { expectedValue: 10 } },
      { wasProfit: true, netResultUSD: 5, predictionAccuracyPct: 90 },
    )
    expect(store.snapshot().find(r => r.id === 'defi-001').helpful).toBe(1)
  })

  it('threads an injected curator through to ADD operations', async () => {
    const store = fakeStore(seed())
    let curatorHit = false
    const reflect = createReflector({
      playbookStore: store,
      aiComplete: async () => JSON.stringify({ shouldAddRule: true, ruleText: 'r', category: 'risk' }),
      curator: async (_i, _d, pb) => { curatorHit = true; return pb },
      logger: { log() {}, error() {} },
    })
    await reflect(
      { id: 'dec-2', toVault: '0xV', citedRules: [], councilInsights: [], simResult: { expectedValue: 10 } },
      { wasProfit: false, netResultUSD: -5, predictionAccuracyPct: 0 },
    )
    expect(curatorHit).toBe(true)
  })
})
