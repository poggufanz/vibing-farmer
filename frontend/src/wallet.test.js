// frontend/src/wallet.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest'

// requestERC7715Permission pulls in the Flask gate + session prep — stub them so the
// chain-guard behaviour can be exercised in isolation (no SAK/viem side effects).
vi.mock('./flaskDetect.js', () => ({ requireFlask: vi.fn(async () => {}) }))
vi.mock('./strategy/session.js', () => ({
  prepareSessionAccount: vi.fn(),
  saveSessionGrant: vi.fn(),
}))
vi.mock('./readProvider.js', () => ({ getReadProvider: vi.fn() }))

import { parseGrantResult, connectWallet, requestERC7715Permission } from './wallet.js'

describe('parseGrantResult', () => {
  it('extracts context + manager from an array result (SAK PermissionResponse[])', () => {
    const r = parseGrantResult([{ context: '0xCTX', delegationManager: '0xDM', dependencies: [] }])
    expect(r).toMatchObject({ permissionContext: '0xCTX', delegationManager: '0xDM' })
  })

  it('falls back to the demo 0xmock context when nothing is returned', () => {
    expect(parseGrantResult(null).permissionContext).toBe('0xmock')
    expect(parseGrantResult(null).delegationManager).toBeNull()
  })

  it('returns null delegationManager when the response omits it', () => {
    const r = parseGrantResult([{ context: '0xCTX' }])
    expect(r).toMatchObject({ permissionContext: '0xCTX', delegationManager: null })
  })

  it('preserves grantedPermissions as the raw array for non-array responses', () => {
    const r = parseGrantResult({ permissionContext: '0xCTX', grantedPermissions: [{ a: 1 }] })
    expect(r.grantedPermissions).toEqual([{ a: 1 }])
  })
})

describe('requestERC7715Permission chain guard', () => {
  // ERC-7715 (wallet_requestExecutionPermissions) is only honoured by MetaMask Flask on
  // Ethereum Sepolia. On Base Sepolia (0x14a34 — this app's chain) the request wedges
  // "in process" in MetaMask's single service-worker queue and -32002-jams every later
  // wallet_sendCalls / deposit on the EIP-7702-delegated EOA. The grant is decorative
  // here anyway. So the call MUST be skipped on unsupported chains.
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does NOT fire wallet_requestExecutionPermissions on Base Sepolia, returns a mock grant', async () => {
    const request = vi.fn(async (arg) => {
      const method = arg?.method
      if (method === 'eth_requestAccounts') return ['0xUSER']
      if (method === 'eth_chainId') return '0x14a34' // Base Sepolia
      if (method === 'wallet_requestExecutionPermissions') {
        throw new Error('wallet_requestExecutionPermissions must not be called on Base Sepolia')
      }
      return null
    })
    vi.stubGlobal('window', { ethereum: { request } })

    await connectWallet()
    const grant = await requestERC7715Permission(86400)

    const fired = request.mock.calls.some(([a]) => a?.method === 'wallet_requestExecutionPermissions')
    expect(fired).toBe(false)
    expect(grant.permissionContext).toBe('0xmock')
    expect(grant.delegationManager).toBeNull()
  })
})
