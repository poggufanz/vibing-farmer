// Ported from design/agentdashboard/src/app/components/agent-brain.tsx:276-336
// (LoopCollapsed + LoopExpanded), combined into a single body inside Stage.
//
// LoopCollapsed's hardcoded "#1284" cycle figure becomes the live stage.data.n;
// the substage pipeline and async tracker are the design's static demo content
// describing the loop's shape (the engine does not emit per-substage detail).
import { T, mono, geist } from '../tokens.js'
import { Stage } from '../stage/Stage.jsx'
import { InspiredBy } from '../stage/InspiredBy.jsx'
import { Narrative } from '../stage/Narrative.jsx'
import { Row } from '../stage/Row.jsx'
import { Marker } from '../stage/Marker.jsx'

const PIPELINE = [
  { name: 'monitor', gate: 'pass · pool depth ok', state: 'done' },
  { name: 'fetch', gate: 'pass · 8/8 streams', state: 'done' },
  { name: 'decide', gate: 'running · quorum pending', state: 'running' },
  { name: 'act', gate: 'queued', state: 'idle' },
  { name: 'track', gate: 'queued', state: 'idle' },
]

export function LoopStage({ stage, open, onToggle, num, label, meta }) {
  const { state, data } = stage

  return (
    <Stage id="loop" num={num} label={label} state={state} open={open} onToggle={onToggle} meta={meta}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 22, marginBottom: 22 }}>
        <span style={{ ...mono, fontSize: 36, color: T.text }}>#{data?.n ?? '—'}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ ...geist, fontSize: 14, color: T.text }}>
            stage · {state === 'running' ? 'monitor' : state === 'done' ? 'complete' : 'idle'}
          </span>
          <span style={{ ...mono, fontSize: 11, color: T.textMuted }}>
            uptime 18h 24m · last cycle 4.2s
          </span>
        </div>
      </div>

      <InspiredBy src='autoresearch · Andrej Karpathy · "NEVER STOP"' />
      <Narrative>
        Loop tak terbatas: fetch state → run gates → simulate → council → execute → sleep →
        ulangi. Yang penting: loop <b style={{ color: T.text }}>tidak boleh crash</b> karena satu
        error. Setiap error dicatat dan loop lanjut ke cycle berikutnya — persis seperti
        autoresearch yang punya crash recovery di program.md.
      </Narrative>

      <div style={{ ...mono, fontSize: 11, color: T.textFaint, marginBottom: 12 }}>
        stage pipeline · fast-fail gate per stage
      </div>
      {PIPELINE.map((s, i) => (
        <Row key={s.name} last={i === PIPELINE.length - 1}>
          <Marker state={s.state} />
          <span style={{ ...mono, fontSize: 11, color: T.textFaint, width: 28 }}>
            {String(i + 1).padStart(2, '0')}
          </span>
          <span style={{ ...geist, fontSize: 14, color: T.text, width: 110 }}>{s.name}</span>
          <span style={{ ...mono, fontSize: 12, color: T.textMuted, flex: 1 }}>{s.gate}</span>
        </Row>
      ))}

      <div
        style={{
          marginTop: 18,
          padding: '14px 16px',
          background: T.bgElev,
          borderRadius: 8,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ ...mono, fontSize: 11, color: T.textMuted }}>async outcome tracker</span>
        <span style={{ ...mono, fontSize: 12, color: T.text }}>12 open · 4 settled · 0 stalled</span>
      </div>
    </Stage>
  )
}
