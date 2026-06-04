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

import { buildCouncilContext } from './council.js'

describe('buildCouncilContext', () => {
  const sim = {
    base: { recommendedPool: 'aave-v3', projectedNetYieldUSD: 70 }, // $10/day
    bull: { projectedNetYieldUSD: 120 },
    bear: { projectedNetYieldUSD: -20 },
    weights: { bull: 0.3, base: 0.4, bear: 0.3 },
    expectedValue: 44,
  }
  const state = {
    positions: [{ protocol: 'compound-v3', amountUSD: 1000, currentAPY: 5 }],
    pools: [
      { id: 'pool-x', protocol: 'aave-v3', apy: 9, tvlUsd: 2e8, ilRisk: 'low', audited: true },
    ],
    gasPrice: 12,         // gwei
    ethPriceUSD: 2000,
    turbulenceIndex: 0.2,
  }
  const config = {
    riskTolerance: 'moderate',
    whitelist: ['aave-v3', 'compound-v3'],
    thresholds: { MAX_GAS_USD: 25 },
  }

  it('resolves the proposed pool from sim.base.recommendedPool by PROTOCOL', () => {
    const ctx = buildCouncilContext(sim, state, config)
    expect(ctx.proposedPool).toBe('aave-v3')
    expect(ctx.proposedPoolAPY).toBe(9)         // matched on pool.protocol, not id
    expect(ctx.poolDetails.id).toBe('pool-x')
  })

  it('computes gas cost in USD from gasPrice * 300k units * ethPrice', () => {
    const ctx = buildCouncilContext(sim, state, config)
    // 12 gwei * 300000 * 2000 / 1e9 = $7.20
    expect(ctx.estimatedGasCostUSD).toBeCloseTo(7.2, 5)
  })

  it('computes breakeven days = gasUSD / dailyYieldDelta', () => {
    const ctx = buildCouncilContext(sim, state, config)
    // dailyYield = 70/7 = 10; breakeven = 7.2 / 10 = 0.72
    expect(ctx.breakevenDays).toBeCloseTo(0.72, 5)
  })

  it('uses sentinel 999 breakeven when the daily yield delta is not positive', () => {
    const flat = { ...sim, base: { recommendedPool: 'aave-v3', projectedNetYieldUSD: 0 } }
    const ctx = buildCouncilContext(flat, state, config)
    expect(ctx.breakevenDays).toBe(999)
  })

  it('carries the current weighted portfolio APY and the three sim scenarios', () => {
    const ctx = buildCouncilContext(sim, state, config)
    expect(ctx.currentAPY).toBeCloseTo(5, 5)     // single position @ 5%
    expect(ctx.expectedValue7d).toBe(44)
    expect(ctx.simulationScenarios.bull.yield).toBe(120)
    expect(ctx.simulationScenarios.bear.probability).toBe(0.3)
  })

  it('exposes only the strategy subset the specialists need', () => {
    const ctx = buildCouncilContext(sim, state, config)
    expect(ctx.strategyConfig).toEqual({
      riskTolerance: 'moderate',
      whitelist: ['aave-v3', 'compound-v3'],
      maxGasUSD: 25,
    })
  })

  it('defaults pool details to an empty object when no pool matches', () => {
    const orphan = { ...sim, base: { recommendedPool: 'nonexistent', projectedNetYieldUSD: 70 } }
    const ctx = buildCouncilContext(orphan, state, config)
    expect(ctx.poolDetails).toEqual({})
    expect(ctx.proposedPoolAPY).toBe(0)
  })
})

import { consultSpecialist, SPECIALIST_PROMPTS } from './council.js'

describe('consultSpecialist', () => {
  const context = { proposedPool: 'aave-v3', breakevenDays: 5, estimatedGasCostUSD: 7.2 }
  const rules = [{ id: 'defi-002', category: 'gas', helpful: 4, harmful: 0, text: 'Breakeven < 30 days.' }]

  it('exposes a distinct system prompt for each of the three roles', () => {
    expect(SPECIALIST_PROMPTS.riskAuditor).toContain('Risk Auditor')
    expect(SPECIALIST_PROMPTS.gasChecker).toContain('Gas')
    expect(SPECIALIST_PROMPTS.strategyGuard).toContain('Strategy')
    // genuinely different prompts, not the same text three times
    expect(SPECIALIST_PROMPTS.riskAuditor).not.toBe(SPECIALIST_PROMPTS.gasChecker)
  })

  it('parses the AI JSON verdict and tags it with the role', async () => {
    const aiComplete = async () => JSON.stringify({
      decision: 'EXECUTE', confidence: 0.8, keyReason: 'cheap and safe',
      citedRules: ['defi-002'], newInsight: null,
    })
    const v = await consultSpecialist('gasChecker', context, rules, aiComplete)
    expect(v.role).toBe('gasChecker')
    expect(v.decision).toBe('EXECUTE')
    expect(v.confidence).toBe(0.8)
    expect(v.citedRules).toEqual(['defi-002'])
  })

  it('sends the role system prompt + playbook text + context to aiComplete', async () => {
    let seen
    const aiComplete = async (p) => { seen = p; return '{"decision":"HOLD","confidence":0.5}' }
    await consultSpecialist('gasChecker', context, rules, aiComplete)
    expect(seen.systemPrompt).toBe(SPECIALIST_PROMPTS.gasChecker)
    expect(seen.userPrompt).toContain('defi-002')        // playbook rule injected
    expect(seen.userPrompt).toContain('aave-v3')         // context injected
  })

  it('falls back to a protective HOLD when the AI call throws', async () => {
    const aiComplete = async () => { throw new Error('network down') }
    const v = await consultSpecialist('riskAuditor', context, rules, aiComplete)
    expect(v.role).toBe('riskAuditor')
    expect(v.decision).toBe('HOLD')
    expect(v.confidence).toBe(0)
    expect(v.citedRules).toEqual([])
  })

  it('falls back to a protective HOLD when the AI returns invalid JSON', async () => {
    const aiComplete = async () => 'not json'
    const v = await consultSpecialist('strategyGuard', context, rules, aiComplete)
    expect(v.decision).toBe('HOLD')
    expect(v.confidence).toBe(0)
  })

  it('handles an empty playbook slice without throwing', async () => {
    const aiComplete = async () => '{"decision":"HOLD","confidence":0.4}'
    const v = await consultSpecialist('riskAuditor', context, [], aiComplete)
    expect(v.decision).toBe('HOLD')
  })
})

