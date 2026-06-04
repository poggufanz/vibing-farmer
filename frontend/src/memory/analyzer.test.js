import { describe, it, expect } from 'vitest'
import { groupByCategory } from './analyzer.js'

describe('groupByCategory', () => {
  it('buckets rules by their category field', () => {
    const rules = [
      { id: 'defi-001', category: 'risk', text: 'a' },
      { id: 'defi-002', category: 'gas', text: 'b' },
      { id: 'defi-003', category: 'risk', text: 'c' },
    ]
    const grouped = groupByCategory(rules)
    expect(Object.keys(grouped).sort()).toEqual(['gas', 'risk'])
    expect(grouped.risk.map(r => r.id)).toEqual(['defi-001', 'defi-003'])
    expect(grouped.gas.map(r => r.id)).toEqual(['defi-002'])
  })

  it('returns an empty object for an empty / nullish playbook', () => {
    expect(groupByCategory([])).toEqual({})
    expect(groupByCategory(null)).toEqual({})
  })
})
