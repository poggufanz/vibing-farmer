import { ethers } from 'ethers'
import { ONE_SHOT_RELAYER_URL, AGENT_VAULT_DEPOSITOR_ADDRESS, SEPOLIA_CHAIN_ID } from './config.js'
import { grantAgentPermissionOnChain, executeAgentDepositOnChain } from './wallet.js'
import { redeemCall, hasSession } from './strategy/session.js'

/**
 * Encode calldata for executeAgentDeposit.
 * Uses ethers.js v6 ABI encoding.
 * @param {string} agentId - bytes32 hex (0x...)
 * @param {string} user - address
 * @param {string} vault - address
 * @param {bigint} amount - uint256
 * @returns {Promise<string>} hex calldata
 */
export async function encodeExecuteAgentDeposit(agentId, user, vault, amount) {
  const iface = new ethers.Interface([
    'function executeAgentDeposit(bytes32 agentId, address user, address vault, uint256 amount)'
  ])
  return iface.encodeFunctionData('executeAgentDeposit', [agentId, user, vault, amount])
}

/**
 * Encode calldata for grantAgentPermission.
 * @param {string} agentId - bytes32 hex
 * @param {string} vault - address
 * @param {bigint} maxAmount
 * @param {number} expiresAt - unix timestamp
 * @returns {Promise<string>} hex calldata
 */
export async function encodeGrantAgentPermission(agentId, vault, maxAmount, expiresAt) {
  const iface = new ethers.Interface([
    'function grantAgentPermission(bytes32 agentId, address vault, uint256 maxAmount, uint256 expiresAt)'
  ])
  return iface.encodeFunctionData('grantAgentPermission', [agentId, vault, maxAmount, BigInt(expiresAt)])
}

/**
 * Submit a call via 1Shot Permissionless Relayer (EIP-7710).
 * No API key required. Pure JSON-RPC.
 * @param {object} params
 * @param {string} params.to - target contract address
 * @param {string} params.calldata - hex encoded calldata
 * @param {string} params.permissionContext - from ERC-7715 wallet_requestExecutionPermissions
 * @param {string} params.account - user EOA address
 * @returns {Promise<{txHash: string, status: string}>}
 */
// Chains supported by the 1Shot KEYLESS Permissionless Relayer (relayer.1shotapi.com).
// Verified live 2026-06-03 via relayer_getCapabilities: MAINNETS ONLY — no testnet.
//   eth(1) base(8453) arbitrum(42161) optimism(10) polygon(137) bsc(56) linea(59144) ...
// Base Sepolia (84532) is NOT here → keyless relay is impossible on our testnet.
// Real 1Shot on Base Sepolia goes through the MANAGED API (api/relay.js proxy, key+secret +
// funded server wallet). Until that proxy + creds are wired, 84532 falls back to on-chain
// user-signed tx (see relayGrantPermission / relayDeposit) — real txs, just not gas-abstracted.
const ONESHOT_SUPPORTED_CHAINS = new Set(['1', '8453', '42161', '10', '137', '56', '59144'])

// Server-side Managed-API proxy (key+secret + funded server wallet stay on the server).
// This is the path that makes 1Shot real on Base Sepolia. See api/relay.js.
const RELAY_PROXY_URL = '/api/relay'

/**
 * Relay a deposit through the 1Shot Managed API proxy (real, gas-abstracted).
 * Returns null when the proxy isn't configured or fails → caller falls back to
 * a user-signed on-chain tx. Never throws.
 * @returns {Promise<{txHash: string, status: string, relayer?: string} | null>}
 */
export async function relayDepositManaged({ agentId, user, vault, amount }) {
  try {
    const res = await fetch(RELAY_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'deposit',
        to: AGENT_VAULT_DEPOSITOR_ADDRESS,
        agentId, user, vault, amount: amount.toString(),
      }),
    })
    if (!res.ok) return null // 503 not-configured, 4xx/5xx → fall back on-chain
    const data = await res.json()
    if (data.configured === false || data.error) return null
    return {
      txHash: data.txHash || data.transactionId || 'pending',
      status: data.txHash ? 'relayed' : 'submitted',
      relayer: data.relayer,
    }
  } catch {
    return null
  }
}

