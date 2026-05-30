/* ============================================
   YIELD VIBING — App (multi-agent + real Web3)
   Design state machine wired to real wallet.js / venice.js / orchestrator.js
   ============================================ */
import React, { useState as useS, useEffect as useE, useRef as useR } from 'react';

import { Icon, Sidebar, TopBar, StepRail, STEPS } from './components.jsx';
import {
  InputScreen, ThinkingCard, ConnectCard,
  PermissionCard, SuccessCard, shortAddr, fakeHash,
} from './screens.jsx';
import { SkillReviewCard } from './skills.jsx';
import {
  StrategyCard, ExecuteCard, MemoryModal,
  buildStrategy, makeInitialExecState,
} from './agents.jsx';
import {
  useTweaks, TweaksPanel, TweakSection, TweakRadio,
} from './tweaks-panel.jsx';

import { connectWallet, requestERC7715Permission, signSiweForVenice } from './wallet.js';
import { generateStrategy } from './venice.js';
import { OrchestratorAgent } from './orchestrator.js';
import { makeAgentId } from './worker.js';
import { VAULT_CATALOG, VENICE_TIMEOUT_MS } from './config.js';
import SkillDrawer from './components/SkillDrawer.jsx';

/* ---------- Right rail panels ---------- */
const WalletPanel = ({ phase, address }) => {
  const [copied, setCopied] = useS(false);
  if (phase === "none") {
    return (
      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Wallet</div>
          <span className="panel-meta">not connected</span>
        </div>
        <div className="empty">— belum connect</div>
      </div>
    );
  }
  const isSmart = phase === "upgraded";
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Wallet</div>
        <span className="panel-meta">{isSmart ? "smart account" : "eoa"}</span>
      </div>
      <div className="wallet-row">
        <div>
          <div className="wallet-addr">{shortAddr(address)}</div>
          <div className={`wallet-type ${isSmart ? "active" : ""}`}>
            {isSmart ? "eip-7702 active" : "regular eoa"}
          </div>
        </div>
        <div className="wallet-actions">
          <button
            className="wallet-action"
            title={copied ? "copied" : "copy address"}
            aria-label="copy address"
            onClick={async () => {
              try { await navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1200); }
              catch (e) { console.warn("[wallet] clipboard failed:", e); }
            }}
          >
            <Icon name={copied ? "check" : "copy"} />
          </button>
          <a
            className="wallet-action"
            title="view on etherscan"
            aria-label="view on etherscan"
            href={`https://sepolia.etherscan.io/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="external" />
          </a>
        </div>
      </div>
    </div>
  );
};

const PermissionPanel = ({ active, strategy, onRevoke }) => {
  const agents = strategy?.agents || [];
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Active permissions</div>
        <span className="panel-meta">erc-7715 · batch</span>
      </div>
      <div className={`perm-status ${active ? "active" : ""}`}>
        {active ? `${agents.length} permission · 23h 59m` : "no active permission"}
      </div>
      {active && agents.length > 0 && (
        <>
          <div className="perm-agent-list">
            {agents.map((a) => (
              <div key={a.id} className="perm-agent-row">
                <span className="idx mono">{a.idx}</span>
                <div className="meta-col">
                  <div className="agent-name">{a.id}</div>
                  <div className="mono agent-vault">{a.vault.addr.slice(0, 8)}…{a.vault.addr.slice(-4)}</div>
                </div>
                <div className="mono amount tnum">{a.allocation} USDC</div>
              </div>
            ))}
          </div>
          <button className="perm-revoke" onClick={onRevoke}>
            revoke all permissions
          </button>
        </>
      )}
    </div>
  );
};

const EVENT_STYLES = {
  AgentStarted:        { icon: "●", color: "var(--warn)" },
  SwapExecuted:        { icon: "↻", color: "var(--info)" },
  ApproveExecuted:     { icon: "✓", color: "var(--info)" },
  DepositExecuted:     { icon: "↓", color: "var(--info)" },
  AgentCompleted:      { icon: "✓", color: "var(--ok)" },
  AgentFailed:         { icon: "✕", color: "var(--danger)" },
  RedelegationCreated:  { icon: "⇄", color: "var(--info)" },
  RedelegationRedeemed: { icon: "✓", color: "var(--ok)" },
  OrchestratorPlanned: { icon: "·", color: "var(--text-muted)" },
  PermissionGranted:   { icon: "·", color: "var(--text-muted)" },
  Connected:           { icon: "·", color: "var(--text-muted)" },
  Authorized:          { icon: "·", color: "var(--text-muted)" },
  PermissionRevoked:   { icon: "·", color: "var(--danger)" },
  SkillApproved:       { icon: "·", color: "var(--text-muted)" },
};

const ActivityPanel = ({ logs }) => {
  return (
    <div className="panel" style={{ borderBottom: "none", flex: 1 }}>
      <div className="panel-head">
        <div className="panel-title">Activity</div>
        <span className="panel-meta">{logs.length ? `${logs.length} events · realtime` : "agent events · realtime"}</span>
      </div>
      {logs.length === 0 ? (
        <div className="empty">no events yet</div>
      ) : (
        <div className="activity">
          {logs.slice().reverse().map((l) => {
            const sty = EVENT_STYLES[l.event] || EVENT_STYLES.OrchestratorPlanned;
            return (
              <div key={l.id} className="act-row">
                <span className="act-marker mono" style={{ color: sty.color }}>{sty.icon}</span>
                <div>
                  <div className="act-title">
                    <span className="act-event mono">{l.event}</span>
                    {l.agent && <span className="act-agent mono">{l.agent}</span>}
                  </div>
                  <div className="act-meta">{l.meta}</div>
                </div>
                <span className="act-time">{l.time}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const SkillPanel = ({ skillSource, onCustomize }) => {
  const custom = skillSource === "user-local" || skillSource === "user-file";
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Vault Advisor Skill</div>
        <button className="panel-meta skill-customize" onClick={onCustomize}>customize →</button>
      </div>
      <div className="perm-status active">
        {custom ? "Custom Strategy" : "Default Strategy by Yield Vibing"}
      </div>
      <div className="skill-sub">
        {custom ? "active · user-defined" : "4 vaults · expert framework"}
      </div>
    </div>
  );
};

/* ---------- Palette picker ---------- */
const PALETTES = [
  { id: "acid-yield", name: "Acid Yield", swatch: ["#cfff3d", "#1a1b16", "#ecebe1"], desc: "Default · warm dark + acid lime" },
  { id: "mono-slate", name: "Mono Slate", swatch: ["#e6edff", "#16182e", "#e8ebf3"], desc: "Refined · cool slate, no chroma" },
  { id: "liquid-mint", name: "Liquid Mint", swatch: ["#5ee6c5", "#11201b", "#ecebe1"], desc: "Teal undertone · mint accent" },
  { id: "bone-paper", name: "Bone Paper", swatch: ["#1a180f", "#e3dfd2", "#f4f1e9"], desc: "Light · editorial paper feel" },
];

const PalettePicker = ({ value, onChange }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
    {PALETTES.map((p) => {
      const on = p.id === value;
      return (
        <button
          key={p.id}
          type="button"
          onClick={() => onChange(p.id)}
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr auto",
            alignItems: "center",
            gap: 10,
            padding: "7px 9px",
            border: on ? ".5px solid rgba(0,0,0,.35)" : ".5px solid rgba(0,0,0,.08)",
            borderRadius: 7,
            background: on ? "rgba(255,255,255,.85)" : "rgba(255,255,255,.4)",
            cursor: "default",
            textAlign: "left",
            font: "inherit",
            color: "inherit",
          }}
        >
          <div style={{ display: "flex", gap: 2 }}>
            {p.swatch.map((c, i) => (
              <span key={i} style={{
                width: 12, height: 12, borderRadius: 3,
                background: c, border: ".5px solid rgba(0,0,0,.1)",
              }} />
            ))}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 11.5 }}>{p.name}</div>
            <div style={{ fontSize: 10, color: "rgba(41,38,27,.55)", marginTop: 1, lineHeight: 1.3 }}>
              {p.desc}
            </div>
          </div>
          <span style={{ fontSize: 11, color: on ? "rgba(41,38,27,.7)" : "transparent" }}>✓</span>
        </button>
      );
    })}
  </div>
);

/* ---------- Helpers ---------- */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "acid-yield",
  "density": "comfortable",
  "speed": "medium"
}/*EDITMODE-END*/;

const SPEED_MS = { fast: 220, medium: 600, slow: 1100 };

const nowT = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
};

// Map real worker step names → design's 3-step model
const WORKER_STEP_MAP = { swap: "swap", approve: "approve", deposit: "deposit" };

// Map Venice strategy output (selected_vaults schema) → design strategy format
const mapVeniceToStrategy = (veniceResult, amount, risk) => {
  const total = Number(amount);
  const PROTOCOLS = ["aave-v3", "morpho-blue", "pendle-v2"];
  const ROLES = ["Conservative · lending", "Balanced · liquidity provision", "Aggressive · leveraged yield"];
  const byAddr = (addr) => VAULT_CATALOG.find((c) => c.address.toLowerCase() === String(addr).toLowerCase()) || {};
  const list = veniceResult.selected_vaults || [];
  const agents = list.map((v, i) => {
    const cat = byAddr(v.address);
    return {
      id: `worker-${i + 1}`,
      idx: String(i + 1).padStart(2, "0"),
      name: `Worker ${i + 1} · ${ROLES[i]?.split(" · ")[0] || "Conservative"}`,
      role: ROLES[i] || "Conservative · lending",
      allocation: +(total * v.allocation).toFixed(2),
      skillName: "yield_vault_deposit",
      reasoning: v.reasoning,                    // AI metadata → UI
      riskTier: v.risk_tier,                     // AI metadata → UI
      yieldSource: v.yield_source_type,          // AI metadata → UI
      vault: {
        name: v.name || cat.name || `MockVault ${i + 1}`,
        protocol: v.protocol || cat.protocol || PROTOCOLS[i] || "aave-v3",
        apy: String(v.expected_apy ?? cat.apy ?? 4.8),
        drawdown: cat.drawdown || "-1.8",
        addr: v.address,
      },
    };
  });
  const blended = agents.reduce((acc, a) => acc + Number(a.vault.apy) * (a.allocation / total), 0);
  return { agents, total, blendedApy: blended.toFixed(1), risk, rationale: veniceResult.strategy_summary || veniceResult.rationale };
};

/* ---------- App ---------- */
const App = () => {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // stage: 'strategy' | 'connect' | 'skills' | 'permission' | 'execute' | 'done'
  const [stage, setStage] = useS("strategy");
  const [furthest, setFurthest] = useS(0); // furthest step index reached → rail can navigate to visited steps
  const [amount, setAmount] = useS("100");
  const [risk, setRisk] = useS("med");
  const [devApiKey, setDevApiKey] = useS("");

  // strategy sub-state
  const [strategyPhase, setStrategyPhase] = useS("input"); // input | thinking | ready
  const [thinkingPhase, setThinkingPhase] = useS(0);
  const [thinkTimes, setThinkTimes] = useS([]); // real measured per-step durations (seconds)
  const [slowConfirm, setSlowConfirm] = useS(false); // AI exceeded timeout → ask keep waiting / fallback
  const genAbortRef = useR(null);
  const slowTimerRef = useR(null);
  const [strategy, setStrategy] = useS(null);
  const [skillSource, setSkillSource] = useS("default");
  const [skillDrawerOpen, setSkillDrawerOpen] = useS(false);

  const [connectPhase, setConnectPhase] = useS("idle");

  // skills
  const [skillStates, setSkillStates] = useS({});
  const [editingTexts, setEditingTexts] = useS({});

  const [permPhase, setPermPhase] = useS("idle");
  const [permActive, setPermActive] = useS(false);

  // execution: map agentId -> { status, steps, hashes, memory, metrics }
  const [execMap, setExecMap] = useS({});
  const [openAgentId, setOpenAgentId] = useS(null);

  const [logs, setLogs] = useS([]);
  const logIdRef = useR(0);
  const agentMapRef = useR({});

  // Real Web3 state
  const [realAddress, setRealAddress] = useS(null);
  const [permContext, setPermContext] = useS(null);
  const [veniceAuth, setVeniceAuth] = useS(null);

  useE(() => {
    document.documentElement.dataset.palette = tweaks.palette;
    document.documentElement.dataset.density = tweaks.density;
  }, [tweaks.palette, tweaks.density]);

  // Record the furthest step reached so the rail can navigate to visited steps (and only those)
  useE(() => { setFurthest((f) => Math.max(f, STEPS.findIndex((s) => s.id === stage))); }, [stage]);

  const paletteIsLight = tweaks.palette === "bone-paper";
  const speed = SPEED_MS[tweaks.speed] || SPEED_MS.medium;

  const addLog = (entry) => {
    logIdRef.current += 1;
    const uid = `${logIdRef.current}-${Date.now()}`;
    setLogs((l) => [...l, { id: uid, time: nowT(), ...entry }]);
  };

  /* ----- STRATEGY (step 01) ----- */
  const handleSubmitPreference = () => {
    setStrategyPhase("thinking");
    setThinkingPhase(0);
    addLog({ event: "OrchestratorPlanned", meta: `${amount} usdc · ${risk} risk · planning` });
  };

  useE(() => {
    if (stage !== "strategy" || strategyPhase !== "thinking") return;
    let cancelled = false;
    setThinkTimes([]);
    setThinkingPhase(0);
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    const freeze = (i, st) => setThinkTimes((a) => { const n = [...a]; n[i] = (performance.now() - st) / 1000; return n; });

    (async () => {
      let st = performance.now();
      await delay(speed * 0.6);                 // step 0: scan vaults
      if (cancelled) return;
      freeze(0, st); setThinkingPhase(1);

      st = performance.now();
      await delay(speed * 1.1);                 // step 1: allocation
      if (cancelled) return;
      freeze(1, st); setThinkingPhase(2);

      // step 2: real AI call — ThinkingCard ticks a live timer + spinner until this resolves.
      // App owns the timeout: after VENICE_TIMEOUT_MS, ask the user to keep waiting or fall back.
      let s = null;
      const ctrl = new AbortController();
      genAbortRef.current = ctrl;
      slowTimerRef.current = setTimeout(() => { if (!cancelled) setSlowConfirm(true); }, VENICE_TIMEOUT_MS);
      try {
        const numVaults = { low: 1, med: 2, high: 3 }[risk] || 2;
        const riskLevel = risk === "med" ? "medium" : risk;
        const veniceResult = await generateStrategy({
          amount: Number(amount),
          riskLevel,
          numVaults,
          veniceAuth: null, // wallet not connected yet at step 1
          devApiKey: devApiKey || null,
          signal: ctrl.signal,
        });
        setSkillSource(veniceResult.skillSource || "default");
        if (veniceResult.generatedBy !== "fallback") {          s = mapVeniceToStrategy(veniceResult, amount, risk);
          addLog({ event: "OrchestratorPlanned", meta: `strategy via ${veniceResult.generatedBy} · ${(veniceResult.strategy_summary || veniceResult.rationale)?.slice(0, 60)}` });
        }
      } catch (e) {
        console.warn("[app] Strategy AI failed:", e);
      }
      clearTimeout(slowTimerRef.current);
      setSlowConfirm(false);
      if (cancelled) return;
      if (!s) s = buildStrategy(amount, risk);
      setStrategy(s);
      setStrategyPhase("ready");
      const sk = {};
      s.agents.forEach((a) => { sk[a.id] = { state: "pending", skill: null }; });
      setSkillStates(sk);
      addLog({ event: "OrchestratorPlanned", meta: `${s.agents.length} worker spawned · ${s.blendedApy}% blended apy` });
    })();

    return () => { cancelled = true; };
  }, [stage, strategyPhase]);

  const handleAcceptStrategy = () => setStage("connect");

  const handleRegenerate = () => {
    setStrategy(null);
    setSkillStates({});
    setStrategyPhase("thinking");
    setThinkingPhase(0);
    addLog({ event: "OrchestratorPlanned", meta: `re-planning · ${amount} usdc · ${risk} risk` });
  };

  const handleKeepWaiting = () => {
    setSlowConfirm(false);
    slowTimerRef.current = setTimeout(() => setSlowConfirm(true), VENICE_TIMEOUT_MS); // ask again next minute
  };
  const handleStopWaiting = () => {
    setSlowConfirm(false);
    clearTimeout(slowTimerRef.current);
    genAbortRef.current?.abort(); // → generateStrategy returns fallback → default strategy
  };

  /* ----- CONNECT (step 02) ----- */
  const handleConnect = async () => {
    setConnectPhase("connecting");
    try {
      const addr = await connectWallet();
      setRealAddress(addr);
      setConnectPhase("connected");
      addLog({ event: "Connected", meta: shortAddr(addr) });
    } catch (err) {
      setConnectPhase("idle");
      addLog({ event: "OrchestratorPlanned", meta: `connect failed: ${err.message}` });
    }
  };

  const handleUpgrade = async () => {
    setConnectPhase("upgrading");
    // Try Venice x402 SIWE signing — wallet now connected, no API key needed
    if (realAddress && !devApiKey) {
      try {
        const auth = await signSiweForVenice(realAddress);
        setVeniceAuth(auth);
        addLog({ event: "Authorized", meta: "venice x402 auth signed · SIWE" });
      } catch (e) {
        console.warn("[app] SIWE signing skipped:", e.message);
      }
    }
    setTimeout(() => {
      setConnectPhase("upgraded");
      addLog({ event: "Authorized", meta: "eip-7702 · handled by MetaMask SAK · gas 0" });
    }, speed * 0.8);
  };

  const handleConnectDone = () => setStage("skills");

  /* ----- SKILLS (step 03) ----- */
  const updateSkillState = (id, patch) => {
    setSkillStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const handleSkillApprove = (id) => {
    updateSkillState(id, { state: "approved" });
    addLog({ event: "SkillApproved", agent: id, meta: "skill JSON approved · ready to bind" });
  };

  const handleApproveAll = () => {
    const next = {};
    Object.entries(skillStates).forEach(([id, s]) => {
      next[id] = { ...s, state: "approved" };
    });
    setSkillStates(next);
    addLog({ event: "SkillApproved", meta: `${Object.keys(next).length} skills approved · batch` });
  };

  const handleSkillEdit = (id, text, start = false) => {
    let err = null;
    try { JSON.parse(text); } catch (e) { err = e.message.replace(/^.*: /, ""); }
    setEditingTexts((prev) => ({ ...prev, [id]: { text, error: err } }));
    if (start) updateSkillState(id, { state: "editing" });
  };

  const handleSkillSave = (id) => {
    const entry = editingTexts[id];
    if (!entry || entry.error) return;
    try {
      const parsed = JSON.parse(entry.text);
      updateSkillState(id, { state: "pending", skill: parsed });
    } catch { /* guarded above */ }
  };

  const handleSkillReset = (id) => {
    updateSkillState(id, { state: "pending" });
    setEditingTexts((prev) => ({ ...prev, [id]: { text: "", error: null } }));
  };

  const handleSkillsContinue = () => setStage("permission");

  /* ----- PERMISSION (step 04) ----- */
  const handleGrant = () => setPermPhase("prompting");

  const handlePermReject = () => {
    setPermPhase("idle");
    addLog({ event: "PermissionRevoked", meta: "permission request rejected by user" });
  };

  const handlePermConfirm = async () => {
    setPermPhase("idle");
    try {
      const permResult = await requestERC7715Permission(86400);
      setPermContext(permResult.permissionContext);
      setPermActive(true);
      const ag = strategy?.agents || [];
      ag.forEach((a) => addLog({
        event: "PermissionGranted",
        agent: a.id,
        meta: `vault ${shortAddr(a.vault.addr)} · ${a.allocation} usdc max`,
      }));
      setTimeout(() => {
        setStage("execute");
        startExecution(permResult.permissionContext);
      }, 600);
    } catch (err) {
      setPermPhase("idle");
      addLog({ event: "AgentFailed", meta: `permission denied: ${err.message}` });
    }
  };

  /* ----- EXECUTE (step 05) — real parallel agents ----- */
  const updateExecMap = (agentId, patch) => {
    setExecMap((prev) => ({
      ...prev,
      [agentId]: { ...(prev[agentId] || { status: "idle", activeStep: null, steps: { swap: "idle", approve: "idle", deposit: "idle" }, hashes: {}, memory: [], metrics: {} }), ...patch },
    }));
  };

  const startExecution = (ctx) => {
    if (!strategy) return;
    const resolvedCtx = ctx || permContext;

    // Pre-compute sessionId and build hex→designId map BEFORE orchestrator starts.
    // Orchestrator uses makeAgentId(index, sessionId) — same function, same sessionId = same hex.
    const sessionId = `session-${Date.now()}`;
    const agentMap = {};
    strategy.agents.forEach((a, i) => {
      const hexId = makeAgentId(i, sessionId);
      agentMap[hexId] = a.id; // 'worker-1', 'worker-2', etc.
    });
    agentMapRef.current = agentMap;

    const init = makeInitialExecState(strategy.agents);
    setExecMap(init);

    // Convert design strategy format → orchestrator's expected { vaults: [...] } format
    const yvStrategy = {
      vaults: strategy.agents.map((a) => ({
        address: a.vault.addr,
        allocation: a.allocation / strategy.total,
      })),
    };

    const orch = new OrchestratorAgent({
      user: realAddress,
      permissionContext: resolvedCtx,
      veniceAuth: veniceAuth,
      devApiKey: devApiKey || null,
      sessionId,
      onEvent: (evName, data) => {
        // A2A redelegation events → activity log (orchestrator → worker hand-off proof)
        if (evName === "RedelegationCreated") {
          const vaultLetter = String.fromCharCode(64 + (data.workerId || 1));
          addLog({
            event: "RedelegationCreated",
            agent: `orchestrator → ${data.to}`,
            meta: `${data.allocationUsdc} USDC · vault ${vaultLetter} · limitedCalls: 3 · ${shortAddr(data.delegationHash)}`,
          });
          return;
        }
        if (evName === "RedelegationRedeemed") {
          addLog({
            event: "RedelegationRedeemed",
            agent: data.to || `worker-${data.workerId}`,
            meta: `deposit executed · tx ${shortAddr(data.txHash)}`,
          });
          return;
        }

        const agentId = data?.agentId;
        if (!agentId) return;

        // Resolve hex agentId → design worker id ('worker-1', etc.)
        const dId = agentMapRef.current?.[agentId] || agentId;

        if (evName === "started") {
          setExecMap((prev) => {
            const cur = prev[dId] || prev[agentId] || makeInitialExecState([{ id: dId }])[dId];
            return {
              ...prev,
              [dId]: {
                ...cur,
                status: "running",
                activeStep: "swap",
                memory: [...(cur.memory || []), { status: "running", title: "agent started", meta: `vault ${shortAddr(data.vault)}`, t: nowT() }],
                metrics: { ...(cur.metrics || {}), startedAt: Date.now(), totalRuns: ((cur.metrics?.totalRuns) || 0) + 1 },
              },
            };
          });
          addLog({ event: "AgentStarted", agent: dId, meta: `vault ${shortAddr(data.vault)}` });
        }

        if (evName === "step") {
          const stepName = WORKER_STEP_MAP[data.step];
          if (!stepName) return; // skip 'grant-permission' internal step
          const stepStatus = data.status === "done" ? "confirmed" : "running";
          setExecMap((prev) => {
            const cur = prev[dId] || prev[agentId] || {};
            return {
              ...prev,
              [dId]: {
                ...cur,
                activeStep: stepName,
                steps: { ...(cur.steps || {}), [stepName]: stepStatus },
                hashes: data.txHash ? { ...(cur.hashes || {}), [stepName]: data.txHash } : (cur.hashes || {}),
                memory: [...(cur.memory || []), {
                  status: stepStatus,
                  title: `${stepName} ${data.status === "done" ? "confirmed" : "executing"}`,
                  meta: data.txHash ? `tx ${shortAddr(data.txHash)}` : "via 1Shot relayer",
                  hash: data.txHash || null,
                  t: nowT(),
                }],
              },
            };
          });
          if (data.status === "done") {
            const evMap = { swap: "SwapExecuted", approve: "ApproveExecuted", deposit: "DepositExecuted" };
            if (evMap[stepName]) addLog({ event: evMap[stepName], agent: dId, meta: data.txHash ? `tx ${shortAddr(data.txHash)}` : "[simulated]" });
          }
        }

        if (evName === "completed") {
          setExecMap((prev) => {
            const cur = prev[dId] || prev[agentId] || {};
            return {
              ...prev,
              [dId]: {
                ...cur,
                status: "confirmed",
                activeStep: null,
                memory: [...(cur.memory || []), {
                  status: "confirmed",
                  title: "agent completed",
                  meta: data.simulated ? "deposit confirmed [simulated relay]" : `tx ${shortAddr(data.txHash)}`,
                  hash: data.txHash,
                  lesson: `vault deposit complete · strategy executed`,
                  t: nowT(),
                }],
                metrics: { ...(cur.metrics || {}), completedAt: Date.now(), successRate: 100 },
              },
            };
          });
          addLog({ event: "AgentCompleted", agent: dId, meta: data.simulated ? "[simulated]" : `tx ${shortAddr(data.txHash)}` });
        }

        if (evName === "failed") {
          setExecMap((prev) => {
            const cur = prev[dId] || prev[agentId] || {};
            return {
              ...prev,
              [dId]: {
                ...cur,
                status: "failed",
                activeStep: null,
                memory: [...(cur.memory || []), { status: "failed", title: "agent failed", meta: data.error || "unknown error", t: nowT() }],
                metrics: { ...(cur.metrics || {}), completedAt: Date.now(), successRate: 0 },
              },
            };
          });
          addLog({ event: "AgentFailed", agent: dId, meta: data.error });
        }
      },
    });

    orch.dispatch(yvStrategy, strategy.total)
      .then((summary) => {
        addLog({ event: "OrchestratorPlanned", meta: `done · ${summary.completed} deposited, ${summary.failed} failed` });
      })
      .catch((err) => {
        console.error("[app] orchestrator dispatch failed:", err);
        addLog({ event: "AgentFailed", meta: `orchestrator error: ${err?.message || err}` });
        setExecMap((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((id) => {
            if (next[id]?.status === "running" || next[id]?.status === "idle") {
              next[id] = { ...next[id], status: "failed", activeStep: null };
            }
          });
          return next;
        });
      });
  };

  /* ----- DONE (step 06) ----- */
  const handleExecDone = () => {
    setStage("done");
    addLog({ event: "OrchestratorPlanned", meta: `multi-agent deployment finalized · ${strategy?.agents?.length} positions opened` });
  };

  const handleAgain = () => {
    setStage("strategy");
    setFurthest(0);
    setStrategyPhase("input");
    setThinkingPhase(0);
    setStrategy(null);
    setSkillStates({});
    setEditingTexts({});
    setConnectPhase("idle");
    setPermActive(false);
    setPermContext(null);
    setVeniceAuth(null);
    setExecMap({});
    setLogs([]);
    agentMapRef.current = {};
  };

  const handleRevoke = () => {
    setPermActive(false);
    (strategy?.agents || []).forEach((a) =>
      addLog({ event: "PermissionRevoked", agent: a.id, meta: "agent halted · scope cleared" })
    );
  };

  /* ----- Step rail: navigate back to a completed step (state preserved) ----- */
  const goBack = (id) => {
    if (id === "strategy") setStrategyPhase("ready");
    setStage(id);
  };

  /* ----- Jump to step (tweaks panel) ----- */
  const jumpTo = (id) => {
    if (id === "strategy") { setStage("strategy"); setStrategyPhase("input"); setThinkingPhase(0); return; }
    const ensured = strategy || buildStrategy(amount, risk);
    if (!strategy) {
      setStrategy(ensured);
      const sk = {};
      ensured.agents.forEach((a) => { sk[a.id] = { state: "approved", skill: null }; });
      setSkillStates(sk);
    }
    if (id === "connect") { setStage("connect"); setConnectPhase("idle"); return; }
    if (id === "skills")  { setStage("skills"); setConnectPhase("upgraded"); return; }
    if (id === "permission") {
      setStage("permission"); setPermPhase("idle"); setConnectPhase("upgraded");
      const sk = {};
      ensured.agents.forEach((a) => { sk[a.id] = { state: "approved", skill: null }; });
      setSkillStates(sk);
      return;
    }
    if (id === "execute") {
      setStage("execute"); setConnectPhase("upgraded"); setPermActive(true);
      const sk = {};
      ensured.agents.forEach((a) => { sk[a.id] = { state: "approved", skill: null }; });
      setSkillStates(sk);
      startExecution(null);
      return;
    }
    if (id === "done") {
      setStage("done"); setConnectPhase("upgraded"); setPermActive(true);
      const map = {};
      ensured.agents.forEach((a) => {
        map[a.id] = {
          status: "confirmed", activeStep: null,
          steps: { swap: "confirmed", approve: "confirmed", deposit: "confirmed" },
          hashes: { swap: fakeHash(), approve: fakeHash(), deposit: fakeHash() },
          memory: [{ status: "confirmed", title: "agent completed", meta: "all steps confirmed", t: nowT(), lesson: "vault deposit complete" }],
          metrics: { totalRuns: 1, successRate: 100, startedAt: Date.now(), completedAt: Date.now() },
        };
      });
      setExecMap(map);
    }
  };

  const renderStage = () => {
    switch (stage) {
      case "strategy":
        if (strategyPhase === "input")
          return <InputScreen amount={amount} setAmount={setAmount} risk={risk} setRisk={setRisk} onSubmit={handleSubmitPreference} />;
        if (strategyPhase === "thinking")
          return <ThinkingCard phase={thinkingPhase} times={thinkTimes} />;
        return <StrategyCard strategy={strategy} skillSource={skillSource} onProceed={handleAcceptStrategy} onRegenerate={handleRegenerate} />;
      case "connect":
        return <ConnectCard phase={connectPhase} onConnect={handleConnect} onUpgrade={handleUpgrade} onDone={handleConnectDone} onCancel={() => { setConnectPhase("idle"); setStage("strategy"); }} />;
      case "skills":
        return (
          <SkillReviewCard
            agents={strategy?.agents || []}
            riskProfile={risk}
            skillStates={skillStates}
            editingTexts={editingTexts}
            onApprove={handleSkillApprove}
            onApproveAll={handleApproveAll}
            onEdit={handleSkillEdit}
            onSave={handleSkillSave}
            onReset={handleSkillReset}
            onContinue={handleSkillsContinue}
          />
        );
      case "permission":
        return <PermissionCard strategy={strategy} phase={permPhase} onGrant={handleGrant} onConfirm={handlePermConfirm} onReject={handlePermReject} />;
      case "execute":
        return (
          <ExecuteCard
            strategy={strategy}
            execMap={execMap}
            paletteIsLight={paletteIsLight}
            onOpenMemory={setOpenAgentId}
            onDone={handleExecDone}
          />
        );
      case "done":
        return <SuccessCard strategy={strategy} onAgain={handleAgain} address={realAddress} />;
      default:
        return null;
    }
  };

  const walletPhase =
    connectPhase === "idle" || connectPhase === "connecting" ? "none" :
    connectPhase === "upgraded" ? "upgraded" : "eoa";

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <TopBar walletConnected={walletPhase !== "none"} onReset={handleAgain} />
        <StepRail stage={stage} furthest={furthest} onStepClick={goBack} />
        <div className="stage" key={`${stage}-${strategyPhase}`}>
          {renderStage()}
        </div>
      </main>
      <aside className="rail">
        <WalletPanel phase={walletPhase} address={realAddress} />
        <PermissionPanel active={permActive} strategy={strategy} onRevoke={handleRevoke} />
        <ActivityPanel logs={logs} />
        <SkillPanel skillSource={skillSource} onCustomize={() => setSkillDrawerOpen(true)} />
      </aside>

      <SkillDrawer
        open={skillDrawerOpen}
        onClose={() => setSkillDrawerOpen(false)}
        skillSource={skillSource}
        onSkillChange={(newSource) => setSkillSource(newSource)}
      />

      {openAgentId && strategy && (
        <MemoryModal
          agentId={openAgentId}
          strategy={strategy}
          execMap={execMap}
          onClose={() => setOpenAgentId(null)}
        />
      )}

      {slowConfirm && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-eyebrow">venice ai · timeout</div>
            <h3 className="modal-title">AI masih memproses — lanjut nunggu?</h3>
            <p className="lede" style={{ marginTop: 8 }}>
              Generation udah lewat {Math.round(VENICE_TIMEOUT_MS / 1000)} detik. Mau tunggu lebih lama, atau pakai strategy default aja?
            </p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={handleStopWaiting}>Pakai default</button>
              <button className="btn btn-primary" onClick={handleKeepWaiting}>Lanjut nunggu</button>
            </div>
          </div>
        </div>
      )}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Brand palette" />
        <PalettePicker value={tweaks.palette} onChange={(v) => setTweak("palette", v)} />

        <TweakSection label="Demo speed" />
        <TweakRadio
          label="Speed"
          value={tweaks.speed}
          options={[
            { value: "fast", label: "Fast" },
            { value: "medium", label: "Med" },
            { value: "slow", label: "Slow" },
          ]}
          onChange={(v) => setTweak("speed", v)}
        />

        <TweakSection label="Density" />
        <TweakRadio
          label="Layout"
          value={tweaks.density}
          options={[
            { value: "comfortable", label: "Comfy" },
            { value: "compact", label: "Compact" },
          ]}
          onChange={(v) => setTweak("density", v)}
        />

        <TweakSection label="Jump to step" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => jumpTo(s.id)}
              style={{
                appearance: "none",
                border: ".5px solid rgba(0,0,0,.08)",
                borderRadius: 6,
                background: stage === s.id ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.4)",
                color: "inherit",
                font: "inherit",
                fontSize: 10.5,
                fontWeight: stage === s.id ? 600 : 500,
                padding: "6px 8px",
                textAlign: "left",
                cursor: "default",
                letterSpacing: "-0.01em",
              }}
            >
              <span style={{ color: "rgba(41,38,27,.45)", marginRight: 5, fontFamily: "ui-monospace, monospace" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              {s.label}
            </button>
          ))}
        </div>
      </TweaksPanel>
    </div>
  );
};

export default App;
