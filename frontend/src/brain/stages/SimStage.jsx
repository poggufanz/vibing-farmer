// Ported from design/agentdashboard/src/app/components/agent-brain.tsx:989-1407
// (SimCollapsed + SimExpanded + geometry helpers distributeEndYs/branchPath),
// combined into a single body inside Stage.
//
// The design fans out to TIMELINES.slice(0, count) — up to 8 dynamic, clickable
// scenario branches with per-branch fact lists, animated moment-nodes sampled
// via bezierX/bezierY, and a click-to-inspect detail panel. The engine instead
// reports exactly 3 fixed scenarios (bull/base/bear) as numeric projected
// yields plus a weights map and an overall expectedValue — no facts[] to place
// moment-nodes against, so the port renders fixed-3 branches driven by that
// live data, keeping the SIM_W/H geometry constants, distributeEndYs, and
// branchPath verbatim while dropping the dynamic catalogue, moment-node
// sampling (bezierX/bezierY), and click-to-inspect panel.
import { T, mono, geist } from '../tokens.js'
import { Stage } from '../stage/Stage.jsx'
import { InspiredBy } from '../stage/InspiredBy.jsx'
import { Narrative } from '../stage/Narrative.jsx'

const SIM_W = 560
const SIM_H = 280
const NOW_X = 44
const NOW_Y = SIM_H / 2
const END_X = SIM_W - 110

function distributeEndYs(n) {
  if (n <= 0) return []
  if (n === 1) return [NOW_Y]
  const top = 36
  const bot = SIM_H - 36
  const step = (bot - top) / (n - 1)
  return Array.from({ length: n }, (_, i) => top + i * step)
}

function branchPath(endY) {
  const c1x = NOW_X + 140
  const c1y = NOW_Y
  const c2x = END_X - 200
  const c2y = endY
  return `M ${NOW_X} ${NOW_Y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${END_X} ${endY}`
}

const SCENARIOS = [
  { id: 'bull', label: 'bull', tone: T.ok },
  { id: 'base', label: 'base', tone: T.info },
  { id: 'bear', label: 'bear', tone: T.danger },
]

function formatYield(v) {
  if (v == null) return '—'
  const sign = v > 0 ? '+' : ''
  return `${sign}${v}`
}

export function SimStage({ stage, open, onToggle, num, label, meta }) {
  const { state, data } = stage
  const endYs = distributeEndYs(SCENARIOS.length)
  const branches = SCENARIOS.map((s, i) => ({
    ...s,
    endY: endYs[i],
    value: data?.[s.id],
    weight: data?.weights?.[s.id],
  }))

  return (
    <Stage id="sim" num={num} label={label} state={state} open={open} onToggle={onToggle} meta={meta}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 22, marginBottom: 22 }}>
        <span style={{ ...mono, fontSize: 36, color: T.text }}>
          {data?.expectedValue != null ? formatYield(data.expectedValue) : '—'}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ ...geist, fontSize: 14, color: T.text }}>E[value] · 3 branches</span>
          <span style={{ ...mono, fontSize: 11, color: T.textFaint }}>
            bull {formatYield(branches[0].value)} · base {formatYield(branches[1].value)} · bear{' '}
            {formatYield(branches[2].value)}
          </span>
        </div>
      </div>

      <InspiredBy src="Concept ZX · alternate timeline simulation · DeFi-adapted" />
      <Narrative>
        Dari satu "now" moment, venice.ai bercabang ke 3 alternate futures — bull, base, bear —
        dengan asumsi berbeda. Divergent trajectories menuju terminal yield, lalu di-blend jadi
        satu expected value pakai weights probabilitas.
      </Narrative>

      <div
        style={{
          position: 'relative',
          width: '100%',
          background: T.bgElev,
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <svg viewBox={`0 0 ${SIM_W} ${SIM_H}`} width="100%" style={{ display: 'block' }} preserveAspectRatio="xMidYMid meet">
          {[0.25, 0.5, 0.75].map((p) => {
            const x = NOW_X + (END_X - NOW_X) * p
            return (
              <line
                key={p}
                x1={x}
                y1={20}
                x2={x}
                y2={SIM_H - 20}
                stroke={T.border}
                strokeWidth={1}
                strokeDasharray="2 6"
                opacity={0.5}
              />
            )
          })}
          <text x={NOW_X} y={SIM_H - 6} fill={T.textFaint} fontSize={9} fontFamily="JetBrains Mono">
            t=0
          </text>
          <text x={END_X} y={SIM_H - 6} fill={T.textFaint} fontSize={9} fontFamily="JetBrains Mono" textAnchor="end">
            t=Δ
          </text>

          {branches.map((b) => {
            const d = branchPath(b.endY)
            return (
              <g key={b.id}>
                <path d={d} stroke={b.tone} strokeWidth={1} fill="none" opacity={0.12} />
                <path data-branch={b.id} d={d} stroke={b.tone} strokeWidth={1.6} fill="none" strokeLinecap="round" />
                <circle cx={END_X} cy={b.endY} r={6} fill={b.tone} />
                <circle cx={END_X} cy={b.endY} r={9} fill="none" stroke={b.tone} strokeWidth={1} opacity={0.4} />
                <text x={END_X + 14} y={b.endY - 4} fill={b.tone} fontSize={12} fontFamily="JetBrains Mono">
                  {formatYield(b.value)}
                </text>
                <text x={END_X + 14} y={b.endY + 10} fill={T.textFaint} fontSize={9} fontFamily="JetBrains Mono">
                  {b.id} · {b.label}
                </text>
                <rect
                  x={NOW_X - 24}
                  y={b.endY > NOW_Y ? NOW_Y + 6 : NOW_Y - 14}
                  width={(b.weight ?? 0) * 100}
                  height={2}
                  fill={b.tone}
                  opacity={0.6}
                />
              </g>
            )
          })}

          <circle cx={NOW_X} cy={NOW_Y} r={10} fill="none" stroke={T.text} strokeWidth={1} opacity={0.25} />
          <circle cx={NOW_X} cy={NOW_Y} r={5} fill={T.text} />
          <text x={NOW_X} y={NOW_Y - 16} fill={T.textFaint} fontSize={10} fontFamily="JetBrains Mono" textAnchor="middle">
            now
          </text>
        </svg>
      </div>

      <div style={{ ...mono, fontSize: 10, color: T.textFaint, marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
        <span>weights · bull {((branches[0].weight ?? 0) * 100).toFixed(0)}% · base {((branches[1].weight ?? 0) * 100).toFixed(0)}% · bear {((branches[2].weight ?? 0) * 100).toFixed(0)}%</span>
        <span>venice.ai · 1.84s</span>
      </div>
    </Stage>
  )
}
