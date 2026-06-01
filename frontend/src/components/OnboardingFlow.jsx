// OnboardingFlow.jsx
// APY-first onboarding for users who have never connected a wallet.
// Screen 1: value proposition + live vault rates (no wallet needed).
// Screen 2: how it works (shown after connect, before Step 01).
// Self-fetches DeFiLlama data so APY is visible with zero wallet interaction.
import React, { useState, useEffect } from 'react'
import { Icon } from '../components.jsx'
import { fetchDeFiLlamaVaults } from '../defiLlama.js'
import { fetchApyHistoryBatch } from '../apyHistory.js'
import { generateSparkline, calcApyStats } from '../sparkline.js'
import { VAULT_CATALOG } from '../config.js'

const FLASK_URL = 'https://metamask.io/flask/'
const SEED = VAULT_CATALOG.slice(0, 3).map((v) => ({ name: v.name, protocol: v.protocol, apy: v.apy, poolId: null }))

const HOW_STEPS = [
  { n: '①', title: 'Venice AI picks the best vault for your risk profile', quote: 'Like having a DeFi advisor who actually knows the market' },
  { n: '②', title: 'You approve ONE permission with clear limits', quote: 'Like giving a debit card with a spending limit to an assistant', meta: 'Max amount: you decide · Vault: you decide · Revoke anytime' },
  { n: '③', title: 'Agent executes automatically · you pay zero gas', quote: '1Shot relayer covers all gas fees' },
  { n: '④', title: 'Background agent monitors 24/7', quote: 'APY drops? You get alerted. Risk detected? Emergency exit ready.' },
]

const wrap = { flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', placeItems: 'center', padding: 28, textAlign: 'center' }

function ValueScreen({ vaults, histories, onConnect }) {
  return (
    <div className="enter" style={wrap}>
      <div style={{ maxWidth: 460, width: '100%' }}>
        <div className="brand" style={{ justifyContent: 'center', fontSize: 20 }}>
          <span>vibing</span><span className="slash">/</span><span className="vibing">farmer</span>
        </div>

        <h1 className="h-display" style={{ marginTop: 22, fontSize: 30 }}>Your USDC. Earning yield.</h1>
        <p className="lede" style={{ margin: '8px auto 0' }}>Zero gas. One permission.</p>

        <div className="mono" style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'lowercase', letterSpacing: '-0.01em', margin: '28px 0 10px', textAlign: 'left' }}>
          live vault rates right now
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
          {vaults.map((v, i) => {
            const stats = v.poolId && histories[v.poolId] ? calcApyStats(histories[v.poolId]) : null
            return (
              <div key={v.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                <span style={{ flex: 1, textAlign: 'left', fontSize: 13 }}>{v.name}</span>
                {stats && <span dangerouslySetInnerHTML={{ __html: generateSparkline(stats.values, { width: 56, height: 22 }) }} />}
                <span className="mono tnum accent" style={{ fontSize: 13, fontWeight: 600, minWidth: 64, textAlign: 'right' }}>{Number(v.apy).toFixed(1)}% APY</span>
              </div>
            )
          })}
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <span style={{ flex: 1, textAlign: 'left', fontSize: 13, color: 'var(--text-muted)' }}>vs leaving in wallet</span>
            <span className="mono tnum" style={{ fontSize: 13, color: 'var(--text-faint)' }}>0.0% APY</span>
          </div>
        </div>

        <button className="btn btn-primary btn-lg" style={{ marginTop: 24 }} onClick={onConnect}>
          Connect wallet &amp; start farming <Icon name="arrow" size={14} />
        </button>

        <div className="foot-note" style={{ marginTop: 18 }}>
          Already have MetaMask Flask? Connect above.<br />
          Need Flask? <a href={FLASK_URL} target="_blank" rel="noopener noreferrer" className="accent" style={{ textDecoration: 'none' }}>Download in 2 minutes →</a>
        </div>
      </div>
    </div>
  )
}

function HowItWorksScreen({ onDone, onSkip }) {
  return (
    <div className="enter" style={wrap}>
      <div style={{ maxWidth: 520, width: '100%' }}>
        <h1 className="h-display" style={{ fontSize: 28 }}>How Vibing Farmer works</h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, margin: '28px 0', textAlign: 'left' }}>
          {HOW_STEPS.map((s) => (
            <div key={s.n} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span className="mono accent" style={{ fontSize: 18, lineHeight: '22px', flex: 'none' }}>{s.n}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{s.title}</div>
                <div className="lede" style={{ fontSize: 12.5, marginTop: 4, fontStyle: 'italic' }}>"{s.quote}"</div>
                {s.meta && <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{s.meta}</div>}
              </div>
            </div>
          ))}
        </div>
        <div className="action-row" style={{ justifyContent: 'center', gap: 10 }}>
          <button className="btn btn-ghost" onClick={onSkip}>Skip intro <Icon name="arrow" size={13} /></button>
          <button className="btn btn-primary btn-lg" onClick={onDone}>Got it, let's start <Icon name="arrow" size={14} /></button>
        </div>
      </div>
    </div>
  )
}

export default function OnboardingFlow({ connected, onConnect, onComplete }) {
  const [screen, setScreen] = useState(1)
  const [vaults, setVaults] = useState(SEED)
  const [histories, setHistories] = useState({})

  // Fetch live vault data on mount — no wallet needed.
  useEffect(() => {
    let alive = true
    fetchDeFiLlamaVaults().then((vs) => {
      if (!alive || !vs?.length) return
      const top = vs.slice(0, 3)
      setVaults(top)
      const ids = top.map((v) => v.poolId).filter(Boolean)
      if (ids.length) fetchApyHistoryBatch(ids).then((m) => { if (alive) setHistories(m) })
    })
    return () => { alive = false }
  }, [])

  // Advance to "how it works" once the wallet connects.
  useEffect(() => { if (connected && screen === 1) setScreen(2) }, [connected, screen])

  if (screen === 1) return <ValueScreen vaults={vaults} histories={histories} onConnect={onConnect} />
  return <HowItWorksScreen onDone={onComplete} onSkip={onComplete} />
}
