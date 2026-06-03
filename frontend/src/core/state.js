// State / Action / Reward formalization for the autonomous rebalance agent.
// Inspired by FinRL: State = what the agent observes, Action = what it can do,
// Reward = how success is measured. Pure functions only — no network, no AI, no I/O.
//
// Adapted to Vibing Farmer data shapes:
//  - positions: positionsStore map { [vaultAddr]: { vaultName, balance, unclaimedRewards } }
//    where `balance` is USDC wei (6 decimals). Enriched via VAULT_CATALOG (apy/protocol/risk).
//  - pools: VAULT_CATALOG / DeFiLlama-enriched vault objects.

export const USDC_DECIMALS = 6

/** Convert a USDC wei string (6-dec) to a USD number. USDC is pegged 1:1 to USD. */
export function usdcWeiToUsd(weiStr) {
  if (weiStr == null) return 0
  try {
    return Number(BigInt(weiStr)) / 10 ** USDC_DECIMALS
  } catch {
    return 0
  }
}

const DAY_MS = 86_400_000

/**
 * Build the canonical agent State from raw, already-fetched inputs.
 * Pure normalizer — every field defensive-defaulted so a partial `raw` never throws.
 *
 * @param {object} [raw]
 * @param {object} [raw.positionsMap]          positionsStore map keyed by vault address
 * @param {Array}  [raw.catalog]               VAULT_CATALOG (apy/protocol/risk per vault address)
 * @param {Array}  [raw.pools]                 DeFiLlama-enriched / catalog pool objects
 * @param {number} [raw.walletBalanceUSD]
 * @param {number} [raw.gasPrice]              gwei
 * @param {number} [raw.ethPriceUSD]
 * @param {number} [raw.marketVolatility]      0–1
 * @param {number} [raw.turbulenceIndex]       0–1
 * @param {number} [raw.hoursSinceLastRebalance]
 * @param {number} [raw.now]                   injectable clock for tests (default Date.now())
 * @returns {object} immutable State
 */
export function createState(raw = {}) {
  const now = raw.now ?? Date.now()
  const catalogByAddr = indexCatalog(raw.catalog)

  return {
    positions: normalizePositions(raw.positionsMap, catalogByAddr, now),
    walletBalanceUSD: raw.walletBalanceUSD ?? 0,
    pools: normalizePools(raw.pools),
    gasPrice: raw.gasPrice ?? 0,
    ethPriceUSD: raw.ethPriceUSD ?? 0,
    marketVolatility: raw.marketVolatility ?? 0,
    turbulenceIndex: raw.turbulenceIndex ?? 0,
    timeSinceLastRebalance: raw.hoursSinceLastRebalance ?? Infinity,
    timestamp: now,
  }
}

function indexCatalog(catalog) {
  const byAddr = {}
  for (const v of catalog ?? []) {
    if (v?.address) byAddr[v.address.toLowerCase()] = v
  }
  return byAddr
}

function normalizePositions(positionsMap, catalogByAddr, now) {
  return Object.entries(positionsMap ?? {}).map(([addr, pos]) => {
    const meta = catalogByAddr[addr.toLowerCase()] ?? {}
    const entryTimestamp = pos.entryTimestamp ?? null
    return {
      vault: addr,
      protocol: meta.protocol ?? pos.protocol ?? 'unknown',
      vaultName: pos.vaultName ?? meta.name ?? addr,
      amountUSD: usdcWeiToUsd(pos.balance),
      unclaimedRewardsUSD: usdcWeiToUsd(pos.unclaimedRewards),
      entryAPY: pos.entryAPY ?? meta.apy ?? 0,
      currentAPY: pos.currentAPY ?? meta.apy ?? 0,
      risk: meta.risk ?? 'unknown',
      entryTimestamp,
      daysHeld: entryTimestamp ? (now - entryTimestamp) / DAY_MS : 0,
    }
  })
}

function normalizePools(pools) {
  return (pools ?? []).map((p) => ({
    id: p.id ?? p.pool ?? p.address ?? null,
    protocol: p.protocol ?? p.project ?? 'unknown',
    name: p.name ?? null,
    apy: p.apy ?? 0,
    apyBase: p.apyBase ?? null,
    apyReward: p.apyReward ?? null,
    tvlUsd: p.tvlUsd ?? p.tvl ?? 0,
    tvlDelta24h: p.tvlDelta24h ?? p.change_1d ?? 0,
    ilRisk: normalizeIlRisk(p.ilRisk),
    risk: p.risk ?? 'unknown',
    audited: normalizeAudited(p),
  }))
}

// DeFiLlama returns ilRisk as "no"/"yes" strings; catalog/others may use 'low'/'high' or boolean.
function normalizeIlRisk(v) {
  if (v == null) return 'low'
  if (v === 'yes' || v === true) return 'high'
  if (v === 'no' || v === false) return 'low'
  return v
}

function normalizeAudited(p) {
  if (typeof p.audited === 'boolean') return p.audited
  if (p.audits != null) return p.audits !== '0'
  return false
}

// Action space — the agent may ONLY ever produce one of these two shapes.
// Keyed by vault address because positions are keyed by vault address (not pool id).
export const ACTIONS = {
  HOLD: (reason) => ({ type: 'HOLD', reason }),
  REBALANCE: (fromVault, toVault, amountUSD) => ({
    type: 'REBALANCE',
    fromVault,
    toVault,
    amountUSD,
  }),
}
