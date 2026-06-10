// frontend/src/strategy/playbookRules.js
// ACE-inspired per-role playbook catalog for the /strategy wizard AI Council.
// Each council specialist is shown ONLY its role's rules and must cite from them.
// citedRules flow to reflector.js, which increments these ids in playbook.js —
// rules that consistently precede good deposits gain council weight over time.
// (TradingAgents adaptation §6.6.3: per-role playbook subset prevents cross-role noise.)

export const ROLE_RULES = {
  yield: [
    { id: 'yld-apy-attractive', description: 'Blended APY clears the profile target; the headline yield justifies entry.' },
    { id: 'yld-projection-positive', description: 'Risk-adjusted projected annual yield (USDC) is positive after the risk penalty.' },
    { id: 'yld-tvl-adequate', description: 'Selected vaults have adequate TVL/track record so the quoted APY is credible.' },
  ],
  risk: [
    { id: 'rsk-turbulent-veto', description: 'Market regime is turbulent — defer entry; capital preservation outranks yield.' },
    { id: 'rsk-gates-clear', description: 'No action-space gate violations: allocations respect the risk ceiling and sum to 1.0.' },
    { id: 'rsk-drawdown-bounded', description: '30-day max drawdown of the basket stays within the profile risk tolerance.' },
    { id: 'rsk-regime-calm', description: 'Regime is calm/elevated with no violations — risk posture supports deploying.' },
  ],
  market: [
    { id: 'mkt-gas-affordable', description: 'Entry gas cost is small relative to expected yield; timing is economically sound.' },
    { id: 'mkt-timing-favorable', description: 'Calm regime and clear signals make now a favorable entry window.' },
    { id: 'mkt-signals-clear', description: 'No adverse live market signals (exploits, depegs, governance alarms) flagged.' },
  ],
}

export function rulesForRole(role) {
  return ROLE_RULES[role] || []
}

export function ruleIdsForRole(role) {
  return rulesForRole(role).map((r) => r.id)
}

export function allRuleIds() {
  return Object.values(ROLE_RULES).flat().map((r) => r.id)
}

export function isValidRuleForRole(role, ruleId) {
  return ruleIdsForRole(role).includes(ruleId)
}
