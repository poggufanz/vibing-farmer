// AutonomousLoopPanel.jsx
// Step 14 UI seam — surfaces the autonomous rebalance loop (startAutonomousAgent /
// stopAutonomousAgent) in the Agent Dashboard. Matches the existing mono/dark terminal
// aesthetic of AgentDashboard.jsx (CSS variables, 10–11px mono labels, hairline borders).
//
// Design: VARIANCE 4 / MOTION 3 (pulsing status dot) / DENSITY 7 (data-first, tight)

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { startAutonomousAgent, stopAutonomousAgent } from '../agents/agentController.js'

// ─── Style atoms (match AgentDashboard.jsx primitives exactly) ───────────────
const mono = { fontFamily: 'var(--font-mono)', fontSize: 10.5 }
const sectionLabel = {
  fontSize: 11, letterSpacing: '0.01em', textTransform: 'capitalize', fontWeight: 500,
  color: 'var(--text-muted)', marginBottom: 10,
}
const hairline = { borderTop: '1px solid var(--border)', marginTop: 20, paddingTop: 16 }

// ─── Outcome badge colors ────────────────────────────────────────────────────
const OUTCOME_COLOR = {
  executed:     'var(--ok)',
  held:         'var(--text-muted)',
  gate_blocked: 'var(--warn)',
  sim_rejected: 'var(--warn)',
  error:        'var(--danger)',
}

const OUTCOME_LABEL = {
  executed:     'executed',
  held:         'hold',
  gate_blocked: 'gated',
  sim_rejected: 'sim skip',
  error:        'error',
}

function outcomeColor(outcome) {
  return OUTCOME_COLOR[outcome] ?? 'var(--text-muted)'
}
function outcomeLabel(outcome) {
  return OUTCOME_LABEL[outcome] ?? outcome ?? '-'
}

function relTime(ts) {
  if (!ts) return '-'
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

// ─── CSS keyframe injected once ──────────────────────────────────────────────
let _keyframesInjected = false
function ensureKeyframes() {
  if (_keyframesInjected || typeof document === 'undefined') return
  _keyframesInjected = true
  const style = document.createElement('style')
  style.textContent = `
    @keyframes yv-pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.35; }
    }
    @media (prefers-reduced-motion: reduce) {
      .yv-pulse { animation: none !important; }
    }
  `
  document.head.appendChild(style)
}

// ─── StatusDot ───────────────────────────────────────────────────────────────
function StatusDot({ running }) {
  useEffect(() => { ensureKeyframes() }, [])
  return (
    <span
      className={running ? 'yv-pulse' : ''}
      style={{
        display: 'inline-block',
        width: 6, height: 6,
        borderRadius: '50%',
        background: running ? 'var(--ok)' : 'var(--border)',
        animation: running ? 'yv-pulse 2s ease-in-out infinite' : 'none',
        verticalAlign: 'middle',
        marginRight: 6,
        flexShrink: 0,
      }}
    />
  )
}

// ─── CycleLog row ────────────────────────────────────────────────────────────
function CycleRow({ cycle }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '5px 0', borderBottom: '1px solid var(--border)',
      ...mono,
    }}>
      <span style={{ color: outcomeColor(cycle.outcome), width: 52, flexShrink: 0 }}>
        {outcomeLabel(cycle.outcome)}
      </span>
      <span style={{ color: 'var(--text-muted)', flex: 1 }}>
        {cycle.reason ? cycle.reason.slice(0, 48) : cycle.cycleId?.slice(-12) ?? '-'}
      </span>
      <span style={{ color: 'var(--text-muted)', opacity: 0.6, whiteSpace: 'nowrap' }}>
        {relTime(cycle.ts)}
      </span>
    </div>
  )
}

