// Ported from design/agentdashboard/src/app/components/agent-brain.tsx:929-987
// (BulletCollapsed + BulletExpanded), wrapped in the shared Stage primitive.
//
// The design's "0.74 · top jaccard pair" header and 3-row pairs table were
// static demo data. This component runs async with live shape
// stage.data = { merged, pairs } | null, where each pair is
// { a, b, j, action } — the card shows a pending state until analysis runs,
// then the merged count and the live jaccard-similarity pairs.
import { T, mono, geist } from '../tokens.js'
import { Stage } from '../stage/Stage.jsx'
import { InspiredBy } from '../stage/InspiredBy.jsx'
import { Narrative } from '../stage/Narrative.jsx'

const JACCARD_MERGE_THRESHOLD = 0.6

export function BulletStage({ stage, open, onToggle, num, label, meta }) {
  const { state, data } = stage
  const analyzed = data && data.merged != null
  const pairs = data?.pairs ?? []

  return (
    <Stage id="bullet" num={num} label={label} state={state} open={open} onToggle={onToggle} meta={meta}>
      {!analyzed ? (
        <div style={{ ...mono, fontSize: 11, color: T.textFaint, padding: '20px 0', textAlign: 'center' }}>
          awaiting analysis · runs async after the curator stages new rules
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 22, marginBottom: 22 }}>
            <span style={{ ...mono, fontSize: 36, color: T.text }}>{data.merged}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ ...geist, fontSize: 14, color: T.text }}>
                rules merged · {pairs.length} candidate pairs scanned
              </span>
              <span style={{ ...mono, fontSize: 11, color: T.textMuted }}>
                venice.ai · simplified from faiss + sentence-transformers
              </span>
            </div>
          </div>

          <InspiredBy src="ACE Stanford · BulletpointAnalyzer (Jaccard + Venice AI)" />
          <Narrative>
            ACE pakai FAISS + sentence-transformers untuk detect rules yang mirip secara semantik,
            terus merge via LLM. Vibing Farmer simplify: Jaccard buat detect kandidat, Venice AI buat
            merge. Pas merge, <b style={{ color: T.text }}>sum the counters</b> — empirical evidence
            gak hilang.
          </Narrative>
          <div style={{ borderTop: `1px solid ${T.border}` }}>
            {pairs.map((p, i) => {
              const above = p.j >= JACCARD_MERGE_THRESHOLD
              return (
                <div
                  key={`${p.a}-${p.b}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '120px 80px 1fr',
                    gap: 12,
                    padding: '12px 0',
                    borderBottom: i === pairs.length - 1 ? 'none' : `1px solid ${T.border}`,
                    alignItems: 'baseline',
                  }}
                >
                  <span style={{ ...mono, fontSize: 12, color: T.text }}>
                    {p.a} ↔ {p.b}
                  </span>
                  <span style={{ ...mono, fontSize: 12, color: above ? T.accent : T.textMuted }}>
                    j={p.j.toFixed(2)}
                  </span>
                  <span style={{ ...mono, fontSize: 11, color: T.textMuted }}>{p.action}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Stage>
  )
}
