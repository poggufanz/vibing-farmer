import { ethers } from 'ethers'
import { SEPOLIA_CHAIN_ID_HEX, AGENT_VAULT_DEPOSITOR_ADDRESS, DEPOSITOR_ABI, VAULT_ABI, USDC_SEPOLIA } from './config.js'

let ethersProvider = null
let account = null

/**
 * Connect MetaMask Flask, switch to Sepolia if needed.
 * Returns connected account address.
 * @returns {Promise<string>} account address
 */
export async function connectWallet() {
  if (!window.ethereum) throw new Error('MetaMask Flask not found. Install Flask 13.9+.')

  // Request accounts
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
  account = accounts[0]

  // Ensure Ethereum Sepolia
  const chainId = await window.ethereum.request({ method: 'eth_chainId' })
  if (chainId !== SEPOLIA_CHAIN_ID_HEX) {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }]
      })
    } catch (e) {
      throw new Error(`Switch to Sepolia in MetaMask. Current: ${chainId}`)
    }
  }

  // Setup ethers provider for contract calls
  ethersProvider = new ethers.BrowserProvider(window.ethereum)

  return account
}

/**
 * Get connected account. Must call connectWallet() first.
 * @returns {string|null}
 */
export function getAccount() {
  return account
}

/** Prompt MetaMask to switch to Ethereum Sepolia. */
export async function switchToSepolia() {
  if (!window.ethereum) throw new Error('MetaMask Flask not found.')
  await window.ethereum.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
  })
}

/**
 * Grant ERC-7715 permission for AgentVaultDepositor via MetaMask SAK.
 * EIP-7702 is handled internally by SAK — do NOT call eth_signAuthorization.
 * @param {number} expirySeconds - seconds from now
 * @returns {Promise<{permissionContext: string, grantedPermissions: Array}>}
 */
export async function requestERC7715Permission(expirySeconds = 86400) {
  if (!window.ethereum) throw new Error('MetaMask Flask not found.')
  if (!account) throw new Error('Wallet not connected. Call connectWallet() first.')

  const result = await window.ethereum.request({
    method: 'wallet_requestExecutionPermissions',
    params: [{
      chainId: SEPOLIA_CHAIN_ID_HEX,
      from: account,
      to: AGENT_VAULT_DEPOSITOR_ADDRESS,
      permission: {
        type: 'erc20-token-periodic',
        isAdjustmentAllowed: false,
        data: {
          tokenAddress: USDC_SEPOLIA,
          periodAmount: '0x' + (10000000).toString(16),
          periodDuration: 86400,
        }
      },
      rules: [{ type: 'expiry', data: { timestamp: Math.floor(Date.now() / 1000) + expirySeconds } }]
    }]
  })

  if (!result) throw new Error('No permission result returned from MetaMask')

  return {
    permissionContext: result.permissionContext || result.context || '0xmock',
    grantedPermissions: result.grantedPermissions || []
  }
}

/**
 * Call grantAgentPermission on AgentVaultDepositor directly (user signs tx).
 * @param {string} agentId - bytes32 hex string
 * @param {string} vault - vault address
 * @param {bigint} maxAmount - max deposit amount in wei/units
 * @param {number} expiresAt - unix timestamp
 * @returns {Promise<string>} tx hash
 */
export async function grantAgentPermissionOnChain(agentId, vault, maxAmount, expiresAt) {
  if (!ethersProvider) throw new Error('Wallet not connected.')
  const signer = await ethersProvider.getSigner()
  const contract = new ethers.Contract(AGENT_VAULT_DEPOSITOR_ADDRESS, DEPOSITOR_ABI, signer)
  const tx = await contract.grantAgentPermission(agentId, vault, maxAmount, expiresAt)
  await tx.wait()
  return tx.hash
}

/**
 * Call executeAgentDeposit on AgentVaultDepositor directly (user signs tx).
 * @param {string} agentId - bytes32 hex
 * @param {string} user - permission owner address
 * @param {string} vault - vault address
 * @param {bigint} amount - deposit amount in units
 * @returns {Promise<string>} tx hash
 */
export async function executeAgentDepositOnChain(agentId, user, vault, amount) {
  if (!ethersProvider) throw new Error('Wallet not connected.')
  const signer = await ethersProvider.getSigner()
  const contract = new ethers.Contract(AGENT_VAULT_DEPOSITOR_ADDRESS, DEPOSITOR_ABI, signer)
  const tx = await contract.executeAgentDeposit(agentId, user, vault, amount)
  await tx.wait()
  return tx.hash
}

// Background-agent actions. Explicit gasLimit — MetaMask under-estimates these (the
// dependent grant/caps are applied in a prior tx), which caused on-chain OutOfGas.
export async function executeWithdrawOnChain(agentId, user, vault, amount) {
  if (!ethersProvider) throw new Error('Wallet not connected.')
  const signer = await ethersProvider.getSigner()
  const contract = new ethers.Contract(AGENT_VAULT_DEPOSITOR_ADDRESS, DEPOSITOR_ABI, signer)
  const tx = await contract.executeWithdraw(agentId, user, vault, amount, { gasLimit: 300000n })
  await tx.wait()
  return tx.hash
}

