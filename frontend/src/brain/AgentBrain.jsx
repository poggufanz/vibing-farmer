// frontend/src/brain/AgentBrain.jsx
// Container that assembles the 13-stage pipeline dashboard. Ported from
// design/agentdashboard/src/app/components/agent-brain.tsx:2312-2679 (3-column
// shell: Sidebar | Topbar+StepRail+StatusBar+stage cards+RunControl | RightRail).
// Owns pipeline state via reducePipeline, subscribes to the loop's onEvent and
// the memory bus, and reveals stages one at a time — only the `open` stage
// shows its expanded body, every prior stage collapses ("ganti gantian").
import { useState, useEffect, useRef, useCallback } from 'react'
import { T } from './tokens.js'
import { initialPipeline, reducePipeline, STAGE_IDS } from './pipelineAdapter.js'
import { buildCouncilEvent } from './councilEvents.js'
import { IQ_DELTAS } from './memoryBus.js'
import { Sidebar } from './shell/Sidebar.jsx'
import { Topbar } from './shell/Topbar.jsx'
import { StepRail } from './shell/StepRail.jsx'
import { StatusBar } from './shell/StatusBar.jsx'
import { RightRail } from './RightRail.jsx'
import { RunControl, ConfirmModal, STATUS_MSGS } from './RunControl.jsx'
import { StateStage } from './stages/StateStage.jsx'
import { LoopStage } from './stages/LoopStage.jsx'
import { FetchStage } from './stages/FetchStage.jsx'
import { GatesStage } from './stages/GatesStage.jsx'
import { SimStage } from './stages/SimStage.jsx'
import { CouncilStage } from './stages/CouncilStage.jsx'
import { VerdictStage } from './stages/VerdictStage.jsx'
import { MemoryStage } from './stages/MemoryStage.jsx'
import { ExecutionStage } from './stages/ExecutionStage.jsx'
import { EvalStage } from './stages/EvalStage.jsx'
import { ReflectorStage } from './stages/ReflectorStage.jsx'
import { CuratorStage } from './stages/CuratorStage.jsx'
import { BulletStage } from './stages/BulletStage.jsx'

const STAGE_META = [
  { id: 'state', num: '01', label: 'state · action · reward' },
  { id: 'loop', num: '02', label: 'autonomous monitor loop' },
  { id: 'fetch', num: '03', label: 'parallel data fetch' },
  { id: 'gates', num: '04', label: 'fast-fail gates' },
  { id: 'sim', num: '05', label: 'simulation engine' },
  { id: 'council', num: '06', label: 'ai council' },
  { id: 'verdict', num: '07', label: 'consensus gate' },
  { id: 'memory', num: '08', label: 'playbook storage' },
  { id: 'execution', num: '09', label: 'execution layer' },
  { id: 'eval', num: '10', label: 'outcome tracker' },
  { id: 'reflector', num: '11', label: 'reflector' },
  { id: 'curator', num: '12', label: 'curator' },
  { id: 'bullet', num: '13', label: 'bulletpoint analyzer' },
]

const STAGE_COMPONENTS = {
  state: StateStage,
  loop: LoopStage,
  fetch: FetchStage,
  gates: GatesStage,
  sim: SimStage,
  council: CouncilStage,
  verdict: VerdictStage,
  memory: MemoryStage,
  execution: ExecutionStage,
  eval: EvalStage,
  reflector: ReflectorStage,
  curator: CuratorStage,
  bullet: BulletStage,
}

const DECISION_TOAST_MS = 2200
const STATUS_CYCLE_MS = 3200

const STATUS_FALLBACK = { idle: '── queued', running: '── running', done: '── done', fail: '── failed' }

const META_SUMMARY = {
  state: (d) => d?.portfolioApy != null && `${d.portfolioApy}% apy`,
  loop: (d) => d?.n != null && `cycle #${d.n}`,
  fetch: (d) => d?.sources && `${d.sources.length} sources`,
  gates: (d) => (d?.pass === true ? 'all clear' : d?.pass === false && `blocked · ${d.reason}`),
  council: (d) => d?.verdicts?.length && `${d.verdicts.length} specialists`,
  verdict: (d) => d?.consensus?.finalDecision && d.consensus.finalDecision.toLowerCase(),
  memory: (d) => d?.rules?.length != null && `${d.rules.length} rules`,
  execution: (d) => d?.outcome,
  eval: (d) => d?.evaluated && `${d.netResultUSD >= 0 ? '+' : '−'}${Math.abs(d.netResultUSD).toFixed(2)}`,
  reflector: (d) => d?.tagged != null && `${d.tagged} tagged`,
  curator: (d) => d?.added != null && `+${d.added} added`,
  bullet: (d) => d?.merged != null && `${d.merged} merged`,
}

function buildMeta(id, stage) {
  const summary = META_SUMMARY[id]?.(stage?.data)
  if (summary) return `── ${summary}`
  return STATUS_FALLBACK[stage?.state] ?? STATUS_FALLBACK.idle
}

