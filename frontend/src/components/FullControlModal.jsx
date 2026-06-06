// frontend/src/components/FullControlModal.jsx
// Warning gate before enabling "Full Control" autonomy. Confirm escalates the scope
// (drops whitelist, removes approval ceiling, zeroes cooldown) at next grant.

import React from 'react'

const mono = { fontFamily: 'var(--font-mono)', fontSize: 12 }

export default function FullControlModal({ open, onCancel, onConfirm }) {
  if (!open) return null
  return (
    <div role="dialog" aria-modal="true" style={{
      position: 'fixed', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center',
      background: 'rgba(0,0,0,0.55)',
    }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 'min(460px, 92vw)', background: 'var(--bg-card)', border: '1px solid var(--danger)',
        borderRadius: 12, padding: 22,
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--danger)', marginBottom: 10 }}>Enable Full Control?</div>
        <div style={{ ...mono, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 16 }}>
          By enabling Full Control, the agent can:
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            <li>Interact with any protocol — not just your whitelist</li>
            <li>Execute moves up to your granted allowance with no per-move approval</li>
            <li>Rebalance with no cooldown between cycles</li>
          </ul>
          <div style={{ marginTop: 10 }}>This removes safety guardrails. It takes effect at your next permission grant.</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={onCancel} style={{ flex: 1 }}>Cancel</button>
          <button className="btn" onClick={onConfirm} style={{ flex: 1, borderColor: 'var(--danger)', color: 'var(--danger)' }}>
            I understand, enable
          </button>
        </div>
      </div>
    </div>
  )
}
