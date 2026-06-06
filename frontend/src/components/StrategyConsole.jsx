// frontend/src/components/StrategyConsole.jsx
// Goal-first command console — replaces the thin amount+risk card. As inputs settle, it
// asks Venice to draft the multi-agent strategy (worker count, per-vault allocation, blended
// APY) and shows it live. AbortController cancels stale drafts; a local estimate is the
// fallback so the pane is never empty.

import React, { useEffect, useRef, useState } from 'react'
import GoalDefinition from './GoalDefinition.jsx'
import { generateStrategy } from '../venice.js'
import { AUTONOMY_LEVELS } from '../core/autonomyLevel.js'

const mono = { fontFamily: 'var(--font-mono)', fontSize: 11 }
const label = { fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.01em', marginBottom: 4 }
const RISK = [{ id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium' }, { id: 'high', label: 'High' }]
const DRAFT_DEBOUNCE_MS = 600

function localEstimate(amount, risk) {
  const n = risk === 'high' ? 4 : risk === 'low' ? 2 : 3
  const per = amount ? (Number(amount) / n) : 0
  const apy = risk === 'high' ? 11.5 : risk === 'low' ? 5.5 : 8.2
  return { agents: Array.from({ length: n }, (_, i) => ({ id: `worker-${i + 1}`, allocation: per.toFixed(0) })), blendedApy: apy.toFixed(1), estimate: true }
}

export default function StrategyConsole({ amount, setAmount, risk, setRisk, goal, setGoal, autonomyLevel, setAutonomyLevel, onSubmit, valid }) {
  const [draft, setDraft] = useState(null)
  const [drafting, setDrafting] = useState(false)
  const abortRef = useRef(null)

  useEffect(() => {
    if (!amount || Number(amount) <= 0) { setDraft(null); return }
    const handle = setTimeout(async () => {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setDrafting(true)
      try {
        const numVaults = risk === 'high' ? 4 : risk === 'low' ? 2 : 3
        const strat = await generateStrategy({ amount: Number(amount), riskLevel: risk, numVaults, signal: ctrl.signal })
        setDraft({ ...strat, estimate: false })
      } catch (err) {
        if (err?.name !== 'AbortError') setDraft((prev) => prev ?? localEstimate(amount, risk))
      } finally {
        setDrafting(false)
      }
    }, DRAFT_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [amount, risk])

  const shown = draft ?? (amount ? localEstimate(amount, risk) : null)
  const agents = shown?.agents ?? []

  return (
    <section className="card enter">
      <div className="eyebrow">
        <span className="num">01</span>
        <span>AI Strategy · goal-first · autonomous</span>
        <span className="rule" />
        <span>set once</span>
      </div>

      <h1 className="h-display">Set your goal · the swarm farms toward it autonomously.</h1>
      <p className="lede">
        Define the outcome you want, how much to deposit, and how much freedom the agent has.
        The AI drafts the multi-agent strategy live. You grant permission once — no further wallet popups.
      </p>

      <div className="amount-block">
        <div>
          <div className="amount-label">Deposit amount</div>
          <div className="amount-input-row">
            <input type="number" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="USDC Amount" inputMode="decimal" />
            <span className="ticker">USDC</span>
          </div>
        </div>
        <div>
          <div className="amount-label">Risk level</div>
          <div className="risk-row" role="radiogroup">
            {RISK.map((r) => (
              <button key={r.id} type="button" role="radio" aria-checked={risk === r.id}
                className={`risk-opt ${risk === r.id ? 'selected' : ''}`} onClick={() => setRisk(r.id)}>
                <span className="risk-opt-label">{r.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <GoalDefinition goal={goal} onChange={setGoal} />

      <div style={{ marginTop: 18 }}>
        <div style={label}>Autonomy level</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {AUTONOMY_LEVELS.map((l) => (
            <button key={l.id} type="button" onClick={() => setAutonomyLevel(l.id)}
              style={{ textAlign: 'left', appearance: 'none', cursor: 'pointer', borderRadius: 8, padding: '10px 12px',
                background: autonomyLevel === l.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                border: `1px solid ${autonomyLevel === l.id ? 'var(--info)' : 'var(--border)'}`, color: 'inherit' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{l.label}</div>
              <div style={{ ...mono, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>{l.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Live draft preview */}
      <div style={{ marginTop: 18, padding: '14px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span style={{ ...mono, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI strategy draft</span>
          <span style={{ ...mono, color: drafting ? 'var(--info)' : shown?.estimate ? 'var(--text-muted)' : 'var(--ok)' }}>
            {drafting ? 'drafting…' : shown?.estimate ? 'local estimate' : shown ? 'live' : 'enter amount'}
          </span>
        </div>
        {shown ? (
          <>
            <div style={{ ...mono, color: 'var(--text-muted)', marginBottom: 8 }}>
              {agents.length} worker{agents.length > 1 ? 's' : ''} · blended APY {shown.blendedApy ?? '—'}%
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
              {agents.map((a, i) => (
                <div key={a.id ?? i} style={{ ...mono, padding: '8px 10px', background: 'var(--bg-input)', borderRadius: 6 }}>
                  <div style={{ color: 'var(--info)' }}>{a.id ?? `worker-${i + 1}`}</div>
                  <div style={{ color: 'var(--text-muted)', marginTop: 3 }}>{a.allocation ?? a.vault?.name ?? '—'} USDC</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ ...mono, color: 'var(--text-muted)', opacity: 0.6 }}>Enter an amount to see the AI draft your agent swarm.</div>
        )}
      </div>

      <div className="action-row" style={{ marginTop: 18 }}>
        <div className="foot-note"><span className="ai-attribution">● AI · live data</span></div>
        <button className="btn btn-primary btn-lg" disabled={!valid} onClick={onSubmit}>
          Review swarm
        </button>
      </div>
    </section>
  )
}
