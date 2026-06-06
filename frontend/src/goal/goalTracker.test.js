import { describe, it, expect } from 'vitest'
import { evaluateGoal } from './goalTracker.js'

const portfolio = { apyPct: 5.2, valueUsd: 112, principalUsd: 100 }

describe('evaluateGoal', () => {
  it('duration-only goal tracks cycles completed', () => {
    const g = { targetApyPct: null, targetProfitUsd: null, durationCycles: 10 }
    const p = evaluateGoal(g, portfolio, 5)
    expect(p.axes.duration).toEqual({ target: 10, current: 5, met: false })
    expect(p.axes.apy).toBeNull()
    expect(p.progressPct).toBe(50)
    expect(p.met).toBe(false)
  })

  it('met only when EVERY specified axis is met', () => {
    const g = { targetApyPct: 5, targetProfitUsd: 10, durationCycles: 3 }
    const p = evaluateGoal(g, portfolio, 3) // apy 5.2>=5, profit 12>=10, cycles 3>=3
    expect(p.met).toBe(true)
    expect(p.progressPct).toBe(100)
  })

  it('binding constraint = the least-complete axis', () => {
    const g = { targetApyPct: 8, targetProfitUsd: null, durationCycles: 4 }
    // apy 5.2/8 = 65%, duration 4/4 = 100% -> min 65, not met (apy short)
    const p = evaluateGoal(g, portfolio, 4)
    expect(p.progressPct).toBe(65)
    expect(p.met).toBe(false)
  })

  it('clamps each axis to 100 and never divides by zero', () => {
    const g = { targetApyPct: 0, targetProfitUsd: null, durationCycles: 5 }
    const p = evaluateGoal(g, portfolio, 99)
    expect(p.axes.duration.current).toBe(99)
    expect(p.progressPct).toBeLessThanOrEqual(100)
  })

  it('profit axis uses value minus principal', () => {
    const g = { targetApyPct: null, targetProfitUsd: 20, durationCycles: 50 }
    const p = evaluateGoal(g, portfolio, 1) // profit 12/20 = 60%
    expect(p.axes.profit).toEqual({ target: 20, current: 12, met: false })
  })
})
