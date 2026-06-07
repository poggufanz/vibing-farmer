// Autonomous decision loop — orchestrates loadConfig + loadPlaybook -> fetchState ->
// gates -> simulate -> council -> consensus -> execute. Pure orchestration: every stage
// is INJECTED via deps.stages (testable with fakes). Optionally emits LoopEvents via
// deps.onEvent and checks deps.evaluateGoal each cycle, graceful-stopping when met.

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000 // real cadence; demo profile overrides this

export function createAutonomousLoop(deps) {
  const {
    stages,
    intervalMs = DEFAULT_INTERVAL_MS,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = () => Date.now(),
    logger = console,
    onEvent = () => {},
    evaluateGoal = null, // (state, cyclesDone) => { met, progressPct, axes } | null
    shouldRatify = () => false,            // (moveUsd) => boolean
    awaitRatify = null,                    // (payload) => Promise<'EXECUTE'|'HOLD'>
    ratifyDeadlineMs = 15_000,
  } = deps

  let running = false
  let cyclesDone = 0
  const emit = (event) => { try { onEvent(event) } catch (err) { logger.warn?.(`[loop] onEvent threw: ${err.message}`) } }

  async function runOneCycle() {
    const cycleId = `cycle-${now()}`
    emit({ type: 'cycle:start', cycleId, n: cyclesDone + 1, at: now() })

    const config = await stages.loadConfig()
    const playbook = await stages.loadPlaybook()
    emit({ type: 'playbook', cycleId, rules: Array.isArray(playbook?.rules) ? playbook.rules.length : (playbook?.length ?? null) })

    const fetchStart = now()
    const state = await stages.fetchState(config)
    emit({ type: 'fetch', cycleId, ms: now() - fetchStart, sources: state?.sources ?? null })
    emit({ type: 'state', cycleId, portfolioApy: state?.portfolioApy ?? null, positionsUsd: state?.positionsUsd ?? null })

    const gate = stages.runGates(state, config)
    emit({ type: 'gate', cycleId, pass: gate.pass, reason: gate.pass ? null : gate.reason })
    if (!gate.pass) {
      logger.log?.(`[${cycleId}] gate blocked: ${gate.reason}`)
      return finishCycle(cycleId, { cycleId, outcome: 'gate_blocked', reason: gate.reason }, state)
    }

    const sim = await stages.runSimulation(gate.candidates, state)
    emit({ type: 'sim', cycleId, timelines: {
      bull: sim.bull?.projectedNetYieldUSD ?? 0, base: sim.base?.projectedNetYieldUSD ?? 0,
      bear: sim.bear?.projectedNetYieldUSD ?? 0, weights: sim.weights, expectedValue: sim.expectedValue,
    } })
    if (sim.expectedValue < config.minExpectedValueUSD) {
      logger.log?.(`[${cycleId}] sim rejected: E[value]=$${sim.expectedValue}`)
      return finishCycle(cycleId, { cycleId, outcome: 'sim_rejected', expectedValue: sim.expectedValue }, state)
    }

    const verdicts = await stages.runCouncil(sim, state, config, playbook)
    const consensus = stages.evaluateConsensus(verdicts)
    emit({ type: 'council', cycleId,
      verdicts: (verdicts ?? []).map((v) => ({ role: v.role, decision: v.decision, confidence: v.confidence, keyReason: v.keyReason, citedRules: v.citedRules ?? [] })),
      consensus: { finalDecision: consensus.finalDecision, executeVotes: consensus.executeVotes, total: (consensus.executeVotes ?? 0) + (consensus.holdVotes ?? 0) },
    })

    // Ratify gate — in-app approval for high-value moves (no wallet popup). Timeout/HOLD => skip.
    const moveUsd = state?.positionsUsd ?? 0
    if (consensus.finalDecision === 'EXECUTE' && awaitRatify && shouldRatify(moveUsd)) {
      emit({ type: 'ratify:request', cycleId, decision: 'EXECUTE', moveUsd, deadlineMs: ratifyDeadlineMs })
      const verdict = await awaitRatify({ cycleId, decision: 'EXECUTE', moveUsd, deadlineMs: ratifyDeadlineMs })
      const approved = verdict === 'EXECUTE'
      emit({ type: 'ratify:resolved', cycleId, approved })
      if (!approved) {
        emit({ type: 'execute', cycleId, outcome: 'held_unratified', txHash: null })
        return finishCycle(cycleId, { cycleId, outcome: 'held_unratified', consensus }, state)
      }
    }

    const txResult = await stages.executeRebalance(consensus, sim, state, config)
    const outcome = consensus.finalDecision === 'EXECUTE' ? 'executed' : 'held'
    emit({ type: 'execute', cycleId, outcome, txHash: txResult?.txHash ?? null })

    return finishCycle(cycleId, { cycleId, outcome, consensus }, state)
  }

  // Close out a cycle: tick the counter, score the goal (always emit a goal event so the
  // dashboard can render progress order; met-logic only when an evaluator is injected),
  // then emit cycle:end. Graceful stop = clear `running`; the current cycle still finishes.
  function finishCycle(cycleId, result, state) {
    cyclesDone += 1
    let goalProgress = null
    if (evaluateGoal) goalProgress = evaluateGoal(state, cyclesDone)
    emit({
      type: 'goal', cycleId,
      progressPct: goalProgress?.progressPct ?? null,
      met: goalProgress?.met ?? false,
      axes: goalProgress?.axes ?? null,
    })
    if (goalProgress?.met) running = false // graceful: current cycle finishes, while loop exits
    emit({ type: 'cycle:end', cycleId, outcome: result.outcome })
    return result
  }

  async function runOneCycleSafe() {
    try { return await runOneCycle() }
    catch (err) { logger.error?.(`Cycle error: ${err.message}`); return { outcome: 'error', error: err.message } }
  }

  async function start() {
    if (running) return
    running = true
    while (running) {
      await runOneCycleSafe()
      if (!running) break
      await sleep(intervalMs)
    }
    emit({ type: 'stopped', reason: evaluateGoal ? 'goal_met' : 'manual' })
  }

  function stop() { running = false }

  return {
    start, stop, runOneCycle, runOneCycleSafe,
    get running() { return running },
    get cyclesDone() { return cyclesDone },
  }
}
