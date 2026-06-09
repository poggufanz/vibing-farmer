// frontend/src/orchestrator.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest'

const batchCallsMock = vi.fn(async () => '0xBATCH')
const hasSessionMock = vi.fn()
vi.mock('./wallet.js', () => ({ batchCalls: (...a) => batchCallsMock(...a) }))
vi.mock('./strategy/session.js', () => ({ hasSession: () => hasSessionMock() }))
vi.mock('./relay.js', () => ({
  isUnsupportedByOneShot: () => true,
  useManagedRelay: () => true,
  buildGrantCall: vi.fn(async () => ({ to: '0x', data: '0x' })),
  buildDepositCall: vi.fn(async () => ({ to: '0x', data: '0x' })),
}))
vi.mock('./venice.js', () => ({ generateAgentSkills: vi.fn(async () => ({})) }))
vi.mock('./skills.js', () => ({ saveSkill: vi.fn() }))
vi.mock('./worker.js', () => ({
  WorkerAgent: class { constructor(c){ this.c = c } async execute(){ return { success: true, txHash: '0xW' } } },
  makeAgentId: (i, s) => `0x${i}${s}`,
}))

import { OrchestratorAgent } from './orchestrator.js'

describe('orchestrator session-aware batching', () => {
  beforeEach(() => { batchCallsMock.mockClear(); hasSessionMock.mockReset() })

  const strategy = { vaults: [{ address: '0xV1', allocation: 0.5 }, { address: '0xV2', allocation: 0.5 }] }

  it('does NOT batch grants when a session is active', async () => {
    hasSessionMock.mockReturnValue(true)
    const orch = new OrchestratorAgent({ user: '0xU', permissionContext: '0xctx', sessionId: 's1', onEvent: () => {} })
    await orch.dispatch(strategy, 100)
    expect(batchCallsMock).not.toHaveBeenCalled()
  })

  it('still batches grants when no session (legacy path)', async () => {
    hasSessionMock.mockReturnValue(false)
    const orch = new OrchestratorAgent({ user: '0xU', permissionContext: '0xctx', sessionId: 's2', onEvent: () => {} })
    await orch.dispatch(strategy, 100)
    expect(batchCallsMock).toHaveBeenCalled()
  })
})
