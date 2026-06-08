// frontend/src/brain/OnboardingGate.jsx
// One-time ERC-7715 grant gate. Reuses existing grant wiring via the injected
// `grantPermission` callback (connect -> Smart Account upgrade -> wallet_grantPermissions).
// Renders children (the brain) only after a session is granted. The grant is the
// ONLY MetaMask popup in the whole app — the loop runs popup-free afterwards.
import { useState } from 'react'
import { T, mono, geist } from './tokens.js'

export function OnboardingGate({ grantPermission, children }) {
  const [phase, setPhase] = useState('idle') // 'idle' | 'granting' | 'granted'
  const [error, setError] = useState(null)

  const handleGrant = async () => {
    setError(null); setPhase('granting')
    try {
      await grantPermission()           // connect + upgrade + wallet_grantPermissions (ERC-7715/7710)
      setPhase('granted')
    } catch (err) {
      setError(err?.message ?? 'grant failed'); setPhase('idle')
    }
  }

  if (phase === 'granted') return children

  // Document-grade onboarding card (design §6 perm-doc tone). Single accent CTA.
  return (
    <div style={{ minHeight: '100vh', background: T.bgBase, display: 'grid', placeItems: 'center' }}>
      <div style={{ maxWidth: 520, background: T.bgCard, border: `1px solid ${T.borderStrong}`, borderRadius: 14, padding: 36 }}>
        <div style={{ ...mono, fontSize: 11, color: T.textMuted }}>
          <span style={{ color: T.accent }}>04</span> · grant · erc-7715 →→ erc-7710
        </div>
        <h1 style={{ ...geist, fontSize: 32, color: T.text, margin: '14px 0 8px', letterSpacing: '-0.02em' }}>
          Izinkan agent — sekali saja.
        </h1>
        <p style={{ ...geist, fontSize: 15, color: T.textMuted, lineHeight: 1.55 }}>
          Satu tanda tangan upgrade wallet ke Smart Account dan grant scoped permission.
          Setelah ini, loop jalan otonom tanpa popup MetaMask sampai expiry atau kamu revoke.
        </p>
        {error && (
          <div style={{ ...mono, fontSize: 11.5, color: T.danger, marginTop: 12 }}>{error}</div>
        )}
        <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 22, paddingTop: 18 }}>
          <button
            onClick={handleGrant}
            disabled={phase === 'granting'}
            style={{ ...geist, fontWeight: 500, padding: '14px 22px', borderRadius: 8, border: 'none',
              background: T.accent, color: T.accentFg, cursor: phase === 'granting' ? 'default' : 'pointer' }}
          >
            {phase === 'granting' ? 'Menunggu tanda tangan…' : 'Connect & grant permission'}
          </button>
        </div>
      </div>
    </div>
  )
}
