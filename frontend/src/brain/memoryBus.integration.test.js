// frontend/src/brain/memoryBus.integration.test.js
import { describe, it, expect, vi } from 'vitest'
import { createMemoryBus } from './memoryBus.js'
import { publishOutcome, publishReflection, publishCuration, publishAnalysis } from './memoryPublishers.js'

describe('memory publishers', () => {
  it('publish helpers emit normalized bus messages', () => {
    const bus = createMemoryBus(); const sub = vi.fn(); bus.subscribe(sub)
    publishReflection(bus, { tagged: 4, newRule: 'defi-014' })
    expect(sub).toHaveBeenCalledWith({ stage: 'reflector', payload: { tagged: 4, newRule: 'defi-014' } })
    publishAnalysis(bus, { merged: 2 })
    expect(sub).toHaveBeenCalledWith({ stage: 'bullet', payload: { merged: 2 } })
  })
})
