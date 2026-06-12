// relay.js — encode/sign/submit for the EIP-712 deposit-only AgentVaultDepositor.
//
// Authorization model (Roadmap v2): the WORKER KEY signs an EIP-712 AgentDeposit;
// the contract recovers the signer and reads its scope from AgentRegistry. msg.sender
// is irrelevant, so ANY submitter (the 1Shot managed relayer, or the user's own wallet)
// can broadcast the call. Scope is granted up-front via AgentRegistry.authorizeSessionKey
// (user-signed, batched) + a USDC approve to the depositor so its transferFrom succeeds.

import {
  encodeFunctionData, keccak256, encodeAbiParameters, parseAbiParameters,
} from 'viem'
import {
  AGENT_VAULT_DEPOSITOR_ADDRESS, AGENT_REGISTRY_ADDRESS, SEPOLIA_CHAIN_ID, USDC_SEPOLIA,
} from './config.js'
import { broadcastDepositOnChain } from './wallet.js'

const RELAY_PROXY_URL = '/api/relay'

// ─── Deterministic execId ─────────────────────────────────────────────────────
/**
 * Deterministic execId per (owner, vault, planId, step).
 * NOTE: the contract does NOT recompute this — it only stores `executed[execId]` as given.
 * So this is an OFF-CHAIN contract among agent components (worker/orchestrator/retry) to
 * produce a stable id; the on-chain guard just dedupes whatever id it receives. Encoding
 * parity with `abi.encode(address,address,uint256,uint256)` is what matters: viem's
 * encodeAbiParameters yields the identical 32-byte-padded layout, so retries hash the same.
 * @returns {`0x${string}`} bytes32
 */
export function computeExecId({ owner, vault, planId, step }) {
  return keccak256(encodeAbiParameters(
    parseAbiParameters('address, address, uint256, uint256'),
    [owner, vault, BigInt(planId), BigInt(step)],
  ))
}

// ─── EIP-712 typed data (MUST match AgentVaultDepositor: name "VibingFarmer", version "1") ─
export const DEPOSIT_DOMAIN = (chainId, verifyingContract) => ({
  name: 'VibingFarmer', version: '1', chainId, verifyingContract,
})
export const DEPOSIT_TYPES = {
  AgentDeposit: [
    { name: 'amount', type: 'uint256' },
    { name: 'minAmount', type: 'uint256' },
    { name: 'execId', type: 'bytes32' },
  ],
}

/**
 * Worker key signs the deposit. `workerSigner` is any viem-style account/wallet client
 * exposing signTypedData (e.g. privateKeyToAccount(pk)). Returns the 0x signature.
 */
export async function signDeposit(workerSigner, { chainId, depositor, amount, minAmount, execId }) {
  return workerSigner.signTypedData({
    domain: DEPOSIT_DOMAIN(chainId, depositor),
    types: DEPOSIT_TYPES,
    primaryType: 'AgentDeposit',
    message: { amount: BigInt(amount), minAmount: BigInt(minAmount), execId },
  })
}

// ─── Calldata encoders ────────────────────────────────────────────────────────
const DEPOSITOR_DEPOSIT_ABI = [{
  type: 'function', name: 'executeAgentDeposit', stateMutability: 'nonpayable',
  inputs: [
    { name: 'amount', type: 'uint256' },
    { name: 'minAmount', type: 'uint256' },
    { name: 'execId', type: 'bytes32' },
    { name: 'sig', type: 'bytes' },
  ],
  outputs: [{ name: 'shares', type: 'uint256' }],
}]

export function encodeExecuteAgentDeposit({ amount, minAmount, execId, sig }) {
  return encodeFunctionData({
    abi: DEPOSITOR_DEPOSIT_ABI, functionName: 'executeAgentDeposit',
    args: [BigInt(amount), BigInt(minAmount), execId, sig],
  })
}

const REGISTRY_AUTH_ABI = [{
  type: 'function', name: 'authorizeSessionKey', stateMutability: 'nonpayable',
  inputs: [
    { name: 'agent', type: 'address' },
    { name: 'vault', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'capPerPeriod', type: 'uint96' },
    { name: 'periodDuration', type: 'uint32' },
    { name: 'expiry', type: 'uint40' },
  ],
  outputs: [],
}]

/** {to,data} for AgentRegistry.authorizeSessionKey — user-signed, EIP-5792-batchable. */
export function buildAuthorizeSessionKeyCall({ agent, vault, token, capPerPeriod, periodDuration, expiry }) {
  return {
    to: AGENT_REGISTRY_ADDRESS,
    data: encodeFunctionData({
      abi: REGISTRY_AUTH_ABI, functionName: 'authorizeSessionKey',
      args: [agent, vault, token, BigInt(capPerPeriod), Number(periodDuration), Number(expiry)],
    }),
  }
}

const ERC20_APPROVE_ABI = [{
  type: 'function', name: 'approve', stateMutability: 'nonpayable',
  inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ name: '', type: 'bool' }],
}]

/** {to,data} approving the depositor to pull `amount` USDC (Jalur B transferFrom). */
export function buildApproveCall({ spender = AGENT_VAULT_DEPOSITOR_ADDRESS, amount }) {
  return {
    to: USDC_SEPOLIA,
    data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [spender, BigInt(amount)] }),
  }
}

// ─── Submit a signed deposit ──────────────────────────────────────────────────
/**
 * Submit a signed deposit. Managed 1Shot proxy first (gas-abstracted); if unconfigured
 * or failing, broadcast the encoded calldata as a user-signed on-chain tx (one popup).
 * The signature — not msg.sender — is the authorization, so either submitter is valid.
 * @returns {Promise<{txHash: string, status: string, relayer?: string}>}
 */
export async function relayDeposit({ amount, minAmount, execId, sig }) {
  const managed = await relayDepositManaged({ amount, minAmount, execId, sig })
  if (managed) return managed
  const calldata = encodeExecuteAgentDeposit({ amount, minAmount, execId, sig })
  const txHash = await broadcastDepositOnChain(calldata)
  return { txHash, status: 'onchain' }
}

/** Managed-API proxy submit. Returns null when unconfigured/failed → caller falls back. */
export async function relayDepositManaged({ amount, minAmount, execId, sig }) {
  try {
    const res = await fetch(RELAY_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'deposit',
        amount: String(amount), minAmount: String(minAmount), execId, sig,
      }),
    })
    if (!res.ok) return null // 503 not-configured / 4xx-5xx → on-chain fallback
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

/** Current chain id as string — small helper kept for callers that branch on chain. */
export const chainIdStr = () => String(SEPOLIA_CHAIN_ID)
