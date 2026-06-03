import { describe, it, expect } from 'vitest'
import { getCurrentPortfolioAPY, checkTurbulence } from './gates.js'

describe('getCurrentPortfolioAPY', () => {
  it('returns 0 when there are no positions', () => {
    expect(getCurrentPortfolioAPY({ positions: [] })).toBe(0)
  })

  it('returns the single position APY when only one position is held', () => {
    const state = { positions: [{ amountUSD: 1000, currentAPY: 5 }] }
    expect(getCurrentPortfolioAPY(state)).toBe(5)
  })

  it('weights APY by position size', () => {
    // 75% at 4% + 25% at 8% = 3 + 2 = 5%
    const state = {
      positions: [
        { amountUSD: 3000, currentAPY: 4 },
        { amountUSD: 1000, currentAPY: 8 },
      ],
    }
    expect(getCurrentPortfolioAPY(state)).toBe(5)
  })
})

describe('checkTurbulence', () => {
  const thresholds = { TURBULENCE_CRITICAL: 0.75 }

  it('passes when turbulence is below the critical threshold', () => {
    const result = checkTurbulence({ turbulenceIndex: 0.5 }, thresholds)
    expect(result.pass).toBe(true)
    expect(result.name).toBe('turbulence')
  })

  it('fails when turbulence meets or exceeds the critical threshold', () => {
    const result = checkTurbulence({ turbulenceIndex: 0.8 }, thresholds)
    expect(result.pass).toBe(false)
    expect(result.name).toBe('turbulence')
    expect(result.reason).toContain('turbulence')
  })

  it('fails exactly at the threshold (>=)', () => {
    expect(checkTurbulence({ turbulenceIndex: 0.75 }, thresholds).pass).toBe(false)
  })
})
