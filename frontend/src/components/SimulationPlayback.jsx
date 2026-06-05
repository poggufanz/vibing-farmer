// Animated "alternate timeline" simulator. Plays bull/base/bear 7-day net-yield
// curves progressively (day 1 -> day 7). Pure SVG + a single rAF ticker.
// Honors reduced-motion (jumps to end).

import React, { useEffect, useRef, useState } from 'react'

const mono = { fontFamily: 'var(--font-mono)', fontSize: 10.5 }
const DAYS = 7
const PLAY_MS = 2600
const HOLD_MS = 4000
const LINES = [
  { key: 'bull', color: 'var(--ok)' },
  { key: 'base', color: 'var(--info)' },
  { key: 'bear', color: 'var(--danger)' },
]

const W = 240, H = 90, PAD = 8

function prefersReducedMotion() {
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
}

function curve(finalValue, shape) {
  const pts = []
  for (let d = 0; d <= DAYS; d++) {
    const x = d / DAYS
    const ease = shape === 'bull' ? Math.pow(x, 0.7)
      : shape === 'bear' ? Math.pow(x, 1.4)
      : x
    pts.push(finalValue * ease)
  }
  return pts
}

function toPath(values, minV, maxV) {
  const span = (maxV - minV) || 1
  return values.map((v, i) => {
    const x = PAD + (i / DAYS) * (W - 2 * PAD)
    const y = (H - PAD) - ((v - minV) / span) * (H - 2 * PAD)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

export default function SimulationPlayback({ timelines }) {
  const t = timelines || { bull: 0, base: 0, bear: 0, weights: {}, expectedValue: 0 }
  const series = LINES.map((l) => ({ ...l, values: curve(t[l.key] ?? 0, l.key) }))
  const allV = series.flatMap((s) => s.values).concat(0)
  const minV = Math.min(...allV), maxV = Math.max(...allV)

  const [progress, setProgress] = useState(0)
  const rafRef = useRef(0)

  useEffect(() => {
    if (prefersReducedMotion()) { setProgress(1); return }
    let start = null, holding = false, holdStart = 0
    const tick = (ts) => {
      if (start === null) start = ts
      if (holding) {
        if (ts - holdStart >= HOLD_MS) { start = ts; holding = false; setProgress(0) }
        else { rafRef.current = requestAnimationFrame(tick); return }
      } else {
        const p = Math.min(1, (ts - start) / PLAY_MS)
        setProgress(p)
        if (p >= 1) { holding = true; holdStart = ts }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [t.bull, t.base, t.bear])

  const visibleDay = Math.round(progress * DAYS)

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ ...mono, color: 'var(--text-muted)', opacity: 0.6, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
        <span>simulating alternate timelines</span>
        <span>day {visibleDay}/{DAYS}</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Alternate timeline simulation">
        <line x1={PAD} y1={(H - PAD) - ((0 - minV) / ((maxV - minV) || 1)) * (H - 2 * PAD)}
              x2={W - PAD} y2={(H - PAD) - ((0 - minV) / ((maxV - minV) || 1)) * (H - 2 * PAD)}
              stroke="var(--border)" strokeWidth="0.75" strokeDasharray="2 2" />
        {series.map((s) => {
          const full = toPath(s.values, minV, maxV)
          return (
            <path key={s.key} d={full} fill="none" stroke={s.color} strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round"
                  pathLength="1"
                  style={{
                    strokeDasharray: 1,
                    strokeDashoffset: 1 - progress,
                    transition: 'none',
                    opacity: 0.4 + 0.6 * progress,
                  }} />
          )
        })}
        {series.map((s) => {
          const i = visibleDay
          const span = (maxV - minV) || 1
          const x = PAD + (i / DAYS) * (W - 2 * PAD)
          const y = (H - PAD) - (((s.values[i] ?? 0) - minV) / span) * (H - 2 * PAD)
          return <circle key={`d-${s.key}`} cx={x} cy={y} r="2" fill={s.color} style={{ opacity: progress }} />
        })}
      </svg>

      <div style={{ marginTop: 6 }}>
        {series.map((s) => {
          const live = (s.values[visibleDay] ?? 0)
          return (
            <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', ...mono }}>
              <span style={{ textTransform: 'capitalize', color: 'var(--text-muted)' }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: s.color, marginRight: 6 }} />
                {s.key}{t.weights?.[s.key] != null ? ` · ${(t.weights[s.key] * 100).toFixed(0)}%` : ''}
              </span>
              <span style={{ color: live >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
                {live >= 0 ? '+' : ''}${live.toFixed(2)}
              </span>
            </div>
          )
        })}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)', ...mono }}>
          <span style={{ fontWeight: 600 }}>expected value</span>
          <span style={{ fontWeight: 600, color: (t.expectedValue ?? 0) >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
            ${((t.expectedValue ?? 0) * progress).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  )
}
