import { connectWallet, getAccount, requestERC7715Permission, signSiweForVenice } from './wallet.js'
import { generateStrategy } from './venice.js'
import { OrchestratorAgent } from './orchestrator.js'
import { AgentGraph } from './graph.js'
import { readMemory, loadAllMemory, clearMemory } from './memory.js'
import { loadSkill, clearSkills } from './skills.js'
import {
  setStep, logActivity, showAgentDetail, showOrchestratorDetail,
  setButtonEnabled, setButtonVisible
} from './ui.js'
import { makeAgentId } from './worker.js'

// App state
const state = {
  phase: 'idle', // idle | connecting | generating | approving | executing | done
  account: null,
  permissionContext: null,
  strategy: null,
  vaultPlans: [],
  sessionId: null,
  graph: null,
  veniceAuth: null,   // Venice x402 SIWE header — set at Generate time
  devApiKey: null     // DeepSeek API key — dev mode fallback
}

// Initialize graph
function initGraph() {
  state.graph = new AgentGraph('graph-container')
  state.graph.onNodeClick(nodeId => {
    if (nodeId === 'orchestrator') {
      const allMemory = loadAllMemory()
      const completed = Object.values(allMemory).filter(m =>
        m.entries.some(e => e.step === 'deposit' && e.status === 'success')
      ).length
      const failed = state.vaultPlans.length - completed
      showOrchestratorDetail({
        totalAgents: state.vaultPlans.length,
        completed,
        failed,
        totalShares: completed * 1 // simplified for demo
      })
      return
    }
    // Worker node clicked
    const memory = readMemory(nodeId)
    const skill = loadSkill(nodeId)
    const plan = state.vaultPlans.find(p => p.agentId === nodeId)
    showAgentDetail({
      id: nodeId,
      label: plan ? `Worker ${plan.index + 1}` : nodeId,
      status: memory?.entries?.at(-1)?.status || 'pending',
      vault: plan?.vault || '—',
      skills: skill,
      memory: memory?.entries || []
    })
  })
}

// Handle orchestrator events → update graph + UI
function handleAgentEvent(eventName, data) {
  const { agentId, vault, step, status, txHash, error } = data

  switch (eventName) {
    case 'orchestrator-started':
      logActivity(`Orchestrator started — ${data.totalAgents} agents`, 'info')
      break

    case 'orchestrator-completed':
      logActivity(
        `Done — ${data.completed} deposited, ${data.failed} failed`,
        data.failed === 0 ? 'success' : 'warn'
      )
      setStep('done', 'done')
      setButtonVisible('btn-reset', true)
      break

    case 'started':
      logActivity(`Agent ${agentId.slice(0, 10)}... started → vault ${vault.slice(0, 8)}...`, 'info')
      state.graph?.setWorkerStatus(agentId, 'active')
      break

    case 'step':
      logActivity(`  ${agentId.slice(0, 10)}... ${step}: ${status}`, status === 'done' ? 'success' : 'info')
      if (step === 'deposit' && status === 'done') {
        state.graph?.highlightEdge(agentId, `vault-${state.vaultPlans.findIndex(p => p.agentId === agentId)}`)
      }
      break

    case 'completed':
      logActivity(
        `Agent ${agentId.slice(0, 10)}... completed. ${data.simulated ? '[simulated]' : `TX: ${data.txHash?.slice(0, 14)}...`}`,
        'success'
      )
      state.graph?.setWorkerStatus(agentId, 'done')
      break

    case 'failed':
      logActivity(`Agent ${agentId.slice(0, 10)}... failed: ${error}`, 'error')
      state.graph?.setWorkerStatus(agentId, 'failed')
      break
  }
}

// Button: Connect Wallet
document.getElementById('btn-connect').addEventListener('click', async () => {
  setButtonEnabled('btn-connect', false)
  setStep('connect', 'active')
  logActivity('Connecting wallet...', 'info')

  try {
    state.account = await connectWallet()
    setStep('connect', 'done')
    logActivity(`Connected: ${state.account.slice(0, 10)}...`, 'success')
    updateWalletPanel(state.account)
    setButtonEnabled('btn-generate', true)
    setButtonEnabled('btn-connect', false)
    state.phase = 'connected'
  } catch (err) {
    setStep('connect', 'error')
    logActivity(`Connect failed: ${err.message}`, 'error')
    setButtonEnabled('btn-connect', true)
  }
})

