// Ported from design/agentdashboard/src/app/components/agent-brain.tsx:421-476
// (CouncilCollapsed + CouncilExpanded + COUNCIL const), wrapped in the shared
// Stage primitive (single children slot — see stage/Stage.jsx).
//
// The design's COUNCIL/debate arrays were static demo data (3 hardcoded
// specialist names + a scripted 4-turn argument). Both are replaced here with
// the live stage.data.verdicts[] the council event actually emits — each
// verdict carries { role, decision, confidence, keyReason, citedRules }.
import { T, mono, geist } from '../tokens.js'
import { Stage } from '../stage/Stage.jsx'
import { InspiredBy } from '../stage/InspiredBy.jsx'
import { Narrative } from '../stage/Narrative.jsx'
import { Row } from '../stage/Row.jsx'

const pct = (c) => (c == null ? '—' : Math.round(c * 100))

export function CouncilStage({ stage, open, onToggle, num, label, meta }) {
  const { state, data } = stage
  const verdicts = data?.verdicts ?? []

  return (
    <Stage id="council" num={num} label={label} state={state} open={open} onToggle={onToggle} meta={meta}>
      {verdicts.length === 0 ? (
        <div style={{ ...mono, fontSize: 11, color: T.textFaint, padding: '20px 0', textAlign: 'center' }}>
          awaiting verdicts · council convenes once simulation completes
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 22 }}>
            {verdicts.map((v) => (
              <div
                key={v.role}
                style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 14, background: T.bgElev }}
              >
                <div style={{ ...mono, fontSize: 10, color: T.textFaint, marginBottom: 6 }}>agent</div>
                <div style={{ ...geist, fontSize: 13, color: T.text, marginBottom: 10 }}>{v.role}</div>
                <div style={{ ...mono, fontSize: 11, color: T.textMuted, marginBottom: 8 }}>{v.decision}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ ...mono, fontSize: 10, color: T.textFaint }}>conf</span>
                  <span style={{ ...mono, fontSize: 18, color: T.text }}>{pct(v.confidence)}%</span>
                </div>
              </div>
            ))}
          </div>

          <InspiredBy src="TradingAgents · TauricResearch · Bull/Bear debate pattern" />
          <Narrative>
            Tiga specialist agents jalan parallel, masing-masing punya system prompt dan data yang
            beda. Bukan "nanya hal yang sama 3 kali" — tiap agent liat dimensi berbeda, punya subset
            playbook yang relevan, dan output-nya compressed verdict. Setiap verdict include{' '}
            <span style={mono}>citedRules</span> — playbook mana yang dipakai.
          </Narrative>
          <div style={{ ...mono, fontSize: 11, color: T.textFaint, marginBottom: 12 }}>
            verdicts · {verdicts.length} specialists weighed in
          </div>
          <div style={{ borderTop: `1px solid ${T.border}` }}>
            {verdicts.map((v, i) => (
              <Row key={v.role} last={i === verdicts.length - 1}>
                <span style={{ ...mono, fontSize: 11, color: T.textFaint, width: 28 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ ...geist, fontSize: 13, color: T.text, width: 140 }}>{v.role}</span>
                <span style={{ ...mono, fontSize: 11, color: T.textMuted, width: 90 }}>{v.decision}</span>
                <span style={{ ...geist, fontSize: 13, color: T.textMuted, flex: 1 }}>{v.keyReason}</span>
              </Row>
            ))}
          </div>
        </>
      )}
    </Stage>
  )
}
