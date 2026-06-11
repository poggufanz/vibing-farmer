import { relayGrantPermission, relayDeposit } from './relay.js'
import { writeMemory, createEntry, buildLesson } from './memory.js'
import { loadSkill } from './skills.js'
import { generateWorkerKey, newSalt, deriveSecret, sealKey, openKey, zeroize } from './strategy/keyVault.js'
import { createKeyStore } from './strategy/keyStore.js'
import { createGasSnapshotProvider } from './strategy/gasFeeProvider.js'
import { createSubmitGate } from './strategy/submitGate.js'
import { getReadProvider } from './readProvider.js'

// Rough upper bound for executeAgentDeposit gas cost; refined once Phase 5 wires real estimateGas.
const EST_DEPOSIT_GAS = 150_000n

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
   * @param {string} [config.sessionPassphrase] - session passphrase for the per-worker key vault.
   *   When omitted, key-setup and signing-site steps are honestly marked 'skipped'.
   * @param {bigint} [config.expectedBenefitWei] - per-step yield estimate for the economic gate.
   * @param {object} [config.keyStore] - injectable keyStore (defaults to createKeyStore())
   * @param {object} [config.submitGate] - injectable submitGate (defaults to createSubmitGate())
   * @param {object} [config.gasSnapshot] - injectable gas snapshot provider
   */
  constructor({
    agentId, user, vault, amount, permissionContext, sessionId, onEvent, batchedHash, grantsBatched,
    sessionPassphrase, expectedBenefitWei, keyStore, submitGate, gasSnapshot,
  }) {
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

    // Ops-security wiring (Phase 2): per-worker ephemeral key + pre-submit circuit breaker.
    this.sessionPassphrase = sessionPassphrase || null
    this.expectedBenefitWei = expectedBenefitWei ?? null
    this.keyStore = keyStore || createKeyStore()
    this.submitGate = submitGate || createSubmitGate()
    this.gasSnapshot = gasSnapshot || createGasSnapshotProvider({ provider: getReadProvider() })
    this.keyAddress = null
  }

  /**
   * Execute full agent flow.
   * @returns {Promise<{success: boolean, txHash?: string, error?: string, shares?: bigint, status?: string, step?: string, reason?: string}>}
   */
  async execute() {
    try {
      this.emit('started', { agentId: this.agentId, vault: this.vault })

      // Step 0: per-worker ephemeral key — generated + sealed at plan time (keyVault + keyStore).
      await this.setupKey()

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

      // Step 3.5: Pre-submit circuit breaker — gas freshness + economic + rate-anomaly gate.
      // Soft check; the hard stop is AgentVaultDepositor.pause() on-chain.
      const gateResult = await this.checkSubmitGate()
      if (!gateResult.ok) {
        this.memoryEntries.push(createEntry('deposit', 'skipped', { reason: gateResult.reason }))
        this.emit('step', { agentId: this.agentId, step: 'deposit', status: 'skipped', reason: gateResult.reason })
        writeMemory(this.agentId, this.sessionId, this.vault, this.memoryEntries)
        this.emit('failed', {
          agentId: this.agentId, vault: this.vault,
          error: `submit-gate blocked deposit: ${gateResult.reason} (safe to retry)`,
          skipped: true, reason: gateResult.reason,
        })
        return { success: false, status: 'skipped', step: 'deposit', reason: gateResult.reason }
      }

      // Step 3.6: Open the ephemeral key at the EIP-712 sign site — and only here.
      await this.signAtSubmitSite()

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
      const gasMethod = depositResult.status === 'onchain' ? 'user-signed' : 'relayer'

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

  /**
   * Generate + seal a fresh ephemeral worker key (keyVault) and persist the
   * sealed blob (keyStore). One key per worker, never a master key.
   * Without a session passphrase there is nothing to derive the at-rest
   * secret from, so this is honestly marked 'skipped' rather than faked.
   */
  async setupKey() {
    this.emit('step', { agentId: this.agentId, step: 'key-setup', status: 'pending' })

    if (!this.sessionPassphrase) {
      this.memoryEntries.push(createEntry('key-setup', 'skipped', { reason: 'no session passphrase configured' }))
      this.emit('step', { agentId: this.agentId, step: 'key-setup', status: 'skipped', reason: 'no session passphrase configured' })
      return
    }

    const { privateKey, address } = await generateWorkerKey()
    const salt = await newSalt()
    const secret = await deriveSecret(this.sessionPassphrase, salt)
    const sealed = await sealKey(privateKey, secret)
    await this.keyStore.put(address, { sealed, salt })
    zeroize(secret)
    // TODO(phase5): authorize `address` on-chain via AgentRegistry.authorizeSessionKey(...)
    // so the relayer-broadcast EIP-712 deposit signed by this key is accepted.

    this.keyAddress = address
    this.memoryEntries.push(createEntry('key-setup', 'success', { address }))
    this.emit('step', { agentId: this.agentId, step: 'key-setup', status: 'done', address })
  }

  /**
   * Refresh the gas snapshot and run the pre-submit circuit breaker.
   * @returns {Promise<{ok: boolean, reason: string}>}
   */
  async checkSubmitGate() {
    this.emit('step', { agentId: this.agentId, step: 'submit-gate', status: 'pending' })
    const snap = await this.gasSnapshot.refresh()
    const result = this.submitGate.check({
      owner: this.user,
      gasSnapshotAt: snap?.at ?? null,
      estGasCostWei: snap?.maxFeePerGas != null ? snap.maxFeePerGas * EST_DEPOSIT_GAS : null,
      expectedBenefitWei: this.expectedBenefitWei,
    })
    this.emit('step', { agentId: this.agentId, step: 'submit-gate', status: result.ok ? 'done' : 'skipped', reason: result.reason })
    return result
  }

  /**
   * Open the sealed ephemeral key at the EIP-712 sign site — and only here.
   * No-op if setupKey() was skipped (no session passphrase).
   */
  async signAtSubmitSite() {
    if (!this.keyAddress) return

    this.emit('step', { agentId: this.agentId, step: 'sign', status: 'pending' })
    const { sealed, salt } = await this.keyStore.get(this.keyAddress)
    const secret = await deriveSecret(this.sessionPassphrase, salt)
    const pk = await openKey(sealed, secret)
    // TODO(phase5): const sig = await signDeposit(pk, digest) — sign the AgentDeposit
    // EIP-712 digest with `pk`, then pass `sig` into the relayer submission.
    zeroize(secret)
    void pk // immutable hex string — cannot be zeroized; drop reference immediately

    this.memoryEntries.push(createEntry('sign', 'done', { note: 'TODO(phase5): signDeposit not yet wired' }))
    this.emit('step', { agentId: this.agentId, step: 'sign', status: 'done', note: 'TODO(phase5): signDeposit' })
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
