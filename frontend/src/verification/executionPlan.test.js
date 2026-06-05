import { describe, it, expect } from 'vitest'
import { buildExecutionPlan, DEFAULT_SLIPPAGE_PCT } from './executionPlan.js'

const strategy = {
  total: 100,
  agents: [
    { id: 'worker-1', allocation: 60, vault: { name: 'Aave USDC', addr: '0xAAA0000000000000000000000000000000000001' } },
    { id: 'worker-2', allocation: 40, vault: { name: 'Morpho USDC', addr: '0xBBB0000000000000000000000000000000000002' } },
  ],
}

describe('buildExecutionPlan', () => {
  it('emits swap, approve, deposit per agent in order', () => {
    const plan = buildExecutionPlan(strategy)
    expect(plan).toHaveLength(6)
    expect(plan.slice(0, 3).map((s) => s.type)).toEqual(['swap', 'approve', 'deposit'])
    expect(plan[0]).toMatchObject({ agentId: 'worker-1', vaultName: 'Aave USDC', amountUsdc: 60 })
  })

  it('only swap steps carry slippage', () => {
    const plan = buildExecutionPlan(strategy, { slippagePct: 0.8 })
    expect(plan.find((s) => s.type === 'swap').slippagePct).toBe(0.8)
    expect(plan.find((s) => s.type === 'approve').slippagePct).toBeNull()
  })

  it('defaults slippage and gives every step a stable id, gas and timeout', () => {
    const plan = buildExecutionPlan(strategy)
    expect(plan.find((s) => s.type === 'swap').slippagePct).toBe(DEFAULT_SLIPPAGE_PCT)
    expect(new Set(plan.map((s) => s.id)).size).toBe(6)
    expect(plan.every((s) => s.estGas > 0 && s.timeoutSec > 0)).toBe(true)
  })

  it('returns [] for an empty strategy', () => {
    expect(buildExecutionPlan(null)).toEqual([])
    expect(buildExecutionPlan({ agents: [] })).toEqual([])
  })
})
