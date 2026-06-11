// frontend/src/strategy/decisionLog.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { accSummary } from './decisionLog.js'

describe('accSummary', () => {
  it('uses the first concern when present, with cited rules', () => {
    expect(accSummary({ signal: 'WITHDRAW', citedRules: ['risk-turbulent-veto'], concerns: ['turbulent market'] }))
      .toBe('WITHDRAW — turbulent market (risk-turbulent-veto)')
  })

  it('falls back to a positive phrase when no concerns', () => {
    expect(accSummary({ signal: 'DEPOSIT', citedRules: ['yield-uplift'], concerns: [] }))
      .toBe('DEPOSIT — clear to proceed (yield-uplift)')
  })

  it('omits the rules suffix when no cited rules', () => {
    expect(accSummary({ signal: 'HOLD', citedRules: [], concerns: [] }))
      .toBe('HOLD — hold')
  })

  it('tolerates missing arrays', () => {
    expect(accSummary({ signal: 'DEPOSIT' })).toBe('DEPOSIT — clear to proceed')
  })
})
