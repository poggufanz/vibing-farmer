// history.js
// Manages persistent history for transactions, strategies, and AI reasoning.
// All data stored in localStorage under yv_ prefix.
// Max entries per store: 50 (oldest pruned automatically)

const KEYS = {
  transactions: 'yv_history_transactions',
  strategies:   'yv_history_strategies',
  reasoning:    'yv_history_reasoning',
}

const MAX_ENTRIES = 50

// ─── Generic helpers ─────────────────────────────────────────────────────────

function readStore(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]')
  } catch {
    return []
  }
}

function writeStore(key, entries) {
  try {
    // Prune oldest if over limit
    const pruned = entries.slice(-MAX_ENTRIES)
    localStorage.setItem(key, JSON.stringify(pruned))
  } catch (err) {
    console.warn('[History] localStorage write failed:', err.message)
  }
}

function addEntry(key, entry) {
  const entries = readStore(key)
  entries.push({ ...entry, id: crypto.randomUUID(), savedAt: Date.now() })
  writeStore(key, entries)
}

// ─── A: Transaction History ───────────────────────────────────────────────────

/**
 * Called after each successful DepositExecuted event.
 */
export function saveTransaction({
  txHash,
  vaultName,
  vaultAddress,
  protocol,
  amountUsdc,
  apy,
  workerLabel,
  workerId,
  gasPayedBy,  // '1shot-relayer' always
  network,     // 'sepolia'
}) {
  addEntry(KEYS.transactions, {
    type: 'transaction',
    txHash,
    vaultName,
    vaultAddress,
    protocol,
    amountUsdc,
    apy,
    workerLabel,
    workerId,
    gasPayedBy: gasPayedBy || '1shot-relayer',
    network: network || 'sepolia',
    status: 'confirmed',
    timestamp: Date.now(),
  })
}

export function getTransactions() {
  return readStore(KEYS.transactions).reverse() // newest first
}

export function clearTransactions() {
  localStorage.removeItem(KEYS.transactions)
}

// ─── B: Strategy Session History ─────────────────────────────────────────────

/**
 * Called after Venice/DeepSeek returns a strategy.
 */
export function saveStrategy({
  amountUsdc,
  riskLevel,
  numVaults,
  vaultsSelected,      // array of { name, protocol, apy, allocation }
  strategySource,      // 'venice' | 'deepseek' | 'fallback'
  skillSource,         // 'default' | 'user-local'
  vaultDataSource,     // 'defiLlama' | 'fallback'
  marketContextUsed,   // boolean
  blendedApy,          // weighted average APY
}) {
  addEntry(KEYS.strategies, {
    type: 'strategy',
    amountUsdc,
    riskLevel,
    numVaults,
    vaultsSelected,
    strategySource,
    skillSource,
    vaultDataSource,
    marketContextUsed,
    blendedApy,
    timestamp: Date.now(),
  })
}

export function getStrategies() {
  return readStore(KEYS.strategies).reverse()
}

export function clearStrategies() {
  localStorage.removeItem(KEYS.strategies)
}

// ─── D: AI Reasoning Log ─────────────────────────────────────────────────────

/**
 * Called for each vault in selected_vaults from Venice/DeepSeek response.
 */
export function saveReasoning({
  vaultName,
  protocol,
  riskTier,
  yieldSource,
  reasoning,        // AI-generated reasoning string
  expectedApy,
  amountUsdc,
  riskLevel,
  modelUsed,        // 'deepseek-chat' | 'venice/llama-3.3-70b' etc
}) {
  addEntry(KEYS.reasoning, {
    type: 'reasoning',
    vaultName,
    protocol,
    riskTier,
    yieldSource,
    reasoning,
    expectedApy,
    amountUsdc,
    riskLevel,
    modelUsed,
    timestamp: Date.now(),
  })
}

export function getReasoningLog() {
  return readStore(KEYS.reasoning).reverse()
}

export function clearReasoningLog() {
  localStorage.removeItem(KEYS.reasoning)
}

// ─── Combined ─────────────────────────────────────────────────────────────────

export function clearAllHistory() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k))
}

export function getHistorySummary() {
  return {
    transactions: readStore(KEYS.transactions).length,
    strategies: readStore(KEYS.strategies).length,
    reasoning: readStore(KEYS.reasoning).length,
    oldestTransaction: readStore(KEYS.transactions)[0]?.timestamp || null,
  }
}
