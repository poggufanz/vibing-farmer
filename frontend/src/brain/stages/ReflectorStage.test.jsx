import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReflectorStage } from './ReflectorStage.jsx'

const data = { tagged: 4, newRule: 'apy stale > 15m must downweight scenario by 0.2' }

describe('ReflectorStage', () => {
  it('shows the tagged count and new rule when reflection data lands', () => {
    render(<ReflectorStage open num="11" label="reflector"
      stage={{ id: 'reflector', state: 'done', data }} onToggle={() => {}} meta="" />)
    expect(screen.getAllByText(/4/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/apy stale/)).toBeTruthy()
  })

  it('shows a pending state before reflection has run', () => {
    render(<ReflectorStage open num="11" label="reflector"
      stage={{ id: 'reflector', state: 'idle', data: null }} onToggle={() => {}} meta="" />)
    expect(screen.getByText(/awaiting reflection/i)).toBeTruthy()
  })

  it('hides the expanded body when collapsed', () => {
    const { container } = render(<ReflectorStage open={false} num="11" label="reflector"
      stage={{ id: 'reflector', state: 'done', data }} onToggle={() => {}} meta="" />)
    expect(container.textContent).not.toContain('ACE Stanford')
  })
})
