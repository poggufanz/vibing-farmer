// frontend/src/brain/stage/Stage.test.jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Stage } from './Stage.jsx'

describe('Stage primitive', () => {
  it('renders eyebrow number, label and children', () => {
    render(
      <Stage id="sim" num="05" label="simulation engine" state="running" open meta="3 branches">
        <div>branch fan</div>
      </Stage>
    )
    expect(screen.getByText('05')).toBeTruthy()
    expect(screen.getByText('simulation engine')).toBeTruthy()
    expect(screen.getByText('branch fan')).toBeTruthy()
  })

  it('hides children when collapsed (open=false)', () => {
    render(
      <Stage id="sim" num="05" label="simulation engine" state="done" open={false} meta="">
        <div>hidden body</div>
      </Stage>
    )
    expect(screen.queryByText('hidden body')).toBeNull()
  })
})
