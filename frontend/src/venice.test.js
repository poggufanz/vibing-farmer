import { describe, it, expect } from 'vitest'
import { validateVeniceResponse, parseSpecialistVerdict } from './venice.js'

const VAULTS = [
  { address: '0xAAAa000000000000000000000000000000000001', name: 'A' },
  { address: '0xBBBb000000000000000000000000000000000002', name: 'B' },
]

const validVault = (over = {}) => ({
  address: VAULTS[0].address,
  reasoning: 'Solid overcollateralized lending with deep liquidity and low drawdown.',
  expected_apy: 4.8,
  allocation: 1.0,
  risk_tier: 'low',
  ...over,
})

describe('validateVeniceResponse', () => {
  it('accepts a well-formed single-vault response', () => {
    const res = { selected_vaults: [validVault()] }
    expect(() => validateVeniceResponse(res, VAULTS)).not.toThrow()
  })

  it('rejects expected_apy of 0', () => {
    const res = { selected_vaults: [validVault({ expected_apy: 0 })] }
    expect(() => validateVeniceResponse(res, VAULTS)).toThrow(/expected_apy/)
  })

  it('rejects expected_apy as a string "N/A"', () => {
    const res = { selected_vaults: [validVault({ expected_apy: 'N/A' })] }
    expect(() => validateVeniceResponse(res, VAULTS)).toThrow(/expected_apy/)
  })

  it('rejects allocation > 1', () => {
    const res = { selected_vaults: [validVault({ allocation: 1.5 })] }
    expect(() => validateVeniceResponse(res, VAULTS)).toThrow(/allocation/)
  })

  it('rejects a missing/invalid risk_tier', () => {
    const res = { selected_vaults: [validVault({ risk_tier: undefined })] }
    expect(() => validateVeniceResponse(res, VAULTS)).toThrow(/risk_tier/)
  })

  it('still rejects a hallucinated address', () => {
    const res = { selected_vaults: [validVault({ address: '0xdead' })] }
    expect(() => validateVeniceResponse(res, VAULTS)).toThrow(/hallucinated/)
  })
})

describe('parseSpecialistVerdict', () => {
  const allowed = ['yld-apy-attractive', 'yld-projection-positive', 'yld-tvl-adequate']

  it('parses a well-formed verdict and keeps only allowed cited rules', () => {
    const v = parseSpecialistVerdict({
      signal: 'DEPOSIT', confidence: 0.82,
      reasoning: 'APY clears target and projection is positive.',
      citedRules: ['yld-apy-attractive', 'rsk-turbulent-veto', 'bogus'],
      concerns: ['thin TVL on vault 2'],
    }, 'yield', allowed)
    expect(v.role).toBe('yield')
    expect(v.signal).toBe('DEPOSIT')
    expect(v.confidence).toBe(0.82)
    expect(v.citedRules).toEqual(['yld-apy-attractive']) // cross-role + hallucinated dropped
    expect(v.source).toBe('ai')
  })

  it('clamps confidence to [0,1] and uppercases the signal', () => {
    const v = parseSpecialistVerdict({ signal: 'deposit', confidence: 2, reasoning: 'x', citedRules: [] }, 'yield', allowed)
    expect(v.confidence).toBe(1)
    expect(v.signal).toBe('DEPOSIT')
  })

  it('throws on an invalid signal', () => {
    expect(() => parseSpecialistVerdict({ signal: 'BUY', confidence: 0.5, reasoning: 'x' }, 'yield', allowed))
      .toThrow(/signal/)
  })

  it('throws when reasoning is missing', () => {
    expect(() => parseSpecialistVerdict({ signal: 'HOLD', confidence: 0.5 }, 'yield', allowed))
      .toThrow(/reasoning/)
  })

  it('defaults missing citedRules/concerns to empty arrays', () => {
    const v = parseSpecialistVerdict({ signal: 'HOLD', confidence: 0.4, reasoning: 'cautious' }, 'risk', ['rsk-regime-calm'])
    expect(v.citedRules).toEqual([])
    expect(v.concerns).toEqual([])
  })
})
