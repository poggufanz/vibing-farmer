// frontend/src/brain/stage/Row.jsx
// Ported from design agent-brain.tsx:259-273.
import { T } from '../tokens.js'

export function Row({ children, last }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 0',
        borderBottom: last ? 'none' : `1px solid ${T.border}`,
      }}
    >
      {children}
    </div>
  )
}
