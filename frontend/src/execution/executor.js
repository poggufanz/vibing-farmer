// executor.js — Step 9: Execution Layer (MetaMask Smart Accounts + 1Shot, real path).
// Turns a council consensus into either a real on-chain deposit (EXECUTE) or a logged
// HOLD, and records every decision to the Step 7 decision log so the Step 10 outcome
// tracker can evaluate it 7 days later.
//
// Dependency-injected like simulator.js / council.js: the transport (submitDeposit),
// the decision log, and the clock are all passed in, so the module tests with zero
// network / AI / ethers. The single ethers touch (hashing the agentId) lives in the
// bound default transport in createExecutionStage — never in a pure helper.
//
// SCOPE NOTE: a true rebalance is withdraw(fromVault) + deposit(toVault). This executor
// models only the DEPOSIT leg into toVault (as the build guide's single oneShotExecute
// call did) and records fromVault for attribution. The withdraw leg is owned by the
// background agent's relayWithdraw / a future atomic router — out of scope here.

const USDC_DECIMALS = 6
const GAS_UNITS_PER_REBALANCE = 300_000 // matches gates.js / simulator.js / council.js

// ─── Pure helpers (no I/O, no ethers — unit-tested directly) ────────────────────

/**
 * Convert a USD number to 6-decimal USDC wei. Floors sub-wei fractions; clamps to >= 0.
 * @param {number} [usd]
 * @returns {bigint}
 */
export function usdToUsdcWei(usd) {
  const n = Number(usd)
  if (!Number.isFinite(n) || n <= 0) return 0n
  return BigInt(Math.floor(n * 10 ** USDC_DECIMALS))
}

/**
 * Estimate the USD gas cost of one rebalance tx — same formula the council uses.
 * @param {{gasPrice?:number, ethPriceUSD?:number}} state
 * @returns {number}
 */
export function estimateGasUSD(state) {
  const gasPrice = state?.gasPrice ?? 0
  const ethPriceUSD = state?.ethPriceUSD ?? 0
  return (gasPrice * GAS_UNITS_PER_REBALANCE * ethPriceUSD) / 1e9
}

/**
 * Resolve the AI's recommended PROTOCOL name to a concrete vault address via the same
 * protocol join the council uses (council.js:47). Returns null when unresolvable.
 * @param {string|null} recommendedPool  protocol name, e.g. 'morpho-blue'
 * @param {{pools?:Array<{id:string,protocol:string}>}} state
 * @returns {string|null} vault address (pool.id) or null
 */
export function resolveTargetVault(recommendedPool, state) {
  if (!recommendedPool) return null
  const match = (state?.pools ?? []).find(p => p.protocol === recommendedPool)
  return match?.id ?? null
}

/** Deterministic agentId seed namespaced for the autonomous rebalancer (hashed later). */
export function agentSeedFor(toVault) {
  return `yv-auto-${String(toVault).toLowerCase()}`
}

/** Total portfolio value in USD across all positions. */
export function sumPositionsUSD(state) {
  return (state?.positions ?? []).reduce((s, p) => s + (p.amountUSD ?? 0), 0)
}

/**
 * Build the pending_evaluation entry written after a successful deposit. Carries
 * everything Step 10 (outcome) + Step 11 (reflector) need. No id — the log assigns it.
 */
export function buildExecuteEntry({ now, fromVault, toVault, amountUSD, txResult, gasCostUSD, sim, consensus }) {
  const verdicts = consensus.verdicts ?? []
  const citedRules = [...new Set(verdicts.flatMap(v => v.citedRules ?? []))]
  const councilInsights = verdicts.map(v => v.newInsight).filter(Boolean)

  return {
    timestamp: now,
    type: 'rebalance',
    fromVault,
    toVault,
    amountUSD,
    txHash: txResult.txHash,
    gasCostUSD,
    simResult: {
      expectedValue: sim.expectedValue,
      weights: sim.weights,
      bull: sim.bull,
      base: sim.base,
      bear: sim.bear,
    },
    councilVerdicts: verdicts,
    citedRules,
    councilInsights,
    status: 'pending_evaluation',
    actualYield7dUSD: null,
    evaluatedAt: null,
  }
}

/**
 * Build the completed HOLD/skip entry. `reason` defaults to the consensus rejection
 * reason; pass an override for skip cases (no target vault, no funds).
 */
export function buildHoldEntry({ now, consensus, sim, reason }) {
  return {
    timestamp: now,
    type: 'hold',
    reason: reason ?? consensus.rejectionReason,
    executeVotes: consensus.executeVotes,
    holdVotes: consensus.holdVotes,
    avgConfidence: consensus.avgConfidence,
    expectedValueUSD: sim?.expectedValue ?? null,
    status: 'completed',
  }
}

/** Build the failed entry written when a deposit was attempted but threw. */
export function buildFailedEntry({ now, fromVault, toVault, amountUSD, error, consensus }) {
  return {
    timestamp: now,
    type: 'rebalance',
    fromVault,
    toVault,
    amountUSD,
    error,
    councilVerdicts: consensus.verdicts ?? [],
    status: 'failed',
  }
}

// ─── Orchestrator ───────────────────────────────────────────────────────────────

