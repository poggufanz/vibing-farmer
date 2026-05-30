import { WorkerAgent, makeAgentId } from './worker.js'
import { generateAgentSkills } from './venice.js'
import { saveSkill } from './skills.js'
import { batchCalls } from './wallet.js'
import { isUnsupportedByOneShot, buildGrantCall, buildDepositCall } from './relay.js'

/**
 * Orchestrator Agent — receives Venice plan, dispatches Worker Agents in parallel.
 */
export class OrchestratorAgent {
  /**
   * @param {object} config
   * @param {string} config.user - user address
   * @param {string} config.permissionContext - from ERC-7715
   * @param {string|null} config.veniceAuth - base64 SIWE header for Venice x402
   * @param {string|null} config.devApiKey - DeepSeek API key for dev mode
   * @param {function} config.onEvent - (eventName, data) => void
   */
  constructor({ user, permissionContext, veniceAuth, devApiKey, sessionId, onEvent }) {
    this.user = user
    this.permissionContext = permissionContext
    this.veniceAuth = veniceAuth || null
    this.devApiKey = devApiKey || null
    this.onEvent = onEvent || (() => {})
    this.sessionId = sessionId || `session-${Date.now()}`
  }

  /**
   * Execute full orchestration: generate skills → dispatch parallel workers → aggregate.
   * @param {object} strategy - from generateStrategy(): { vaults: [{ address, allocation }], ... }
   * @param {number} totalAmount - total USDC amount (human-readable)
   * @returns {Promise<{completed: number, failed: number, results: Array}>}
   */
  async dispatch(strategy, totalAmount) {
    const vaultPlans = strategy.vaults.map((v, i) => ({
      index: i,
      agentId: makeAgentId(i, this.sessionId),
      vault: v.address,
      amountUSDC: totalAmount * v.allocation,
      amountUnits: BigInt(Math.floor(totalAmount * v.allocation * 1e6))
    }))

    this.onEvent('orchestrator-started', {
      sessionId: this.sessionId,
      totalAgents: vaultPlans.length,
      vaults: vaultPlans.map(p => p.vault)
    })

    // Generate skills for all agents (parallel)
    this.onEvent('orchestrator-step', { step: 'generating-skills', status: 'pending' })
    const skillsResults = await Promise.allSettled(
      vaultPlans.map(plan =>
        generateAgentSkills({
          agentId: plan.agentId,
          vault: plan.vault,
          amount: plan.amountUSDC,
          veniceAuth: this.veniceAuth,
          devApiKey: this.devApiKey
        }).then(skill => {
          saveSkill(plan.agentId, skill)
          return { agentId: plan.agentId, skill }
        })
      )
    )
    this.onEvent('orchestrator-step', { step: 'generating-skills', status: 'done' })

    // Single-confirmation batch: grant + deposit for ALL agents in one wallet popup
    // (EIP-5792). null if wallet lacks it → workers fall back to per-agent signing.
    let batchedHash = null
    if (isUnsupportedByOneShot()) {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600
      const calls = []
      for (const p of vaultPlans) {
        calls.push(await buildGrantCall({ agentId: p.agentId, vault: p.vault, maxAmount: p.amountUnits, expiresAt }))
        calls.push(await buildDepositCall({ agentId: p.agentId, user: this.user, vault: p.vault, amount: p.amountUnits }))
      }
      batchedHash = await batchCalls(calls)
    }

    // ── A2A coordination: orchestrator redelegates a scoped subset to each worker ──
    // Real ERC-7710 redelegation chain (user root → orchestrator → workers), the on-chain
    // proof of agent-to-agent coordination. Best-effort: any failure (missing orchestrator
    // key, network, unsupported API) silently falls back to existing direct execution.
    // redelegation.js is loaded lazily so a SAK load issue can never break orchestration.
    let workerRedelegations = null
    try {
      const { createOrchestratorAccount, createWorkerRedelegations } = await import('./redelegation.js')
      const orchestratorSmartAccount = await createOrchestratorAccount()
      const workers = vaultPlans.map((p) => ({
        workerId: p.index + 1,
        address: p.vault,            // per-worker delegate identity (distinct vault)
        allocationUsdc: p.amountUSDC,
        vaultAddress: p.vault
      }))
      workerRedelegations = await createWorkerRedelegations({
        orchestratorSmartAccount,
        rootDelegation: this.permissionContext?.rootDelegation || this.permissionContext,
        workers
      })
      workerRedelegations.forEach((rd) => this.onEvent('RedelegationCreated', {
        agentId: vaultPlans[rd.workerId - 1]?.agentId,
        workerId: rd.workerId,
        from: 'orchestrator',
        to: `worker-${rd.workerId}`,
        allocationUsdc: rd.allocationUsdc,
        vaultAddress: rd.vaultAddress,
        delegationHash: rd.delegationHash
      }))
    } catch (err) {
      console.warn('[A2A] Redelegation failed, falling back to direct execution:', err)
      workerRedelegations = null
    }

    // Dispatch all workers in parallel — use Promise.allSettled so one failure doesn't abort others
    this.onEvent('orchestrator-step', { step: 'dispatching-agents', status: 'pending' })
    const workerResults = await Promise.allSettled(
      vaultPlans.map((plan, i) => {
        const worker = new WorkerAgent({
          agentId: plan.agentId,
          user: this.user,
          vault: plan.vault,
          amount: plan.amountUnits,
          permissionContext: this.permissionContext,
          sessionId: this.sessionId,
          onEvent: this.onEvent,
          batchedHash
        })
        return worker.execute().then((res) => {
          // Worker redeemed its redelegation to execute the deposit → A2A redeem proof
          const rd = workerRedelegations?.[i]
          if (rd && res?.success) {
            this.onEvent('RedelegationRedeemed', {
              agentId: plan.agentId,
              workerId: rd.workerId,
              to: `worker-${rd.workerId}`,
              txHash: res.txHash,
              delegationHash: rd.delegationHash
            })
          }
          return res
        })
      })
    )
    this.onEvent('orchestrator-step', { step: 'dispatching-agents', status: 'done' })

    // Aggregate results
    const results = workerResults.map((r, i) => ({
      agentId: vaultPlans[i].agentId,
      vault: vaultPlans[i].vault,
      success: r.status === 'fulfilled' && r.value?.success,
      txHash: r.value?.txHash,
      error: r.reason?.message || r.value?.error
    }))

    const completed = results.filter(r => r.success).length
    const failed = results.length - completed

    this.onEvent('orchestrator-completed', {
      sessionId: this.sessionId,
      completed,
      failed,
      results
    })

    return { completed, failed, results, sessionId: this.sessionId }
  }
}
