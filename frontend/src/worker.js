import { relayGrantPermission, relayDeposit } from './relay.js'
import { writeMemory, createEntry, buildLesson } from './memory.js'
import { loadSkill } from './skills.js'

/**
 * Worker Agent — executes full Swap→Approve→Deposit for one vault.
 * Emits events for graph updates via onEvent callback.
 */
export class WorkerAgent {
  /**
   * @param {object} config
   * @param {string} config.agentId - bytes32 hex (0x...)
   * @param {string} config.user - user address
   * @param {string} config.vault - vault address
   * @param {bigint} config.amount - deposit amount (uint256 units)
   * @param {string} config.permissionContext - from ERC-7715
   * @param {string} config.sessionId
   * @param {function} config.onEvent - (eventName, data) => void
   */
  constructor({ agentId, user, vault, amount, permissionContext, sessionId, onEvent, batchedHash, grantsBatched }) {
    this.agentId = agentId
    this.user = user
    this.vault = vault
    this.amount = amount
    this.permissionContext = permissionContext
    this.sessionId = sessionId
    this.onEvent = onEvent || (() => {})
    this.batchedHash = batchedHash || null   // full batch: skip grant + deposit
    this.grantsBatched = grantsBatched || false // hybrid: skip grant only, relay deposit
    this.memoryEntries = []
  }

  /**
   * Execute full agent flow.
   * @returns {Promise<{success: boolean, txHash?: string, error?: string, shares?: bigint}>}
   */
  async execute() {
    try {
      this.emit('started', { agentId: this.agentId, vault: this.vault })

      // Step 1: Grant on-chain permission (skipped when already batched by the orchestrator)
      if (!this.batchedHash && !this.grantsBatched) {
        this.emit('step', { agentId: this.agentId, step: 'grant-permission', status: 'pending' })
        const expiresAt = Math.floor(Date.now() / 1000) + 3600
        const grantResult = await relayGrantPermission({
          agentId: this.agentId,
          vault: this.vault,
          maxAmount: this.amount,
          expiresAt,
          permissionContext: this.permissionContext
        })
        this.memoryEntries.push(createEntry('grant', 'success', { txHash: grantResult.txHash }))
        this.emit('step', { agentId: this.agentId, step: 'grant-permission', status: 'done', txHash: grantResult.txHash })
      }

      // Step 2: Swap — for our USDC→USDC MockVault there is no token conversion.
      // Honest: mark skipped. (On-chain, executeAgentDeposit still emits a 1:1
      // SwapExecuted event atomically with the deposit; no separate swap tx exists.)
      const swapNeeded = false // tokenIn === tokenOut for MockVault
      this.emit('step', { agentId: this.agentId, step: 'swap', status: 'pending' })
      if (swapNeeded) {
        // Reserved for real tokenIn !== tokenOut routing (Uniswap V3) — not used by MockVault.
        this.memoryEntries.push(createEntry('swap', 'success', { amountIn: this.amount.toString(), amountOut: this.amount.toString() }))
        this.emit('step', { agentId: this.agentId, step: 'swap', status: 'done' })
      } else {
        this.memoryEntries.push(createEntry('swap', 'skipped', { reason: 'USDC→USDC: no swap required' }))
        this.emit('step', { agentId: this.agentId, step: 'swap', status: 'skipped', reason: 'USDC→USDC: no swap required' })
      }

      // Step 3: Approve — no real ERC20 approve exists (MockVault is pure-accounting;
      // executeAgentDeposit never calls transferFrom). The ApproveExecuted event is
      // emitted on-chain ATOMICALLY inside the deposit tx, so we resolve this step
      // from the real deposit tx hash AFTER the deposit returns (below).
      this.emit('step', { agentId: this.agentId, step: 'approve', status: 'pending' })

      // Step 4: Deposit — batched (already on-chain) or via relay
      this.emit('step', { agentId: this.agentId, step: 'deposit', status: 'pending' })
      const depositResult = (this.batchedHash && !this.grantsBatched)
        ? { txHash: this.batchedHash, status: 'onchain' }
        : await relayDeposit({
            agentId: this.agentId,
            user: this.user,
            vault: this.vault,
            amount: this.amount,
            permissionContext: this.permissionContext
          })
      const gasMethod =
        depositResult.status === 'onchain' ? 'user-signed'
        : depositResult.status === 'simulated' ? 'simulated'
        : 'relayer'

      // Resolve approve from the real deposit tx (ApproveExecuted emitted in the same tx).
      this.memoryEntries.push(createEntry('approve', 'success', { txHash: depositResult.txHash, note: 'emitted on-chain in deposit tx' }))
      this.emit('step', { agentId: this.agentId, step: 'approve', status: 'done', txHash: depositResult.txHash })

      const lesson = buildLesson(this.vault, { shares: this.amount.toString() })
      this.memoryEntries.push(createEntry('deposit', 'success', { txHash: depositResult.txHash, gasMethod }, lesson))
      this.emit('step', {
        agentId: this.agentId, step: 'deposit', status: 'done',
        txHash: depositResult.txHash, gasMethod, relayer: depositResult.relayer || null
      })

      // Write memory
      writeMemory(this.agentId, this.sessionId, this.vault, this.memoryEntries)
      this.emit('completed', {
        agentId: this.agentId,
        vault: this.vault,
        txHash: depositResult.txHash,
        gasMethod,
        relayer: depositResult.relayer || null
      })

      return { success: true, txHash: depositResult.txHash }

    } catch (err) {
      const lesson = buildLesson(this.vault, { error: err.message })
      this.memoryEntries.push(createEntry('deposit', 'failed', {}, lesson))
      writeMemory(this.agentId, this.sessionId, this.vault, this.memoryEntries)
      this.emit('failed', { agentId: this.agentId, vault: this.vault, error: err.message })
      return { success: false, error: err.message }
    }
  }

  emit(eventName, data) {
    this.onEvent(eventName, { ...data, agentId: this.agentId })
  }
}

/**
 * Generate a deterministic bytes32 agentId from index + session.
 * @param {number} index
 * @param {string} sessionId
 * @returns {string} 0x... bytes32 hex
 */
export function makeAgentId(index, sessionId) {
  const raw = `agent-${index}-${sessionId}`
  // Simple deterministic hash: encode as hex padded to 32 bytes
  const bytes = new TextEncoder().encode(raw)
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  return '0x' + hex.slice(0, 64).padEnd(64, '0')
}
