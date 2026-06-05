import { describe, it, expect } from 'vitest'
import { toPositionsMap } from './positionsSource.js'

describe('toPositionsMap', () => {
  it('keys positions by lowercased vault address', () => {
    const positions = [
      { vault: '0xAaA', vaultName: 'Aave v3 USDC', balance: '1000000', unclaimedRewards: '0' },
    ]
    const map = toPositionsMap(positions)
    expect(map['0xaaa']).toEqual({ vaultName: 'Aave v3 USDC', balance: '1000000', unclaimedRewards: '0' })
  })

  it('returns an empty object for null/empty input', () => {
    expect(toPositionsMap(null)).toEqual({})
    expect(toPositionsMap([])).toEqual({})
  })

  it('defaults missing fields without throwing', () => {
    const map = toPositionsMap([{ vault: '0xBbb' }])
    expect(map['0xbbb']).toEqual({ vaultName: '', balance: '0', unclaimedRewards: '0' })
  })
})
