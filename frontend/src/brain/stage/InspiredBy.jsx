// frontend/src/brain/stage/InspiredBy.jsx
// Ported from design agent-brain.tsx:638-659. Shared across ~26 stage-card
// expanded bodies — extracted as a primitive rather than duplicated per card.
import { T, mono } from '../tokens.js'

export function InspiredBy({ src }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 10px',
        border: `1px solid ${T.border}`,
        borderRadius: 4,
        ...mono,
        fontSize: 10.5,
        color: T.textFaint,
        marginBottom: 14,
        textTransform: 'lowercase',
      }}
    >
      <span style={{ color: T.textMuted }}>inspired by</span>
      <span style={{ color: T.text }}>{src}</span>
    </div>
  )
}
