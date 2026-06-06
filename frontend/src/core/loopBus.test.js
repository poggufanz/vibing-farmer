import { describe, it, expect, vi } from 'vitest'
import { createLoopBus } from './loopBus.js'

describe('createLoopBus', () => {
  it('delivers emitted events to subscribers', () => {
    const bus = createLoopBus()
    const seen = []
    bus.subscribe((e) => seen.push(e))
    bus.emit({ type: 'cycle:start', cycleId: 'c1', n: 1 })
    bus.emit({ type: 'gate', cycleId: 'c1', pass: true, reason: null })
    expect(seen.map((e) => e.type)).toEqual(['cycle:start', 'gate'])
  })

  it('unsubscribe stops delivery', () => {
    const bus = createLoopBus()
    const fn = vi.fn()
    const off = bus.subscribe(fn)
    off()
    bus.emit({ type: 'gate', cycleId: 'c1', pass: true })
    expect(fn).not.toHaveBeenCalled()
  })

  it('replays the recent ring buffer to a new subscriber', () => {
    const bus = createLoopBus({ bufferSize: 3 })
    bus.emit({ type: 'a' }); bus.emit({ type: 'b' }); bus.emit({ type: 'c' }); bus.emit({ type: 'd' })
    const seen = []
    bus.subscribe((e) => seen.push(e.type), { replay: true })
    expect(seen).toEqual(['b', 'c', 'd']) // oldest dropped
  })

  it('a throwing subscriber never breaks emit for others', () => {
    const bus = createLoopBus()
    bus.subscribe(() => { throw new Error('bad subscriber') })
    const ok = vi.fn()
    bus.subscribe(ok)
    expect(() => bus.emit({ type: 'gate' })).not.toThrow()
    expect(ok).toHaveBeenCalledOnce()
  })
})
