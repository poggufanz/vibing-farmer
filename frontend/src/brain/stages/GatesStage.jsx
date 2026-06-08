// Ported from design/agentdashboard/src/app/components/agent-brain.tsx:741-807
// (GatesCollapsed + GatesExpanded), combined into a single body inside Stage.
//
// GatesCollapsed's static "4/5 · gates passed · 1 soft-fail..." figure becomes
// a live PASS/FAIL summary driven by stage.data.pass, surfacing data.reason
// when a gate fails (the engine reports pass/reason, not per-gate detail —
// the gate checklist below stays the design's verbatim static demo).
import { T, mono, geist } from '../tokens.js'
import { Stage } from '../stage/Stage.jsx'
import { InspiredBy } from '../stage/InspiredBy.jsx'
import { Narrative } from '../stage/Narrative.jsx'

const GATES = [
  { name: 'turbulence.index', expr: 'rolling_chaos < 0.62', state: 'soft', val: '0.71' },
  { name: 'gas.ceiling', expr: 'base_fee < 80 gwei', state: 'pass', val: '22 gwei' },
  { name: 'balance.min', expr: 'wallet.usdc ≥ 25', state: 'pass', val: '1 248.42' },
  { name: 'drawdown.cap', expr: '7d_drawdown > −12%', state: 'pass', val: '−3.4%' },
  { name: 'cooldown', expr: 'since_last_act > 90s', state: 'pass', val: '612s' },
]

export function GatesStage({ stage, open, onToggle, num, label, meta }) {
  const { state, data } = stage
  const failed = data?.pass === false

  return (
    <Stage id="gates" num={num} label={label} state={state} open={open} onToggle={onToggle} meta={meta}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 22, marginBottom: 22 }}>
        <span style={{ ...mono, fontSize: 36, color: failed ? T.danger : T.text }}>
          {failed ? 'FAIL' : data?.pass === true ? 'PASS' : '4/5'}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ ...geist, fontSize: 14, color: T.text }}>
            {failed ? 'gate failed · loop sleeping' : 'gates passed'}
          </span>
          <span style={{ ...mono, fontSize: 11, color: failed ? T.danger : T.textMuted }}>
            {failed ? data.reason : '1 soft-fail · turbulence elevated'}
          </span>
        </div>
      </div>

      <InspiredBy src="FinRL · Turbulence Index + hard constraints" />
      <Narrative>
        Garis pertahanan pertama. Semua pure functions — input → boolean. Gak ada AI call, gak ada
        network request. Kalau gate fail, loop langsung sleep tanpa buang Venice AI credit.
      </Narrative>
      <div style={{ borderTop: `1px solid ${T.border}` }}>
        {GATES.map((g) => {
          const c = g.state === 'pass' ? T.ok : g.state === 'soft' ? T.warn : T.danger
          return (
            <div
              key={g.name}
              style={{
                display: 'grid',
                gridTemplateColumns: '24px 180px 1fr auto auto',
                gap: 12,
                alignItems: 'baseline',
                padding: '12px 0',
                borderBottom: `1px solid ${T.border}`,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  border: `1px solid ${c}`,
                  background: g.state === 'pass' ? c : 'transparent',
                }}
              />
              <span style={{ ...mono, fontSize: 12, color: T.text }}>{g.name}</span>
              <span style={{ ...mono, fontSize: 11, color: T.textFaint }}>{g.expr}</span>
              <span style={{ ...mono, fontSize: 12, color: T.text }}>{g.val}</span>
              <span style={{ ...mono, fontSize: 10, color: c, textTransform: 'uppercase' }}>
                {g.state}
              </span>
            </div>
          )
        })}
      </div>
    </Stage>
  )
}
