// Browser frontend → localStorage-backed (mirrors history.js: one yv_-prefixed key holds a
// JSON array, oldest entries pruned past MAX_ENTRIES). Storage adapter + clock are
// dependency-injected so the pure decision logic is testable under vitest's node env
// (no localStorage). Consumed downstream: Step 9 (executor) appends; Step 10 (outcome
// tracker) calls getPending() then update(); Step 11 (reflector) reads patched outcomes.

const STORAGE_KEY = 'yv_decisions'
const MAX_ENTRIES = 200 // pending decisions must survive the 7-day eval window

// ─── localStorage-backed default adapter ───────────────────────────────────────
const localStorageAdapter = {
  read() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') || []
    } catch {
      return []
    }
  },
  write(entries) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)))
    } catch {
      // localStorage unavailable/full — non-fatal.
    }
  },
}

// ─── Pure helpers (no I/O — unit-tested directly) ───────────────────────────────

/**
 * Decisions still awaiting delayed evaluation whose timestamp is strictly older than
 * `now - olderThanDays`.
 *
 * @param {Array<{status:string,timestamp:number}>} [decisions]
 * @param {number} olderThanDays
 * @param {number} now  current epoch ms (injected)
 * @returns {Array}
 */
export function filterPendingDecisions(decisions, olderThanDays, now) {
  const cutoff = now - olderThanDays * 86_400_000
  return (decisions ?? []).filter(
    d => d.status === 'pending_evaluation' && d.timestamp < cutoff,
  )
}

/**
 * Immutably merge `updates` into the decision whose id matches. Non-matching entries
 * and the input array are left untouched.
 *
 * @param {Array<{id:string}>} [decisions]
 * @param {string} id
 * @param {object} updates
 * @returns {Array}
 */
export function applyDecisionUpdate(decisions, id, updates) {
  return (decisions ?? []).map(d => (d.id === id ? { ...d, ...updates } : d))
}

/**
 * Unique-ish id: `dec-<now>-<rand>`. `now` and `rand` are injectable so tests are
 * deterministic.
 *
 * @param {number} [now]
 * @param {()=>number} [rand]
 * @returns {string}
 */
export function generateDecisionId(now = Date.now(), rand = Math.random) {
  return `dec-${now}-${rand().toString(36).slice(2, 7)}`
}

// ─── Log factory (binds storage + clock once) ───────────────────────────────────

/**
 * @param {object} [deps]
 * @param {{read:()=>Array,write:(a:Array)=>void}} [deps.storage]  default: localStorage
 * @param {()=>number} [deps.now]                                  default: Date.now
 * @returns {{append:Function,getPending:Function,update:Function,all:Function}}
 */
export function createDecisionLog(deps = {}) {
  const { storage = localStorageAdapter, now = () => Date.now() } = deps

  return {
    /** Append one decision entry (assigns an id when absent). Returns the stored entry. */
    append(entry) {
      const stored = { id: entry.id ?? generateDecisionId(now()), ...entry }
      storage.write([...storage.read(), stored])
      return stored
    },

    /** Pending decisions older than `olderThanDays`, ready for outcome evaluation. */
    getPending(olderThanDays) {
      return filterPendingDecisions(storage.read(), olderThanDays, now())
    },

    /** Patch one decision by id, writing the updated list back. */
    update(id, updates) {
      storage.write(applyDecisionUpdate(storage.read(), id, updates))
    },

    /** Read every entry in append order (newest last). */
    all() {
      return storage.read()
    },
  }
}
