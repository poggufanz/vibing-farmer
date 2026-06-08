// Ported from design/agentdashboard/src/app/components/agent-brain.tsx:1494-1541
// (MemoryCollapsed + MemoryExpanded), wrapped in the shared Stage primitive.
//
// The design's "8 412 vectors / 47 rules / 126 patterns" stat grid and the
// 4-entry recent-entries list were static demo data. Live data carries
// stage.data.rules — the playbook array the curator maintains, each entry
// shaped { id, text, helpful, harmful }. The card now renders the playbook
// size and recent rule text directly from that array.
import { T, mono, geist } from '../tokens.js'
import { Stage } from '../stage/Stage.jsx'
import { InspiredBy } from '../stage/InspiredBy.jsx'
import { Narrative } from '../stage/Narrative.jsx'
import { Row } from '../stage/Row.jsx'

export function MemoryStage({ stage, open, onToggle, num, label, meta }) {
  const { state, data } = stage
  const rules = data?.rules ?? []

  return (
    <Stage id="memory" num={num} label={label} state={state} open={open} onToggle={onToggle} meta={meta}>
      {rules.length === 0 ? (
        <div style={{ ...mono, fontSize: 11, color: T.textFaint, padding: '20px 0', textAlign: 'center' }}>
          playbook empty · curator builds rules from outcomes over time
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: 22 }}>
            <div style={{ ...mono, fontSize: 10, color: T.textFaint, marginBottom: 6 }}>rules</div>
            <span style={{ ...mono, fontSize: 28, color: T.text }}>{rules.length}</span>
          </div>

          <InspiredBy src="ACE Stanford · Evolving Playbook · ICLR 2026" />
          <Narrative>
            Playbook sebagai <b style={{ color: T.text }}>living document</b> — bukan static prompt,
            tapi collection of rules yang tumbuh, di-refine, dan di-prune berdasarkan empirical
            evidence. Tiap rule punya counters <span style={mono}>helpful</span> dan{' '}
            <span style={mono}>harmful</span> yang di-update tiap kali outcome diketahui.
          </Narrative>
          <div style={{ ...mono, fontSize: 11, color: T.textFaint, marginBottom: 12 }}>
            playbook · {rules.length} rules
          </div>
          <div style={{ borderTop: `1px solid ${T.border}` }}>
            {rules.map((r, i) => (
              <Row key={r.id ?? i} last={i === rules.length - 1}>
                <span style={{ ...mono, fontSize: 10, color: T.textFaint, width: 64 }}>{r.id}</span>
                <span style={{ ...geist, fontSize: 13, color: T.text, flex: 1 }}>{r.text}</span>
                <span style={{ ...mono, fontSize: 10, color: T.textMuted }}>
                  +{r.helpful ?? 0} / -{r.harmful ?? 0}
                </span>
              </Row>
            ))}
          </div>
        </div>
      )}
    </Stage>
  )
}
