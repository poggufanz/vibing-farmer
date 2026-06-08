// Ported from design/agentdashboard/src/app/components/agent-brain.tsx:2191-2311, 2680-2960
//
// ConfirmModal is reframed from the design source: the design used numeric
// `branches`/`workers` steppers, but this project's real engine runs fixed
// bull/base/bear simulations and has no configurable worker count — the
// analogous real concept is the council's 3 fixed specialist roles, each
// independently toggleable. So the modal body is 3 specialist on/off toggles
// instead of numeric steppers, and the scope-table rows that referenced the
// old numeric values describe the fixed-simulation / specialist-count reality
// instead. `Stepper` remains a clean, reusable, exported control — it's simply
// not wired into this modal.
import { T, mono, geist } from './tokens.js'

export const STATUS_MSGS = [
  'Pipeline idle · press Start to begin cycle #1284',
  'Worker 2 is waiting for swap confirmation on Aave v3 · tx 0x9f3…a124',
  'Council reaching quorum on cycle #1284 · 2/3 stances locked',
  'Venice AI returning Base scenario · 412ms',
  'Worker 1 deposit confirmed · 40 USDC → MockVault',
]

export function RunControl({ cycleState, activeIdx, total, cycleNum, onStart, onStop }) {
  const progress = cycleState === 'running' ? Math.round(((activeIdx + 1) / total) * 100) : 0
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '22px 28px',
        borderBottom: `1px solid ${T.border}`,
        background: T.bgCanvas,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ ...mono, fontSize: 11, color: T.textFaint, textTransform: 'lowercase' }}>
          run · cycle #{cycleNum}
        </span>
        <span style={{ ...geist, fontSize: 14, color: T.text }}>
          {cycleState === 'idle'
            ? 'Pipeline idle · 8 stages queued · autonomous when started'
            : `Stage ${String(activeIdx + 1).padStart(2, '0')} of ${String(total).padStart(2, '0')} running · autonomous loop`}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ width: 160, height: 4, background: T.bgElev, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${progress}%`, height: '100%', background: T.accent, transition: 'width 300ms ease-out' }} />
        </div>
        <span style={{ ...mono, fontSize: 12, color: T.textMuted, width: 44, textAlign: 'right' }}>
          {progress}%
        </span>
        {cycleState === 'idle' && (
          <button
            onClick={onStart}
            style={{
              ...geist,
              fontSize: 14,
              fontWeight: 500,
              padding: '11px 22px',
              background: T.accent,
              color: T.accentFg,
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Start cycle
          </button>
        )}
        {cycleState === 'running' && (
          <button
            onClick={onStop}
            style={{
              ...geist,
              fontSize: 14,
              fontWeight: 500,
              padding: '11px 22px',
              background: 'transparent',
              color: T.text,
              border: `1px solid ${T.borderStrong}`,
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 2, background: T.danger, animation: 'vf-blink 1.1s ease-in-out infinite' }} />
            Stop
          </button>
        )}
      </div>
    </div>
  )
}

export function Stepper({ label, hint, value, min, max, onChange }) {
  const dec = () => onChange(Math.max(min, value - 1))
  const inc = () => onChange(Math.min(max, value + 1))
  const btn = (disabled) => ({
    ...mono,
    fontSize: 14,
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    color: disabled ? T.textFaint : T.text,
    border: `1px solid ${T.border}`,
    borderRadius: 6,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
  })
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, background: T.bgElev }}>
      <div style={{ ...mono, fontSize: 11, color: T.textFaint, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <button onClick={dec} disabled={value <= min} style={btn(value <= min)} aria-label={`decrease ${label}`}>
          −
        </button>
        <span style={{ ...mono, fontSize: 18, color: T.text, minWidth: 28, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </span>
        <button onClick={inc} disabled={value >= max} style={btn(value >= max)} aria-label={`increase ${label}`}>
          +
        </button>
      </div>
      <div style={{ ...mono, fontSize: 10.5, color: T.textFaint, lineHeight: 1.4 }}>{hint}</div>
    </div>
  )
}

const SPECIALISTS = [
  { key: 'riskAuditor', label: 'risk auditor', note: 'flags drawdown + correlation risk before execution' },
  { key: 'gasChecker', label: 'gas checker', note: 'rejects moves where gas erodes expected value' },
  { key: 'strategyGuard', label: 'strategy guard', note: 'enforces playbook rules + cited precedent' },
]

export function ConfirmModal({ open, cycleNum = 1, specialists, onToggleSpecialist, onConfirm, onCancel }) {
  if (!open) return null
  const activeCount = SPECIALISTS.filter((s) => specialists?.[s.key]).length
  const scope = [
    { k: 'loop.mode', v: 'autonomous · continuous', note: 'runs until you click stop' },
    { k: 'simulation', v: 'venice.ai · bull · base · bear', note: '3 fixed scenario branches per cycle' },
    { k: 'council', v: `${activeCount} of 3 specialists active`, note: 'quorum 2/3 · toggle below' },
    { k: 'memory.writes', v: 'auto-promote', note: 'rules + patterns curated post-cycle' },
    { k: 'stop.control', v: 'user · anytime', note: 'halts after current stage settles' },
  ]
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        animation: 'vf-fadein 140ms ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          maxWidth: 'calc(100% - 48px)',
          background: T.bgCard,
          border: `1px solid ${T.borderStrong}`,
          borderRadius: 18,
          padding: 28,
          animation: 'vf-slideup 180ms ease-out',
        }}
      >
        <div style={{ ...mono, fontSize: 11, color: T.textMuted, textTransform: 'lowercase', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: T.accent }}>00</span>
          <span>·</span>
          <span style={{ color: T.text }}>confirm autonomous run</span>
          <span style={{ flex: 1, height: 1, background: T.border, marginInline: 4 }} />
          <span>cycle #{cycleNum}</span>
        </div>

        <h2 style={{ ...geist, fontSize: 22, fontWeight: 500, color: T.text, margin: '16px 0 8px', letterSpacing: '-0.02em' }}>
          Mulai loop autonomous?
        </h2>
        <p style={{ ...geist, fontSize: 14, color: T.textMuted, lineHeight: 1.55, margin: 0, maxWidth: 460 }}>
          Agent bakal jalanin simulation, council deliberation, dan eksekusi verdict secara
          continuous. Loop gak berhenti sampe kamu klik stop.
        </p>

        <div style={{ marginTop: 22, border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {SPECIALISTS.map((s, i) => {
            const on = !!specialists?.[s.key]
            return (
              <button
                key={s.key}
                onClick={() => onToggleSpecialist(s.key)}
                aria-pressed={on}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  display: 'grid',
                  gridTemplateColumns: '150px 1fr auto',
                  gap: 12,
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '12px 14px',
                  borderBottom: i === SPECIALISTS.length - 1 ? 'none' : `1px solid ${T.border}`,
                  background: i % 2 === 0 ? 'transparent' : T.bgElev,
                }}
              >
                <span style={{ ...mono, fontSize: 11, color: T.textFaint }}>{s.key}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ ...mono, fontSize: 12, color: T.text }}>{s.label}</span>
                  <span style={{ ...mono, fontSize: 11, color: T.textFaint }}>{s.note}</span>
                </div>
                <span style={{ ...mono, fontSize: 11, color: on ? T.ok : T.textFaint }}>{on ? 'on' : 'off'}</span>
              </button>
            )
          })}
        </div>

        <div style={{ marginTop: 14, border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {scope.map((r, i) => (
            <div
              key={r.k}
              style={{
                display: 'grid',
                gridTemplateColumns: '150px 1fr',
                gap: 12,
                padding: '12px 14px',
                borderBottom: i === scope.length - 1 ? 'none' : `1px solid ${T.border}`,
                background: i % 2 === 0 ? 'transparent' : T.bgElev,
              }}
            >
              <span style={{ ...mono, fontSize: 11, color: T.textFaint }}>{r.k}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ ...mono, fontSize: 12, color: T.text }}>{r.v}</span>
                <span style={{ ...mono, fontSize: 11, color: T.textFaint }}>{r.note}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
          <span style={{ ...mono, fontSize: 11, color: T.textFaint }}>
            scope locked by erc-7715 · revocable
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onCancel}
              style={{ ...geist, fontSize: 14, fontWeight: 500, padding: '11px 18px', background: 'transparent', color: T.textMuted, border: `1px solid ${T.border}`, borderRadius: 8, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              style={{ ...geist, fontSize: 14, fontWeight: 500, padding: '11px 22px', background: T.accent, color: T.accentFg, border: 'none', borderRadius: 8, cursor: 'pointer' }}
            >
              Authorize & start
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
