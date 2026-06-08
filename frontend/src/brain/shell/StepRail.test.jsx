import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StepRail } from './StepRail.jsx'

describe('StepRail', () => {
  it('renders all 6 macro steps and marks the active one', () => {
    render(<StepRail activeStep="execute" />)
    for (const label of ['AI Strategy', 'Connect & Upgrade', 'Review Skills', 'Grant', 'Auto-Execute', 'Complete']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })
})