export async function executeHarvestOnChain(agentId, user, vault, recompound) {
  if (!ethersProvider) throw new Error('Wallet not connected.')
  const signer = await ethersProvider.getSigner()
  const contract = new ethers.Contract(AGENT_VAULT_DEPOSITOR_ADDRESS, DEPOSITOR_ABI, signer)
  const tx = await contract.executeHarvest(agentId, user, vault, recompound, { gasLimit: 300000n })
  await tx.wait()
  return tx.hash
}

/** Read a vault's on-chain depositTimestamp for a user (unix secs, 0 if none/unavailable). */
export async function readVaultDepositTimestamp(vault, user) {
  if (!ethersProvider) return 0
  try {
    const contract = new ethers.Contract(vault, VAULT_ABI, ethersProvider)
    return Number(await contract.depositTimestamp(user))
  } catch { return 0 }
}

/**
 * Batch many calls into ONE user confirmation via EIP-5792 wallet_sendCalls
 * (MetaMask Flask + EIP-7702: calls run from the user's own account address).
 * Polls wallet_getCallsStatus for real confirmation timing.
 * @param {Array<{to:string,data:string}>} calls
 * @returns {Promise<string|null>} representative tx hash, or null if wallet lacks EIP-5792
 */
export async function batchCalls(calls) {
  if (!window.ethereum || !account) throw new Error('Wallet not connected.')
  let res
  try {
    res = await window.ethereum.request({
      method: 'wallet_sendCalls',
      params: [{
        version: '2.0.0',
        from: account,
        chainId: SEPOLIA_CHAIN_ID_HEX,
        atomicRequired: true,
        calls: calls.map((c) => ({ to: c.to, data: c.data })),
      }],
    })
  } catch (e) {
    if (e?.code === 4001) throw e   // user rejected — surface it
    return null                     // method unsupported → caller falls back
  }
  const id = typeof res === 'string' ? res : res?.id
  for (let i = 0; i < 90; i++) {
    const st = await window.ethereum.request({ method: 'wallet_getCallsStatus', params: [id] })
    const code = st?.status
    if (code === 'CONFIRMED' || code === 200) return st?.receipts?.[0]?.transactionHash || id
    if (code === 'FAILED' || (typeof code === 'number' && code >= 400)) throw new Error('Batch tx reverted')
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error('Batch confirmation timed out')
}

/**
 * Read agentPermission from contract.
 * @param {string} userAddress
 * @param {string} agentId - bytes32 hex
 * @returns {Promise<{vault, maxAmount, usedAmount, expiresAt, active}>}
 */
export async function readAgentPermission(userAddress, agentId) {
  if (!ethersProvider) throw new Error('Wallet not connected.')
  const contract = new ethers.Contract(AGENT_VAULT_DEPOSITOR_ADDRESS, DEPOSITOR_ABI, ethersProvider)
  const [vault, maxAmount, usedAmount, expiresAt, active] =
    await contract.agentPermissions(userAddress, agentId)
  return { vault, maxAmount, usedAmount, expiresAt, active }
}

/**
 * Subscribe to contract events and call callback on each.
 * @param {string} eventName - 'AgentStarted' | 'DepositExecuted' | 'AgentCompleted' | 'AgentFailed'
 * @param {function} callback - (event) => void
 * @returns {function} unsubscribe function
 */
export async function onContractEvent(eventName, callback) {
  if (!ethersProvider) throw new Error('Wallet not connected.')
  const contract = new ethers.Contract(AGENT_VAULT_DEPOSITOR_ADDRESS, DEPOSITOR_ABI, ethersProvider)
  contract.on(eventName, callback)
  return () => contract.off(eventName, callback)
}

/**
 * Sign a SIWE message for Venice x402 wallet authentication.
 * Returns base64-encoded X-Sign-In-With-X header value.
 * No private key needed — MetaMask personal_sign only.
 * SIWE expires in 5 minutes; call fresh per session.
 * @param {string} address - connected wallet address
 * @returns {Promise<string>} base64 header value
 */
export async function signSiweForVenice(address) {
  const now = new Date()
  const nonce = Math.random().toString(36).slice(2, 12)
  const resourceUrl = 'https://api.venice.ai/api/v1/chat/completions'
  const message = [
    'api.venice.ai wants you to sign in with your Ethereum account:',
    address,
    '',
    'Sign in to Venice AI',
    '',
    `URI: ${resourceUrl}`,
    'Version: 1',
    'Chain ID: 8453',
    `Nonce: ${nonce}`,
    `Issued At: ${now.toISOString()}`,
    `Expiration Time: ${new Date(now.getTime() + 5 * 60 * 1000).toISOString()}`,
  ].join('\n')

  const signature = await window.ethereum.request({
    method: 'personal_sign',
    params: [message, address]
  })

  return btoa(JSON.stringify({
    address,
    message,
    signature,
    timestamp: now.getTime(),
    chainId: 8453
  }))
}
