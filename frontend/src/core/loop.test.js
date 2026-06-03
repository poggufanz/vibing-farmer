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

describe('runOneCycle — gate short-circuit', () => {
  it('stops at a blocked gate and skips simulation, council, execution', async () => {
    const stages = makeStages({
      runGates: vi.fn(() => ({ pass: false, reason: 'cooldown active' })),
    })
    const loop = makeLoop(stages)

    const result = await loop.runOneCycle()

    expect(result.outcome).toBe('gate_blocked')
    expect(result.reason).toBe('cooldown active')
    expect(stages.runSimulation).not.toHaveBeenCalled()
    expect(stages.runCouncil).not.toHaveBeenCalled()
    expect(stages.executeRebalance).not.toHaveBeenCalled()
  })

  it('forwards gate candidates into the simulation on pass', async () => {
    const stages = makeStages({
      runGates: vi.fn(() => ({ pass: true, candidates: [{ id: 'pool-7' }] })),
    })
    const loop = makeLoop(stages)

    await loop.runOneCycle()

    expect(stages.runSimulation).toHaveBeenCalledWith([{ id: 'pool-7' }], expect.anything())
  })
})

describe('runOneCycle — simulation short-circuit', () => {
  it('stops when expected value is below the configured minimum', async () => {
    const stages = makeStages({
      loadConfig: vi.fn(async () => ({ minExpectedValueUSD: 10 })),
      runSimulation: vi.fn(async () => ({ expectedValue: 4 })), // below 10
    })
    const loop = makeLoop(stages)

    const result = await loop.runOneCycle()

    expect(result.outcome).toBe('sim_rejected')
    expect(result.expectedValue).toBe(4)
    expect(stages.runCouncil).not.toHaveBeenCalled()
    expect(stages.executeRebalance).not.toHaveBeenCalled()
  })

  it('proceeds to council when expected value meets the minimum', async () => {
    const stages = makeStages({
      loadConfig: vi.fn(async () => ({ minExpectedValueUSD: 10 })),
      runSimulation: vi.fn(async () => ({ expectedValue: 10 })), // exactly at threshold passes
    })
    const loop = makeLoop(stages)

    const result = await loop.runOneCycle()

    expect(result.outcome).toBe('executed')
    expect(stages.runCouncil).toHaveBeenCalledTimes(1)
  })
})

describe('runOneCycleSafe — crash recovery', () => {
  it('catches a thrown stage error and returns an error envelope instead of throwing', async () => {
    const boom = new Error('DeFiLlama 503')
    const stages = makeStages({
      fetchState: vi.fn(async () => { throw boom }),
    })
    const errorLog = vi.fn()
    const loop = makeLoop(stages, { logger: { error: errorLog, log: () => {} } })

    const result = await loop.runOneCycleSafe()

    expect(result.outcome).toBe('error')
    expect(result.error).toBe('DeFiLlama 503')
    expect(errorLog).toHaveBeenCalledTimes(1)
  })

  it('returns the normal cycle result when nothing throws', async () => {
    const loop = makeLoop(makeStages())
    const result = await loop.runOneCycleSafe()
    expect(result.outcome).toBe('executed')
  })
})
