import { describe, it, expect } from 'vitest'
import {
  filterPendingDecisions,
  applyDecisionUpdate,
  generateDecisionId,
  createDecisionLog,
  hoursSinceLastRebalance,
} from './logger.js'

const DAY = 86_400_000

// In-memory storage fake matching the { read, write } adapter contract.
// vitest runs in node — there is no localStorage, so we always inject this.
const memoryStorage = (seed = []) => {
  let data = [...seed]
  return {
    read: () => data,
    write: (entries) => { data = entries },
    snapshot: () => data,
  }
}

describe('filterPendingDecisions', () => {
  const now = 10 * DAY

  it('returns only pending_evaluation entries older than the cutoff', () => {
    const decisions = [
      { id: 'a', status: 'pending_evaluation', timestamp: 1 * DAY },  // old + pending → keep
      { id: 'b', status: 'pending_evaluation', timestamp: 9.9 * DAY }, // too recent → drop
      { id: 'c', status: 'evaluated',          timestamp: 1 * DAY },  // not pending → drop
      { id: 'd', status: 'completed',          timestamp: 1 * DAY },  // hold → drop
    ]
    const pending = filterPendingDecisions(decisions, 7, now)
    expect(pending.map(d => d.id)).toEqual(['a'])
  })

  it('returns an empty array for undefined input', () => {
    expect(filterPendingDecisions(undefined, 7, now)).toEqual([])
  })

  it('uses the cutoff exactly: timestamp must be strictly less than now - days', () => {
    const cutoffTs = now - 7 * DAY
    const decisions = [{ id: 'edge', status: 'pending_evaluation', timestamp: cutoffTs }]
    expect(filterPendingDecisions(decisions, 7, now)).toEqual([]) // not strictly older
  })
})

describe('applyDecisionUpdate', () => {
  it('immutably merges updates into the matching decision only', () => {
    const decisions = [
      { id: 'a', status: 'pending_evaluation', amountUSD: 100 },
      { id: 'b', status: 'pending_evaluation', amountUSD: 200 },
    ]
    const updated = applyDecisionUpdate(decisions, 'a', { status: 'evaluated', wasProfit: true })
    expect(updated[0]).toEqual({ id: 'a', status: 'evaluated', amountUSD: 100, wasProfit: true })
    expect(updated[1]).toEqual({ id: 'b', status: 'pending_evaluation', amountUSD: 200 })
    expect(decisions[0].status).toBe('pending_evaluation') // original untouched (immutable)
  })

  it('returns the list unchanged when no id matches', () => {
    const decisions = [{ id: 'a', status: 'pending_evaluation' }]
    expect(applyDecisionUpdate(decisions, 'zzz', { status: 'evaluated' })).toEqual(decisions)
  })

  it('returns an empty array for undefined input', () => {
    expect(applyDecisionUpdate(undefined, 'a', {})).toEqual([])
  })
})

describe('generateDecisionId', () => {
  it('produces a dec-<now>-<rand> shaped id', () => {
    const id = generateDecisionId(1748387200000, () => 0.123456789)
    expect(id).toMatch(/^dec-1748387200000-[a-z0-9]+$/)
  })

  it('produces distinct ids for distinct random draws', () => {
    const a = generateDecisionId(1, () => 0.1)
    const b = generateDecisionId(1, () => 0.9)
    expect(a).not.toBe(b)
  })
})

describe('createDecisionLog', () => {
  it('append() assigns an id when absent and persists the entry', () => {
    const storage = memoryStorage()
    const log = createDecisionLog({ storage, now: () => 1748387200000 })

    const stored = log.append({ type: 'rebalance', status: 'pending_evaluation', timestamp: 1 })

    expect(stored.id).toMatch(/^dec-1748387200000-/)
    expect(storage.snapshot()).toHaveLength(1)
    expect(storage.snapshot()[0]).toBe(stored)
  })

  it('append() preserves a caller-supplied id', () => {
    const storage = memoryStorage()
    const log = createDecisionLog({ storage, now: () => 1 })
    const stored = log.append({ id: 'dec-custom', type: 'hold', status: 'completed', timestamp: 1 })
    expect(stored.id).toBe('dec-custom')
  })

  it('append() adds to existing entries without dropping them', () => {
    const storage = memoryStorage([{ id: 'old', status: 'completed', timestamp: 1 }])
    const log = createDecisionLog({ storage, now: () => 2 })
    log.append({ id: 'new', status: 'pending_evaluation', timestamp: 2 })
    expect(storage.snapshot().map(d => d.id)).toEqual(['old', 'new'])
  })

  it('getPending() returns pending entries older than the window using the injected clock', () => {
    const storage = memoryStorage([
      { id: 'a', status: 'pending_evaluation', timestamp: 1 * DAY },
      { id: 'b', status: 'pending_evaluation', timestamp: 9.9 * DAY },
    ])
    const log = createDecisionLog({ storage, now: () => 10 * DAY })
    expect(log.getPending(7).map(d => d.id)).toEqual(['a'])
  })

  it('update() patches one decision by id and writes it back', () => {
    const storage = memoryStorage([
      { id: 'a', status: 'pending_evaluation' },
      { id: 'b', status: 'pending_evaluation' },
    ])
    const log = createDecisionLog({ storage, now: () => 1 })
    log.update('a', { status: 'evaluated', netResultUSD: 12.5 })
    const a = storage.snapshot().find(d => d.id === 'a')
    expect(a).toEqual({ id: 'a', status: 'evaluated', netResultUSD: 12.5 })
  })

  it('all() returns every stored entry in append order', () => {
    const storage = memoryStorage([{ id: 'a' }, { id: 'b' }])
    const log = createDecisionLog({ storage, now: () => 1 })
    expect(log.all().map(d => d.id)).toEqual(['a', 'b'])
  })
})

describe('hoursSinceLastRebalance', () => {
  const HOUR = 3_600_000

  it('returns Infinity when there are no rebalance decisions', () => {
    expect(hoursSinceLastRebalance([], 1_000_000)).toBe(Infinity)
    expect(hoursSinceLastRebalance([{ type: 'hold', timestamp: 5 }], 1_000_000)).toBe(Infinity)
  })

  it('returns hours since the most recent rebalance entry', () => {
    const now = 100 * HOUR
    const decisions = [
      { type: 'rebalance', timestamp: 90 * HOUR },
      { type: 'rebalance', timestamp: 97 * HOUR },
      { type: 'hold', timestamp: 99 * HOUR },
    ]
    expect(hoursSinceLastRebalance(decisions, now)).toBe(3)
  })

  it('is exposed as a decisionLog method backed by storage', () => {
    let rows = []
    const storage = { read: () => rows, write: (r) => { rows = r } }
    const log = createDecisionLog({ storage, now: () => 10 * HOUR })
    log.append({ type: 'rebalance', timestamp: 4 * HOUR })
    expect(log.hoursSinceLastRebalance()).toBe(6)
  })
})
