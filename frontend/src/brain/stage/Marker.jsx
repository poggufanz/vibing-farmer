// frontend/src/brain/stage/Marker.jsx
// Ported from design agent-brain.tsx:227-257. Four-state visual: idle/running/done/fail.
import { T } from '../tokens.js'

export function Marker({ state }) {
  const color =
    state === 'running' ? T.warn : state === 'done' ? T.ok : state === 'fail' ? T.danger : T.textFaint
  return (
    <span
      aria-hidden
      style={{
        width: 10,
        height: 10,
        borderRadius: 999,
        border: `1px solid ${color}`,
        background: state === 'done' ? color : 'transparent',
        display: 'inline-block',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {state === 'running' && (
        <span
          style={{
            position: 'absolute',
            inset: 2,
            background: color,
            borderRadius: 999,
            animation: 'vf-blink 1.1s ease-in-out infinite',
          }}
        />
      )}
    </span>
  )
}
