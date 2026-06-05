// Read-only narration for the AI-council viewer. Execution stays on orchestrator.js;
// this module only EXPLAINS what a council would think about the chosen strategy.
//
// Reuses the real, tested AI modules:
//   - runSimulation  (simulation/simulator.js) -> bull/base/bear alternate timelines
//   - runCouncil     (council/council.js)      -> 3 specialist verdicts
// Both accept an injected aiComplete and otherwise lazy-import venice.js. Adds a
// timeout race + per-strategyHash cache so the demo never stalls.

import { createState } from '../core/state.js'
import { runSimulation } from '../simulation/simulator.js'
import { runCouncil } from '../council/council.js'
import { VENICE_TIMEOUT_MS, VAULT_CATALOG } from '../config.js'

const _cache = new Map() // strategyHash -> Narration

export const FALLBACK_NARRATION = Object.freeze({
  thinkingLog: [
    { t: 0, text: 'AI council unavailable — using protective defaults.' },
    { t: 0, text: 'No rebalance proposed. Proceeding with user allocation as-is.' },
  ],
  timelines: { bull: 0, base: 0, bear: 0, weights: { bull: 0.33, base: 0.34, bear: 0.33 }, expectedValue: 0 },
  verdicts: [
    { role: 'riskAuditor', decision: 'HOLD', confidence: 0, keyReason: 'council unavailable' },
    { role: 'gasChecker', decision: 'HOLD', confidence: 0, keyReason: 'council unavailable' },
    { role: 'strategyGuard', decision: 'HOLD', confidence: 0, keyReason: 'council unavailable' },
  ],
  consensus: { finalDecision: 'HOLD', executeVotes: 0, total: 3 },
  fromCache: false,
  fallback: true,
})

/** strategy.agents -> normalized pool-shaped candidates simulator/council understand. */
export function buildCandidates(strategy) {
  return (strategy?.agents ?? []).map((a, i) => ({
    id: a.vault?.defillamaPool || `${a.vault?.protocol || 'pool'}-${i}`,
    protocol: a.vault?.protocol || 'unknown',
    apy: Number(a.vault?.apy ?? 0),
    tvlUsd: 0,
    tvlDelta24h: 0,
    ilRisk: 'low',
    audited: true,
  }))
}

/** Display-only majority vote (the production gate lives in council/consensus.js). */
export function summarizeConsensus(verdicts) {
  const total = verdicts.length || 0
  const executeVotes = verdicts.filter((v) => v.decision === 'EXECUTE').length
  return {
    finalDecision: total > 0 && executeVotes * 2 > total ? 'EXECUTE' : 'HOLD',
    executeVotes,
    total,
  }
}

/** Build a minimal canonical State from the chosen strategy + catalog pools. */
function buildNarrationState(strategy, positionsMap) {
  const pools = VAULT_CATALOG.map((v) => ({ ...v }))
  return createState({
    positionsMap: positionsMap ?? {},
    pools,
    gasPrice: 12,
    ethPriceUSD: 3000,
    turbulenceIndex: 0.2,
  })
}

function buildThinkingLog(sim, verdicts, consensus) {
  const log = []
  let t = 0
  const push = (text) => log.push({ t: t++, text })
  push('Analyzing vault allocations against live market context…')
  push(`Simulating bull / base / bear timelines (E[value] = $${(sim.expectedValue ?? 0).toFixed(2)}).`)
  for (const v of verdicts) {
    push(`${v.role}: ${v.decision} (${(v.confidence ?? 0).toFixed(2)}) — ${v.keyReason}`)
  }
  push(`Council consensus: ${consensus.finalDecision} (${consensus.executeVotes}/${consensus.total} execute).`)
  return log
}

function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

/**
 * Run the narration for a strategy. Never throws.
 * @param {object} args
 * @param {object} args.strategy
 * @param {object} [args.positionsMap]
 * @param {string} [args.strategyHash]   cache key
 * @param {Function} [args.aiComplete]   injected for tests
 * @param {Function} [args.getSentiment]
 * @param {number} [args.timeoutMs]
 * @returns {Promise<object>} Narration
 */
export async function runNarration({
  strategy, positionsMap = {}, strategyHash = null,
  aiComplete, getSentiment, timeoutMs = VENICE_TIMEOUT_MS,
}) {
  if (strategyHash && _cache.has(strategyHash)) {
    return { ..._cache.get(strategyHash), fromCache: true }
  }

  const work = (async () => {
    const state = buildNarrationState(strategy, positionsMap)
    const candidates = buildCandidates(strategy)
    const config = {
      riskTolerance: strategy?.risk ?? 'medium',
      whitelist: candidates.map((c) => c.protocol),
      thresholds: { MAX_GAS_USD: 25 },
    }

    const simDeps = {}
    if (aiComplete) simDeps.aiComplete = aiComplete
    if (getSentiment) simDeps.getSentiment = getSentiment
    const sim = await runSimulation(candidates, state, simDeps)

    const councilDeps = {}
    if (aiComplete) councilDeps.aiComplete = aiComplete
    const verdicts = await runCouncil(sim, state, config, [], councilDeps)

    const consensus = summarizeConsensus(verdicts)
    const slim = verdicts.map((v) => ({
      role: v.role, decision: v.decision, confidence: v.confidence, keyReason: v.keyReason,
    }))
    const timelines = {
      bull: sim.bull?.projectedNetYieldUSD ?? 0,
      base: sim.base?.projectedNetYieldUSD ?? 0,
      bear: sim.bear?.projectedNetYieldUSD ?? 0,
      weights: sim.weights,
      expectedValue: sim.expectedValue,
    }
    return {
      thinkingLog: buildThinkingLog(sim, slim, consensus),
      timelines, verdicts: slim, consensus,
      fromCache: false, fallback: false,
    }
  })().catch(() => ({ ...FALLBACK_NARRATION }))

  const result = await withTimeout(work, timeoutMs, { ...FALLBACK_NARRATION })
  if (strategyHash && !result.fallback) _cache.set(strategyHash, result)
  return result
}

/** Test/util — clear the module cache. */
export function _clearNarrationCache() { _cache.clear() }
