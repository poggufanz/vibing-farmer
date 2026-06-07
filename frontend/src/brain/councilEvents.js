// frontend/src/brain/councilEvents.js
// Structured council activity events for the right rail. Ported + extended from
// design agent-brain.tsx:1680-1733 (signature gains `data` so real values render).
import { T } from './tokens.js'

export const EVENT_STYLES = {
  state:     { marker: '·', color: T.textMuted },
  gates:     { marker: '·', color: T.textMuted },
  sim:       { marker: '·', color: T.info },
  council:   { marker: '◇', color: T.info },
  verdict:   { marker: '✓', color: T.ok },
  execution: { marker: '↓', color: T.info },
  reflector: { marker: '✦', color: T.accent },
  curator:   { marker: '+', color: T.accent },
  bullet:    { marker: '≡', color: T.accent },
}

export function fmtTime(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// Returns a CouncilEvent { id, cycle, stage, marker, color, text, time } or null.
// Port the per-stage text branches from the design; substitute `data` values where
// the design hardcoded the demo verdict string.
export function buildCouncilEvent(stage, cycleNum, at, data = {}) {
  const style = EVENT_STYLES[stage]
  if (!style) return null

  let text
  switch (stage) {
    case 'verdict': {
      const d = data.finalDecision ?? 'HOLD'
      const q = data.executeVotes != null && data.total != null ? `${data.executeVotes}/${data.total}` : '—'
      const c = data.confidence != null ? data.confidence.toFixed(2) : '—'
      text = `Council has decided · ${d.toLowerCase()} · quorum ${q} · confidence ${c}`
      break
    }
    case 'council':
      text = `Council convened · ${(data.verdicts?.length ?? 0)} specialists weighed in`
      break
    case 'sim':
      text = `Simulation · E[value] $${(data.expectedValue ?? 0).toFixed?.(2) ?? data.expectedValue ?? 0}`
      break
    case 'execution':
      text = data.txHash ? `Executed · tx ${short(data.txHash)}` : `Held · no move this cycle`
      break
    case 'reflector':
      text = `Reflector · ${(data.tagged ?? 0)} rules tagged from outcome`
      break
    case 'curator':
      text = `Curator · ${(data.added ?? 0)} rule${(data.added ?? 0) === 1 ? '' : 's'} added`
      break
    case 'bullet':
      text = `Analyzer · ${(data.merged ?? 0)} similar rules merged`
      break
    default:
      text = stage
  }

  return {
    id: `${stage}-${cycleNum}-${at.getTime()}`,
    cycle: cycleNum,
    stage,
    marker: style.marker,
    color: style.color,
    text,
    time: fmtTime(at),
  }
}

const short = (h) => (typeof h === 'string' && h.length > 12 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h)
