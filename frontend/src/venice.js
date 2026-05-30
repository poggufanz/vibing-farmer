import { VENICE_BASE_URL, VENICE_MODEL, VENICE_TIMEOUT_MS, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL, AI_PROXY_URL, VAULT_CATALOG } from './config.js'
import { loadVaultSkill } from './skillLoader.js'
import { fetchMarketContext } from './marketSearch.js'
import { fetchDeFiLlamaVaults } from './defiLlama.js'
import { saveStrategy, saveReasoning } from './history.js'
import { loadSettings } from './settingsStore.js'

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
  const settings = loadSettings()
  const effectiveTavilyKey = settings.tavilyApiKey || import.meta.env.VITE_TAVILY_API_KEY
  const useStaticVaults = settings.vaultDataSource === 'static'
  const marketContextEnabled = settings.marketContext !== false

  // Load skill + market context + real vault data ALL IN PARALLEL (no added latency)
  const [skill, marketContext, liveVaults] = await Promise.all([
    loadVaultSkill(),
    marketContextEnabled
      ? fetchMarketContext(effectiveTavilyKey, riskLevel).catch(() => null)
      : Promise.resolve(null),
    useStaticVaults
      ? Promise.resolve(null)
      : fetchDeFiLlamaVaults().catch(() => null),
  ])

  // Real DeFiLlama vaults when available, else the static VAULT_CATALOG
  const vaultData = (liveVaults && liveVaults.length > 0) ? liveVaults : VAULT_CATALOG
  const vaultDataSource = (liveVaults && liveVaults.length > 0) ? 'defiLlama' : 'fallback'
  const dataSource = vaultDataSource === 'defiLlama'
    ? `live DeFiLlama data (${new Date().toUTCString()})`
    : 'static fallback catalog'

  // System prompt: skill + real vault catalog + injected live market context (if available)
  let systemPrompt = skill.content.replace('[VAULT_CATALOG_JSON]', JSON.stringify(vaultData, null, 2))
  if (marketContext) {
    systemPrompt = systemPrompt + '\n\n' + marketContext
    console.log('[Venice] Market context injected from Tavily')
  } else {
    console.log('[Venice] No market context — using static knowledge only')
  }

  const safeNumVaults = Math.min(numVaults, vaultData.length) // fixes high-risk fallback bug

  const effectiveDevKey = devApiKey || settings.veniceApiKey || null
  const provider = resolveProvider(veniceAuth, effectiveDevKey)
  if (!provider) {
    console.warn('[ai] No provider — using fallback strategy')
    return { ...buildFallbackForParams(amount, safeNumVaults), skillSource: skill.source, marketContextUsed: marketContext !== null, vaultDataSource, vaultsUsed: vaultData }
  }

  const userPrompt = `User profile:
- Amount: ${amount} USDC
- Risk tolerance: ${riskLevel}
- Requested vault count: ${safeNumVaults}
- Current date: ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
- Vault data source: ${dataSource}

Select optimal vault(s) from the catalog above. APY and TVL data are real-time from DeFiLlama. Consider live market context if present. Respond in JSON only.`

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
    const parsed = validateVeniceResponse(JSON.parse(content), vaultData)
    console.log(`[ai] Strategy via ${provider.name} · skill: ${skill.source} · vaults: ${vaultDataSource}`)
    // Persist strategy session + per-vault AI reasoning to history (localStorage)
    saveStrategy({
      amountUsdc: amount,
      riskLevel,
      numVaults: safeNumVaults,
      vaultsSelected: parsed.selected_vaults.map(v => ({ name: v.name, protocol: v.protocol, apy: v.expected_apy, allocation: v.allocation })),
      strategySource: provider.name,
      skillSource: skill.source,
      vaultDataSource,
      marketContextUsed: marketContext !== null,
      blendedApy: parsed.selected_vaults.reduce((sum, v) => sum + ((v.expected_apy || 0) * (v.allocation || 0)), 0).toFixed(2),
    })
    parsed.selected_vaults.forEach(v => {
      if (v.reasoning) saveReasoning({
        vaultName: v.name, protocol: v.protocol, riskTier: v.risk_tier, yieldSource: v.yield_source_type,
        reasoning: v.reasoning, expectedApy: v.expected_apy, amountUsdc: amount, riskLevel, modelUsed: provider.model,
      })
    })
    return { ...parsed, generatedBy: provider.name, skillSource: skill.source, marketContextUsed: marketContext !== null, vaultDataSource, vaultsUsed: vaultData }
  } catch (err) {
    console.warn(`[ai] Strategy failed (${provider.name}), using fallback:`, err.message)
    return { ...buildFallbackForParams(amount, safeNumVaults), skillSource: skill.source, marketContextUsed: marketContext !== null, vaultDataSource, vaultsUsed: vaultData }
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

function validateVeniceResponse(response, vaultData = VAULT_CATALOG) {
  const allowedAddresses = new Set(vaultData.map(v => v.address.toLowerCase()))

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
  if (response.selected_vaults.length > vaultData.length) {
    response.selected_vaults = response.selected_vaults.slice(0, vaultData.length)
  }

  return response
}


/**
 * Classify whether a security search result is a real threat to deposited funds.
 * Uses the default server-side AI proxy (no auth) so the background agent needs no keys.
 * Fail-safe: returns 'none' on any error — never alarms the user on a classification failure.
 * @param {string} searchAnswer - Tavily answer/summary text
 * @param {string} protocol - protocol name (e.g. 'morpho-blue')
 * @returns {Promise<'high'|'medium'|'low'|'none'>}
 */
export async function classifyRisk(searchAnswer, protocol) {
  if (!searchAnswer || searchAnswer.length < 20) return 'none'

  const provider = resolveProvider(null, null) // server proxy — key stays server-side
  const messages = [
    { role: 'system', content: 'You are a DeFi security analyst. Respond ONLY with JSON: {"severity":"high|medium|low|none"}.' },
    {
      role: 'user',
      content: `Search result about ${protocol}:
"${searchAnswer}"

Classify the threat level for a user with funds deposited in ${protocol}:
- high: active exploit, hack, or depeg happening now
- medium: vulnerability disclosed, governance concern, unusual activity
- low: minor concern, old news, speculation
- none: no real threat, positive news, or irrelevant`,
    },
  ]

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VENICE_TIMEOUT_MS)
  try {
    const content = await callChatCompletions(provider.url, provider.model, provider.headers, messages, provider.isVenice, controller.signal)
    const word = String(JSON.parse(content).severity || '').toLowerCase()
    return ['high', 'medium', 'low', 'none'].includes(word) ? word : 'none'
  } catch {
    return 'none'
  } finally {
    clearTimeout(timeout)
  }
}
