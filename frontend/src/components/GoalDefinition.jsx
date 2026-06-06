// frontend/src/components/GoalDefinition.jsx
// Goal-first inputs shown in the configure step. durationCycles is required (always a
// target); target APY and profit are optional. Mirrors the existing dark/mono aesthetic.

import React from 'react'
import { normalizeGoal } from '../goal/goalConfig.js'

const label = { fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.01em', marginBottom: 4 }
const input = { background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 6, color: 'inherit', font: 'inherit', fontSize: 13, padding: '8px 10px', width: '100%' }

export default function GoalDefinition({ goal, onChange }) {
  const g = normalizeGoal(goal || {})
  const set = (patch) => onChange(normalizeGoal({ ...g, ...patch }))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 16 }}>
      <div style={{ gridColumn: '1 / -1', fontSize: 13, fontWeight: 600 }}>Define your goal</div>

      <div>
        <div style={label}>Target APY (optional)</div>
        <input style={input} type="number" min="0" step="0.1" placeholder="e.g. 8"
          value={g.targetApyPct ?? ''} onChange={(e) => set({ targetApyPct: e.target.value })} />
      </div>

      <div>
        <div style={label}>Target profit USD (optional)</div>
        <input style={input} type="number" min="0" step="1" placeholder="e.g. 25"
          value={g.targetProfitUsd ?? ''} onChange={(e) => set({ targetProfitUsd: e.target.value })} />
      </div>

      <div style={{ gridColumn: '1 / -1' }}>
        <div style={label}>Run for (cycles) — the agent stops when this is reached</div>
        <input style={input} type="number" min="1" step="1"
          value={g.durationCycles} onChange={(e) => set({ durationCycles: e.target.value })} />
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', opacity: 0.7, marginTop: 4 }}>
          The agent runs loop → simulation → council each cycle and stops when every target you set is met.
        </div>
      </div>
    </div>
  )
}