/** Server wallet (1Shot relayer) address for the current chain — fund it for gas. null if unconfigured. */
export async function getRelayerAddress() {
  try {
    const res = await fetch(RELAY_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'wallet' }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.address || null
  } catch {
    return null
  }
}

/**
 * Submit via the 1Shot KEYLESS EIP-7710 relayer. Mainnet-only.
 * On unsupported chains (incl. Base Sepolia) callers use the on-chain fallback instead,
 * so this simulation branch should not be reached in normal flow.
 */
export async function submitRelay({ to, calldata, permissionContext }) {
  const chainStr = String(SEPOLIA_CHAIN_ID)

  // Defensive: keyless relayer can't serve this chain → simulate rather than hard-fail.
  if (!ONESHOT_SUPPORTED_CHAINS.has(chainStr)) {
    await new Promise(r => setTimeout(r, 700))
    return { txHash: '0xsim_' + Date.now().toString(16), status: 'simulated' }
  }

  // Real 1Shot relay — EIP-7710 relayer_send7710Transaction
  // permissionContext from MetaMask Flask wallet_requestExecutionPermissions must be array
  const ctxArray = Array.isArray(permissionContext) ? permissionContext : [permissionContext]

  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'relayer_send7710Transaction',
    params: {
      chainId: chainStr,
      transactions: [
        {
          permissionContext: ctxArray,
          executions: [{ target: to, callData: calldata, value: '0x0' }]
        }
      ]
    }
  }

  const response = await fetch(ONE_SHOT_RELAYER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`1Shot relay failed: ${response.status} · ${text}`)
  }

  const data = await response.json()
  if (data.error) throw new Error(`1Shot error: ${data.error.message || JSON.stringify(data.error)}`)

  return {
    txHash: data.result?.transactionHash || data.result?.txHash || data.result || 'pending',
    status: 'submitted'
  }
}

/**
 * Execute grantAgentPermission via 1Shot relay.
 * @param {object} params
 * @param {string} params.agentId - bytes32 hex
 * @param {string} params.vault
 * @param {bigint} params.maxAmount
 * @param {number} params.expiresAt
 * @param {string} params.permissionContext - from ERC-7715
 * @param {string} params.user - user EOA address
 * @returns {Promise<{txHash: string}>}
 */
export async function relayGrantPermission({ agentId, vault, maxAmount, expiresAt, permissionContext }) {
  const calldata = await encodeGrantAgentPermission(agentId, vault, maxAmount, expiresAt)

  // 1) Session redemption — zero popup, redeemed from the user's smart account.
  if (hasSession()) {
    try {
      const txHash = await redeemCall({ to: AGENT_VAULT_DEPOSITOR_ADDRESS, data: calldata })
      return { txHash, status: 'redeemed' }
    } catch (e) {
      console.warn('[relay] grant redeem failed, falling back:', e?.message)
    }
  }

  // 2) Keyless 1Shot relay (mainnet only) — unchanged.
  if (!ONESHOT_SUPPORTED_CHAINS.has(String(SEPOLIA_CHAIN_ID))) {
    // 3) On-chain user-signed (one popup) — last resort.
    const txHash = await grantAgentPermissionOnChain(agentId, vault, maxAmount, expiresAt)
    return { txHash, status: 'onchain' }
  }
  return submitRelay({ to: AGENT_VAULT_DEPOSITOR_ADDRESS, calldata, permissionContext })
}

/**
 * Execute executeAgentDeposit via 1Shot relay.
 * @param {object} params
 * @param {string} params.agentId - bytes32 hex
 * @param {string} params.user
 * @param {string} params.vault
 * @param {bigint} params.amount
 * @param {string} params.permissionContext
 * @returns {Promise<{txHash: string}>}
 */
