// frontend/src/relay.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest'

const redeemMock = vi.fn()
const hasSessionMock = vi.fn()
vi.mock('./strategy/session.js', () => ({
  redeemCall: (...a) => redeemMock(...a),
  hasSession: () => hasSessionMock(),
}))
vi.mock('./wallet.js', () => ({
  grantAgentPermissionOnChain: vi.fn(async () => '0xONCHAINGRANT'),
  executeAgentDepositOnChain: vi.fn(async () => '0xONCHAINDEP'),
  batchCalls: vi.fn(), executeWithdrawOnChain: vi.fn(), executeHarvestOnChain: vi.fn(),
}))
vi.mock('./config.js', () => ({
  ONE_SHOT_RELAYER_URL: 'http://x', AGENT_VAULT_DEPOSITOR_ADDRESS: '0xDEP', SEPOLIA_CHAIN_ID: 84532,
}))

import { relayGrantPermission, relayDeposit } from './relay.js'

// Real bytes32 / address shapes — encodeGrantAgentPermission/encodeExecuteAgentDeposit
// run through the real ethers ABI encoder (only ./wallet.js and ./strategy/session.js
// are mocked), so fixtures must be valid hex of the right width.
const AGENT_ID = '0x' + '11'.repeat(32)
const VAULT = '0x' + '22'.repeat(20)
const USER = '0x' + '33'.repeat(20)

describe('relay redeem-first', () => {
  beforeEach(() => { redeemMock.mockReset(); hasSessionMock.mockReset(); global.fetch = vi.fn(async () => ({ ok: false })) })

  it('relayGrantPermission uses session redemption when a session is active', async () => {
    hasSessionMock.mockReturnValue(true)
    redeemMock.mockResolvedValue('0xREDEEMGRANT')
    const res = await relayGrantPermission({ agentId: AGENT_ID, vault: VAULT, maxAmount: 1n, expiresAt: 9999999999, permissionContext: '0xctx' })
    expect(res.txHash).toBe('0xREDEEMGRANT')
    expect(res.status).toBe('redeemed')
  })

  it('relayGrantPermission falls back to on-chain when no session', async () => {
    hasSessionMock.mockReturnValue(false)
    const res = await relayGrantPermission({ agentId: AGENT_ID, vault: VAULT, maxAmount: 1n, expiresAt: 9999999999, permissionContext: '0xctx' })
    expect(res.txHash).toBe('0xONCHAINGRANT')
  })

  it('relayDeposit uses session redemption first', async () => {
    hasSessionMock.mockReturnValue(true)
    redeemMock.mockResolvedValue('0xREDEEMDEP')
    const res = await relayDeposit({ agentId: AGENT_ID, user: USER, vault: VAULT, amount: 1n, permissionContext: '0xctx' })
    expect(res.txHash).toBe('0xREDEEMDEP')
    expect(res.status).toBe('redeemed')
  })

  it('relayDeposit falls back to managed→on-chain when redeem throws', async () => {
    hasSessionMock.mockReturnValue(true)
    redeemMock.mockRejectedValue(new Error('redeem boom'))
    // managed proxy returns !ok (configured=false) → on-chain
    const res = await relayDeposit({ agentId: AGENT_ID, user: USER, vault: VAULT, amount: 1n, permissionContext: '0xctx' })
    expect(res.txHash).toBe('0xONCHAINDEP')
  })
})
