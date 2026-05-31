/* ============================================
   VIBING FARMER — App (multi-agent + real Web3)
   Design state machine wired to real wallet.js / venice.js / orchestrator.js
   ============================================ */
import React, { useState as useS, useEffect as useE, useRef as useR } from 'react';
import { isDevMode } from './devFlag.js';

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

import { connectWallet, requestERC7715Permission, signSiweForVenice, switchToSepolia } from './wallet.js';
import { generateStrategy } from './venice.js';
import { OrchestratorAgent } from './orchestrator.js';
import { makeAgentId } from './worker.js';
import { VAULT_CATALOG, VENICE_TIMEOUT_MS } from './config.js';
import SkillDrawer from './components/SkillDrawer.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';
import { saveTransaction } from './history.js';
import { startBackgroundAgent, stopBackgroundAgent, updateAgentConfig, onAgentEvent, harvestVault, emergencyWithdraw } from './agents/agentController.js';
import AgentDashboard from './components/AgentDashboard.jsx';
import HomePage from './components/HomePage.jsx';
import SettingsPage from './components/SettingsPage.jsx';
import { WalletPanel, PermissionPanel, ActivityPanel, SkillPanel, PalettePicker, PALETTES } from './components/RightRail.jsx';
import { loadSettings, saveSetting } from './settingsStore.js';
import { clearUserSkill } from './skillLoader.js';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import VaultDetailPage from './components/VaultDetailPage.jsx';
import TxDetailPage from './components/TxDetailPage.jsx';

/* ---------- Background agent settings (localStorage: yv_agent_settings) ---------- */
const AGENT_SETTINGS_DEFAULTS = { autoHarvest: false, harvestMinUsdc: 1.0, apyDropPct: 20, rebalanceThresholdPct: 1.5, emergencyFull: false, emergencyPct: 50, riskMonitoring: true, positionInterval: 5, apyInterval: 10, riskInterval: 15, rewardInterval: 5 };
const loadAgentSettings = () => {
  try { return { ...AGENT_SETTINGS_DEFAULTS, ...JSON.parse(localStorage.getItem('yv_agent_settings') || '{}') }; }
  catch { return { ...AGENT_SETTINGS_DEFAULTS }; }
};

/* ---------- Right rail panels ---------- */

/* ---------- Palette picker ---------- */

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
  const usedVaults = veniceResult.vaultsUsed || [];
  const byLive = (v) => usedVaults.find((x) => x.protocol === v.protocol) || usedVaults.find((x) => x.address?.toLowerCase() === String(v.address).toLowerCase()) || {};
  const list = veniceResult.selected_vaults || [];
  const agents = list.map((v, i) => {
    const cat = byAddr(v.address);
    const live = byLive(v);
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
        name: v.name || live.name || cat.name || `MockVault ${i + 1}`,
        protocol: v.protocol || live.protocol || cat.protocol || PROTOCOLS[i] || "aave-v3",
        apy: String(v.expected_apy ?? live.apy ?? cat.apy ?? 4.8),
        drawdown: live.drawdown || cat.drawdown || "-1.8",
        addr: v.address,
        tvl: v.tvlFormatted || live.tvlFormatted || "N/A",
        isLiveData: live.source === "defiLlama",
        defillamaPool: live.defillamaPool || null,
      },
    };
  });
  const blended = agents.reduce((acc, a) => acc + Number(a.vault.apy) * (a.allocation / total), 0);
  return { agents, total, blendedApy: blended.toFixed(1), risk, rationale: veniceResult.strategy_summary || veniceResult.rationale };
};

