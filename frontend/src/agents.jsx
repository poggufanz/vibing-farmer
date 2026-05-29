/* ============================================
   YIELD VIBING — Agent Graph + Memory (step 05)
   Hierarchical vis.js Network:
     Orchestrator → Worker Agents → Step nodes (Swap/Approve/Deposit) → Vault nodes
   Node colors driven by state: idle / running / confirmed / failed
   ============================================ */

const { useState: useAg, useEffect: useEAg, useRef: useRAg, useMemo: useMAg } = React;

/* ---------- Strategy data — generated per-flow ---------- */
const AGENT_PROTOCOLS = [
  { name: "MockVault USDC-A",   protocol: "aave-v3",    apy: "8.2",  drawdown: "-1.8", addr: "0x72bC6b01A60e22ab8b9D62E8237B37633C36aBa5", role: "Conservative · lending" },
  { name: "MockVault USDC-B",   protocol: "morpho-blue", apy: "12.7", drawdown: "-3.6", addr: "0x2BF6aa67D7a372ad0f4F45Bf2223156DF12eF9DF", role: "Balanced · liquidity provision" },
  { name: "LeveredVault USDC",  protocol: "pendle-v2",   apy: "21.5", drawdown: "-7.2", addr: "0x2BF6aa67D7a372ad0f4F45Bf2223156DF12eF9DF", role: "Aggressive · leveraged yield" },
];

const buildStrategy = (amount, risk) => {
  const total = Number(amount) || 100;
  // Allocation profile per risk
  const splitMap = {
    low:    [{ pct: 1.00, agents: 1 }],
    med:    [{ pct: 0.60, agents: 1 }, { pct: 0.40, agents: 1 }],
    high:   [{ pct: 0.40, agents: 1 }, { pct: 0.35, agents: 1 }, { pct: 0.25, agents: 1 }],
  };
  const config = splitMap[risk] || splitMap.low;
  const agents = config.map((c, i) => {
    const proto = AGENT_PROTOCOLS[i];
    const allocation = +(total * c.pct).toFixed(2);
    return {
      id: `worker-${i + 1}`,
      idx: String(i + 1).padStart(2, "0"),
      name: `Worker ${i + 1} · ${proto.role.split(" · ")[0]}`,
      role: proto.role,
      allocation,
      skillName: "yield_vault_deposit",
      vault: proto,
    };
  });
  const blendedApy = agents.reduce((acc, a, i) => acc + Number(a.vault.apy) * (a.allocation / total), 0);
  return {
    agents,
    total,
    blendedApy: blendedApy.toFixed(1),
    risk,
  };
};

/* ---------- Agent execution state model ---------- */
const STEP_IDS = ["swap", "approve", "deposit"];
const STEP_LABELS = { swap: "Swap", approve: "Approve", deposit: "Deposit" };

const makeInitialExecState = (agents) => {
  const map = {};
  agents.forEach((a) => {
    map[a.id] = {
      status: "idle",      // idle | running | confirmed | failed
      activeStep: null,
      steps: { swap: "idle", approve: "idle", deposit: "idle" },
      hashes: {},
      memory: [],          // run log
      metrics: { totalRuns: 0, successRate: null, avgGasCost: 0, startedAt: null, completedAt: null },
    };
  });
  return map;
};

/* ============================================
   Agent Graph (vis.js Network)
   ============================================ */
// NVL nodes use a single fill color + activated/selected glow.
const NVL_COLOR = {
  idle:      "#3a3b33",
  running:   "#f0b54a",
  confirmed: "#6fe39a",
  failed:    "#ff7479",
};
const NVL_COLOR_LIGHT = {
  idle:      "#b8b5aa",
  running:   "#b07a1a",
  confirmed: "#2d7a4a",
  failed:    "#a83a3a",
};
const GROUP_BASE = { orchestrator: "#cfff3d", worker: null, step: null, vault: "#6366f1" };

