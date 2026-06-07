// frontend/src/brain/memoryBus.test.js
import { describe, it, expect, vi } from 'vitest'
import { createMemoryBus, IQ_DELTAS } from './memoryBus.js'

describe('memoryBus', () => {
  it('notifies subscribers of emitted stage results', () => {
    const bus = createMemoryBus()
    const sub = vi.fn()
    bus.subscribe(sub)
    bus.emit({ stage: 'reflector', payload: { tagged: 4 } })
    expect(sub).toHaveBeenCalledWith({ stage: 'reflector', payload: { tagged: 4 } })
  })

  it('exposes IQ deltas for the four async stages', () => {
    expect(IQ_DELTAS.reflector).toBe(7)
    expect(IQ_DELTAS.curator).toBe(3)
    expect(IQ_DELTAS.bullet).toBe(2)
    expect(IQ_DELTAS.eval).toBe(0)
  })

  it('unsubscribe stops further notifications', () => {
    const bus = createMemoryBus()
    const sub = vi.fn()
    const off = bus.subscribe(sub)
    off()
    bus.emit({ stage: 'curator', payload: {} })
    expect(sub).not.toHaveBeenCalled()
  })
})
