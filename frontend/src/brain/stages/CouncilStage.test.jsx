import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CouncilStage } from './CouncilStage.jsx'

const verdicts = [
  { role: 'riskAuditor', decision: 'EXECUTE', confidence: 0.82, keyReason: 'drawdown within bounds', citedRules: ['defi-001'] },
  { role: 'gasChecker', decision: 'EXECUTE', confidence: 0.91, keyReason: 'base fee trending down', citedRules: [] },
  { role: 'strategyGuard', decision: 'HOLD', confidence: 0.6, keyReason: 'wait for confirmation', citedRules: ['defi-002'] },
]

describe('CouncilStage', () => {
  it('renders one row per verdict and shows each decision', () => {
    render(<CouncilStage open num="06" label="ai council"
      stage={{ id: 'council', state: 'done', data: { verdicts } }} onToggle={() => {}} meta="" />)
    expect(screen.getAllByText('riskAuditor').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('gasChecker').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('strategyGuard').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/EXECUTE/).length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText(/HOLD/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/drawdown within bounds/)).toBeTruthy()
  })

  it('hides the expanded body when collapsed', () => {
    const { container } = render(<CouncilStage open={false} num="06" label="ai council"
      stage={{ id: 'council', state: 'done', data: { verdicts } }} onToggle={() => {}} meta="" />)
    expect(container.textContent).not.toContain('TradingAgents')
  })
})
