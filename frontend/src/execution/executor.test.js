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
  executeRebalance,
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

// ─── Orchestrator tests ──────────────────────────────────────────────────────────

// In-memory decision-log fake matching the createDecisionLog() surface the executor uses:
// append(entry) assigns an id and stores; all() returns entries. (Mirrors logger.test.js.)
const fakeLog = () => {
  const entries = []
  let seq = 0
  return {
    append(entry) {
      const stored = { id: `dec-${++seq}`, ...entry }
      entries.push(stored)
      return stored
    },
    all: () => entries,
  }
}

const baseState = {
  positions: [{ vault: '0xAAA', amountUSD: 1000 }],
  pools: [
    { id: '0xAAA', protocol: 'aave-v3' },
    { id: '0xBBB', protocol: 'morpho-blue' },
  ],
  gasPrice: 20,
  ethPriceUSD: 2500,
}

const baseSim = {
  expectedValue: 42,
  weights: { bull: 0.3, base: 0.4, bear: 0.3 },
  bull: { projectedNetYieldUSD: 80 },
  base: { projectedNetYieldUSD: 40, recommendedPool: 'morpho-blue' },
  bear: { projectedNetYieldUSD: 5 },
}

const executeConsensus = {
  finalDecision: 'EXECUTE',
  executeVotes: 2,
  holdVotes: 1,
  avgConfidence: 0.7,
  rejectionReason: null,
  verdicts: [
    { role: 'riskAuditor', decision: 'EXECUTE', citedRules: ['defi-001'], newInsight: null },
    { role: 'gasChecker', decision: 'EXECUTE', citedRules: ['defi-002'], newInsight: null },
    { role: 'strategyGuard', decision: 'HOLD', citedRules: [], newInsight: null },
  ],
}

const config = { walletAddress: '0xUSER', permissionContext: '0xctx' }

describe('executeRebalance', () => {
  it('EXECUTE: submits a deposit and appends a pending_evaluation entry', async () => {
    const log = fakeLog()
    const calls = []
    const submitDeposit = async (args) => { calls.push(args); return { txHash: '0xfeed', status: 'relayed' } }

    const result = await executeRebalance(executeConsensus, baseSim, baseState, config, {
      submitDeposit, decisionLog: log, now: () => 1000,
    })

    // transport got the resolved vault, the user, USDC wei, and the agent seed
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      user: '0xUSER',
      vault: '0xBBB',
      amountWei: 1_000_000_000n, // $1000 → 1000 * 1e6
      agentSeed: 'yv-auto-0xbbb',
      permissionContext: '0xctx',
    })

    expect(result).toEqual({ executed: true, txHash: '0xfeed', decisionId: 'dec-1' })

    const entry = log.all()[0]
    expect(entry.status).toBe('pending_evaluation')
    expect(entry.fromVault).toBe('0xAAA')
    expect(entry.toVault).toBe('0xBBB')
    expect(entry.txHash).toBe('0xfeed')
    expect(entry.citedRules.sort()).toEqual(['defi-001', 'defi-002'])
  })

  it('HOLD: logs a completed hold entry and never calls the transport', async () => {
    const log = fakeLog()
    let called = false
    const submitDeposit = async () => { called = true; return { txHash: 'x' } }

    const holdConsensus = {
      finalDecision: 'HOLD', executeVotes: 1, holdVotes: 2, avgConfidence: 0.4,
      rejectionReason: 'Majority voted HOLD (2/3): gas too high', verdicts: [],
    }

    const result = await executeRebalance(holdConsensus, baseSim, baseState, config, {
      submitDeposit, decisionLog: log, now: () => 2000,
    })

    expect(called).toBe(false)
    expect(result).toEqual({ executed: false, reason: 'Majority voted HOLD (2/3): gas too high' })
    expect(log.all()[0]).toMatchObject({ type: 'hold', status: 'completed', reason: 'Majority voted HOLD (2/3): gas too high' })
  })

  it('skips (no transport) when the recommended protocol cannot be resolved to a vault', async () => {
    const log = fakeLog()
    let called = false
    const submitDeposit = async () => { called = true; return { txHash: 'x' } }

    const sim = { ...baseSim, base: { ...baseSim.base, recommendedPool: 'unknown-proto' } }

    const result = await executeRebalance(executeConsensus, sim, baseState, config, {
      submitDeposit, decisionLog: log, now: () => 3000,
    })

    expect(called).toBe(false)
    expect(result.executed).toBe(false)
    expect(result.reason).toMatch(/resolve/i)
    expect(log.all()[0]).toMatchObject({ type: 'hold', status: 'completed' })
  })

  it('skips when portfolio value is zero', async () => {
    const log = fakeLog()
    let called = false
    const submitDeposit = async () => { called = true; return { txHash: 'x' } }

    const state = { ...baseState, positions: [{ vault: '0xAAA', amountUSD: 0 }] }

    const result = await executeRebalance(executeConsensus, baseSim, state, config, {
      submitDeposit, decisionLog: log, now: () => 4000,
    })

    expect(called).toBe(false)
    expect(result.executed).toBe(false)
    expect(log.all()[0]).toMatchObject({ type: 'hold', status: 'completed' })
  })

  it('records a failed entry and returns the error when the deposit throws', async () => {
    const log = fakeLog()
    const submitDeposit = async () => { throw new Error('1Shot relay failed: 500') }

    const result = await executeRebalance(executeConsensus, baseSim, baseState, config, {
      submitDeposit, decisionLog: log, now: () => 5000,
    })

    expect(result).toEqual({ executed: false, error: '1Shot relay failed: 500' })
    expect(log.all()[0]).toMatchObject({ type: 'rebalance', status: 'failed', error: '1Shot relay failed: 500', toVault: '0xBBB' })
  })
})
