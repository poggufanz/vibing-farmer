import { describe, it, expect } from 'vitest'
import { averageApy, evalPeriodDays, computeGrossYieldUSD, computePredictionAccuracyPct, buildEvaluationPatch, runOutcomeEvaluator } from './outcomeTracker.js'

const DAY = 86_400_000

describe('averageApy', () => {
  it('averages the apy field across history points', () => {
    const history = [{ apy: 4 }, { apy: 6 }, { apy: 8 }]
    expect(averageApy(history)).toBe(6)
  })

  it('returns null for null history (pool not on DeFiLlama)', () => {
    expect(averageApy(null)).toBeNull()
  })

  it('returns null for an empty array', () => {
    expect(averageApy([])).toBeNull()
  })

  it('ignores non-numeric apy points', () => {
    expect(averageApy([{ apy: 5 }, { apy: null }, { apy: 'x' }])).toBe(5)
  })
})

describe('evalPeriodDays', () => {
  it('returns the elapsed days since the decision timestamp', () => {
    expect(evalPeriodDays(0, 7 * DAY, 14)).toBe(7)
  })

  it('caps the window at capDays', () => {
    expect(evalPeriodDays(0, 30 * DAY, 14)).toBe(14)
  })

  it('never returns negative for a future timestamp', () => {
    expect(evalPeriodDays(10 * DAY, 5 * DAY, 14)).toBe(0)
  })
})

describe('computeGrossYieldUSD', () => {
  it('computes simple yield = amount * apy% * days/365', () => {
    // $1000 at 7.3% for 365 days = $73
    expect(computeGrossYieldUSD({ amountUSD: 1000, apyPercent: 7.3, days: 365 })).toBeCloseTo(73, 6)
  })

  it('scales linearly with the day window', () => {
    // $1000 at 36.5% for 10 days = $10
    expect(computeGrossYieldUSD({ amountUSD: 1000, apyPercent: 36.5, days: 10 })).toBeCloseTo(10, 6)
  })

  it('returns 0 when apyPercent is null/undefined', () => {
    expect(computeGrossYieldUSD({ amountUSD: 1000, apyPercent: null, days: 7 })).toBe(0)
    expect(computeGrossYieldUSD({ amountUSD: 1000, days: 7 })).toBe(0)
  })

  it('returns 0 for a non-positive amount', () => {
    expect(computeGrossYieldUSD({ amountUSD: 0, apyPercent: 7, days: 7 })).toBe(0)
  })
})

describe('computePredictionAccuracyPct', () => {
  it('is 100 when prediction exactly matches actual', () => {
    expect(computePredictionAccuracyPct(20, 20)).toBe(100)
  })

  it('drops as the error grows relative to the prediction', () => {
    // predicted 20, actual 10 → error 10 → 50% off → 50% accurate
    expect(computePredictionAccuracyPct(20, 10)).toBe(50)
  })

  it('never goes below 0', () => {
    expect(computePredictionAccuracyPct(10, -50)).toBe(0)
  })

  it('returns 0 when the prediction is 0 (no baseline to score against)', () => {
    expect(computePredictionAccuracyPct(0, 5)).toBe(0)
  })
})

describe('buildEvaluationPatch', () => {
  const base = {
    actualYieldUSD: 25,
    gasCostUSD: 5,
    predictedUSD: 20,
    days: 7,
    yieldSource: 'catalog',
    now: 1748387200000,
  }

  it('computes net = yield - gas and flags profit', () => {
    const { patch, outcome } = buildEvaluationPatch(base)
    expect(patch.netResultUSD).toBe(20)        // 25 - 5
    expect(patch.wasProfit).toBe(true)
    expect(outcome.netResultUSD).toBe(20)
    expect(outcome.wasProfit).toBe(true)
  })

  it('flags a loss when gas exceeds yield', () => {
    const { patch } = buildEvaluationPatch({ ...base, actualYieldUSD: 3, gasCostUSD: 5 })
    expect(patch.netResultUSD).toBe(-2)
    expect(patch.wasProfit).toBe(false)
  })

  it('stamps status, evaluatedAt, evalPeriodDays, and yieldSource on the patch', () => {
    const { patch } = buildEvaluationPatch(base)
    expect(patch.status).toBe('evaluated')
    expect(patch.evaluatedAt).toBe(1748387200000)
    expect(patch.evalPeriodDays).toBe(7)
    expect(patch.yieldSource).toBe('catalog')
    expect(patch.actualYield7dUSD).toBe(25)
  })

  it('carries the same actualYieldUSD + accuracy into the reflector outcome', () => {
    const { patch, outcome } = buildEvaluationPatch(base)
    // predicted 20 vs net 20 → 100% accurate
    expect(patch.predictionAccuracyPct).toBe(100)
    expect(outcome.predictionAccuracyPct).toBe(100)
    expect(outcome.actualYieldUSD).toBe(25)
  })
})