import { runCouncil } from './council.js'

describe('runCouncil', () => {
  const sim = {
    base: { recommendedPool: 'aave-v3', projectedNetYieldUSD: 70 },
    bull: { projectedNetYieldUSD: 120 },
    bear: { projectedNetYieldUSD: -20 },
    weights: { bull: 0.3, base: 0.4, bear: 0.3 },
    expectedValue: 44,
  }
  const state = {
    positions: [{ protocol: 'compound-v3', amountUSD: 1000, currentAPY: 5 }],
    pools: [{ id: 'pool-x', protocol: 'aave-v3', apy: 9, tvlUsd: 2e8, ilRisk: 'low', audited: true }],
    gasPrice: 12, ethPriceUSD: 2000, turbulenceIndex: 0.2,
  }
  const config = { riskTolerance: 'moderate', whitelist: ['aave-v3'], thresholds: { MAX_GAS_USD: 25 } }
  const playbook = [
    { id: 'defi-001', category: 'risk', helpful: 2, harmful: 0, text: 'risk rule' },
    { id: 'defi-002', category: 'gas',  helpful: 3, harmful: 0, text: 'gas rule' },
  ]
  const deps = { aiComplete: async () => '{"decision":"EXECUTE","confidence":0.7,"citedRules":[]}', logger: { log() {} } }

  it('returns exactly three verdicts, one per specialist role', async () => {
    const verdicts = await runCouncil(sim, state, config, playbook, deps)
    expect(verdicts).toHaveLength(3)
    expect(verdicts.map(v => v.role).sort()).toEqual(['gasChecker', 'riskAuditor', 'strategyGuard'])
  })

  it('routes each role its own playbook slice', async () => {
    const seenByRole = {}
    const aiComplete = async (p) => {
      const role = p.systemPrompt.includes('Risk Auditor') ? 'riskAuditor'
        : p.systemPrompt.includes('Gas') ? 'gasChecker' : 'strategyGuard'
      seenByRole[role] = p.userPrompt
      return '{"decision":"HOLD","confidence":0.5,"citedRules":[]}'
    }
    await runCouncil(sim, state, config, playbook, { aiComplete, logger: { log() {} } })
    expect(seenByRole.riskAuditor).toContain('defi-001')   // risk rule only
    expect(seenByRole.riskAuditor).not.toContain('defi-002')
    expect(seenByRole.gasChecker).toContain('defi-002')    // gas rule only
  })

  it('survives one specialist failing — that role degrades to HOLD, others unaffected', async () => {
    const aiComplete = async (p) => {
      if (p.systemPrompt.includes('Gas')) throw new Error('boom')
      return '{"decision":"EXECUTE","confidence":0.7,"citedRules":[]}'
    }
    const verdicts = await runCouncil(sim, state, config, playbook, { aiComplete, logger: { log() {} } })
    const gas = verdicts.find(v => v.role === 'gasChecker')
    const risk = verdicts.find(v => v.role === 'riskAuditor')
    expect(gas.decision).toBe('HOLD')
    expect(gas.confidence).toBe(0)
    expect(risk.decision).toBe('EXECUTE')
  })

  it('works with an empty playbook (Step 8 not built yet)', async () => {
    const verdicts = await runCouncil(sim, state, config, [], deps)
    expect(verdicts).toHaveLength(3)
  })
})

import { createCouncilStage } from './council.js'

describe('createCouncilStage', () => {
  const sim = {
    base: { recommendedPool: 'aave-v3', projectedNetYieldUSD: 70 },
    bull: { projectedNetYieldUSD: 120 }, bear: { projectedNetYieldUSD: -20 },
    weights: { bull: 0.3, base: 0.4, bear: 0.3 }, expectedValue: 44,
  }
  const state = {
    positions: [{ protocol: 'compound-v3', amountUSD: 1000, currentAPY: 5 }],
    pools: [{ id: 'pool-x', protocol: 'aave-v3', apy: 9, tvlUsd: 2e8 }],
    gasPrice: 12, ethPriceUSD: 2000, turbulenceIndex: 0.2,
  }
  const config = { riskTolerance: 'moderate', whitelist: ['aave-v3'], thresholds: { MAX_GAS_USD: 25 } }

  it('returns a 4-arg fn matching the loop stages.runCouncil contract', async () => {
    const aiComplete = async () => '{"decision":"EXECUTE","confidence":0.7,"citedRules":[]}'
    const stage = createCouncilStage({ aiComplete, logger: { log() {} } })

    expect(stage).toHaveLength(4) // (sim, state, config, playbook)
    const verdicts = await stage(sim, state, config, [])
    expect(verdicts).toHaveLength(3)
    expect(verdicts.every(v => ['EXECUTE', 'HOLD'].includes(v.decision))).toBe(true)
  })
})
