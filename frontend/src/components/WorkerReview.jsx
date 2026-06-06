// frontend/src/components/WorkerReview.jsx
// The pre-grant approval screen. The user sees every worker (one per vault), each
// worker's skill summary (editable), and what the autonomous council will do — then
// approves once. After this, the single ERC-7715 grant is the ONLY wallet popup.

import React from 'react'

const card = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }
const mono = { fontFamily: 'var(--font-mono)', fontSize: 10.5 }
const tag = { ...mono, color: 'var(--info)', textTransform: 'uppercase', letterSpacing: '0.05em' }

function WorkerCard({ agent, skill, onEdit }) {
  const sk = skill?.skill ?? null
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={tag}>{agent.id}</span>
        <button onClick={() => onEdit(agent.id)} style={{ ...mono, appearance: 'none', background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: 4, color: 'inherit', padding: '3px 8px', cursor: 'pointer' }}>
          edit skill
        </button>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{agent.vault?.name ?? agent.id}</div>
      <div style={{ ...mono, color: 'var(--text-muted)', marginTop: 4 }}>
        {agent.allocation} USDC · {agent.vault?.protocol ?? 'pool'} · {agent.vault?.apy ?? '—'}% APY
      </div>
      <div style={{ ...mono, color: 'var(--text-muted)', opacity: 0.75, marginTop: 8, lineHeight: 1.5 }}>
        {sk
          ? `max slippage ${sk?.swap?.maxSlippage ?? '0.5'}% · timeout ${sk?.swap?.timeoutSeconds ?? 30}s · ${sk?.deposit ? 'deposit allowed' : 'deposit'}`
          : 'swap → approve → deposit (default skill)'}
      </div>
    </div>
  )
}

export default function WorkerReview({ strategy, skillStates = {}, onEditSkill, onApprove, onCancel }) {
  const agents = strategy?.agents ?? []
  if (!agents.length) return <div className="empty">No workers to review</div>

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: 6, fontSize: 18, fontWeight: 700 }}>Review your agent swarm</div>
      <div style={{ ...mono, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
        {agents.length} worker{agents.length > 1 ? 's' : ''} will run autonomously under one permission grant.
        An AI council (Risk Auditor · Gas Checker · Strategy Guard) reviews every move and learns from each cycle.
        You approve once — no further wallet popups.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginBottom: 20 }}>
        {agents.map((a) => (
          <WorkerCard key={a.id} agent={a} skill={skillStates[a.id]} onEdit={onEditSkill} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-ghost" onClick={onCancel} style={{ flex: 1 }}>Back</button>
        <button className="btn btn-primary" onClick={onApprove} style={{ flex: 2 }}>
          Approve & grant permission
        </button>
      </div>
    </div>
  )
}
