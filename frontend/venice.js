import { VENICE_BASE_URL, VENICE_MODEL, VENICE_TIMEOUT_MS, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL, DEMO_VAULTS } from './config.js'

// AI provider priority: Venice x402 → DeepSeek (dev) → hardcoded fallback
// Venice x402: wallet SIWE auth, pays USDC on Base — no API key needed
// DeepSeek: dev mode, OpenAI-compat, needs API key
// Fallback: hardcoded equal split — always works

const FALLBACK_STRATEGY = {
  vaults: [
    { address: DEMO_VAULTS[0].address, name: DEMO_VAULTS[0].name, allocation: 0.5, expectedApy: 8.2 },
    { address: DEMO_VAULTS[1].address, name: DEMO_VAULTS[1].name, allocation: 0.5, expectedApy: 12.7 }
  ],
  rationale: 'Fallback: equal split across available vaults',
  generatedBy: 'fallback'
}

/**
 * Call an OpenAI-compatible chat completions endpoint.
 * @param {string} baseUrl
 * @param {string} model
 * @param {object} headers - Authorization or X-Sign-In-With-X
 * @param {Array} messages
 * @param {boolean} isVenice - include venice_parameters when true
 * @param {AbortSignal} signal
 */
async function callChatCompletions(baseUrl, model, headers, messages, isVenice, signal) {
  const body = {
    model,
    response_format: { type: 'json_object' },
    messages
  }
  if (isVenice) body.venice_parameters = { include_venice_system_prompt: false }

  const response = await fetch(`${baseUrl}/chat/completions`, {
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
    baseUrl: VENICE_BASE_URL,
    model: VENICE_MODEL,
    headers: { 'X-Sign-In-With-X': veniceAuth },
    isVenice: true,
    name: 'venice-ai'
  }
  if (devApiKey) return {
    baseUrl: DEEPSEEK_BASE_URL,
    model: DEEPSEEK_MODEL,
    headers: { 'Authorization': `Bearer ${devApiKey}` },
    isVenice: false,
    name: 'deepseek-ai'
  }
  return null
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
export async function generateStrategy({ amount, riskLevel, numVaults, veniceAuth, devApiKey }) {
  const provider = resolveProvider(veniceAuth, devApiKey)
  if (!provider) {
    console.warn('[ai] No provider — using fallback strategy')
    return buildFallbackForParams(amount, numVaults)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VENICE_TIMEOUT_MS)

  try {
    const content = await callChatCompletions(
      provider.baseUrl, provider.model, provider.headers,
      [
        {
          role: 'system',
          content: 'You are a DeFi yield strategy generator. Respond ONLY with valid JSON matching the requested schema. No explanation outside JSON.'
        },
        {
          role: 'user',
          content: `Generate a yield farming strategy.
Amount: ${amount} USDC
Risk level: ${riskLevel}
Number of vaults: ${numVaults}
Available vaults: ${JSON.stringify(DEMO_VAULTS)}

Respond with JSON schema:
{
  "vaults": [{ "address": "0x...", "name": "...", "allocation": 0.5, "expectedApy": 8.2 }],
  "rationale": "one sentence",
  "generatedBy": "${provider.name}"
}

allocations must sum to 1.0. Use exactly ${numVaults} vaults.`
        }
      ],
      provider.isVenice,
      controller.signal
    )
    const parsed = JSON.parse(content)
    validateStrategy(parsed, numVaults)
    console.log(`[ai] Strategy via ${provider.name}`)
    return parsed
  } catch (err) {
    console.warn(`[ai] Strategy failed (${provider.name}), using fallback:`, err.message)
    return buildFallbackForParams(amount, numVaults)
  } finally {
    clearTimeout(timeout)
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
      provider.baseUrl, provider.model, provider.headers,
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
  const count = Math.min(numVaults, DEMO_VAULTS.length)
  const allocation = 1 / count
  return {
    vaults: DEMO_VAULTS.slice(0, count).map(v => ({
      address: v.address,
      name: v.name,
      allocation,
      expectedApy: v.apy
    })),
    rationale: 'Fallback: equal split across available vaults',
    generatedBy: 'fallback'
  }
}

function validateStrategy(strategy, numVaults) {
  if (!Array.isArray(strategy.vaults)) throw new Error('Missing vaults array')
  if (strategy.vaults.length !== numVaults) throw new Error(`Expected ${numVaults} vaults`)
  const total = strategy.vaults.reduce((s, v) => s + v.allocation, 0)
  if (Math.abs(total - 1.0) > 0.01) throw new Error('Allocations do not sum to 1.0')
}
