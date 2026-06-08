import { describe, it, expect } from 'vitest'
import { normalizeRisk, deriveTurbulence, buildStrategyState, RISK_RANK } from './mdp.js'

describe('normalizeRisk', () => {
  it('maps the app-internal "med" to "medium"', () => {
    expect(normalizeRisk('med')).toBe('medium')
  })
  it('lowercases and passes through canonical tiers', () => {
    expect(normalizeRisk('HIGH')).toBe('high')
    expect(normalizeRisk('low')).toBe('low')
  })
  it('defaults unknown values to "medium"', () => {
    expect(normalizeRisk(undefined)).toBe('medium')
    expect(normalizeRisk('weird')).toBe('medium')
  })
})

describe('deriveTurbulence (FinRL turbulence-index analog)', () => {
  it('returns calm for empty/benign context', () => {
    expect(deriveTurbulence(null).turbulence).toBe('calm')
    expect(deriveTurbulence('yields stable and healthy').turbulence).toBe('calm')
  })
  it('flags turbulent on exploit/hack/depeg keywords', () => {
    const r = deriveTurbulence('A major exploit drained the pool today')
    expect(r.turbulence).toBe('turbulent')
    expect(r.signals).toContain('exploit')
  })
  it('flags elevated on volatility/caution keywords', () => {
    expect(deriveTurbulence('markets are volatile, yields compressing').turbulence).toBe('elevated')
  })
})

describe('buildStrategyState', () => {
  const vaultData = [
    { address: '0xAAA', protocol: 'aave-v3', apy: 4.8, risk: 'low', yield_source: 'lending', drawdown: '-1.2', min_capital: 100 },
    { address: '0xBBB', protocol: 'pendle-v2', apy: 9.4, risk: 'high', yield_source: 'structured', drawdown: '-6.5', min_capital: 1000 },
  ]
  it('captures capital, profile, universe, and market regime', () => {
    const s = buildStrategyState({ amountUsdc: 5000, riskLevel: 'med', numVaults: 2, vaultData, marketContext: 'volatile markets' })
    expect(s.capital.amountUsdc).toBe(5000)
    expect(s.profile.riskLevel).toBe('medium')
    expect(s.universe).toHaveLength(2)
    expect(s.universe[0].riskTier).toBe('low')
    expect(s.market.turbulence).toBe('elevated')
  })
  it('derives heldUsdc from 6-decimal position balances', () => {
    const s = buildStrategyState({
      amountUsdc: 1000, riskLevel: 'low', numVaults: 1, vaultData, marketContext: null,
      positions: { '0xAAA': { balance: '2500000' } }, // 2.5 USDC
    })
    expect(s.capital.heldUsdc).toBeCloseTo(2.5, 5)
    expect(s.portfolio.heldVaultCount).toBe(1)
  })
})

import { riskCeiling, enforceActionSpace, ACTION_SPACE } from './mdp.js'

const UNIVERSE = [
  { address: '0xAAA', protocol: 'aave-v3', apy: 4.8, risk: 'low', drawdown: '-1.2', min_capital: 100 },
  { address: '0xBBB', protocol: 'morpho-blue', apy: 6.1, risk: 'medium', drawdown: '-2.8', min_capital: 500 },
  { address: '0xCCC', protocol: 'pendle-v2', apy: 9.4, risk: 'high', drawdown: '-6.5', min_capital: 1000 },
]
const stateWith = (riskLevel, marketContext) =>
  buildStrategyState({ amountUsdc: 5000, riskLevel, numVaults: 3, vaultData: UNIVERSE, marketContext })

describe('riskCeiling', () => {
  it('is the profile risk when the market is calm', () => {
    expect(riskCeiling(stateWith('high', null))).toBe('high')
    expect(riskCeiling(stateWith('low', null))).toBe('low')
  })
  it('a turbulent market forces the ceiling down to low', () => {
    expect(riskCeiling(stateWith('high', 'exploit drained the pool'))).toBe('low')
  })
  it('an elevated market caps a high-risk profile at medium', () => {
    expect(riskCeiling(stateWith('high', 'volatile, yields compressing'))).toBe('medium')
  })
})

describe('enforceActionSpace', () => {
  it('drops vaults above the ceiling and re-normalizes weights to 1.0', () => {
    const state = stateWith('medium', null) // ceiling = medium
    const proposed = [
      { address: '0xAAA', allocation: 0.5, risk_tier: 'low' },
      { address: '0xCCC', allocation: 0.5, risk_tier: 'high' }, // gated out
    ]
    const { allocations, violations } = enforceActionSpace(proposed, state)
    expect(allocations).toHaveLength(1)
    expect(allocations[0].address).toBe('0xAAA')
    expect(allocations[0].allocation).toBe(1)
    expect(violations.some((v) => v.includes('pendle-v2'))).toBe(true)
  })
  it('normalizes a valid set whose weights do not sum to 1.0', () => {
    const state = stateWith('high', null)
    const proposed = [
      { address: '0xAAA', allocation: 0.2 },
      { address: '0xBBB', allocation: 0.2 },
    ]
    const { allocations } = enforceActionSpace(proposed, state)
    const sum = allocations.reduce((s, a) => s + a.allocation, 0)
    expect(sum).toBeCloseTo(1.0, 4)
  })
  it('falls back to the safest vault when everything is gated', () => {
    const state = stateWith('low', 'exploit everywhere') // ceiling = low
    const proposed = [{ address: '0xCCC', allocation: 1, risk_tier: 'high' }]
    const { allocations, violations } = enforceActionSpace(proposed, state)
    expect(allocations).toHaveLength(1)
    expect(allocations[0].address).toBe('0xAAA') // lowest-risk in universe
    expect(violations.some((v) => v.includes('fell back'))).toBe(true)
  })
  it('exposes a static ACTION_SPACE description for the UI', () => {
    expect(ACTION_SPACE.allocate.constraint).toMatch(/sum to 1\.0/)
  })
})