const DAY2 = 86_400_000

// Decision-log fake exposing exactly what the orchestrator uses.
const fakeLog = (pending) => {
  const updates = []
  return {
    getPending: () => pending,
    update: (id, patch) => updates.push({ id, patch }),
    _updates: updates,
  }
}

const rebalanceDecision = (over = {}) => ({
  id: 'dec-1',
  type: 'rebalance',
  timestamp: 0,
  toVault: '0xVAULT',
  amountUSD: 1000,
  gasCostUSD: 5,
  simResult: { expectedValue: 20 },
  status: 'pending_evaluation',
  ...over,
})

describe('runOutcomeEvaluator', () => {
  const now = 8 * DAY2

  it('evaluates a rebalance using DeFiLlama history and patches the log', async () => {
    const log = fakeLog([rebalanceDecision()])
    await runOutcomeEvaluator({
      decisionLog: log,
      fetchApyHistory: async () => [{ apy: 36.5 }], // 36.5% for 8 days on $1000 ≈ $8
      catalogApyByVault: {},
      now: () => now,
    })
    expect(log._updates).toHaveLength(1)
    const { id, patch } = log._updates[0]
    expect(id).toBe('dec-1')
    expect(patch.status).toBe('evaluated')
    expect(patch.yieldSource).toBe('defillama')
    expect(patch.actualYield7dUSD).toBeCloseTo(8, 1)
  })

  it('falls back to catalog apy when history is null (MockVault not on DeFiLlama)', async () => {
    const log = fakeLog([rebalanceDecision()])
    await runOutcomeEvaluator({
      decisionLog: log,
      fetchApyHistory: async () => null,
      catalogApyByVault: { '0xvault': 9.125 }, // lookup is case-insensitive
      now: () => now,
    })
    expect(log._updates[0].patch.yieldSource).toBe('catalog')
    expect(log._updates[0].patch.actualYield7dUSD).toBeCloseTo(2, 1) // 9.125% * 8/365 * 1000
  })

  it('marks unavailable and skips reflector when no apy can be resolved', async () => {
    const log = fakeLog([rebalanceDecision()])
    const reflectorCalls = []
    await runOutcomeEvaluator({
      decisionLog: log,
      fetchApyHistory: async () => null,
      catalogApyByVault: {},
      reflector: async (d, o) => reflectorCalls.push([d, o]),
      now: () => now,
    })
    expect(log._updates[0].patch.yieldSource).toBe('unavailable')
    expect(reflectorCalls).toHaveLength(0)
  })

  it('calls the optional reflector with the decision and outcome on success', async () => {
    const log = fakeLog([rebalanceDecision()])
    const reflectorCalls = []
    await runOutcomeEvaluator({
      decisionLog: log,
      fetchApyHistory: async () => [{ apy: 36.5 }],
      catalogApyByVault: {},
      reflector: async (d, o) => reflectorCalls.push([d, o]),
      now: () => now,
    })
    expect(reflectorCalls).toHaveLength(1)
    expect(reflectorCalls[0][0].id).toBe('dec-1')
    expect(reflectorCalls[0][1]).toHaveProperty('wasProfit')
  })

  it('skips non-rebalance entries (hold/failed) entirely', async () => {
    const log = fakeLog([
      { id: 'h1', type: 'hold', status: 'pending_evaluation' },
      { id: 'f1', type: 'failed', status: 'pending_evaluation' },
    ])
    await runOutcomeEvaluator({
      decisionLog: log,
      fetchApyHistory: async () => [{ apy: 5 }],
      catalogApyByVault: {},
      now: () => now,
    })
    expect(log._updates).toHaveLength(0)
  })

  it('does not let one failing evaluation abort the rest', async () => {
    const log = fakeLog([
      rebalanceDecision({ id: 'bad' }),
      rebalanceDecision({ id: 'good' }),
    ])
    let call = 0
    await runOutcomeEvaluator({
      decisionLog: log,
      fetchApyHistory: async () => {
        call += 1
        if (call === 1) throw new Error('network down')
        return [{ apy: 10 }]
      },
      catalogApyByVault: {},
      now: () => now,
    })
    // 'bad' threw during fetch; 'good' still evaluated.
    expect(log._updates.map(u => u.id)).toEqual(['good'])
  })

  it('returns a summary count of evaluated decisions', async () => {
    const log = fakeLog([rebalanceDecision()])
    const result = await runOutcomeEvaluator({
      decisionLog: log,
      fetchApyHistory: async () => [{ apy: 5 }],
      catalogApyByVault: {},
      now: () => now,
    })
    expect(result).toEqual({ evaluated: 1, skipped: 0, failed: 0 })
  })
})
