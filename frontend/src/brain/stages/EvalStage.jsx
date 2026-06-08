// Ported from design/agentdashboard/src/app/components/agent-brain.tsx:1544-1616
// (EvalCollapsed + EvalExpanded), wrapped in the shared Stage primitive.
//
// The design's "78.4% accuracy · 7d" header and 7-row prediction-vs-actual
// table were static demo data. This component runs async (separate from the
// main loop, per the narrative) and its live shape is
// stage.data = { evaluated, netResultUSD, wasProfit } | null — the card shows
// a pending state until that lands, then the net result and profit/loss call.
import { T, mono, geist } from '../tokens.js'
import { Stage } from '../stage/Stage.jsx'
import { InspiredBy } from '../stage/InspiredBy.jsx'
import { Narrative } from '../stage/Narrative.jsx'

const fmtUsd = (n) => `${n >= 0 ? '+' : '−'}$${Math.abs(n).toFixed(2)}`

export function EvalStage({ stage, open, onToggle, num, label, meta }) {
  const { state, data } = stage
  const evaluated = data?.evaluated

  return (
    <Stage id="eval" num={num} label={label} state={state} open={open} onToggle={onToggle} meta={meta}>
      {!evaluated ? (
        <div style={{ ...mono, fontSize: 11, color: T.textFaint, padding: '20px 0', textAlign: 'center' }}>
          awaiting evaluation · runs async, ~7 days after the decision lands
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 22, marginBottom: 22 }}>
            <span style={{ ...mono, fontSize: 36, color: data.wasProfit ? T.ok : T.danger }}>
              {fmtUsd(data.netResultUSD)}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ ...geist, fontSize: 14, color: T.text }}>net result</span>
              <span style={{ ...mono, fontSize: 11, color: T.textMuted }}>
                {data.wasProfit ? 'profit confirmed after gas + IL' : 'loss after gas + IL'}
              </span>
            </div>
          </div>

          <InspiredBy src="autoresearch · results.tsv + FinRL · backtesting" />
          <Narrative>
            Komponen <b style={{ color: T.text }}>terpisah</b> yang jalan async — bukan di main loop.
            Evaluate keputusan yang udah dibuat 7 hari lalu: bener-bener profitable setelah gas dan
            IL? Hasilnya jadi ground truth buat Reflector. DeFi evaluate delayed (butuh 7 hari) —
            makanya ini cron job terpisah.
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
            outcome · {fmtUsd(data.netResultUSD)} · {data.wasProfit ? 'hit' : 'miss'}
          </div>
        </div>
      )}
    </Stage>
  )
}
