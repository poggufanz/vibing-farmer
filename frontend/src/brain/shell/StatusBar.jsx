// Ported from design/agentdashboard/src/app/components/agent-brain.tsx:2169-2188
import { T, mono } from '../tokens.js'

export function StatusBar({ msg }) {
  return (
    <div
      style={{
        ...mono,
        fontSize: 12,
        color: T.textMuted,
        borderTop: `1px solid ${T.border}`,
        background: T.bgCanvas,
        padding: '10px 28px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: T.accent, flexShrink: 0 }} />
      <span>{msg}</span>
    </div>
  )
}
