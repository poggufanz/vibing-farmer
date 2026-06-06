// Synchronous pub/sub for autonomous-loop stage events. No deps, no async.
// The loop emits LoopEvents; the live dashboard subscribes. A small ring buffer
// lets a subscriber that mounts AFTER the loop started still render recent activity.

const DEFAULT_BUFFER = 40

/**
 * @param {{ bufferSize?: number }} [opts]
 * @returns {{ emit:(e:object)=>void, subscribe:(fn:Function, opts?:{replay?:boolean})=>(()=>void), recent:()=>object[] }}
 */
export function createLoopBus({ bufferSize = DEFAULT_BUFFER } = {}) {
  const subscribers = new Set()
  const buffer = []

  function emit(event) {
    buffer.push(event)
    if (buffer.length > bufferSize) buffer.shift()
    for (const fn of subscribers) {
      try { fn(event) } catch (err) { console.warn('[loopBus] subscriber threw:', err?.message) }
    }
  }

  function subscribe(fn, { replay = false } = {}) {
    subscribers.add(fn)
    if (replay) for (const e of buffer) { try { fn(e) } catch { /* ignore replay errors */ } }
    return () => subscribers.delete(fn)
  }

  return { emit, subscribe, recent: () => buffer.slice() }
}
