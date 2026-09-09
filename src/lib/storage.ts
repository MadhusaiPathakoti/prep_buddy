import type { SessionRecord } from './types'

const PREFIX = 'prepbuddy'
const MAX_HISTORY = 30

function key(gameId: string) {
  return `${PREFIX}:${gameId}:history`
}

export function getHistory(gameId: string): SessionRecord[] {
  try {
    const raw = localStorage.getItem(key(gameId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function addSession(gameId: string, record: SessionRecord) {
  try {
    const history = getHistory(gameId)
    history.unshift(record)
    localStorage.setItem(key(gameId), JSON.stringify(history.slice(0, MAX_HISTORY)))
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — silently skip persistence
  }
}

export interface GameSummary {
  sessionsPlayed: number
  bestAccuracy: number | null
  lastAccuracy: number | null
  lastPlayed: string | null
}

export function getSummary(gameId: string): GameSummary {
  const history = getHistory(gameId)
  if (history.length === 0) {
    return { sessionsPlayed: 0, bestAccuracy: null, lastAccuracy: null, lastPlayed: null }
  }
  const accuracyOf = (r: SessionRecord) => (r.total > 0 ? (r.correct / r.total) * 100 : 0)
  const bestAccuracy = Math.max(...history.map(accuracyOf))
  return {
    sessionsPlayed: history.length,
    bestAccuracy,
    lastAccuracy: accuracyOf(history[0]),
    lastPlayed: history[0].date,
  }
}
