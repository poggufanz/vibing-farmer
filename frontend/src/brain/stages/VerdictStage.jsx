// Ported from design/agentdashboard/src/app/components/agent-brain.tsx:1408-1491
// (VerdictCollapsed + VerdictExpanded), wrapped in the shared Stage primitive.
//
// The design's collapsed line ("0.82" + "rotate 40 usdc · aave-v3" + "quorum 3/3")
// and narrative copy were static demo strings. Live data carries
// stage.data.consensus = { finalDecision, executeVotes, total } — the manager's
// 2/3-majority verdict over the council's compressed verdicts.
import { T, mono, geist } from '../tokens.js'
import { Stage } from '../stage/Stage.jsx'
import { InspiredBy } from '../stage/InspiredBy.jsx'
import { Narrative } from '../stage/Narrative.jsx'

export function VerdictStage({ stage, open, onToggle, num, label, meta }) {
  const { state, data } = stage
  const consensus = data?.consensus

  return (
    <Stage id="verdict" num={num} label={label} state={state} open={open} onToggle={onToggle} meta={meta}>
      {!consensus ? (
        <div style={{ ...mono, fontSize: 11, color: T.textFaint, padding: '20px 0', textAlign: 'center' }}>
          awaiting consensus · manager weighs council verdicts once they land
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 22, marginBottom: 22 }}>
            <span style={{ ...mono, fontSize: 36, color: T.text }}>{consensus.finalDecision}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ ...mono, fontSize: 11, color: T.textMuted }}>
                quorum {consensus.executeVotes}/{consensus.total}
              </span>
            </div>
          </div>

          <InspiredBy src="EvoDS · ACC pattern · compressed verdicts → manager" />
          <Narrative>
            Manager nerima compressed verdicts (bukan raw log) dan mutusin. Logic-nya deterministic:
            butuh <b style={{ color: T.text }}>2/3 majority</b> DAN minimum confidence. Kalau salah
            satu gak terpenuhi → HOLD. Setiap decision di-log dengan citedRules buat Reflector update
            counters nanti.
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
            consensus · {consensus.executeVotes}/{consensus.total} votes → {consensus.finalDecision}
          </div>
        </div>
      )}
    </Stage>
  )
}
