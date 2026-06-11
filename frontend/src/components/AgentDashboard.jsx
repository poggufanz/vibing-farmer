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
  if (!ts) return '-'
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
  rebalance_proposal: { dot: '◉',  color: 'var(--info)',   title: 'Rebalance opportunity' },
  apy_drift:          { dot: '⚠',  color: 'var(--warn)',   title: 'APY drop' },
  risk_alert:         { dot: '🚨', color: 'var(--danger)', title: 'Risk detected' },
}

const alertLine = (a) => {
  switch (a.kind) {
    case 'harvest_ready':      return `${a.vaultName} · ${a.rewardsUsdc} USDC unclaimed`
    case 'harvest_executed':   return `${a.vaultName} · claimed`
    case 'harvest_failed':     return `${a.vaultName} · ${a.error}`
    case 'rebalance_proposal': return `${a.fromVault} ${a.fromApy}% → ${a.toProtocol} ${a.toApy}% (+${a.apyGain}%)`
    case 'apy_drift':          return `${a.vaultName} · ${a.baselineApy}% → ${a.currentApy}% (${a.driftPct}%)`
    case 'risk_alert':         return `${a.vaultName} · security signal detected`
    default:                   return a.vaultName || ''
  }
}

const whyText = (a) => {
  switch (a.kind) {
    case 'apy_drift':          return `APY compressed ${a.driftPct}% since deposit (${a.baselineApy}% → ${a.currentApy}%). Consider rebalancing if the drop persists into the next monitoring cycle.`
    case 'rebalance_proposal': return `${a.toProtocol} currently offers ${a.toApy}% vs your ${a.fromVault} position at ${a.fromApy}% · a ${a.apyGain}% gap. Rebalancing would capture that extra yield (break-even after gas: ~2 days).`
    case 'risk_alert':         return `Severity ${a.severity} · classified by Venice AI. ${(a.searchAnswer || '').slice(0, 180)}`
    case 'harvest_ready':      return `${a.rewardsUsdc} USDC of yield has accrued and is ready to claim. Claiming resets the accrual clock.`
    default:                   return a.error || ''
  }
}

// ─── Shared style primitives ────────────────────────────────────────────────
const mono = { fontFamily: 'var(--font-mono)', fontSize: 10.5 }
const sectionLabel = {
  fontSize: 11, letterSpacing: '0.01em', textTransform: 'capitalize', fontWeight: 500,
  color: 'var(--text-muted)', marginBottom: 10,
}
const textBtn = (color = 'var(--text-muted)') => ({
  appearance: 'none', border: 0, background: 'transparent',
  fontSize: 11, color, cursor: 'pointer', padding: 0,
  fontFamily: 'var(--font-mono)', lineHeight: 1,
})

