import { describe, it, expect } from 'vitest'
import { usdcWeiToUsd, USDC_DECIMALS, createState, ACTIONS } from './state.js'

describe('usdcWeiToUsd', () => {
  it('scales 6-decimal USDC wei to a USD number', () => {
    expect(USDC_DECIMALS).toBe(6)
    expect(usdcWeiToUsd('930000000')).toBe(930)      // 930 USDC
    expect(usdcWeiToUsd('1500000')).toBe(1.5)        // 1.5 USDC
  })

  it('returns 0 for null, undefined, or garbage instead of throwing', () => {
    expect(usdcWeiToUsd(null)).toBe(0)
    expect(usdcWeiToUsd(undefined)).toBe(0)
    expect(usdcWeiToUsd('not-a-number')).toBe(0)
  })

  it('handles uint256-scale values without throwing', () => {
    expect(usdcWeiToUsd((10n ** 30n).toString())).toBeGreaterThan(0)
  })
})

const FIXED_NOW = 1_750_000_000_000

const catalog = [
  { name: 'Aave v3 USDC',  protocol: 'aave-v3',     address: '0xAAA', apy: 4.8, risk: 'low' },
  { name: 'Pendle PT-USDC', protocol: 'pendle-v2',  address: '0xCCC', apy: 9.4, risk: 'high' },
]

describe('createState — positions', () => {
  it('maps a positions map + catalog into an enriched array with USD amounts', () => {
    const state = createState({
      now: FIXED_NOW,
      catalog,
      positionsMap: {
        '0xaaa': { vaultName: 'Aave v3 USDC', balance: '930000000', unclaimedRewards: '1500000' },
      },
    })
    expect(state.positions).toHaveLength(1)
    const p = state.positions[0]
    expect(p.vault).toBe('0xaaa')
    expect(p.protocol).toBe('aave-v3')        // pulled from catalog by case-insensitive addr
    expect(p.amountUSD).toBe(930)
    expect(p.unclaimedRewardsUSD).toBe(1.5)
    expect(p.currentAPY).toBe(4.8)
    expect(p.risk).toBe('low')
    expect(p.daysHeld).toBe(0)                 // no entryTimestamp → 0
  })

  it('computes daysHeld from entryTimestamp using injected clock', () => {
    const tenDaysAgo = FIXED_NOW - 10 * 86_400_000
    const state = createState({
      now: FIXED_NOW,
      catalog,
      positionsMap: { '0xaaa': { balance: '100000000', entryTimestamp: tenDaysAgo } },
    })
    expect(state.positions[0].daysHeld).toBe(10)
  })

  it('returns an empty positions array when positionsMap is missing', () => {
    expect(createState({ now: FIXED_NOW }).positions).toEqual([])
  })
})

describe('createState — pools', () => {
  it('normalizes catalog-style and DeFiLlama-style pools to one shape', () => {
    const state = createState({
      now: FIXED_NOW,
      pools: [
        { address: '0xAAA', protocol: 'aave-v3', name: 'Aave v3 USDC', apy: 4.8, risk: 'low' },
        { pool: 'uuid-1', project: 'pendle', apy: 9.4, tvlUsd: 12_000_000, change_1d: -3.2, ilRisk: 'yes', audits: '2' },
      ],
    })
    const [a, b] = state.pools
    expect(a.id).toBe('0xAAA')
    expect(a.apy).toBe(4.8)
    expect(a.ilRisk).toBe('low')               // null/absent ilRisk defaults to 'low'
    expect(b.id).toBe('uuid-1')                 // falls back to `pool`
    expect(b.protocol).toBe('pendle')           // falls back to `project`
    expect(b.tvlDelta24h).toBe(-3.2)            // falls back to `change_1d`
    expect(b.ilRisk).toBe('high')               // DeFiLlama "yes" → 'high'
    expect(b.audited).toBe(true)                // audits !== '0'
  })

  it('returns an empty pools array when pools is missing', () => {
    expect(createState({ now: FIXED_NOW }).pools).toEqual([])
  })
})

describe('createState — scalars + timestamp', () => {
  it('passes through market scalars and defaults the rest', () => {
    const state = createState({
      now: FIXED_NOW,
      walletBalanceUSD: 250,
      gasPrice: 12,
      ethPriceUSD: 3400,
      marketVolatility: 0.3,
      turbulenceIndex: 0.4,
      hoursSinceLastRebalance: 18,
    })
    expect(state.walletBalanceUSD).toBe(250)
    expect(state.gasPrice).toBe(12)
    expect(state.ethPriceUSD).toBe(3400)
    expect(state.marketVolatility).toBe(0.3)
    expect(state.turbulenceIndex).toBe(0.4)
    expect(state.timeSinceLastRebalance).toBe(18)
    expect(state.timestamp).toBe(FIXED_NOW)
  })

  it('defaults timeSinceLastRebalance to Infinity when never rebalanced', () => {
    expect(createState({ now: FIXED_NOW }).timeSinceLastRebalance).toBe(Infinity)
  })
})

describe('ACTIONS', () => {
  it('HOLD carries a reason', () => {
    expect(ACTIONS.HOLD('cooldown active')).toEqual({ type: 'HOLD', reason: 'cooldown active' })
  })

  it('REBALANCE carries from/to vault addresses and a USD amount', () => {
    expect(ACTIONS.REBALANCE('0xAAA', '0xCCC', 500)).toEqual({
      type: 'REBALANCE',
      fromVault: '0xAAA',
      toVault: '0xCCC',
      amountUSD: 500,
    })
  })
})
