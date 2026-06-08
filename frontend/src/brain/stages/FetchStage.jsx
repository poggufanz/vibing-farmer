// Ported from design/agentdashboard/src/app/components/agent-brain.tsx:339-415
// (FetchCollapsed + FetchExpanded), combined into a single body inside Stage.
//
// FetchCollapsed's static "08" figure + hardcoded source-tag list become the
// live stage.data.ms / stage.data.sources (falling back to the design's demo
// list while the cycle's first fetch is still in flight). The DAG node grid
// stays the design's verbatim static demo — the engine reports aggregate
// ms + sources, not per-node latency/dependency detail.
import { T, mono, geist } from '../tokens.js'
import { Stage } from '../stage/Stage.jsx'
import { InspiredBy } from '../stage/InspiredBy.jsx'
import { Narrative } from '../stage/Narrative.jsx'
import { Marker } from '../stage/Marker.jsx'

const DEMO_SOURCES = ['aave-v3', 'compound', '1inch', 'uniswap-v3', 'chain.gas', 'venice.ai', 'defillama', 'etherscan']

const NODES = [
  { id: 'aave-v3', lat: 142, state: 'done', deps: [] },
  { id: 'compound', lat: 188, state: 'done', deps: [] },
  { id: '1inch', lat: 96, state: 'done', deps: ['aave-v3'] },
  { id: 'uniswap-v3', lat: 211, state: 'done', deps: ['compound'] },
  { id: 'chain.gas', lat: 64, state: 'done', deps: [] },
  { id: 'venice.ai', lat: 412, state: 'running', deps: ['aave-v3', 'compound'] },
  { id: 'defillama', lat: 287, state: 'done', deps: [] },
  { id: 'etherscan', lat: 122, state: 'done', deps: ['chain.gas'] },
]

export function FetchStage({ stage, open, onToggle, num, label, meta }) {
  const { state, data } = stage
  const sources = data?.sources?.length ? data.sources : DEMO_SOURCES

  return (
    <Stage id="fetch" num={num} label={label} state={state} open={open} onToggle={onToggle} meta={meta}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
        <span style={{ ...mono, fontSize: 36, color: T.text }}>
          {data?.ms ?? '—'}
          <span style={{ fontSize: 14, color: T.textFaint }}>ms</span>
        </span>
        <span style={{ ...geist, fontSize: 14, color: T.text }}>parallel fetch · {sources.length} sources</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {sources.map((s) => (
            <span
              key={s}
              style={{
                ...mono,
                fontSize: 11,
                color: T.textMuted,
                padding: '4px 8px',
                border: `1px solid ${T.border}`,
                borderRadius: 4,
              }}
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      <InspiredBy src="EvoAgentX · DAG workflow · nodes run concurrently" />
      <Narrative>
        DAG di mana nodes yang gak saling bergantung jalan paralel. Fetch pools, gas, positions,
        on-chain signals — semua via <span style={mono}>Promise.all</span>. Sequential = 4 × 500ms
        = 2 detik. Parallel = max(500ms) = 500ms. Non-trivial untuk DeFi timing.
      </Narrative>
      <div style={{ ...mono, fontSize: 11, color: T.textFaint, marginBottom: 12 }}>
        dag · 8 nodes · 3 dependency edges
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {NODES.map((n) => (
          <div
            key={n.id}
            style={{
              border: `1px solid ${n.state === 'running' ? T.warn : T.border}`,
              borderRadius: 8,
              padding: 12,
              background: T.bgElev,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Marker state={n.state} />
              <span style={{ ...mono, fontSize: 11, color: T.text }}>{n.id}</span>
            </div>
            <div style={{ ...mono, fontSize: 18, color: T.text, marginTop: 8 }}>
              {n.lat}
              <span style={{ fontSize: 11, color: T.textFaint, marginLeft: 4 }}>ms</span>
            </div>
            <div style={{ ...mono, fontSize: 10, color: T.textFaint, marginTop: 4 }}>
              deps · {n.deps.length === 0 ? 'root' : n.deps.join(', ')}
            </div>
          </div>
        ))}
      </div>
    </Stage>
  )
}
