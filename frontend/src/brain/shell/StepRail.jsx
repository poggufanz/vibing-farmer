// Ported from design/agentdashboard/src/app/components/agent-brain.tsx:2104-2141
// `st` is derived from an `activeStep` prop instead of hardcoded, so the
// container can drive which macro step is active.
import { T, mono, geist } from '../tokens.js'

const ORDER = ['strategy', 'connect', 'skills', 'permission', 'execute', 'done']
const LABELS = [
  { n: '01', l: 'AI Strategy', id: 'strategy' },
  { n: '02', l: 'Connect & Upgrade', id: 'connect' },
  { n: '03', l: 'Review Skills', id: 'skills' },
  { n: '04', l: 'Grant', id: 'permission' },
  { n: '05', l: 'Auto-Execute', id: 'execute' },
  { n: '06', l: 'Complete', id: 'done' },
]

export function StepRail({ activeStep = 'execute' }) {
  const activeIdx = ORDER.indexOf(activeStep)
  const steps = LABELS.map((s, i) => ({ ...s, st: i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'idle' }))
  return (
    <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, padding: '0 22px' }}>
      {steps.map((s) => {
        const isActive = s.st === 'active'
        const isDone = s.st === 'done'
        const numColor = isActive ? T.accent : isDone ? T.textMuted : T.textFaint
        const textColor = isActive ? T.text : isDone ? T.textMuted : T.textFaint
        return (
          <div
            key={s.n}
            style={{
              padding: '14px 18px',
              borderBottom: isActive ? `1px solid ${T.accent}` : '1px solid transparent',
              marginBottom: -1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              ...mono,
              fontSize: 11,
            }}
          >
            <span style={{ color: numColor }}>{s.n}</span>
            <span style={{ ...geist, fontSize: 12, color: textColor }}>{s.l}</span>
          </div>
        )
      })}
    </div>
  )
}
