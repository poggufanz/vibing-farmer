import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RightRail } from './RightRail.jsx'

const feed = [
  { id: 'verdict-1284-0', cycle: 1284, stage: 'verdict', marker: '✓', color: 'var(--ok)', text: 'Council has decided · execute', time: '02:14:38' },
]

describe('RightRail', () => {
  it('shows Council IQ and the activity feed text', () => {
    render(<RightRail iq={1247} councilFeed={feed} decisionToast={null} />)
    expect(screen.getByText('1247')).toBeTruthy()
    expect(screen.getByText(/Council has decided/)).toBeTruthy()
  })

  it('renders the decision toast when present', () => {
    render(<RightRail iq={1247} councilFeed={[]} decisionToast="rotate 40 USDC → aave-v3" />)
    expect(screen.getByText(/rotate 40 USDC/)).toBeTruthy()
  })
})
