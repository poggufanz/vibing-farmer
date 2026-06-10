// frontend/src/strategy/fetchDag.test.js
import { describe, it, expect } from 'vitest'
import { runFetchDag } from './fetchDag.js'

const tick = (ms) => new Promise((r) => setTimeout(r, ms))

describe('runFetchDag', () => {
  it('runs independent nodes in one concurrent layer (all start before any ends)', async () => {
    const events = []
    const mk = (id) => ({
      id, deps: [],
      run: async () => { events.push(`start:${id}`); await tick(10); events.push(`end:${id}`); return id },
    })
    const { results } = await runFetchDag([mk('a'), mk('b'), mk('c')])
    expect(results).toEqual({ a: 'a', b: 'b', c: 'c' })
    // Concurrency proof: the three starts all precede the first end.
    const firstEnd = events.findIndex((e) => e.startsWith('end:'))
    const startsBeforeFirstEnd = events.slice(0, firstEnd).filter((e) => e.startsWith('start:'))
    expect(startsBeforeFirstEnd).toHaveLength(3)
  })

  it('isolates a failing node as null without aborting siblings', async () => {
    const nodes = [
      { id: 'ok', deps: [], run: async () => 'value' },
      { id: 'bad', deps: [], run: async () => { throw new Error('boom') } },
    ]
    const { results } = await runFetchDag(nodes)
    expect(results.ok).toBe('value')
    expect(results.bad).toBeNull()
  })

  it('runs a dependent node only after its dep resolves, passing the dep value', async () => {
    const order = []
    const nodes = [
      { id: 'market', deps: [], run: async () => { order.push('market'); return 'ctx' } },
      { id: 'signals', deps: ['market'], run: async (ctx) => { order.push('signals'); return `sig:${ctx.market}` } },
    ]
    const { results } = await runFetchDag(nodes)
    expect(order).toEqual(['market', 'signals'])
    expect(results.signals).toBe('sig:ctx')
  })

  it('reports timings and a wall time no larger than the slowest layer plus slack', async () => {
    const nodes = [
      { id: 'fast', deps: [], run: async () => { await tick(10); return 1 } },
      { id: 'slow', deps: [], run: async () => { await tick(40); return 2 } },
    ]
    const { timings, wallMs } = await runFetchDag(nodes)
    expect(timings.slow).toBeGreaterThanOrEqual(timings.fast)
    // Parallel: wall ~= slowest (40ms), far below the 50ms sequential sum.
    expect(wallMs).toBeLessThan(timings.fast + timings.slow)
  })

  it('fails unsatisfiable nodes as null instead of hanging', async () => {
    const nodes = [{ id: 'orphan', deps: ['missing'], run: async () => 'never' }]
    const { results } = await runFetchDag(nodes)
    expect(results.orphan).toBeNull()
  })
})
