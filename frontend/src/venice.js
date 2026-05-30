import { VENICE_BASE_URL, VENICE_MODEL, VENICE_TIMEOUT_MS, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL, AI_PROXY_URL, VAULT_CATALOG } from './config.js'
import { loadVaultSkill } from './skillLoader.js'

// AI provider priority: Venice x402 → DeepSeek (dev) → hardcoded fallback
// Venice x402: wallet SIWE auth, pays USDC on Base — no API key needed
// DeepSeek: dev mode, OpenAI-compat, needs API key
// Fallback: hardcoded equal split — always works

/**
 * Call an OpenAI-compatible chat completions endpoint.
 * @param {string} baseUrl
 * @param {string} model
 * @param {object} headers - Authorization or X-Sign-In-With-X
 * @param {Array} messages
 * @param {boolean} isVenice - include venice_parameters when true
 * @param {AbortSignal} signal
 */
async function callChatCompletions(url, model, headers, messages, isVenice, signal) {
  const body = {
    model,
    response_format: { type: 'json_object' },
    messages
  }
  if (isVenice) body.venice_parameters = { include_venice_system_prompt: false }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    signal,
    body: JSON.stringify(body)
  })
  if (!response.ok) throw new Error(`API ${response.status}`)
  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Empty response')
  return content
}

function resolveProvider(veniceAuth, devApiKey) {
  if (veniceAuth) return {
    url: `${VENICE_BASE_URL}/chat/completions`,
    model: VENICE_MODEL,
    headers: { 'X-Sign-In-With-X': veniceAuth },
    isVenice: true,
    name: 'venice-ai'
  }
  // Manual dev override: direct DeepSeek with a user-supplied key
  if (devApiKey) return {
    url: `${DEEPSEEK_BASE_URL}/chat/completions`,
    model: DEEPSEEK_MODEL,
    headers: { 'Authorization': `Bearer ${devApiKey}` },
    isVenice: false,
    name: 'deepseek-ai'
  }
  // Default (production): server-side proxy — key never reaches the client
  return {
    url: AI_PROXY_URL,
    model: DEEPSEEK_MODEL,
    headers: {},
    isVenice: false,
    name: 'deepseek-proxy'
  }
}

/**
 * Generate multi-vault allocation strategy.
 * @param {object} params
 * @param {number} params.amount
 * @param {'low'|'medium'|'high'} params.riskLevel
 * @param {number} params.numVaults
 * @param {string|null} params.veniceAuth - base64 SIWE header from signSiweForVenice()
 * @param {string|null} params.devApiKey - DeepSeek API key for dev mode
 */
