import { describe, it, expect, vi } from 'vitest'
import { buildStages, createVibingFarmerAgent } from './composeAgent.js'

const memStorage = () => { let rows = []; return { read: () => rows, write: (r) => { rows = r } } }

describe('buildStages', () => {
  it('exposes every stage key the loop contract requires', () => {
    const stages = buildStages({
      walletAddress: '0xUser',
      decisionLog: { append: () => {}, getPending: () => [], update: () => {}, all: () => [], hoursSinceLastRebalance: () => Infinity },
      playbookStore: { load: () => [], save: () => {} },
    })
    for (const key of ['loadConfig', 'loadPlaybook', 'fetchState', 'runGates', 'runSimulation', 'runCouncil', 'evaluateConsensus', 'executeRebalance']) {
      expect(typeof stages[key]).toBe('function')
    }
  })
})

describe('createVibingFarmerAgent', () => {
  it('builds a loop with start/stop and an outcome evaluator with run()', () => {
    const agent = createVibingFarmerAgent({
      walletAddress: '0xUser',
      storage: { decisionLog: memStorage(), playbook: memStorage() },
    })
    expect(typeof agent.start).toBe('function')
    expect(typeof agent.stop).toBe('function')
    expect(typeof agent.loop.runOneCycle).toBe('function')
    expect(typeof agent.outcomeEvaluator.run).toBe('function')
  })

  it('runs the outcome evaluator once on start and schedules it', async () => {
    const setIntervalSpy = vi.fn(() => 1)
    const runSpy = vi.fn(async () => ({ evaluated: 0, skipped: 0, failed: 0 }))
    const agent = createVibingFarmerAgent({
      walletAddress: '0xUser',
      storage: { decisionLog: memStorage(), playbook: memStorage() },
      scheduler: { setInterval: setIntervalSpy, clearInterval: vi.fn() },
      overrides: { outcomeEvaluator: { run: runSpy }, autoStartLoop: false },
    })
    await agent.start()
    expect(runSpy).toHaveBeenCalledTimes(1)
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
  })

  it('stop() halts the loop and clears the evaluator schedule', async () => {
    const clearSpy = vi.fn()
    const agent = createVibingFarmerAgent({
      walletAddress: '0xUser',
      storage: { decisionLog: memStorage(), playbook: memStorage() },
      scheduler: { setInterval: () => 42, clearInterval: clearSpy },
      overrides: { outcomeEvaluator: { run: async () => ({}) }, autoStartLoop: false },
    })
    await agent.start()
    agent.stop()
    expect(clearSpy).toHaveBeenCalledWith(42)
    expect(agent.loop.running).toBe(false)
  })
})
