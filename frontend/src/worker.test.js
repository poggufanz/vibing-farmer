import { describe, it, expect, vi, beforeEach } from 'vitest'

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

// Ops-security collaborators: stateless key ops mocked entirely; gate +
// gas-snapshot mocked as shared singletons so tests can override per-call
// behavior via mockReturnValueOnce / mockResolvedValueOnce.
vi.mock('./strategy/keyVault.js', () => ({
  generateWorkerKey: vi.fn(async () => ({ privateKey: '0x' + '11'.repeat(32), address: '0xWorkerKey' })),
  newSalt: vi.fn(async () => new Uint8Array(16)),
  deriveSecret: vi.fn(async () => new Uint8Array(32)),
  sealKey: vi.fn(async () => 'sealed-blob'),
  openKey: vi.fn(async () => '0x' + '22'.repeat(32)),
  zeroize: vi.fn(),
}))
vi.mock('./strategy/gasFeeProvider.js', () => {
  const snapshot = { refresh: vi.fn(async () => ({ maxFeePerGas: 1n, at: Date.now() })), current: vi.fn(() => null) }
  return { createGasSnapshotProvider: vi.fn(() => snapshot) }
})
vi.mock('./strategy/submitGate.js', () => {
  const gate = { check: vi.fn(() => ({ ok: true, reason: 'ok', at: Date.now(), owner: 'owner' })), log: vi.fn(() => []) }
  return { createSubmitGate: vi.fn(() => gate) }
})

import { WorkerAgent } from './worker.js'
import { relayDeposit } from './relay.js'
import { openKey, generateWorkerKey } from './strategy/keyVault.js'
import { createSubmitGate } from './strategy/submitGate.js'

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

describe('WorkerAgent ops-security wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    relayDeposit.mockResolvedValue({ txHash: '0xdep', status: 'relayed' })
  })

  it('skips submit when the gate blocks (stale gas)', async () => {
    const gate = createSubmitGate()
    gate.check.mockReturnValueOnce({ ok: false, reason: 'stale_gas', at: 0, owner: '0xuser' })

    const events = []
    const w = new WorkerAgent({
      agentId: '0x' + '33'.repeat(32),
      user: '0xuser', vault: '0xvault', amount: 1000000n,
      permissionContext: '0xctx', sessionId: 's1', grantsBatched: true,
      sessionPassphrase: 'test-pass',
      onEvent: (name, data) => events.push({ name, data }),
    })
    const result = await w.execute()

    expect(result).toEqual({ success: false, status: 'skipped', step: 'deposit', reason: 'stale_gas' })
    expect(openKey).not.toHaveBeenCalled()
    expect(relayDeposit).not.toHaveBeenCalled()

    const failed = events.find((e) => e.name === 'failed')
    expect(failed.data.reason).toBe('stale_gas')
  })

  it('opens the sealed key only at the sign site on the happy path', async () => {
    const w = new WorkerAgent({
      agentId: '0x' + '44'.repeat(32),
      user: '0xuser', vault: '0xvault', amount: 1000000n,
      permissionContext: '0xctx', sessionId: 's1', grantsBatched: true,
      sessionPassphrase: 'test-pass',
      onEvent: () => {},
    })
    const result = await w.execute()

    expect(result.success).toBe(true)
    expect(generateWorkerKey).toHaveBeenCalledTimes(1)
    expect(openKey).toHaveBeenCalledTimes(1)
  })

  it('skips key-setup honestly when no session passphrase is configured', async () => {
    const w = new WorkerAgent({
      agentId: '0x' + '55'.repeat(32),
      user: '0xuser', vault: '0xvault', amount: 1000000n,
      permissionContext: '0xctx', sessionId: 's1', grantsBatched: true,
      onEvent: () => {},
    })
    const result = await w.execute()

    expect(result.success).toBe(true)
    expect(generateWorkerKey).not.toHaveBeenCalled()
    expect(openKey).not.toHaveBeenCalled()
  })
})
