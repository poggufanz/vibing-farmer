// AgentDashboard.jsx
// Autonomous-agent page: portfolio summary, live positions, explainable alerts.
// "Users should always feel like they're driving, even when the agent does the work."
import React, { useState, useEffect } from 'react'
import AgentActionPreview from './AgentActionPreview.jsx'
import WithdrawModal from './WithdrawModal.jsx'
import { loadSettings, t } from '../settingsStore.js'

const POSITION_INTERVAL = 5 * 60 * 1000 // mirrors worker INTERVALS.position
const u = (units) => Number(units || 0) / 1e6
const fmt = (units) => u(units).toFixed(2)
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')
const formatTime = (ts, now = Date.now()) => {
  if (!ts) return '—'
  const { timestampFormat } = loadSettings()
  if (timestampFormat === 'absolute') {
    return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  }
  const s = Math.max(0, Math.floor((now - ts) / 1000))
  return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)} min ago`
}
const fmtRemain = (ms) => {
  if (ms <= 0) return 'now'
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

const ALERT_META = {
  harvest_ready:      { dot: '🟢', color: 'var(--ok)',     title: 'Harvest ready' },
  harvest_executed:   { dot: '✓',  color: 'var(--ok)',     title: 'Harvested' },
  harvest_failed:     { dot: '✕',  color: 'var(--danger)', title: 'Harvest failed' },
  rebalance_proposal: { dot: '🔵', color: 'var(--info)',   title: 'Rebalance opportunity' },
  apy_drift:          { dot: '⚠',  color: 'var(--warn)',   title: 'APY drop' },
  risk_alert:         { dot: '🚨', color: 'var(--danger)', title: 'Risk detected' },
}

const alertLine = (a) => {
  switch (a.kind) {
    case 'harvest_ready': return `${a.vaultName} · ${a.rewardsUsdc} USDC unclaimed`
    case 'harvest_executed': return `${a.vaultName} · claimed`
    case 'harvest_failed': return `${a.vaultName} · ${a.error}`
    case 'rebalance_proposal': return `${a.fromVault} ${a.fromApy}% → ${a.toProtocol} ${a.toApy}% (+${a.apyGain}%)`
    case 'apy_drift': return `${a.vaultName} · ${a.baselineApy}% → ${a.currentApy}% (${a.driftPct}%)`
    case 'risk_alert': return `${a.vaultName} — security signal detected`
    default: return a.vaultName || ''
  }
}

const whyText = (a) => {
  switch (a.kind) {
    case 'apy_drift': return `APY compressed ${a.driftPct}% since deposit (${a.baselineApy}% → ${a.currentApy}%). Consider rebalancing if the drop persists into the next monitoring cycle.`
    case 'rebalance_proposal': return `${a.toProtocol} currently offers ${a.toApy}% vs your ${a.fromVault} position at ${a.fromApy}% — a ${a.apyGain}% gap. Rebalancing would capture that extra yield (break-even after gas: ~2 days).`
    case 'risk_alert': return `Severity ${a.severity} · classified by Venice AI. ${(a.searchAnswer || '').slice(0, 180)}`
    case 'harvest_ready': return `${a.rewardsUsdc} USDC of yield has accrued and is ready to claim. Claiming resets the accrual clock.`
    default: return a.error || ''
  }
}

const cardStyle = (color) => ({ borderLeft: `2px solid ${color}`, padding: '8px 10px', marginBottom: 6, background: 'rgba(255,255,255,.03)', borderRadius: 6 })
const btn = { appearance: 'none', border: '.5px solid rgba(255,255,255,.18)', borderRadius: 5, background: 'rgba(255,255,255,.06)', color: 'inherit', font: 'inherit', fontSize: 10.5, padding: '4px 9px', cursor: 'pointer', marginRight: 6, marginTop: 6 }
const linkBtn = { ...btn, border: 0, background: 'transparent', padding: '4px 0', color: 'var(--text-muted)', textDecoration: 'underline' }

function AlertCard({ alert, lang = 'en', onHarvest, onEmergencyWithdraw, onReview, onDismiss }) {
  const [why, setWhy] = useState(false)
  const meta = ALERT_META[alert.kind] || { dot: '·', color: 'var(--text-muted)', title: alert.kind }
  const src = alert.sources && alert.sources[0]
  return (
    <div style={cardStyle(meta.color)}>
      <div style={{ fontSize: 11.5, fontWeight: 600 }}>
        <span aria-hidden="true" style={{ marginRight: 6 }}>{meta.dot}</span>
        {meta.title}{alert.severity ? ` · ${alert.severity}` : ''}
      </div>
      <div className="act-meta" style={{ marginTop: 3, fontSize: 10.5, lineHeight: 1.4 }}>{alertLine(alert)}</div>

      <button style={linkBtn} aria-expanded={why} onClick={() => setWhy((v) => !v)}>{why ? 'Hide' : 'Why?'}</button>
      {why && (
        <div className="act-meta" style={{ fontSize: 10.5, lineHeight: 1.5, padding: '4px 0 2px', opacity: .85 }}>
          {whyText(alert)}
          {src && <div style={{ marginTop: 4 }}>Source: <a href={src.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--info)' }}>{(src.title || src.url).slice(0, 48)} ↗</a></div>}
        </div>
      )}

      <div>
        {alert.kind === 'harvest_ready' && <button style={btn} onClick={() => onHarvest(alert)}>{t(lang, 'harvest')}</button>}
        {alert.kind === 'rebalance_proposal' && <button style={btn} onClick={() => onReview(alert)}>Review</button>}
        {alert.kind === 'risk_alert' && <button style={{ ...btn, borderColor: 'var(--danger)' }} onClick={() => onEmergencyWithdraw(alert)}>Emergency withdraw</button>}
        <button style={btn} onClick={() => onDismiss(alert.id)}>{t(lang, 'dismiss')}</button>
      </div>
    </div>
  )
}

export default function AgentDashboard({
  active, positions = {}, alerts = [], vaultMeta = {}, lastUpdated = null, userAddress, settings = {},
  withdrawEnabled = true, onHarvest, onEmergencyWithdraw, onReview, onDismiss, onWithdrawSuccess, onNewStrategy,
}) {
  const [now, setNow] = useState(Date.now())
  const [preview, setPreview] = useState(null)
  const [withdrawVault, setWithdrawVault] = useState(null)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const { alertSeverity, language: lang } = loadSettings()
  const filteredAlerts = alerts.filter(alert => {
    if (alert.severity === 'high') return alertSeverity?.high !== false
    if (alert.severity === 'medium') return alertSeverity?.medium !== false
    if (alert.severity === 'low') return alertSeverity?.low === true
    return true
  })

  const posList = Object.entries(positions)
  const apyOf = (addr) => vaultMeta[addr.toLowerCase()]?.apy || 0
  const totalUnits = posList.reduce((s, [, p]) => s + Number(p.balance || 0), 0)
  const earnedUnits = posList.reduce((s, [, p]) => s + Number(p.unclaimedRewards || 0), 0)
  const blendedApy = totalUnits > 0 ? posList.reduce((s, [a, p]) => s + Number(p.balance || 0) * apyOf(a), 0) / totalUnits : 0
  const nextCheck = lastUpdated ? lastUpdated + POSITION_INTERVAL : null

  // Preview interceptors — the actual execution runs on confirm (props.onHarvest/onEmergencyWithdraw)
  const requestHarvest = (a) => setPreview({ kind: 'harvest', alert: a, vaultName: a.vaultName, rewardsUsdc: a.rewardsUsdc })
  const requestWithdraw = (a) => {
    const bal = Number(positions[a.vaultAddress]?.balance || 0)
    const amtUnits = settings.emergencyFull ? bal : Math.floor(bal * (settings.emergencyPct || 50) / 100)
    setPreview({ kind: 'withdraw', alert: a, vaultName: a.vaultName, amountUsdc: (amtUnits / 1e6).toFixed(2), pctLabel: settings.emergencyFull ? 'full position' : `${settings.emergencyPct || 50}% · your setting`, toShort: short(userAddress) })
  }
  const confirmPreview = () => {
    if (preview?.kind === 'harvest') onHarvest(preview.alert)
    else if (preview?.kind === 'withdraw') onEmergencyWithdraw(preview.alert)
    setPreview(null)
  }

  return (
    <div className="panel">
      <style>{`@keyframes yvpulse{0%,100%{opacity:1}50%{opacity:.25}}@media(prefers-reduced-motion:reduce){.yv-pulse{animation:none!important}}`}</style>
      <div className="panel-head">
        <div className="panel-title">{t(lang, 'agentStatus')}</div>
        <span className="panel-meta" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className="yv-pulse" style={{ width: 7, height: 7, borderRadius: '50%', background: active ? 'var(--ok)' : 'var(--text-muted)', animation: active ? 'yvpulse 1.6s ease-in-out infinite' : 'none' }} />
            {active ? 'monitoring' : 'stopped'}
          </span>
        </span>
      </div>

      {/* CHANGE 1: Portfolio summary */}
      <div style={{ padding: '6px 0 8px', borderBottom: '.5px solid rgba(255,255,255,.06)', marginBottom: 6 }}>
        <div style={{ fontSize: 10, letterSpacing: '.04em', opacity: .6 }}>TOTAL PORTFOLIO</div>
        <div className="mono tnum" style={{ fontSize: 13, marginTop: 2 }}>
          {(totalUnits / 1e6).toFixed(2)} USDC · blended {blendedApy.toFixed(1)}% APY · <span style={{ color: 'var(--ok)' }}>+{(earnedUnits / 1e6).toFixed(2)} earned</span>
        </div>
        <div style={{ fontSize: 10, opacity: .5, marginTop: 2 }}>Last updated: {formatTime(lastUpdated, now)}</div>
      </div>

      {/* CHANGE 2: Enriched positions */}
      <div style={{ fontSize: 10, letterSpacing: '.04em', opacity: .6, margin: '2px 0 4px' }}>POSITIONS</div>
      {posList.length === 0 ? (
        <div className="empty" style={{ lineHeight: 1.6 }}>
          No active positions. Start a new strategy to begin farming.
          {onNewStrategy && <div><button style={{ ...btn, marginLeft: 0 }} onClick={onNewStrategy}>{t(lang, 'newStrategy')}</button></div>}
        </div>
      ) : (
        posList.map(([addr, p]) => {
          const apy = apyOf(addr)
          const bal = u(p.balance)
          const daily = bal * (apy / 100) / 365
          const pct = totalUnits > 0 ? (Number(p.balance) / totalUnits) * 100 : 0
          const earned = u(p.unclaimedRewards)
          return (
            <div key={addr} style={{ padding: '5px 0' }}>
              <div style={{ fontSize: 11.5 }}>{p.vaultName}</div>
              <div className="mono act-meta" style={{ fontSize: 10.5, marginTop: 1 }}>
                {bal.toFixed(2)} USDC · {apy.toFixed(1)}% APY · <span style={{ color: earned > 0 ? 'var(--ok)' : 'var(--text-muted)' }}>+{daily.toFixed(3)} USDC/day est.</span>
              </div>
              <div style={{ height: 4, background: 'rgba(255,255,255,.08)', borderRadius: 3, marginTop: 3 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: 'var(--ok)', borderRadius: 3 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                <span style={{ fontSize: 9.5, opacity: .5 }}>{pct.toFixed(0)}% of portfolio</span>
                <button
                  style={{ ...btn, marginTop: 0, marginRight: 0, opacity: withdrawEnabled ? 1 : .4, cursor: withdrawEnabled ? 'pointer' : 'not-allowed' }}
                  disabled={!withdrawEnabled}
                  title={withdrawEnabled ? 'Withdraw from this position' : 'Withdraw unavailable during active execution'}
                  onClick={() => setWithdrawVault({ vault: { name: p.vaultName, address: addr, protocol: vaultMeta[addr.toLowerCase()]?.protocol || '', apy }, balance: p.balance, unclaimedRewards: p.unclaimedRewards })}
                >{t(lang, 'withdraw')}</button>
              </div>
            </div>
          )
        })
      )}

      {/* CHANGE 3 + 6: Alerts with Why?, or healthy state */}
      <div style={{ fontSize: 10, letterSpacing: '.04em', opacity: .6, margin: '8px 0 4px' }}>ALERTS</div>
      {alerts.length === 0 ? (
        <div className="mono" style={{ fontSize: 10.5, opacity: .6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)' }} />
          <span>
            All positions healthy<br />
            Agent checked {posList.length} vault{posList.length === 1 ? '' : 's'} · {formatTime(lastUpdated, now)}
            {nextCheck && ` · next check in ${fmtRemain(nextCheck - now)}`}
          </span>
        </div>
      ) : (
        filteredAlerts.map((a) => (
          <AlertCard key={a.id} alert={a} lang={lang} onHarvest={requestHarvest} onEmergencyWithdraw={requestWithdraw} onReview={onReview} onDismiss={onDismiss} />
        ))
      )}

      <AgentActionPreview preview={preview} onConfirm={confirmPreview} onCancel={() => setPreview(null)} />
      {withdrawVault && (
        <WithdrawModal
          vault={withdrawVault.vault}
          balance={withdrawVault.balance}
          unclaimedRewards={withdrawVault.unclaimedRewards}
          userAddress={userAddress}
          onClose={() => setWithdrawVault(null)}
          onSuccess={onWithdrawSuccess || (() => {})}
        />
      )}
    </div>
  )
}
