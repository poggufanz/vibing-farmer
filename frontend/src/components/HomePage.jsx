// HomePage.jsx
// Command center — context-aware home wired to wallet + position state.
// State 1: no wallet · State 2: connected, no positions · State 3: active positions.
import React, { useState, useEffect } from 'react'
import WithdrawModal from './WithdrawModal.jsx'
import { getTransactions } from '../history.js'
import { fetchDeFiLlamaVaults } from '../defiLlama.js'
import { VAULT_CATALOG } from '../config.js'
import { loadSettings, t } from '../settingsStore.js'

const POLL_MS = 10 * 60 * 1000
const u = (x) => Number(x || 0) / 1e6
const fmtAmt = (n) => (+Number(n || 0).toFixed(2)).toString()
const formatTime = (ts, now = Date.now()) => {
  if (!ts) return '—'
  const { timestampFormat } = loadSettings()
  if (timestampFormat === 'absolute') {
    return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  }
  const s = Math.max(0, Math.floor((now - ts) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  return `${Math.floor(s / 3600)}h ago`
}
// Seed Market Pulse from the static catalog so rows render before the first fetch.
const SEED = VAULT_CATALOG.map((v) => ({ name: v.name, protocol: v.protocol, apy: v.apy, tvlFormatted: null, source: 'fallback' }))
let pulseCache = null // module-level: survives nav remount within a session

const eyebrow = { fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.06em', color: 'var(--text-faint)', textTransform: 'uppercase' }
const linkBtn = { appearance: 'none', border: 0, background: 'transparent', font: 'inherit', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }
const card = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }
const cardPad = { ...card, padding: '16px 18px' }
const section = { marginBottom: 28 }
const sub = { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }
const pillBtn = { appearance: 'none', border: '.5px solid rgba(255,255,255,.18)', borderRadius: 5, background: 'rgba(255,255,255,.06)', color: 'inherit', font: 'inherit', fontSize: 10.5, padding: '4px 9px', cursor: 'pointer' }
const dot = (c) => ({ width: 8, height: 8, borderRadius: '50%', background: c, flex: 'none' })

const alertText = (a) => {
  switch (a.kind) {
    case 'risk_alert': return `Risk detected · ${a.vaultName}`
    case 'apy_drift': return `APY drop detected · ${a.vaultName}`
    case 'rebalance_proposal': return `Rebalance proposed · +${a.apyGain}% opportunity`
    case 'harvest_ready': return `Harvest ready · ${a.vaultName}`
    case 'harvest_executed': return `Harvested · ${a.vaultName}`
    case 'harvest_failed': return `Harvest failed · ${a.vaultName}`
    default: return `${String(a.kind || 'event').replace(/_/g, ' ')} · ${a.vaultName || ''}`
  }
}
const alertIcon = (a) => {
  if (a.kind === 'risk_alert' || a.kind === 'apy_drift') return { icon: '⚠', color: 'var(--warn)' }
  if (a.kind === 'harvest_failed') return { icon: '✗', color: 'var(--danger)' }
  return { icon: '●', color: 'var(--text-muted)' }
}

const SectionHead = ({ title, action, onAction }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
    <span style={eyebrow}>{title}</span>
    {action && <button style={linkBtn} onClick={onAction}>{action}</button>}
  </div>
)

export default function HomePage({
  userAddress, positions = {}, alerts = [], vaultMeta = {}, lastUpdated = null,
  agentActive = false, autoHarvest = false,
  onConnect, onStartStrategy, onOpenAgent, onViewHistory, onWithdrawSuccess,
}) {
  const [withdrawVault, setWithdrawVault] = useState(null)
  const [dismissed, setDismissed] = useState(() => new Set())
  const [pulse, setPulse] = useState(() => pulseCache || { vaults: SEED, prev: [], fetchedAt: null, live: false })
  const [sortBy, setSortBy] = useState('tvl')
  const [sortDir, setSortDir] = useState('desc')
  const [filterRisk, setFilterRisk] = useState('all')

  // Read settings once, before any early return (was declared after the no-wallet return → TDZ crash)
  const settings = loadSettings()
  const lang = settings.language

  const posList = Object.entries(positions)

  // Market Pulse: fetch on mount if not cached/stale, refresh every 10 min, cleanup on unmount.
  useEffect(() => {
    if (!userAddress) return
    let alive = true
    const load = async () => {
      const vaults = await fetchDeFiLlamaVaults()
      if (!alive) return
      setPulse((prev) => {
        const next = { vaults, prev: prev.vaults || [], fetchedAt: Date.now(), live: vaults[0]?.source === 'defiLlama' }
        pulseCache = next
        return next
      })
    }
    if (!pulseCache || !pulseCache.fetchedAt || Date.now() - pulseCache.fetchedAt > POLL_MS) load()
    const id = setInterval(load, POLL_MS)
    return () => { alive = false; clearInterval(id) }
  }, [userAddress])

  // ── STATE 1: no wallet ──────────────────────────────────────────────
  if (!userAddress) {
    return (
      <div className="enter" style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 28, textAlign: 'center' }}>
        <div style={{ maxWidth: 420 }}>
          <img src="/vibing_farmer.logo.svg" alt="Vibing Farmer Logo" style={{ width: 80, height: 80, margin: '0 auto 24px', display: 'block' }} />
          <div className="brand" style={{ justifyContent: 'center', fontSize: 22 }}>
            <span>vibing</span><span className="slash">/</span><span className="vibing">farmer</span>
          </div>
          <p className="lede" style={{ margin: '18px auto 0', fontSize: 14 }}>
            Autonomous yield farming. Set permission once — agent farms forever.
          </p>
          <button className="btn btn-primary" style={{ marginTop: 24 }} onClick={onConnect}>{t(lang, 'connectWallet')}</button>
          <div className="mono" style={{ marginTop: 20, fontSize: 11, color: 'var(--text-faint)' }}>
            relayer: 1Shot · gas: 0 · network: sepolia
          </div>
        </div>
      </div>
    )
  }

  const now = Date.now()
  const apyOf = (addr) => vaultMeta[addr.toLowerCase()]?.apy || 0
  const totalUnits = posList.reduce((s, [, p]) => s + Number(p.balance || 0), 0)
  const earnedToday = posList.reduce((s, [a, p]) => s + u(p.balance) * (apyOf(a) / 100) / 365, 0)
  const mode = autoHarvest ? 'autopilot' : 'co-pilot'

  // Alert banner: first unread high/medium risk alert (dismiss is per-session, local state).
  const { alertBanner } = settings
  const bannerEnabled = alertBanner !== false
  const banner = bannerEnabled && alerts.find((a) => a.kind === 'risk_alert' && (a.severity === 'high' || a.severity === 'medium') && !dismissed.has(a.id))

  // Recent activity: transactions + agent events, merged, newest 5.
  const txItems = getTransactions().map((t) => ({
    icon: t.status === 'failed' ? '✗' : '✓',
    color: t.status === 'failed' ? 'var(--danger)' : 'var(--ok)',
    text: `${t.type === 'withdraw' ? 'Withdrew' : 'Deposited'} ${fmtAmt(t.amountUsdc)} USDC → ${t.vaultName}`,
    ts: t.timestamp,
  }))
  const alertItems = alerts.map((a) => ({ ...alertIcon(a), text: alertText(a), ts: a.timestamp || lastUpdated }))
  const activity = [...txItems, ...alertItems].sort((x, y) => (y.ts || 0) - (x.ts || 0)).slice(0, 5)

  const lastAlert = alerts[0]
  const fresh = pulse.fetchedAt && now - pulse.fetchedAt < POLL_MS
  const live = fresh && pulse.live
  const arrowFor = (v) => {
    const p = pulse.prev.find((x) => x.name === v.name)
    if (!p) return { sym: '→', txt: 'stable', color: 'var(--text-muted)' }
    const d = +(v.apy - p.apy).toFixed(2)
    if (d > 0.05) return { sym: '↑', txt: `+${d}% from last check`, color: 'var(--ok)' }
    if (d < -0.05) return { sym: '↓', txt: `${d}% from last check`, color: 'var(--danger)' }
    return { sym: '→', txt: 'stable', color: 'var(--text-muted)' }
  }

  const loading = !!userAddress && !pulse.fetchedAt
  const posEntries = Object.entries(positions)
  const isActive = (v) => v.address && posEntries.some(([a]) => a.toLowerCase() === v.address.toLowerCase())
  const getPositionBalance = (v) => {
    const entry = v.address ? posEntries.find(([a]) => a.toLowerCase() === v.address.toLowerCase()) : null
    return entry ? u(entry[1].balance) : null
  }
  const handleFarm = (v) => {
    sessionStorage.setItem('yv_prefill_protocol', v.protocol)
    sessionStorage.setItem('yv_prefill_name', v.name)
    sessionStorage.setItem('yv_prefill_apy', String(v.apy))
    onStartStrategy()
  }
  const handleSort = (key) => {
    if (sortBy === key) setSortDir((d) => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(key); setSortDir('desc') }
  }
  const riskOrder = { low: 0, medium: 1, high: 2 }
  const sortedVaults = [...pulse.vaults]
    .filter((v) => filterRisk === 'all' || v.risk === filterRisk)
    .sort((a, b) => {
      let cmp = 0
      if (sortBy === 'tvl') cmp = (b.tvlUsd || 0) - (a.tvlUsd || 0)
      else if (sortBy === 'apy') cmp = b.apy - a.apy
      else if (sortBy === 'risk') {
        const ra = riskOrder[a.risk] ?? 1
        const rb = riskOrder[b.risk] ?? 1
        cmp = ra - rb
      }
      return sortDir === 'asc' ? -cmp : cmp
    })

  return (
    <div className="enter" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 28 }}>
      <div style={{ maxWidth: 820, margin: '0 auto', width: '100%' }}>

        {/* ── ALERT BANNER (conditional) ── */}
        {banner && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', ...card, borderLeft: '3px solid var(--danger)', padding: '14px 16px', marginBottom: 24 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>🚨 Risk detected · {banner.vaultName}</div>
              <div style={{ ...sub, marginTop: 4 }}>{(banner.searchAnswer || 'Anomaly reported by Venice AI. Consider emergency withdraw.').slice(0, 160)}</div>
              <button style={{ ...linkBtn, marginTop: 8 }} onClick={onOpenAgent}>View in Agent Dashboard →</button>
            </div>
            <button aria-label="dismiss alert" style={{ ...linkBtn, textDecoration: 'none', fontSize: 14 }}
              onClick={() => setDismissed((s) => new Set(s).add(banner.id))}>✕</button>
          </div>
        )}

        {posList.length === 0 ? (
          /* ── STATE 2: connected, no positions ── */
          <div style={section}>
            <SectionHead title="Portfolio" />
            <div style={cardPad}>
              <div className="tnum" style={{ fontSize: 20, fontWeight: 500 }}>
                0.00 <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>USDC · no active positions</span>
              </div>
              <p className="lede" style={{ fontSize: 13, marginTop: 12, maxWidth: 520 }}>
                Start your first strategy to begin farming. Venice AI will recommend the best vault for
                your risk profile. Agent will execute automatically — you pay zero gas.
              </p>
              <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={onStartStrategy}>Start Strategy →</button>
            </div>
          </div>
        ) : (
          <>
            {/* ── SECTION 1: Portfolio summary ── */}
            <div style={section}>
              <SectionHead title="Portfolio Summary" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
                <div style={cardPad}>
                  <div style={eyebrow}>Total Deposited</div>
                  <div className="tnum" style={{ fontSize: 22, fontWeight: 500, marginTop: 8 }}>{fmtAmt(u(totalUnits))} <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>USDC</span></div>
                  <div style={sub}>across {posList.length} vault{posList.length === 1 ? '' : 's'}</div>
                </div>
                <div style={cardPad}>
                  <div style={eyebrow}>Earned Today</div>
                  <div className="tnum" style={{ fontSize: 22, fontWeight: 500, marginTop: 8, color: 'var(--ok)' }}>+{earnedToday.toFixed(2)} <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>USDC</span></div>
                  <div style={sub}>est. at blended APY</div>
                </div>
                <div style={cardPad}>
                  <div style={eyebrow}>Agent</div>
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 7, fontSize: 14 }}>
                    <span style={dot(agentActive ? 'var(--ok)' : 'var(--text-faint)')} />{agentActive ? 'monitoring' : 'stopped'}
                  </div>
                  <div style={sub}>{mode} mode · {posList.length} worker{posList.length === 1 ? '' : 's'} active</div>
                </div>
              </div>
            </div>

            {/* ── SECTION 2: Active positions ── */}
            <div style={section}>
              <SectionHead title={t(lang, 'activePositions')} action={`+ ${t(lang, 'newStrategy')}`} onAction={onStartStrategy} />
              <div style={{ ...card }}>
                {posList.map(([addr, p], i) => {
                  const apy = apyOf(addr)
                  const bal = u(p.balance)
                  const daily = bal * (apy / 100) / 365
                  const pct = totalUnits > 0 ? (Number(p.balance) / totalUnits) * 100 : 0
                  return (
                    <div key={addr} style={{ padding: '14px 18px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{p.vaultName}</span>
                        <span className="mono tnum" style={{ fontSize: 12 }}>{bal.toFixed(2)} USDC · {apy.toFixed(1)}% APY · <span style={{ color: 'var(--ok)' }}>+{daily.toFixed(3)}/day</span></span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                        <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,.08)', borderRadius: 3 }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--ok)', borderRadius: 3 }} />
                        </div>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--text-faint)', minWidth: 32, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
                        <button style={pillBtn} onClick={() => setWithdrawVault({ vault: { name: p.vaultName, address: addr, protocol: vaultMeta[addr.toLowerCase()]?.protocol || '', apy }, balance: p.balance, unclaimedRewards: p.unclaimedRewards })}>{t(lang, 'withdraw')}</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── SECTION 3: Agent status ── */}
            <div style={section}>
              <SectionHead title={t(lang, 'agentStatus')} />
              <div style={cardPad}>
                {agentActive ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <span style={dot('var(--ok)')} />monitoring · {mode} mode · {posList.length} vault{posList.length === 1 ? '' : 's'} watched
                    </div>
                    {lastAlert && <div style={{ ...sub, marginTop: 10 }}>Last action: {alertText(lastAlert)} · {formatTime(lastAlert.timestamp || lastUpdated, now)}</div>}
                    <button style={{ ...linkBtn, marginTop: 12 }} onClick={onOpenAgent}>Open Agent Dashboard →</button>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                      <span style={{ ...dot('transparent'), border: '1px solid var(--text-faint)' }} />agent inactive
                    </div>
                    <div style={{ ...sub, marginTop: 8 }}>Start a strategy to activate autonomous monitoring.</div>
                  </>
                )}
              </div>
            </div>

            {/* ── SECTION 4: Recent activity ── */}
            <div style={section}>
              <SectionHead title={t(lang, 'recentActivity')} action="View all →" onAction={onViewHistory} />
              <div style={{ ...card }}>
                {activity.length === 0 ? (
                  <div className="empty" style={{ padding: '14px 18px' }}>No activity yet.</div>
                ) : activity.map((e, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 18px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                    <span className="mono" style={{ color: e.color, width: 14, textAlign: 'center' }}>{e.icon}</span>
                    <span style={{ flex: 1, fontSize: 12.5 }}>{e.text}</span>
                    <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{formatTime(e.ts, now)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── SECTION 5: Market Pulse + Vault Table ── */}
            <div style={section}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
                <span style={eyebrow}>{t(lang, 'marketPulse')}</span>
                <span className="mono" style={{ fontSize: 10.5, color: loading ? 'var(--text-faint)' : live ? 'var(--ok)' : 'var(--text-faint)' }}>
                  {loading ? 'fetching live data…' : live ? `live · DeFiLlama · updated ${formatTime(pulse.fetchedAt, now)}` : 'cached · last known data'}
                </span>
              </div>

              {/* Sort + Filter controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10, flexWrap: 'wrap' }}>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-faint)', marginRight: 2 }}>Sort:</span>
                {[['tvl', 'TVL'], ['apy', 'APY'], ['risk', 'Risk']].map(([key, label]) => (
                  <button key={key} onClick={() => handleSort(key)}
                    style={{ ...pillBtn, color: sortBy === key ? 'var(--text-primary, #e8e8e8)' : 'var(--text-muted)', borderColor: sortBy === key ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.12)' }}>
                    {label}{sortBy === key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
                  </button>
                ))}
                <span style={{ width: 1, height: 12, background: 'var(--border)', margin: '0 5px', display: 'inline-block', verticalAlign: 'middle' }} />
                {[['all', 'All'], ['low', 'Low risk'], ['medium', 'Medium'], ['high', 'High']].map(([k, lbl]) => (
                  <button key={k} onClick={() => setFilterRisk(k)}
                    style={{ ...pillBtn, color: filterRisk === k ? 'var(--text-primary, #e8e8e8)' : 'var(--text-muted)', borderColor: filterRisk === k ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.12)' }}>
                    {lbl}
                  </button>
                ))}
              </div>

              {/* Table */}
              <div style={{ ...card }}>
                {/* Column headers */}
                <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.1fr .85fr .95fr .65fr .9fr', gap: 8, padding: '7px 18px', borderBottom: '1px solid var(--border)' }}>
                  {['Vault', 'Protocol', 'APY', 'TVL', 'Risk', 'Action'].map((h) => (
                    <span key={h} className="mono" style={{ fontSize: 9.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{h}</span>
                  ))}
                </div>

                {loading ? (
                  [0, 1, 2, 3].map((i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.1fr .85fr .95fr .65fr .9fr', gap: 8, alignItems: 'center', padding: '11px 18px', borderTop: '1px solid var(--border)' }}>
                      {[130, 75, 42, 52, 28, 40].map((w, j) => (
                        <div key={j} className="skeleton-bar" style={{ height: 10, width: w, borderRadius: 3 }} />
                      ))}
                    </div>
                  ))
                ) : sortedVaults.length === 0 ? (
                  <div style={{ padding: '16px 18px', textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>
                    no vaults match this filter
                  </div>
                ) : (
                  sortedVaults.map((v, i) => {
                    const active = isActive(v)
                    const bal = getPositionBalance(v)
                    const ar = arrowFor(v)
                    const riskColor = v.risk === 'low' ? 'var(--ok)' : v.risk === 'medium' ? '#f59e0b' : '#f97316'
                    return (
                      <div key={v.name} style={{
                        display: 'grid', gridTemplateColumns: '2.2fr 1.1fr .85fr .95fr .65fr .9fr',
                        alignItems: 'center', gap: 8,
                        padding: '11px 18px',
                        paddingLeft: active ? 16 : 18,
                        borderTop: i ? '1px solid var(--border)' : 'none',
                        borderLeft: `2px solid ${active ? 'var(--ok)' : 'transparent'}`,
                        background: active ? 'rgba(255,255,255,.02)' : undefined,
                      }}>
                        <span style={{ fontSize: 12.5 }}>
                          {active && <span style={{ color: 'var(--ok)', marginRight: 5, fontSize: 9 }}>●</span>}
                          {v.name}
                        </span>
                        <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{v.protocol}</span>
                        <span className="mono tnum" style={{ fontSize: 12.5, fontWeight: v.apy > 8 ? 600 : 400 }}>
                          {Number(v.apy).toFixed(1)}%
                          <span style={{ color: ar.color, marginLeft: 3, fontSize: 11 }}>{ar.sym}</span>
                        </span>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>{v.tvlFormatted || '—'}</span>
                        <span className="mono" style={{ fontSize: 11, color: riskColor }}>
                          {v.risk === 'medium' ? 'med' : (v.risk || '—')}
                        </span>
                        <span>
                          {active && bal !== null
                            ? <span className="mono tnum" style={{ fontSize: 11, color: 'var(--ok)' }}>{bal.toFixed(2)} USDC</span>
                            : <button style={linkBtn} onClick={() => handleFarm(v)}>Farm</button>
                          }
                        </span>
                      </div>
                    )
                  })
                )}
              </div>

              <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={onStartStrategy}>Start New Strategy →</button>
            </div>
          </>
        )}
      </div>

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
