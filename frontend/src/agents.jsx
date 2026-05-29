/* ============================================
   YIELD VIBING — Agent Graph + Memory (step 05)
   Hierarchical vis.js Network:
     Orchestrator → Worker Agents → Step nodes (Swap/Approve/Deposit) → Vault nodes
   Node colors driven by state: idle / running / confirmed / failed
   ============================================ */
import React, { useEffect as useEAg, useRef as useRAg } from 'react';
import { Icon } from './components.jsx';
import { shortAddr } from './screens.jsx';

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
   Agent Graph — state palette + helpers
   ============================================ */
const GRAPH_COLOR = {
  idle:      "#3a3b33",
  running:   "#f0b54a",
  confirmed: "#6fe39a",
  failed:    "#ff7479",
};
const GRAPH_COLOR_LIGHT = {
  idle:      "#b8b5aa",
  running:   "#b07a1a",
  confirmed: "#2d7a4a",
  failed:    "#a83a3a",
};
const GROUP_BASE = { orchestrator: "#cfff3d", vault: "#6366f1" };

const computeOrchestratorState = (execMap) => {
  const vals = Object.values(execMap);
  if (vals.some((a) => a.status === "failed")) return "failed";
  if (vals.every((a) => a.status === "confirmed")) return "confirmed";
  if (vals.some((a) => a.status === "running")) return "running";
  return "idle";
};

/* ============================================
   Premium Canvas Graph Renderer (no NVL dependency)
   Hierarchical layout: Orchestrator → Workers → Steps → Vaults
   ============================================ */

const drawEdge = (ctx, x1, y1, x2, y2, color, lineWidth) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  const midY = (y1 + y2) / 2;
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(x1, midY, x2, midY, x2, y2);
  ctx.stroke();
};

const drawNode = (ctx, x, y, r, fillColor, label, labelColor, glowing, borderColor) => {
  // Glow for running nodes
  if (glowing) {
    ctx.save();
    ctx.shadowColor = fillColor;
    ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.fillStyle = fillColor; ctx.globalAlpha = 0.25; ctx.fill();
    ctx.restore();
  }
  // Border ring
  if (borderColor) {
    ctx.beginPath(); ctx.arc(x, y, r + 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = borderColor; ctx.lineWidth = 1.5; ctx.stroke();
  }
  // Main fill
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fillColor; ctx.fill();
  // Label
  if (label) {
    ctx.fillStyle = labelColor || "#fff";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, x, y);
  }
};

