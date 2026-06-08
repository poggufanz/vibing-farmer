// Ported from design/agentdashboard/src/app/components/agent-brain.tsx:862-926
// (CuratorCollapsed + CuratorExpanded), wrapped in the shared Stage primitive.
//
// The design's "+3 / 7 / 47" stat grid and 5-row ADD/DEDUP operation log were
// static demo data. This component runs async with live shape
// stage.data = { added, deduped } | null — the card shows a pending state
// until curation runs, then how many new rules were added vs. deduped into
// existing-counter increments.
import { T, mono, geist } from '../tokens.js'
import { Stage } from '../stage/Stage.jsx'
import { InspiredBy } from '../stage/InspiredBy.jsx'
import { Narrative } from '../stage/Narrative.jsx'

export function CuratorStage({ stage, open, onToggle, num, label, meta }) {
  const { state, data } = stage
  const curated = data && data.added != null

  return (
    <Stage id="curator" num={num} label={label} state={state} open={open} onToggle={onToggle} meta={meta}>
      {!curated ? (
        <div style={{ ...mono, fontSize: 11, color: T.textFaint, padding: '20px 0', textAlign: 'center' }}>
          awaiting curation · runs async once the reflector stages a patch
        </div>
      ) : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24, marginBottom: 22 }}>
            <div>
              <div style={{ ...mono, fontSize: 10, color: T.textFaint, marginBottom: 6 }}>rules.added</div>
              <span style={{ ...mono, fontSize: 28, color: T.text }}>+{data.added}</span>
            </div>
            <div>
              <div style={{ ...mono, fontSize: 10, color: T.textFaint, marginBottom: 6 }}>dedup.hits</div>
              <span style={{ ...mono, fontSize: 28, color: T.text }}>{data.deduped}</span>
            </div>
          </div>

          <InspiredBy src="ACE Stanford · Curator Agent · ICLR 2026" />
          <Narrative>
            Curator nambahin rules secara incremental — gak rewrite seluruh playbook (itu yang
            nyebabin "context collapse"). Sebelum ADD, cek duplikat via Jaccard. Kalau mirip,
            increment counter aja daripada tambah rule baru yang redundant.
          </Narrative>
          <div
            style={{
              marginTop: 18,
              padding: '14px 16px',
              background: T.bgElev,
              borderRadius: 8,
              ...mono,
              fontSize: 11,
              color: T.textMuted,
            }}
          >
            curation · {data.added} added · {data.deduped} deduped into existing counters
          </div>
        </div>
      )}
    </Stage>
  )
}
