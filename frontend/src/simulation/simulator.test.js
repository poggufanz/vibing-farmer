import { describe, it, expect } from 'vitest'
import { calculateMarketTrend } from './simulator.js'

describe('calculateMarketTrend', () => {
  it('returns sideways for an empty / missing pool list', () => {
    expect(calculateMarketTrend([])).toBe('sideways')
    expect(calculateMarketTrend(undefined)).toBe('sideways')
  })

  it('returns uptrend when average 24h TVL delta is above +3%', () => {
    const pools = [{ tvlDelta24h: 0.05 }, { tvlDelta24h: 0.04 }]
    expect(calculateMarketTrend(pools)).toBe('uptrend')
  })

  it('returns downtrend when average 24h TVL delta is below -3%', () => {
    const pools = [{ tvlDelta24h: -0.05 }, { tvlDelta24h: -0.04 }]
    expect(calculateMarketTrend(pools)).toBe('downtrend')
  })

  it('returns sideways inside the +/-3% band', () => {
    const pools = [{ tvlDelta24h: 0.01 }, { tvlDelta24h: -0.01 }]
    expect(calculateMarketTrend(pools)).toBe('sideways')
  })
})

import { assignScenarioProbabilities } from './simulator.js'

describe('assignScenarioProbabilities', () => {
  const neutral = { turbulenceIndex: 0.1, newsSentiment: 'neutral', marketTrend: 'sideways' }

  it('returns weights that sum to 1', () => {
    const w = assignScenarioProbabilities(neutral)
    expect(w.bull + w.base + w.bear).toBeCloseTo(1, 10)
  })

  it('is roughly balanced when no signal tilts it', () => {
    const w = assignScenarioProbabilities(neutral)
    expect(w.bull).toBeCloseTo(0.33, 2)
    expect(w.bear).toBeCloseTo(0.33, 2)
  })

  it('shifts weight toward bear under high turbulence', () => {
    const w = assignScenarioProbabilities({ ...neutral, turbulenceIndex: 0.8 })
    expect(w.bear).toBeGreaterThan(w.bull)
  })

  it('shifts weight toward bull on positive sentiment + uptrend', () => {
    const w = assignScenarioProbabilities({ turbulenceIndex: 0.1, newsSentiment: 'positive', marketTrend: 'uptrend' })
    expect(w.bull).toBeGreaterThan(w.bear)
  })
})

import { computeExpectedValue } from './simulator.js'

describe('computeExpectedValue', () => {
  const weights = { bull: 0.3, base: 0.4, bear: 0.3 }

  it('weights each scenario yield by its probability', () => {
    const ev = computeExpectedValue(
      { projectedNetYieldUSD: 100 },
      { projectedNetYieldUSD: 50 },
      { projectedNetYieldUSD: -20 },
      weights,
    )
    // 100*0.3 + 50*0.4 + (-20)*0.3 = 30 + 20 - 6 = 44
    expect(ev).toBeCloseTo(44, 10)
  })

  it('treats a missing projectedNetYieldUSD as 0', () => {
    const ev = computeExpectedValue({}, { projectedNetYieldUSD: 50 }, {}, weights)
    // 0*0.3 + 50*0.4 + 0*0.3 = 20
    expect(ev).toBeCloseTo(20, 10)
  })
})

import { buildSimulationContext } from './simulator.js'

describe('buildSimulationContext', () => {
  const candidates = [
    { id: 'p1', protocol: 'aave-v3', apy: 8, tvlUsd: 100_000_000, tvlDelta24h: 0.02, ilRisk: 'low', audited: true },
  ]
  const state = {
    positions: [{ amountUSD: 1000 }, { amountUSD: 500 }],
    gasPrice: 12,
    ethPriceUSD: 2000,
    turbulenceIndex: 0.2,
    marketVolatility: 0.3,
    pools: [{ tvlDelta24h: 0.05 }],
  }

  it('sums portfolio value from positions', async () => {
    const ctx = await buildSimulationContext(candidates, state, async () => 'neutral')
    expect(ctx.portfolioValueUSD).toBe(1500)
  })

  it('maps candidate tvlUsd (not tvl) and a 3-day trend estimate', async () => {
    const ctx = await buildSimulationContext(candidates, state, async () => 'neutral')
    expect(ctx.candidates[0].tvlUsd).toBe(100_000_000)
    expect(ctx.candidates[0].tvlTrend3d).toBeCloseTo(0.06, 10)
  })

  it('pulls sentiment from the injected getSentiment and derives market trend', async () => {
    const ctx = await buildSimulationContext(candidates, state, async () => 'positive')
    expect(ctx.newsSentiment).toBe('positive')
    expect(ctx.marketTrend).toBe('uptrend') // pools avg delta 0.05 > 0.03
  })

  it('caps candidates at 5', async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, protocol: `x${i}`, apy: 5, tvlUsd: 1e7 }))
    const ctx = await buildSimulationContext(many, state, async () => 'neutral')
    expect(ctx.candidates).toHaveLength(5)
  })
})

