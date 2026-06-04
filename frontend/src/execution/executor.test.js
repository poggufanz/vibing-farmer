import { describe, it, expect } from 'vitest'
import {
  usdToUsdcWei,
  estimateGasUSD,
  resolveTargetVault,
  agentSeedFor,
  sumPositionsUSD,
  buildExecuteEntry,
  buildHoldEntry,
  buildFailedEntry,
} from './executor.js'

describe('usdToUsdcWei', () => {
  it('converts whole USD to 6-decimal USDC wei (bigint)', () => {
    expect(usdToUsdcWei(1)).toBe(1_000_000n)
    expect(usdToUsdcWei(1234.56)).toBe(1_234_560_000n)
  })

  it('floors sub-wei fractions and never returns negative', () => {
    expect(usdToUsdcWei(0.0000004)).toBe(0n) // below 1 wei
    expect(usdToUsdcWei(-5)).toBe(0n)
  })

  it('treats nullish/NaN as zero', () => {
    expect(usdToUsdcWei(undefined)).toBe(0n)
    expect(usdToUsdcWei(NaN)).toBe(0n)
  })
})

describe('estimateGasUSD', () => {
  it('computes gasPrice(gwei) * 300000 units * ethPriceUSD / 1e9', () => {
    // 20 gwei, ETH $2500 → 20 * 300000 * 2500 / 1e9 = 15
    expect(estimateGasUSD({ gasPrice: 20, ethPriceUSD: 2500 })).toBeCloseTo(15, 6)
  })

  it('is zero when gas or eth price is missing', () => {
    expect(estimateGasUSD({})).toBe(0)
    expect(estimateGasUSD({ gasPrice: 20 })).toBe(0)
  })
})

describe('resolveTargetVault', () => {
  const state = {
    pools: [
      { id: '0xAAA', protocol: 'aave-v3' },
      { id: '0xBBB', protocol: 'morpho-blue' },
    ],
  }

  it('maps a recommended protocol name to its vault address (pool.id)', () => {
    expect(resolveTargetVault('morpho-blue', state)).toBe('0xBBB')
  })

  it('returns null for an unknown protocol', () => {
    expect(resolveTargetVault('pendle-v2', state)).toBeNull()
  })

  it('returns null for nullish input', () => {
    expect(resolveTargetVault(null, state)).toBeNull()
    expect(resolveTargetVault('aave-v3', {})).toBeNull()
  })
})

describe('agentSeedFor', () => {
  it('builds a lowercased yv-auto seed namespaced by vault', () => {
    expect(agentSeedFor('0xAbCd')).toBe('yv-auto-0xabcd')
  })
})

describe('sumPositionsUSD', () => {
  it('sums amountUSD across positions', () => {
    const state = { positions: [{ amountUSD: 100 }, { amountUSD: 50.5 }] }
    expect(sumPositionsUSD(state)).toBeCloseTo(150.5, 6)
  })

  it('is zero for empty/missing positions', () => {
    expect(sumPositionsUSD({})).toBe(0)
    expect(sumPositionsUSD({ positions: [] })).toBe(0)
  })
})

describe('buildExecuteEntry', () => {
  const sim = {
    expectedValue: 42,
    weights: { bull: 0.3, base: 0.4, bear: 0.3 },
    bull: { projectedNetYieldUSD: 80 },
    base: { projectedNetYieldUSD: 40, recommendedPool: 'morpho-blue' },
    bear: { projectedNetYieldUSD: 5 },
  }
  const consensus = {
    finalDecision: 'EXECUTE',
    verdicts: [
      { role: 'riskAuditor', decision: 'EXECUTE', citedRules: ['defi-001'], newInsight: 'watch TVL' },
      { role: 'gasChecker', decision: 'EXECUTE', citedRules: ['defi-002', 'defi-001'], newInsight: null },
      { role: 'strategyGuard', decision: 'HOLD', citedRules: [], newInsight: 'whitelist morpho' },
    ],
  }

  it('produces a pending_evaluation rebalance entry with deduped cited rules and filtered insights', () => {
    const entry = buildExecuteEntry({
      now: 1748387200000,
      fromVault: '0xAAA',
      toVault: '0xBBB',
      amountUSD: 1000,
      txResult: { txHash: '0xfeed', status: 'relayed' },
      gasCostUSD: 3.21,
      sim,
      consensus,
    })

    expect(entry.type).toBe('rebalance')
    expect(entry.status).toBe('pending_evaluation')
    expect(entry.timestamp).toBe(1748387200000)
    expect(entry.fromVault).toBe('0xAAA')
    expect(entry.toVault).toBe('0xBBB')
    expect(entry.amountUSD).toBe(1000)
    expect(entry.txHash).toBe('0xfeed')
    expect(entry.gasCostUSD).toBe(3.21)
    expect(entry.simResult.expectedValue).toBe(42)
    expect(entry.simResult.base.recommendedPool).toBe('morpho-blue')
    expect(entry.citedRules.sort()).toEqual(['defi-001', 'defi-002']) // deduped
    expect(entry.councilInsights).toEqual(['watch TVL', 'whitelist morpho']) // nulls dropped
    expect(entry.councilVerdicts).toHaveLength(3)
    expect(entry.actualYield7dUSD).toBeNull()
    expect(entry.evaluatedAt).toBeNull()
    expect(entry.id).toBeUndefined() // id assigned by the log, not here
  })
})

describe('buildHoldEntry', () => {
  const consensus = {
    finalDecision: 'HOLD',
    executeVotes: 1,
    holdVotes: 2,
    avgConfidence: 0.42,
    rejectionReason: 'Majority voted HOLD (2/3): gas too high',
  }

  it('produces a completed hold entry using the consensus rejection reason by default', () => {
    const entry = buildHoldEntry({ now: 5, consensus, sim: { expectedValue: 12 } })
    expect(entry).toEqual({
      timestamp: 5,
      type: 'hold',
      reason: 'Majority voted HOLD (2/3): gas too high',
      executeVotes: 1,
      holdVotes: 2,
      avgConfidence: 0.42,
      expectedValueUSD: 12,
      status: 'completed',
    })
  })

  it('accepts a reason override (for skip cases) and null sim', () => {
    const entry = buildHoldEntry({ now: 5, consensus, sim: null, reason: 'no target vault' })
    expect(entry.reason).toBe('no target vault')
    expect(entry.expectedValueUSD).toBeNull()
  })
})

describe('buildFailedEntry', () => {
  it('produces a failed rebalance entry carrying the error', () => {
    const entry = buildFailedEntry({
      now: 7,
      fromVault: '0xAAA',
      toVault: '0xBBB',
      amountUSD: 500,
      error: '1Shot relay failed: 500',
      consensus: { verdicts: [{ role: 'riskAuditor' }] },
    })
    expect(entry.type).toBe('rebalance')
    expect(entry.status).toBe('failed')
    expect(entry.timestamp).toBe(7)
    expect(entry.error).toBe('1Shot relay failed: 500')
    expect(entry.councilVerdicts).toHaveLength(1)
  })
})
