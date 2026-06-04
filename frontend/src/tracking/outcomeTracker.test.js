import { describe, it, expect } from 'vitest'
import { averageApy, evalPeriodDays, computeGrossYieldUSD, computePredictionAccuracyPct, buildEvaluationPatch } from './outcomeTracker.js'

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
