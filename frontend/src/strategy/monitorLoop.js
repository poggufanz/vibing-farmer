// frontend/src/strategy/monitorLoop.js
// The NEVER-STOP cycle spine (autoresearch / Karpathy). Unbounded loop:
// fetch state → gate → simulate → council → execute on keep → reflect → journal
// → sleep → repeat. Cardinal rule: a single error NEVER stops the loop — every
// cycle is wrapped so a throw becomes a journaled `crash` and the next cycle runs.
// All collaborators injected → pure orchestration, no React/network here.

/**
 * @param {Object} deps
 * @param {() => Promise<Object>} deps.getState                                        // mdp StrategyState
 * @param {(proposed:Array, state:Object) => {allocations:Array, violations:string[]}} deps.runGates
 * @param {(allocations:Array, state:Object) => Object} deps.simulate                   // mdp.scoreReward
 * @param {(input:Object) => Promise<Object>} deps.council                              // councilVerdict (async)
 * @param {(idea:Object, allocations:Array) => Promise<string>} deps.execute            // → txHash
 * @param {(cycle:Object) => void} deps.reflect                                         // ACE reflector
 * @param {{saveCycle:(row:Object)=>void}} deps.journal
 * @param {number} [deps.heartbeatMs]
 */
export function createMonitorLoop({ getState, runGates, simulate, council, execute, reflect, journal, heartbeatMs = 60_000 }) {
  let timer = null
  let cycle = 0
  let running = false

  async function runCycle(idea) {
    cycle += 1
    try {
      const state = await getState()

      if (!idea) {
        journal.saveCycle({ cycle, phase: 'observe', verdict: 'idle', turbulence: state.market.turbulence })
        return
      }

      const { allocations, violations } = runGates(idea.proposed, state)
      const projectedReward = simulate(allocations, state)
      const currentReward = simulate(idea.currentAllocations || [], state)
      const v = await council({
        action: { kind: idea.kind, violations, apyGain: idea.apyGain },
        currentReward, projectedReward, state, estGasUsdc: idea.estGasUsdc,
      })

      if (v.verdict !== 'keep') {
        journal.saveCycle({ cycle, phase: 'evaluate', verdict: 'discard', score: projectedReward.riskAdjustedScore, confidence: v.confidence, reason: v.reason, citedRules: v.citedRules, turbulence: state.market.turbulence })
        return
      }

      // keep → execute, then reflect on the real outcome (ACE).
      try {
        const txHash = await execute(idea, allocations)
        reflect({ verdict: 'keep', citedRules: v.citedRules, outcome: 'success' })
        journal.saveCycle({ cycle, phase: 'execute', verdict: 'keep', score: projectedReward.riskAdjustedScore, confidence: v.confidence, citedRules: v.citedRules, txHash, turbulence: state.market.turbulence })
      } catch (execErr) {
        reflect({ verdict: 'keep', citedRules: v.citedRules, outcome: 'failure' })
        journal.saveCycle({ cycle, phase: 'crash', verdict: 'crash', error: execErr?.message || String(execErr), citedRules: v.citedRules })
      }
    } catch (err) {
      // Crash recovery — autoresearch logs the crash and moves on. The loop lives.
      journal.saveCycle({ cycle, phase: 'crash', verdict: 'crash', error: err?.message || String(err) })
    }
  }

  return {
    start() {
      if (running) return
      running = true
      runCycle(null)
      timer = setInterval(() => runCycle(null), heartbeatMs)
    },
    stop() {
      running = false
      if (timer) { clearInterval(timer); timer = null }
    },
    submitIdea(idea) { return runCycle(idea) },
    getCycle() { return cycle },
    isRunning() { return running },
  }
}