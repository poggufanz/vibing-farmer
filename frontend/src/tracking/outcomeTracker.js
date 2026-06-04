// outcomeTracker.js — Step 10: delayed (7-day) outcome evaluator.
// Runs OUTSIDE the decision loop (async / scheduled). Reads pending_evaluation entries
// from the injected decision log (logger.js), computes realized yield, patches the log
// with the outcome, and feeds ground truth to the optional Reflector (Step 11).
//
// Mirrors logger.js / executor.js: pure helpers (unit-tested directly) + an
// injected-dependency orchestrator + a factory that binds real deps once. No network,
// no AI, no clock in the pure helpers.

const EVALUATION_DELAY_DAYS = 7
const MAX_EVAL_PERIOD_DAYS = 14
const DAY_MS = 86_400_000

// ─── Pure helpers (no I/O — unit-tested directly) ───────────────────────────────

/**
 * Mean of the `apy` field across history points. Returns null when there is no usable
 * data (null history, empty array, or no numeric points) so callers can fall back.
 *
 * @param {Array<{apy:number}>|null} [history]
 * @returns {number|null}
 */
export function averageApy(history) {
  if (!Array.isArray(history) || history.length === 0) return null
  const nums = history.filter(h => typeof h?.apy === 'number' && Number.isFinite(h.apy)).map(h => h.apy)
  if (nums.length === 0) return null
  return nums.reduce((s, n) => s + n, 0) / nums.length
}

/**
 * Elapsed days between a decision timestamp and now, clamped to [0, capDays].
 *
 * @param {number} timestamp  decision execution time (ms)
 * @param {number} now        current time (ms, injected)
 * @param {number} capDays
 * @returns {number}
 */
export function evalPeriodDays(timestamp, now, capDays) {
  const elapsed = (now - timestamp) / DAY_MS
  return Math.min(Math.max(elapsed, 0), capDays)
}
