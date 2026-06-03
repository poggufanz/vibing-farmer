// attestation.js
// Hashes Venice AI strategy output and attests it on-chain.
// Creates a verifiable, tamper-proof record of the AI reasoning (ERC-8004 aligned).

import { ethers } from 'ethers'
import { AGENT_VAULT_DEPOSITOR_ADDRESS, DEPOSITOR_ABI } from './config.js'

/**
 * Hash strategy + reasoning into a deterministic bytes32.
 * Anyone can reproduce this hash from the original strategy JSON.
 * @param {object} strategy - raw Venice AI strategy (selected_vaults schema)
 * @returns {string} bytes32 keccak256 hash
 */
export function hashStrategy(strategy) {
  const payload = JSON.stringify({
    vaults: strategy.selected_vaults?.map((v) => ({
      address: v.address,
      protocol: v.protocol,
      allocation: v.allocation,
      expectedApy: v.expected_apy,
    })),
    reasoning: strategy.selected_vaults?.map((v) => v.reasoning),
    strategySource: strategy.generatedBy,
    timestamp: Math.floor(Date.now() / 1000),
  })
  return ethers.keccak256(ethers.toUtf8Bytes(payload))
}

/**
 * Attest a strategy hash on-chain via AgentVaultDepositor.attestStrategy.
 * Emits StrategyAttested — verifiable on Etherscan. NEVER blocking: any failure
 * returns null so strategy execution always continues.
 * @param {object} strategy - raw Venice AI strategy output (must carry strategyHash or selected_vaults)
 * @param {object} provider - ethers BrowserProvider (from MetaMask)
 * @returns {Promise<{txHash, strategyHash, blockNumber}|null>}
 */
export async function attestStrategyOnChain(strategy, provider) {
  try {
    const signer = await provider.getSigner()
    const contract = new ethers.Contract(AGENT_VAULT_DEPOSITOR_ADDRESS, DEPOSITOR_ABI, signer)

    const strategyHash = strategy.strategyHash || hashStrategy(strategy)
    const primaryVault = strategy.selected_vaults?.[0]
    const vaultProtocol = primaryVault?.protocol || 'unknown'
    const allocatedAmount = Math.floor((primaryVault?.allocation || 0) * 1e6)

    // Pre-flight guard — prevents MetaMask's misleading "transaction likely to fail /
    // insufficient funds" popup when the contract is undeployed (e.g. stale address)
    // or lacks attestStrategy. We never reach the signature prompt unless the call is sound.
    const code = await provider.getCode(AGENT_VAULT_DEPOSITOR_ADDRESS)
    if (code === '0x') {
      console.warn('[Attestation] No contract code at', AGENT_VAULT_DEPOSITOR_ADDRESS, '— skipping (non-blocking)')
      return null
    }
    await contract.attestStrategy.estimateGas(strategyHash, vaultProtocol, allocatedAmount)

    // Log the exact tx before sending (for debugging the MetaMask prompt)
    const txReq = await contract.attestStrategy.populateTransaction(strategyHash, vaultProtocol, allocatedAmount)
    console.log('[Attestation] sending attestStrategy →', { to: txReq.to, data: txReq.data, strategyHash, vaultProtocol, allocatedAmount })

    const tx = await contract.attestStrategy(strategyHash, vaultProtocol, allocatedAmount)
    const receipt = await tx.wait()

    return { txHash: receipt.hash, strategyHash, blockNumber: receipt.blockNumber }
  } catch (err) {
    // Non-blocking: contract missing attestStrategy / estimation failed / user rejected.
    console.warn('[Attestation] Skipped (non-blocking):', err.message)
    return null
  }
}

/**
 * Format an attestation result for display in the UI.
 * @param {{txHash, strategyHash}|null} attestation
 */
export function formatAttestation(attestation) {
  if (!attestation) return null
  return {
    hash: attestation.strategyHash.slice(0, 10) + '...',
    fullHash: attestation.strategyHash,
    txHash: attestation.txHash,
    etherscanUrl: `https://sepolia.basescan.org/tx/${attestation.txHash}`,
    label: 'Strategy attested on-chain',
  }
}
