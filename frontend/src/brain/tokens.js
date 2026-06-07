// frontend/src/brain/tokens.js
// Bridges the design's `T` color object to style.css custom properties so every
// ported brain component inherits [data-palette] switching automatically.
export const T = {
  bgBase: 'var(--bg-base)',
  bgCanvas: 'var(--bg-canvas)',
  bgCard: 'var(--bg-card)',
  bgElev: 'var(--bg-elev)',
  bgElev2: 'var(--bg-elev-2)',
  border: 'var(--border)',
  borderStrong: 'var(--border-strong)',
  text: 'var(--text)',
  textMuted: 'var(--text-muted)',
  textFaint: 'var(--text-faint)',
  accent: 'var(--accent)',
  accentFg: 'var(--accent-fg)',
  info: 'var(--info)',
  warn: 'var(--warn)',
  danger: 'var(--danger)',
  ok: 'var(--ok)',
}

// Shared inline style fragments reused across ported components.
export const mono = { fontFamily: '"JetBrains Mono", ui-monospace, monospace', letterSpacing: '-0.01em' }
export const geist = { fontFamily: '"Geist", system-ui, sans-serif' }
