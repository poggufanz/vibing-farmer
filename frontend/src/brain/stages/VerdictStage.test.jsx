import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VerdictStage } from './VerdictStage.jsx'

const consensus = { finalDecision: 'EXECUTE', executeVotes: 3, total: 3 }

describe('VerdictStage', () => {
  it('shows quorum and final decision', () => {
    render(<VerdictStage open num="07" label="verdict"
      stage={{ id: 'verdict', state: 'done', data: { consensus } }} onToggle={() => {}} meta="" />)
    expect(screen.getAllByText(/3\/3/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/EXECUTE/).length).toBeGreaterThanOrEqual(1)
  })

  it('hides the expanded body when collapsed', () => {
    const { container } = render(<VerdictStage open={false} num="07" label="verdict"
      stage={{ id: 'verdict', state: 'done', data: { consensus } }} onToggle={() => {}} meta="" />)
    expect(container.textContent).not.toContain('EvoDS')
  })
})
