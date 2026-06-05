// Step 14 wiring — turns the app's position list (persisted or chain-reconciled)
// into the positionsMap shape createState expects (keyed by vault address).
//
// toPositionsMap: pure array→map normalizer (unit-tested in isolation).
// loadPositionsMap: live source — reconciles on-chain, normalizes keys, falls back to {}.
// Note: reconcilePositionsFromChain returns a map (not array), so loadPositionsMap
// normalizes it directly rather than routing through toPositionsMap.

import { reconcilePositionsFromChain } from '../positionsStore.js'

/**
 * Convert an array of position records to the positionsMap shape createState expects.
 * Each record must have a `vault` field (the vault address).
 * @param {Array<{vault:string, vaultName?:string, balance?:string, unclaimedRewards?:string}>} positions
 * @returns {Object<string, {vaultName:string, balance:string, unclaimedRewards:string}>}
 */
export function toPositionsMap(positions) {
  const map = {}
  for (const p of positions ?? []) {
    if (!p?.vault) continue
    map[String(p.vault).toLowerCase()] = {
      vaultName: p.vaultName ?? '',
      balance: p.balance ?? '0',
      unclaimedRewards: p.unclaimedRewards ?? '0',
    }
  }
  return map
}

/**
 * Live positions source — reconciles on-chain balances for the wallet.
 * reconcilePositionsFromChain returns { [vaultAddr]: { vaultName, balance, unclaimedRewards } }
 * or null (when all reads fail). Normalizes keys to lowercase and defaults missing fields.
 * Falls back to {} on any error so a cycle never crashes on positions.
 * @param {string} walletAddress
 * @returns {Promise<object>}
 */
export async function loadPositionsMap(walletAddress) {
  if (!walletAddress) return {}
  try {
    const result = await reconcilePositionsFromChain(walletAddress)
    if (!result) return {}
    const map = {}
    for (const [addr, pos] of Object.entries(result)) {
      map[String(addr).toLowerCase()] = {
        vaultName: pos.vaultName ?? '',
        balance: pos.balance ?? '0',
        unclaimedRewards: pos.unclaimedRewards ?? '0',
      }
    }
    return map
  } catch {
    return {}
  }
}
