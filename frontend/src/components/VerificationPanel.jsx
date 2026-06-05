// RightRail module — the single blocking gate before autonomous execution.
// Lists every step (swap/approve/deposit per vault), editable slippage, Confirm/Cancel.

import React, { useMemo, useState } from 'react'
import { buildExecutionPlan, DEFAULT_SLIPPAGE_PCT } from '../verification/executionPlan.js'

const mono = { fontFamily: 'var(--font-mono)', fontSize: 10.5 }
const TYPE_COLOR = { swap: 'var(--info)', approve: 'var(--warn)', deposit: 'var(--ok)' }

export default function VerificationPanel({ strategy, onConfirm, onCancel, busy = false }) {
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE_PCT)
  const plan = useMemo(() => buildExecutionPlan(strategy, { slippagePct: slippage }), [strategy, slippage])
  const totalGas = plan.reduce((s, st) => s + st.estGas, 0)

  if (!plan.length) {
    return (
      <div className="panel">
        <div className="panel-head"><div className="panel-title">Verification</div></div>
        <div className="empty">No strategy to verify yet</div>
      </div>
    )
  }

  return (
    <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="panel-head">
        <div className="panel-title">Verify execution</div>
        <span className="panel-meta">{plan.length} steps · ~{(totalGas / 1000).toFixed(0)}k gas</span>
      </div>

      <div style={{ ...mono, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
        Review every action before granting permission. Execution runs autonomously after you confirm.
      </div>

      <label style={{ ...mono, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        Max slippage
        <span>
          <input
            type="number" step="0.1" min="0.1" max="5" value={slippage}
            onChange={(e) => setSlippage(Number(e.target.value))}
            style={{ width: 52, marginRight: 4 }} disabled={busy}
          />%
        </span>
      </label>

      <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12 }}>
        {plan.map((s) => (
          <div key={s.id} style={{
            display: 'grid', gridTemplateColumns: '54px 1fr auto', gap: 6, alignItems: 'center',
            padding: '6px 0', borderBottom: '1px solid var(--border)', ...mono,
          }}>
            <span style={{ color: TYPE_COLOR[s.type], textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.type}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.vaultName}</div>
              <div style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
                {s.amountUsdc} USDC{s.slippagePct != null ? ` · ${s.slippagePct}% slip` : ''} · {s.timeoutSec}s
              </div>
            </div>
            <span style={{ color: 'var(--text-muted)' }}>{(s.estGas / 1000).toFixed(0)}k</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-ghost" onClick={onCancel} disabled={busy} style={{ flex: 1 }}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onConfirm({ plan, slippage })} disabled={busy} style={{ flex: 2 }}>
          {busy ? 'Granting…' : 'Confirm & Execute'}
        </button>
      </div>
    </div>
  )
}
