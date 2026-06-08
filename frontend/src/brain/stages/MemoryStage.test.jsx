import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryStage } from './MemoryStage.jsx'

const rules = [
  { id: 'defi-001', text: 'if base_fee > 40 gwei wait min 4 blocks', helpful: 12, harmful: 1 },
  { id: 'defi-002', text: 'aave-v3 apy spikes precede 3-block gas drop', helpful: 6, harmful: 0 },
  { id: 'defi-003', text: 'vault share price drift on deposit', helpful: 3, harmful: 2 },
]

describe('MemoryStage', () => {
  it('shows the rule count from the playbook', () => {
    render(<MemoryStage open num="08" label="memory"
      stage={{ id: 'memory', state: 'done', data: { rules } }} onToggle={() => {}} meta="" />)
    expect(screen.getAllByText(/3/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/base_fee > 40 gwei/)).toBeTruthy()
  })

  it('hides the expanded body when collapsed', () => {
    const { container } = render(<MemoryStage open={false} num="08" label="memory"
      stage={{ id: 'memory', state: 'done', data: { rules } }} onToggle={() => {}} meta="" />)
    expect(container.textContent).not.toContain('ACE Stanford')
  })
})
