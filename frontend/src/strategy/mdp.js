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
