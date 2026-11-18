import { getFavorites, setFavorites, toggleFavorite } from '../favorites'
import type { FavoriteMap } from '../favorites'

/**
 * What a person has done in the question bank: starred questions and every question they answered.
 * It always lives in this browser's localStorage, so it works signed out and offline. For a signed-in user,
 * sync.ts mirrors it to the server: this module tells it about every change (setChangeListener) and lets it
 * write the merged result back (replaceUserData).
 */

const BANK_KEY = 'quant-bank'
const PROGRESS_KEY = 'prepbuddy:qbank:progress'
/** Most recently played questions kept; older ones are forgotten so the stored list stays small. */
export const MAX_PROGRESS = 2000
/** Fired on `window` whenever the stored data is replaced from outside the page (e.g. after a sync), so open screens can re-read it. */
export const USER_DATA_EVENT = 'prepbuddy:qbank-userdata'

export interface PlayRecord {
  /** ISO time of the latest answer. */
  at: string
  /** Whether the latest answer was right. */
  correct: boolean
}

export type ProgressMap = ReadonlyMap<string, PlayRecord>

/** A change the person just made: a star added (`at` = when) or removed (`at` = null), or an answer given. */
export type UserDataChange = { kind: 'favourite'; id: string; at: string | null } | { kind: 'answer'; id: string; record: PlayRecord }

let changeListener: ((change: UserDataChange) => void) | null = null

/** Lets the sync code hear about every change. Only one listener is kept. */
export function setChangeListener(listener: ((change: UserDataChange) => void) | null) {
  changeListener = listener
}

export function getFavouriteMap(): FavoriteMap {
  return getFavorites(BANK_KEY)
}

/** Stars or un-stars a question and returns the updated favourites. */
export function toggleFavouriteQuestion(id: string, current: FavoriteMap): FavoriteMap {
  const next = toggleFavorite(BANK_KEY, id, current)
  changeListener?.({ kind: 'favourite', id, at: next.has(id) ? (next.get(id) ?? new Date().toISOString()) : null })
  return next
}

function readProgress(): Map<string, PlayRecord> {
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

function writeProgress(map: ReadonlyMap<string, PlayRecord>) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(Object.fromEntries(map)))
  } catch {
    // localStorage unavailable (private mode, quota, etc.): the answer still counts for this visit
  }
}

export function getProgress(): Map<string, PlayRecord> {
  return readProgress()
}

/** Keeps only the newest `limit` answers. */
export function newestProgress(map: ReadonlyMap<string, PlayRecord>, limit = MAX_PROGRESS): Map<string, PlayRecord> {
  if (map.size <= limit) return new Map(map)
  return new Map([...map.entries()].sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, limit))
}

/** Remembers an answer (this is what puts a question under "Recently played"). Returns the updated map. */
export function recordAnswer(id: string, correct: boolean, current: ProgressMap = readProgress()): Map<string, PlayRecord> {
  const record: PlayRecord = { at: new Date().toISOString(), correct }
  const next = new Map(current)
  next.set(id, record)
  const kept = newestProgress(next)
  writeProgress(kept)
  changeListener?.({ kind: 'answer', id, record })
  return kept
}

/** Replaces everything stored (used by sync after it merges with the server) and tells open screens to re-read it. */
export function replaceUserData(favourites: ReadonlyMap<string, string | null>, progress: ReadonlyMap<string, PlayRecord>) {
  setFavorites(BANK_KEY, new Map(favourites))
  writeProgress(newestProgress(progress))
  try {
    window.dispatchEvent(new Event(USER_DATA_EVENT))
  } catch {
    /* no window (not in a browser) */
  }
}
