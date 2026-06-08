import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExecutionStage } from './ExecutionStage.jsx'

const data = { outcome: 'success', txHash: '0x71f3a9c4d8e2b105f6a7c3d9e1b2a4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1' }

describe('ExecutionStage', () => {
  it('shows the short tx hash when one is set', () => {
    render(<ExecutionStage open num="09" label="execution"
      stage={{ id: 'execution', state: 'done', data }} onToggle={() => {}} meta="" />)
    expect(screen.getByText(/0x71f3/)).toBeTruthy()
    expect(screen.getAllByText(/success/i).length).toBeGreaterThanOrEqual(1)
  })

  it('hides the expanded body when collapsed', () => {
    const { container } = render(<ExecutionStage open={false} num="09" label="execution"
      stage={{ id: 'execution', state: 'done', data }} onToggle={() => {}} meta="" />)
    expect(container.textContent).not.toContain('1Shot API')
  })
})