export async function relayDeposit({ agentId, user, vault, amount, permissionContext }) {
  const calldata = await encodeExecuteAgentDeposit(agentId, user, vault, amount)

  // 1) Session redemption — zero popup, redeemed from the user's smart account.
  if (hasSession()) {
    try {
      const txHash = await redeemCall({ to: AGENT_VAULT_DEPOSITOR_ADDRESS, data: calldata })
      return { txHash, status: 'redeemed' }
    } catch (e) {
      console.warn('[relay] deposit redeem failed, falling back:', e?.message)
    }
  }

  // 2) Base Sepolia: managed proxy (real, gas-abstracted), then on-chain.
  if (!ONESHOT_SUPPORTED_CHAINS.has(String(SEPOLIA_CHAIN_ID))) {
    const managed = await relayDepositManaged({ agentId, user, vault, amount })
    if (managed) return managed
    const txHash = await executeAgentDepositOnChain(agentId, user, vault, amount)
    return { txHash, status: 'onchain' }
  }

  // 3) Keyless 1Shot relay (mainnet only).
  return submitRelay({ to: AGENT_VAULT_DEPOSITOR_ADDRESS, calldata, permissionContext })
}

/** True when the current chain can't use the 1Shot relayer (→ broadcast on-chain instead). */
export function isUnsupportedByOneShot() {
  return !ONESHOT_SUPPORTED_CHAINS.has(String(SEPOLIA_CHAIN_ID))
}

/** True when the Managed API proxy should handle deposits.
 *  On Base Sepolia we skip the EIP-5792 batch so each worker calls relayDeposit
 *  → managed API proxy → real gas-abstracted 1Shot tx. */
export function useManagedRelay() {
  return String(SEPOLIA_CHAIN_ID) === '84532'
}

/** Build a {to,data} grantAgentPermission call for EIP-5792 batching. */
export async function buildGrantCall({ agentId, vault, maxAmount, expiresAt }) {
  return { to: AGENT_VAULT_DEPOSITOR_ADDRESS, data: await encodeGrantAgentPermission(agentId, vault, maxAmount, expiresAt) }
}

/** Build a {to,data} executeAgentDeposit call for EIP-5792 batching. */
export async function buildDepositCall({ agentId, user, vault, amount }) {
  return { to: AGENT_VAULT_DEPOSITOR_ADDRESS, data: await encodeExecuteAgentDeposit(agentId, user, vault, amount) }
}

// ─── Background Agent: harvest + emergency withdraw ───────────────────────────
// Zero-popup autonomous monitor loop. The 1Shot server wallet is pre-authorized
// as a session key in AgentVaultDepositor (via setupBgAgentsWithSessionKey called
// once at "Start Monitoring"). All subsequent harvest/withdraw calls go through
// the managed relay → server wallet → contract (session key check passes).
// No MetaMask popups after setup.

export const bgAgentId = (vault) => ethers.id('yv-bg-' + vault.toLowerCase())

/**
 * Harvest rewards from `vault` for `user` (optionally recompound).
 * Zero-popup — uses managed relay, server wallet is pre-authorized session key.
 */
export async function relayHarvest({ user, vault, recompound = false }) {
  const agentId = bgAgentId(vault)
  const res = await fetch(RELAY_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'harvest', agentId, user, vault, recompound }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Relay harvest failed: ${res.status}`)
  }
  return res.json()
}

/**
 * Emergency withdraw `amount` (units) from `vault` back to `user`.
 * Zero-popup — uses managed relay, server wallet is pre-authorized session key.
 */
export async function relayWithdraw({ user, vault, amount }) {
  const agentId = bgAgentId(vault)
  const res = await fetch(RELAY_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'withdraw', agentId, user, vault, amount: String(amount) }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Relay withdraw failed: ${res.status}`)
  }
  return res.json()
}
