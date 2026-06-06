// The user's goal: what "done" means for the autonomous agent. durationCycles is
// always present (the reliably-moving axis on a flat-APY MockVault); apy/profit are
// optional live-read targets. Persisted as one JSON blob, like settingsStore entries.

export const GOAL_KEY = 'yv_goal'

export const GOAL_DEFAULTS = Object.freeze({
  targetApyPct: null,
  targetProfitUsd: null,
  durationCycles: 20,
})

const toNumOrNull = (v) => {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Coerce arbitrary input into a valid Goal. durationCycles floors to >= 1. */
export function normalizeGoal(input = {}) {
  const durationRaw = Number(input.durationCycles)
  const durationCycles = Number.isFinite(durationRaw) && durationRaw >= 1
    ? Math.floor(durationRaw)
    : GOAL_DEFAULTS.durationCycles
  return {
    targetApyPct: toNumOrNull(input.targetApyPct),
    targetProfitUsd: toNumOrNull(input.targetProfitUsd),
    durationCycles,
  }
}

export function saveGoal(goal) {
  const g = normalizeGoal(goal)
  localStorage.setItem(GOAL_KEY, JSON.stringify(g))
  return g
}

export function loadGoal() {
  try {
    const raw = localStorage.getItem(GOAL_KEY)
    return raw ? normalizeGoal(JSON.parse(raw)) : normalizeGoal({})
  } catch {
    return normalizeGoal({})
  }
}
