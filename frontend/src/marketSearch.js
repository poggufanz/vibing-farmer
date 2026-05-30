// marketSearch.js
// Fetches real-time DeFi market context via Tavily before strategy generation.
// Output is injected into Venice AI system prompt as live market intelligence.

const TAVILY_ENDPOINT = 'https://api.tavily.com/search'
const TAVILY_TIMEOUT_MS = 8000

/**
 * Fetches current DeFi market context relevant to stablecoin yield farming.
 * Returns a concise summary string ready to inject into Venice AI prompt.
 * Never throws — on any failure returns null (caller uses static fallback).
 *
 * @param {string} apiKey - VITE_TAVILY_API_KEY
 * @param {'low'|'medium'|'high'} riskLevel - user's risk preference
 * @returns {Promise<string|null>} market context summary or null
 */
export async function fetchMarketContext(apiKey, riskLevel) {
  if (!apiKey) return null

  const queries = {
    low: 'DeFi stablecoin lending yield safe protocols 2026 current APY',
    medium: 'DeFi yield farming USDC Morpho Aave market conditions 2026',
    high: 'DeFi high yield farming opportunities risks 2026 stablecoin',
  }

  const query = queries[riskLevel] || queries.medium

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS)

  try {
    const res = await fetch(TAVILY_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        search_depth: 'basic',       // basic = faster, cheaper
        max_results: 3,              // 3 sources cukup untuk context
        include_answer: true,        // Tavily AI summary — inject langsung
        include_raw_content: false,  // raw content terlalu panjang untuk prompt
      }),
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      console.warn('[MarketSearch] Tavily error:', res.status)
      return null
    }

    const data = await res.json()

    // Prefer Tavily's AI-generated answer (concise, LLM-ready)
    // Fall back to concatenated snippets from top results
    if (data.answer && data.answer.length > 20) {
      return formatMarketContext(data.answer, data.results)
    }

    if (data.results?.length > 0) {
      const snippets = data.results
        .slice(0, 3)
        .map(r => `- ${r.title}: ${r.content?.slice(0, 150)}`)
        .join('\n')
      return formatMarketContext(snippets, data.results)
    }

    return null

  } catch (err) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      console.warn('[MarketSearch] Tavily timeout after 8s — using static context')
    } else {
      console.warn('[MarketSearch] Tavily fetch failed:', err.message)
    }
    return null
  }
}

/**
 * Formats raw Tavily output into a clean, token-efficient context block
 * ready to inject into Venice AI system prompt.
 */
function formatMarketContext(summary, results = []) {
  const sources = results
    .slice(0, 3)
    .map(r => r.url)
    .filter(Boolean)
    .join(', ')

  return `## LIVE MARKET CONTEXT (fetched ${new Date().toUTCString()})
${summary}
${sources ? `Sources: ${sources}` : ''}
---`
}
