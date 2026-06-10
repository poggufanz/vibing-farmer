/* ============================================
   VIBING FARMER — App (multi-agent + real Web3)
   Design state machine wired to real wallet.js / venice.js / orchestrator.js
   ============================================ */
import React, { useState as useS, useEffect as useE, useRef as useR } from 'react';
import { isDevMode } from './devFlag.js';

import { Icon, Sidebar, TopBar, StepRail, STEPS } from './components.jsx';
import {
  InputScreen, ThinkingCard, ConnectCard,
  PermissionCard, SuccessCard, shortAddr,
} from './screens.jsx';
import { SkillReviewCard } from './skills.jsx';
import {
  StrategyCard, ExecuteCard, MemoryModal, LoopStatusPanel,
  buildStrategy, makeInitialExecState,
} from './agents.jsx';
import {
  useTweaks, TweaksPanel, TweakSection, TweakRadio,
} from './tweaks-panel.jsx';

import { ethers } from 'ethers';
import { connectWallet, requestERC7715Permission, signSiweForVenice, switchToSepolia, getProvider } from './wallet.js';
import { generateStrategy } from './venice.js';
import { saveGrant, clearGrant } from './strategy/grantStore.js';
import { initSession, clearSession, hasSession, saveSessionGrant } from './strategy/session.js';
import { rehydrateSession } from './strategy/rehydrate.js';
import { attestStrategyOnChain, formatAttestation } from './attestation.js';
import { detectMetaMaskVersion } from './flaskDetect.js';
import FlaskGate from './components/FlaskGate.jsx';
import OnboardingFlow from './components/OnboardingFlow.jsx';
import { OrchestratorAgent } from './orchestrator.js';
import { makeAgentId } from './worker.js';
import { VAULT_CATALOG, VENICE_TIMEOUT_MS, AGENT_VAULT_DEPOSITOR_ADDRESS, DEPOSITOR_ABI } from './config.js';
import { loadPersistedPositions, persistPositions, reconcilePositionsFromChain, mergePositions, applyChainPositions } from './positionsStore.js';
import { getReadProvider } from './readProvider.js';
import SkillDrawer from './components/SkillDrawer.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';
import { saveTransaction } from './history.js';
import { startBackgroundAgent, stopBackgroundAgent, updateAgentConfig, onAgentEvent, harvestVault, emergencyWithdraw } from './agents/agentController.js';
import AgentDashboard from './components/AgentDashboard.jsx';
import HomePage from './components/HomePage.jsx';
import LandingHero from './components/LandingHero.jsx';
import ExplorerPage from './components/ExplorerPage.jsx';
import EcosystemPage from './components/EcosystemPage.jsx';
import SettingsPage from './components/SettingsPage.jsx';
import { WalletPanel, PermissionPanel, ActivityPanel, SkillPanel, PalettePicker, PALETTES } from './components/RightRail.jsx';
import { loadSettings, saveSetting } from './settingsStore.js';
import { clearUserSkill } from './skillLoader.js';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import VaultDetailPage from './components/VaultDetailPage.jsx';
import TxDetailPage from './components/TxDetailPage.jsx';

import { buildStrategyState, enforceActionSpace, scoreReward } from './strategy/mdp.js';
import { createMonitorLoop } from './strategy/monitorLoop.js';
import { councilVerdict } from './strategy/council.js';
import { reflect } from './strategy/reflector.js';
import { increment as playbookIncrement, weight as playbookWeight } from './strategy/playbook.js';
import { saveCycle, getCycles, getJournalSummary } from './strategy/cycleJournal.js';
import { relayHarvest, relayWithdraw, getRelayerAddress } from './relay.js';
import { setupBgAgentsWithSessionKey } from './wallet.js';
import { resolveCouncilConflict } from './venice.js';

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
        addr: cat.address || VAULT_CATALOG.find((c) => c.protocol === (v.protocol || ''))?.address || v.address,
        tvl: v.tvlFormatted || live.tvlFormatted || "N/A",
        isLiveData: live.source === "defiLlama",
        defillamaPool: live.defillamaPool || null,
      },
    };
  });
  const blended = agents.reduce((acc, a) => acc + Number(a.vault.apy) * (a.allocation / total), 0);
  return { agents, total, blendedApy: blended.toFixed(1), risk, rationale: veniceResult.strategy_summary || veniceResult.rationale, reward: veniceResult.reward || null, mdpState: veniceResult.mdpState || null };
};

