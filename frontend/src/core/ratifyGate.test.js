import { describe, it, expect } from 'vitest'
import { needsRatify } from './ratifyGate.js'

describe('needsRatify', () => {
  it('conservative (ceiling 0) ratifies every move', () => {
    expect(needsRatify({ requireApprovalAboveUsd: 0 }, 0)).toBe(true)
    expect(needsRatify({ requireApprovalAboveUsd: 0 }, 9999)).toBe(true)
  })

  it('balanced (ceiling 100) ratifies only at/above the ceiling', () => {
    expect(needsRatify({ requireApprovalAboveUsd: 100 }, 99)).toBe(false)
    expect(needsRatify({ requireApprovalAboveUsd: 100 }, 100)).toBe(true)
    expect(needsRatify({ requireApprovalAboveUsd: 100 }, 250)).toBe(true)
  })

  it('full (ceiling null) never ratifies', () => {
    expect(needsRatify({ requireApprovalAboveUsd: null }, 1_000_000)).toBe(false)
  })

  it('treats missing scope/move as no-ratify-safe', () => {
    expect(needsRatify(null, 100)).toBe(false)
    expect(needsRatify({ requireApprovalAboveUsd: 100 }, undefined)).toBe(false)
  })
})
