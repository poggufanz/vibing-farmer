import { ethers } from 'ethers'
import { ONE_SHOT_RELAYER_URL, AGENT_VAULT_DEPOSITOR_ADDRESS, SEPOLIA_CHAIN_ID } from './config.js'
import { grantAgentPermissionOnChain, executeAgentDepositOnChain, batchCalls, executeWithdrawOnChain, executeHarvestOnChain } from './wallet.js'

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
// Chains natively supported by 1Shot Permissionless Relayer.
// Mainnet migration: deploy to one of these chains and remove simulation branch.
const ONESHOT_SUPPORTED_CHAINS = new Set(['1', '8453', '84532', '42161', '10'])

/**
 * Submit via 1Shot EIP-7710 relayer. Simulates on unsupported chains (e.g. Sepolia demo).
 * Mainnet: deploy to Base (8453) or Ethereum (1) — remove the simulation branch below.
 */
export async function submitRelay({ to, calldata, permissionContext }) {
  const chainStr = String(SEPOLIA_CHAIN_ID)

  // Sepolia not supported by 1Shot → simulate relay for demo
  // MAINNET TODO: remove this block once deployed to a supported chain
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
    throw new Error(`1Shot relay failed: ${response.status} — ${text}`)
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
  // Sepolia not supported by 1Shot → broadcast real tx via user signer (tx.wait for real timing)
  if (!ONESHOT_SUPPORTED_CHAINS.has(String(SEPOLIA_CHAIN_ID))) {
    const txHash = await grantAgentPermissionOnChain(agentId, vault, maxAmount, expiresAt)
    return { txHash, status: 'onchain' }
  }
  const calldata = await encodeGrantAgentPermission(agentId, vault, maxAmount, expiresAt)
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
  // Sepolia not supported by 1Shot → broadcast real tx via user signer (tx.wait for real timing)
  if (!ONESHOT_SUPPORTED_CHAINS.has(String(SEPOLIA_CHAIN_ID))) {
    const txHash = await executeAgentDepositOnChain(agentId, user, vault, amount)
    return { txHash, status: 'onchain' }
  }
  const calldata = await encodeExecuteAgentDeposit(agentId, user, vault, amount)
  return submitRelay({ to: AGENT_VAULT_DEPOSITOR_ADDRESS, calldata, permissionContext })
}

/** True when the current chain can't use the 1Shot relayer (→ broadcast on-chain instead). */
export function isUnsupportedByOneShot() {
  return !ONESHOT_SUPPORTED_CHAINS.has(String(SEPOLIA_CHAIN_ID))
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
// These are self-contained: the background agent owns its own agentId namespace and
// batches grant → setAgentCapabilities → action in ONE confirmation (EIP-5792).
// Never touches the deposit/orchestrator permission flow. Sepolia → user-signed batch.

const BG_IFACE = new ethers.Interface([
  'function grantAgentPermission(bytes32 agentId, address vault, uint256 maxAmount, uint256 expiresAt)',
  'function setAgentCapabilities(bytes32 agentId, bool allowWithdraw, bool allowHarvest)',
  'function executeWithdraw(bytes32 agentId, address user, address vault, uint256 amount)',
  'function executeHarvest(bytes32 agentId, address user, address vault, bool recompound)',
])
const BG_MAX = 1_000_000_000_000n // nominal grant cap (1M USDC units); withdraw/harvest never consume it
const bgAgentId = (vault) => ethers.id('yv-bg-' + vault.toLowerCase())
const depCall = (fn, args) => ({ to: AGENT_VAULT_DEPOSITOR_ADDRESS, data: BG_IFACE.encodeFunctionData(fn, args) })

async function ensureBgSetup(agentId, vault) {
  // Grant + enable capabilities as one batch (this estimates fine — no deep nesting).
  const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 3600)
  const setupHash = await batchCalls([
    depCall('grantAgentPermission', [agentId, vault, BG_MAX, expiresAt]),
    depCall('setAgentCapabilities', [agentId, true, true]),
  ])
  if (!setupHash) throw new Error('Wallet lacks EIP-5792 batch support — cannot arm agent')
}

/** Emergency withdraw `amount` (units) from `vault` back to `user`. Setup batch, then the action. */
export async function relayWithdraw({ user, vault, amount }) {
  const agentId = bgAgentId(vault)
  await ensureBgSetup(agentId, vault)
  // Action as a direct call with explicit gasLimit (MetaMask under-estimates it → OutOfGas)
  const txHash = await executeWithdrawOnChain(agentId, user, vault, BigInt(amount))
  return { txHash, status: 'onchain' }
}

/** Harvest rewards from `vault` for `user` (optionally recompound). Setup batch, then the action. */
export async function relayHarvest({ user, vault, recompound = false }) {
  const agentId = bgAgentId(vault)
  await ensureBgSetup(agentId, vault)
  const txHash = await executeHarvestOnChain(agentId, user, vault, recompound)
  return { txHash, status: 'onchain' }
}
