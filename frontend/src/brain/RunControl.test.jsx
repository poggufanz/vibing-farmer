import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmModal, Stepper } from './RunControl.jsx'

describe('Stepper', () => {
  it('clamps between min and max and calls onChange', () => {
    const onChange = vi.fn()
    render(<Stepper value={1} min={1} max={8} onChange={onChange} label="branches" />)
    fireEvent.click(screen.getByLabelText('decrease branches'))
    expect(onChange).not.toHaveBeenCalledWith(0) // already at min
    fireEvent.click(screen.getByLabelText('increase branches'))
    expect(onChange).toHaveBeenCalledWith(2)
  })
})

describe('ConfirmModal', () => {
  it('confirms with the chosen council-specialist toggles', () => {
    const onConfirm = vi.fn()
    const specialists = { riskAuditor: true, gasChecker: true, strategyGuard: true }
    render(<ConfirmModal open specialists={specialists} onToggleSpecialist={() => {}} onConfirm={onConfirm} onCancel={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /authorize|confirm|start/i }))
    expect(onConfirm).toHaveBeenCalled()
  })
})
