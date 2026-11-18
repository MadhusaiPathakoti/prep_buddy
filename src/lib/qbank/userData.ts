import { getFavorites, toggleFavorite } from '../favorites'
import type { FavoriteMap } from '../favorites'

/**
 * What a person has done in the question bank: starred questions and every question they answered.
 * For now it all lives in this browser's localStorage. It is deliberately behind this one small module,
 * so signed-in users' favourites and recent plays can later be synced to the server without touching the screens.
 */

const BANK_KEY = 'quant-bank'
const PROGRESS_KEY = 'prepbuddy:qbank:progress'
/** Most recently played questions kept; older ones are forgotten so the stored list stays small. */
const MAX_PROGRESS = 2000

export interface PlayRecord {
  /** ISO time of the latest answer. */
  at: string
  /** Whether the latest answer was right. */
  correct: boolean
}

export type ProgressMap = ReadonlyMap<string, PlayRecord>

export function getFavouriteMap(): FavoriteMap {
  return getFavorites(BANK_KEY)
}

/** Stars or un-stars a question and returns the updated favourites. */
export function toggleFavouriteQuestion(id: string, current: FavoriteMap): FavoriteMap {
  return toggleFavorite(BANK_KEY, id, current)
}

export function getProgress(): Map<string, PlayRecord> {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    if (!raw) return new Map()
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map()
    const out = new Map<string, PlayRecord>()
    for (const [id, value] of Object.entries(parsed)) {
      const v = value as Partial<PlayRecord> | null
      if (v && typeof v.at === 'string' && typeof v.correct === 'boolean') out.set(id, { at: v.at, correct: v.correct })
    }
    return out
  } catch {
    return new Map()
  }
}

/** Remembers an answer (this is what puts a question under "Recently played"). Returns the updated map. */
export function recordAnswer(id: string, correct: boolean, current: ProgressMap = getProgress()): Map<string, PlayRecord> {
  const next = new Map(current)
  next.set(id, { at: new Date().toISOString(), correct })
  if (next.size > MAX_PROGRESS) {
    const newestFirst = [...next.entries()].sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, MAX_PROGRESS)
    next.clear()
    for (const [key, value] of newestFirst) next.set(key, value)
  }
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(Object.fromEntries(next)))
  } catch {
    // localStorage unavailable (private mode, quota, etc.): the answer still counts for this visit
  }
  return next
}
