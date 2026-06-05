import { describe, it, expect } from 'vitest'
import { getCurrentPortfolioAPY, checkTurbulence, checkCooldown, checkGasBudget, checkCandidatesExist, runFastFailGates } from './gates.js'

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

describe('checkCandidatesExist', () => {
  const thresholds = { MIN_APY_DELTA_PERCENT: 2.0, MIN_TVL_USD: 5_000_000 }

  it('passes and returns candidates that beat current APY by the delta', () => {
    const state = {
      positions: [],                       // empty -> current APY 0
      pools: [
        { id: 'p1', protocol: 'aave-v3', apy: 8, tvlUsd: 100_000_000 },
        { id: 'p2', protocol: 'morpho-blue', apy: 1, tvlUsd: 100_000_000 }, // below delta
      ],
    }
    const result = checkCandidatesExist(state, thresholds)
    expect(result.pass).toBe(true)
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].id).toBe('p1')
  })

  it('excludes pools below the minimum TVL', () => {
    const state = {
      positions: [],
      pools: [{ id: 'p1', protocol: 'aave-v3', apy: 8, tvlUsd: 1_000_000 }],
    }
    expect(checkCandidatesExist(state, thresholds).pass).toBe(false)
  })

  it('excludes protocols already held in the portfolio', () => {
    const state = {
      positions: [{ protocol: 'aave-v3', amountUSD: 1000, currentAPY: 1 }],
      pools: [{ id: 'p1', protocol: 'aave-v3', apy: 8, tvlUsd: 100_000_000 }],
    }
    // only candidate shares our protocol -> none left
    expect(checkCandidatesExist(state, thresholds).pass).toBe(false)
  })

  it('fails with a reason when no pool clears the bar', () => {
    const state = { positions: [], pools: [] }
    const result = checkCandidatesExist(state, thresholds)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('No pools')
  })

  it('caps candidates at 5', () => {
    const pools = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i}`, protocol: `proto-${i}`, apy: 10, tvlUsd: 100_000_000,
    }))
    const result = checkCandidatesExist({ positions: [], pools }, thresholds)
    expect(result.candidates).toHaveLength(5)
  })
})

describe('runFastFailGates', () => {
  // A baseline state that passes every gate.
  const okState = () => ({
    turbulenceIndex: 0.1,
    timeSinceLastRebalance: 48,
    gasPrice: 10,
    ethPriceUSD: 2000,
    positions: [],
    pools: [{ id: 'p1', protocol: 'aave-v3', apy: 8, tvlUsd: 100_000_000 }],
  })

  it('passes and returns candidates when every gate is satisfied', () => {
    const result = runFastFailGates(okState(), {})
    expect(result.pass).toBe(true)
    expect(result.candidates).toHaveLength(1)
  })

  it('short-circuits on turbulence and names the failing gate', () => {
    const result = runFastFailGates({ ...okState(), turbulenceIndex: 0.9 }, {})
    expect(result.pass).toBe(false)
    expect(result.gate).toBe('turbulence')
  })

  it('short-circuits on cooldown before evaluating candidates', () => {
    const result = runFastFailGates({ ...okState(), timeSinceLastRebalance: 1 }, {})
    expect(result.pass).toBe(false)
    expect(result.gate).toBe('cooldown')
  })

  it('short-circuits on gas budget', () => {
    const result = runFastFailGates({ ...okState(), gasPrice: 500 }, {})
    expect(result.pass).toBe(false)
    expect(result.gate).toBe('gas')
  })

  it('fails on candidates when no pool clears the bar', () => {
    const result = runFastFailGates({ ...okState(), pools: [] }, {})
    expect(result.pass).toBe(false)
    expect(result.gate).toBe('candidates')
  })

  it('honors config.thresholds overrides', () => {
    // Tighten turbulence ceiling so the baseline 0.1 still passes but 0.2 fails.
    const result = runFastFailGates(
      { ...okState(), turbulenceIndex: 0.2 },
      { thresholds: { TURBULENCE_CRITICAL: 0.15 } },
    )
    expect(result.pass).toBe(false)
    expect(result.gate).toBe('turbulence')
  })

  it('returns a defined reason string on failure', () => {
    const result = runFastFailGates({ ...okState(), pools: [] }, {})
    expect(typeof result.reason).toBe('string')
    expect(result.reason.length).toBeGreaterThan(0)
  })
})
