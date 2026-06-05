import { VAULT_CATALOG } from '../config.js'
import { loadSettings } from '../settingsStore.js'

export const STRATEGY_DEFAULTS = {
  riskTolerance: 'moderate',
  minExpectedValueUSD: 15,
  maxSlippageBps: 50,
  loopIntervalMinutes: 30,
  thresholds: {
    TURBULENCE_CRITICAL: 0.75,
    MIN_APY_DELTA_PERCENT: 2.0,
    MIN_TVL_USD: 5_000_000,
    MAX_GAS_USD: 25,
    MAX_BREAKEVEN_DAYS: 45,
    MIN_COOLDOWN_HOURS: 12,
  },
}

/**
 * Pure builder — derives the loop config from wallet + settings + catalog.
 * @param {object} args
 * @param {string} args.walletAddress
 * @param {string} [args.permissionContext]
 * @param {Array}  [args.catalog]
 * @param {object} [args.settings]
 * @returns {object} loop config
 */
export function buildStrategyConfig({ walletAddress, permissionContext = null, catalog = VAULT_CATALOG, settings = {} } = {}) {
  const whitelist = catalog.map((v) => v.protocol)
  const watchedPools = catalog.map((v) => v.address)

  return {
    walletAddress,
    permissionContext,
    riskTolerance: settings.riskTolerance ?? STRATEGY_DEFAULTS.riskTolerance,
    minExpectedValueUSD: settings.minExpectedValueUSD ?? STRATEGY_DEFAULTS.minExpectedValueUSD,
    maxSlippageBps: settings.maxSlippageBps ?? STRATEGY_DEFAULTS.maxSlippageBps,
    loopIntervalMinutes: settings.loopIntervalMinutes ?? STRATEGY_DEFAULTS.loopIntervalMinutes,
    whitelist,
    watchedPools,
    thresholds: { ...STRATEGY_DEFAULTS.thresholds, ...(settings.thresholds ?? {}) },
  }
}

/**
 * Live loader — reads current settings + catalog. Bound as stages.loadConfig by Step 14.
 * @param {object} args  { walletAddress, permissionContext }
 * @returns {Promise<object>}
 */
export async function loadStrategyConfig({ walletAddress, permissionContext = null } = {}) {
  const settings = loadSettings()
  return buildStrategyConfig({ walletAddress, permissionContext, catalog: VAULT_CATALOG, settings })
}
