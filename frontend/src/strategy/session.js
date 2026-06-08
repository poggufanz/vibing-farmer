// frontend/src/strategy/session.js
// ERC-7710 session redemption — the "execute many, sign once" core.
// After the user grants ONE ERC-7715 permission, every later on-chain action
// (grantAgentPermission, executeAgentDeposit) is redeemed by an ephemeral session
// account via sendTransactionWithDelegation. The DelegationManager executes the
// inner call FROM the user's smart account (msg.sender == user), so the deployed
// AgentVaultDepositor checks pass with no redeploy and no MetaMask popup.
//
// SECURITY: the session private key is generated in memory per page-load and is
// NEVER persisted or bundled. It only holds redemption authority scoped under the
// user's freshly-signed root grant, and is discarded on reload. Same rationale as
// the orchestrator key in redelegation.js.
//
// TRANSPORT: a local-account wallet client signs locally then broadcasts via
// `eth_sendRawTransaction` — MetaMask's injected provider does NOT expose that
// method to dapps (wallets gate raw broadcast to avoid nonce conflicts), so
// `custom(window.ethereum)` makes every redemption fail and silently fall back
// to the user-signed on-chain path (a popup, every time — worse than before).
// Broadcast straight to the chain RPC instead, exactly like redelegation.js.
import { createWalletClient, http } from 'viem'
import { baseSepolia as chain } from 'viem/chains'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { erc7710WalletActions } from '@metamask/smart-accounts-kit/actions'

let sessionClient = null
let sessionAccount = null
let activeContext = null
let activeManager = null

/**
 * Boot the ERC-7710 session from a granted permission. Idempotent per grant.
 * @param {{permissionContext: string, delegationManager: string}} grant
 */
export function initSession({ permissionContext, delegationManager }) {
  if (!permissionContext || !delegationManager) throw new Error('initSession: missing context/manager')
  if (!window?.ethereum) throw new Error('initSession: no wallet provider')

  sessionAccount = privateKeyToAccount(generatePrivateKey())
  sessionClient = createWalletClient({
    account: sessionAccount,
    chain,
    transport: http(import.meta.env.VITE_RPC_URL || 'https://sepolia.base.org'),
  }).extend(erc7710WalletActions())

  activeContext = permissionContext
  activeManager = delegationManager
  return sessionAccount.address
}

/** @returns {string|null} session account address, or null if not booted */
export function getSessionAddress() {
  return sessionAccount?.address || null
}

/** True when a session is booted and can redeem. */
export function hasSession() {
  return !!sessionClient && !!activeContext && !!activeManager
}

/**
 * Redeem ONE contract call through the granted permission. Zero popup.
 * @param {{to: string, data: string, value?: bigint}} call
 * @returns {Promise<string>} tx hash
 */
export async function redeemCall({ to, data, value = 0n }) {
  if (!hasSession()) throw new Error('redeemCall: no active session')
  return sessionClient.sendTransactionWithDelegation({
    to,
    data,
    value,
    permissionContext: activeContext,
    delegationManager: activeManager,
  })
}

/** Tear down the session (on revoke / disconnect / new strategy). */
export function clearSession() {
  sessionClient = null
  sessionAccount = null
  activeContext = null
  activeManager = null
}
