// frontend/src/brain/AgentBrain.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { AgentBrain } from './AgentBrain.jsx'

function makeFakeAgentFactory() {
  let onEvent = () => {}
  const factory = ({ onEvent: oe }) => { onEvent = oe; return {
    loop: { running: false, cyclesDone: 0 }, start: vi.fn(), stop: vi.fn(),
  } }
  factory.push = (e) => act(() => onEvent(e))
  return factory
}

describe('AgentBrain container', () => {
  it('renders shell with wordmark and idle pipeline before run', () => {
    render(<AgentBrain createAgent={makeFakeAgentFactory()} memoryBus={{ subscribe: () => () => {} }} />)
    expect(screen.getByText('vibing')).toBeTruthy()
    expect(screen.getByText('farmer')).toBeTruthy()
  })

  it('reveals and completes the state stage when a state event arrives', () => {
    const agent = makeFakeAgentFactory()
    render(<AgentBrain createAgent={agent} memoryBus={{ subscribe: () => () => {} }} autoStart />)
    agent.push({ type: 'cycle:start', cycleId: 'c1', n: 1284, at: 0 })
    agent.push({ type: 'state', cycleId: 'c1', portfolioApy: 8.2, positionsUsd: 100 })
    expect(screen.getByText(/8.2/)).toBeTruthy()
  })

  it('shows decision toast on a council EXECUTE consensus', () => {
    const agent = makeFakeAgentFactory()
    render(<AgentBrain createAgent={agent} memoryBus={{ subscribe: () => () => {} }} autoStart />)
    agent.push({ type: 'cycle:start', cycleId: 'c1', n: 1, at: 0 })
    agent.push({ type: 'council', cycleId: 'c1',
      verdicts: [{ role: 'riskAuditor', decision: 'EXECUTE', confidence: 0.82, keyReason: 'ok', citedRules: [] }],
      consensus: { finalDecision: 'EXECUTE', executeVotes: 3, total: 3 } })
    expect(screen.getAllByText(/has decided/i).length).toBeGreaterThanOrEqual(1)
  })
})
