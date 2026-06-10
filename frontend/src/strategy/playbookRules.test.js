// frontend/src/strategy/playbookRules.test.js
import { describe, it, expect } from 'vitest'
import { ROLE_RULES, rulesForRole, ruleIdsForRole, allRuleIds, isValidRuleForRole } from './playbookRules.js'

describe('playbookRules catalog', () => {
  it('defines exactly the three council roles', () => {
    expect(Object.keys(ROLE_RULES).sort()).toEqual(['market', 'risk', 'yield'])
  })

  it('every rule has a non-empty id and description', () => {
    for (const role of Object.keys(ROLE_RULES)) {
      for (const r of ROLE_RULES[role]) {
        expect(typeof r.id).toBe('string')
        expect(r.id.length).toBeGreaterThan(0)
        expect(r.description.length).toBeGreaterThan(10)
      }
    }
  })

  it('rule ids are globally unique across roles', () => {
    const ids = allRuleIds()
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('rulesForRole returns the role array, ruleIdsForRole returns just ids', () => {
    expect(rulesForRole('yield')).toBe(ROLE_RULES.yield)
    expect(ruleIdsForRole('risk')).toEqual(ROLE_RULES.risk.map((r) => r.id))
  })

  it('unknown role yields empty results, never throws', () => {
    expect(rulesForRole('bogus')).toEqual([])
    expect(ruleIdsForRole('bogus')).toEqual([])
  })

  it('isValidRuleForRole only accepts ids belonging to that role', () => {
    const yieldId = ROLE_RULES.yield[0].id
    const riskId = ROLE_RULES.risk[0].id
    expect(isValidRuleForRole('yield', yieldId)).toBe(true)
    expect(isValidRuleForRole('yield', riskId)).toBe(false)
    expect(isValidRuleForRole('yield', 'nope')).toBe(false)
  })
})
