/* ============================================
   VIBING FARMER — Skill Review (step 03)
   Auto-generated skill cards per worker agent.
   User can review, edit JSON, or approve each skill.
   ============================================ */

const { useState: useSk, useMemo: useMemoSk } = React;

/* ---------- Skill template generator ---------- */
const buildSkillForAgent = (agent, riskProfile) => {
  const max = `${agent.allocation} USDC`;
  return {
    name: agent.skillName,
    version: "1.2.0",
    agent: agent.id,
    description: `${agent.role} · single-vault deposit via ERC-7715 scoped permission`,
    target: {
      vault: agent.vault.addr,
      protocol: agent.vault.protocol,
      chain: "sepolia",
    },
    steps: [
      {
        id: "swap",
        action: "uniswap_v3_swap",
        params: { tokenIn: "USDC", tokenOut: "USDC", maxSlippageBps: 5 },
      },
      {
        id: "approve",
        action: "erc20_approve",
        params: { spender: agent.vault.addr, amount: "exact" },
      },
      {
        id: "deposit",
        action: "erc4626_deposit",
        params: { asset: "USDC", shares: "auto" },
      },
    ],
    guards: {
      maxAmount: max,
      maxGas: "200000",
      expiresIn: "86400s",
      revocable: true,
      riskProfile: riskProfile,
    },
  };
};

/* ---------- Read-only JSON renderer (syntax-tinted) ---------- */
const JsonView = ({ value }) => {
  const text = JSON.stringify(value, null, 2);
  return (
    <pre className="skill-json-view">{text}</pre>
  );
};

/* ---------- Editable JSON textarea ---------- */
const JsonEdit = ({ value, onChange, error }) => (
  <div className={`skill-json-edit ${error ? "has-error" : ""}`}>
    <textarea
      spellCheck={false}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Skill JSON editor"
    />
    {error && <div className="skill-json-err">{error}</div>}
  </div>
);

/* ---------- Single skill card ---------- */
const SkillCard = ({ agent, skill, state, onApprove, onEdit, onSave, onReset, editingText }) => {
  const stateLabel = {
    pending: "needs review",
    editing: "editing",
    approved: "approved",
  }[state] || state;

  return (
    <div className={`skill-card ${state}`}>
      <div className="skill-card-head">
        <div className="skill-card-id">
          <span className="skill-card-idx">{agent.idx}</span>
          <div>
            <div className="skill-card-name">{agent.name}</div>
            <div className="skill-card-meta">
              {skill.name} · v{skill.version} · {agent.vault.protocol}
            </div>
          </div>
        </div>
        <span className={`skill-card-status ${state}`}>{stateLabel}</span>
      </div>

      <div className="skill-card-body">
        {state === "editing" ? (
          <JsonEdit
            value={editingText.text}
            onChange={(t) => onEdit(agent.id, t)}
            error={editingText.error}
          />
        ) : (
          <JsonView value={skill} />
        )}
      </div>

      <div className="skill-card-foot">
        <div className="skill-card-foot-meta mono">
          {skill.steps.length} steps · max <b>{skill.guards.maxAmount}</b> · gas&nbsp;cap&nbsp;{skill.guards.maxGas}
        </div>
        <div className="skill-card-actions">
          {state === "approved" ? (
            <button className="btn btn-text" onClick={() => onReset(agent.id)}>
              re-open
            </button>
          ) : state === "editing" ? (
            <>
              <button className="btn btn-text" onClick={() => onReset(agent.id)}>
                cancel
              </button>
              <button
                className="btn btn-ghost"
                disabled={!!editingText.error}
                onClick={() => onSave(agent.id)}
              >
                save edits
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-text" onClick={() => onEdit(agent.id, JSON.stringify(skill, null, 2), /*start*/ true)}>
                <Icon name="edit" size={12} /> edit JSON
              </button>
              <button className="btn btn-ghost" onClick={() => onApprove(agent.id)}>
                <Icon name="check" size={12} /> approve
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/* ---------- Skill review screen ---------- */
const SkillReviewCard = ({ agents, riskProfile, skillStates, onApprove, onEdit, onSave, onReset, onApproveAll, onContinue, editingTexts }) => {
  const skills = useMemoSk(() => {
    const map = {};
    agents.forEach((a) => { map[a.id] = buildSkillForAgent(a, riskProfile); });
    return map;
  }, [agents, riskProfile]);

  // Allow caller-overridden skills (after edits)
  const effectiveSkills = useMemoSk(() => {
    const map = { ...skills };
    Object.entries(skillStates).forEach(([id, s]) => {
      if (s.skill) map[id] = s.skill;
    });
    return map;
  }, [skills, skillStates]);

  const approvedCount = agents.filter((a) => skillStates[a.id]?.state === "approved").length;
  const allApproved = approvedCount === agents.length;

  return (
    <section className="card enter">
      <div className="eyebrow">
        <span className="num">03</span>
        <span>Review skills · {agents.length} agent{agents.length === 1 ? "" : "s"}</span>
        <span className="rule" />
        <span>{approvedCount}/{agents.length} approved</span>
      </div>

      <h1 className="h-display">
        Cek skill yang bakal dijalanin tiap agent — sebelum kamu kasih permission.
      </h1>
      <p className="lede">
        Orchestrator nge-generate skill JSON buat tiap worker — itu kontrak action-level yang dia run pas eksekusi.
        Kamu bisa baca tiap step, ubah guard-nya, atau approve apa adanya. Skill yang udah approved bakal dipakai
        verbatim di runtime; gak ada hidden logic.
      </p>

      <div className="skill-stack">
        {agents.map((a) => (
          <SkillCard
            key={a.id}
            agent={a}
            skill={effectiveSkills[a.id]}
            state={skillStates[a.id]?.state || "pending"}
            editingText={editingTexts[a.id] || { text: "", error: null }}
            onApprove={onApprove}
            onEdit={onEdit}
            onSave={onSave}
            onReset={onReset}
          />
        ))}
      </div>

      <div className="action-row">
        <div className="foot-note">
          Skill di-sign sama smart account kamu. Edit JSON dengan hati-hati — schema validation jalan tiap save.
        </div>
        <div className="flex gap-2">
          {!allApproved && (
            <button className="btn btn-ghost" onClick={onApproveAll}>
              Approve all
            </button>
          )}
          <button className="btn btn-primary" disabled={!allApproved} onClick={onContinue}>
            Lanjut · grant permission <Icon name="arrow" size={14} />
          </button>
        </div>
      </div>
    </section>
  );
};

Object.assign(window, {
  SkillReviewCard, SkillCard, JsonView, JsonEdit, buildSkillForAgent,
});
