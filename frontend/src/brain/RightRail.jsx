// Ported from design/agentdashboard/src/app/components/agent-brain.tsx:1734-2036
//
// Reframed: the design's RightRail rendered Wallet + Active-permissions panels
// (driven by `numWorkers`/`currentStageId`/synthesized demo data) plus a
// pagination-controlled feed of locally-shaped events. Those panels live
// elsewhere in this dashboard's layout, and the feed is now fully prop-driven
// using the canonical CouncilEvent shape from councilEvents.js
// ({ id, cycle, stage, marker, color, text, time }) — no local useState/useEffect,
// no demo-event synthesis, no pagination. The three panels kept are the ones the
// spec calls out: Council IQ, the activity feed, and the decision toast — with the
// design's border-bottom-between-panels chrome preserved.
import { T, mono, geist } from './tokens.js'

export function RightRail({ iq, councilFeed, decisionToast }) {
  return (
    <aside
      style={{
        width: 360,
        flexShrink: 0,
        background: T.bgCanvas,
        borderLeft: `1px solid ${T.border}`,
        overflowY: 'auto',
      }}
    >
      <div style={{ padding: 20, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ ...geist, fontSize: 13, color: T.text }}>Council intelligence</span>
          <span style={{ ...mono, fontSize: 10.5, color: T.textFaint }}>iq · evolving</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
          <span style={{ ...mono, fontSize: 28, color: T.text }}>{iq}</span>
        </div>
        <div style={{ ...mono, fontSize: 10.5, color: T.textFaint, marginTop: 10, lineHeight: 1.5 }}>
          learns from loop ↔ sim introspection · grows when reflector promotes a lesson.
        </div>
      </div>

      <div style={{ padding: 20, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ ...geist, fontSize: 13, color: T.text }}>Activity of council</span>
          <span style={{ ...mono, fontSize: 10.5, color: T.textFaint }}>
            {councilFeed.length === 0 ? 'watching' : 'deliberating'}
          </span>
        </div>
        <div style={{ marginTop: 14 }}>
          {councilFeed.length === 0 && (
            <div style={{ ...mono, fontSize: 11, color: T.textFaint, padding: '20px 0', textAlign: 'center' }}>
              council activity will appear here once loop begins
            </div>
          )}
          {councilFeed.map((row, i) => (
            <div
              key={row.id}
              style={{
                padding: '10px 0',
                borderTop: i === 0 ? 'none' : `1px solid ${T.border}`,
                display: 'grid',
                gridTemplateColumns: '16px 1fr auto',
                gap: 10,
                alignItems: 'baseline',
              }}
            >
              <span style={{ ...mono, fontSize: 12, color: row.color }}>{row.marker}</span>
              <span style={{ ...mono, fontSize: 12, color: T.text }}>{row.text}</span>
              <span style={{ ...mono, fontSize: 10, color: T.textFaint }}>{row.time}</span>
            </div>
          ))}
        </div>
      </div>

      {decisionToast && (
        <div style={{ padding: 20 }}>
          <div
            style={{
              background: T.bgCard,
              border: `1px solid ${T.accent}`,
              borderRadius: 14,
              padding: '16px 22px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: T.accent,
                animation: 'vf-blink 1.1s ease-in-out infinite',
                flexShrink: 0,
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ ...mono, fontSize: 10, color: T.accent, textTransform: 'lowercase' }}>
                council · verdict
              </span>
              <span style={{ ...geist, fontSize: 14, color: T.text, lineHeight: 1.4 }}>{decisionToast}</span>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
