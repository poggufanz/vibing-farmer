// frontend/src/brain/stage/Narrative.jsx
// Ported from design agent-brain.tsx:661-676. Shared across ~26 stage-card
// expanded bodies — extracted as a primitive rather than duplicated per card.
import { T, geist } from '../tokens.js'

export function Narrative({ children }) {
  return (
    <p
      style={{
        ...geist,
        fontSize: 14,
        color: T.textMuted,
        lineHeight: 1.6,
        maxWidth: 580,
        margin: '0 0 18px',
      }}
    >
      {children}
    </p>
  )
}
