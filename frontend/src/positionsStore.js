// positionsStore.js
// Position persistence + chain reconciliation, keyed by wallet address.
//
// Why: agentData.positions was session-only in-memory state. On reload/reconnect
// it reset to {}, so the home page looked like the user never farmed. This module
// (1) caches positions in localStorage for instant restore, and
// (2) reconciles against on-chain balances (source of truth) in the background.

import { ethers } from 'ethers'
import { VAULT_CATALOG, VAULT_ABI } from './config.js'

const keyFor = (addr) => `yv_positions_${String(addr).toLowerCase()}`

/** Restore last-known positions for an address from localStorage (sync, instant). */
export function loadPersistedPositions(address) {
  if (!address) return {}
  try {
    return JSON.parse(localStorage.getItem(keyFor(address)) || '{}') || {}
  } catch {
    return {}
  }
}

/** Persist a positions map for an address. Safe to call with an empty map. */
export function persistPositions(address, positions) {
  if (!address) return
  try {
    localStorage.setItem(keyFor(address), JSON.stringify(positions || {}))
  } catch {
    // localStorage unavailable/full — non-fatal, positions still live in memory.
  }
}

/**
 * Reconcile positions against chain. Reads balanceOf + convertToAssets per unique
 * vault. Returns a positions map ({ [vaultAddr]: { vaultName, balance, unclaimedRewards } })
 * containing only non-zero balances, or null when no RPC is configured / all reads fail.
 *
 * Never throws — per-vault failures are isolated via Promise.allSettled.
 */
export async function reconcilePositionsFromChain(address) {
  const rpc = import.meta.env.VITE_RPC_URL
  if (!address || !rpc) return null

  let provider
  try {
    provider = new ethers.JsonRpcProvider(rpc)
  } catch {
    return null
  }

  // Unique vault addresses (catalog maps multiple protocols to shared MockVaults).
  const seen = new Set()
  const vaults = VAULT_CATALOG.filter((v) => {
    const a = v.address?.toLowerCase()
    if (!a || seen.has(a)) return false
    seen.add(a)
    return true
  })

  const results = await Promise.allSettled(
    vaults.map(async (v) => {
      const contract = new ethers.Contract(v.address, VAULT_ABI, provider)
      const shares = await contract.balanceOf(address)
      if (shares === 0n) return null
      const assets = await contract.convertToAssets(shares)
      let rewards = 0n
      try { rewards = await contract.getUnclaimedRewards(address) } catch { /* optional */ }
      return [v.address, {
        vaultName: v.name,
        balance: assets.toString(),
        unclaimedRewards: rewards.toString(),
      }]
    })
  )

  let anyOk = false
  const positions = {}
  for (const r of results) {
    if (r.status === 'fulfilled') {
      anyOk = true
      if (r.value) positions[r.value[0]] = r.value[1]
    }
  }

  // If every read failed, return null so callers keep the cached snapshot instead
  // of wiping it with a falsely-empty result.
  return anyOk ? positions : null
}
