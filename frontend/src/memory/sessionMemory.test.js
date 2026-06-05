// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveSessionMemory, loadLatestSession, listSessions, loadSession,
  MEMORY_INDEX_KEY, memoryKey,
} from './sessionMemory.js'

const session = {
  sessionId: 'session-1717550000000',
  startedAt: 1717550000000,
  completedAt: 1717550042000,
  config: { amountUsdc: 100, risk: 'med', vaultCount: 2 },
  steps: [
    { agentId: 'worker-1', vaultName: 'Aave USDC', status: 'confirmed', gasUsed: 0, shares: '60000000' },
    { agentId: 'worker-2', vaultName: 'Morpho USDC', status: 'confirmed', gasUsed: 0, shares: '40000000' },
  ],
  council: [
    { role: 'riskAuditor', decision: 'EXECUTE', confidence: 0.82, keyReason: 'audited, stable TVL' },
  ],
  timelines: { bull: 4.1, base: 2.3, bear: -0.4, expectedValue: 2.1 },
  lessons: ['Aave accepted 0.5% slippage reliably'],
}

beforeEach(() => {
  localStorage.clear()
})

describe('persistence (localStorage JSON)', () => {
  it('saves the session as JSON under a per-session key and indexes it', () => {
    const { key, session: saved } = saveSessionMemory(session)
    expect(key).toBe(memoryKey(session.sessionId))
    expect(JSON.parse(localStorage.getItem(key))).toEqual(saved)
    expect(saved).toEqual(session)
    expect(JSON.parse(localStorage.getItem(MEMORY_INDEX_KEY))).toContainEqual(
      expect.objectContaining({ sessionId: session.sessionId })
    )
  })

  it('loadSession round-trips the stored object', () => {
    saveSessionMemory(session)
    expect(loadSession(session.sessionId)).toEqual(session)
  })

  it('loadLatestSession returns the most recently started session object', () => {
    saveSessionMemory({ ...session, sessionId: 'session-1', startedAt: 1 })
    saveSessionMemory({ ...session, sessionId: 'session-2', startedAt: 2 })
    const latest = loadLatestSession()
    expect(latest.sessionId).toBe('session-2')
    expect(latest.steps).toHaveLength(2)
  })

  it('listSessions returns index entries newest-first', () => {
    saveSessionMemory({ ...session, sessionId: 'a', startedAt: 1 })
    saveSessionMemory({ ...session, sessionId: 'b', startedAt: 5 })
    expect(listSessions().map((s) => s.sessionId)).toEqual(['b', 'a'])
  })

  it('loadLatestSession returns null when empty', () => {
    expect(loadLatestSession()).toBeNull()
  })
})
