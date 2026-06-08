import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EvalStage } from './EvalStage.jsx'

const data = { evaluated: true, netResultUSD: 4.82, wasProfit: true }

describe('EvalStage', () => {
  it('shows the net result when async eval data is present', () => {
    render(<EvalStage open num="10" label="eval"
      stage={{ id: 'eval', state: 'done', data }} onToggle={() => {}} meta="" />)
    expect(screen.getAllByText(/4.82/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/profit/i).length).toBeGreaterThanOrEqual(1)
  })

  it('shows a pending state when eval has not run yet', () => {
    render(<EvalStage open num="10" label="eval"
      stage={{ id: 'eval', state: 'idle', data: null }} onToggle={() => {}} meta="" />)
    expect(screen.getByText(/awaiting|pending/i)).toBeTruthy()
  })

  it('hides the expanded body when collapsed', () => {
    const { container } = render(<EvalStage open={false} num="10" label="eval"
      stage={{ id: 'eval', state: 'done', data }} onToggle={() => {}} meta="" />)
    expect(container.textContent).not.toContain('autoresearch')
  })
})
