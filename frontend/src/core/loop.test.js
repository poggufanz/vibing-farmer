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

describe('start / stop — loop control', () => {
  it('runs cycles until stop() is called, sleeping between cycles', async () => {
    const stages = makeStages()
    let cycles = 0
    // Fake sleep that stops the loop after 3 cycles, so start() resolves deterministically.
    const sleep = vi.fn(async () => {
      cycles += 1
      if (cycles >= 3) loop.stop()
    })
    const loop = makeLoop(stages, { sleep, intervalMs: 999 })

    await loop.start()

    expect(stages.fetchState).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledWith(999)
    expect(loop.running).toBe(false)
  })

  it('does not start a second concurrent loop while already running', async () => {
    const stages = makeStages()
    const sleep = vi.fn(async () => { loop.stop() }) // stop after first cycle
    const loop = makeLoop(stages, { sleep })

    await loop.start()
    expect(stages.fetchState).toHaveBeenCalledTimes(1)

    // A guard call while not running is a no-op path; calling start again runs a fresh single cycle.
    await loop.start()
    expect(stages.fetchState).toHaveBeenCalledTimes(2)
  })

  it('survives a throwing cycle and keeps looping (uses runOneCycleSafe)', async () => {
    const stages = makeStages({
      fetchState: vi.fn(async () => { throw new Error('transient') }),
    })
    let cycles = 0
    const sleep = vi.fn(async () => { cycles += 1; if (cycles >= 2) loop.stop() })
    const loop = makeLoop(stages, { sleep, logger: { error: () => {}, log: () => {} } })

    await expect(loop.start()).resolves.toBeUndefined() // never throws out
    expect(stages.fetchState).toHaveBeenCalledTimes(2)
  })
})

// --- Goal-based rework: stage events + graceful goal stop ---
// NOTE: imports reuse the top-of-file `describe/it/expect/vi` + `createAutonomousLoop`.

function passingStages(overrides = {}) {
  return {
    loadConfig: async () => ({ minExpectedValueUSD: 0 }),
    loadPlaybook: async () => [],
    fetchState: async () => ({ pools: [] }),
    runGates: () => ({ pass: true, candidates: [] }),
    runSimulation: async () => ({ expectedValue: 100, bull: {}, base: {}, bear: {}, weights: {} }),
    runCouncil: async () => ([{ decision: 'EXECUTE', confidence: 0.9 }]),
    evaluateConsensus: () => ({ finalDecision: 'EXECUTE', executeVotes: 3, total: 3 }),
    executeRebalance: async () => ({}),
    ...overrides,
  }
}

describe('loop events + goal stop', () => {
  it('emits ordered stage events for one cycle', async () => {
    const events = []
    const loop = createAutonomousLoop({
      stages: passingStages(), onEvent: (e) => events.push(e.type),
    })
    await loop.runOneCycle()
    expect(events).toEqual([
      'cycle:start', 'state', 'gate', 'sim', 'council', 'execute', 'goal', 'cycle:end',
    ])
  })

  it('graceful-stops the run loop when the goal is met', async () => {
    let cycles = 0
    const loop = createAutonomousLoop({
      stages: passingStages(),
      sleep: async () => {},
      onEvent: () => { },
      evaluateGoal: () => { cycles += 1; return { met: cycles >= 2, progressPct: cycles * 50, axes: {} } },
    })
    await loop.start()           // resolves only because goal stops it
    expect(cycles).toBe(2)
    expect(loop.running).toBe(false)
  })

  it('emits a stopped event with reason goal_met', async () => {
    const events = []
    const loop = createAutonomousLoop({
      stages: passingStages(), sleep: async () => {},
      onEvent: (e) => events.push(e),
      evaluateGoal: () => ({ met: true, progressPct: 100, axes: {} }),
    })
    await loop.start()
    expect(events.find((e) => e.type === 'stopped')?.reason).toBe('goal_met')
  })
})
