/* ============================================
   VIBING FARMER — Agent Graph + Memory (step 05)
   Hierarchical vis.js Network:
     Orchestrator → Worker Agents → Step nodes (Swap/Approve/Deposit) → Vault nodes
   Node colors driven by state: idle / running / confirmed / failed
   ============================================ */
import React, {
  useEffect as useEAg, useMemo as useMAg, useCallback as useCAg,
  useRef as useRAg, useState as useSAg,
} from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Icon } from './components.jsx';
import { shortAddr } from './screens.jsx';
import { VAULT_CATALOG } from './config.js';

/* ---------- Strategy data — generated per-flow ---------- */
// Derived from VAULT_CATALOG so addresses stay in sync with config automatically.
const ROLES = ["Conservative · lending", "Balanced · liquidity provision", "Aggressive · leveraged yield"];
const AGENT_PROTOCOLS = VAULT_CATALOG.slice(0, 3).map((v, i) => ({
  name: v.name,
  protocol: v.protocol,
  apy: String(v.apy),
  drawdown: v.drawdown,
  addr: v.address,
  role: ROLES[i],
}));

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
   Agent Graph — force-directed network (Obsidian-style)
   Topology: Orchestrator → Workers → Steps (Swap/Approve/Deposit) → Vault
   ============================================ */
const NODE_R = { orchestrator: 9, worker: 6.5, step: 4, vault: 6.5 };

// Stable node/link objects — only rebuilt when the strategy changes,
// so the physics simulation keeps positions across exec-state updates.
const buildGraphData = (strategy) => {
  const nodes = [{ id: "orchestrator", name: "Orchestrator", kind: "orchestrator" }];
  const links = [];
  strategy.agents.forEach((a) => {
    nodes.push({ id: a.id, name: `W${a.idx} · ${a.vault.protocol}`, kind: "worker", agentId: a.id });
    links.push({ source: "orchestrator", target: a.id });
    let prev = a.id;
    STEP_IDS.forEach((sid) => {
      const id = `${a.id}-${sid}`;
      nodes.push({ id, name: STEP_LABELS[sid], kind: "step", agentId: a.id, stepId: sid });
      links.push({ source: prev, target: id });
      prev = id;
    });
    const vId = `${a.id}-vault`;
    nodes.push({ id: vId, name: `Vault · ${a.vault.apy}%`, kind: "vault", agentId: a.id });
    links.push({ source: prev, target: vId });
  });
  return { nodes, links };
};

const stepState = (ex) => {
  const d = ex.steps?.deposit;
  return d === "confirmed" ? "confirmed" : d === "running" ? "running" : d === "failed" ? "failed" : "idle";
};

const nodeColor = (node, execMap, palette) => {
  if (node.kind === "orchestrator") {
    const s = computeOrchestratorState(execMap);
    return s === "idle" ? GROUP_BASE.orchestrator : (palette[s] || palette.idle);
  }
  const ex = execMap[node.agentId] || { status: "idle", steps: {} };
  if (node.kind === "worker") return palette[ex.status] || palette.idle;
  if (node.kind === "step") return palette[ex.steps?.[node.stepId] || "idle"] || palette.idle;
  const s = stepState(ex);
  return s === "idle" ? GROUP_BASE.vault : (palette[s] || palette.idle);
};

const nodeRunning = (node, execMap) => {
  if (node.kind === "orchestrator") return computeOrchestratorState(execMap) === "running";
  const ex = execMap[node.agentId] || { status: "idle", steps: {} };
  if (node.kind === "worker") return ex.status === "running";
  if (node.kind === "step") return ex.steps?.[node.stepId] === "running";
  return stepState(ex) === "running";
};

