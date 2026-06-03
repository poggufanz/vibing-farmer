// fetcher.js — Step 3: Parallel Data Fetch (EvoAgentX DAG pattern)
// fetchCurrentState orchestrates all inputs via Promise.all.

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

export async function fetchCurrentState(config) {
  console.log('[fetcher] Fetching state (parallel)...')
  const start = Date.now()

  // All independent inputs run concurrently — EvoAgentX DAG pattern.
  // fetchDeFiLlamaVaults already handles its own filtering + fallback.
  const [vaults, gasPrice, ethPriceUSD, positionsMap, signals] = await Promise.all([
    fetchDeFiLlamaVaults(),
    fetchGasPrice(),
    fetchEthPrice(),
    fetchPositionsStub(config.walletAddress),
    fetchOnChainSignals(config.watchedPools),
  ])

  const marketVolatility = _calculateVolatility(vaults)
  const turbulenceIndex = _calculateTurbulenceIndex(vaults, signals)

  console.log(`[fetcher] Done in ${Date.now() - start}ms`)

  return createState({
    positionsMap,
    catalog: VAULT_CATALOG,
    pools: vaults,
    walletBalanceUSD: 0,            // stub — replaced in Step 9
    gasPrice,
    ethPriceUSD,
    marketVolatility,
    turbulenceIndex,
    hoursSinceLastRebalance: Infinity, // stub — replaced in Step 7 (logger)
  })
}
