// frontend/src/wallet.test.js
import { describe, it, expect } from 'vitest'

import { parseGrantResult } from './wallet.js'

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
