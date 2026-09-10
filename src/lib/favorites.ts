const STORAGE_PREFIX = 'prepbuddy:favorites:'

function storageKey(bankKey: string): string {
  return `${STORAGE_PREFIX}${bankKey}`
}

/** Favorited entry ids for one bank (vocabulary, idioms, ...), local to this browser. */
export function getFavoriteIds(bankKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(bankKey))
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

function saveFavoriteIds(bankKey: string, ids: Set<string>) {
  try {
    localStorage.setItem(storageKey(bankKey), JSON.stringify([...ids]))
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — silently skip persistence
  }
}

/** Toggles one entry's favorite status and returns the updated set for that bank. */
export function toggleFavorite(bankKey: string, id: string, current: Set<string>): Set<string> {
  const next = new Set(current)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  saveFavoriteIds(bankKey, next)
  return next
}
