import { describe, it, expect } from 'vitest'
import { evaluateConsensus, CONSENSUS_THRESHOLDS } from './consensus.js'
import { createAutonomousLoop } from '../core/loop.js'

// Helper: build a verdict quickly.
const v = (decision, confidence, keyReason = '') => ({ decision, confidence, keyReason })

describe('evaluateConsensus', () => {
  it('EXECUTEs on a 2/3 majority with sufficient average confidence', () => {
    const result = evaluateConsensus([
      v('EXECUTE', 0.8, 'good apy'),
      v('EXECUTE', 0.7, 'safe pool'),
      v('HOLD', 0.5, 'gas a bit high'),
    ])
    expect(result.finalDecision).toBe('EXECUTE')
    expect(result.executeVotes).toBe(2)
    expect(result.holdVotes).toBe(1)
    expect(result.rejectionReason).toBeNull()
  })

  it('HOLDs when fewer than 2 specialists vote EXECUTE', () => {
    const result = evaluateConsensus([
      v('EXECUTE', 0.9, 'great'),
      v('HOLD', 0.9, 'IL risk too high'),
      v('HOLD', 0.9, 'not on whitelist'),
    ])
    expect(result.finalDecision).toBe('HOLD')
    expect(result.executeVotes).toBe(1)
    expect(result.rejectionReason).toContain('Majority voted HOLD')
    expect(result.rejectionReason).toContain('IL risk too high')
    expect(result.rejectionReason).toContain('not on whitelist')
  })

  it('HOLDs when the majority votes EXECUTE but average confidence is too low', () => {
    const result = evaluateConsensus([
      v('EXECUTE', 0.5, 'maybe'),
      v('EXECUTE', 0.5, 'maybe'),
      v('HOLD', 0.4, 'unsure'),
    ]) // avg = 0.466 < 0.60
    expect(result.finalDecision).toBe('HOLD')
    expect(result.rejectionReason).toContain('Confidence too low')
    expect(result.rejectionReason).toContain('47%') // (0.4666 * 100).toFixed(0)
  })

  it('computes the average confidence across all verdicts', () => {
    const result = evaluateConsensus([
      v('EXECUTE', 0.9), v('EXECUTE', 0.6), v('HOLD', 0.3),
    ])
    expect(result.avgConfidence).toBeCloseTo(0.6, 5)
  })

  it('treats a missing confidence as 0 and never throws', () => {
    const result = evaluateConsensus([
      { decision: 'EXECUTE' }, { decision: 'EXECUTE' }, { decision: 'HOLD' },
    ])
    expect(result.avgConfidence).toBe(0)
    expect(result.finalDecision).toBe('HOLD') // confidence gate fails
  })

  it('HOLDs on an empty verdict list (protective default)', () => {
    const result = evaluateConsensus([])
    expect(result.finalDecision).toBe('HOLD')
    expect(result.executeVotes).toBe(0)
    expect(result.avgConfidence).toBe(0)
  })

  it('HOLDs on undefined verdicts without throwing', () => {
    const result = evaluateConsensus(undefined)
    expect(result.finalDecision).toBe('HOLD')
  })

  it('returns the original verdicts array on the result for logging', () => {
    const verdicts = [v('EXECUTE', 0.9), v('EXECUTE', 0.9), v('EXECUTE', 0.9)]
    const result = evaluateConsensus(verdicts)
    expect(result.verdicts).toHaveLength(3)
    expect(result.finalDecision).toBe('EXECUTE')
  })

  it('honours custom thresholds when provided', () => {
    // Require unanimity (3) — a 2/3 majority should now HOLD.
    const result = evaluateConsensus(
      [v('EXECUTE', 0.9), v('EXECUTE', 0.9), v('HOLD', 0.9)],
      { REQUIRED_MAJORITY: 3, MIN_CONFIDENCE: 0.6 },
    )
    expect(result.finalDecision).toBe('HOLD')
    expect(result.rejectionReason).toContain('Majority voted HOLD')
  })

  it('exposes default thresholds (2/3 majority, 0.60 confidence)', () => {
    expect(CONSENSUS_THRESHOLDS.REQUIRED_MAJORITY).toBe(2)
    expect(CONSENSUS_THRESHOLDS.MIN_CONFIDENCE).toBe(0.6)
  })
})

describe('evaluateConsensus wired into the autonomous loop', () => {
  // Minimal fake stages: gates pass, sim clears the EV floor, council returns the
  // verdicts we control. evaluateConsensus is the REAL implementation under test.
  const baseStages = (verdicts) => ({
    loadConfig: async () => ({ minExpectedValueUSD: 10 }),
    loadPlaybook: async () => [],
    fetchState: async () => ({}),
    runGates: () => ({ pass: true, candidates: [{ id: 'p1' }] }),
    runSimulation: async () => ({ expectedValue: 50, base: { recommendedPool: 'aave-v3' } }),
    runCouncil: async () => verdicts,
    evaluateConsensus, // real
    executeRebalance: async () => {},
  })

  it('reports "executed" when the council reaches consensus', async () => {
    const loop = createAutonomousLoop({
      stages: baseStages([
        { decision: 'EXECUTE', confidence: 0.8 },
        { decision: 'EXECUTE', confidence: 0.7 },
        { decision: 'HOLD', confidence: 0.6 },
      ]),
      logger: { log: () => {}, error: () => {} },
    })
    const result = await loop.runOneCycle()
    expect(result.outcome).toBe('executed')
    expect(result.consensus.finalDecision).toBe('EXECUTE')
  })

  it('reports "held" when the council does not reach consensus', async () => {
    const loop = createAutonomousLoop({
      stages: baseStages([
        { decision: 'EXECUTE', confidence: 0.9 },
        { decision: 'HOLD', confidence: 0.9, keyReason: 'IL risk' },
        { decision: 'HOLD', confidence: 0.9, keyReason: 'off whitelist' },
      ]),
      logger: { log: () => {}, error: () => {} },
    })
    const result = await loop.runOneCycle()
    expect(result.outcome).toBe('held')
    expect(result.consensus.finalDecision).toBe('HOLD')
  })
})
