import { describe, it, expect } from 'vitest'
import { formatPlaybookForCouncil, filterPlaybookByRole } from './council.js'

describe('formatPlaybookForCouncil', () => {
  it('returns a placeholder when there are no rules', () => {
    expect(formatPlaybookForCouncil([])).toBe('(no rules yet)')
    expect(formatPlaybookForCouncil(undefined)).toBe('(no rules yet)')
  })

  it('renders id, counters, and text for each rule', () => {
    const text = formatPlaybookForCouncil([
      { id: 'defi-001', category: 'risk', helpful: 3, harmful: 1, text: 'Avoid TVL drops >20%.' },
    ])
    expect(text).toContain('defi-001')
    expect(text).toContain('helpful=3')
    expect(text).toContain('harmful=1')
    expect(text).toContain('Avoid TVL drops >20%.')
  })

  it('sorts rules by net helpfulness (helpful - harmful) descending', () => {
    const text = formatPlaybookForCouncil([
      { id: 'low',  category: 'risk', helpful: 0, harmful: 5, text: 'bad rule' },
      { id: 'high', category: 'risk', helpful: 9, harmful: 0, text: 'good rule' },
    ])
    expect(text.indexOf('high')).toBeLessThan(text.indexOf('low'))
  })
})

describe('filterPlaybookByRole', () => {
  const playbook = [
    { id: 'r1', category: 'risk',     helpful: 0, harmful: 0, text: 'a' },
    { id: 'g1', category: 'gas',      helpful: 0, harmful: 0, text: 'b' },
    { id: 's1', category: 'strategy', helpful: 0, harmful: 0, text: 'c' },
    { id: 'r2', category: 'risk',     helpful: 0, harmful: 0, text: 'd' },
  ]

  it('buckets rules by category into the three specialist roles', () => {
    const byRole = filterPlaybookByRole(playbook)
    expect(byRole.riskAuditor.map(r => r.id)).toEqual(['r1', 'r2'])
    expect(byRole.gasChecker.map(r => r.id)).toEqual(['g1'])
    expect(byRole.strategyGuard.map(r => r.id)).toEqual(['s1'])
  })

  it('returns empty buckets for an empty or missing playbook', () => {
    const byRole = filterPlaybookByRole(undefined)
    expect(byRole.riskAuditor).toEqual([])
    expect(byRole.gasChecker).toEqual([])
    expect(byRole.strategyGuard).toEqual([])
  })
})

import { buildCouncilContext } from './council.js'

describe('buildCouncilContext', () => {
  const sim = {
    base: { recommendedPool: 'aave-v3', projectedNetYieldUSD: 70 }, // $10/day
    bull: { projectedNetYieldUSD: 120 },
    bear: { projectedNetYieldUSD: -20 },
    weights: { bull: 0.3, base: 0.4, bear: 0.3 },
    expectedValue: 44,
  }
  const state = {
    positions: [{ protocol: 'compound-v3', amountUSD: 1000, currentAPY: 5 }],
    pools: [
      { id: 'pool-x', protocol: 'aave-v3', apy: 9, tvlUsd: 2e8, ilRisk: 'low', audited: true },
    ],
    gasPrice: 12,         // gwei
    ethPriceUSD: 2000,
    turbulenceIndex: 0.2,
  }
  const config = {
    riskTolerance: 'moderate',
    whitelist: ['aave-v3', 'compound-v3'],
    thresholds: { MAX_GAS_USD: 25 },
  }

  it('resolves the proposed pool from sim.base.recommendedPool by PROTOCOL', () => {
    const ctx = buildCouncilContext(sim, state, config)
    expect(ctx.proposedPool).toBe('aave-v3')
    expect(ctx.proposedPoolAPY).toBe(9)         // matched on pool.protocol, not id
    expect(ctx.poolDetails.id).toBe('pool-x')
  })

  it('computes gas cost in USD from gasPrice * 300k units * ethPrice', () => {
    const ctx = buildCouncilContext(sim, state, config)
    // 12 gwei * 300000 * 2000 / 1e9 = $7.20
    expect(ctx.estimatedGasCostUSD).toBeCloseTo(7.2, 5)
  })

  it('computes breakeven days = gasUSD / dailyYieldDelta', () => {
    const ctx = buildCouncilContext(sim, state, config)
    // dailyYield = 70/7 = 10; breakeven = 7.2 / 10 = 0.72
    expect(ctx.breakevenDays).toBeCloseTo(0.72, 5)
  })

  it('uses sentinel 999 breakeven when the daily yield delta is not positive', () => {
    const flat = { ...sim, base: { recommendedPool: 'aave-v3', projectedNetYieldUSD: 0 } }
    const ctx = buildCouncilContext(flat, state, config)
    expect(ctx.breakevenDays).toBe(999)
  })

  it('carries the current weighted portfolio APY and the three sim scenarios', () => {
    const ctx = buildCouncilContext(sim, state, config)
    expect(ctx.currentAPY).toBeCloseTo(5, 5)     // single position @ 5%
    expect(ctx.expectedValue7d).toBe(44)
    expect(ctx.simulationScenarios.bull.yield).toBe(120)
    expect(ctx.simulationScenarios.bear.probability).toBe(0.3)
  })

  it('exposes only the strategy subset the specialists need', () => {
    const ctx = buildCouncilContext(sim, state, config)
    expect(ctx.strategyConfig).toEqual({
      riskTolerance: 'moderate',
      whitelist: ['aave-v3', 'compound-v3'],
      maxGasUSD: 25,
    })
  })

  it('defaults pool details to an empty object when no pool matches', () => {
    const orphan = { ...sim, base: { recommendedPool: 'nonexistent', projectedNetYieldUSD: 70 } }
    const ctx = buildCouncilContext(orphan, state, config)
    expect(ctx.poolDetails).toEqual({})
    expect(ctx.proposedPoolAPY).toBe(0)
  })
})