export async function generateStrategy({ amount, riskLevel, numVaults, veniceAuth, devApiKey, signal }) {
  // Load skill (user override or default) and inject the live vault catalog
  const skill = await loadVaultSkill()
  const systemPrompt = skill.content.replace('[VAULT_CATALOG_JSON]', JSON.stringify(VAULT_CATALOG, null, 2))
  const safeNumVaults = Math.min(numVaults, VAULT_CATALOG.length) // fixes high-risk fallback bug

  const provider = resolveProvider(veniceAuth, devApiKey)
  if (!provider) {
    console.warn('[ai] No provider — using fallback strategy')
    return { ...buildFallbackForParams(amount, safeNumVaults), skillSource: skill.source }
  }

  const userPrompt = `User profile:
- Amount: ${amount} USDC
- Risk tolerance: ${riskLevel}
- Requested vault count: ${safeNumVaults}

Select the optimal vault(s). Apply your expert framework. Respond in JSON only.`

  // Caller may pass a signal (app-managed 1-min timeout + confirm); else use an internal timeout
  const controller = signal ? null : new AbortController()
  const timeout = controller ? setTimeout(() => controller.abort(), VENICE_TIMEOUT_MS) : null
  const sig = signal || controller.signal

  try {
    const content = await callChatCompletions(
      provider.url, provider.model, provider.headers,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      provider.isVenice,
      sig
    )
    const parsed = validateVeniceResponse(JSON.parse(content))
    console.log(`[ai] Strategy via ${provider.name} · skill: ${skill.source}`)
    return { ...parsed, generatedBy: provider.name, skillSource: skill.source }
  } catch (err) {
    console.warn(`[ai] Strategy failed (${provider.name}), using fallback:`, err.message)
    return { ...buildFallbackForParams(amount, safeNumVaults), skillSource: skill.source }
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

/**
 * Generate skill JSON for a single agent.
 * @param {object} params
 * @param {string} params.agentId
 * @param {string} params.vault
 * @param {number} params.amount
 * @param {string|null} params.veniceAuth
 * @param {string|null} params.devApiKey
 */
export async function generateAgentSkills({ agentId, vault, amount, veniceAuth, devApiKey }) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600

  const fallback = {
    agentId,
    vaultAddress: vault,
    skills: {
      swap: { maxSlippage: 0.5, dexPreference: 'mock', maxRetries: 2, timeoutSeconds: 30 },
      deposit: { maxAmount: String(Math.floor(amount * 1e6)), vaultAddress: vault, expiresAt }
    },
    generatedBy: 'fallback',
    approvedByUser: false
  }

  const provider = resolveProvider(veniceAuth, devApiKey)
  if (!provider) return fallback

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VENICE_TIMEOUT_MS)

  try {
    const content = await callChatCompletions(
      provider.url, provider.model, provider.headers,
      [
        {
          role: 'system',
          content: 'You generate DeFi agent skill configurations. Respond ONLY with valid JSON.'
        },
        {
          role: 'user',
          content: `Generate skill config for agent ${agentId} depositing ${amount} USDC to vault ${vault}.
Respond with JSON schema:
{
  "agentId": "${agentId}",
  "vaultAddress": "${vault}",
  "skills": {
    "swap": { "maxSlippage": 0.5, "dexPreference": "uniswap-v3", "maxRetries": 2, "timeoutSeconds": 30 },
    "deposit": { "maxAmount": "${Math.floor(amount * 1e6)}", "vaultAddress": "${vault}", "expiresAt": ${expiresAt} }
  },
  "generatedBy": "${provider.name}",
  "approvedByUser": false
}`
        }
      ],
      provider.isVenice,
      controller.signal
    )
    const result = JSON.parse(content)
    console.log(`[ai] Skills via ${provider.name}`)
    return result
  } catch (err) {
    console.warn(`[ai] Skill gen failed (${provider.name}), using fallback:`, err.message)
    return fallback
  } finally {
    clearTimeout(timeout)
  }
}

function buildFallbackForParams(amount, numVaults) {
  const count = Math.min(numVaults, VAULT_CATALOG.length)
  const allocation = 1 / count
  return {
    vaults: VAULT_CATALOG.slice(0, count).map(v => ({
      address: v.address,
      name: v.name,
      allocation,
      expectedApy: v.apy
    })),
    rationale: 'Fallback: equal split across available vaults',
    generatedBy: 'fallback'
  }
}

function validateVeniceResponse(response) {
  const allowedAddresses = new Set(VAULT_CATALOG.map(v => v.address.toLowerCase()))

  if (!response.selected_vaults || !Array.isArray(response.selected_vaults)) {
    throw new Error('Missing selected_vaults array')
  }

  response.selected_vaults.forEach((v, i) => {
    if (!allowedAddresses.has(v.address?.toLowerCase())) {
      throw new Error(`Vault ${i}: hallucinated address ${v.address}`)
    }
    if (!v.reasoning || v.reasoning.length < 20) {
      throw new Error(`Vault ${i}: reasoning missing or too short`)
    }
  })

  const total = response.selected_vaults.reduce((s, v) => s + v.allocation, 0)
  if (Math.abs(total - 1.0) > 0.01) {
    throw new Error(`Allocation sum ${total.toFixed(2)} !== 1.0`)
  }

  // Cap to catalog size
  if (response.selected_vaults.length > VAULT_CATALOG.length) {
    response.selected_vaults = response.selected_vaults.slice(0, VAULT_CATALOG.length)
  }

  return response
}
