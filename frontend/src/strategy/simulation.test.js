// frontend/src/strategy/simulation.test.js
import { describe, it, expect } from 'vitest'
import { simulatePath, runScenario, SCENARIOS } from './simulation.js'
import { makeRng } from './rng.js'

// Minimal hand-built StrategyState — the engine must not depend on buildStrategyState.
function makeState(over = {}) {
  return {
    capital: { amountUsdc: 1000, heldUsdc: 0 },
    universe: [
      { address: '0xA', apy: 5 },
      { address: '0xB', apy: 10 },
    ],
    market: { turbulence: 'calm', signals: [] },
    ...over,
  }
}

const flat = { name: 'base', apyDriftPct: 0, apyVolPct: 0, gasMultiplier: 1 }

describe('simulatePath', () => {
  it('blends APY from allocation weights against the universe', () => {
    const allocations = [
      { address: '0xA', allocation: 0.5 },
      { address: '0xB', allocation: 0.5 },
    ]
    const r = simulatePath(allocations, makeState(), flat, makeRng(1), { horizonDays: 365, entryGasUsdc: 0 })
    expect(r.blendedApy).toBe(7.5)
    // 1000 * 7.5% over 365 days, no drift/noise/gas ≈ 75 USDC
    expect(r.netYieldUsdc).toBeCloseTo(75, 0)
  })

  it('prefers the allocation-carried apy over the universe apy', () => {
    const allocations = [{ address: '0xA', allocation: 1, apy: 20 }]
    const r = simulatePath(allocations, makeState(), flat, makeRng(1), { horizonDays: 365, entryGasUsdc: 0 })
    expect(r.blendedApy).toBe(20)
  })

  it('subtracts a one-time entry gas cost scaled by gasMultiplier', () => {
    const allocations = [{ address: '0xA', allocation: 1 }]
    const noGas = simulatePath(allocations, makeState(), flat, makeRng(5), { horizonDays: 30, entryGasUsdc: 0 })
    const withGas = simulatePath(allocations, makeState(), { ...flat, gasMultiplier: 2 }, makeRng(5), { horizonDays: 30, entryGasUsdc: 3 })
    expect(+(noGas.netYieldUsdc - withGas.netYieldUsdc).toFixed(2)).toBe(6) // 3 * 2
  })

  it('never lets APY go negative under heavy downward drift', () => {
    const allocations = [{ address: '0xA', allocation: 1 }]
    const r = simulatePath(allocations, makeState(), { name: 'bear', apyDriftPct: -10000, apyVolPct: 0, gasMultiplier: 1 }, makeRng(2), { horizonDays: 30, entryGasUsdc: 0 })
    expect(r.finalApy).toBeGreaterThanOrEqual(0)
  })

  it('is deterministic for a given seed', () => {
    const allocations = [{ address: '0xA', allocation: 1 }]
    const opts = { horizonDays: 30, entryGasUsdc: 0.5 }
    const params = { name: 'base', apyDriftPct: 0, apyVolPct: 2, gasMultiplier: 1 }
    expect(simulatePath(allocations, makeState(), params, makeRng(8), opts).netYieldUsdc)
      .toBe(simulatePath(allocations, makeState(), params, makeRng(8), opts).netYieldUsdc)
  })
})

describe('runScenario', () => {
  const allocations = [{ address: '0xB', allocation: 1, apy: 10 }]

  it('returns distribution stats over the requested number of runs', () => {
    const r = runScenario(allocations, makeState(), SCENARIOS[1], { runs: 200, horizonDays: 30, entryGasUsdc: 0, seed: 1 })
    expect(r.name).toBe('base')
    expect(r.runs).toBe(200)
    expect(r.mean).toBeGreaterThan(0)
    expect(r.p5).toBeLessThanOrEqual(r.p50)
    expect(r.p50).toBeLessThanOrEqual(r.p95)
    expect(r.min).toBeLessThanOrEqual(r.max)
    expect(r.probProfit).toBeGreaterThanOrEqual(0)
    expect(r.probProfit).toBeLessThanOrEqual(1)
  })

  it('is deterministic for a given seed', () => {
    const opts = { runs: 50, horizonDays: 30, entryGasUsdc: 0.5, seed: 7 }
    const a = runScenario(allocations, makeState(), SCENARIOS[0], opts)
    const b = runScenario(allocations, makeState(), SCENARIOS[0], opts)
    expect(a).toEqual(b)
  })

  it('a bear scenario has a lower mean than a bull scenario', () => {
    const opts = { runs: 300, horizonDays: 60, entryGasUsdc: 0.5, seed: 4 }
    const bull = runScenario(allocations, makeState(), SCENARIOS[0], opts)
    const bear = runScenario(allocations, makeState(), SCENARIOS[2], opts)
    expect(bull.mean).toBeGreaterThan(bear.mean)
  })
})
