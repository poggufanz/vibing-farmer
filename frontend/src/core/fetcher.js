// fetcher.js — Step 3: Parallel Data Fetch (EvoAgentX DAG pattern)
// fetchCurrentState orchestrates all inputs via Promise.all.
// Step 14: injectable deps + createFetchStage factory replace Infinity/stub defaults.

import { createState } from './state.js'
import { fetchDeFiLlamaVaults } from '../defiLlama.js'
import { VAULT_CATALOG } from '../config.js'

// ─── Pure math helpers (exported for testability) ─────────────────────────────

export function _calculateVariance(values) {
  if (values.length === 0) return 0
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  return values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length
}

export function _calculateVolatility(pools) {
  const apys = pools.map(p => p.apy)
  const mean = apys.reduce((s, v) => s + v, 0) / apys.length
  const variance = apys.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / apys.length
  return Math.min(Math.sqrt(variance) / 100, 1.0)
}

export function _calculateTurbulenceIndex(pools, signals) {
  const apyVariance = _calculateVariance(pools.map(p => p.apy))
  const tvlVariance = _calculateVariance(pools.map(p => p.tvlDelta24h ?? 0))
  const alertPenalty = (signals.protocolAlerts?.length ?? 0) * 0.1
  return Math.min(Math.max((apyVariance * 0.4 + tvlVariance * 0.4 + alertPenalty * 0.2) / 50, 0), 1.0)
}

// ─── Individual API fetchers ──────────────────────────────────────────────────

export async function fetchGasPrice() {
  const resp = await fetch(
    `https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=${import.meta.env?.VITE_ETHERSCAN_API_KEY ?? 'YourAPIKey'}`
  )
  const { result } = await resp.json()
  return parseFloat(result.ProposeGasPrice)
}

export async function fetchEthPrice() {
  const resp = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
  )
  const data = await resp.json()
  return data.ethereum.usd
}

// Stub — positions are read from the smart contract in Step 9 (execution layer).
// Returns empty positionsMap so the loop runs with no current positions on first boot.
export async function fetchPositionsStub(_walletAddress) {
  return {}
}

async function fetchOnChainSignals(_watchedPools) {
  // Stub — simplified signal detection. Enhancement path, not blocking.
  return { whaleAlerts: [], protocolAlerts: [], unusualTVLMovements: [] }
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

/**
 * @param {object} config  { walletAddress, watchedPools, ... }
 * @param {object} [overrides]  injectable primitives for testing/composition
 * @returns {Promise<object>} State
 */
export async function fetchCurrentState(config, overrides = {}) {
  const {
    fetchVaults = fetchDeFiLlamaVaults,
    fetchGasPrice: getGas = fetchGasPrice,
    fetchEthPrice: getEth = fetchEthPrice,
    fetchSignals = fetchOnChainSignals,
    loadPositionsMap = fetchPositionsStub,
    getHoursSinceLastRebalance = () => Infinity,
    now = () => Date.now(),
  } = overrides

  console.log('[fetcher] Fetching state (parallel)...')
  const start = Date.now()

  const [vaults, gasPrice, ethPriceUSD, positionsMap, signals] = await Promise.all([
    fetchVaults(),
    getGas(),
    getEth(),
    loadPositionsMap(config.walletAddress),
    fetchSignals(config.watchedPools),
  ])

  const marketVolatility = _calculateVolatility(vaults)
  const turbulenceIndex = _calculateTurbulenceIndex(vaults, signals)

  console.log(`[fetcher] Done in ${Date.now() - start}ms`)

  return createState({
    positionsMap,
    catalog: VAULT_CATALOG,
    pools: vaults,
    walletBalanceUSD: 0,
    gasPrice,
    ethPriceUSD,
    marketVolatility,
    turbulenceIndex,
    hoursSinceLastRebalance: getHoursSinceLastRebalance(),
    now: now(),
  })
}

/**
 * Bind real position/cooldown sources once → the stages.fetchState(config) the loop calls.
 * @param {object} [deps]
 * @param {(addr:string)=>Promise<object>} [deps.loadPositionsMap]
 * @param {()=>number} [deps.getHoursSinceLastRebalance]
 * @param {object} [deps.deps]  network-primitive overrides (testing)
 * @returns {(config:object)=>Promise<object>}
 */
export function createFetchStage({ loadPositionsMap, getHoursSinceLastRebalance, deps = {} } = {}) {
  return (config) =>
    fetchCurrentState(config, { ...deps, loadPositionsMap, getHoursSinceLastRebalance })
}
