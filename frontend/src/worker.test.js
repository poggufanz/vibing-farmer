import { describe, it, expect, vi } from 'vitest'

// Mock collaborators so execute() runs without a chain or relay.
vi.mock('./relay.js', () => ({
  relayGrantPermission: vi.fn(async () => ({ txHash: '0xgrant' })),
  relayDeposit: vi.fn(async () => ({ txHash: '0xdep', status: 'onchain' })),
}))
vi.mock('./memory.js', () => ({
  writeMemory: vi.fn(),
  createEntry: (step, status, data, lesson) => ({ step, status, ...data, lesson }),
  buildLesson: () => 'lesson',
}))
vi.mock('./skills.js', () => ({ loadSkill: vi.fn() }))

import { WorkerAgent } from './worker.js'

async function runWorker(depositStatus) {
  const { relayDeposit } = await import('./relay.js')
  relayDeposit.mockResolvedValueOnce({ txHash: '0xdep', status: depositStatus })
  return new Promise((resolve) => {
    const events = []
    const w = new WorkerAgent({
      agentId: '0x' + '11'.repeat(32),
      user: '0xuser', vault: '0xvault', amount: 1000000n,
      permissionContext: '0xctx', sessionId: 's1', grantsBatched: true,
      onEvent: (name, data) => {
        events.push({ name, data })
        if (name === 'completed' || name === 'failed') resolve(events)
      },
    })
    w.execute()
  })
}

describe('WorkerAgent gasMethod', () => {
  it('emits gasMethod "user-signed" when deposit status is onchain', async () => {
    const events = await runWorker('onchain')
    const deposit = events.find((e) => e.name === 'step' && e.data.step === 'deposit' && e.data.status === 'done')
    expect(deposit.data.gasMethod).toBe('user-signed')
  })

  it('emits gasMethod "relayer" when deposit status is relayed', async () => {
    const events = await runWorker('relayed')
    const deposit = events.find((e) => e.name === 'step' && e.data.step === 'deposit' && e.data.status === 'done')
    expect(deposit.data.gasMethod).toBe('relayer')
  })

  it('marks swap as skipped (no fake latency)', async () => {
    const events = await runWorker('relayed')
    const swap = events.find((e) => e.name === 'step' && e.data.step === 'swap' && e.data.status !== 'pending')
    expect(swap.data.status).toBe('skipped')
  })
})