// Button: Generate Strategy
document.getElementById('btn-generate').addEventListener('click', async () => {
  setButtonEnabled('btn-generate', false)
  setStep('generate', 'active')

  const amount = Number(document.getElementById('input-amount').value)
  const riskLevel = document.getElementById('input-risk').value
  const numVaults = Number(document.getElementById('input-vaults').value)
  const devApiKey = document.getElementById('input-venice-key').value || null

  // Try Venice x402 first (wallet SIWE), fall back to DeepSeek dev key
  let veniceAuth = null
  if (state.account && !devApiKey) {
    try {
      logActivity('Signing Venice x402 auth (SIWE)...', 'info')
      veniceAuth = await signSiweForVenice(state.account)
      logActivity('Venice x402 auth signed.', 'success')
    } catch (e) {
      console.warn('[ai] SIWE signing failed, trying devApiKey fallback:', e.message)
    }
  }

  logActivity(`Generating strategy — ${amount} USDC, ${riskLevel} risk, ${numVaults} vaults...`, 'info')

  try {
    state.strategy = await generateStrategy({ amount, riskLevel, numVaults, veniceAuth, devApiKey })
    state.veniceAuth = veniceAuth
    state.devApiKey = devApiKey
    state.sessionId = `session-${Date.now()}`

    state.vaultPlans = state.strategy.vaults.map((v, i) => ({
      index: i,
      agentId: makeAgentId(i, state.sessionId),
      vault: v.address,
      amountUSDC: amount * v.allocation,
      amountUnits: BigInt(Math.floor(amount * v.allocation * 1e6))
    }))

    // Build graph from plan
    state.graph?.buildFromPlan(state.vaultPlans)
    showGraph()

    setStep('generate', 'done')
    logActivity(`Strategy: ${state.strategy.rationale}`, 'success')
    state.vaultPlans.forEach((p, i) =>
      logActivity(`  Vault ${i + 1}: ${(p.amountUSDC).toFixed(2)} USDC → ${p.vault.slice(0, 10)}...`, 'info')
    )

    setButtonEnabled('btn-approve', true)
    state.phase = 'generated'
  } catch (err) {
    setStep('generate', 'error')
    logActivity(`Strategy failed: ${err.message}`, 'error')
    setButtonEnabled('btn-generate', true)
  }
})

// Button: Approve & Execute
document.getElementById('btn-approve').addEventListener('click', async () => {
  setButtonEnabled('btn-approve', false)
  setStep('approve', 'active')
  logActivity('Requesting ERC-7715 permission via MetaMask SAK...', 'info')

  try {
    // ERC-7715 permission — EIP-7702 handled internally by SAK
    const permResult = await requestERC7715Permission(86400)
    state.permissionContext = permResult.permissionContext
    setStep('approve', 'done')
    logActivity('Permission granted. Dispatching agents...', 'success')

    // Execute
    setStep('execute', 'active')
    state.phase = 'executing'
    showGraph()

    const amount = Number(document.getElementById('input-amount').value)

    const orchestrator = new OrchestratorAgent({
      user: state.account,
      permissionContext: state.permissionContext,
      veniceAuth: state.veniceAuth,
      devApiKey: state.devApiKey,
      sessionId: state.sessionId,
      onEvent: handleAgentEvent
    })

    const summary = await orchestrator.dispatch(state.strategy, amount)

    setStep('execute', summary.failed === 0 ? 'done' : 'error')
    setButtonVisible('btn-reset', true)
    state.phase = 'done'
  } catch (err) {
    setStep('approve', 'error')
    logActivity(`Execution failed: ${err.message}`, 'error')
    setButtonEnabled('btn-approve', true)
    setButtonVisible('btn-reset', true)
  }
})

// Button: Reset
document.getElementById('btn-reset').addEventListener('click', () => {
  state.phase = 'idle'
  state.strategy = null
  state.vaultPlans = []
  state.permissionContext = null
  state.veniceAuth = null
  state.devApiKey = null
  state.graph?.reset()
  clearMemory()
  clearSkills()
  hideGraph()
  document.getElementById('log-entries').innerHTML = ''
  document.getElementById('detail-panel').innerHTML = '<span class="empty">—</span>'
  const walletMeta = document.getElementById('wallet-meta')
  const walletDetail = document.getElementById('wallet-detail')
  if (walletMeta) walletMeta.textContent = 'not connected'
  if (walletDetail) walletDetail.innerHTML = '<span class="empty">— belum connect</span>'
  ;['connect', 'generate', 'approve', 'execute', 'done'].forEach(s => setStep(s, 'pending'))
  setButtonEnabled('btn-connect', true)
  setButtonEnabled('btn-generate', false)
  setButtonEnabled('btn-approve', false)
  setButtonVisible('btn-reset', false)
  logActivity('Reset.', 'info')
})

// Risk buttons → sync hidden select
document.querySelectorAll('.risk-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.risk-opt').forEach(b => {
      b.classList.remove('selected')
      b.setAttribute('aria-checked', 'false')
    })
    btn.classList.add('selected')
    btn.setAttribute('aria-checked', 'true')
    const sel = document.getElementById('input-risk')
    if (sel) sel.value = btn.dataset.risk
  })
})

// Show graph + hide strategy card during execute phase
function showGraph() {
  const card = document.getElementById('card-strategy')
  const graph = document.getElementById('graph-container')
  if (card) card.style.display = 'none'
  if (graph) graph.classList.add('visible')
}

function hideGraph() {
  const card = document.getElementById('card-strategy')
  const graph = document.getElementById('graph-container')
  if (card) card.style.display = ''
  if (graph) graph.classList.remove('visible')
}

// Update wallet display in right rail
function updateWalletPanel(address) {
  const meta = document.getElementById('wallet-meta')
  const detail = document.getElementById('wallet-detail')
  if (meta) meta.textContent = 'sepolia'
  if (detail) detail.innerHTML = `
    <div style="font-family:var(--font-mono);font-size:12px;color:var(--text);letter-spacing:-0.01em">${address}</div>
    <div style="font-family:var(--font-mono);font-size:10px;color:var(--accent);margin-top:4px">eip-7702 ready</div>
  `
}

// Init
initGraph()
logActivity('YIELD VIBING ready. Connect wallet to start.', 'info')
