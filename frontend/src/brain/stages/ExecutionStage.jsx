// Ported from design/agentdashboard/src/app/components/agent-brain.tsx:808-859
// (ExecutionCollapsed + ExecutionExpanded), wrapped in the shared Stage primitive.
//
// The design's "02 / tx in flight" header and the 8-row session/1shot key-value
// log were static demo strings. Live data carries stage.data.{ outcome, txHash } —
// the card now shows the outcome and a terminal-style log line with the
// shortened tx hash once one lands.
import { T, mono, geist } from '../tokens.js'
import { Stage } from '../stage/Stage.jsx'
import { InspiredBy } from '../stage/InspiredBy.jsx'
import { Narrative } from '../stage/Narrative.jsx'

const shortHash = (h) => (h ? `${h.slice(0, 6)}…${h.slice(-4)}` : null)

export function ExecutionStage({ stage, open, onToggle, num, label, meta }) {
  const { state, data } = stage
  const outcome = data?.outcome
  const txHash = data?.txHash

  return (
    <Stage id="execution" num={num} label={label} state={state} open={open} onToggle={onToggle} meta={meta}>
      {!outcome && !txHash ? (
        <div style={{ ...mono, fontSize: 11, color: T.textFaint, padding: '20px 0', textAlign: 'center' }}>
          awaiting execution · session key armed, 1shot relay on standby
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 22, marginBottom: 22 }}>
            <span style={{ ...geist, fontSize: 14, color: T.text }}>{outcome ?? 'pending'}</span>
          </div>

          <InspiredBy src="MetaMask Smart Accounts (ERC-4337) + 1Shot API" />
          <Narrative>
            Yang bedain "autonomous agent" sama "assistant yang butuh konfirmasi" adalah kemampuan
            execute tanpa human approval per-tx. User sign sekali untuk authorize agent dalam batas
            tertentu — habis itu, 1Shot handle routing dan execution.
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
            {txHash ? `tx · ${shortHash(txHash)} · ${outcome ?? 'submitted'}` : 'tx · pending relay'}
          </div>
        </div>
      )}
    </Stage>
  )
}
