import React from 'react'
import ReactDOM from 'react-dom/client'
import '../style.css'
import { OnboardingGate } from './brain/OnboardingGate.jsx'
import { AgentBrain } from './brain/AgentBrain.jsx'
import { createVibingFarmerAgent } from './core/composeAgent.js'
import { createMemoryBus } from './brain/memoryBus.js'
import { connectAndGrant } from './wallet.js' // connect + Smart Account upgrade + requestExecutionPermissions (ERC-7715)

const memoryBus = createMemoryBus()
const session = {} // { walletAddress, permissionContext } filled on grant; read by createAgent

// One MetaMask popup, ever (ERC-712 signature, zero gas). Loop executes popup-free after.
async function grantPermission() {
  const granted = await connectAndGrant()
  Object.assign(session, granted)
  return granted
}

// AgentBrain calls this to build the real agent once, threading its onEvent + memoryBus.
function createAgent({ onEvent }) {
  return createVibingFarmerAgent({
    walletAddress: session.walletAddress,
    permissionContext: session.permissionContext,
    onEvent,
    // memoryBus surfaces the async ACE chain to the UI (Task 25 extends composeAgent to accept it)
    onMemoryEvent: (msg) => memoryBus.emit(msg),
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <OnboardingGate grantPermission={grantPermission}>
      <AgentBrain createAgent={createAgent} memoryBus={memoryBus} />
    </OnboardingGate>
  </React.StrictMode>,
)
