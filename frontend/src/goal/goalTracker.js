// Pure goal scoring. Each specified axis -> {target,current,met}; overall progress is
// the MIN across specified axes (binding constraint); met = all specified axes met.
// durationCycles is always specified. apy/profit are skipped when null.

const pct = (current, target) => {
  if (!(target > 0)) return current > 0 ? 100 : 0
  return Math.max(0, Math.min(100, (current / target) * 100))
}

/**
 * @param {{targetApyPct:number|null,targetProfitUsd:number|null,durationCycles:number}} goal
 * @param {{apyPct:number,valueUsd:number,principalUsd:number}} portfolio
 * @param {number} cyclesDone
 * @returns {{axes:object, progressPct:number, met:boolean}}
 */
export function evaluateGoal(goal, portfolio, cyclesDone) {
  const axes = { apy: null, profit: null, duration: null }
  const parts = []

  if (goal.targetApyPct != null) {
    const current = portfolio?.apyPct ?? 0
    const met = current >= goal.targetApyPct
    axes.apy = { target: goal.targetApyPct, current, met }
    parts.push({ p: pct(current, goal.targetApyPct), met })
  }

  if (goal.targetProfitUsd != null) {
    const current = (portfolio?.valueUsd ?? 0) - (portfolio?.principalUsd ?? 0)
    const met = current >= goal.targetProfitUsd
    axes.profit = { target: goal.targetProfitUsd, current, met }
    parts.push({ p: pct(current, goal.targetProfitUsd), met })
  }

  const dMet = cyclesDone >= goal.durationCycles
  axes.duration = { target: goal.durationCycles, current: cyclesDone, met: dMet }
  parts.push({ p: pct(cyclesDone, goal.durationCycles), met: dMet })

  const progressPct = Math.round(Math.min(...parts.map((x) => x.p)))
  const met = parts.every((x) => x.met)
  return { axes, progressPct, met }
}
