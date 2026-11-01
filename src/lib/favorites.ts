const STORAGE_PREFIX = 'prepbuddy:favorites:'
const DAY_MS = 24 * 60 * 60 * 1000

/** Recency windows (in days) offered for "recently favourited" filters. */
export const FAVORITE_RECENCY_DAYS = [1, 2, 3, 7, 14, 30]

/** Favorited entry id -> ISO timestamp of when it was favorited, or null for favourites saved before dates were tracked. */
export type FavoriteMap = ReadonlyMap<string, string | null>

function storageKey(bankKey: string): string {
  return `${STORAGE_PREFIX}${bankKey}`
}

/**
 * Favorites for one bank (vocabulary, idioms, ...), local to this browser. Stored as an
 * `{ id: isoDate }` object; the older format was a plain array of ids, which is read as
 * undated favourites (they never match a "recently favourited" filter, since when they
 * were added is unknown).
 */
export function getFavorites(bankKey: string): Map<string, string | null> {
  try {
    const raw = localStorage.getItem(storageKey(bankKey))
    if (!raw) return new Map()
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return new Map(parsed.map((id): [string, null] => [String(id), null]))
    if (parsed && typeof parsed === 'object') {
      return new Map(Object.entries(parsed).map(([id, at]): [string, string | null] => [id, typeof at === 'string' ? at : null]))
    }
    return new Map()
  } catch {
    return new Map()
  }
}

/** Favorited entry ids for one bank, local to this browser. */
export function getFavoriteIds(bankKey: string): Set<string> {
  return new Set(getFavorites(bankKey).keys())
}

function saveFavorites(bankKey: string, favorites: Map<string, string | null>) {
  try {
    localStorage.setItem(storageKey(bankKey), JSON.stringify(Object.fromEntries(favorites)))
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — silently skip persistence
  }
}

/** Toggles one entry's favorite status (stamping the current time when it's added) and returns the updated favorites for that bank. */
export function toggleFavorite(bankKey: string, id: string, current: FavoriteMap = getFavorites(bankKey)): Map<string, string | null> {
  const next = new Map(current)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.set(id, new Date().toISOString())
  }
  saveFavorites(bankKey, next)
  return next
}

/** True if the entry is a favourite that was added within the last `days` days; `null` means no recency limit. */
export function isFavoritedWithin(favorites: FavoriteMap, id: string, days: number | null): boolean {
  if (!favorites.has(id)) return false
  if (days === null) return true
  const at = favorites.get(id)
  return !!at && Date.now() - new Date(at).getTime() <= days * DAY_MS
}

/** "Today", "Yesterday", or a short date — for showing when an entry was favorited. */
export function formatFavoritedDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const daysAgo = Math.round((startOfDay(new Date()) - startOfDay(date)) / DAY_MS)
  if (daysAgo === 0) return 'today'
  if (daysAgo === 1) return 'yesterday'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
