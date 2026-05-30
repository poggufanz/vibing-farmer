/* ============================================
   VIBING FARMER — screens (multi-agent edition)
   ============================================ */

const { useState, useEffect, useRef } = React;

const shortAddr = (a) => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
const fakeHash = () => "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

const RISK_OPTIONS = [
  { id: "low", label: "Low", sub: "1 agent · single vault" },
  { id: "med", label: "Medium", sub: "2 agents · balanced" },
  { id: "high", label: "High", sub: "3 agents · diversified" },
];

/* ============================================
   01a — INPUT
   ============================================ */
const InputScreen = ({ amount, setAmount, risk, setRisk, onSubmit }) => {
  const valid = Number(amount) > 0 && risk;
  return (
    <section className="card enter">
      <div className="eyebrow">
        <span className="num">01</span>
        <span>AI Strategy · venice ai · multi-agent</span>
        <span className="rule" />
        <span>06 langkah</span>
      </div>

      <h1 className="h-display">
        Set deposit kamu — biar orchestrator yang spawn agent-nya.
      </h1>
      <p className="lede">
        Venice AI nge-generate strategy: berapa worker agent yang dibutuhin, vault apa yang masing-masing handle,
        dan skill apa yang dia run. Semua relay lewat 1Shot, kamu nggak bayar gas. Permission yang kamu kasih nanti
        scoped per-agent — gak ada agent yang bisa keluar batas vault-nya.
      </p>

      <div className="amount-block">
        <div>
          <div className="amount-label">Jumlah deposit</div>
          <div className="amount-input-row">
            <input
              type="number"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="Jumlah USDC"
              inputMode="decimal"
            />
            <span className="ticker">USDC</span>
          </div>
        </div>

        <div>
          <div className="amount-label">Risk profile · juga nentuin jumlah agent</div>
          <div className="risk-row" role="radiogroup">
            {RISK_OPTIONS.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={risk === r.id}
                className={`risk-opt ${risk === r.id ? "selected" : ""}`}
                onClick={() => setRisk(r.id)}
              >
                <span className="risk-opt-label">{r.label}</span>
                <span className="risk-opt-sub">{r.sub}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="action-row">
        <div className="foot-note">
          Venice AI · privacy-first · <b>no data retention</b>
        </div>
        <button className="btn btn-primary btn-lg" disabled={!valid} onClick={onSubmit}>
          Cari strategy <Icon name="arrow" size={14} />
        </button>
      </div>
    </section>
  );
};

/* ============================================
   01b — AI Thinking (strategy generation)
   ============================================ */
const THINK_STEPS = [
  { label: "Memindai 24 vault aktif di Sepolia", time: "0.4s" },
  { label: "Menyusun allocation per risk profile", time: "1.6s" },
  { label: "Generate skill JSON per worker agent", time: "0.9s" },
];

const ThinkingCard = ({ phase }) => {
  return (
    <section className="thinking enter">
      <div className="eyebrow">
        <span className="num">01</span>
        <span>Venice AI · claude-opus-4-8 · orchestrator planning</span>
      </div>
      <h2 className="thinking-title">Lagi nyusun multi-agent strategy…</h2>

      <div className="thinking-list">
        {THINK_STEPS.map((s, i) => {
          const state = i < phase ? "done" : i === phase ? "active" : "idle";
          return (
            <div key={i} className={`think-step ${state}`}>
              <span className="marker" />
              <span>{s.label}</span>
              <span className="time">{state === "idle" ? "—" : s.time}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
};

/* ============================================
   02 — Connect & EIP-7702 upgrade
   ============================================ */
const ConnectCard = ({ phase, onConnect, onUpgrade, onDone }) => {
  return (
    <section className="card enter">
      <div className="eyebrow">
        <span className="num">02</span>
        <span>Connect · EIP-7702 upgrade</span>
        <span className="rule" />
        <span>required for ERC-7715</span>
      </div>

      <h1 className="h-display">
        Upgrade akun kamu jadi smart account — satu signature, reversible.
      </h1>
      <p className="lede">
        MetaMask kamu masih EOA biasa. EIP-7702 nge-set kode delegasi di akun yang sama,
        jadi smart account aktif tanpa pindah wallet. Setelah ini, orchestrator bisa nge-spawn worker
        agents yang masing-masing punya scoped permission.
      </p>

      {phase === "idle" && (
        <div className="action-row">
          <div className="foot-note">Pastikan MetaMask kamu di network <b>Sepolia</b> testnet.</div>
          <button className="btn btn-primary btn-lg" onClick={onConnect}>
            Connect MetaMask <Icon name="arrow" size={14} />
          </button>
        </div>
      )}

      {phase === "connecting" && (
        <MmDialog
          domain="vibing-farmer.app"
          title="Connection request"
          rows={[
            { k: "request", v: "eth_requestAccounts" },
            { k: "network", v: "Sepolia · 11155111" },
            { k: "status", v: "awaiting user…" },
          ]}
          pending
        />
      )}

      {phase === "connected" && (
        <>
          <MmDialog
            domain="vibing-farmer.app"
            title="EIP-7702 authorization"
            rows={[
              { k: "delegate to", v: "MetaMask Smart Account v1.2", accent: true },
              { k: "chainId", v: "11155111" },
              { k: "nonce", v: "7" },
              { k: "expiry", v: "ephemeral · single tx" },
            ]}
          />
          <div className="action-row">
            <div className="foot-note">Authorization tx bakal di-relay sama 1Shot · gas <b>0</b>.</div>
            <div className="flex gap-2">
              <button className="btn btn-ghost">Cancel</button>
              <button className="btn btn-primary" onClick={onUpgrade}>
                Sign authorization <Icon name="arrow" size={14} />
              </button>
            </div>
          </div>
        </>
      )}

      {phase === "upgrading" && (
        <MmDialog
          domain="1Shot Relayer"
          title="Broadcasting authorization"
          rows={[
            { k: "tx", v: "0x9f3…a124" },
            { k: "relayer", v: "1Shot Permissionless · EIP-7710" },
            { k: "gas paid", v: "by relayer · user 0 ETH", accent: true },
            { k: "status", v: "confirming…" },
          ]}
          pending
        />
      )}

      {phase === "upgraded" && (
        <UpgradedCallout onDone={onDone} />
      )}
    </section>
  );
};

const MmDialog = ({ domain, title, rows, pending }) => (
  <div className="mm-pop enter">
    <div className="mm-pop-head">
      <div className="mm-brand">
        <div className="mm-mark">MM</div>
        <span className="mm-name">MetaMask</span>
      </div>
      <span className="mm-domain">{domain}</span>
    </div>
    <div className="mono" style={{ fontSize: 12, color: "var(--text)", marginBottom: 12, letterSpacing: "-0.01em" }}>
      {title}{pending ? "…" : ""}
    </div>
    <div className="mm-body">
      {rows.map((r, i) => (
        <div key={i} className="row">
          <span className="k">{r.k}</span>
          <span className={`v ${r.accent ? "accent" : ""}`}>{r.v}</span>
        </div>
      ))}
    </div>
  </div>
);

const UpgradedCallout = ({ onDone }) => (
  <div className="enter" style={{ marginTop: 28 }}>
    <div style={{
      borderTop: "1px solid var(--border)",
      borderBottom: "1px solid var(--border)",
      padding: "24px 0",
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: 18,
      alignItems: "center",
    }}>
      <div>
        <div className="mono" style={{ fontSize: 11, color: "var(--accent)", letterSpacing: "-0.01em", marginBottom: 8 }}>
          ✓ smart account active
        </div>
        <div className="h-sub">EOA berhasil di-upgrade. Authorization tx confirmed.</div>
        <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6, letterSpacing: "-0.01em" }}>
          tx · 0x9f3a8b…a124 · relayed by 1Shot
        </div>
      </div>
      <button className="btn btn-primary" onClick={onDone}>
        Lanjut · review skills <Icon name="arrow" size={14} />
      </button>
    </div>
  </div>
);

/* ============================================
   04 — Permission scope (now multi-agent: batched)
   ============================================ */
const PermissionCard = ({ strategy, onGrant, phase, onConfirm }) => {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const expiresFmt = expiresAt.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const agents = strategy?.agents || [];
  const totalMax = agents.reduce((s, a) => s + a.allocation, 0);

  return (
    <section className="card enter">
      <div className="eyebrow">
        <span className="num">04</span>
        <span>Scoped permission · ERC-7715 · {agents.length} grant{agents.length === 1 ? "" : "s"}</span>
        <span className="rule" />
        <span>signed by smart account · batched</span>
      </div>

      <h1 className="h-display">
        Izinkan {agents.length} agent — masing-masing scoped ke vault sendiri.
      </h1>
      <p className="lede">
        Permission ini di-batch dalam satu signature, tapi tiap worker dapat scope sendiri: vault tertentu,
        max amount tertentu, kadaluarsa otomatis. Di luar scope, kontrak <span className="mono">VaultDepositor.sol</span> bakal <b>revert</b>.
      </p>

      <div className="perm-doc">
        <div className="perm-doc-row perm-doc-summary">
          <div className="perm-doc-k">batch.summary</div>
          <div className="perm-doc-v">
            {agents.length} permission · total max <span className="accent">{totalMax} USDC</span>
            <span className="annot">expires {expiresFmt}</span>
          </div>
        </div>
        {agents.map((a) => (
          <div className="perm-doc-row perm-doc-agent" key={a.id}>
            <div className="perm-doc-k">
              <span className="perm-doc-agent-idx mono">{a.idx}</span> {a.id}
            </div>
            <div className="perm-doc-v">
              <div className="perm-doc-agent-line">
                <span className="mono perm-doc-agent-vault">{a.vault.addr.slice(0, 14)}…{a.vault.addr.slice(-4)}</span>
                <span className="annot">{a.vault.protocol}</span>
              </div>
              <div className="perm-doc-agent-line">
                <span className="accent">{a.allocation} USDC max</span>
                <span className="annot">hard cap · exceed = revert</span>
              </div>
            </div>
          </div>
        ))}
        <div className="perm-doc-row">
          <div className="perm-doc-k">expires.at</div>
          <div className="perm-doc-v">
            {expiresFmt}
            <span className="annot">86 400 detik dari sekarang</span>
          </div>
        </div>
        <div className="perm-doc-row">
          <div className="perm-doc-k">revocable</div>
          <div className="perm-doc-v">
            yes · per-agent atau batch
            <span className="annot">kapanpun · satu klik · onchain</span>
          </div>
        </div>
      </div>

      <div className="action-row">
        <div className="foot-note">
          Tiap agent <b>tidak punya akses</b> ke vault agent lain. Kontrak validasi tiap call.
        </div>
        {phase === "idle" && (
          <button className="btn btn-primary btn-lg" onClick={onGrant}>
            Grant {agents.length} permission{agents.length === 1 ? "" : "s"} <Icon name="arrow" size={14} />
          </button>
        )}
        {phase === "prompting" && (
          <span className="foot-note mono">awaiting metamask…</span>
        )}
      </div>

      {phase === "prompting" && (
        <MmPermissionModal strategy={strategy} onConfirm={onConfirm} />
      )}
    </section>
  );
};

const MmPermissionModal = ({ strategy, onConfirm }) => {
  const agents = strategy?.agents || [];
  const total = agents.reduce((s, a) => s + a.allocation, 0);
  return (
    <div className="modal-backdrop" onClick={onConfirm}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-eyebrow">wallet_requestExecutionPermissions · batch</div>
        <h3 className="modal-title">Approve {agents.length} execution permission{agents.length === 1 ? "" : "s"}?</h3>

        <div className="mm-pop" style={{ marginTop: 0 }}>
          <div className="mm-pop-head">
            <div className="mm-brand">
              <div className="mm-mark">MM</div>
              <span className="mm-name">MetaMask</span>
            </div>
            <span className="mm-domain">vibing-farmer.app</span>
          </div>
          <div className="mm-body">
            <div className="row"><span className="k">batch type</span><span className="v accent">vault-deposit · {agents.length}x</span></div>
            <div className="row"><span className="k">total max</span><span className="v accent">{total} USDC</span></div>
            {agents.map((a) => (
              <div className="row" key={a.id}>
                <span className="k">{a.id}</span>
                <span className="v">{a.allocation} USDC · {a.vault.addr.slice(0, 10)}…</span>
              </div>
            ))}
            <div className="row"><span className="k">expires</span><span className="v">86 400s</span></div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onConfirm}>Reject</button>
          <button className="btn btn-primary" onClick={onConfirm}>Approve batch</button>
        </div>
      </div>
    </div>
  );
};

/* ============================================
   06 — Success (multi-agent summary)
   ============================================ */
const SuccessCard = ({ strategy, onAgain }) => {
  const total = strategy?.total ?? 100;
  const apy = strategy?.blendedApy ?? "8.2";
  const monthly = (total * (Number(apy) / 100) / 12).toFixed(2);
  const agents = strategy?.agents || [];
  return (
    <section className="success-card enter">
      <div className="eyebrow">
        <span className="num">06</span>
        <span>{agents.length} agent · {agents.length * 3} tx confirmed</span>
        <span className="rule" />
        <span>≈ 42 detik total</span>
      </div>

      <h1 className="success-title">
        Multi-agent deployment confirmed. {agents.length} worker sekarang earning {apy}% blended APY.
      </h1>

      <div className="success-numbers">
        <div className="success-num-cell">
          <span className="label">total deposited</span>
          <span className="figure tnum">{total}<span className="unit">USDC</span></span>
        </div>
        <div className="success-num-cell">
          <span className="label">est. yield /bulan</span>
          <span className="figure tnum" style={{ color: "var(--accent)" }}>
            +{monthly}<span className="unit">USDC</span>
          </span>
        </div>
        <div className="success-num-cell">
          <span className="label">user signatures</span>
          <span className="figure tnum">2</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)", letterSpacing: "-0.01em", marginTop: -4 }}>
            vs {agents.length * 3 + 2} traditional
          </span>
        </div>
      </div>

      <div className="success-agents">
        {agents.map((a) => (
          <div key={a.id} className="success-agent-row">
            <span className="mono idx">{a.idx}</span>
            <div>
              <div className="name">{a.name}</div>
              <div className="meta mono">{a.vault.name} · {a.vault.protocol}</div>
            </div>
            <div className="value mono tnum">{a.allocation} USDC <span className="muted">→ {a.vault.apy}%</span></div>
          </div>
        ))}
      </div>

      <div className="action-row" style={{ marginTop: 36 }}>
        <div className="foot-note">
          Etherscan · <span style={{ color: "var(--text)" }}>{agents.length * 3} tx confirmed</span> ·
          gas paid by <b>1Shot relayer</b>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost">
            Lihat di Etherscan <Icon name="external" size={13} />
          </button>
          <button className="btn btn-primary" onClick={onAgain}>
            Deposit lagi <Icon name="plus" size={14} />
          </button>
        </div>
      </div>
    </section>
  );
};

Object.assign(window, {
  InputScreen, ThinkingCard, ConnectCard,
  PermissionCard, SuccessCard, shortAddr, fakeHash,
  THINK_STEPS, MmDialog,
});
