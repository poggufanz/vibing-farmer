// Ported from design/agentdashboard/src/app/components/agent-brain.tsx:1619-1678
// (ReflectorCollapsed + ReflectorExpanded), wrapped in the shared Stage primitive.
//
// The design's "overshot bull projection by 7.8% on #1280" header and the
// scripted post-mortem (what.changed / lesson.promoted / patch.status) were
// static demo strings. This component runs async (after the Outcome Tracker)
// with live shape stage.data = { tagged, newRule } | null — the card shows a
// pending state until that lands, then how many cited rules got
// helpful/harmful tags and the new rule the Reflector extracted.
import { T, mono, geist } from '../tokens.js'
import { Stage } from '../stage/Stage.jsx'
import { InspiredBy } from '../stage/InspiredBy.jsx'
import { Narrative } from '../stage/Narrative.jsx'

export function ReflectorStage({ stage, open, onToggle, num, label, meta }) {
  const { state, data } = stage
  const reflected = data && data.tagged != null

  return (
    <Stage id="reflector" num={num} label={label} state={state} open={open} onToggle={onToggle} meta={meta}>
      {!reflected ? (
        <div style={{ ...mono, fontSize: 11, color: T.textFaint, padding: '20px 0', textAlign: 'center' }}>
          awaiting reflection · runs async once outcome evaluation lands
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 22 }}>
            <span style={{ ...geist, fontSize: 14, color: T.text }}>
              {data.tagged} cited rules tagged from this outcome
            </span>
            {data.newRule && (
              <span style={{ ...mono, fontSize: 11, color: T.textMuted }}>
                self-patch · staged · awaiting curator
              </span>
            )}
          </div>

          <InspiredBy src="ACE Stanford · Reflector Agent · tag helpful/harmful" />
          <Narrative>
            Jalan async setelah Outcome Tracker selesai evaluasi. Profitable → semua cited rules
            dapet <span style={mono}>helpful++</span>. Loss → <span style={mono}>harmful++</span>.
            Plus Reflector coba extract rule baru dari kegagalan — apa yang harusnya diketahui
            agent sebelum keputusan itu dibuat?
          </Narrative>
          {data.newRule && (
            <div
              style={{
                marginTop: 18,
                ...mono,
                fontSize: 12,
                display: 'grid',
                gridTemplateColumns: '180px 1fr',
                rowGap: 8,
              }}
            >
              <span style={{ color: T.textFaint }}>lesson.promoted</span>
              <span style={{ color: T.text }}>"{data.newRule}"</span>
              <span style={{ color: T.textFaint }}>patch.status</span>
              <span style={{ color: T.warn }}>staged · awaiting curator</span>
            </div>
          )}
        </div>
      )}
    </Stage>
  )
}
