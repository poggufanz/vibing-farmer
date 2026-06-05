const STORAGE_KEY = 'yv_playbook'

export const DEFAULT_PLAYBOOK = [
  {
    id: 'defi-001', category: 'risk', helpful: 0, harmful: 0, createdAt: 0,
    text: 'TVL drop >20% in 3 days = high exit risk. Avoid entering pool under these conditions.',
  },
  {
    id: 'defi-002', category: 'gas', helpful: 0, harmful: 0, createdAt: 0,
    text: 'Breakeven period must be under 30 days: gas_usd_cost / daily_yield_improvement < 30.',
  },
  {
    id: 'defi-003', category: 'risk', helpful: 0, harmful: 0, createdAt: 0,
    text: 'Protocols without audit in past 6 months require minimum $50M TVL as safety buffer.',
  },
  {
    id: 'defi-004', category: 'strategy', helpful: 0, harmful: 0, createdAt: 0,
    text: 'Non-stable asset pairs have significantly higher IL risk during market volatility > 50%.',
  },
  {
    id: 'defi-005', category: 'gas', helpful: 0, harmful: 0, createdAt: 0,
    text: 'Rebalance only when APY delta > 2% AND position > $500. Smaller positions rarely justify gas.',
  },
]

export function incrementCounter(playbook, ruleId, type) {
  return (playbook ?? []).map(rule =>
    rule.id === ruleId ? { ...rule, [type]: (rule[type] ?? 0) + 1 } : rule,
  )
}

export function pruneHarmfulRules(playbook, minEvals = 5) {
  return (playbook ?? []).filter(rule => {
    const totalEvals = (rule.helpful ?? 0) + (rule.harmful ?? 0)
    if (totalEvals < minEvals) return true
    return !((rule.harmful ?? 0) > (rule.helpful ?? 0) * 2)
  })
}

export function formatPlaybookForCouncil(rules) {
  if (!rules || rules.length === 0) return '(no rules yet)'
  return [...rules]
    .sort((a, b) => (b.helpful - b.harmful) - (a.helpful - a.harmful))
    .map(r => `[${r.id}] helpful=${r.helpful} harmful=${r.harmful} :: ${r.text}`)
    .join('\n')
}

export function generateRuleId(existingRules) {
  const nums = (existingRules ?? [])
    .map(r => parseInt(r.id?.split('-')[1], 10))
    .filter(n => !Number.isNaN(n))
  const maxNum = nums.length > 0 ? Math.max(...nums) : 0
  return `defi-${String(maxNum + 1).padStart(3, '0')}`
}

// ─── localStorage-backed default adapter ───────────────────────────────────────
const localStorageAdapter = {
  read() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw == null ? null : (JSON.parse(raw) || null)
    } catch {
      return null
    }
  },
  write(rules) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
    } catch {
      // localStorage unavailable/full — non-fatal.
    }
  },
}

// ─── Store factory (binds storage + clock once) ─────────────────────────────────
export function createPlaybookStore(deps = {}) {
  const { storage = localStorageAdapter, now = () => Date.now() } = deps

  const seed = () => {
    const seeded = DEFAULT_PLAYBOOK.map(rule => ({ ...rule, createdAt: now() }))
    storage.write(seeded)
    return seeded
  }

  const store = {
    load() {
      const stored = storage.read()
      if (!stored || stored.length === 0) return seed()
      return stored
    },

    save(rules) {
      storage.write(rules)
    },

    increment(ruleId, type) {
      const next = incrementCounter(store.load(), ruleId, type)
      storage.write(next)
      return next
    },

    prune(minEvals) {
      const next = pruneHarmfulRules(store.load(), minEvals)
      storage.write(next)
      return next
    },

    all() {
      return store.load()
    },
  }

  return store
}
