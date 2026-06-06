// Maps the user's chosen autonomy level to concrete scope the strategy config + grant
// honor. "full" is the brief's "full access and full control" — it drops the whitelist,
// removes the per-move approval ceiling, and zeroes cooldown so the agent acts freely.

export const AUTONOMY_LEVELS = [
  { id: 'conservative', label: 'Conservative', desc: 'Agent proposes; you approve high-risk moves. Tight cooldown, whitelist only.' },
  { id: 'balanced', label: 'Balanced', desc: 'Agent runs within your limits. Default.' },
  { id: 'full', label: 'Full Control', desc: 'Agent has broad access — any protocol, no approval ceiling, no cooldown. Higher risk.' },
]

const SCOPES = {
  conservative: { minCooldownHours: 12, whitelistOnly: true, requireApprovalAboveUsd: 0 },
  balanced: { minCooldownHours: 6, whitelistOnly: true, requireApprovalAboveUsd: 100 },
  full: { minCooldownHours: 0, whitelistOnly: false, requireApprovalAboveUsd: null },
}

/**
 * @param {string} [level]
 * @returns {{level:string, minCooldownHours:number, whitelistOnly:boolean, requireApprovalAboveUsd:number|null}}
 */
export function resolveAutonomyScope(level) {
  const id = SCOPES[level] ? level : 'balanced'
  return { level: id, ...SCOPES[id] }
}
