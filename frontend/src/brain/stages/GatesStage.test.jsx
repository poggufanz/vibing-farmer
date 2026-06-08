import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GatesStage } from './GatesStage.jsx'

describe('GatesStage', () => {
  it('shows the failure reason when a gate fails', () => {
    render(<GatesStage open num="04" label="fast-fail gates"
      stage={{ id: 'gates', state: 'fail', data: { pass: false, reason: 'turbulence above threshold' } }}
      onToggle={() => {}} meta="" />)
    expect(screen.getByText(/turbulence above threshold/)).toBeTruthy()
  })

  it('hides the expanded body when collapsed', () => {
    const { container } = render(<GatesStage open={false} num="04" label="fast-fail gates"
      stage={{ id: 'gates', state: 'done', data: { pass: true } }} onToggle={() => {}} meta="" />)
    expect(container.textContent).not.toContain('Turbulence Index')
  })
})
