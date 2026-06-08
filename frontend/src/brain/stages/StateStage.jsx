// Ported from design/agentdashboard/src/app/components/agent-brain.tsx:679-740
// (StateCollapsed + StateExpanded), wrapped in the shared Stage primitive
// (single children slot — see stage/Stage.jsx).
//
// The design's StateCollapsed showed a static stat grid (state.dim/action.space/
// reward.fn demo values); that grid is replaced here with the live "screen
// signature" — stage.data.portfolioApy rendered at .figure-md tabular scale
// (clamp(36px, 5.2vw, 64px) per design/agentdashboard/src/imports/DESIGN.md:160)
// alongside stage.data.positionsUsd. When the stage is idle and no data has
// arrived yet, the signature/narrative body is replaced with an empty placeholder.
import { T, mono, geist } from '../tokens.js'
import { Stage } from '../stage/Stage.jsx'
import { InspiredBy } from '../stage/InspiredBy.jsx'
import { Narrative } from '../stage/Narrative.jsx'
import { Row } from '../stage/Row.jsx'

const FIELDS = [
  { k: 'S · tvl[]', v: 'per-vault total value locked · 7d series' },
  { k: 'S · apy[]', v: 'current + 24h average apy per protocol' },
  { k: 'S · gas.base', v: 'rolling gwei · 1h median' },
  { k: 'S · positions', v: 'user open positions · vault + share' },
  { k: 'S · sentiment', v: 'news score · scalar [−1, +1]' },
  { k: 'A · hold', v: 'no-op · sleep one cycle' },
  { k: 'A · rotate', v: 'swap vault X → vault Y · amount' },
  { k: 'A · deposit', v: 'open new position · amount + vault' },
  { k: 'A · withdraw', v: 'close position · amount + vault' },
  { k: 'A · split', v: 'rebalance across N vaults · weights' },
  { k: 'R', v: 'net usd realised − gas − impermanent loss · 7d window' },
]

export function StateStage({ stage, open, onToggle, num, label, meta }) {
  const { state, data } = stage
  const hasData = data && (data.portfolioApy != null || data.positionsUsd != null)

  return (
    <Stage id="state" num={num} label={label} state={state} open={open} onToggle={onToggle} meta={meta}>
      {state === 'idle' && !hasData ? (
        <div style={{ ...mono, fontSize: 11, color: T.textFaint, padding: '20px 0', textAlign: 'center' }}>
          awaiting cycle start · state stage reads live positions + apy once the loop begins
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 36, marginBottom: 22 }}>
            <div>
              <div style={{ ...mono, fontSize: 10, color: T.textFaint, marginBottom: 6 }}>portfolio · apy</div>
              <span style={{ ...mono, fontSize: 'clamp(36px, 5.2vw, 64px)', color: T.text, fontVariantNumeric: 'tabular-nums' }}>
                {data?.portfolioApy ?? '—'}
                <span style={{ fontSize: 16, color: T.textFaint }}>%</span>
              </span>
            </div>
            <div>
              <div style={{ ...mono, fontSize: 10, color: T.textFaint, marginBottom: 6 }}>positions · usd</div>
              <span style={{ ...mono, fontSize: 28, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
                ${data?.positionsUsd ?? '—'}
              </span>
            </div>
          </div>

          <InspiredBy src="FinRL · AI4Finance Foundation" />
          <Narrative>
            Trading sebagai RL problem: <b style={{ color: T.text }}>State</b> (apa yang diamati),{' '}
            <b style={{ color: T.text }}>Action</b> (apa yang bisa dilakukan),{' '}
            <b style={{ color: T.text }}>Reward</b> (gimana ngukur sukses). Vibing Farmer butuh
            formalisasi yang sama biar agent punya bahasa yang jelas — bukan sekadar "fetch data →
            tanya AI".
          </Narrative>
          <div style={{ borderTop: `1px solid ${T.border}` }}>
            {FIELDS.map((f, i) => (
              <Row key={f.k} last={i === FIELDS.length - 1}>
                <span style={{ ...mono, fontSize: 11, color: T.textFaint, width: 100, flexShrink: 0 }}>{f.k}</span>
                <span style={{ ...geist, fontSize: 12, color: T.text }}>{f.v}</span>
              </Row>
            ))}
          </div>
        </>
      )}
    </Stage>
  )
}
