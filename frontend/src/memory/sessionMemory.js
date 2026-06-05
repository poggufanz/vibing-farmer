// Session memory persisted as plain JSON in localStorage — same pattern as
// positionsStore.js / history.js. One entry per session plus a small JSON index.

export const MEMORY_KEY_PREFIX = 'yv_memory_session_'
export const MEMORY_INDEX_KEY = 'yv_memory_index'

export const memoryKey = (sessionId) => `${MEMORY_KEY_PREFIX}${sessionId}`

function readIndex() {
  try { return JSON.parse(localStorage.getItem(MEMORY_INDEX_KEY) || '[]') }
  catch { return [] }
}

function writeIndex(entries) {
  localStorage.setItem(MEMORY_INDEX_KEY, JSON.stringify(entries))
}

/**
 * Persist a session (plain JSON) + upsert its index entry.
 * @returns {{ key:string, session:object }}
 */
export function saveSessionMemory(session) {
  const key = memoryKey(session.sessionId)
  localStorage.setItem(key, JSON.stringify(session))

  const entry = {
    sessionId: session.sessionId,
    startedAt: session.startedAt ?? Date.now(),
    completedAt: session.completedAt ?? null,
    vaultCount: session.config?.vaultCount ?? (session.steps?.length ?? 0),
    key,
  }
  const index = readIndex().filter((e) => e.sessionId !== session.sessionId)
  index.push(entry)
  writeIndex(index)
  return { key, session }
}

/** Index entries, newest-first by startedAt. */
export function listSessions() {
  return readIndex().slice().sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
}

/** Parse one stored session by id, or null. */
export function loadSession(sessionId) {
  try { return JSON.parse(localStorage.getItem(memoryKey(sessionId)) || 'null') }
  catch { return null }
}

/** Most recent session object, or null. */
export function loadLatestSession() {
  const [latest] = listSessions()
  if (!latest) return null
  return loadSession(latest.sessionId)
}