const renderGraph = (canvas, strategy, execMap, palette, paletteIsLight, tick) => {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.width / dpr;
  const H = canvas.height / dpr;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const agents = strategy.agents;
  const nAgents = agents.length;
  const orchX = W / 2, orchY = 40;
  const colW = W / (nAgents + 1);
  const workerY = 100;
  const stepStartY = 155;
  const stepGap = 52;
  const vaultY = stepStartY + STEP_IDS.length * stepGap;

  const edgeColor = paletteIsLight ? "#c0bdb5" : "#3a3a35";
  const borderColor = paletteIsLight ? "#95928a" : "#56564f";
  const orchState = computeOrchestratorState(execMap);
  const orchColor = orchState === "idle" ? GROUP_BASE.orchestrator : palette[orchState];

  // ---------- Edges first (below nodes) ----------
  agents.forEach((a, i) => {
    const cx = colW * (i + 1);
    // Orchestrator → Worker
    drawEdge(ctx, orchX, orchY + 18, cx, workerY - 14, edgeColor, 1.5);

    // Worker → first step
    drawEdge(ctx, cx, workerY + 14, cx, stepStartY - 11, edgeColor, 1);

    // Step → Step
    STEP_IDS.forEach((sid, si) => {
      if (si > 0) {
        const prevY = stepStartY + (si - 1) * stepGap + 10;
        const curY = stepStartY + si * stepGap - 10;
        drawEdge(ctx, cx, prevY, cx, curY, edgeColor, 1);
      }
    });

    // Last step → Vault
    const lastStepY = stepStartY + (STEP_IDS.length - 1) * stepGap + 10;
    drawEdge(ctx, cx, lastStepY, cx, vaultY - 13, edgeColor, 1);
  });

  // ---------- Orchestrator node ----------
  ctx.font = "bold 10px 'Geist', sans-serif";
  drawNode(ctx, orchX, orchY, 18, orchColor, "ORCH", "#1a1b16", orchState === "running", borderColor);

  // ---------- Agent columns ----------
  agents.forEach((a, i) => {
    const ex = execMap[a.id] || { status: "idle", steps: {} };
    const cx = colW * (i + 1);

    // Worker node
    const wColor = palette[ex.status] || palette.idle;
    const isRunning = ex.status === "running";
    const wRadius = isRunning ? (tick % 2 === 0 ? 15 : 13) : 14;
    ctx.font = "bold 9px 'Geist', sans-serif";
    drawNode(ctx, cx, workerY, wRadius, wColor, `W${i + 1}`, "#fff", isRunning, borderColor);

    // Worker label below
    ctx.fillStyle = paletteIsLight ? "#4a4840" : "#8a8880";
    ctx.font = "500 8px 'Geist', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(a.name.replace("Worker ", "W").replace(" · ", "·"), cx, workerY + 24);

    // Step nodes
    STEP_IDS.forEach((sid, si) => {
      const sy = stepStartY + si * stepGap;
      const stepState = ex.steps?.[sid] || "idle";
      const sColor = palette[stepState] || palette.idle;
      const sRunning = stepState === "running";
      const sRadius = sRunning ? (tick % 2 === 0 ? 12 : 10) : 10;
      ctx.font = "bold 8px 'Geist', sans-serif";
      drawNode(ctx, cx, sy, sRadius, sColor, STEP_LABELS[sid]?.[0] || sid[0].toUpperCase(), "#fff", sRunning, null);
      // Step label
      ctx.fillStyle = paletteIsLight ? "#6a6860" : "#6a6860";
      ctx.font = "400 7px 'Geist', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(STEP_LABELS[sid], cx, sy + 17);
    });

    // Vault node
    const vaultState =
      ex.steps?.deposit === "confirmed" ? "confirmed" :
      ex.steps?.deposit === "running" ? "running" :
      ex.steps?.deposit === "failed" ? "failed" : "idle";
    const vColor = vaultState === "idle" ? GROUP_BASE.vault : palette[vaultState];
    const vRunning = vaultState === "running";
    const vRadius = vRunning ? (tick % 2 === 0 ? 14 : 12) : 13;
    ctx.font = "bold 7px 'Geist', sans-serif";
    drawNode(ctx, cx, vaultY, vRadius, vColor, "VAULT", "#fff", vRunning, borderColor);

    // Vault label
    ctx.fillStyle = paletteIsLight ? "#6a6860" : "#6a6860";
    ctx.font = "400 7px 'Geist', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(a.vault.protocol, cx, vaultY + 22);
  });

  ctx.restore();
};

const AgentGraph = ({ strategy, execMap, onAgentClick, paletteIsLight }) => {
  const containerRef = useRAg(null);
  const canvasRef = useRAg(null);
  const tickRef = useRAg(0);
  const animRef = useRAg(null);

  const palette = paletteIsLight ? GRAPH_COLOR_LIGHT : GRAPH_COLOR;

  // Resize canvas to match container
  useEAg(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
      renderGraph(canvas, strategy, execMap, palette, paletteIsLight, tickRef.current);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [strategy, paletteIsLight]);

  // Render on every execMap change + pulse animation
  useEAg(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Immediate render
    renderGraph(canvas, strategy, execMap, palette, paletteIsLight, tickRef.current);

    // Pulse animation (toggle size on running nodes)
    const hasRunning = Object.values(execMap).some(
      (ex) => ex.status === "running" || Object.values(ex.steps || {}).some((s) => s === "running")
    );
    if (animRef.current) clearInterval(animRef.current);
    if (hasRunning) {
      animRef.current = setInterval(() => {
        tickRef.current += 1;
        renderGraph(canvas, strategy, execMap, palette, paletteIsLight, tickRef.current);
      }, 550);
    }
    return () => { if (animRef.current) clearInterval(animRef.current); };
  }, [execMap, strategy, paletteIsLight]);

  // Click detection
  const handleClick = (evt) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    const agents = strategy.agents;
    const colW = rect.width / (agents.length + 1);
    agents.forEach((a, i) => {
      const cx = colW * (i + 1);
      // Click anywhere in the agent column = open memory
      if (Math.abs(x - cx) < 30 && y > 70) onAgentClick(a.id);
    });
  };

  return (
    <div ref={containerRef} className="agent-graph">
      <canvas ref={canvasRef} onClick={handleClick} style={{ width: "100%", height: "100%", cursor: "pointer" }} />
    </div>
  );
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

export {
  AgentGraph, AgentTiles, MemoryModal, StrategyCard, ExecuteCard,
  buildStrategy, makeInitialExecState, AGENT_PROTOCOLS, STEP_IDS, STEP_LABELS,
};
