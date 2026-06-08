// frontend/src/strategy/session.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock SAK + viem BEFORE importing the module under test.
const sendTxMock = vi.fn(async () => '0xdeadbeef')
vi.mock('@metamask/smart-accounts-kit/actions', () => ({
  erc7710WalletActions: () => (client) => ({ ...client, sendTransactionWithDelegation: sendTxMock }),
}))
vi.mock('viem', () => ({
  createWalletClient: (cfg) => ({ ...cfg, extend: (fn) => ({ ...cfg, ...fn({ ...cfg }) }) }),
  custom: (p) => ({ __transport: p }),
}))
vi.mock('viem/accounts', () => ({
  privateKeyToAccount: (k) => ({ address: '0xSESSION', __key: k }),
  generatePrivateKey: () => '0xPRIV',
}))

import { initSession, redeemCall, clearSession, getSessionAddress } from './session.js'

describe('session', () => {
  beforeEach(() => {
    sendTxMock.mockClear()
    clearSession()
    vi.stubGlobal('window', { ethereum: { request: vi.fn() } })
  })

  it('initSession creates a session account with an address', () => {
    initSession({ permissionContext: '0xctx', delegationManager: '0xdm' })
    expect(getSessionAddress()).toBe('0xSESSION')
  })

  it('redeemCall routes to sendTransactionWithDelegation with context + manager', async () => {
    initSession({ permissionContext: '0xctx', delegationManager: '0xdm' })
    const hash = await redeemCall({ to: '0xVault', data: '0xcalldata' })
    expect(hash).toBe('0xdeadbeef')
    expect(sendTxMock).toHaveBeenCalledWith(expect.objectContaining({
      to: '0xVault', data: '0xcalldata', permissionContext: '0xctx', delegationManager: '0xdm',
    }))
  })

  it('redeemCall throws when no session is active', async () => {
    await expect(redeemCall({ to: '0xVault', data: '0x' })).rejects.toThrow(/no active session/i)
  })

  it('clearSession disables redemption', async () => {
    initSession({ permissionContext: '0xctx', delegationManager: '0xdm' })
    clearSession()
    await expect(redeemCall({ to: '0xVault', data: '0x' })).rejects.toThrow(/no active session/i)
  })
})
