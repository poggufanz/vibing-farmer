// frontend/src/brain/councilEvents.test.js
import { describe, it, expect } from 'vitest'
import { buildCouncilEvent, EVENT_STYLES } from './councilEvents.js'

describe('councilEvents', () => {
  it('returns null for stages that produce no council event', () => {
    expect(buildCouncilEvent('fetch', 1284, new Date(0))).toBeNull()
  })

  it('builds a verdict event for the consensus stage', () => {
    const ev = buildCouncilEvent('verdict', 1284, new Date(0), { finalDecision: 'EXECUTE', executeVotes: 3, total: 3, confidence: 0.82 })
    expect(ev).toMatchObject({ cycle: 1284 })
    expect(ev.text.toLowerCase()).toContain('decided')
    expect(ev.id).toBeTruthy()
  })

  it('every emitted event id is unique per (stage,cycle,time)', () => {
    const a = buildCouncilEvent('council', 1, new Date(0), {})
    const b = buildCouncilEvent('council', 2, new Date(0), {})
    expect(a.id).not.toBe(b.id)
  })

  it('EVENT_STYLES maps known stages to marker char + color token', () => {
    expect(EVENT_STYLES.verdict).toHaveProperty('marker')
    expect(EVENT_STYLES.verdict).toHaveProperty('color')
  })
})
