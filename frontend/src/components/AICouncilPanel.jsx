// RightRail module — replaces the activity log DURING and AFTER execution.
// Shows AI council thinking log + "View Simulation" toggle with animated playback.

import React, { useState } from 'react'
import SimulationPlayback from './SimulationPlayback.jsx'

const mono = { fontFamily: 'var(--font-mono)', fontSize: 10.5 }
const DECISION_COLOR = { EXECUTE: 'var(--ok)', HOLD: 'var(--text-muted)' }

export default function AICouncilPanel({ narration, loading }) {
  const [showSim, setShowSim] = useState(false)
  const n = narration

  return (
    <div className="panel" style={{ borderBottom: 'none', flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="panel-head">
        <div className="panel-title">AI Council</div>
        <span className="panel-meta">
          {loading ? 'reasoning…' : n?.fallback ? 'fallback' : n?.consensus ? n.consensus.finalDecision.toLowerCase() : 'idle'}
        </span>
      </div>

      {!n && !loading && <div className="empty">Council reasoning appears during execution</div>}

      {loading && !n && (
        <div style={{ ...mono, color: 'var(--text-muted)' }}>Convening risk / gas / strategy specialists…</div>
      )}

      {n && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: 10 }}>
            {n.thinkingLog.map((line, i) => (
              <div key={i} style={{ ...mono, padding: '3px 0', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <span style={{ opacity: 0.4, marginRight: 6 }}>›</span>{line.text}
              </div>
            ))}
          </div>

          {n.consensus && (
            <div style={{ ...mono, marginBottom: 8 }}>
              consensus:{' '}
              <span style={{ color: DECISION_COLOR[n.consensus.finalDecision] }}>
                {n.consensus.finalDecision}
              </span>{' '}
              <span style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
                ({n.consensus.executeVotes}/{n.consensus.total})
              </span>
            </div>
          )}

          <button className="btn btn-ghost" style={{ ...mono, padding: '5px 10px' }} onClick={() => setShowSim((v) => !v)}>
            {showSim ? 'Hide simulation ▴' : 'View simulation ▾'}
          </button>

          {showSim && n.timelines && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <SimulationPlayback timelines={n.timelines} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
