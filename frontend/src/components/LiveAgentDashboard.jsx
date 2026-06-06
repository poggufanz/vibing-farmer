// frontend/src/components/LiveAgentDashboard.jsx
// The "return moment" surface. Subscribes to the autonomous loop's stage events and
// shows loop → simulation → council → goal as they happen. Reuses SimulationPlayback.
// Pure presentation over the event stream; the loop is the source of truth.

import React, { useEffect, useState, useRef } from 'react'
import { subscribeLoop, stopAutonomousAgent } from '../agents/agentController.js'
import SimulationFanChart from './SimulationFanChart.jsx'
import CouncilDebateDrawer from './CouncilDebateDrawer.jsx'

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
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [ratify, setRatify] = useState({ active: false, cycleId: null })
  const [history, setHistory] = useState([])
  const [narration, setNarration] = useState('Waiting for the first cycle…')
  const [expanded, setExpanded] = useState(null)
  const decisionSeq = useRef(0)

  useEffect(() => {
    const off = subscribeLoop((e) => {
      const note = (cycleId, n, text, patch = {}) => {
        setNarration(text)
        setHistory((h) => {
          const idx = h.findIndex((c) => c.cycleId === cycleId)
          if (idx === -1) return [{ n, cycleId, stages: [text], ...patch }, ...h].slice(0, 12)
          const next = [...h]
          next[idx] = { ...next[idx], stages: [...next[idx].stages, text], ...patch }
          return next
        })
      }
      switch (e.type) {
        case 'cycle:start': setCycle({ n: e.n, phase: 'fetching' }); note(e.cycleId, e.n, `Cycle #${e.n} — fetching state`); break
        case 'gate': setCycle((c) => ({ ...c, phase: e.pass ? 'simulating' : 'gated' })); note(e.cycleId, undefined, e.pass ? 'Gates passed' : `Gate blocked: ${e.reason}`); break
        case 'sim': setSim(e.timelines); setCycle((c) => ({ ...c, phase: 'deliberating' })); note(e.cycleId, undefined, `Simulated timelines · E[value] $${Number(e.timelines?.expectedValue ?? 0).toFixed(2)}`); break
        case 'council':
          setCouncil(e)
          setCycle((c) => ({ ...c, phase: 'deciding' }))
          decisionSeq.current += 1
          onCouncilDecision?.({
            decision: e.consensus.finalDecision,
            reason: e.verdicts.find((v) => v.decision === e.consensus.finalDecision)?.keyReason ?? '',
            seq: decisionSeq.current,
          })
          note(e.cycleId, undefined, `Council: ${e.consensus.finalDecision} (${e.consensus.executeVotes}/${e.consensus.total})`)
          break
        case 'execute': setCycle((c) => ({ ...c, phase: e.outcome })); note(e.cycleId, undefined, `Outcome: ${e.outcome}`, { outcome: e.outcome }); break
        case 'ratify:request': setRatify({ active: true, cycleId: e.cycleId }); setDrawerOpen(true); break
        case 'ratify:resolved': setRatify({ active: false, cycleId: null }); break
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
          {stopped ? 'Goal reached — agent stopped gracefully.' : narration}
        </div>
        {!stopped && (
          <button onClick={() => stopAutonomousAgent()} style={{ ...mono, marginTop: 10, appearance: 'none', background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: 4, color: 'inherit', padding: '4px 10px', cursor: 'pointer' }}>
            pause agent
          </button>
        )}
      </div>

      {/* SIMULATION */}
      <div style={panel}>
        <div style={head}><span style={title}>Simulation</span>
          <span style={{ ...mono, color: 'var(--text-muted)' }}>{sim ? 'alternate timelines' : 'awaiting first cycle'}</span></div>
        {sim ? <SimulationFanChart timelines={sim} /> : <div style={{ ...mono, color: 'var(--text-muted)', opacity: 0.6 }}>…</div>}
      </div>

      {/* COUNCIL */}
      <div style={panel}>
        <div style={head}>
          <span style={title}>Council</span>
          <span style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
            {council && (
              <button onClick={() => setDrawerOpen(true)} style={{ ...mono, appearance: 'none', background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: 4, color: 'inherit', padding: '2px 7px', cursor: 'pointer' }}>
                view debate
              </button>
            )}
            <span style={{ ...mono, color: council ? DECISION_COLOR[council.consensus.finalDecision] : 'var(--text-muted)' }}>
              {council ? council.consensus.finalDecision : 'idle'}
            </span>
          </span>
        </div>
        {council ? council.verdicts.map((v, i) => (
          <div key={i} style={{ ...mono, display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span style={{ color: 'var(--text-muted)' }}>{v.role}</span>
            <span style={{ color: DECISION_COLOR[v.decision] ?? 'var(--text-muted)' }}>
              {v.decision} ({(v.confidence ?? 0).toFixed(2)})
            </span>
          </div>
        )) : <div style={{ ...mono, color: 'var(--text-muted)', opacity: 0.6 }}>specialists convene once the simulation completes</div>}
      </div>

      {/* CYCLE HISTORY */}
      <div style={panel}>
        <div style={head}><span style={title}>Cycle history</span>
          <span style={{ ...mono, color: 'var(--text-muted)' }}>{history.length} recorded</span></div>
        {history.length === 0 ? (
          <div style={{ ...mono, color: 'var(--text-muted)', opacity: 0.6 }}>cycles appear here as they run</div>
        ) : history.map((c) => (
          <div key={c.cycleId} style={{ borderBottom: '1px solid var(--border)', padding: '6px 0' }}>
            <button onClick={() => setExpanded(expanded === c.cycleId ? null : c.cycleId)}
              style={{ ...mono, width: '100%', textAlign: 'left', appearance: 'none', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
              <span>cycle #{c.n ?? '—'}</span>
              <span style={{ color: c.outcome === 'executed' ? 'var(--ok)' : 'var(--text-muted)' }}>{c.outcome ?? 'running'}</span>
            </button>
            {expanded === c.cycleId && (
              <div style={{ ...mono, color: 'var(--text-muted)', marginTop: 6, paddingLeft: 8, lineHeight: 1.7 }}>
                {c.stages.map((s, i) => <div key={i}>· {s}</div>)}
              </div>
            )}
          </div>
        ))}
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

      <CouncilDebateDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        council={council}
        sim={sim}
        ratify={ratify}
      />
    </div>
  )
}
