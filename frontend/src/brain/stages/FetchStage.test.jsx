import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FetchStage } from './FetchStage.jsx'

describe('FetchStage', () => {
  it('shows the parallel fetch label and live fetch ms when data present', () => {
    render(<FetchStage open num="03" label="parallel data fetch"
      stage={{ id: 'fetch', state: 'done', data: { ms: 482, sources: ['aave-v3', 'compound'] } }}
      onToggle={() => {}} meta="" />)
    expect(screen.getByText(/parallel fetch/i)).toBeTruthy()
    expect(screen.getByText(/482/)).toBeTruthy()
  })

  it('hides the expanded body when collapsed', () => {
    const { container } = render(<FetchStage open={false} num="03" label="parallel data fetch"
      stage={{ id: 'fetch', state: 'done', data: { ms: 482, sources: ['aave-v3', 'compound'] } }}
      onToggle={() => {}} meta="" />)
    expect(container.textContent).not.toContain('dag · 8 nodes')
  })
})
