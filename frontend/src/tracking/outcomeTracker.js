import { calculateReward } from '../core/state.js'

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

/**
 * Simple (non-compounding) realized gross yield over a day window.
 *   yield = amountUSD * (apyPercent / 100) * (days / 365)
 * Returns 0 when apy is unknown or amount is non-positive.
 *
 * @param {{amountUSD?:number, apyPercent?:number|null, days?:number}} args
 * @returns {number}
 */
export function computeGrossYieldUSD({ amountUSD = 0, apyPercent = null, days = 0 } = {}) {
  const apy = Number(apyPercent)
  if (!Number.isFinite(apy) || amountUSD <= 0) return 0
  return amountUSD * (apy / 100) * (days / 365)
}

/**
 * How close the simulation's expected value was to the realized net result, as a
 * percentage in [0, 100]. 0 when there is no non-zero prediction to score against.
 *
 * @param {number} predicted  sim expectedValue
 * @param {number} actual     realized netResult
 * @returns {number}
 */
export function computePredictionAccuracyPct(predicted, actual) {
  if (!predicted) return 0
  const errorPct = (Math.abs(predicted - actual) / Math.abs(predicted)) * 100
  return Math.max(0, 100 - errorPct)
}

/**
 * Assemble the decision-log patch and the reflector outcome from a realized yield.
 * Net result reuses calculateReward (state.js) — IL is 0 until a price oracle lands.
 *
 * @param {object} args
 * @param {number} args.actualYieldUSD
 * @param {number} args.gasCostUSD
 * @param {number} args.predictedUSD   sim expectedValue
 * @param {number} args.days           eval window (already capped)
 * @param {'defillama'|'catalog'|'unavailable'} args.yieldSource
 * @param {number} args.now            injected clock (ms)
 * @returns {{patch:object, outcome:object}}
 */
export function buildEvaluationPatch({ actualYieldUSD, gasCostUSD, predictedUSD, days, yieldSource, now }) {
  const netResultUSD = calculateReward({ actualYieldUSD, gasCostUSD })
  const wasProfit = netResultUSD > 0
  const predictionAccuracyPct = computePredictionAccuracyPct(predictedUSD, netResultUSD)

  const patch = {
    actualYield7dUSD: actualYieldUSD,
    netResultUSD,
    wasProfit,
    predictionAccuracyPct,
    evalPeriodDays: days,
    yieldSource,
    status: 'evaluated',
    evaluatedAt: now,
  }

  const outcome = { actualYieldUSD, netResultUSD, wasProfit, predictionAccuracyPct }

  return { patch, outcome }
}

// ─── Orchestrator (injected I/O — runs outside the decision loop) ────────────────

/**
 * Evaluate every aged pending_evaluation rebalance: compute realized yield, patch the
 * decision log, and (when there is real ground truth) feed the Reflector. Never throws —
 * a single decision's failure is logged and the rest continue.
 *
 * @param {object} deps
 * @param {{getPending:Function, update:Function}} deps.decisionLog  from createDecisionLog()
 * @param {(poolId:string)=>Promise<Array|null>} deps.fetchApyHistory  apyHistory.js
 * @param {Object<string,number>} [deps.catalogApyByVault]  lowercased vault addr → apy fallback
 * @param {(decision:object, outcome:object)=>Promise<void>} [deps.reflector]  Step 11 (optional)
 * @param {number} [deps.delayDays]   default EVALUATION_DELAY_DAYS
 * @param {number} [deps.capDays]     default MAX_EVAL_PERIOD_DAYS
 * @param {()=>number} [deps.now]
 * @param {{log?:Function,error?:Function}} [deps.logger]
 * @returns {Promise<{evaluated:number, skipped:number, failed:number}>}
 */
export async function runOutcomeEvaluator(deps) {
  const {
    decisionLog,
    fetchApyHistory,
    catalogApyByVault = {},
    reflector,
    delayDays = EVALUATION_DELAY_DAYS,
    capDays = MAX_EVAL_PERIOD_DAYS,
    now = () => Date.now(),
    logger = console,
  } = deps

  const pending = decisionLog.getPending(delayDays)
  let evaluated = 0, skipped = 0, failed = 0

  for (const decision of pending) {
    if (decision.type !== 'rebalance') { skipped += 1; continue }

    try {
      await evaluateOne(decision, { fetchApyHistory, catalogApyByVault, reflector, capDays, now, decisionLog, logger })
      evaluated += 1
    } catch (err) {
      failed += 1
      logger.error?.(`[outcome] failed to evaluate ${decision.id}: ${err.message}`)
    }
  }

  logger.log?.(`[outcome] evaluated=${evaluated} skipped=${skipped} failed=${failed}`)
  return { evaluated, skipped, failed }
}

async function evaluateOne(decision, ctx) {
  const { fetchApyHistory, catalogApyByVault, reflector, capDays, now, decisionLog } = ctx
  const nowMs = now()

  const history = await fetchApyHistory(decision.toVault)
  const fromHistory = averageApy(history)
  const fromCatalog = catalogApyByVault[String(decision.toVault).toLowerCase()] ?? null

  let apyPercent, yieldSource
  if (fromHistory != null) { apyPercent = fromHistory; yieldSource = 'defillama' }
  else if (fromCatalog != null) { apyPercent = fromCatalog; yieldSource = 'catalog' }
  else { apyPercent = null; yieldSource = 'unavailable' }

  const days = evalPeriodDays(decision.timestamp, nowMs, capDays)
  const actualYieldUSD = computeGrossYieldUSD({ amountUSD: decision.amountUSD, apyPercent, days })

  const { patch, outcome } = buildEvaluationPatch({
    actualYieldUSD,
    gasCostUSD: decision.gasCostUSD ?? 0,
    predictedUSD: decision.simResult?.expectedValue ?? 0,
    days,
    yieldSource,
    now: nowMs,
  })
  decisionLog.update(decision.id, patch)

  if (reflector && yieldSource !== 'unavailable') {
    await reflector(decision, outcome)
  }
}
