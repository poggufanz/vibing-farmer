// frontend/src/brain/OnboardingGate.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OnboardingGate } from './OnboardingGate.jsx'

describe('OnboardingGate', () => {
  it('shows connect+grant prompt before granting, then renders children after grant', async () => {
    const grant = vi.fn().mockResolvedValue({ sessionAccount: '0xabc', expiry: 9999 })
    render(
      <OnboardingGate grantPermission={grant}>
        <div>BRAIN MOUNTED</div>
      </OnboardingGate>
    )
    // children hidden until grant
    expect(screen.queryByText('BRAIN MOUNTED')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /grant|connect|authorize/i }))
    await waitFor(() => expect(screen.getByText('BRAIN MOUNTED')).toBeTruthy())
    expect(grant).toHaveBeenCalledOnce()
  })

  it('surfaces an error and stays gated if grant rejects', async () => {
    const grant = vi.fn().mockRejectedValue(new Error('user rejected'))
    render(<OnboardingGate grantPermission={grant}><div>BRAIN</div></OnboardingGate>)
    fireEvent.click(screen.getByRole('button', { name: /grant|connect|authorize/i }))
    await waitFor(() => expect(screen.getByText(/user rejected/i)).toBeTruthy())
    expect(screen.queryByText('BRAIN')).toBeNull()
  })
})
