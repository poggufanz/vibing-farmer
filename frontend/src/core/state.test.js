import { describe, it, expect } from 'vitest'
import { usdcWeiToUsd, USDC_DECIMALS } from './state.js'

describe('usdcWeiToUsd', () => {
  it('scales 6-decimal USDC wei to a USD number', () => {
    expect(USDC_DECIMALS).toBe(6)
    expect(usdcWeiToUsd('930000000')).toBe(930)      // 930 USDC
    expect(usdcWeiToUsd('1500000')).toBe(1.5)        // 1.5 USDC
  })

  it('returns 0 for null, undefined, or garbage instead of throwing', () => {
    expect(usdcWeiToUsd(null)).toBe(0)
    expect(usdcWeiToUsd(undefined)).toBe(0)
    expect(usdcWeiToUsd('not-a-number')).toBe(0)
  })

  it('handles uint256-scale values without throwing', () => {
    expect(usdcWeiToUsd((10n ** 30n).toString())).toBeGreaterThan(0)
  })
})
