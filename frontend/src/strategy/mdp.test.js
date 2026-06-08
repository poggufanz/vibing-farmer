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