// Worker monitoring list from ALL held positions (not just the latest strategy), enriched
// with protocol/APY meta from the current strategy first, then the static catalog — so the
// background agent keeps watching earlier deposits after a new one is added.
const buildActiveVaults = (positions, strategy) => {
  const meta = {};
  (strategy?.agents || []).forEach((a) => { meta[a.vault.addr.toLowerCase()] = { name: a.vault.name, protocol: a.vault.protocol, depositApy: Number(a.vault.apy) }; });
  VAULT_CATALOG.forEach((v) => { const k = v.address.toLowerCase(); if (!meta[k]) meta[k] = { name: v.name, protocol: v.protocol, depositApy: Number(v.apy) }; });
  return Object.entries(positions || {})
    .map(([address, p]) => { const m = meta[address.toLowerCase()] || {}; return { address, name: p.vaultName || m.name, protocol: m.protocol, depositApy: m.depositApy || 0 }; })
    .filter((v) => v.protocol);
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
  const [rawStrategy, setRawStrategy] = useS(null); // raw Venice result (carries strategyHash) for on-chain attestation
  const [strategyAttestation, setStrategyAttestation] = useS(null);
  const [attesting, setAttesting] = useS(false);
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

  // Rehydrate the single grant on mount: if a valid ERC-7715 grant is persisted,
  // re-boot the ERC-7710 session so the user is never re-prompted within 24h.
  useE(() => {
    const r = rehydrateSession();
    if (r.active) {
      setPermActive(true);
      setPermExpiresAt(r.expiresAt);
      setPermContext(r.permissionContext);
    }
  }, []);

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
  const loopRef = useR(null);
  // Tracks which user addresses have had session key setup done (survives re-renders).
  const sessionKeySetupRef = useR(new Set());
  const [loopTick, setLoopTick] = useS(0);
  const [loopPhase, setLoopPhase] = useS(null); // live pipeline phase from monitorLoop onPhase
  const [permContext, setPermContext] = useS(null);
  const [veniceAuth, setVeniceAuth] = useS(null);
  const [mmVersion, setMmVersion] = useS(null); // MetaMask flavor/version — Flask detection (once on mount)
  const [onboarded, setOnboarded] = useS(() => localStorage.getItem('yv_onboarded') === 'true');
  const [skipLanding, setSkipLanding] = useS(() => localStorage.getItem('yv_skip_landing') === 'true');

  // Detect MetaMask flavor/version once on mount — Flask gate for ERC-7715.
  useE(() => { detectMetaMaskVersion().then(setMmVersion); }, []);

  // Strategy Attestation — NON-BLOCKING, best-effort. Fires once a wallet provider
  // exists (post-connect) and the AI strategy carries a deterministic hash. Any
  // failure/rejection is swallowed by attestStrategyOnChain → strategy still executes.
  useE(() => {
    const provider = getProvider();
    if (!rawStrategy?.strategyHash || !provider || strategyAttestation || attesting) return;
    setAttesting(true);
    attestStrategyOnChain(rawStrategy, provider)
      .then((a) => setStrategyAttestation(formatAttestation(a)))
      .finally(() => setAttesting(false));
  }, [rawStrategy, realAddress]);

  // Background agent
  const [agentEnabled, setAgentEnabled] = useS(() => localStorage.getItem('yv_agent_enabled') !== 'false');
  const [agentSettings, setAgentSettings] = useS(loadAgentSettings);
  const [agentData, setAgentData] = useS({ positions: {}, alerts: [], lastUpdated: null });

  const [sbExtended, setSbExtended] = useS(() => localStorage.getItem('yv_sb_extended') === 'true');
  const [railCollapsed, setRailCollapsed] = useS(() => localStorage.getItem('yv_rail_collapsed') === 'true');

  const toggleSb = () => {
    setSbExtended(prev => {
      localStorage.setItem('yv_sb_extended', String(!prev));
      return !prev;
    });
  };

  const toggleRail = () => {
    setRailCollapsed(prev => {
      localStorage.setItem('yv_rail_collapsed', String(!prev));
      return !prev;
    });
  };

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
  // Restore positions on connect (instant from cache) then reconcile against chain.
  // Fixes home resetting to "no positions" after reload/reconnect with same wallet.
  useE(() => {
    if (!realAddress) return;
    const restored = loadPersistedPositions(realAddress);
    if (Object.keys(restored).length) {
      setAgentData((d) => ({ ...d, positions: { ...restored, ...d.positions } }));
    }
    let alive = true;
    reconcilePositionsFromChain(realAddress)
      .then((chain) => {
        if (!alive || !chain) return; // null = no RPC / all reads failed → keep cache
        // Merge, never replace: on-chain truth updates/adds vaults but can't wipe seeded
        // positions whose deposits are real but not yet mined (chain reads them as 0).
        // The persist effect writes the merged result, so an empty chain can't clobber cache.
        setAgentData((d) => ({ ...d, positions: mergePositions(d.positions, chain), lastUpdated: Date.now() }));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [realAddress]);

  // Persist in-session position changes (deposits, withdraws). Skip empty pre-hydration
  // writes so a fresh-connect {} can't clobber the cached snapshot before restore runs.
  useE(() => {
    if (!realAddress) return;
    if (Object.keys(agentData.positions || {}).length === 0) return;
    persistPositions(realAddress, agentData.positions);
  }, [agentData.positions, realAddress]);

  // Event-driven sync: re-read chain the instant a real Deposit/Withdraw lands for this
  // user — no waiting on the worker's poll. Debounced so a burst of parallel deposits
  // collapses into ONE reconcile. Listens + reads via the dedicated read-only provider
  // (getReadProvider) — never the wallet's BrowserProvider, which -32603s while a
  // wallet_* RPC is pending. applyChainPositions is authoritative (can lower on
  // withdraw), unlike the raise-only connect-time merge that protects unconfirmed seeds.
  useE(() => {
    if (!realAddress) return;
    const provider = getReadProvider();
    const contract = new ethers.Contract(AGENT_VAULT_DEPOSITOR_ADDRESS, DEPOSITOR_ABI, provider);
    let timer = null;
    const sync = async () => {
      const chain = await reconcilePositionsFromChain(realAddress);
      if (!chain) return;
      setAgentData((d) => ({ ...d, positions: applyChainPositions(d.positions, chain), lastUpdated: Date.now() }));
    };
    const onEvent = () => { clearTimeout(timer); timer = setTimeout(sync, 1500); };
    const depFilter = contract.filters.DepositExecuted(null, realAddress); // (agentId, user, ...)
    const wdFilter = contract.filters.WithdrawExecuted(realAddress);       // (user, ...)

    // Capture deposit event to save amounts (each internal call's amount tracked separately)
    const onDepositEvent = (agentId, user, vault, amount, shares, event) => {
      const vaultMeta = VAULT_CATALOG.find(v => v.address.toLowerCase() === vault.toLowerCase());
      const amountUsdc = Number(amount) / 1e6;
      if (amountUsdc > 0) {
        saveTransaction({
          txHash: event.transactionHash,
          vaultName: vaultMeta?.name || `Vault ${vault.slice(0, 6)}…`,
          vaultAddress: vault,
          protocol: vaultMeta?.protocol,
          apy: vaultMeta?.apy,
          amountUsdc,
          workerLabel: vaultMeta?.name || `Vault ${vault.slice(0, 10)}…`,
          network: 'sepolia',
        });
      }
      onEvent(); // Also trigger position sync after 1.5s debounce
    };

    contract.on(depFilter, onDepositEvent);
    contract.on(wdFilter, onEvent);
    return () => {
      clearTimeout(timer);
      contract.off(depFilter, onDepositEvent);
      contract.off(wdFilter, onEvent);
    };
  }, [realAddress]);

  useE(() => { localStorage.setItem('yv_agent_enabled', String(agentEnabled)); }, [agentEnabled]);
  useE(() => { localStorage.setItem('yv_agent_settings', JSON.stringify(agentSettings)); }, [agentSettings]);
  // Push threshold changes live (no worker restart → avoids polling churn on each keystroke)
  useE(() => { updateAgentConfig({ thresholds: agentSettings }); }, [agentSettings]);

  const handleAgentEvent = (ev) => {
    if (loopRef.current) {
      if (ev.kind === 'harvest_ready') {
        loopRef.current.submitIdea({ kind: 'harvest', vaultAddress: ev.vaultAddress, vaultName: ev.vaultName });
      } else if (ev.kind === 'rebalance_proposal') {
        const from = VAULT_CATALOG.find((v) => v.name === ev.fromVault);
        const to = VAULT_CATALOG.find((v) => v.protocol === ev.toProtocol);
        if (from && to) {
          loopRef.current.submitIdea({
            kind: 'rebalance',
            fromVaultAddress: from.address,
            apyGain: Number(ev.apyGain),
            proposed: [{ address: to.address, allocation: 1, risk_tier: to.risk }],
            currentAllocations: [{ address: from.address, allocation: 1, risk_tier: from.risk }],
          });
        }
      }
    }

    if (ev.kind === 'position') {
      setAgentData((d) => ({ ...d, lastUpdated: ev.timestamp, positions: mergePositions(d.positions, { [ev.vaultAddress]: { vaultName: ev.vaultName, balance: ev.balance, unclaimedRewards: ev.unclaimedRewards } }) }));
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
    const detail = ev.kind === 'rebalance_proposal' ? `Venice AI flagged ${ev.toProtocol} at ${ev.toApy}% vs your ${ev.fromVault} at ${ev.fromApy}% · capture +${ev.apyGain}% by rebalancing.`
      : ev.kind === 'risk_alert' ? `Severity ${ev.severity} · classified by Venice AI. Signal on ${ev.vaultName}. Action: alert surfaced, awaiting your decision.`
      : ev.kind === 'apy_drift' ? `APY on ${ev.vaultName} dropped to ${ev.currentApy}% (from ${ev.baselineApy}%, ${ev.driftPct}%).`
      : ev.kind === 'harvest_ready' ? `${ev.rewardsUsdc} USDC accrued on ${ev.vaultName} · ready to claim.` : '';
    addLog({ event: ev.kind === 'risk_alert' ? 'AgentFailed' : 'OrchestratorPlanned', meta: `${ev.kind.replace(/_/g, ' ')} · ${ev.vaultName || ev.fromVault || ''}`, detail });
  };

  // Start after deposit (positions exist), stop on disable / disconnect / leaving 'done'
  useE(() => {
    if (stage !== 'done' || !agentEnabled || !realAddress || !strategy?.agents?.length) return;
    // Monitor EVERY held position (accumulated across deposits), not just the latest
    // strategy — otherwise a new deposit would stop the agent watching earlier vaults.
    let activeVaults = buildActiveVaults(agentData.positions, strategy);
    if (!activeVaults.length) activeVaults = strategy.agents.map((a) => ({ address: a.vault.addr, name: a.vault.name, protocol: a.vault.protocol, depositApy: Number(a.vault.apy) }));
    // ── Session key setup (once per user, zero-popup autonomous loop) ──────────
    // When autoHarvest is enabled, pre-authorize the 1Shot server wallet as a
    // session key in AgentVaultDepositor. One EIP-5792 batch popup (grant bg
    // permissions + authorizeSessionKey) — after this, all harvest/withdraw calls
    // route through the managed relay with zero MetaMask prompts.
    if (agentSettings.autoHarvest && !sessionKeySetupRef.current.has(realAddress)) {
      sessionKeySetupRef.current.add(realAddress); // mark eagerly to prevent double-call
      getRelayerAddress()
        .then((serverWallet) => {
          if (!serverWallet) throw new Error('Relayer wallet not configured');
          return setupBgAgentsWithSessionKey(
            activeVaults.map((v) => v.address),
            serverWallet
          );
        })
        .then(() => addLog({ event: 'OrchestratorPlanned', meta: 'session key · authorized — monitor loop now zero-popup' }))
        .catch((err) => {
          sessionKeySetupRef.current.delete(realAddress); // allow retry on next start
          addLog({ event: 'AgentFailed', meta: `session key setup failed: ${err?.message}` });
        });
    }

    startBackgroundAgent({
      userAddress: realAddress,
      activeVaults,
      rpcUrl: import.meta.env.VITE_RPC_URL,
      // Tavily key no longer passed to client — risk scan routes through /api/search proxy.
      supportedProtocols: ['aave-v3', 'morpho-blue', 'spark', 'fluid'],
      thresholds: { ...agentSettings, autoHarvest: false },
    });
    const unsub = onAgentEvent(handleAgentEvent);
    addLog({ event: 'OrchestratorPlanned', meta: 'background agent · monitoring started' });

    // ── Autonomous monitor loop — NEVER-STOP spine + TradingAgents council ──
    const loop = createMonitorLoop({
      getState: async () => buildStrategyState({
        amountUsdc: Number(amount) || 0,
        riskLevel: risk,
        numVaults: strategy.agents.length,
        vaultData: VAULT_CATALOG,
        marketContext: marketLive,
        positions: agentData.positions,
      }),
      runGates: (proposed, state) => enforceActionSpace(proposed, state),
      simulate: (allocations, state) => scoreReward(allocations, state),
      council: (input) => councilVerdict(input, {
        weight: playbookWeight,
        resolveConflict: resolveCouncilConflict,
      }),
      execute: async (idea) => {
        // Respect autoHarvest setting — if disabled the loop observes/suggests only,
        // no on-chain calls, no MetaMask popups. User opts in explicitly.
        if (!agentSettings.autoHarvest) return null;
        if (idea.kind === 'harvest') {
          const { txHash } = await relayHarvest({ user: realAddress, vault: idea.vaultAddress, recompound: false });
          saveTransaction({ txHash, vaultName: idea.vaultName, vaultAddress: idea.vaultAddress, amountUsdc: 0, workerLabel: 'MonitorLoop', network: 'sepolia' });
          return txHash;
        }
        if (idea.kind === 'rebalance') {
          const pos = agentData.positions[idea.fromVaultAddress];
          const { txHash } = await relayWithdraw({ user: realAddress, vault: idea.fromVaultAddress, amount: pos?.balance || '0' });
          return txHash;
        }
        throw new Error(`unknown idea kind: ${idea.kind}`);
      },
      reflect: (cycle) => reflect(cycle, { increment: playbookIncrement }),
      journal: { saveCycle: (row) => { saveCycle(row); setLoopTick((t) => t + 1); } },
      heartbeatMs: (agentSettings.apyInterval || 10) * 60 * 1000,
      onPhase: (p) => setLoopPhase(p === 'sleep' ? null : p),
    });
    loopRef.current = loop;
    loop.start();

    return () => { unsub(); stopBackgroundAgent(); loop.stop(); loopRef.current = null; setLoopPhase(null); };
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
    setStrategyAttestation(null);
    setRawStrategy(null);
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
        setRawStrategy(veniceResult); // carries strategyHash → attestation effect picks it up once a provider exists
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

  const handleSkillsContinue = () => {
    // A valid persisted grant means the user already signed once — skip the
    // permission card entirely and go straight to execution (true "ask once").
    if (hasSession() && permActive && permContext) {
      setStage("execute");
      startExecution(permContext);
      return;
    }
    setStage("permission");
  };

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
      const expiresAtMs = Date.now() + 86400 * 1000;

      // DIAGNOSTIC: confirm what Flask actually returned. If delegationManager
      // is missing here, session redemption never boots and every later action
      // falls back to the popup-per-call path — this line tells us why.
      console.log('[strategy] ERC-7715 grant result:', {
        permissionContext: permResult.permissionContext,
        delegationManager: permResult.delegationManager,
        grantedPermissions: permResult.grantedPermissions,
      });
      const gp = permResult.grantedPermissions;
      console.log("chain id:", gp?.[0]?.chainId);
      console.log("context:", gp?.[0]?.context);
      console.log("signerMeta:", gp?.[0]?.signerMeta);
      console.log("accountMeta:", gp?.[0]?.accountMeta);

      // Boot the ERC-7710 session + persist the single grant → all later actions
      // redeem with zero popup, and reload/re-entry within 24h skips this step.
      if (permResult.delegationManager) {
        initSession({
          permissionContext: permResult.permissionContext,
          delegationManager: permResult.delegationManager,
        });
        saveSessionGrant({
          permissionContext: permResult.permissionContext,
          delegationManager: permResult.delegationManager,
          expiresAt: expiresAtMs,
        });
      }

      setPermContext(permResult.permissionContext);
      setPermActive(true);
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
          const stepStatus = data.status === "done" ? "confirmed"
            : data.status === "skipped" ? "skipped"
            : "running";
          setExecMap((prev) => {
            const cur = prev[dId] || prev[agentId] || {};
            return {
              ...prev,
              [dId]: {
                ...cur,
                activeStep: stepName,
                gasMethod: data.gasMethod || cur.gasMethod || null,
                steps: { ...(cur.steps || {}), [stepName]: stepStatus },
                hashes: data.txHash ? { ...(cur.hashes || {}), [stepName]: data.txHash } : (cur.hashes || {}),
                memory: [...(cur.memory || []), {
                  status: stepStatus,
                  title: `${stepName} ${data.status === "done" ? "confirmed" : "executing"}`,
                  meta: data.txHash
                    ? `tx ${shortAddr(data.txHash)}${data.gasMethod === "user-signed" ? " · ⚠ user-signed" : ""}`
                    : "via 1Shot relayer",
                  hash: data.txHash || null,
                  t: nowT(),
                }],
              },
            };
          });
          if (data.status === "skipped" && stepName === "swap") {
            addLog({ event: "SwapExecuted", agent: dId, meta: data.reason || "skipped · no swap required" });
          }
          if (data.status === "done") {
            const evMap = { swap: "SwapExecuted", approve: "ApproveExecuted", deposit: "DepositExecuted" };
            if (stepName === "deposit") {
              const gasLabel = data.gasMethod === "relayer" ? "gas paid by relayer"
                : data.gasMethod === "user-signed" ? "⚠ gas paid by user · relay not configured"
                : "";
              addLog({
                event: "DepositExecuted", agent: dId,
                meta: `${data.txHash ? `tx ${shortAddr(data.txHash)}` : "no tx hash"}${gasLabel ? " · " + gasLabel : ""}`,
              });
            } else if (evMap[stepName]) {
              addLog({ event: evMap[stepName], agent: dId, meta: data.txHash ? `tx ${shortAddr(data.txHash)}` : "no tx hash" });
            }
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
                  meta: `tx ${shortAddr(data.txHash)}`,
                  hash: data.txHash,
                  lesson: `vault deposit complete · strategy executed`,
                  t: nowT(),
                }],
                metrics: { ...(cur.metrics || {}), completedAt: Date.now(), successRate: 100 },
              },
            };
          });
          addLog({ event: "AgentCompleted", agent: dId, meta: data.txHash ? `tx ${shortAddr(data.txHash)}` : "completed · no tx hash" });
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

  // Chain balances can lag 1-2 blocks after a deposit. Retry until at least one
  // vault reports a non-zero balance, then trust the on-chain numbers.
  async function reconcileWithRetry(address, maxAttempts = 3, delayMs = 3000) {
    for (let i = 0; i < maxAttempts; i++) {
      let result = null;
      try { result = await reconcilePositionsFromChain(address); } catch { result = null; }
      if (result && Object.values(result).some((p) => BigInt(p.balance || '0') > 0n)) {
        return result;
      }
      if (i < maxAttempts - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
    return null;
  }

  /* ----- DONE (step 06) ----- */
  const handleExecDone = async () => {
    setStage("done");
    // Allocation-based FALLBACK only — used when the chain read is unavailable (no RPC)
    // or a vault reads 0 (deposit tx not yet mined). Stored in raw token
    // units (allocation USDC * 1e6); the display layer divides by 1e6.
    const seedPositions = {};
    (strategy?.agents || []).forEach((a) => {
      if (execMap[a.id]?.status === 'confirmed') {
        const addr = a.vault.addr;
        const prev = seedPositions[addr];
        const prevBal = BigInt(prev?.balance || '0');
        const newBal = BigInt(Math.round(a.allocation * 1e6));
        seedPositions[addr] = {
          vaultName: a.vault.name,
          balance: (prevBal + newBal).toString(), // sum if multiple agents target same vault
          unclaimedRewards: prev?.unclaimedRewards || '0',
        };
      }
    });
    // SOURCE OF TRUTH: actual on-chain balanceOf -> convertToAssets (raw units).
    // If chain is available, use authoritative balances (can move up or down).
    // If chain unavailable (RPC down / tx not yet mined), ADD seed into existing
    // positions — these are confirmed new deposits, so we sum, not take max.
    const chain = await reconcileWithRetry(realAddress);
    if (chain) {
      const finalPositions = mergePositions(seedPositions, chain);
      if (Object.keys(finalPositions).length > 0) {
        setAgentData((d) => ({ ...d, positions: applyChainPositions(d.positions, finalPositions), lastUpdated: Date.now() }));
      }
    } else if (Object.keys(seedPositions).length > 0) {
      // Chain unavailable: sum new allocations into existing positions
      setAgentData((d) => {
        const positions = { ...(d.positions || {}) };
        for (const [addr, pos] of Object.entries(seedPositions)) {
          const key = Object.keys(positions).find((k) => k.toLowerCase() === addr.toLowerCase()) || addr;
          const curBal = BigInt(positions[key]?.balance || '0');
          const newBal = BigInt(pos.balance || '0');
          positions[key] = {
            vaultName: pos.vaultName,
            unclaimedRewards: positions[key]?.unclaimedRewards || pos.unclaimedRewards || '0',
            balance: (curBal + newBal).toString(),
          };
        }
        return { ...d, positions, lastUpdated: Date.now() };
      });
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
    setRawStrategy(null);
    setStrategyAttestation(null);
    setAttesting(false);
    setSkillStates({});
    setEditingTexts({});
    setConnectPhase("idle");
    setConnectError(null);
    setPermActive(false);
    setPermContext(null);
    setPermError(null);
    setPermExpiresAt(null);
    clearSession();
    clearGrant();
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
    clearSession();
    clearGrant();
    (strategy?.agents || []).forEach((a) =>
      addLog({ event: "PermissionRevoked", agent: a.id, meta: "agent halted · scope cleared" })
    );
  };

  /* ----- Settings handlers ----- */
  const handleLanguageChange = (lang) => { setLanguage(lang); saveSetting("language", lang); };
  const handleDisconnect = () => {
    stopBackgroundAgent();
    setRealAddress(null); setConnectPhase("idle"); setPermActive(false); setPermContext(null); setPermExpiresAt(null); setVeniceAuth(null);
    clearSession();
    clearGrant();
    addLog({ event: "PermissionRevoked", meta: "wallet disconnected · session cleared" });
  };
  const handleSwitchNetwork = async () => {
    try { await switchToSepolia(); addLog({ event: "Connected", meta: "network · Base Sepolia" }); }
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
      // Preserve real execution state. Navigating back to "done" must NOT fabricate
      // tx hashes — only fill a confirmed shell (no hashes) for agents the user
      // genuinely reached but whose live exec map was lost (e.g. after reload).
      setExecMap((prev) => {
        const map = { ...(prev || {}) };
        ensured.agents.forEach((a) => {
          const cur = map[a.id];
          const alreadyReal = cur && cur.hashes && cur.hashes.deposit;
          if (alreadyReal) return; // keep real, event-sourced state untouched
          map[a.id] = {
            status: "confirmed", activeStep: null,
            steps: { swap: "skipped", approve: "confirmed", deposit: "confirmed" },
            hashes: cur?.hashes || {}, // no fabricated hash — empty if no real tx
            gasMethod: cur?.gasMethod || null,
            memory: cur?.memory?.length ? cur.memory : [{ status: "confirmed", title: "agent completed", meta: "position confirmed on-chain", t: nowT(), lesson: "vault deposit complete" }],
            metrics: cur?.metrics || { totalRuns: 1, successRate: 100, startedAt: Date.now(), completedAt: Date.now() },
          };
        });
        return map;
      });
    }
  };

  const renderStage = () => {
    switch (stage) {
      case "strategy":
        if (strategyPhase === "input")
          return <InputScreen amount={amount} setAmount={setAmount} risk={risk} setRisk={setRisk} onSubmit={handleSubmitPreference} />;
        if (strategyPhase === "thinking")
          return <ThinkingCard phase={thinkingPhase} times={thinkTimes} />;
        return <StrategyCard strategy={strategy} skillSource={skillSource} onProceed={handleAcceptStrategy} onRegenerate={handleRegenerate} strategyHash={rawStrategy?.strategyHash} attestation={strategyAttestation} attesting={attesting} />;
      case "connect":
        return <ConnectCard phase={connectPhase} error={connectError} mmVersion={mmVersion} onConnect={handleConnect} onUpgrade={handleUpgrade} onDone={handleConnectDone} onCancel={() => { setConnectPhase("idle"); setStage("strategy"); }} />;
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
        if (mmVersion && !mmVersion.supportsERC7715)
          return <FlaskGate detectedType={mmVersion.type} onRetry={() => detectMetaMaskVersion().then(setMmVersion)} />;
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
        return (
          <>
            <SuccessCard strategy={strategy} onAgain={handleAgain} address={realAddress} />
            {agentEnabled && (
              // loopTick re-renders the parent on each journal write; no key remount
              // so the panel's internal 1s countdown clock and CSS animations persist.
              <LoopStatusPanel
                running={loopRef.current?.isRunning() || false}
                cycle={loopRef.current?.getCycle() || 0}
                summary={getJournalSummary()}
                rows={getCycles().slice(0, 8)}
                phase={loopPhase}
                nextTickAt={loopRef.current?.getNextTickAt() || null}
                heartbeatMs={loopRef.current?.getHeartbeatMs() || (agentSettings.apyInterval || 10) * 60 * 1000}
              />
            )}
          </>
        );
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

  // Public pages — standalone full-bleed, own NavBar, no wallet required.
  // Checked before every gate so judges and visitors can browse without connecting.
  if (location.pathname === '/explorer') {
    return <ExplorerPage />;
  }
  if (location.pathname === '/ecosystem') {
    return <EcosystemPage />;
  }

  // Landing takeover — first-time, not-yet-connected visitors see the scroll
  // hero before anything else. "Start farming" persists yv_skip_landing and
  // sets the URL to /strategy, which surfaces once onboarding (connect) completes.
  if (!skipLanding && !realAddress) {
    return (
      <LandingHero
        onStart={() => {
          localStorage.setItem('yv_skip_landing', 'true');
          localStorage.setItem('yv_onboarded', 'true');
          setSkipLanding(true);
          setOnboarded(true);
          navigate('/strategy');
        }}
      />
    );
  }

  // APY-first onboarding — full-screen takeover for first-time users (not yet onboarded).
  // Screen 1 (value prop, no wallet) → connect → Screen 2 (how it works) → main app.
  // "Skip intro" or "Got it" persists yv_onboarded=true so it never shows again.
  if (!onboarded) {
    return (
      <OnboardingFlow
        connected={!!realAddress}
        onConnect={handleConnect}
        onComplete={() => { localStorage.setItem('yv_onboarded', 'true'); setOnboarded(true); }}
      />
    );
  }

  return (
    <div className={`app ${sbExtended ? 'sb-extended' : 'sb-minimized'} ${railCollapsed ? 'rail-collapsed' : ''}`}>
      <Sidebar extended={sbExtended} onToggle={toggleSb} />
      <main className="main">
        <TopBar walletConnected={walletPhase !== "none"} onReset={handleAgain} railCollapsed={railCollapsed} onToggleRail={toggleRail} />
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
            <h3 className="modal-title">AI is still processing · continue waiting?</h3>
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
