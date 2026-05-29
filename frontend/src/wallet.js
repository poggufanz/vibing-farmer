import { ethers } from 'ethers'
import { SEPOLIA_CHAIN_ID_HEX, AGENT_VAULT_DEPOSITOR_ADDRESS, DEPOSITOR_ABI, USDC_SEPOLIA } from './config.js'

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
