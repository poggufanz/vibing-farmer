import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CuratorStage } from './CuratorStage.jsx'

const data = { added: 3, deduped: 7 }

describe('CuratorStage', () => {
  it('shows the added-rules count when curation data lands', () => {
    render(<CuratorStage open num="12" label="curator"
      stage={{ id: 'curator', state: 'done', data }} onToggle={() => {}} meta="" />)
    expect(screen.getAllByText(/3/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/7/).length).toBeGreaterThanOrEqual(1)
  })

  it('shows a pending state before curation has run', () => {
    render(<CuratorStage open num="12" label="curator"
      stage={{ id: 'curator', state: 'idle', data: null }} onToggle={() => {}} meta="" />)
    expect(screen.getByText(/awaiting curation/i)).toBeTruthy()
  })

  it('hides the expanded body when collapsed', () => {
    const { container } = render(<CuratorStage open={false} num="12" label="curator"
      stage={{ id: 'curator', state: 'done', data }} onToggle={() => {}} meta="" />)
    expect(container.textContent).not.toContain('ACE Stanford')
  })
})