const computeOrchestratorState = (execMap) => {
  const vals = Object.values(execMap);
  if (vals.some((a) => a.status === "failed")) return "failed";
  if (vals.every((a) => a.status === "confirmed")) return "confirmed";
  if (vals.some((a) => a.status === "running")) return "running";
  return "idle";
};

const buildGraphTopology = (strategy) => {
  const nodes = [];
  const rels = [];
  nodes.push({ id: "orchestrator", captions: [{ value: "Orchestrator" }], size: 34 });

  strategy.agents.forEach((a) => {
    nodes.push({ id: a.id, captions: [{ value: a.name }], size: 26 });
    rels.push({ id: `e-orch-${a.id}`, from: "orchestrator", to: a.id });

    STEP_IDS.forEach((sid) => {
      const nid = `${a.id}-${sid}`;
      nodes.push({ id: nid, captions: [{ value: STEP_LABELS[sid] }], size: 18 });
      rels.push({ id: `e-${a.id}-${sid}`, from: a.id, to: nid });
    });

    const vid = `${a.id}-vault`;
    nodes.push({ id: vid, captions: [{ value: a.vault.name }], size: 22, color: GROUP_BASE.vault });
    rels.push({ id: `e-${a.id}-vault`, from: `${a.id}-deposit`, to: vid });
  });

  return { nodes, rels };
};

const nvlStyleFor = (state, palette) => ({
  color: palette[state] || palette.idle,
  activated: state === "running",
});

const AgentGraph = ({ strategy, execMap, onAgentClick, paletteIsLight }) => {
  const containerRef = useRAg(null);
  const nvlRef = useRAg(null);
  const clickHandlerRef = useRAg(null);
  const pulseRef = useRAg(null);

  const [nvlReady, setNvlReady] = useAg(!!window._nvl);

  // Listen to async NVL loaded bridge event
  useEAg(() => {
    if (window._nvl) return;
    const handleReady = () => setNvlReady(true);
    window.addEventListener("nvl-ready", handleReady);
    return () => window.removeEventListener("nvl-ready", handleReady);
  }, []);

  const palette = paletteIsLight ? NVL_COLOR_LIGHT : NVL_COLOR;

  // Build + mount NVL instance when strategy/palette/ready state changes
  useEAg(() => {
    if (!containerRef.current || !window._nvl) return;
    const { NVL } = window._nvl;
    const { nodes, rels } = buildGraphTopology(strategy);

    const options = {
      layout: "hierarchical",
      renderer: "canvas",
      disableTelemetry: true,
      initialZoom: 0.72,
      minZoom: 0.2,
      maxZoom: 2,
      styling: {
        defaultNodeColor: palette.idle,
        defaultRelationshipColor: paletteIsLight ? "#aaa6a0" : "#3a3a35",
        dropShadowColor: paletteIsLight ? "rgba(176,122,26,0.35)" : "rgba(207,255,61,0.35)",
        selectedBorderColor: "#cfff3d",
        nodeDefaultBorderColor: paletteIsLight ? "#95928a" : "#56564f",
      },
    };

    const nvl = new NVL(containerRef.current, nodes, rels, options, {
      onLayoutDone: () => {
        // Defer fit call to next tick to ensure nvlRef.current is assigned
        setTimeout(() => {
          if (nvlRef.current) nvlRef.current.fit([]);
        }, 0);
      },
    });
    nvlRef.current = nvl;

    const onClick = (evt) => {
      const { nvlTargets } = nvl.getHits(evt);
      const hit = nvlTargets?.nodes?.[0];
      const id = hit?.data?.id ?? hit?.id;
      if (id && strategy.agents.find((a) => a.id === id)) onAgentClick(id);
    };
    containerRef.current.addEventListener("click", onClick);
    clickHandlerRef.current = onClick;

    return () => {
      if (pulseRef.current) clearInterval(pulseRef.current);
      if (clickHandlerRef.current && containerRef.current) {
        containerRef.current.removeEventListener("click", clickHandlerRef.current);
      }
      nvl.destroy();
      nvlRef.current = null;
    };
  }, [strategy, paletteIsLight, nvlReady]);

  // Apply execution state → NVL node styles whenever execMap changes
  useEAg(() => {
    const nvl = nvlRef.current;
    if (!nvl) return;

    const orchState = computeOrchestratorState(execMap);
    const updates = [{ id: "orchestrator", ...nvlStyleFor(orchState, palette), color: orchState === "idle" ? GROUP_BASE.orchestrator : nvlStyleFor(orchState, palette).color }];

    strategy.agents.forEach((a) => {
      const ex = execMap[a.id] || { status: "idle", steps: {} };
      updates.push({ id: a.id, ...nvlStyleFor(ex.status, palette) });
      STEP_IDS.forEach((sid) => {
        updates.push({ id: `${a.id}-${sid}`, ...nvlStyleFor(ex.steps?.[sid] || "idle", palette) });
      });
      const vaultState =
        ex.steps?.deposit === "confirmed" ? "confirmed" :
        ex.steps?.deposit === "running" ? "running" :
        ex.steps?.deposit === "failed" ? "failed" : "idle";
      const vaultColor = vaultState === "idle" ? GROUP_BASE.vault : palette[vaultState];
      updates.push({ id: `${a.id}-vault`, color: vaultColor, activated: vaultState === "running" });
    });

    nvl.updateElementsInGraph(updates, []);

    // Pulse running nodes: size oscillation
    if (pulseRef.current) clearInterval(pulseRef.current);
    let big = false;
    pulseRef.current = setInterval(() => {
      const n = nvlRef.current;
      if (!n) return;
      big = !big;
      const pulses = [];
      const orch = computeOrchestratorState(execMap);
      if (orch === "running") pulses.push({ id: "orchestrator", size: big ? 38 : 34 });
      strategy.agents.forEach((a) => {
        const ex = execMap[a.id] || { status: "idle", steps: {} };
        if (ex.status === "running") pulses.push({ id: a.id, size: big ? 29 : 26 });
        STEP_IDS.forEach((sid) => {
          if (ex.steps?.[sid] === "running") pulses.push({ id: `${a.id}-${sid}`, size: big ? 21 : 18 });
        });
        if (ex.steps?.deposit === "running") pulses.push({ id: `${a.id}-vault`, size: big ? 25 : 22 });
      });
      if (pulses.length) n.updateElementsInGraph(pulses, []);
    }, 550);

    return () => {
      if (pulseRef.current) clearInterval(pulseRef.current);
    };
  }, [execMap, strategy, paletteIsLight]);

  return <div ref={containerRef} className="agent-graph" />;
};

