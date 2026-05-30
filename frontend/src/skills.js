// Skill file generator + localStorage persistence + editor UI

const SKILLS_STORAGE_KEY = 'yv_skills'

/**
 * Build skill object for an agent.
 * @param {string} agentId
 * @param {string} vault - vault address
 * @param {number} amountUSDC - human-readable USDC amount
 * @returns {object} skill JSON
 */
export function buildSkill(agentId, vault, amountUSDC) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600
  const maxAmountUnits = String(Math.floor(amountUSDC * 1e6))
  return {
    agentId,
    vaultAddress: vault,
    skills: {
      swap: { maxSlippage: 0.5, dexPreference: 'mock', maxRetries: 2, timeoutSeconds: 30 },
      deposit: { maxAmount: maxAmountUnits, vaultAddress: vault, expiresAt }
    },
    generatedBy: 'venice-ai',
    approvedByUser: false
  }
}

/**
 * Save skill to localStorage.
 * @param {string} agentId
 * @param {object} skill
 */
export function saveSkill(agentId, skill) {
  const all = loadAllSkills()
  all[agentId] = skill
  localStorage.setItem(SKILLS_STORAGE_KEY, JSON.stringify(all))
}

/**
 * Load skill for agent.
 * @param {string} agentId
 * @returns {object|null}
 */
export function loadSkill(agentId) {
  return loadAllSkills()[agentId] || null
}

/**
 * Load all skills.
 * @returns {object} map of agentId → skill
 */
export function loadAllSkills() {
  try {
    return JSON.parse(localStorage.getItem(SKILLS_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

/**
 * Mark skill as approved by user.
 * @param {string} agentId
 */
export function approveSkill(agentId) {
  const skill = loadSkill(agentId)
  if (!skill) return
  skill.approvedByUser = true
  saveSkill(agentId, skill)
}

/**
 * Render skill editor into a container element.
 * Shows JSON editor + approve button.
 * @param {string} agentId
 * @param {object} skill
 * @param {HTMLElement} container
 * @param {function} onApprove - called with updated skill on approval
 */
export function renderSkillEditor(agentId, skill, container, onApprove) {
  container.innerHTML = `
    <div class="skill-editor">
      <div class="skill-editor-header">Skills: ${agentId.slice(0, 12)}...</div>
      <textarea id="skill-json-${agentId}" class="skill-json-editor">${JSON.stringify(skill, null, 2)}</textarea>
      <button class="btn-approve-skill" data-agent="${agentId}">Approve Skills</button>
    </div>
  `
  container.querySelector('.btn-approve-skill').addEventListener('click', () => {
    try {
      const textarea = container.querySelector(`#skill-json-${agentId}`)
      const updated = JSON.parse(textarea.value)
      updated.approvedByUser = true
      saveSkill(agentId, updated)
      onApprove(updated)
    } catch (e) {
      alert('Invalid JSON in skill editor: ' + e.message)
    }
  })
}

/**
 * Check if all skills for given agentIds are approved.
 * @param {string[]} agentIds
 * @returns {boolean}
 */
export function allSkillsApproved(agentIds) {
  return agentIds.every(id => {
    const s = loadSkill(id)
    return s && s.approvedByUser === true
  })
}

/** Clear all skills from localStorage. */
export function clearSkills() {
  localStorage.removeItem(SKILLS_STORAGE_KEY)
}
