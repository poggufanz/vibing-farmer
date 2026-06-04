import { describe, it, expect } from 'vitest'
import { averageApy, evalPeriodDays } from './outcomeTracker.js'

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
