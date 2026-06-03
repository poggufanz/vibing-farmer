import { describe, it, expect, vi } from 'vitest'
import { createAutonomousLoop } from './loop.js'

const FIXED_NOW = 1_750_000_000_000

// A fully-passing set of fake stages. Each test overrides only what it needs.
function makeStages(overrides = {}) {
  return {
    loadConfig: vi.fn(async () => ({ minExpectedValueUSD: 10 })),
    loadPlaybook: vi.fn(async () => []),
    fetchState: vi.fn(async () => ({ positions: [], pools: [] })),
    runGates: vi.fn(() => ({ pass: true, candidates: [{ id: 'pool-1' }] })),
    runSimulation: vi.fn(async () => ({ expectedValue: 42 })),
    runCouncil: vi.fn(async () => [{ decision: 'EXECUTE' }]),
    evaluateConsensus: vi.fn(() => ({ finalDecision: 'EXECUTE' })),
    executeRebalance: vi.fn(async () => ({ executed: true })),
    ...overrides,
  }
}

function makeLoop(stages, extra = {}) {
  return createAutonomousLoop({
    stages,
    now: () => FIXED_NOW,
    sleep: async () => {},
    logger: { error: () => {} },
    ...extra,
  })
}

describe('runOneCycle — happy path', () => {
  it('runs every stage in order and reports executed', async () => {
    const stages = makeStages()
    const loop = makeLoop(stages)

    const result = await loop.runOneCycle()

    expect(result.outcome).toBe('executed')
    expect(result.cycleId).toBe(`cycle-${FIXED_NOW}`)

    expect(stages.runSimulation).toHaveBeenCalledTimes(1)
    // Council receives sim result + playbook.
    expect(stages.runCouncil).toHaveBeenCalledTimes(1)
    expect(stages.executeRebalance).toHaveBeenCalledTimes(1)
  })

  it('reports held when consensus is HOLD', async () => {
    const stages = makeStages({
      evaluateConsensus: vi.fn(() => ({ finalDecision: 'HOLD', rejectionReason: 'low confidence' })),
      executeRebalance: vi.fn(async () => ({ executed: false })),
    })
    const loop = makeLoop(stages)

    const result = await loop.runOneCycle()

    expect(result.outcome).toBe('held')
    expect(result.consensus.rejectionReason).toBe('low confidence')
    // executeRebalance is still called — it owns the HOLD logging path.
    expect(stages.executeRebalance).toHaveBeenCalledTimes(1)
  })
})
