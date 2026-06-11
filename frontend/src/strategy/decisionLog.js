// frontend/src/strategy/decisionLog.js
// Decision log for the autonomous monitor loop — adapts EvoDS Step 7 ACC at the
// sub-agent level. Each council specialist's verdict is compressed to a single
// deterministic summary line (no per-cycle AI), and the full per-specialist set
// plus the council's authoritative decision is persisted for post-mortem and
// future calibration. Mirrors cycleJournal.js: pure localStorage, append-only,
// capped, never throws. Distinct from cycleJournal (operational trail) — this
// store only records cycles where the council actually deliberated.

const POSITIVE = { DEPOSIT: 'clear to proceed', HOLD: 'hold', WITHDRAW: 'exit' }

/** Compress one specialist verdict to a single human-readable line. Pure. */
export function accSummary({ signal, citedRules = [], concerns = [] } = {}) {
  const reason = concerns[0] ?? POSITIVE[signal] ?? ''
  const rules = citedRules.length ? ` (${citedRules.join(', ')})` : ''
  return `${signal} — ${reason}${rules}`
}
