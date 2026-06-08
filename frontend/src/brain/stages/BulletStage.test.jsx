import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BulletStage } from './BulletStage.jsx'

const data = {
  merged: 2,
  pairs: [
    { a: 'defi-014', b: 'defi-027', j: 0.74, action: 'merge · sum counters → helpful 9' },
    { a: 'defi-008', b: 'defi-041', j: 0.62, action: 'merge candidate · awaiting venice' },
    { a: 'defi-019', b: 'defi-033', j: 0.38, action: 'below threshold · skip' },
  ],
}

describe('BulletStage', () => {
  it('shows the merged count and jaccard pairs when analysis lands', () => {
    render(<BulletStage open num="13" label="bulletpoint analyzer"
      stage={{ id: 'bullet', state: 'done', data }} onToggle={() => {}} meta="" />)
    expect(screen.getAllByText(/2/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/defi-014.*defi-027/)).toBeTruthy()
    expect(screen.getByText(/j=0.74/)).toBeTruthy()
  })

  it('shows a pending state before analysis has run', () => {
    render(<BulletStage open num="13" label="bulletpoint analyzer"
      stage={{ id: 'bullet', state: 'idle', data: null }} onToggle={() => {}} meta="" />)
    expect(screen.getByText(/awaiting analysis/i)).toBeTruthy()
  })

  it('hides the expanded body when collapsed', () => {
    const { container } = render(<BulletStage open={false} num="13" label="bulletpoint analyzer"
      stage={{ id: 'bullet', state: 'done', data }} onToggle={() => {}} meta="" />)
    expect(container.textContent).not.toContain('FAISS')
  })
})