// ─── AlertCard ───────────────────────────────────────────────────────────────
function AlertCard({ alert, lang = 'en', onHarvest, onEmergencyWithdraw, onReview, onDismiss }) {
  const [why, setWhy] = useState(false)
  const meta = ALERT_META[alert.kind] || { dot: '·', color: 'var(--text-muted)', title: alert.kind }
  const src = alert.sources && alert.sources[0]

  const borderColor =
    alert.kind === 'risk_alert'         ? 'var(--danger)' :
    alert.severity === 'high'           ? 'var(--danger)' :
    alert.kind === 'apy_drift'          ? 'var(--warn)'   :
    alert.severity === 'medium'         ? 'var(--warn)'   :
    alert.kind === 'rebalance_proposal' ? 'var(--info)'   :
    meta.color

  const bgTint =
    alert.kind === 'risk_alert'         ? 'rgba(255,116,121,0.04)' :
    alert.kind === 'apy_drift'          ? 'rgba(240,181,74,0.04)'  :
    alert.kind === 'rebalance_proposal' ? 'rgba(122,159,255,0.04)' :
    'rgba(111,227,154,0.04)'

  return (
    <div style={{
      borderLeft: `2px solid ${borderColor}`,
      background: bgTint,
      borderRadius: `0 var(--radius-sm) var(--radius-sm) 0`,
      padding: '10px 12px 10px 14px',
      marginBottom: 6,
    }}>
      {/* Title + dismiss */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span aria-hidden="true" style={{ fontSize: 11 }}>{meta.dot}</span>
            <span style={{ color: 'var(--text)' }}>{meta.title}</span>
            {alert.severity && (
              <span style={{ fontWeight: 400, color: 'var(--text-faint)', fontSize: 10.5 }}>· {alert.severity}</span>
            )}
          </div>
          <div style={{ ...mono, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>
            {alertLine(alert)}
          </div>
        </div>
        <button
          style={{ ...textBtn('var(--text-faint)'), fontSize: 15, paddingLeft: 8, lineHeight: 1 }}
          onClick={() => onDismiss(alert.id)}
          aria-label="dismiss"
        >×</button>
      </div>

      {/* Actions row */}
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 8, gap: 12 }}>
        <button
          style={{ ...textBtn('var(--text-faint)'), textDecoration: 'underline', textDecorationColor: 'var(--border-strong)' }}
          aria-expanded={why}
          onClick={() => setWhy((v) => !v)}
        >
          Why? {why ? '↑' : '↗'}
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 14 }}>
          {alert.kind === 'harvest_ready' && (
            <button style={textBtn('var(--ok)')} onClick={() => onHarvest(alert)}>
              {t(lang, 'harvest')} →
            </button>
          )}
          {alert.kind === 'rebalance_proposal' && (
            <button style={textBtn('var(--text)')} onClick={() => onReview(alert)}>
              Review →
            </button>
          )}
          {alert.kind === 'risk_alert' && (
            <button style={textBtn('var(--danger)')} onClick={() => onEmergencyWithdraw(alert)}>
              Emergency withdraw →
            </button>
          )}
        </div>
      </div>

      {/* Why expanded */}
      {why && (
        <div style={{
          ...mono, color: 'var(--text-muted)', lineHeight: 1.55,
          marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)',
        }}>
          {whyText(alert)}
          {src && (
            <div style={{ marginTop: 4 }}>
              Source:{' '}
              <a href={src.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--info)', textDecoration: 'none' }}>
                {(src.title || src.url).slice(0, 48)} ↗
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── AgentDashboard ──────────────────────────────────────────────────────────
export default function AgentDashboard({
  active, positions = {}, alerts = [], vaultMeta = {}, lastUpdated = null, userAddress, settings = {},
  withdrawEnabled = true, onHarvest, onEmergencyWithdraw, onReview, onDismiss, onWithdrawSuccess, onNewStrategy,
  loopPanel = null, loopStatus = null, decisionPanel = null,
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
    if (alert.severity === 'high')   return alertSeverity?.high !== false
    if (alert.severity === 'medium') return alertSeverity?.medium !== false
    if (alert.severity === 'low')    return alertSeverity?.low === true
    return true
  })

  const posList = Object.entries(positions)
  const apyOf = (addr) => vaultMeta[addr.toLowerCase()]?.apy || 0
  const totalUnits = posList.reduce((s, [, p]) => s + Number(p.balance || 0), 0)
  const earnedUnits = posList.reduce((s, [, p]) => s + Number(p.unclaimedRewards || 0), 0)
  const blendedApy = totalUnits > 0
    ? posList.reduce((s, [a, p]) => s + Number(p.balance || 0) * apyOf(a), 0) / totalUnits
    : 0
  const nextCheck = lastUpdated ? lastUpdated + POSITION_INTERVAL : null

  // Preview interceptors — actual execution runs on confirm via props
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
    <div className="panel enter">
      <style>{`@keyframes yvpulse{0%,100%{opacity:1}50%{opacity:.25}}@media(prefers-reduced-motion:reduce){.yv-pulse{animation:none!important}}`}</style>

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: 16, borderBottom: '1px solid var(--border)', marginBottom: 20,
      }}>
        <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.015em', color: 'var(--text)' }}>
          Autonomous Agent
        </span>
        {(() => {
          // One status line for the whole panel: loop state wins when the loop runs.
          const loopOn = loopStatus?.running
          const cycling = Boolean(loopOn && loopStatus.phase && loopStatus.phase !== 'sleep')
          const on = loopOn || active
          const statusText = !on ? 'stopped'
            : cycling ? `evaluating · ${loopStatus.phase}`
            : 'monitoring'
          return (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, ...mono }}>
              <span
                className="yv-pulse"
                style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: !on ? 'var(--text-faint)' : cycling ? 'var(--warn)' : 'var(--ok)',
                  animation: on ? `yvpulse ${cycling ? '0.8s' : '1.6s'} ease-in-out infinite` : 'none',
                }}
              />
              <span style={{ color: !on ? 'var(--text-faint)' : cycling ? 'var(--warn)' : 'var(--ok)' }}>
                {statusText}
              </span>
              <span style={{ color: 'var(--text-faint)' }}>
                {loopOn ? `· cycle ${String(loopStatus.cycle || 0).padStart(2, '0')}` : '· co-pilot'}
              </span>
            </span>
          )
        })()}
      </div>

      {/* ── TOTAL PORTFOLIO ────────────────────────────────────────────── */}
      <div style={{ paddingBottom: 20, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <div style={sectionLabel}>Total Portfolio</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
              <span className="tnum" style={{
                fontSize: '2.4rem', fontWeight: 500, lineHeight: 1,
                letterSpacing: '-0.03em', color: 'var(--text)',
              }}>
                {(totalUnits / 1e6).toFixed(2)}
              </span>
              <span style={{ ...mono, color: 'var(--text-faint)', paddingBottom: 3 }}>USDC</span>
            </div>
            <div style={{ ...mono, color: 'var(--text-muted)', marginTop: 6 }}>
              deposited · blended {blendedApy.toFixed(1)}% APY
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div className="tnum" style={{ fontSize: 15, fontWeight: 500, color: earnedUnits > 0 ? 'var(--ok)' : 'var(--text-faint)' }}>
              +{(earnedUnits / 1e6).toFixed(4)}
            </div>
            <div style={{ ...mono, color: 'var(--text-faint)', marginTop: 3 }}>
              earned · {formatTime(lastUpdated, now)}
            </div>
          </div>
        </div>
      </div>

      {/* ── POSITIONS ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={sectionLabel}>Positions</div>

        {posList.length === 0 ? (
          /* Empty state */
          <div style={{ textAlign: 'center', padding: '36px 16px' }}>
            <div style={{ fontSize: 26, color: 'var(--text-faint)', marginBottom: 14, lineHeight: 1 }}>○</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6 }}>
              no active positions
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.65, marginBottom: 20 }}>
              Start your first strategy to begin farming.<br />
              AI will recommend the optimal vault.
            </div>
            {onNewStrategy && (
              <button style={textBtn('var(--text-muted)')} onClick={onNewStrategy}>
                {t(lang, 'newStrategy')} →
              </button>
            )}
          </div>
        ) : (
          posList.map(([addr, p]) => {
            const apy = apyOf(addr)
            const bal = u(p.balance)
            const daily = bal * (apy / 100) / 365
            const pct = totalUnits > 0 ? (Number(p.balance) / totalUnits) * 100 : 0
            return (
              <div key={addr} style={{
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                padding: '14px 16px',
                marginBottom: 8,
              }}>
                {/* Name + amount */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 3, lineHeight: 1.3 }}>
                      {p.vaultName}
                    </div>
                    <div style={{ ...mono, color: 'var(--text-faint)' }}>
                      {vaultMeta[addr.toLowerCase()]?.protocol || ''}{vaultMeta[addr.toLowerCase()]?.protocol ? ' · ' : ''}{apy.toFixed(1)}% APY
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="tnum" style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', lineHeight: 1.3 }}>
                      {bal.toFixed(2)}{' '}
                      <span style={{ ...mono, fontSize: 10, color: 'var(--text-faint)' }}>USDC</span>
                    </div>
                    <div className="tnum" style={{ ...mono, color: 'var(--ok)', marginTop: 3 }}>
                      +{daily.toFixed(4)}/day
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,.06)', borderRadius: 2 }}>
                    <div style={{
                      height: '100%', width: `${pct}%`,
                      background: 'var(--accent)', borderRadius: 2,
                      transition: 'width .4s ease',
                    }} />
                  </div>
                  <span style={{ ...mono, fontSize: 10, color: 'var(--text-faint)', minWidth: 26, textAlign: 'right' }}>
                    {pct.toFixed(0)}%
                  </span>
                </div>

                {/* Withdraw */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    style={{
                      ...textBtn(withdrawEnabled ? 'var(--text-muted)' : 'var(--text-faint)'),
                      opacity: withdrawEnabled ? 1 : .45,
                      cursor: withdrawEnabled ? 'pointer' : 'not-allowed',
                    }}
                    disabled={!withdrawEnabled}
                    title={withdrawEnabled ? 'Withdraw from this position' : 'Withdraw unavailable during active execution'}
                    onClick={() => setWithdrawVault({
                      vault: { name: p.vaultName, address: addr, protocol: vaultMeta[addr.toLowerCase()]?.protocol || '', apy },
                      balance: p.balance,
                      unclaimedRewards: p.unclaimedRewards,
                    })}
                  >
                    withdraw →
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ── ALERTS ─────────────────────────────────────────────────────── */}
      <div>
        <div style={sectionLabel}>Alerts</div>

        {alerts.length === 0 ? (
          /* Healthy state */
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            borderLeft: '2px solid var(--ok)',
            background: 'rgba(111,227,154,0.04)',
            borderRadius: `0 var(--radius-sm) var(--radius-sm) 0`,
            padding: '10px 12px 10px 14px',
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--ok)', marginTop: 5, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 3 }}>
                All positions healthy
              </div>
              <div style={{ ...mono, color: 'var(--text-faint)', lineHeight: 1.5 }}>
                {posList.length} vault{posList.length === 1 ? '' : 's'} monitored · {formatTime(lastUpdated, now)}
                {nextCheck && <span> · next check {fmtRemain(nextCheck - now)}</span>}
              </div>
            </div>
          </div>
        ) : (
          filteredAlerts.map((a) => (
            <AlertCard
              key={a.id}
              alert={a}
              lang={lang}
              onHarvest={requestHarvest}
              onEmergencyWithdraw={requestWithdraw}
              onReview={onReview}
              onDismiss={onDismiss}
            />
          ))
        )}
      </div>

      {loopPanel && (
        <div style={{ paddingTop: 20, borderTop: '1px solid var(--border)', marginTop: 20 }}>
          <div style={sectionLabel}>Monitor Loop</div>
          {loopPanel}
        </div>
      )}

      {decisionPanel && (
        <div style={{ paddingTop: 20, borderTop: '1px solid var(--border)', marginTop: 20 }}>
          <div style={sectionLabel}>Decision Log</div>
          {decisionPanel}
        </div>
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