/* ============================================
   Agent execution legend + summary tiles
   ============================================ */
const AgentTiles = ({ strategy, execMap, onOpenMemory }) => {
  return (
    <div className="agent-tiles">
      {strategy.agents.map((a) => {
        const ex = execMap[a.id] || { status: "idle", steps: {}, memory: [] };
        const doneSteps = STEP_IDS.filter((sid) => ex.steps?.[sid] === "confirmed").length;
        return (
          <button
            key={a.id}
            type="button"
            className={`agent-tile ${ex.status}`}
            onClick={() => onOpenMemory(a.id)}
          >
            <div className="agent-tile-head">
              <span className="idx">{a.idx}</span>
              <span className="name">{a.name}</span>
              <span className={`dot ${ex.status}`} />
            </div>
            <div className="agent-tile-meta mono">
              {a.allocation} USDC · {a.vault.protocol} · {a.vault.apy}%
            </div>
            <div className="agent-tile-steps">
              {STEP_IDS.map((sid) => (
                <span key={sid} className={`agent-step-pip ${ex.steps?.[sid] || "idle"}`} title={STEP_LABELS[sid]}>
                  {STEP_LABELS[sid].slice(0, 1).toLowerCase()}
                </span>
              ))}
              <span className="agent-tile-progress mono">{doneSteps}/{STEP_IDS.length}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
};

/* ============================================
   Memory Modal — per-agent execution history
   ============================================ */
const MemoryModal = ({ agentId, strategy, execMap, onClose }) => {
  const agent = strategy.agents.find((a) => a.id === agentId);
  if (!agent) return null;
  const ex = execMap[agentId] || { memory: [], metrics: {}, status: "idle" };
  const stateLabel = {
    idle: "queued · no runs yet",
    running: "running · live execution",
    confirmed: "completed · all steps confirmed",
    failed: "halted · last run failed",
  }[ex.status];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="memory-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="memory-modal-head">
          <div>
            <div className="modal-eyebrow">agent.memory · {agent.id}</div>
            <h3 className="modal-title">{agent.name}</h3>
            <div className="mono memory-modal-sub">{stateLabel}</div>
          </div>
          <button className="icon-btn" aria-label="close" onClick={onClose}><Icon name="x" /></button>
        </div>

        <div className="memory-metrics">
          <div className="memory-metric">
            <span className="label mono">runs</span>
            <span className="val tnum mono">{ex.metrics?.totalRuns ?? 0}</span>
          </div>
          <div className="memory-metric">
            <span className="label mono">success rate</span>
            <span className="val tnum mono">{ex.metrics?.successRate == null ? "—" : `${ex.metrics.successRate}%`}</span>
          </div>
          <div className="memory-metric">
            <span className="label mono">gas paid · user</span>
            <span className="val tnum mono">0 ETH</span>
          </div>
          <div className="memory-metric">
            <span className="label mono">vault apy</span>
            <span className="val tnum mono">{agent.vault.apy}%</span>
          </div>
        </div>

        <div className="memory-section-title mono">execution log</div>
        <div className="memory-log">
          {ex.memory.length === 0 ? (
            <div className="empty">no events yet — agent queued</div>
          ) : (
            ex.memory.map((m, i) => (
              <div key={i} className={`memory-row ${m.status}`}>
                <span className="memory-row-marker" />
                <div className="memory-row-body">
                  <div className="memory-row-title">
                    {m.title}
                    <span className="memory-row-tag mono">{m.status}</span>
                  </div>
                  <div className="memory-row-meta mono">
                    {m.meta}
                    {m.hash && (
                      <>
                        <span className="dot-sep">·</span>
                        <span className="memory-row-hash">tx {shortAddr(m.hash)}</span>
                      </>
                    )}
                  </div>
                  {m.lesson && (
                    <div className="memory-row-lesson mono">
                      <span className="memory-row-lesson-key">lesson</span> {m.lesson}
                    </div>
                  )}
                </div>
                <span className="memory-row-time mono tnum">{m.t}</span>
              </div>
            ))
          )}
        </div>

        <div className="memory-modal-foot">
          <div className="foot-note">
            Memory di-store onchain via worker logs · auditable per skill version.
          </div>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

/* ============================================
   Strategy card (step 02 result) — multi-agent
   ============================================ */
const StrategyCard = ({ strategy, onProceed, onRegenerate }) => {
  return (
    <section className="rec-card enter">
      <div className="eyebrow">
        <span className="num">01</span>
        <span>Strategy · {strategy.agents.length} worker{strategy.agents.length === 1 ? "" : "s"} · {strategy.risk} risk</span>
        <span className="rule" />
        <span>{strategy.agents.reduce((n) => n + 1, 0) * 3} on-chain steps</span>
      </div>

      <div className="rec-hgroup">
        <div>
          <div className="rec-vault-name">
            Vibing Farmer · multi-agent
            <div className="strategy-sub mono">
              orchestrator · {strategy.agents.length} parallel workers · single signature
            </div>
          </div>
          <div className="rec-vault-addr">total deposit · {strategy.total} USDC · split across {strategy.agents.length} vault{strategy.agents.length === 1 ? "" : "s"}</div>
        </div>
        <div className="rec-hgroup-apy">
          <span className="figure figure-md tnum">{strategy.blendedApy}<span className="unit">% blended APY</span></span>
          <span className="label">weighted by allocation</span>
        </div>
      </div>

      <div className="strategy-agents">
        {strategy.agents.map((a) => (
          <div key={a.id} className="strategy-agent-row">
            <div className="strategy-agent-id">
              <span className="idx mono">{a.idx}</span>
              <div>
                <div className="strategy-agent-name">{a.name}</div>
                <div className="mono strategy-agent-meta">
                  {a.vault.name} · {a.vault.protocol}
                </div>
              </div>
            </div>
            <div className="strategy-agent-cells">
              <div className="strategy-cell">
                <span className="k mono">allocation</span>
                <span className="v mono tnum">{a.allocation} USDC</span>
              </div>
              <div className="strategy-cell">
                <span className="k mono">apy</span>
                <span className="v mono tnum">{a.vault.apy}%</span>
              </div>
              <div className="strategy-cell">
                <span className="k mono">drawdown 30d</span>
                <span className="v mono tnum">{a.vault.drawdown}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="action-row">
        <div className="foot-note">
          Reasoning di-generate oleh <b>Venice AI</b>, privacy-first. Allocation di-tuning sesuai risk profile.
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={onRegenerate}>Lihat alternatif</button>
          <button className="btn btn-primary" onClick={onProceed}>
            Lanjut · connect wallet <Icon name="arrow" size={14} />
          </button>
        </div>
      </div>
    </section>
  );
};

/* ============================================
   ExecuteCard — uses AgentGraph + AgentTiles + Memory
   ============================================ */
const ExecuteCard = ({ strategy, execMap, paletteIsLight, onOpenMemory, onDone }) => {
  const totalSteps = strategy.agents.length * STEP_IDS.length;
  const doneSteps = strategy.agents.reduce((acc, a) => {
    const ex = execMap[a.id] || { steps: {} };
    return acc + STEP_IDS.filter((sid) => ex.steps?.[sid] === "confirmed").length;
  }, 0);
  const pct = totalSteps ? (doneSteps / totalSteps) * 100 : 0;
  const allDone = doneSteps === totalSteps;

  useEAg(() => {
    if (allDone) {
      const t = setTimeout(onDone, 900);
      return () => clearTimeout(t);
    }
  }, [allDone]);

  return (
    <section className="card enter exec-card-wrap">
      <div className="eyebrow">
        <span className="num">05</span>
        <span>Agents executing · 1Shot relayer · parallel</span>
        <span className="rule" />
        <span>gas paid by relayer</span>
      </div>

      <div className="exec-header">
        <div>
          <h1 className="h-display" style={{ fontSize: 30, marginTop: 6 }}>
            {strategy.agents.length} agent berjalan paralel — orchestrator yang nyetir.
          </h1>
          <p className="lede" style={{ marginTop: 10, maxWidth: 540 }}>
            Tiap worker ngerjain skill yang udah kamu approve: <span className="mono">swap → approve → deposit</span>.
            Klik node agent di graph atau tile di bawah buat buka memory panel-nya.
          </p>
        </div>
        <div className="exec-progress">
          <span className="label">progress</span>
          <span className={`value ${allDone ? "done" : ""}`}>
            {doneSteps}/{totalSteps}
          </span>
          <div className="exec-progress-bar">
            <div className="exec-progress-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <AgentGraph
        strategy={strategy}
        execMap={execMap}
        onAgentClick={onOpenMemory}
        paletteIsLight={paletteIsLight}
      />

      <div className="agent-legend mono">
        <span className="legend-item"><span className="dot idle" /> idle</span>
        <span className="legend-item"><span className="dot running" /> running</span>
        <span className="legend-item"><span className="dot confirmed" /> confirmed</span>
        <span className="legend-item"><span className="dot failed" /> failed</span>
        <span className="legend-spacer" />
        <span className="legend-hint">click any agent node → open memory</span>
      </div>

      <AgentTiles strategy={strategy} execMap={execMap} onOpenMemory={onOpenMemory} />
    </section>
  );
};

Object.assign(window, {
  AgentGraph, AgentTiles, MemoryModal, StrategyCard, ExecuteCard,
  buildStrategy, makeInitialExecState, AGENT_PROTOCOLS, STEP_IDS, STEP_LABELS,
});
