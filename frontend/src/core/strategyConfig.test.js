import { describe, it, expect } from 'vitest'
import { buildStrategyConfig } from './strategyConfig.js'

const CATALOG = [
  { protocol: 'aave-v3', address: '0xAaa', apy: 4.8 },
  { protocol: 'morpho-blue', address: '0xBbb', apy: 6.1 },
]

describe('buildStrategyConfig', () => {
  it('derives whitelist from the catalog protocols', () => {
    const cfg = buildStrategyConfig({ walletAddress: '0xUser', catalog: CATALOG })
    expect(cfg.whitelist).toEqual(['aave-v3', 'morpho-blue'])
  })

  it('passes through wallet + permission context for the executor', () => {
    const cfg = buildStrategyConfig({
      walletAddress: '0xUser',
      permissionContext: '0xctx',
      catalog: CATALOG,
    })
    expect(cfg.walletAddress).toBe('0xUser')
    expect(cfg.permissionContext).toBe('0xctx')
  })

  it('supplies sane defaults for the loop + gates + council', () => {
    const cfg = buildStrategyConfig({ walletAddress: '0xUser', catalog: CATALOG })
    expect(cfg.minExpectedValueUSD).toBe(15)
    expect(cfg.riskTolerance).toBe('moderate')
    expect(cfg.thresholds.MAX_GAS_USD).toBe(25)
    expect(cfg.thresholds.MIN_COOLDOWN_HOURS).toBe(12)
  })

  it('maps risk tolerance from settings when provided', () => {
    const cfg = buildStrategyConfig({
      walletAddress: '0xUser',
      catalog: CATALOG,
      settings: { riskTolerance: 'aggressive' },
    })
    expect(cfg.riskTolerance).toBe('aggressive')
  })

  it('is immutable — does not mutate the passed catalog or settings', () => {
    const settings = { riskTolerance: 'conservative' }
    const frozen = Object.freeze({ ...settings })
    const cfg = buildStrategyConfig({ walletAddress: '0xUser', catalog: CATALOG, settings: frozen })
    expect(cfg.riskTolerance).toBe('conservative')
  })
})
