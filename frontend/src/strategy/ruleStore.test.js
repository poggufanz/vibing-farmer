import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getRules, addRule, upsertSeeds, retireRule, deleteRule, replaceAll, clearPlaybook,
} from './ruleStore.js'

function stubStorage() {
  const store = {}
  vi.stubGlobal('localStorage', {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: (k) => { delete store[k] },
  })
}

describe('ruleStore — records & CRUD', () => {
  beforeEach(stubStorage)

  it('upsertSeeds is idempotent and stamps createdAt', () => {
    upsertSeeds()
    const n = getRules().length
    expect(n).toBeGreaterThan(0)
    upsertSeeds()
    expect(getRules().length).toBe(n)
    expect(getRules()[0].createdAt).toEqual(expect.any(Number))
  })

  it('getRules filters by role and status', () => {
    upsertSeeds()
    const yield_ = getRules({ role: 'yield' })
    expect(yield_.length).toBeGreaterThan(0)
    expect(yield_.every((r) => r.role === 'yield')).toBe(true)
    expect(getRules({ status: 'active' }).every((r) => r.status === 'active')).toBe(true)
  })

  it('addRule appends a grown rule with zeroed counters', () => {
    addRule({ id: 'grown-1', role: 'market', category: 'gas', text: 'Avoid deposits during gas spikes above 80 gwei.', origin: 'grown' })
    const r = getRules().find((x) => x.id === 'grown-1')
    expect(r).toMatchObject({ id: 'grown-1', origin: 'grown', status: 'active', helpful: 0, harmful: 0, evals: 0 })
    expect(r.createdAt).toEqual(expect.any(Number))
  })

  it('addRule ignores a duplicate id', () => {
    addRule({ id: 'dup', role: 'yield', text: 'a' })
    addRule({ id: 'dup', role: 'yield', text: 'b' })
    expect(getRules().filter((r) => r.id === 'dup').length).toBe(1)
  })

  it('retireRule sets status retired; deleteRule removes', () => {
    addRule({ id: 'g', role: 'risk', text: 'x', origin: 'grown' })
    retireRule('g')
    expect(getRules().find((r) => r.id === 'g').status).toBe('retired')
    deleteRule('g')
    expect(getRules().find((r) => r.id === 'g')).toBeUndefined()
  })

  it('replaceAll overwrites the collection atomically', () => {
    upsertSeeds()
    replaceAll([{ id: 'only', role: 'yield', category: 'strategy', text: 't', helpful: 0, harmful: 0, evals: 0, status: 'active', origin: 'grown', createdAt: 1 }])
    expect(getRules().length).toBe(1)
    expect(getRules()[0].id).toBe('only')
  })

  it('clearPlaybook empties the store', () => {
    upsertSeeds()
    clearPlaybook()
    expect(getRules()).toEqual([])
  })

  it('never throws on corrupt storage', () => {
    localStorage.setItem('yv_playbook_v2', 'not json')
    expect(getRules()).toEqual([])
    expect(() => addRule({ id: 'z', role: 'yield', text: 't' })).not.toThrow()
  })
})
