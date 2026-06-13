// frontend/src/orchestrator.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest'

const batchCallsMock = vi.fn(async () => '0xBATCH')
const approveMock = vi.fn(async () => '0xAPPROVE')
vi.mock('./wallet.js', () => ({
  batchCalls: (...a) => batchCallsMock(...a),
  approveDepositorOnChain: (...a) => approveMock(...a),
  // null → balance precheck in orchestrator.dispatch is skipped (have/want guard)
  readUsdcBalance: async () => null,
}))
vi.mock('./relay.js', () => ({
  buildAuthorizeSessionKeyCall: vi.fn(({ agent }) => ({ to: '0xREG', data: '0x', agent })),
  buildApproveCall: vi.fn(() => ({ to: '0xUSDC', data: '0x' })),
}))
vi.mock('./config.js', () => ({ USDC_SEPOLIA: '0x' + 'dc'.repeat(20) }))
vi.mock('./venice.js', () => ({ generateAgentSkills: vi.fn(async () => ({})) }))
vi.mock('./skills.js', () => ({ saveSkill: vi.fn() }))
vi.mock('./redelegation.js', () => ({
  createOrchestratorAccount: vi.fn(async () => { throw new Error('no SAK in test') }),
  createWorkerRedelegations: vi.fn(async () => []),
}))

let nextKey = 0
vi.mock('./worker.js', () => ({
  WorkerAgent: class {
    constructor(c) { Object.assign(this, c); this.keyAddress = null }
    async setupKey() { this.keyAddress = '0xKEY' + (nextKey++); return this.keyAddress }
    async execute() { return { success: true, txHash: '0xW' } }
  },
  makeAgentId: (i, s) => `0x${i}${s}`,
  makePlanId: () => 42n,
}))

import { OrchestratorAgent } from './orchestrator.js'

describe('orchestrator scope authorization', () => {
  beforeEach(() => { batchCallsMock.mockClear(); approveMock.mockClear(); nextKey = 0 })

  const strategy = { vaults: [{ address: '0xV1', allocation: 0.5 }, { address: '0xV2', allocation: 0.5 }] }

  it('batches approve + authorizeSessionKey for every worker in one popup', async () => {
    const orch = new OrchestratorAgent({ user: '0xU', sessionId: 's1', onEvent: () => {} })
    await orch.dispatch(strategy, 100)
    expect(batchCallsMock).toHaveBeenCalledOnce()
    // 1 approve + 2 authorize calls
    const calls = batchCallsMock.mock.calls[0][0]
    expect(calls).toHaveLength(3)
  })

  it('falls back to a single approve when the wallet lacks EIP-5792', async () => {
    batchCallsMock.mockResolvedValueOnce(null)
    const orch = new OrchestratorAgent({ user: '0xU', sessionId: 's2', onEvent: () => {} })
    const res = await orch.dispatch(strategy, 100)
    expect(approveMock).toHaveBeenCalledOnce()
    expect(res.completed).toBe(2)
  })

  it('emits AgentScopeAuthorized per worker for the revoke UI', async () => {
    const events = []
    const orch = new OrchestratorAgent({ user: '0xU', sessionId: 's3', onEvent: (n, d) => events.push({ n, d }) })
    await orch.dispatch(strategy, 100)
    const scoped = events.filter((e) => e.n === 'AgentScopeAuthorized')
    expect(scoped).toHaveLength(2)
    expect(scoped[0].d.agent).toMatch(/^0xKEY/)
  })
})
