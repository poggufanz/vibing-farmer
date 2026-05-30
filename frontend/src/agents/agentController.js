// agentController.js
// Main-thread controller. Spawns the worker, routes its messages, asks Venice AI to
// classify risk, and triggers execution via the existing 1Shot/relay flow.

import { saveTransaction } from '../history.js'
import { relayHarvest, relayWithdraw } from '../relay.js'
import { classifyRisk } from '../venice.js'

let worker = null
let currentConfig = null
const listeners = new Set()

export function startBackgroundAgent(config) {
  if (worker) stopBackgroundAgent()
  currentConfig = config
  worker = new Worker(new URL('./backgroundAgent.worker.js', import.meta.url), { type: 'module' })
  worker.onmessage = handleWorkerMessage
  worker.postMessage({ type: 'INIT', payload: config })
}

export function stopBackgroundAgent() {
  if (worker) {
    worker.postMessage({ type: 'STOP' })
    worker.terminate()
    worker = null
  }
}

export function updateAgentConfig(patch) {
  if (!worker) return
  currentConfig = { ...currentConfig, ...patch }
  worker.postMessage({ type: 'UPDATE_CONFIG', payload: patch })
}

export function onAgentEvent(callback) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

function emit(event) {
  listeners.forEach(cb => cb(event))
}

async function handleWorkerMessage(e) {
  const { type, payload } = e.data
  switch (type) {
    case 'POSITION_UPDATE':
      emit({ kind: 'position', ...payload })
      break
    case 'APY_DRIFT':
      emit({ kind: 'apy_drift', ...payload })
      break
    case 'REBALANCE_OPPORTUNITY':
      emit({ kind: 'rebalance_proposal', ...payload }) // propose only — never auto-execute
      break
    case 'HARVEST_READY':
      if (payload.autoHarvest) await executeHarvest(payload)
      else emit({ kind: 'harvest_ready', ...payload })
      break
    case 'RISK_SCAN_RESULT': {
      const severity = await classifyRisk(payload.searchAnswer, payload.protocol)
      if (severity === 'high' || severity === 'medium') emit({ kind: 'risk_alert', severity, ...payload })
      break
    }
    case 'MONITOR_ERROR':
      console.warn('[Agent]', payload.monitor, payload.error)
      break
  }
}

async function executeHarvest(payload) {
  try {
    const { txHash } = await relayHarvest({ user: currentConfig.userAddress, vault: payload.vaultAddress, recompound: false })
    saveTransaction({ txHash, vaultName: payload.vaultName, vaultAddress: payload.vaultAddress, amountUsdc: payload.rewardsUsdc, workerLabel: 'RewardHarvester', network: 'sepolia' })
    emit({ kind: 'harvest_executed', txHash, ...payload })
  } catch (err) {
    emit({ kind: 'harvest_failed', error: err.message, ...payload })
  }
}

/** Manual "Harvest now" from the dashboard. Returns tx hash. */
export async function harvestVault({ user, vault, vaultName, rewardsUsdc }) {
  const { txHash } = await relayHarvest({ user, vault, recompound: false })
  saveTransaction({ txHash, vaultName, vaultAddress: vault, amountUsdc: rewardsUsdc, workerLabel: 'RewardHarvester', network: 'sepolia' })
  return txHash
}

/** Emergency withdraw — called from UI. `amount` is in token units (string/bigint). */
export async function emergencyWithdraw(vaultAddress, amount, userAddress) {
  const { txHash } = await relayWithdraw({ user: userAddress, vault: vaultAddress, amount })
  saveTransaction({ txHash, vaultName: 'Emergency Withdraw', vaultAddress, amountUsdc: Number(amount) / 1e6, workerLabel: 'RiskWatcher', network: 'sepolia' })
  return txHash
}

/** Manual withdraw from the dashboard with a user-specified amount (units, string/bigint).
 *  Routes through relayWithdraw (not emergencyWithdraw) so the caller logs ONE history
 *  entry with the real vault metadata. Returns { txHash, status }. */
export async function withdrawFromVault(vaultAddress, amount, userAddress) {
  return relayWithdraw({ user: userAddress, vault: vaultAddress, amount })
}
