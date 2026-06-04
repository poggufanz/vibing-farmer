import { describe, it, expect } from 'vitest'
import { tokenize, jaccardSimilarity, findSimilarRule, isValidInsight, buildRuleFromInsight, runCurator, createCurator } from './curator.js'

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

const NOW = () => 1000
const SILENT = { log() {}, error() {} }

describe('runCurator', () => {
  const seed = () => ([
    { id: 'defi-001', category: 'risk', helpful: 0, harmful: 0, text: 'Avoid entering pools when total value locked drops sharply within three days' },
    { id: 'defi-002', category: 'gas', helpful: 1, harmful: 0, text: 'Keep breakeven period under thirty days otherwise skip' },
  ])
  const decision = { id: 'dec-1' }

  it('returns the playbook unchanged for an invalid insight', async () => {
    const pb = seed()
    const next = await runCurator({ ruleText: 'no' }, decision, pb, { now: NOW, logger: SILENT })
    expect(next).toEqual(pb)
  })

  it('ADDs a new rule when nothing similar exists', async () => {
    const next = await runCurator(
      { ruleText: 'Stake governance tokens before the weekly snapshot to capture rewards', category: 'strategy', reason: 'missed rewards' },
      decision, seed(), { now: NOW, logger: SILENT },
    )
    expect(next).toHaveLength(3)
    const added = next.find(r => r.id === 'defi-003')
    expect(added.text).toContain('Stake governance tokens')
    expect(added.sourceDecision).toBe('dec-1')
  })

  it('reinforces an existing similar rule (helpful++) instead of adding a duplicate', async () => {
    const next = await runCurator(
      { ruleText: 'Keep breakeven period under thirty days otherwise skip', category: 'gas' },
      decision, seed(), { now: NOW, logger: SILENT },
    )
    expect(next).toHaveLength(2) // no new rule
    expect(next.find(r => r.id === 'defi-002').helpful).toBe(2) // 1 → 2
  })

  it('does not mutate the input playbook', async () => {
    const pb = seed()
    await runCurator(
      { ruleText: 'A brand new actionable strategy rule about diversification', category: 'strategy' },
      decision, pb, { now: NOW, logger: SILENT },
    )
    expect(pb).toHaveLength(2)
  })

  it('never saves — persistence is the Reflector\'s job (no store in deps)', async () => {
    // Smoke: runCurator takes no store and returns an array; the absence of a save dep is the contract.
    const next = await runCurator(
      { ruleText: 'Another fresh unique rule worth keeping around' },
      decision, seed(), { now: NOW, logger: SILENT },
    )
    expect(Array.isArray(next)).toBe(true)
  })

  it('runs the analyzer only when playbook exceeds maxSize after the ADD', async () => {
    let analyzerCalls = 0
    const analyzer = async (pb) => { analyzerCalls++; return pb.slice(0, 1) }

    // maxSize 2: seed has 2, ADD makes 3 > 2 → analyzer fires.
    const next = await runCurator(
      { ruleText: 'Yet another unique rule that should push us over the size cap', category: 'risk' },
      decision, seed(), { now: NOW, logger: SILENT, analyzer, maxSize: 2 },
    )
    expect(analyzerCalls).toBe(1)
    expect(next).toHaveLength(1) // analyzer collapsed it
  })

  it('skips the analyzer when none is injected even if oversized', async () => {
    const next = await runCurator(
      { ruleText: 'A unique rule with no analyzer available to dedup it', category: 'risk' },
      decision, seed(), { now: NOW, logger: SILENT, maxSize: 2 },
    )
    expect(next).toHaveLength(3) // grew, no merge — Step 12 ships without Step 13
  })

  it('does NOT run the analyzer on a reinforcement (size did not grow)', async () => {
    let analyzerCalls = 0
    const analyzer = async (pb) => { analyzerCalls++; return pb }
    await runCurator(
      { ruleText: 'Keep breakeven period under thirty days otherwise skip', category: 'gas' },
      decision, seed(), { now: NOW, logger: SILENT, analyzer, maxSize: 1 },
    )
    expect(analyzerCalls).toBe(0)
  })
})

describe('createCurator', () => {
  it('returns a 3-arg curator(insight, decision, playbook) matching the Reflector contract', () => {
    const curate = createCurator({ now: () => 0, logger: { log() {}, error() {} } })
    expect(typeof curate).toBe('function')
    expect(curate.length).toBe(3) // (insight, decision, playbook) — matches reflector.js call site
  })

  it('evolves the playbook through the bound deps', async () => {
    const curate = createCurator({ now: () => 7, logger: { log() {}, error() {} } })
    const next = await curate(
      { ruleText: 'Prefer audited protocols for positions above ten thousand dollars', category: 'risk' },
      { id: 'dec-9' },
      [{ id: 'defi-001', category: 'gas', helpful: 0, harmful: 0, text: 'unrelated breakeven note' }],
    )
    expect(next).toHaveLength(2)
    expect(next[1].sourceDecision).toBe('dec-9')
    expect(next[1].createdAt).toBe(7)
  })

  it('threads an injected analyzer through to oversized playbooks', async () => {
    let hit = false
    const analyzer = async (pb) => { hit = true; return pb }
    const curate = createCurator({ now: () => 0, maxSize: 0, analyzer, logger: { log() {}, error() {} } })
    await curate({ ruleText: 'Any unique rule that triggers the size cap' }, { id: 'd' }, [])
    expect(hit).toBe(true)
  })
})
