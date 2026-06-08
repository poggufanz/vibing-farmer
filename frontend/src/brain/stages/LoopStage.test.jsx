import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LoopStage } from './LoopStage.jsx'

describe('LoopStage', () => {
  it('shows the cycle number from stage.data.n when open', () => {
    render(<LoopStage open num="02" label="autonomous loop"
      stage={{ id: 'loop', state: 'running', data: { n: 1284, at: 0 } }} onToggle={() => {}} meta="" />)
    expect(screen.getByText(/1284/)).toBeTruthy()
  })

  it('hides the expanded body when collapsed', () => {
    const { container } = render(<LoopStage open={false} num="02" label="autonomous loop"
      stage={{ id: 'loop', state: 'running', data: { n: 1284, at: 0 } }} onToggle={() => {}} meta="" />)
    expect(container.textContent).not.toContain('stage pipeline')
  })
})
