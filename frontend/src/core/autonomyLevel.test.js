import { describe, it, expect } from 'vitest'
import { AUTONOMY_LEVELS, resolveAutonomyScope } from './autonomyLevel.js'

describe('resolveAutonomyScope', () => {
  it('conservative keeps tight cooldown, whitelist only, low approval ceiling', () => {
    const s = resolveAutonomyScope('conservative')
    expect(s.whitelistOnly).toBe(true)
    expect(s.minCooldownHours).toBeGreaterThan(0)
    expect(s.requireApprovalAboveUsd).not.toBeNull()
  })

  it('balanced is the default for unknown input', () => {
    expect(resolveAutonomyScope('???').level).toBe('balanced')
    expect(resolveAutonomyScope().level).toBe('balanced')
  })

  it('full control removes whitelist + approval ceiling and zeroes cooldown', () => {
    const s = resolveAutonomyScope('full')
    expect(s.whitelistOnly).toBe(false)
    expect(s.requireApprovalAboveUsd).toBeNull()
    expect(s.minCooldownHours).toBe(0)
  })

  it('exposes the three selectable levels with labels', () => {
    expect(AUTONOMY_LEVELS.map((l) => l.id)).toEqual(['conservative', 'balanced', 'full'])
    expect(AUTONOMY_LEVELS.every((l) => l.label && l.desc)).toBe(true)
  })
})
