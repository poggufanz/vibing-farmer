// frontend/src/components/CouncilDebateDrawer.jsx
// Full-height slide-over debate room. Renders the latest council verdicts as a staged
// reveal (propose -> critique -> ratify) over REAL data from the loop's council event.
// When a ratify request is active for this cycle, the ratify stage shows Approve/Veto.

import React, { useEffect, useState } from 'react'
import { submitRatify } from '../agents/agentController.js'
import SimulationPlayback from './SimulationPlayback.jsx'

const mono = { fontFamily: 'var(--font-mono)', fontSize: 11 }
const DECISION_COLOR = { EXECUTE: 'var(--ok)', HOLD: 'var(--text-muted)' }
const STAGES = ['propose', 'critique', 'ratify']

function VerdictRow({ v, revealed }) {
  return (
    <div style={{ opacity: revealed ? 1 : 0.15, transition: 'opacity 320ms ease', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ ...mono, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{v.role}</span>
        <span style={{ ...mono, color: DECISION_COLOR[v.decision] ?? 'var(--text-muted)' }}>{v.decision} · {(v.confidence ?? 0).toFixed(2)}</span>
      </div>
      <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>{v.keyReason || '—'}</div>
      {v.citedRules?.length > 0 && (
        <div style={{ ...mono, color: 'var(--info)', opacity: 0.8, marginTop: 4 }}>
          cites {v.citedRules.join(', ')}
        </div>
      )}
    </div>
  )
}

export default function CouncilDebateDrawer({ open, onClose, council, sim, ratify }) {
  const [stageIdx, setStageIdx] = useState(0)

  useEffect(() => {
    if (!open || !council) return
    setStageIdx(0)
    const t1 = setTimeout(() => setStageIdx(1), 900)
    const t2 = setTimeout(() => setStageIdx(2), 1800)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [open, council])

  if (!open) return null

  const verdicts = council?.verdicts ?? []
  const dissent = [...verdicts].sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0))[0]
  const consensus = council?.consensus
  const canRatify = ratify?.active && stageIdx >= 2
  const decide = (approve) => { if (ratify?.cycleId) submitRatify(ratify.cycleId, approve); onClose() }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 70 }} />
      <aside style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px, 92vw)', zIndex: 71,
        background: 'var(--bg-card)', borderLeft: '1px solid var(--border-strong)',
        padding: '20px 22px', overflowY: 'auto', animation: 'yv-drawer-in 260ms cubic-bezier(0.16,1,0.3,1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>AI Council · debate</div>
          <button onClick={onClose} style={{ ...mono, appearance: 'none', background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: 4, color: 'inherit', padding: '3px 8px', cursor: 'pointer' }}>close</button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {STAGES.map((s, i) => (
            <span key={s} style={{ ...mono, padding: '3px 8px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.05em',
              background: i <= stageIdx ? 'var(--info)' : 'var(--bg-input)', color: i <= stageIdx ? '#000' : 'var(--text-muted)' }}>{s}</span>
          ))}
        </div>

        {sim && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...mono, color: 'var(--text-muted)', marginBottom: 6 }}>alternate timelines</div>
            <SimulationPlayback timelines={sim} />
          </div>
        )}

        {verdicts.map((v, i) => <VerdictRow key={i} v={v} revealed={stageIdx >= 0} />)}

        {stageIdx >= 1 && dissent && (
          <div style={{ ...mono, color: 'var(--text-muted)', marginTop: 12, padding: '10px 12px', background: 'var(--bg-input)', borderRadius: 6, lineHeight: 1.6 }}>
            critic · weakest case is <strong style={{ color: 'inherit' }}>{dissent.role}</strong> at {(dissent.confidence ?? 0).toFixed(2)} — {dissent.keyReason}
          </div>
        )}

        {stageIdx >= 2 && consensus && (
          <div style={{ marginTop: 16 }}>
            <div style={{ ...mono, color: DECISION_COLOR[consensus.finalDecision] ?? 'var(--text-muted)', marginBottom: 10 }}>
              consensus · {consensus.finalDecision} ({consensus.executeVotes}/{consensus.total} execute)
            </div>
            {canRatify && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => decide(false)}>Veto</button>
                <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => decide(true)}>Approve move</button>
              </div>
            )}
          </div>
        )}

        <style>{`@keyframes yv-drawer-in { from { transform: translateX(20px); opacity: 0; } to { transform: none; opacity: 1; } }
          @media (prefers-reduced-motion: reduce){ aside{ animation: none !important; } }`}</style>
      </aside>
    </>
  )
}
