// Ported from design/agentdashboard/src/app/components/agent-brain.tsx:2037-2102
import { T, mono } from '../tokens.js'

export function Sidebar() {
  const Ic = (d) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
  const items = [
    { label: 'home', path: 'M3 12 12 4l9 8M5 10v10h14V10' },
    { label: 'grid', path: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', active: true },
    { label: 'layers', path: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5M3 18l9 5 9-5' },
    { label: 'settings', path: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9c.6.5 1.3.9 2 1.2L10 21h4l.6-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z' },
  ]
  return (
    <nav
      style={{
        width: 58,
        flexShrink: 0,
        background: T.bgCanvas,
        borderRight: `1px solid ${T.border}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '14px 0',
        gap: 6,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          border: `1px solid ${T.borderStrong}`,
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...mono,
          fontSize: 14,
          color: T.text,
          marginBottom: 18,
        }}
      >
        v/
      </div>
      {items.map((it) => (
        <button
          key={it.label}
          aria-label={it.label}
          style={{
            all: 'unset',
            cursor: 'pointer',
            width: 36,
            height: 36,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: it.active ? T.bgElev : 'transparent',
            color: it.active ? T.text : T.textMuted,
          }}
        >
          {Ic(it.path)}
        </button>
      ))}
    </nav>
  )
}
