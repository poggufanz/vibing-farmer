import { describe, it, expect } from 'vitest'
import { formatPlaybookForCouncil, filterPlaybookByRole } from './council.js'

describe('formatPlaybookForCouncil', () => {
  it('returns a placeholder when there are no rules', () => {
    expect(formatPlaybookForCouncil([])).toBe('(no rules yet)')
    expect(formatPlaybookForCouncil(undefined)).toBe('(no rules yet)')
  })

  it('renders id, counters, and text for each rule', () => {
    const text = formatPlaybookForCouncil([
      { id: 'defi-001', category: 'risk', helpful: 3, harmful: 1, text: 'Avoid TVL drops >20%.' },
    ])
    expect(text).toContain('defi-001')
    expect(text).toContain('helpful=3')
    expect(text).toContain('harmful=1')
    expect(text).toContain('Avoid TVL drops >20%.')
  })

  it('sorts rules by net helpfulness (helpful - harmful) descending', () => {
    const text = formatPlaybookForCouncil([
      { id: 'low',  category: 'risk', helpful: 0, harmful: 5, text: 'bad rule' },
      { id: 'high', category: 'risk', helpful: 9, harmful: 0, text: 'good rule' },
    ])
    expect(text.indexOf('high')).toBeLessThan(text.indexOf('low'))
  })
})

describe('filterPlaybookByRole', () => {
  const playbook = [
    { id: 'r1', category: 'risk',     helpful: 0, harmful: 0, text: 'a' },
    { id: 'g1', category: 'gas',      helpful: 0, harmful: 0, text: 'b' },
    { id: 's1', category: 'strategy', helpful: 0, harmful: 0, text: 'c' },
    { id: 'r2', category: 'risk',     helpful: 0, harmful: 0, text: 'd' },
  ]

  it('buckets rules by category into the three specialist roles', () => {
    const byRole = filterPlaybookByRole(playbook)
    expect(byRole.riskAuditor.map(r => r.id)).toEqual(['r1', 'r2'])
    expect(byRole.gasChecker.map(r => r.id)).toEqual(['g1'])
    expect(byRole.strategyGuard.map(r => r.id)).toEqual(['s1'])
  })

  it('returns empty buckets for an empty or missing playbook', () => {
    const byRole = filterPlaybookByRole(undefined)
    expect(byRole.riskAuditor).toEqual([])
    expect(byRole.gasChecker).toEqual([])
    expect(byRole.strategyGuard).toEqual([])
  })
})
