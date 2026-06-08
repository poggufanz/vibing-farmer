// Ported from design/agentdashboard/src/app/components/agent-brain.tsx:2143-2167
// Font: the design used "Instrument Serif" — this project's de-AI visual
// direction already replaced that font everywhere else (LandingHero, NavBar,
// EcosystemPage, ExplorerPage all use `var(--font-script, "Newsreader", serif)`),
// so the wordmark here follows that same established project convention
// instead of introducing "Instrument Serif" as a new one-off font.
import { T, mono, geist } from '../tokens.js'

export function Topbar({ cycle = 1284 }) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 28px',
        borderBottom: `1px solid ${T.border}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ ...geist, fontSize: 19, fontWeight: 500, color: T.text }}>vibing</span>
        <span style={{ color: T.textFaint, fontSize: 19 }}>/</span>
        <span style={{ fontFamily: 'var(--font-script, "Newsreader", serif)', fontStyle: 'italic', fontSize: 19, color: T.text }}>
          farmer
        </span>
      </div>
      <div style={{ ...mono, fontSize: 11, color: T.textMuted, display: 'flex', gap: 18 }}>
        <span>agent · brain</span>
        <span style={{ color: T.textFaint }}>cycle #{cycle}</span>
      </div>
    </header>
  )
}
