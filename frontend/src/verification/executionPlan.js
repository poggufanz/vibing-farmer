// Pure builder: strategy -> ordered, reviewable execution steps.
// Drives the RightRail verification module. No React, no side effects.

export const DEFAULT_SLIPPAGE_PCT = 0.5

const GAS_BY_TYPE = { swap: 120_000, approve: 46_000, deposit: 134_000 }
const TIMEOUT_BY_TYPE = { swap: 30, approve: 20, deposit: 30 }
const ORDER = ['swap', 'approve', 'deposit']

/**
 * @param {{ agents?: Array }} strategy
 * @param {{ slippagePct?: number }} [opts]
 * @returns {Array<object>} ExecutionStep[]
 */
export function buildExecutionPlan(strategy, opts = {}) {
  const slippagePct = opts.slippagePct ?? DEFAULT_SLIPPAGE_PCT
  const agents = strategy?.agents ?? []
  const steps = []
  for (const a of agents) {
    for (const type of ORDER) {
      steps.push({
        id: `${a.id}-${type}`,
        type,
        agentId: a.id,
        vaultName: a.vault?.name ?? a.id,
        vaultAddr: a.vault?.addr ?? '',
        amountUsdc: a.allocation ?? 0,
        estGas: GAS_BY_TYPE[type],
        timeoutSec: TIMEOUT_BY_TYPE[type],
        slippagePct: type === 'swap' ? slippagePct : null,
      })
    }
  }
  return steps
}
