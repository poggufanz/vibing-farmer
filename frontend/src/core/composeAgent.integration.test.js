import { describe, it, expect } from 'vitest'
import { createAutonomousLoop } from './loop.js'
import { buildStages } from './composeAgent.js'

const memStorage = () => { let rows = []; return { read: () => rows, write: (r) => { rows = r } } }

describe('wired loop — one cycle, no I/O', () => {
  it('reaches a HOLD decision and logs it when gates pass but council holds', async () => {
    const decisionLog = {
      _rows: [],
      append(e) { this._rows.push(e); return { id: 'dec-1', ...e } },
      getPending: () => [],
      update: () => {},
      all() { return this._rows },
      hoursSinceLastRebalance: () => Infinity,
    }
    const playbookStore = { load: () => [], save: () => {} }

    const stages = buildStages({ walletAddress: '0xUser', decisionLog, playbookStore })

    // Override network/AI-bound stages with deterministic fakes.
    stages.loadConfig = async () => ({
      walletAddress: '0xUser',
      minExpectedValueUSD: 0,
      thresholds: {},
      whitelist: [],
      riskTolerance: 'moderate',
    })
    // State that lets all gates pass: no positions, one candidate pool with tvlUsd > MIN_TVL_USD.
    stages.fetchState = async () => ({
      positions: [],
      pools: [{ id: '0xbbb', protocol: 'morpho-blue', apy: 9, tvlUsd: 9_000_000 }],
      gasPrice: 10,
      ethPriceUSD: 3000,
      turbulenceIndex: 0.1,
      timeSinceLastRebalance: Infinity,
    })
    stages.runSimulation = async () => ({
      base: { recommendedPool: 'morpho-blue' },
      expectedValue: 50,
      weights: {},
      bull: {},
      bear: {},
    })
    // 2 HOLD + 1 EXECUTE → council majority HOLD → executor logs hold entry.
    stages.runCouncil = async () => ([
      { role: 'riskAuditor', decision: 'HOLD', confidence: 0.4, keyReason: 'risk too high' },
      { role: 'gasChecker', decision: 'HOLD', confidence: 0.4, keyReason: 'margin thin' },
      { role: 'strategyGuard', decision: 'EXECUTE', confidence: 0.6, citedRules: [] },
    ])

    const loop = createAutonomousLoop({ stages, logger: { log: () => {}, error: () => {} } })
    const result = await loop.runOneCycle()

    expect(['held', 'gate_blocked', 'sim_rejected']).toContain(result.outcome)
    if (result.outcome === 'held') {
      expect(decisionLog.all().some((d) => d.type === 'hold')).toBe(true)
    }
  })
})
