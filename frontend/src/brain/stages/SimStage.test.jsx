import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SimStage } from './SimStage.jsx'

const DATA = {
  bull: 120,
  base: 80,
  bear: -20,
  weights: { bull: 0.3, base: 0.5, bear: 0.2 },
  expectedValue: 65,
}

describe('SimStage', () => {
  it('renders exactly 3 branch paths and the expected value', () => {
    const { container } = render(<SimStage open num="05" label="venice ai simulation"
      stage={{ id: 'sim', state: 'done', data: DATA }} onToggle={() => {}} meta="" />)
    expect(container.querySelectorAll('path[data-branch]').length).toBe(3)
    expect(screen.getByText(/E\[value\]/)).toBeTruthy()
  })

  it('hides the expanded body when collapsed', () => {
    const { container } = render(<SimStage open={false} num="05" label="venice ai simulation"
      stage={{ id: 'sim', state: 'done', data: DATA }} onToggle={() => {}} meta="" />)
    expect(container.textContent).not.toContain('alternate timeline simulation')
  })
})
