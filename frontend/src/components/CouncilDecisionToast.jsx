// frontend/src/components/CouncilDecisionToast.jsx
// Transient "Council has decided: …" notification. Rendered by app.jsx with the latest
// council consensus; auto-dismisses after a few seconds. Honors reduced-motion.

import React, { useEffect, useState } from 'react'

const mono = { fontFamily: 'var(--font-mono)', fontSize: 11 }
const DECISION_COLOR = { EXECUTE: 'var(--ok)', HOLD: 'var(--text-muted)' }

export default function CouncilDecisionToast({ decision, reason, seq, durationMs = 4200 }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!decision) return
    setShow(true)
    const id = setTimeout(() => setShow(false), durationMs)
    return () => clearTimeout(id)
  }, [seq, decision, durationMs])

  if (!show || !decision) return null
  return (
    <div role="status" aria-live="polite" style={{
      position: 'fixed', right: 24, bottom: 24, zIndex: 60, maxWidth: 340,
      background: 'var(--bg-card)', border: '1px solid var(--border-strong)',
      borderLeft: `3px solid ${DECISION_COLOR[decision] ?? 'var(--info)'}`,
      borderRadius: 8, padding: '12px 14px', boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
      animation: 'yv-toast-in 240ms cubic-bezier(0.16,1,0.3,1)',
    }}>
      <div style={{ ...mono, color: DECISION_COLOR[decision] ?? 'var(--info)', marginBottom: 4, letterSpacing: '0.03em' }}>
        🔔 Council has decided: {decision}
      </div>
      {reason && <div style={{ ...mono, color: 'var(--text-muted)', lineHeight: 1.5 }}>{reason}</div>}
      <style>{`@keyframes yv-toast-in { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform:none; } }
        @media (prefers-reduced-motion: reduce){ [role=status]{ animation: none !important; } }`}</style>
    </div>
  )
}
