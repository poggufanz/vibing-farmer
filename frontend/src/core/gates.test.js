import { describe, it, expect } from 'vitest'
import { getCurrentPortfolioAPY } from './gates.js'

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
