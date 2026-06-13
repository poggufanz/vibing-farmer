import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock collaborators so execute() runs without a chain or relay. Keep computeExecId +
// the EIP-712 domain/types REAL so signAtSubmitSite signs against the true shape (it signs
// with a real ethers.Wallet from the mocked keyVault key — that path is exercised, not faked).
vi.mock('./relay.js', () => ({
  relayDeposit: vi.fn(async () => ({ txHash: '0xdep', status: 'onchain' })),
  computeExecId: () => '0x' + 'ab'.repeat(32),
  signDeposit: vi.fn(async () => '0x' + '99'.repeat(65)),
  DEPOSIT_DOMAIN: (chainId, verifyingContract) => ({ name: 'VibingFarmer', version: '1', chainId, verifyingContract }),
  DEPOSIT_TYPES: { AgentDeposit: [
    { name: 'amount', type: 'uint256' },
    { name: 'minAmount', type: 'uint256' },
    { name: 'minShares', type: 'uint256' },
    { name: 'execId', type: 'bytes32' },
  ] },
}))
vi.mock('./wallet.js', () => ({
  authorizeSessionKeyOnChain: vi.fn(async () => '0xauth'),
}))
vi.mock('./memory.js', () => ({
  writeMemory: vi.fn(),
  createEntry: (step, status, data, lesson) => ({ step, status, ...data, lesson }),
  buildLesson: () => 'lesson',
}))

// Ops-security collaborators. generateWorkerKey returns a REAL 32-byte private key so the
// ethers.Wallet in signAtSubmitSite can derive an address + sign. openKey likewise returns a
// real key (the sealed-store path).
vi.mock('./strategy/keyVault.js', () => ({
  generateWorkerKey: vi.fn(async () => ({ privateKey: '0x' + '11'.repeat(32), address: '0xWorkerKey' })),
  newSalt: vi.fn(async () => new Uint8Array(16)),
  deriveSecret: vi.fn(async () => new Uint8Array(32)),
  sealKey: vi.fn(async () => 'sealed-blob'),
  openKey: vi.fn(async () => '0x' + '22'.repeat(32)),
  zeroize: vi.fn(),
}))
vi.mock('./strategy/keyStore.js', () => {
  const store = { put: vi.fn(async () => {}), get: vi.fn(async () => ({ sealed: 'sealed-blob', salt: new Uint8Array(16) })) }
  return { createKeyStore: vi.fn(() => store) }
})
vi.mock('./strategy/gasFeeProvider.js', () => {
  const snapshot = { refresh: vi.fn(async () => ({ maxFeePerGas: 1n, at: Date.now() })), current: vi.fn(() => null) }
  return { createGasSnapshotProvider: vi.fn(() => snapshot) }
})
vi.mock('./strategy/submitGate.js', () => {
  const gate = { check: vi.fn(() => ({ ok: true, reason: 'ok', at: Date.now(), owner: 'owner' })), log: vi.fn(() => []) }
  return { createSubmitGate: vi.fn(() => gate) }
})
vi.mock('./readProvider.js', () => ({ getReadProvider: vi.fn(() => null) }))

import { WorkerAgent } from './worker.js'
import { relayDeposit } from './relay.js'
import { openKey, generateWorkerKey } from './strategy/keyVault.js'
import { createSubmitGate } from './strategy/submitGate.js'

// Valid 20-byte owner/vault so computeExecId-style address encoding never trips (we mock
// computeExecId, but the EIP-712 message uses execId only — addresses here are cosmetic).
const USER = '0x' + '33'.repeat(20)
const VAULT = '0x' + '44'.repeat(20)

async function runWorker(depositStatus) {
  relayDeposit.mockResolvedValueOnce({ txHash: '0xdep', status: depositStatus })
  return new Promise((resolve) => {
    const events = []
    const w = new WorkerAgent({
      agentId: '0x' + '11'.repeat(32),
      user: USER, vault: VAULT, amount: 1000000n,
      sessionId: 's1', planId: 1, step: 0, scopeAuthorized: true,
      onEvent: (name, data) => {
        events.push({ name, data })
        if (name === 'completed' || name === 'failed') resolve(events)
      },
    })
    w.execute()
  })
}

describe('WorkerAgent gasMethod', () => {
  beforeEach(() => vi.clearAllMocks())

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
    gate.check.mockReturnValueOnce({ ok: false, reason: 'stale_gas', at: 0, owner: USER })

    const events = []
    const w = new WorkerAgent({
      agentId: '0x' + '33'.repeat(32),
      user: USER, vault: VAULT, amount: 1000000n,
      sessionId: 's1', planId: 1, step: 0, scopeAuthorized: true,
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
      user: USER, vault: VAULT, amount: 1000000n,
      sessionId: 's1', planId: 1, step: 0, scopeAuthorized: true,
      sessionPassphrase: 'test-pass',
      onEvent: () => {},
    })
    const result = await w.execute()

    expect(result.success).toBe(true)
    expect(generateWorkerKey).toHaveBeenCalledTimes(1)
    expect(openKey).toHaveBeenCalledTimes(1)
  })

  it('generates an ephemeral in-memory key when no session passphrase is configured', async () => {
    const w = new WorkerAgent({
      agentId: '0x' + '55'.repeat(32),
      user: USER, vault: VAULT, amount: 1000000n,
      sessionId: 's1', planId: 1, step: 0, scopeAuthorized: true,
      onEvent: () => {},
    })
    const result = await w.execute()

    // v2: the key is the on-chain agent identity, so it is ALWAYS generated. Without a
    // passphrase it stays in memory (never sealed/opened from the store).
    expect(result.success).toBe(true)
    expect(generateWorkerKey).toHaveBeenCalledTimes(1)
    expect(openKey).not.toHaveBeenCalled()
  })
})
