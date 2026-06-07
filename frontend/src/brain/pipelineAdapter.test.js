// frontend/src/brain/pipelineAdapter.test.js
import { describe, it, expect } from 'vitest'
import { initialPipeline, reducePipeline, STAGE_IDS } from './pipelineAdapter.js'

const get = (p, id) => p.stages.find((s) => s.id === id)

describe('pipelineAdapter', () => {
  it('starts with 13 idle stages in canonical order', () => {
    const p = initialPipeline()
    expect(p.stages.map((s) => s.id)).toEqual(STAGE_IDS)
    expect(p.stages.every((s) => s.state === 'idle')).toBe(true)
    expect(p.revealedCount).toBe(0)
  })

  it('cycle:start marks loop running and reveals stage 1', () => {
    const p = reducePipeline(initialPipeline(), { type: 'cycle:start', cycleId: 'c1', n: 1, at: 0 })
    expect(get(p, 'loop').state).toBe('running')
    expect(p.cycleId).toBe('c1')
    expect(p.revealedCount).toBeGreaterThanOrEqual(1)
  })

  it('state event completes state stage and carries apy', () => {
    let p = reducePipeline(initialPipeline(), { type: 'cycle:start', cycleId: 'c1', n: 1, at: 0 })
    p = reducePipeline(p, { type: 'state', cycleId: 'c1', portfolioApy: 8.2, positionsUsd: 100 })
    expect(get(p, 'state').state).toBe('done')
    expect(get(p, 'state').data.portfolioApy).toBe(8.2)
  })

  it('failing gate marks gates fail and short-circuits later stages to idle', () => {
    let p = reducePipeline(initialPipeline(), { type: 'cycle:start', cycleId: 'c1', n: 1, at: 0 })
    p = reducePipeline(p, { type: 'gate', cycleId: 'c1', pass: false, reason: 'turbulence' })
    expect(get(p, 'gates').state).toBe('fail')
    expect(get(p, 'gates').data.reason).toBe('turbulence')
    expect(get(p, 'sim').state).toBe('idle')
  })

  it('council event splits into council (verdicts) + verdict (consensus) stages', () => {
    let p = initialPipeline()
    p = reducePipeline(p, { type: 'council', cycleId: 'c1',
      verdicts: [{ role: 'risk', decision: 'EXECUTE', confidence: 0.8, keyReason: 'x', citedRules: ['defi-001'] }],
      consensus: { finalDecision: 'EXECUTE', executeVotes: 2, total: 3 } })
    expect(get(p, 'council').state).toBe('done')
    expect(get(p, 'council').data.verdicts).toHaveLength(1)
    expect(get(p, 'verdict').data.consensus.finalDecision).toBe('EXECUTE')
  })

  it('execute event completes execution stage with tx hash', () => {
    const p = reducePipeline(initialPipeline(), { type: 'execute', cycleId: 'c1', outcome: 'executed', txHash: '0xabc' })
    expect(get(p, 'execution').state).toBe('done')
    expect(get(p, 'execution').data.txHash).toBe('0xabc')
  })

  it('cycle:end increments cycle count and resets per-cycle stages for next run', () => {
    let p = reducePipeline(initialPipeline(), { type: 'cycle:start', cycleId: 'c1', n: 1, at: 0 })
    p = reducePipeline(p, { type: 'cycle:end', cycleId: 'c1', outcome: 'executed' })
    expect(p.cyclesDone).toBe(1)
  })
})
