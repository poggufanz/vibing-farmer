// frontend/src/brain/pipelineAdapter.js
// Pure reducer: maps autonomous-loop events (frontend/src/core/loop.js) onto a
// 13-stage pipeline the dashboard renders. Single source of truth for stage state.

export const STAGE_IDS = [
  'state', 'loop', 'fetch', 'gates', 'sim', 'council',
  'verdict', 'memory', 'execution', 'eval', 'reflector', 'curator', 'bullet',
]

// Per-cycle stages (reset each cycle). Async stages (eval..bullet) persist across cycles.
const PER_CYCLE = new Set(['state', 'loop', 'fetch', 'gates', 'sim', 'council', 'verdict', 'memory', 'execution'])

export function initialPipeline() {
  return {
    cycleId: null,
    cyclesDone: 0,
    revealedCount: 0,
    stages: STAGE_IDS.map((id) => ({ id, state: 'idle', data: {} })),
  }
}

const setStage = (p, id, patch) => ({
  ...p,
  stages: p.stages.map((s) => (s.id === id ? { ...s, ...patch, data: { ...s.data, ...(patch.data || {}) } } : s)),
})

const reveal = (p, id) => {
  const idx = STAGE_IDS.indexOf(id)
  return { ...p, revealedCount: Math.max(p.revealedCount, idx + 1) }
}

export function reducePipeline(prev, event) {
  let p = prev
  switch (event.type) {
    case 'cycle:start':
      // New cycle: reset per-cycle stages, mark monitor loop running, reveal first stages.
      p = {
        ...p,
        cycleId: event.cycleId,
        stages: p.stages.map((s) => (PER_CYCLE.has(s.id) ? { ...s, state: 'idle', data: {} } : s)),
      }
      p = setStage(p, 'state', { state: 'running' })
      p = setStage(p, 'loop', { state: 'running', data: { n: event.n, at: event.at } })
      p = setStage(p, 'fetch', { state: 'running' })
      return reveal(reveal(reveal(p, 'state'), 'loop'), 'fetch')

    case 'fetch':
      p = setStage(p, 'fetch', { state: 'done', data: { sources: event.sources ?? null, ms: event.ms ?? null } })
      return reveal(p, 'fetch')

    case 'state':
      p = setStage(p, 'state', { state: 'done', data: { portfolioApy: event.portfolioApy, positionsUsd: event.positionsUsd } })
      p = setStage(p, 'gates', { state: 'running' })
      return reveal(reveal(p, 'state'), 'gates')

    case 'gate':
      if (!event.pass) {
        return reveal(setStage(p, 'gates', { state: 'fail', data: { pass: false, reason: event.reason } }), 'gates')
      }
      p = setStage(p, 'gates', { state: 'done', data: { pass: true } })
      p = setStage(p, 'sim', { state: 'running' })
      return reveal(reveal(p, 'gates'), 'sim')

    case 'sim':
      p = setStage(p, 'sim', { state: 'done', data: { ...event.timelines } })
      p = setStage(p, 'council', { state: 'running' })
      return reveal(reveal(p, 'sim'), 'council')

    case 'council':
      p = setStage(p, 'council', { state: 'done', data: { verdicts: event.verdicts ?? [] } })
      p = setStage(p, 'verdict', { state: 'done', data: { consensus: event.consensus ?? {} } })
      p = setStage(p, 'memory', { state: 'done', data: {} }) // playbook was consulted to produce verdicts
      return reveal(reveal(reveal(p, 'council'), 'verdict'), 'memory')

    case 'playbook':
      p = setStage(p, 'memory', { state: 'done', data: { rules: event.rules ?? null } })
      return reveal(p, 'memory')

    case 'execute':
      p = setStage(p, 'execution', {
        state: event.outcome === 'error' ? 'fail' : 'done',
        data: { outcome: event.outcome, txHash: event.txHash },
      })
      return reveal(p, 'execution')

    case 'cycle:end':
      return { ...p, cyclesDone: p.cyclesDone + 1 }

    default:
      return p
  }
}
