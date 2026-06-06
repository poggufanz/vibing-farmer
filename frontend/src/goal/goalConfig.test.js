// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { GOAL_DEFAULTS, normalizeGoal, loadGoal, saveGoal, GOAL_KEY } from './goalConfig.js'

beforeEach(() => localStorage.clear())

describe('normalizeGoal', () => {
  it('always yields a positive durationCycles', () => {
    expect(normalizeGoal({}).durationCycles).toBe(GOAL_DEFAULTS.durationCycles)
    expect(normalizeGoal({ durationCycles: 0 }).durationCycles).toBe(GOAL_DEFAULTS.durationCycles)
    expect(normalizeGoal({ durationCycles: 12 }).durationCycles).toBe(12)
  })

  it('coerces empty/NaN apy and profit targets to null (not a target)', () => {
    const g = normalizeGoal({ targetApyPct: '', targetProfitUsd: 'abc' })
    expect(g.targetApyPct).toBeNull()
    expect(g.targetProfitUsd).toBeNull()
  })

  it('keeps numeric apy and profit targets', () => {
    const g = normalizeGoal({ targetApyPct: '8', targetProfitUsd: 25 })
    expect(g).toMatchObject({ targetApyPct: 8, targetProfitUsd: 25 })
  })
})

describe('persistence', () => {
  it('round-trips through localStorage', () => {
    saveGoal({ targetApyPct: 8, durationCycles: 20 })
    expect(localStorage.getItem(GOAL_KEY)).toBeTruthy()
    expect(loadGoal()).toMatchObject({ targetApyPct: 8, durationCycles: 20, targetProfitUsd: null })
  })

  it('loadGoal returns defaults when nothing stored', () => {
    expect(loadGoal()).toEqual(normalizeGoal({}))
  })
})
