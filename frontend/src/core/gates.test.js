import { describe, it, expect } from 'vitest'
import { getCurrentPortfolioAPY, checkTurbulence, checkCooldown, checkGasBudget } from './gates.js'

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

describe('checkCooldown', () => {
  const thresholds = { MIN_COOLDOWN_HOURS: 12 }

  it('passes when enough time has elapsed since last rebalance', () => {
    const result = checkCooldown({ timeSinceLastRebalance: 24 }, thresholds)
    expect(result.pass).toBe(true)
    expect(result.name).toBe('cooldown')
  })

  it('passes on first boot (Infinity)', () => {
    expect(checkCooldown({ timeSinceLastRebalance: Infinity }, thresholds).pass).toBe(true)
  })

  it('fails when still inside the cooldown window', () => {
    const result = checkCooldown({ timeSinceLastRebalance: 6 }, thresholds)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('Cooldown')
  })
})

describe('checkGasBudget', () => {
  const thresholds = { MAX_GAS_USD: 25 }

  it('passes and reports estimatedGasUSD when gas is affordable', () => {
    // 10 gwei * 300000 / 1e9 = 0.003 ETH * $2000 = $6.00
    const result = checkGasBudget({ gasPrice: 10, ethPriceUSD: 2000 }, thresholds)
    expect(result.pass).toBe(true)
    expect(result.name).toBe('gas')
    expect(result.estimatedGasUSD).toBeCloseTo(6, 5)
  })

  it('fails when gas cost exceeds the budget', () => {
    // 100 gwei * 300000 / 1e9 = 0.03 ETH * $2000 = $60.00 > $25
    const result = checkGasBudget({ gasPrice: 100, ethPriceUSD: 2000 }, thresholds)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('Gas too expensive')
  })
})
