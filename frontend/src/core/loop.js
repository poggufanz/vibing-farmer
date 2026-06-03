// Autonomous decision loop (Step 2) — orchestrates the FinRL-style pipeline:
//   loadConfig + loadPlaybook -> fetchState -> gates -> simulate -> council -> consensus -> execute
//
// Pure orchestration only. Every pipeline stage is INJECTED via `deps.stages` so the loop is
// testable with fakes (no network, no AI, no timers) — mirroring state.js's injectable `now`.
// Real stage wiring lands in Steps 3-12; this file imports none of them.

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes between decision cycles

/**
 * @param {object} deps
 * @param {object} deps.stages    pipeline stage fns (see plan "Stage contract")
 * @param {number} [deps.intervalMs]
 * @param {(ms:number)=>Promise<void>} [deps.sleep]  injectable for tests
 * @param {()=>number} [deps.now]                     injectable clock
 * @param {{error?:Function,log?:Function}} [deps.logger]
 */
export function createAutonomousLoop(deps) {
  const {
    stages,
    intervalMs = DEFAULT_INTERVAL_MS,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = () => Date.now(),
    logger = console,
  } = deps

  async function runOneCycle() {
    const cycleId = `cycle-${now()}`

    const config = await stages.loadConfig()
    const playbook = await stages.loadPlaybook()
    const state = await stages.fetchState(config)

    const gate = stages.runGates(state, config)
    if (!gate.pass) {
      logger.log?.(`[${cycleId}] gate blocked: ${gate.reason}`)
      return { cycleId, outcome: 'gate_blocked', reason: gate.reason }
    }

    const sim = await stages.runSimulation(gate.candidates, state)
    if (sim.expectedValue < config.minExpectedValueUSD) {
      logger.log?.(`[${cycleId}] sim rejected: E[value]=$${sim.expectedValue}`)
      return { cycleId, outcome: 'sim_rejected', expectedValue: sim.expectedValue }
    }

    const verdicts = await stages.runCouncil(sim, state, config, playbook)
    const consensus = stages.evaluateConsensus(verdicts)
    await stages.executeRebalance(consensus, sim, state, config)

    return {
      cycleId,
      outcome: consensus.finalDecision === 'EXECUTE' ? 'executed' : 'held',
      consensus,
    }
  }

  async function runOneCycleSafe() {
    try {
      return await runOneCycle()
    } catch (err) {
      // Crash recovery — log but never let one bad cycle kill the loop.
      logger.error?.(`Cycle error: ${err.message}`)
      return { outcome: 'error', error: err.message }
    }
  }

  return { runOneCycle, runOneCycleSafe }
}