/**
 * Turn a consensus verdict into a real deposit (EXECUTE) or a logged HOLD/skip.
 * Never throws — a thrown deposit is caught and recorded as a `failed` entry. The loop
 * derives its own outcome from `consensus.finalDecision` (loop.js:54), so the return
 * value here is for callers/UI/tests, not the loop.
 *
 * @param {object} consensus  evaluateConsensus() result (consensus.js)
 * @param {object} sim        runSimulation() result (simulator.js)
 * @param {object} state      canonical State (state.js)
 * @param {object} config     strategy config { walletAddress, permissionContext, ... }
 * @param {object} deps
 * @param {(a:{user,vault,amountWei,agentSeed,permissionContext})=>Promise<{txHash:string,status?:string}>} deps.submitDeposit
 * @param {{append:Function}} deps.decisionLog  from createDecisionLog()
 * @param {()=>number} [deps.now]
 * @param {{log?:Function,error?:Function}} [deps.logger]
 * @returns {Promise<{executed:boolean, txHash?:string, decisionId?:string, reason?:string, error?:string}>}
 */
export async function executeRebalance(consensus, sim, state, config, deps) {
  const { submitDeposit, decisionLog, now = () => Date.now(), logger = console } = deps

  // 1. Council said HOLD → log and stop. No transport touched.
  if (consensus.finalDecision !== 'EXECUTE') {
    logger.log?.(`[exec] HOLD: ${consensus.rejectionReason}`)
    decisionLog.append(buildHoldEntry({ now: now(), consensus, sim }))
    return { executed: false, reason: consensus.rejectionReason }
  }

  // 2. Resolve the AI's recommended protocol → concrete vault address.
  const recommendedPool = sim.base?.recommendedPool ?? null
  const toVault = resolveTargetVault(recommendedPool, state)
  if (!toVault) {
    const reason = `Could not resolve target vault for "${recommendedPool}"`
    logger.log?.(`[exec] skip: ${reason}`)
    decisionLog.append(buildHoldEntry({ now: now(), consensus, sim, reason }))
    return { executed: false, reason }
  }

  // 3. Size the move. Zero portfolio → nothing to deposit.
  const fromVault = state.positions?.[0]?.vault ?? null
  const amountUSD = sumPositionsUSD(state)
  if (amountUSD <= 0) {
    const reason = 'No portfolio funds to rebalance'
    logger.log?.(`[exec] skip: ${reason}`)
    decisionLog.append(buildHoldEntry({ now: now(), consensus, sim, reason }))
    return { executed: false, reason }
  }

  // 4. Execute the deposit leg via the injected transport (real path = relayDeposit).
  const amountWei = usdToUsdcWei(amountUSD)
  const gasCostUSD = estimateGasUSD(state)

  try {
    const txResult = await submitDeposit({
      user: config.walletAddress,
      vault: toVault,
      amountWei,
      agentSeed: agentSeedFor(toVault),
      permissionContext: config.permissionContext,
    })

    const stored = decisionLog.append(
      buildExecuteEntry({ now: now(), fromVault, toVault, amountUSD, txResult, gasCostUSD, sim, consensus }),
    )

    logger.log?.(`[exec] EXECUTED ${fromVault} → ${toVault} · tx ${txResult.txHash} · ${stored.id}`)
    return { executed: true, txHash: txResult.txHash, decisionId: stored.id }
  } catch (err) {
    logger.error?.(`[exec] deposit failed: ${err.message}`)
    decisionLog.append(buildFailedEntry({ now: now(), fromVault, toVault, amountUSD, error: err.message, consensus }))
    return { executed: false, error: err.message }
  }
}

// ─── Default transport + stage factory ──────────────────────────────────────────

// Real deposit path: lazy-import ethers + relay.js so pure-function tests never load
// the on-chain module graph. Hashes the agent seed to a bytes32 agentId, then routes
// through relayDeposit (1Shot Managed API on Base Sepolia, with on-chain fallback).
const defaultSubmitDeposit = async ({ user, vault, amountWei, agentSeed, permissionContext }) => {
  const { ethers } = await import('ethers')
  const { relayDeposit } = await import('../relay.js')
  const agentId = ethers.id(agentSeed)
  return relayDeposit({ agentId, user, vault, amount: amountWei, permissionContext })
}

/**
 * Bind real deps once and return the `stages.executeRebalance(consensus, sim, state, config)`
 * function the loop expects (loop.js:50). Step 14 (main wiring) calls this with the real
 * decision log (createDecisionLog()) and, by default, the real on-chain transport.
 *
 * @param {object} deps
 * @param {{append:Function}} deps.decisionLog              required — from createDecisionLog()
 * @param {Function} [deps.submitDeposit]                   default: relayDeposit-backed transport
 * @param {()=>number} [deps.now]
 * @param {object} [deps.logger]
 * @returns {(consensus:object, sim:object, state:object, config:object)=>Promise<object>}
 */
export function createExecutionStage(deps) {
  const { decisionLog, submitDeposit = defaultSubmitDeposit, now, logger } = deps
  return (consensus, sim, state, config) =>
    executeRebalance(consensus, sim, state, config, { submitDeposit, decisionLog, now, logger })
}