export function AgentBrain({ createAgent, memoryBus, autoStart = false }) {
  const [pipeline, setPipeline] = useState(initialPipeline)
  const [open, setOpen] = useState(null)
  const [iq, setIq] = useState(1247)
  const [councilFeed, setCouncilFeed] = useState([])
  const [decisionToast, setDecisionToast] = useState(null)
  const [statusIdx, setStatusIdx] = useState(0)
  const [confirmOpen, setConfirmOpen] = useState(false)
  // Loop active flag — drives the Start/Stop control. Set true on start(), cleared
  // on stop() and on the loop's `stopped` event. NOT derived from cycleId (which
  // lingers between cycles, leaving the control wedged on "Stop" forever).
  const [running, setRunning] = useState(autoStart)
  const [specialists, setSpecialists] = useState({ riskAuditor: true, gasChecker: true, strategyGuard: true })
  const agentRef = useRef(null)

  const onEvent = useCallback((ev) => {
    setPipeline((prev) => reducePipeline(prev, ev))
    if (ev.type === 'cycle:start') setOpen('state')
    if (ev.type === 'state') setOpen('gates')
    if (ev.type === 'gate' && ev.pass) setOpen('sim')
    if (ev.type === 'sim') setOpen('council')
    if (ev.type === 'council') {
      setOpen('verdict')
      const at = new Date(ev.at ?? 0)
      const cyc = ev.cycleId ?? 0
      const cv = buildCouncilEvent('verdict', cyc, at, { ...ev.consensus, confidence: ev.verdicts?.[0]?.confidence })
      if (cv) setCouncilFeed((f) => [cv, ...f].slice(0, 40))
      if (ev.consensus?.finalDecision === 'EXECUTE') {
        setDecisionToast(cv?.text ?? 'Council has decided · execute')
        setTimeout(() => setDecisionToast(null), DECISION_TOAST_MS)
      }
    }
    if (ev.type === 'execute') setOpen('execution')
    if (ev.type === 'stopped') setRunning(false)
  }, [])

  useEffect(() => {
    agentRef.current = createAgent({ onEvent })
    if (autoStart) agentRef.current.start?.()
    return () => agentRef.current?.stop?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!memoryBus) return
    return memoryBus.subscribe(({ stage, payload }) => {
      setPipeline((prev) => ({
        ...prev,
        stages: prev.stages.map((s) => (s.id === stage ? { ...s, state: 'done', data: { ...s.data, ...payload } } : s)),
      }))
      setIq((q) => q + (IQ_DELTAS[stage] ?? 0))
    })
  }, [memoryBus])

  useEffect(() => {
    const id = setInterval(() => setStatusIdx((i) => (i + 1) % STATUS_MSGS.length), STATUS_CYCLE_MS)
    return () => clearInterval(id)
  }, [])

  const revealed = STAGE_META.slice(0, Math.max(pipeline.revealedCount, autoStart ? 1 : 0))
  const cycleState = running ? 'running' : 'idle'
  const activeIdx = STAGE_IDS.findIndex((id) => pipeline.stages.find((s) => s.id === id)?.state === 'running')

  const handleStartRequest = () => setConfirmOpen(true)
  const handleToggleSpecialist = (key) => setSpecialists((s) => ({ ...s, [key]: !s[key] }))
  const handleConfirm = () => {
    setConfirmOpen(false)
    setPipeline(initialPipeline())
    setOpen('state')
    setRunning(true)
    agentRef.current?.start?.()
  }
  const handleStop = () => {
    setRunning(false)
    agentRef.current?.stop?.()
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: T.bgBase }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Topbar cycle={pipeline.cyclesDone + 1} />
        <StepRail activeStep="execute" />
        <RunControl
          cycleState={cycleState}
          activeIdx={activeIdx < 0 ? 0 : activeIdx}
          total={STAGE_IDS.length}
          cycleNum={pipeline.cyclesDone + 1}
          onStart={handleStartRequest}
          onStop={handleStop}
        />
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {revealed.map((m) => {
            const Card = STAGE_COMPONENTS[m.id]
            const stage = pipeline.stages.find((s) => s.id === m.id)
            return (
              <Card
                key={m.id}
                stage={stage}
                num={m.num}
                label={m.label}
                meta={buildMeta(m.id, stage)}
                open={open === m.id}
                onToggle={() => setOpen(open === m.id ? null : m.id)}
              />
            )
          })}
        </div>
        <StatusBar msg={STATUS_MSGS[statusIdx]} />
      </div>
      <RightRail iq={iq} councilFeed={councilFeed} decisionToast={decisionToast} />
      <ConfirmModal
        open={confirmOpen}
        cycleNum={pipeline.cyclesDone + 1}
        specialists={specialists}
        onToggleSpecialist={handleToggleSpecialist}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}