import { simulateScenario } from './simulator.js'

describe('simulateScenario', () => {
  const ctx = {
    portfolioValueUSD: 1500,
    gasPrice: 12,
    ethPrice: 2000,
    turbulenceIndex: 0.2,
    newsSentiment: 'neutral',
    marketTrend: 'sideways',
    candidates: [{ protocol: 'aave-v3', apy: 8, tvlUsd: 1e8, ilRisk: 'low', audited: true }],
  }

  it('parses the AI JSON and tags the scenario name', async () => {
    const aiComplete = async () => JSON.stringify({
      recommendedPool: 'aave-v3', projectedNetYieldUSD: 42.5, confidence: 0.7, keyRisk: 'none',
    })
    const result = await simulateScenario('bull', ctx, aiComplete)
    expect(result.scenario).toBe('bull')
    expect(result.recommendedPool).toBe('aave-v3')
    expect(result.projectedNetYieldUSD).toBe(42.5)
  })

  it('passes systemPrompt + userPrompt to aiComplete with scenario + candidates', async () => {
    let seen
    const aiComplete = async (p) => { seen = p; return '{"projectedNetYieldUSD":0}' }
    await simulateScenario('bear', ctx, aiComplete)
    expect(seen.systemPrompt).toContain('JSON')
    expect(seen.userPrompt).toContain('BEAR')
    expect(seen.userPrompt).toContain('aave-v3')
  })

  it('falls back to a zero-yield verdict when the AI call throws', async () => {
    const aiComplete = async () => { throw new Error('network down') }
    const result = await simulateScenario('base', ctx, aiComplete)
    expect(result.projectedNetYieldUSD).toBe(0)
    expect(result.confidence).toBe(0)
    expect(result.keyRisk).toContain('network down')
  })

  it('falls back when the AI returns invalid JSON', async () => {
    const aiComplete = async () => 'not json at all'
    const result = await simulateScenario('base', ctx, aiComplete)
    expect(result.projectedNetYieldUSD).toBe(0)
  })
})

import { runSimulation } from './simulator.js'

describe('runSimulation', () => {
  const candidates = [
    { id: 'p1', protocol: 'aave-v3', apy: 8, tvlUsd: 1e8, tvlDelta24h: 0.01, ilRisk: 'low', audited: true },
  ]
  const state = {
    positions: [{ amountUSD: 1000 }],
    gasPrice: 12,
    ethPriceUSD: 2000,
    turbulenceIndex: 0.1,
    marketVolatility: 0.2,
    pools: [{ tvlDelta24h: 0.0 }],
  }

  // Fake AI: yields keyed by scenario so we can assert the weighting math.
  const yields = { bull: 90, base: 30, bear: -30 }
  const aiComplete = async ({ userPrompt }) => {
    const scenario = userPrompt.includes('BULL') ? 'bull' : userPrompt.includes('BEAR') ? 'bear' : 'base'
    return JSON.stringify({ recommendedPool: 'aave-v3', projectedNetYieldUSD: yields[scenario], confidence: 0.6 })
  }
  const deps = { aiComplete, getSentiment: async () => 'neutral', logger: { log() {} } }

  it('returns bull/base/bear verdicts, weights, context, and expectedValue', async () => {
    const sim = await runSimulation(candidates, state, deps)
    expect(sim.bull.projectedNetYieldUSD).toBe(90)
    expect(sim.base.projectedNetYieldUSD).toBe(30)
    expect(sim.bear.projectedNetYieldUSD).toBe(-30)
    expect(sim.weights.bull + sim.weights.base + sim.weights.bear).toBeCloseTo(1, 10)
    expect(sim.context).toBeDefined()
  })

  it('expectedValue equals the probability-weighted scenario yields', async () => {
    const sim = await runSimulation(candidates, state, deps)
    const expected =
      90 * sim.weights.bull + 30 * sim.weights.base + -30 * sim.weights.bear
    expect(sim.expectedValue).toBeCloseTo(expected, 10)
  })

  it('exposes base.recommendedPool for the downstream council/executor', async () => {
    const sim = await runSimulation(candidates, state, deps)
    expect(sim.base.recommendedPool).toBe('aave-v3')
  })
})
