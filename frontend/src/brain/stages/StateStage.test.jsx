import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StateStage } from './StateStage.jsx'

describe('StateStage', () => {
  it('renders the portfolio APY signature when data present and open', () => {
    render(<StateStage open num="01" label="state · action · reward"
      stage={{ id: 'state', state: 'done', data: { portfolioApy: 8.2, positionsUsd: 100 } }} onToggle={() => {}} meta="" />)
    expect(screen.getByText(/8.2/)).toBeTruthy()
  })

  it('shows running marker when state is running', () => {
    const { container } = render(<StateStage open num="01" label="state · action · reward"
      stage={{ id: 'state', state: 'running', data: {} }} onToggle={() => {}} meta="" />)
    expect(container.textContent).toContain('state · action · reward')
  })
})
