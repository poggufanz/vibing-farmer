import { describe, it, expect } from 'vitest'
import {
  buildCandidates, summarizeConsensus, FALLBACK_NARRATION, runNarration,
} from './councilNarrator.js'

const strategy = {
  total: 100,
  agents: [
    { id: 'worker-1', allocation: 60, vault: { name: 'Aave USDC', addr: '0xAAA0000000000000000000000000000000000001', protocol: 'aave-v3', apy: '4.8' } },
    { id: 'worker-2', allocation: 40, vault: { name: 'Morpho USDC', addr: '0xBBB0000000000000000000000000000000000002', protocol: 'morpho-blue', apy: '5.2' } },
  ],
}

describe('buildCandidates', () => {
  it('maps strategy agents to pool-shaped candidates', () => {
    const c = buildCandidates(strategy)
    expect(c).toHaveLength(2)
    expect(c[0]).toMatchObject({ protocol: 'aave-v3', apy: 4.8 })
    expect(c[0].id).toBeDefined()
  })
})

describe('summarizeConsensus', () => {
  it('EXECUTE when majority of verdicts execute', () => {
    const v = [
      { decision: 'EXECUTE' }, { decision: 'EXECUTE' }, { decision: 'HOLD' },
    ]
    expect(summarizeConsensus(v)).toEqual({ finalDecision: 'EXECUTE', executeVotes: 2, total: 3 })
  })
  it('HOLD on a tie or majority hold', () => {
    expect(summarizeConsensus([{ decision: 'HOLD' }, { decision: 'EXECUTE' }]).finalDecision).toBe('HOLD')
  })
})

describe('runNarration', () => {
  it('uses injected aiComplete and returns timelines + verdicts + thinking log', async () => {
    const aiComplete = async ({ userPrompt }) => {
      if (userPrompt.includes('simulation engine')) {
        return JSON.stringify({ recommendedPool: 'aave-v3', projectedNetYieldUSD: 2.5, confidence: 0.7, keyRisk: 'none' })
      }
      return JSON.stringify({ decision: 'EXECUTE', confidence: 0.8, keyReason: 'audited', citedRules: [], newInsight: null })
    }
    const out = await runNarration({ strategy, positionsMap: {}, aiComplete, getSentiment: async () => 'neutral' })
    expect(out.verdicts).toHaveLength(3)
    expect(out.timelines).toHaveProperty('expectedValue')
    expect(out.thinkingLog.length).toBeGreaterThan(0)
    expect(out.consensus.finalDecision).toBe('EXECUTE')
    expect(out.fallback).toBe(false)
  })

  it('falls back without throwing when aiComplete rejects', async () => {
    const out = await runNarration({
      strategy, positionsMap: {},
      aiComplete: async () => { throw new Error('AI down') },
      getSentiment: async () => 'neutral',
      timeoutMs: 50,
    })
    expect(out.verdicts.length).toBe(3)
    expect(out.timelines).toHaveProperty('expectedValue')
  })
})

describe('FALLBACK_NARRATION', () => {
  it('is a well-formed narration object', () => {
    expect(FALLBACK_NARRATION.verdicts).toHaveLength(3)
    expect(FALLBACK_NARRATION.consensus.finalDecision).toBeDefined()
  })
})
