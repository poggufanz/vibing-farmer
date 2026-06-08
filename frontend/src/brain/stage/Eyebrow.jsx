// frontend/src/brain/stage/Eyebrow.jsx
// Ported from design agent-brain.tsx:122-155.
import { T, mono } from '../tokens.js'

export function Eyebrow({ num, label, meta, state }) {
  const metaColor = state === 'running' ? T.accent : state === 'done' ? T.ok : T.textMuted
  return (
    <div
      style={{
        ...mono,
        fontSize: 11,
        textTransform: 'lowercase',
        color: T.textMuted,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
      }}
    >
      <span style={{ color: state === 'idle' ? T.textFaint : T.accent }}>{num}</span>
      <span>·</span>
      <span style={{ color: T.text }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: T.border, marginInline: 4 }} />
      <span style={{ color: metaColor }}>{meta}</span>
    </div>
  )
}
