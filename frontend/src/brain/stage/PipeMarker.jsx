// frontend/src/brain/stage/PipeMarker.jsx
// Ported from design agent-brain.tsx:49-120 (left-gutter pipeline marker).
import { T, mono } from '../tokens.js'

export function PipeMarker({ state, num, first, last }) {
  const color = state === 'running' ? T.accent : state === 'done' ? T.text : T.textFaint
  return (
    <div
      style={{
        width: 56,
        position: 'relative',
        flexShrink: 0,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: first ? 30 : 0,
          bottom: last ? 'calc(100% - 30px)' : 0,
          width: 1,
          background: T.border,
          transform: 'translateX(-0.5px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 22,
          width: 18,
          height: 18,
          borderRadius: 999,
          background: T.bgCanvas,
          border: `1px solid ${state === 'idle' ? T.borderStrong : color}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {state === 'done' && (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={T.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5 9-12" />
          </svg>
        )}
        {state === 'running' && (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: T.accent,
              animation: 'vf-blink 1.1s ease-in-out infinite',
            }}
          />
        )}
        {state === 'idle' && (
          <span style={{ ...mono, fontSize: 9, color: T.textFaint }}>{num}</span>
        )}
      </div>
    </div>
  )
}
