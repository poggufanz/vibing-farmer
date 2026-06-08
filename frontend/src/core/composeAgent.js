// Step 14 — composition root. Wires steps 1–13 into one autonomous agent:
//   loadConfig + loadPlaybook -> fetchState -> gates -> simulate -> council
//   -> consensus -> execute   (the loop, every 30 min)
//   + a separate outcome evaluator scheduled every 24h (delayed 7-day ground truth).
//
// All persistence is browser localStorage (decisionLog + playbook). The reflector
// chain is reflector -> curator -> analyzer, threaded here so loss/mispredict
// outcomes evolve the playbook (ACE pattern).

import { createAutonomousLoop } from './loop.js'
import { createFetchStage } from './fetcher.js'
import { runFastFailGates } from './gates.js'
import { loadStrategyConfig } from './strategyConfig.js'
import { loadPositionsMap } from './positionsSource.js'
import { createSimulationStage } from '../simulation/simulator.js'
import { createCouncilStage } from '../council/council.js'
import { evaluateConsensus } from '../council/consensus.js'
import { createExecutionStage } from '../execution/executor.js'
import { createDecisionLog } from '../tracking/logger.js'
import { createOutcomeEvaluator } from '../tracking/outcomeTracker.js'
import { createPlaybookStore } from '../memory/playbook.js'
import { createReflector } from '../memory/reflector.js'
import { createCurator } from '../memory/curator.js'
import { createAnalyzer } from '../memory/analyzer.js'
import { VAULT_CATALOG } from '../config.js'

const OUTCOME_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * Build the loop's injected stages object from already-constructed memory stores.
 * Kept separate so it is unit-testable without timers/network.
 */
export function buildStages({ walletAddress, permissionContext, decisionLog, playbookStore, logger = console }) {
  return {
    loadConfig: () => loadStrategyConfig({ walletAddress, permissionContext }),
    loadPlaybook: () => playbookStore.load(),
    fetchState: createFetchStage({
      loadPositionsMap,
      getHoursSinceLastRebalance: () => decisionLog.hoursSinceLastRebalance(),
    }),
    runGates: (state, config) => runFastFailGates(state, config),
    runSimulation: createSimulationStage({ logger }),
    runCouncil: createCouncilStage({ logger }),
    evaluateConsensus: (verdicts) => evaluateConsensus(verdicts),
    executeRebalance: createExecutionStage({ decisionLog, logger }),
  }
}

/**
 * Compose the full autonomous agent.
 * @param {object} args
 * @param {string} args.walletAddress
 * @param {string} [args.permissionContext]
 * @param {{decisionLog:object, playbook:object}} [args.storage]  localStorage adapters (tests inject memory)
 * @param {object} [args.logger]
 * @param {number} [args.intervalMs]
 * @param {{setInterval:Function, clearInterval:Function}} [args.scheduler]
 * @param {object} [args.overrides]  { outcomeEvaluator, autoStartLoop }  test seams
 * @returns {{loop, outcomeEvaluator, decisionLog, playbookStore, start, stop}}
 */
export function createVibingFarmerAgent({
  walletAddress,
  permissionContext = null,
  storage = {},
  logger = console,
  intervalMs,
  onEvent = () => {},
  onMemoryEvent = () => {},
  evaluateGoal = null,
  goal = null,
  shouldRatify = () => false,
  awaitRatify = null,
  ratifyDeadlineMs = 15_000,
  scheduler = { setInterval: globalThis.setInterval.bind(globalThis), clearInterval: globalThis.clearInterval.bind(globalThis) },
  overrides = {},
} = {}) {
  const decisionLog = createDecisionLog(storage.decisionLog ? { storage: storage.decisionLog } : {})
  const playbookStore = createPlaybookStore(storage.playbook ? { storage: storage.playbook } : {})

  // ACE evolution chain: analyzer ← curator ← reflector — each publishes its
  // result to the memory bus so the dashboard's late-pipeline stages light up
  // as the async (delayed-evaluation) engines complete, in real time.
  const analyzer = createAnalyzer({ logger, onMemoryEvent })
  const curator = createCurator({ analyzer, logger, onMemoryEvent })
  const reflector = createReflector({ playbookStore, curator, logger, onMemoryEvent })

  const outcomeEvaluator =
    overrides.outcomeEvaluator ??
    createOutcomeEvaluator({ decisionLog, reflector, catalog: VAULT_CATALOG, logger, onMemoryEvent })

  const stages = buildStages({ walletAddress, permissionContext, decisionLog, playbookStore, logger })
  const loop = createAutonomousLoop({ stages, intervalMs, logger, onEvent, evaluateGoal, shouldRatify, awaitRatify, ratifyDeadlineMs })

  let evaluatorTimer = null

  async function start() {
    await outcomeEvaluator.run()
    evaluatorTimer = scheduler.setInterval(() => {
      outcomeEvaluator.run().catch((err) => logger.error?.(`[outcome] ${err.message}`))
    }, OUTCOME_INTERVAL_MS)

    if (overrides.autoStartLoop !== false) {
      loop.start()
    }
  }

  function stop() {
    loop.stop()
    if (evaluatorTimer != null) {
      scheduler.clearInterval(evaluatorTimer)
      evaluatorTimer = null
    }
  }

  return { loop, outcomeEvaluator, decisionLog, playbookStore, goal, start, stop }
}