// ─── Main panel ──────────────────────────────────────────────────────────────
export default function AutonomousLoopPanel({ walletAddress, permissionContext }) {
  const [running, setRunning] = useState(false)
  const [cycles, setCycles] = useState([])        // last N cycle results
  const [error, setError] = useState(null)
  const agentRef = useRef(null)

  const addCycle = useCallback((result) => {
    setCycles(prev => [{ ...result, ts: Date.now() }, ...prev].slice(0, 8))
  }, [])

  const handleStart = useCallback(() => {
    if (agentRef.current) return
    setError(null)
    try {
      const agent = startAutonomousAgent({ walletAddress, permissionContext })
      agentRef.current = agent

      // Tap into the loop's runOneCycle to surface cycle results in the UI.
      // We wrap the real runOneCycle to intercept results non-intrusively.
      if (agent?.loop?.runOneCycle) {
        const originalCycle = agent.loop.runOneCycleSafe ?? agent.loop.runOneCycle
        // Monkey-patch a side-channel observer (test-safe because it reads the
        // loop's output without intercepting control flow).
        const _poll = setInterval(async () => {
          if (!agentRef.current) { clearInterval(_poll); return }
          // No direct intercept needed: we'll read decisionLog for updates
          if (agent.decisionLog?.all) {
            const all = agent.decisionLog.all()
            if (all.length > 0) {
              const last = all[all.length - 1]
              setCycles(prev => {
                // Avoid duplicates by checking ts
                if (prev[0]?.id === last.id) return prev
                const outcome = last.type === 'rebalance' ? 'executed'
                  : last.type === 'hold' ? 'held'
                  : last.type
                return [{ ...last, outcome, ts: last.timestamp ?? Date.now() }, ...prev].slice(0, 8)
              })
            }
          }
        }, 10_000)
        agentRef.current._poll = _poll
      }

      setRunning(true)
    } catch (err) {
      setError(err.message)
    }
  }, [walletAddress, permissionContext])

  const handleStop = useCallback(() => {
    if (agentRef.current?._poll) clearInterval(agentRef.current._poll)
    stopAutonomousAgent()
    agentRef.current = null
    setRunning(false)
  }, [])

  // Cleanup on unmount
  useEffect(() => () => {
    if (agentRef.current?._poll) clearInterval(agentRef.current._poll)
    if (running) stopAutonomousAgent()
  }, [running])

  const lastCycle = cycles[0]

  return (
    <div style={hairline}>
      {/* Section header */}
      <div style={sectionLabel}>autonomous loop</div>

      {/* Status row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', flex: 1, ...mono }}>
          <StatusDot running={running} />
          <span style={{ color: running ? 'var(--ok)' : 'var(--text-muted)' }}>
            {running ? 'running' : 'idle'}
          </span>
          {lastCycle && (
            <span style={{ marginLeft: 12, color: 'var(--text-muted)', opacity: 0.7 }}>
              last: <span style={{ color: outcomeColor(lastCycle.outcome) }}>
                {outcomeLabel(lastCycle.outcome)}
              </span> {relTime(lastCycle.ts)}
            </span>
          )}
        </div>

        {/* Start / Stop toggle */}
        <button
          onClick={running ? handleStop : handleStart}
          disabled={!walletAddress}
          style={{
            appearance: 'none',
            border: `1px solid ${running ? 'var(--danger)' : 'var(--ok)'}`,
            background: 'transparent',
            color: running ? 'var(--danger)' : 'var(--ok)',
            ...mono, fontSize: 10, letterSpacing: '0.06em',
            padding: '4px 10px', borderRadius: 3, cursor: 'pointer',
            textTransform: 'uppercase',
            transition: 'opacity 0.15s ease',
            opacity: !walletAddress ? 0.4 : 1,
          }}
          title={!walletAddress ? 'Connect wallet first' : running ? 'Stop loop' : 'Start loop'}
        >
          {running ? 'stop' : 'start'}
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div style={{ ...mono, color: 'var(--danger)', marginBottom: 10, fontSize: 10 }}>
          {error}
        </div>
      )}

      {/* No wallet prompt */}
      {!walletAddress && (
        <div style={{ ...mono, color: 'var(--text-muted)', fontSize: 10, marginBottom: 10 }}>
          connect wallet to enable autonomous rebalancing
        </div>
      )}

      {/* Recent cycles */}
      {cycles.length > 0 && (
        <div>
          <div style={{ ...mono, fontSize: 10, color: 'var(--text-muted)', opacity: 0.6, marginBottom: 4 }}>
            recent cycles
          </div>
          {cycles.map((c, i) => (
            <CycleRow key={`${c.id ?? i}-${c.ts}`} cycle={c} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {cycles.length === 0 && running && (
        <div style={{ ...mono, fontSize: 10, color: 'var(--text-muted)', opacity: 0.6 }}>
          first cycle in ~30 min
        </div>
      )}
    </div>
  )
}
