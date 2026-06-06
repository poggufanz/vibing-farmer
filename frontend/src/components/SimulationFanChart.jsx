// frontend/src/components/SimulationFanChart.jsx
// Alternate-timeline fan chart. Three scenarios fan out from t0 (current value, $0 delta)
// to their projected 7-day net yields; the shaded band is the bull..bear spread = risk made
// visible. Pure SVG, no deps. Honors reduced-motion via CSS.

import React from 'react'

const mono = { fontFamily: 'var(--font-mono)', fontSize: 10 }
const W = 420, H = 160, PAD = 28

function yScale(v, min, max) {
  if (max === min) return H / 2
  return H - PAD - ((v - min) / (max - min)) * (H - PAD * 2)
}

export default function SimulationFanChart({ timelines }) {
  const t = timelines ?? {}
  const bull = Number(t.bull ?? 0), base = Number(t.base ?? 0), bear = Number(t.bear ?? 0)
  const ev = Number(t.expectedValue ?? 0)
  const w = t.weights ?? { bull: 0.33, base: 0.34, bear: 0.33 }

  const vals = [0, bull, base, bear, ev]
  const min = Math.min(...vals), max = Math.max(...vals)
  const x0 = PAD, x1 = W - PAD
  const y0 = yScale(0, min, max)
  const yb = (v) => yScale(v, min, max)

  const path = (v) => `M ${x0} ${y0} L ${x1} ${yb(v)}`
  const band = `M ${x0} ${y0} L ${x1} ${yb(bull)} L ${x1} ${yb(bear)} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Simulation fan chart"
      style={{ display: 'block' }}>
      <line x1={x0} y1={y0} x2={x1} y2={y0} stroke="var(--border)" strokeDasharray="3 3" />
      <path d={band} fill="var(--ok)" opacity="0.08" />
      <path d={path(bull)} stroke="var(--ok)" strokeWidth="1.5" fill="none" />
      <path d={path(base)} stroke="var(--info)" strokeWidth="1.5" fill="none" />
      <path d={path(bear)} stroke="var(--text-muted)" strokeWidth="1.5" fill="none" />
      <circle cx={x1} cy={yb(ev)} r="3.5" fill="var(--info)" />

      <text x={x1 + 2} y={yb(bull)} style={mono} fill="var(--ok)" dominantBaseline="middle">bull ${bull.toFixed(1)} ({(w.bull * 100).toFixed(0)}%)</text>
      <text x={x1 + 2} y={yb(base)} style={mono} fill="var(--info)" dominantBaseline="middle">base ${base.toFixed(1)} ({(w.base * 100).toFixed(0)}%)</text>
      <text x={x1 + 2} y={yb(bear)} style={mono} fill="var(--text-muted)" dominantBaseline="middle">bear ${bear.toFixed(1)} ({(w.bear * 100).toFixed(0)}%)</text>
      <text x={x0} y={H - 6} style={mono} fill="var(--text-muted)">now</text>
      <text x={(x0 + x1) / 2} y={14} style={{ ...mono, fontSize: 11 }} fill="var(--info)" textAnchor="middle">E[value] ${ev.toFixed(2)}</text>
    </svg>
  )
}
