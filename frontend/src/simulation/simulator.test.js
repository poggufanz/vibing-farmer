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

import { assignScenarioProbabilities } from './simulator.js'

describe('assignScenarioProbabilities', () => {
  const neutral = { turbulenceIndex: 0.1, newsSentiment: 'neutral', marketTrend: 'sideways' }

  it('returns weights that sum to 1', () => {
    const w = assignScenarioProbabilities(neutral)
    expect(w.bull + w.base + w.bear).toBeCloseTo(1, 10)
  })

  it('is roughly balanced when no signal tilts it', () => {
    const w = assignScenarioProbabilities(neutral)
    expect(w.bull).toBeCloseTo(0.33, 2)
    expect(w.bear).toBeCloseTo(0.33, 2)
  })

  it('shifts weight toward bear under high turbulence', () => {
    const w = assignScenarioProbabilities({ ...neutral, turbulenceIndex: 0.8 })
    expect(w.bear).toBeGreaterThan(w.bull)
  })

  it('shifts weight toward bull on positive sentiment + uptrend', () => {
    const w = assignScenarioProbabilities({ turbulenceIndex: 0.1, newsSentiment: 'positive', marketTrend: 'uptrend' })
    expect(w.bull).toBeGreaterThan(w.bear)
  })
})
