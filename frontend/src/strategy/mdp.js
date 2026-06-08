// Formal Markov Decision Process model for the /strategy wizard.
// Inspired by FinRL (AI4Finance Foundation): every strategy decision is framed as
// State (what the strategist observes) -> Action (what it may do, bounded) ->
// Reward (how the strategy is scored). This module is the single source of truth
// for that vocabulary. Pure functions only — no React, no network, no storage.

import { VAULT_CATALOG } from '../config.js'

/** Risk ordering used by the action-space ceiling. Lower = safer. */
export const RISK_RANK = { low: 0, medium: 1, high: 2 }

/** Normalize the app's internal 'med' and any casing to canonical low|medium|high. */
export function normalizeRisk(risk) {
  const r = String(risk || '').toLowerCase()
  if (r === 'med') return 'medium'
  if (r === 'low' || r === 'medium' || r === 'high') return r
  return 'medium'
}

const TURBULENT_KEYWORDS = ['exploit', 'hack', 'depeg', 'collapse', 'insolven', 'drain', 'attack']
const ELEVATED_KEYWORDS = ['volatil', 'uncertain', 'compress', 'caution', 'outflow', 'liquidat', 'downturn']

/**
 * FinRL turbulence-index analog: classify the market regime from the live
 * market-context string. Deterministic keyword scan — no AI call.
 * @param {string|null} marketContext
 * @returns {{ turbulence:'calm'|'elevated'|'turbulent', signals:string[] }}
 */
export function deriveTurbulence(marketContext) {
  const text = String(marketContext || '').toLowerCase()
  if (!text) return { turbulence: 'calm', signals: [] }
  const hit = (kws) => kws.filter((k) => text.includes(k))
  const turbulent = hit(TURBULENT_KEYWORDS)
  if (turbulent.length) return { turbulence: 'turbulent', signals: turbulent }
  const elevated = hit(ELEVATED_KEYWORDS)
  if (elevated.length) return { turbulence: 'elevated', signals: elevated }
  return { turbulence: 'calm', signals: [] }
}

/** Map a raw catalog/DeFiLlama vault into a normalized observation vector. */
function toObservation(v) {
  return {
    address: v.address,
    protocol: v.protocol,
    apy: Number(v.apy) || 0,
    riskTier: normalizeRisk(v.risk || v.risk_tier),
    yieldSource: v.yield_source || v.yield_source_type || 'unknown',
    drawdown: Number(v.drawdown) || 0,
    minCapital: Number(v.min_capital) || 0,
    tvl: v.tvl != null ? Number(v.tvl) : null,
  }
}

/**
 * Build the formal observation the strategist reasons over (the State).
 * @param {Object} p
 * @param {number} p.amountUsdc
 * @param {string} p.riskLevel       // 'low' | 'med' | 'medium' | 'high'
 * @param {number} p.numVaults
 * @param {Array}  p.vaultData        // live DeFiLlama vaults or VAULT_CATALOG
 * @param {string|null} p.marketContext
 * @param {Object} [p.positions]      // { addr: { balance } } 6-decimal USDC strings
 * @returns {Object} StrategyState
 */
export function buildStrategyState({ amountUsdc, riskLevel, numVaults, vaultData, marketContext, positions = {} }) {
  const universe = (vaultData && vaultData.length ? vaultData : VAULT_CATALOG).map(toObservation)
  const holdings = positions || {}
  const heldUnits = Object.values(holdings).reduce((s, p) => s + Number(p && p.balance || 0), 0)
  return {
    capital: { amountUsdc: Number(amountUsdc) || 0, heldUsdc: heldUnits / 1e6 },
    profile: { riskLevel: normalizeRisk(riskLevel), numVaults: Number(numVaults) || 1 },
    portfolio: { holdings, heldVaultCount: Object.keys(holdings).length },
    market: deriveTurbulence(marketContext),
    universe,
    observedAt: Date.now(),
  }
}

/** Static description of what a strategy action may contain. Surfaced in the UI. */
export const ACTION_SPACE = {
  allocate: { type: 'continuous', perVault: [0, 1], constraint: 'weights sum to 1.0' },
  execute: {
    swap: { maxSlippagePct: [0.1, 1.0] },
    deposit: { boundedBy: 'agent skill maxAmount + expiresAt' },
  },
}

/** Turbulence regime -> the highest risk tier any allocated vault may hold. */
const TURBULENCE_CEILING = { calm: 'high', elevated: 'medium', turbulent: 'low' }

const RANK_TO_TIER = ['low', 'medium', 'high']

/**
 * The effective risk ceiling for a state: the stricter of the user's profile
 * risk and the market-turbulence gate.
 * @param {Object} state StrategyState
 * @returns {'low'|'medium'|'high'}
 */
export function riskCeiling(state) {
  const profileRank = RISK_RANK[state.profile.riskLevel]
  const turbRank = RISK_RANK[TURBULENCE_CEILING[state.market.turbulence]]
  return RANK_TO_TIER[Math.min(profileRank, turbRank)]
}

/**
 * Enforce the action space on a proposed allocation. Returns a NEW
 * { allocations, violations }: every kept vault respects the risk ceiling and
 * the weights are re-normalized to sum exactly 1.0. Pure — mutates nothing.
 * @param {Array<{address:string, allocation:number, risk_tier?:string}>} proposed
 * @param {Object} state StrategyState
 * @returns {{ allocations: Array, violations: string[] }}
 */
export function enforceActionSpace(proposed, state) {
  const violations = []
  const byAddr = new Map(state.universe.map((v) => [v.address.toLowerCase(), v]))
  const ceiling = RISK_RANK[riskCeiling(state)]

  const kept = (proposed || []).filter((p) => {
    const obs = byAddr.get(String(p.address).toLowerCase())
    if (!obs) { violations.push(`unknown vault ${p.address}`); return false }
    const tier = RISK_RANK[normalizeRisk(p.risk_tier || obs.riskTier)]
    if (tier > ceiling) {
      violations.push(`${obs.protocol} (${normalizeRisk(p.risk_tier || obs.riskTier)}) exceeds ${RANK_TO_TIER[ceiling]} ceiling under ${state.market.turbulence} market`)
      return false
    }
    return true
  })

  let pool = kept
  if (!pool.length) {
    const safest = [...state.universe].sort((a, b) => RISK_RANK[a.riskTier] - RISK_RANK[b.riskTier])[0]
    if (safest) {
      pool = [{ address: safest.address, allocation: 1, risk_tier: safest.riskTier }]
      violations.push('all proposals gated — fell back to safest vault')
    }
  }

  const sum = pool.reduce((s, p) => s + (Number(p.allocation) || 0), 0) || 1
  const allocations = pool.map((p) => ({ ...p, allocation: +((Number(p.allocation) || 0) / sum).toFixed(4) }))
  return { allocations, violations }
}