const AgentGraph = ({ strategy, execMap, onAgentClick, paletteIsLight }) => {
  const fgRef = useRAg(null);
  const wrapRef = useRAg(null);
  const execRef = useRAg(execMap);
  const fittedRef = useRAg(false);
  const [size, setSize] = useSAg({ w: 0, h: 0 });
  execRef.current = execMap;
  const palette = paletteIsLight ? GRAPH_COLOR_LIGHT : GRAPH_COLOR;
  const data = useMAg(() => buildGraphData(strategy), [strategy]);

  // Measure container so the canvas fills it
  useEAg(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Spread the layout a bit wider than the default
  useEAg(() => {
    const fg = fgRef.current;
    if (!fg || !size.w) return;
    fg.d3Force("charge")?.strength(-90);
    fg.d3Force("link")?.distance(30);
  }, [data, size.w]);

  // Repaint when execution state changes (also gives an Obsidian-like nudge)
  useEAg(() => { fgRef.current?.d3ReheatSimulation(); }, [execMap]);

  const drawNode = useCAg((node, ctx) => {
    const color = nodeColor(node, execRef.current, palette);
    const r = NODE_R[node.kind] || 5;
    if (nodeRunning(node, execRef.current)) { ctx.shadowColor = color; ctx.shadowBlur = 16; }
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = paletteIsLight ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.18)";
    ctx.stroke();
    ctx.font = "600 4px Geist, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = paletteIsLight ? "#4a4840" : "#cfcdc4";
    ctx.fillText(node.name, node.x, node.y + r + 1.5);
  }, [palette, paletteIsLight]);

  return (
    <div className="agent-graph" ref={wrapRef}>
      {size.w > 0 && (
        <ForceGraph2D
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={data}
          backgroundColor="rgba(0,0,0,0)"
          nodeCanvasObject={drawNode}
          nodePointerAreaPaint={(node, color, ctx) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, (NODE_R[node.kind] || 5) + 2, 0, 2 * Math.PI);
            ctx.fill();
          }}
          linkColor={() => (paletteIsLight ? "#c4c1b8" : "#3a3a32")}
          linkWidth={1}
          cooldownTicks={120}
          onEngineStop={() => {
            if (!fittedRef.current && fgRef.current) {
              fgRef.current.zoomToFit(400, 24);
              fittedRef.current = true;
            }
          }}
          onNodeClick={(node) => { if (node.kind === "worker") onAgentClick?.(node.id); }}
        />
      )}
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
            <span className="val tnum mono">{ex.metrics?.successRate == null ? "-" : `${ex.metrics.successRate}%`}</span>
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
            <div className="empty">no events yet · agent queued</div>
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
            Memory stored onchain via worker logs · auditable per skill version.
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
const StrategyCard = ({ strategy, skillSource, onProceed, onRegenerate, strategyHash, attestation, attesting }) => {
  const customSkill = skillSource === "user-local" || skillSource === "user-file";
  const shortHash = (h) => h ? `${h.slice(0, 10)}...` : "";
  return (
    <section className="rec-card enter">
      <div className="eyebrow">
        <span className="num">01</span>
        <span>Strategy · {strategy.agents.length} worker{strategy.agents.length === 1 ? "" : "s"} · {strategy.risk} risk</span>
        <span className="rule" />
        <span>{strategy.agents.reduce((n) => n + 1, 0) * 3} on-chain steps</span>
        <span className={`skill-badge ${customSkill ? "custom" : "default"}`} title={`advisor skill: ${skillSource || "default"}`}>
          {customSkill ? "Custom Strategy" : "Default Strategy"}
        </span>
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
                  {a.vault.tvl && a.vault.tvl !== "N/A" ? ` · TVL ${a.vault.tvl}` : ""}
                  {a.vault.isLiveData ? " · 🟢 live" : ""}
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

      {(attestation || attesting || strategyHash) && (
        <div className="mono" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 16, padding: "9px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", fontSize: 11, color: "var(--text-muted)" }}>
          {attestation ? (
            <>
              <span style={{ color: "var(--ok)", fontSize: 8 }}>●</span>
              <span>Strategy attested on-chain</span>
              <span style={{ color: "var(--text-faint)" }}>·</span>
              <span>Hash: {attestation.hash}</span>
              <a href={attestation.etherscanUrl} target="_blank" rel="noopener noreferrer" className="accent" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}>
                Verify on Etherscan <Icon name="external" size={11} />
              </a>
              <span style={{ color: "var(--text-faint)", marginLeft: "auto" }}>Powered by ERC-8004 · tamper-proof AI reasoning</span>
            </>
          ) : attesting ? (
            <>
              <span style={{ color: "var(--text-faint)", fontSize: 8 }}>○</span>
              <span>Attesting strategy on-chain…</span>
            </>
          ) : (
            <>
              <span style={{ color: "var(--text-faint)", fontSize: 8 }}>○</span>
              <span>Strategy hash: {shortHash(strategyHash)} (local only)</span>
            </>
          )}
        </div>
      )}

      <div className="action-row">
        <div className="foot-note">
          <span className="ai-attribution">
            ● AI · live data
          </span>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={onRegenerate}>See alternatives</button>
          <button className="btn btn-primary" onClick={onProceed}>
            Proceed · connect wallet <Icon name="arrow" size={14} />
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

  // Auto-advance to "done" only when execution finishes while viewing — NOT when the user
  // navigates back to an already-completed run via the step rail (would bounce to done).
  const wasDoneOnMount = useRAg(allDone);
  useEAg(() => {
    if (allDone && !wasDoneOnMount.current) {
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
            {strategy.agents.length} agents running in parallel · orchestrated seamlessly.
          </h1>
          <p className="lede" style={{ marginTop: 10, maxWidth: 540 }}>
            Each worker executes the skills you approved: <span className="mono">swap → approve → deposit</span>.
            Click an agent node on the graph or a card below to open its memory panel.
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
