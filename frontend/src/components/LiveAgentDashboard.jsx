// frontend/src/components/LiveAgentDashboard.jsx
// The "return moment" surface. Subscribes to the autonomous loop's stage events and
// shows loop → simulation → council → goal as they happen. Reuses SimulationPlayback.
// Pure presentation over the event stream; the loop is the source of truth.

import React, { useEffect, useState, useRef } from 'react'
import { subscribeLoop } from '../agents/agentController.js'
import SimulationPlayback from './SimulationPlayback.jsx'

const mono = { fontFamily: 'var(--font-mono)', fontSize: 10.5 }
const panel = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }
const head = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }
const title = { fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }
const DECISION_COLOR = { EXECUTE: 'var(--ok)', HOLD: 'var(--text-muted)' }

function Bar({ pct }) {
  return (
    <div style={{ height: 8, background: 'var(--bg-input)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: 'var(--ok)', transition: 'width 400ms cubic-bezier(0.16,1,0.3,1)' }} />
    </div>
  )
}

export default function LiveAgentDashboard({ goal, onCouncilDecision }) {
  const [cycle, setCycle] = useState({ n: 0, phase: 'idle' })
  const [sim, setSim] = useState(null)
  const [council, setCouncil] = useState(null)
  const [progress, setProgress] = useState(null)
  const [stopped, setStopped] = useState(null)
  const decisionSeq = useRef(0)

  useEffect(() => {
    const off = subscribeLoop((e) => {
      switch (e.type) {
        case 'cycle:start': setCycle({ n: e.n, phase: 'fetching' }); break
        case 'gate': setCycle((c) => ({ ...c, phase: e.pass ? 'simulating' : 'gated' })); break
        case 'sim': setSim(e.timelines); setCycle((c) => ({ ...c, phase: 'deliberating' })); break
        case 'council':
          setCouncil(e)
          setCycle((c) => ({ ...c, phase: 'deciding' }))
          decisionSeq.current += 1
          onCouncilDecision?.({
            decision: e.consensus.finalDecision,
            reason: e.verdicts.find((v) => v.decision === e.consensus.finalDecision)?.keyReason ?? '',
            seq: decisionSeq.current,
          })
          break
        case 'execute': setCycle((c) => ({ ...c, phase: e.outcome })); break
        case 'goal': setProgress(e); break
        case 'cycle:end': setCycle((c) => ({ ...c, phase: 'waiting' })); break
        case 'stopped': setStopped(e.reason); break
        default: break
      }
    }, { replay: true })
    return off
  }, [onCouncilDecision])

  const gp = progress ?? null

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 820, margin: '0 auto', width: '100%' }}>
      {/* LOOP */}
      <div style={panel}>
        <div style={head}>
          <span style={title}>Loop</span>
          <span style={{ ...mono, color: stopped ? 'var(--text-muted)' : 'var(--ok)' }}>
            {stopped ? `stopped · ${stopped}` : `cycle #${cycle.n} · ${cycle.phase}`}
          </span>
        </div>
        <div style={{ ...mono, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {stopped ? 'Goal reached — agent stopped gracefully.' : 'Running loop → simulation → council each cycle. No action needed.'}
        </div>
      </div>

      {/* SIMULATION */}
      <div style={panel}>
        <div style={head}><span style={title}>Simulation</span>
          <span style={{ ...mono, color: 'var(--text-muted)' }}>{sim ? 'alternate timelines' : 'awaiting first cycle'}</span></div>
        {sim ? <SimulationPlayback timelines={sim} /> : <div style={{ ...mono, color: 'var(--text-muted)', opacity: 0.6 }}>…</div>}
      </div>

      {/* COUNCIL */}
      <div style={panel}>
        <div style={head}><span style={title}>Council</span>
          <span style={{ ...mono, color: council ? DECISION_COLOR[council.consensus.finalDecision] : 'var(--text-muted)' }}>
            {council ? council.consensus.finalDecision : 'idle'}
          </span></div>
        {council ? council.verdicts.map((v, i) => (
          <div key={i} style={{ ...mono, display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span style={{ color: 'var(--text-muted)' }}>{v.role}</span>
            <span style={{ color: DECISION_COLOR[v.decision] ?? 'var(--text-muted)' }}>
              {v.decision} ({(v.confidence ?? 0).toFixed(2)})
            </span>
          </div>
        )) : <div style={{ ...mono, color: 'var(--text-muted)', opacity: 0.6 }}>specialists convene once the simulation completes</div>}
      </div>

      {/* GOAL */}
      <div style={panel}>
        <div style={head}><span style={title}>Goal</span>
          <span style={{ ...mono, color: gp?.met ? 'var(--ok)' : 'var(--text-muted)' }}>{gp ? `${gp.progressPct}%` : '0%'}</span></div>
        <Bar pct={gp?.progressPct ?? 0} />
        <div style={{ ...mono, color: 'var(--text-muted)', marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {gp?.axes?.duration && <span>cycles {gp.axes.duration.current}/{gp.axes.duration.target}</span>}
          {gp?.axes?.apy && <span>apy {gp.axes.apy.current?.toFixed?.(1)}/{gp.axes.apy.target}%</span>}
          {gp?.axes?.profit && <span>profit ${gp.axes.profit.current?.toFixed?.(2)}/{gp.axes.profit.target}</span>}
        </div>
      </div>
    </div>
  )
}
