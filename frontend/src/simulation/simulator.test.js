import { describe, it, expect } from 'vitest'
import { calculateMarketTrend } from './simulator.js'

describe('calculateMarketTrend', () => {
  it('returns sideways for an empty / missing pool list', () => {
    expect(calculateMarketTrend([])).toBe('sideways')
    expect(calculateMarketTrend(undefined)).toBe('sideways')
  })

  it('returns uptrend when average 24h TVL delta is above +3%', () => {
    const pools = [{ tvlDelta24h: 0.05 }, { tvlDelta24h: 0.04 }]
    expect(calculateMarketTrend(pools)).toBe('uptrend')
  })

  it('returns downtrend when average 24h TVL delta is below -3%', () => {
    const pools = [{ tvlDelta24h: -0.05 }, { tvlDelta24h: -0.04 }]
    expect(calculateMarketTrend(pools)).toBe('downtrend')
  })

  it('returns sideways inside the +/-3% band', () => {
    const pools = [{ tvlDelta24h: 0.01 }, { tvlDelta24h: -0.01 }]
    expect(calculateMarketTrend(pools)).toBe('sideways')
  })
})
