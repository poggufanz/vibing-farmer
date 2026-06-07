// frontend/src/brain/memoryBus.js
// Decouples the async (delayed-evaluation) engines from the dashboard. The four
// late-pipeline stages subscribe; engines emit when their async work completes.

// Council IQ grows when learning stages fire (mirrors design AgentBrain lines 2370-2372).
export const IQ_DELTAS = { eval: 0, reflector: 7, curator: 3, bullet: 2 }

export function createMemoryBus() {
  const subs = new Set()
  return {
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    // message = { stage: 'eval'|'reflector'|'curator'|'bullet', payload: object }
    emit(message) {
      for (const fn of subs) {
        try { fn(message) } catch { /* a bad subscriber must not break the bus */ }
      }
    },
  }
}
