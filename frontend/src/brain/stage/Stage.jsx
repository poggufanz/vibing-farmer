// frontend/src/brain/stage/Stage.jsx
// Ported from design agent-brain.tsx:157-225, with one deliberate contract change:
// the design's two-slot `collapsed`/`expanded` props collapse into a single
// `children` slot that renders only when `open` (simplifies the container's job
// and is required for true DOM-level collapse, not just CSS-hiding).
import { T } from '../tokens.js'
import { PipeMarker } from './PipeMarker.jsx'
import { Eyebrow } from './Eyebrow.jsx'

export function Stage({ id, num, label, meta, open, onToggle, state, children, first, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch' }}>
      <PipeMarker num={num} state={state} first={first} last={last} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          borderTop: first ? `1px solid ${T.border}` : 'none',
          borderBottom: `1px solid ${T.border}`,
          background: state === 'running' ? T.bgCard : 'transparent',
          transition: 'background 200ms ease-out',
        }}
      >
        <button
          onClick={() => onToggle(id)}
          aria-expanded={open}
          style={{
            all: 'unset',
            cursor: 'pointer',
            display: 'block',
            width: '100%',
            padding: '20px 28px 16px',
            boxSizing: 'border-box',
          }}
        >
          <Eyebrow num={num} label={label} meta={meta} state={state} />
        </button>
        {open && (
          <div style={{ borderTop: `1px solid ${T.border}`, padding: '22px 28px 26px' }}>
            {children}
          </div>
        )}
      </div>
    </div>
  )
}
