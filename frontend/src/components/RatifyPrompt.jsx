// In-app ratify/veto for high-value autonomous moves. No wallet popup. Subscribes to the
// loop's ratify:request, shows a countdown, and resolves via submitRatify. If the countdown
// reaches zero the loop already auto-HOLDs (this UI just reflects it).

import React, { useEffect, useRef, useState } from 'react'
import { subscribeLoop, submitRatify } from '../agents/agentController.js'

const mono = { fontFamily: 'var(--font-mono)', fontSize: 11 }

export default function RatifyPrompt() {
  const [req, setReq] = useState(null)        // { cycleId, moveUsd, deadlineMs }
  const [remaining, setRemaining] = useState(0)
  const tick = useRef(null)

  useEffect(() => {
    const off = subscribeLoop((e) => {
      if (e.type === 'ratify:request') { setReq(e); setRemaining(Math.ceil((e.deadlineMs ?? 15000) / 1000)) }
      if (e.type === 'ratify:resolved') setReq(null)
    }, { replay: true })
    return off
  }, [])

  useEffect(() => {
    if (!req) { if (tick.current) clearInterval(tick.current); return }
    tick.current = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000)
    return () => clearInterval(tick.current)
  }, [req])

  if (!req) return null

  const decide = (approve) => { submitRatify(req.cycleId, approve); setReq(null) }

  return (
    <div role="alertdialog" aria-live="assertive" style={{
      position: 'fixed', right: 24, bottom: 24, zIndex: 80, width: 320,
      background: 'var(--bg-card)', border: '1px solid var(--border-strong)',
      borderLeft: '3px solid var(--accent)', borderRadius: 10, padding: '14px 16px',
      boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
    }}>
      <div style={{ ...mono, color: 'var(--accent)', letterSpacing: '0.04em', marginBottom: 6 }}>
        Council wants to EXECUTE
      </div>
      <div style={{ ...mono, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
        High-value move · ${Number(req.moveUsd).toFixed(2)}. Approve within{' '}
        <strong style={{ color: 'inherit' }}>{remaining}s</strong> or it auto-holds.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => decide(false)}>Veto</button>
        <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => decide(true)}>Approve move</button>
      </div>
    </div>
  )
}