/* ---------- App ---------- */
const App = () => {
  const devMode = isDevMode();
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // stage: 'strategy' | 'connect' | 'skills' | 'permission' | 'execute' | 'done'
  const [stage, setStage] = useS("strategy");
  const [furthest, setFurthest] = useS(0); // furthest step index reached → rail can navigate to visited steps
  const navigate = useNavigate();
  const location = useLocation();
  const [language, setLanguage] = useS(() => loadSettings().language); // UI i18n (labels only)
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
  const [marketLive, setMarketLive] = useS(null); // Tavily live market context used? null until first generation
  const [vaultLive, setVaultLive] = useS(null); // DeFiLlama live vault data used? null until first generation
  const [skillDrawerOpen, setSkillDrawerOpen] = useS(false);

  const [connectPhase, setConnectPhase] = useS("idle");
  const [connectError, setConnectError] = useS(null);

  // skills
  const [skillStates, setSkillStates] = useS({});
  const [editingTexts, setEditingTexts] = useS({});

  const [permPhase, setPermPhase] = useS("idle");
  const [permError, setPermError] = useS(null);
  const [permActive, setPermActive] = useS(false);
  const [permExpiresAt, setPermExpiresAt] = useS(null);

  // 30-second tick to refresh countdown displays
  const [, setClock] = useS(0);
  useE(() => {
    const id = setInterval(() => setClock((c) => c + 1), 30000);
    return () => clearInterval(id);
  }, []);

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

  // Background agent
  const [agentEnabled, setAgentEnabled] = useS(() => localStorage.getItem('yv_agent_enabled') !== 'false');
  const [agentSettings, setAgentSettings] = useS(loadAgentSettings);
  const [agentData, setAgentData] = useS({ positions: {}, alerts: [], lastUpdated: null });

  useE(() => {
    document.documentElement.dataset.palette = tweaks.palette;
    document.documentElement.dataset.density = tweaks.density;
  }, [tweaks.palette, tweaks.density]);

  // Redirect old hash URLs (bookmarks like /#/home → /home)
  useE(() => {
    if (window.location.hash?.startsWith('#/')) {
      const path = window.location.hash.replace('#', '');
      window.history.replaceState(null, '', path);
    }
  }, []);

  // Document title per route
  useE(() => {
    const titles = {
      '/home':     'vibing / farmer',
      '/strategy': 'New Strategy · vibing / farmer',
      '/agent':    'Autonomous Agent · vibing / farmer',
      '/history':  'History · vibing / farmer',
      '/settings': 'Settings · vibing / farmer',
    };
    document.title = titles[location.pathname] || 'vibing / farmer';
  }, [location.pathname]);

  // Record the furthest step reached so the rail can navigate to visited steps (and only those)
  useE(() => { setFurthest((f) => Math.max(f, STEPS.findIndex((s) => s.id === stage))); }, [stage]);

  const paletteIsLight = tweaks.palette === "bone-paper";
  const speed = SPEED_MS[tweaks.speed] || SPEED_MS.medium;

  const addLog = (entry) => {
    logIdRef.current += 1;
    const uid = `${logIdRef.current}-${Date.now()}`;
    setLogs((l) => [...l, { id: uid, time: nowT(), ...entry }]);
  };

  /* ----- Background agent: persistence + lifecycle + handlers ----- */
  useE(() => { localStorage.setItem('yv_agent_enabled', String(agentEnabled)); }, [agentEnabled]);
  useE(() => { localStorage.setItem('yv_agent_settings', JSON.stringify(agentSettings)); }, [agentSettings]);
  // Push threshold changes live (no worker restart → avoids polling churn on each keystroke)
  useE(() => { updateAgentConfig({ thresholds: agentSettings }); }, [agentSettings]);

  const handleAgentEvent = (ev) => {
    if (ev.kind === 'position') {
      setAgentData((d) => ({ ...d, lastUpdated: ev.timestamp, positions: { ...d.positions, [ev.vaultAddress]: { vaultName: ev.vaultName, balance: ev.balance, unclaimedRewards: ev.unclaimedRewards } } }));
      return;
    }
    if (ev.kind === 'harvest_executed') {
      addLog({ event: 'DepositExecuted', meta: `auto-harvest ${ev.vaultName} · tx ${shortAddr(ev.txHash)}`, txHash: ev.txHash, detail: `Auto-harvest claimed rewards from ${ev.vaultName}.` });
      setAgentData((d) => ({ ...d, alerts: d.alerts.filter((a) => !(a.kind === 'harvest_ready' && a.vaultAddress === ev.vaultAddress)) }));
      return;
    }
    // Alert kinds — dedupe by kind+vault, newest first, cap at 8
    const key = `${ev.kind}:${ev.vaultAddress || ev.vaultName || ''}`;
    const id = `${key}:${ev.timestamp || Date.now()}`;
    setAgentData((d) => ({ ...d, alerts: [{ id, ...ev }, ...d.alerts.filter((a) => `${a.kind}:${a.vaultAddress || a.vaultName || ''}` !== key)].slice(0, 8) }));
    const detail = ev.kind === 'rebalance_proposal' ? `Venice AI flagged ${ev.toProtocol} at ${ev.toApy}% vs your ${ev.fromVault} at ${ev.fromApy}% — capture +${ev.apyGain}% by rebalancing.`
      : ev.kind === 'risk_alert' ? `Severity ${ev.severity} · classified by Venice AI. Signal on ${ev.vaultName}. Action: alert surfaced, awaiting your decision.`
      : ev.kind === 'apy_drift' ? `APY on ${ev.vaultName} dropped to ${ev.currentApy}% (from ${ev.baselineApy}%, ${ev.driftPct}%).`
      : ev.kind === 'harvest_ready' ? `${ev.rewardsUsdc} USDC accrued on ${ev.vaultName} · ready to claim.` : '';
    addLog({ event: ev.kind === 'risk_alert' ? 'AgentFailed' : 'OrchestratorPlanned', meta: `${ev.kind.replace(/_/g, ' ')} · ${ev.vaultName || ev.fromVault || ''}`, detail });
  };

  // Start after deposit (positions exist), stop on disable / disconnect / leaving 'done'
  useE(() => {
    if (stage !== 'done' || !agentEnabled || !realAddress || !strategy?.agents?.length) return;
    const activeVaults = strategy.agents.map((a) => ({ address: a.vault.addr, name: a.vault.name, protocol: a.vault.protocol, depositApy: Number(a.vault.apy) }));
    startBackgroundAgent({
      userAddress: realAddress,
      activeVaults,
      rpcUrl: import.meta.env.VITE_RPC_URL,
      tavilyKey: import.meta.env.VITE_TAVILY_API_KEY,
      supportedProtocols: ['aave-v3', 'morpho-blue', 'spark', 'fluid'],
      thresholds: agentSettings,
    });
    const unsub = onAgentEvent(handleAgentEvent);
    addLog({ event: 'OrchestratorPlanned', meta: 'background agent · monitoring started' });
    return () => { unsub(); stopBackgroundAgent(); };
  }, [stage, agentEnabled, realAddress, strategy]);

  const dismissAlert = (id) => setAgentData((d) => ({ ...d, alerts: d.alerts.filter((a) => a.id !== id) }));

  const handleHarvestNow = async (alert) => {
    try {
      const tx = await harvestVault({ user: realAddress, vault: alert.vaultAddress, vaultName: alert.vaultName, rewardsUsdc: alert.rewardsUsdc });
      addLog({ event: 'DepositExecuted', meta: `harvest ${alert.vaultName} · tx ${shortAddr(tx)}`, txHash: tx, detail: `Claimed rewards from ${alert.vaultName}.` });
      dismissAlert(alert.id);
    } catch (e) { addLog({ event: 'AgentFailed', meta: `harvest failed: ${e.message}` }); }
  };

  const handleEmergencyWithdraw = async (alert) => {
    const pos = agentData.positions[alert.vaultAddress];
    const bal = BigInt(pos?.balance || '0');
    const amt = agentSettings.emergencyFull ? bal : (bal * BigInt(Math.round(agentSettings.emergencyPct)) / 100n);
    if (amt <= 0n) { addLog({ event: 'AgentFailed', meta: 'emergency withdraw · no balance tracked yet' }); return; }
    try {
      const tx = await emergencyWithdraw(alert.vaultAddress, amt.toString(), realAddress);
      addLog({ event: 'PermissionRevoked', meta: `emergency withdraw ${alert.vaultName} · tx ${shortAddr(tx)}`, txHash: tx, detail: `Emergency withdrew from ${alert.vaultName} to your wallet.` });
      dismissAlert(alert.id);
    } catch (e) { addLog({ event: 'AgentFailed', meta: `withdraw failed: ${e.message}` }); }
  };

  const handleReviewRebalance = (alert) => addLog({ event: 'OrchestratorPlanned', meta: `rebalance review · ${alert.fromVault} → ${alert.toProtocol} (+${alert.apyGain}%)`, detail: `Venice AI flagged ${alert.toProtocol} at ${alert.toApy}% vs ${alert.fromVault} at ${alert.fromApy}% (+${alert.apyGain}%). Rebalancing requests a fresh ERC-7715 permission for the new vault.` });

  // After a withdraw: reduce/remove the position, sync the worker, stop the agent if empty
  const handleWithdrawSuccess = (vaultAddress, withdrawnUnits) => {
    const pos = agentData.positions[vaultAddress];
    const positions = { ...agentData.positions };
    if (pos) {
      const newBal = BigInt(pos.balance || '0') - BigInt(withdrawnUnits || '0');
      if (newBal <= 0n) delete positions[vaultAddress];
      else positions[vaultAddress] = { ...pos, balance: newBal.toString() };
    }
    setAgentData((d) => ({ ...d, positions }));
    const remaining = (strategy?.agents || []).filter((a) => positions[a.vault.addr]).map((a) => ({ address: a.vault.addr, name: a.vault.name, protocol: a.vault.protocol, depositApy: Number(a.vault.apy) }));
    if (remaining.length === 0) stopBackgroundAgent(); else updateAgentConfig({ activeVaults: remaining });
    addLog({ event: 'PermissionRevoked', meta: `withdrew ${shortAddr(vaultAddress)} · position updated`, detail: 'Position balance updated after withdraw; agent monitoring config synced.' });
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
        setMarketLive(!!veniceResult.marketContextUsed);
        setVaultLive(veniceResult.vaultDataSource === "defiLlama");
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
    setConnectError(null);
    try {
      const addr = await connectWallet();
      setRealAddress(addr);
      setConnectPhase("connected");
      addLog({ event: "Connected", meta: shortAddr(addr) });
    } catch (err) {
      setConnectPhase("idle");
      setConnectError(err.message);
      addLog({ event: "AgentFailed", meta: `connect failed: ${err.message}` });
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

  const handleSkillUpdate = (id, skillObj) => {
    updateSkillState(id, { state: "pending", skill: skillObj });
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
    setPermError(null);
    try {
      const permResult = await requestERC7715Permission(86400);
      setPermContext(permResult.permissionContext);
      setPermActive(true);
      const expiresAtMs = Date.now() + 86400 * 1000;
      setPermExpiresAt(expiresAtMs);
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
      setPermError(err.message);
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
          const ag = strategy?.agents?.find((a) => a.id === dId);
          if (ag && data.txHash) saveTransaction({
            txHash: data.txHash, vaultName: ag.vault.name, vaultAddress: ag.vault.addr,
            protocol: ag.vault.protocol, amountUsdc: ag.allocation, apy: ag.vault.apy,
            workerLabel: ag.name, workerId: ag.id, network: "sepolia",
          });
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
    // Seed positions from confirmed workers so AgentDashboard is populated immediately
    // without waiting for the background agent's first 5-minute poll.
    // Background agent overwrites these with real on-chain balances on first check.
    const seedPositions = {};
    (strategy?.agents || []).forEach((a) => {
      if (execMap[a.id]?.status === 'confirmed') {
        seedPositions[a.vault.addr] = {
          vaultName: a.vault.name,
          balance: String(Math.round(a.allocation * 1e6)),
          unclaimedRewards: '0',
        };
      }
    });
    if (Object.keys(seedPositions).length > 0) {
      setAgentData((d) => ({ ...d, positions: { ...d.positions, ...seedPositions }, lastUpdated: Date.now() }));
    }
    addLog({ event: "OrchestratorPlanned", meta: `multi-agent deployment finalized · ${strategy?.agents?.length} positions opened` });
  };

  const handleAgain = () => {
    setStage("strategy");
    navigate('/strategy');
    setFurthest(0);
    setStrategyPhase("input");
    setThinkingPhase(0);
    setStrategy(null);
    setSkillStates({});
    setEditingTexts({});
    setConnectPhase("idle");
    setConnectError(null);
    setPermActive(false);
    setPermContext(null);
    setPermError(null);
    setPermExpiresAt(null);
    setVeniceAuth(null);
    setMarketLive(null);
    setVaultLive(null);
    setExecMap({});
    setLogs([]);
    agentMapRef.current = {};
  };

  const handleRevoke = () => {
    setPermActive(false);
    setPermExpiresAt(null);
    (strategy?.agents || []).forEach((a) =>
      addLog({ event: "PermissionRevoked", agent: a.id, meta: "agent halted · scope cleared" })
    );
  };

  /* ----- Settings handlers ----- */
  const handleLanguageChange = (lang) => { setLanguage(lang); saveSetting("language", lang); };
  const handleDisconnect = () => {
    stopBackgroundAgent();
    setRealAddress(null); setConnectPhase("idle"); setPermActive(false); setPermContext(null); setPermExpiresAt(null); setVeniceAuth(null);
    addLog({ event: "PermissionRevoked", meta: "wallet disconnected · session cleared" });
  };
  const handleSwitchNetwork = async () => {
    try { await switchToSepolia(); addLog({ event: "Connected", meta: "network · Sepolia" }); }
    catch (e) { addLog({ event: "AgentFailed", meta: `switch network failed: ${e.message}` }); }
  };
  const handleResetAgentSettings = () => { setAgentSettings({ ...AGENT_SETTINGS_DEFAULTS }); setAgentEnabled(true); };
  const handleResetSkill = () => { clearUserSkill(); setSkillSource("default"); };

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
        return <ConnectCard phase={connectPhase} error={connectError} onConnect={handleConnect} onUpgrade={handleUpgrade} onDone={handleConnectDone} onCancel={() => { setConnectPhase("idle"); setStage("strategy"); }} />;
      case "skills":
        return (
          <SkillReviewCard
            agents={strategy?.agents || []}
            riskProfile={risk}
            skillStates={skillStates}
            onApprove={handleSkillApprove}
            onApproveAll={handleApproveAll}
            onSkillUpdate={handleSkillUpdate}
            onContinue={handleSkillsContinue}
          />
        );
      case "permission":
        return <PermissionCard strategy={strategy} phase={permPhase} error={permError} onGrant={handleGrant} onConfirm={handlePermConfirm} onReject={handlePermReject} />;
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

  // APY/meta per vault for the agent dashboard (positions events don't carry APY)
  const agentVaultMeta = {};
  (strategy?.agents || []).forEach((a) => { agentVaultMeta[a.vault.addr.toLowerCase()] = { apy: Number(a.vault.apy), protocol: a.vault.protocol }; });

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <TopBar walletConnected={walletPhase !== "none"} onReset={handleAgain} />
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={
            <HomePage
              userAddress={realAddress}
              positions={agentData.positions}
              alerts={agentData.alerts}
              vaultMeta={agentVaultMeta}
              lastUpdated={agentData.lastUpdated}
              agentActive={agentEnabled && stage === "done"}
              autoHarvest={agentSettings.autoHarvest}
              onConnect={handleConnect}
              onStartStrategy={handleAgain}
              onOpenAgent={() => navigate('/agent')}
              onViewHistory={() => navigate('/history')}
              onWithdrawSuccess={handleWithdrawSuccess}
            />
          } />
          <Route path="/strategy" element={
            <>
              <StepRail stage={stage} furthest={furthest} onStepClick={goBack} lang={language} />
              <div className="stage" key={`${stage}-${strategyPhase}`}>
                {renderStage()}
              </div>
            </>
          } />
          <Route path="/agent" element={
            <div className="stage">
              <div style={{ maxWidth: 820, margin: "0 auto", width: "100%" }}>
                <AgentDashboard
                  active={agentEnabled && stage === "done"}
                  positions={agentData.positions}
                  alerts={agentData.alerts}
                  vaultMeta={agentVaultMeta}
                  lastUpdated={agentData.lastUpdated}
                  userAddress={realAddress}
                  settings={agentSettings}
                  withdrawEnabled={stage === "done"}
                  onHarvest={handleHarvestNow}
                  onEmergencyWithdraw={handleEmergencyWithdraw}
                  onReview={handleReviewRebalance}
                  onDismiss={dismissAlert}
                  onWithdrawSuccess={handleWithdrawSuccess}
                  onNewStrategy={handleAgain}
                />
              </div>
            </div>
          } />
          <Route path="/history" element={<HistoryPanel />} />
          <Route path="/settings" element={
            <SettingsPage
              userAddress={realAddress}
              walletPhase={walletPhase}
              permActive={permActive}
              permExpiresAt={permExpiresAt}
              permissionCount={strategy?.agents?.length || 0}
              agentEnabled={agentEnabled}
              setAgentEnabled={setAgentEnabled}
              agentSettings={agentSettings}
              setAgentSettings={setAgentSettings}
              skillSource={skillSource}
              language={language}
              onLanguageChange={handleLanguageChange}
              onChangeSkill={() => setSkillDrawerOpen(true)}
              onResetSkill={handleResetSkill}
              onResetAgentSettings={handleResetAgentSettings}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onSwitchNetwork={handleSwitchNetwork}
              onRevoke={handleRevoke}
            />
          } />
          <Route path="/vault/:protocol" element={
            <VaultDetailPage positions={agentData.positions} />
          } />
          <Route path="/tx/:txHash" element={<TxDetailPage />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </main>
      <aside className="rail">
        <WalletPanel phase={walletPhase} address={realAddress} />
        <PermissionPanel active={permActive} strategy={strategy} onRevoke={handleRevoke} expiresAt={permExpiresAt} />
        <ActivityPanel logs={logs} />
        <SkillPanel skillSource={skillSource} marketLive={marketLive} vaultLive={vaultLive} onCustomize={() => setSkillDrawerOpen(true)} />
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
            <div className="modal-eyebrow">AI · timeout</div>
            <h3 className="modal-title">AI is still processing — continue waiting?</h3>
            <p className="lede" style={{ marginTop: 8 }}>
              Generation has exceeded {Math.round(VENICE_TIMEOUT_MS / 1000)} seconds. Do you want to keep waiting or use the default strategy instead?
            </p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={handleStopWaiting}>Use default</button>
              <button className="btn btn-primary" onClick={handleKeepWaiting}>Keep waiting</button>
            </div>
          </div>
        </div>
      )}

      {devMode && <TweaksPanel title="Tweaks">
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

        <TweakSection label="Autonomous Agent" />
        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            Enable agent
            <input type="checkbox" checked={agentEnabled} onChange={(e) => setAgentEnabled(e.target.checked)} />
          </label>
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            Auto-harvest
            <input type="checkbox" checked={agentSettings.autoHarvest} onChange={(e) => setAgentSettings((s) => ({ ...s, autoHarvest: e.target.checked }))} />
          </label>
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            Min harvest (USDC)
            <input type="number" step="0.1" value={agentSettings.harvestMinUsdc} onChange={(e) => setAgentSettings((s) => ({ ...s, harvestMinUsdc: Number(e.target.value) }))} style={{ width: 56 }} />
          </label>
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            APY drop alert (%)
            <input type="number" value={agentSettings.apyDropPct} onChange={(e) => setAgentSettings((s) => ({ ...s, apyDropPct: Number(e.target.value) }))} style={{ width: 56 }} />
          </label>
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            Rebalance threshold (%)
            <input type="number" step="0.1" value={agentSettings.rebalanceThresholdPct} onChange={(e) => setAgentSettings((s) => ({ ...s, rebalanceThresholdPct: Number(e.target.value) }))} style={{ width: 56 }} />
          </label>
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            Emergency: full position
            <input type="checkbox" checked={agentSettings.emergencyFull} onChange={(e) => setAgentSettings((s) => ({ ...s, emergencyFull: e.target.checked }))} />
          </label>
          {!agentSettings.emergencyFull && (
            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Emergency: partial (%)
              <input type="number" value={agentSettings.emergencyPct} onChange={(e) => setAgentSettings((s) => ({ ...s, emergencyPct: Number(e.target.value) }))} style={{ width: 56 }} />
            </label>
          )}
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            Risk monitoring
            <input type="checkbox" checked={agentSettings.riskMonitoring} onChange={(e) => setAgentSettings((s) => ({ ...s, riskMonitoring: e.target.checked }))} />
          </label>
        </div>

        <TweakSection label="Jump to step · dev only" />
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
                cursor: "pointer",
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
      </TweaksPanel>}
    </div>
  );
};

export default App;
