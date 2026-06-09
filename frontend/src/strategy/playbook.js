// frontend/src/strategy/playbook.js
// ACE-inspired per-rule playbook. Every council `citedRule` accumulates
// helpful/harmful counts from real execution outcomes (via reflector.js). The
// derived weight nudges specialist confidence so rules that consistently pay off
// gain influence and harmful ones fade — the playbook evolution loop from ACE.
// Pure localStorage I/O.

const KEY = 'yv_playbook'
const W_MIN = 0.5
const W_MAX = 1.5

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

function write(obj) {
  try {
    localStorage.setItem(KEY, JSON.stringify(obj))
  } catch (err) {
    console.warn('[Playbook] write failed:', err.message)
  }
}

/** Bump a rule's counter. kind = 'helpful' | 'harmful'. Never throws. */
export function increment(ruleId, kind) {
  if (!ruleId || (kind !== 'helpful' && kind !== 'harmful')) return
  try {
    const pb = read()
    const cur = pb[ruleId] || { helpful: 0, harmful: 0 }
    pb[ruleId] = { ...cur, [kind]: (cur[kind] || 0) + 1 }
    write(pb)
  } catch (err) {
    console.warn('[Playbook] increment failed:', err.message)
  }
}

/**
 * Confidence multiplier in [0.5, 1.5] from the helpful/harmful ratio.
 * Neutral (no history or balanced) → 1.0. Uses a Laplace-smoothed ratio.
 */
export function weight(ruleId) {
  const c = read()[ruleId]
  if (!c) return 1.0
  const h = c.helpful || 0
  const x = c.harmful || 0
  if (h + x === 0) return 1.0
  const ratio = (h + 1) / (h + x + 2)        // smoothed, in (0,1), 0.5 = neutral
  const w = W_MIN + (W_MAX - W_MIN) * ratio  // map to [0.5, 1.5]
  return +w.toFixed(3)
}

export function getCounters() {
  return read()
}

export function clearPlaybook() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}