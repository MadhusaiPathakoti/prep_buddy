// "Learn today" for a word bank: each day the player is given a few RANDOM words picked from the words they have not
// learned yet (so a few weeks cover the whole A–Z range instead of working through the alphabet in order), and a word only
// counts as learned once the player marks it. One store per bank (`createLearnStore('mnemonic')`, `createLearnStore('hindu')`).

export const DAILY_SIZES = [5, 10, 15, 20]
const DEFAULT_DAILY_SIZE = 10

export interface LearnProgress {
  /** How many new words make up a day's set. */
  size: number
  /** Word number -> ISO time the player marked it learned. */
  learned: Record<string, string>
}

interface TodaySet {
  date: string
  ids: number[]
}

/** The local calendar date, e.g. "2026-11-20" — a new "day" starts at the user's midnight. */
export function localDateKey(d = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** `count` distinct ids chosen uniformly at random from `ids` that are not in `learned` (fewer if not enough are left). */
export function pickRandomUnlearned(ids: readonly number[], learned: Record<string, string>, count: number): number[] {
  const pool = ids.filter((n) => !learned[n])
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, Math.max(0, count))
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — silently skip persistence
  }
}

export interface LearnStore {
  getProgress(): LearnProgress
  setDailySize(size: number): LearnProgress
  /** Marks a word learned (keeps the original time if it already was). */
  markLearned(n: number): LearnProgress
  /** Takes a word back out of "learned" (e.g. a mis-tap, or it needs another look). */
  unmarkLearned(n: number): LearnProgress
  /** How many words were marked learned on the given local date. */
  learnedOn(progress: LearnProgress, dateKey?: string): number
  /** Today's words: the same set all day (so a reload doesn't change it), a fresh random set on a new day. */
  getTodaySet(allIds: readonly number[], progress?: LearnProgress): number[]
  /** Replaces today's set with `size` new random unlearned words and remembers it. */
  buildTodaySet(allIds: readonly number[], progress: LearnProgress, size: number): number[]
}

export function createLearnStore(prefix: string): LearnStore {
  const PROGRESS_KEY = `prepbuddy:${prefix}:learn`
  const TODAY_KEY = `prepbuddy:${prefix}:learn-today`

  function getProgress(): LearnProgress {
    const raw = readJson<Partial<LearnProgress>>(PROGRESS_KEY, {})
    const size = DAILY_SIZES.includes(Number(raw.size)) ? Number(raw.size) : DEFAULT_DAILY_SIZE
    const learned = raw.learned && typeof raw.learned === 'object' ? raw.learned : {}
    return { size, learned }
  }

  function save(p: LearnProgress): LearnProgress {
    writeJson(PROGRESS_KEY, p)
    return p
  }

  function buildTodaySet(allIds: readonly number[], progress: LearnProgress, size: number): number[] {
    const ids = pickRandomUnlearned(allIds, progress.learned, size)
    writeJson(TODAY_KEY, { date: localDateKey(), ids } satisfies TodaySet)
    return ids
  }

  return {
    getProgress,
    setDailySize: (size) => save({ ...getProgress(), size }),
    markLearned(n) {
      const p = getProgress()
      if (p.learned[n]) return p
      return save({ ...p, learned: { ...p.learned, [n]: new Date().toISOString() } })
    },
    unmarkLearned(n) {
      const p = getProgress()
      if (!p.learned[n]) return p
      const learned = { ...p.learned }
      delete learned[n]
      return save({ ...p, learned })
    },
    learnedOn: (progress, dateKey = localDateKey()) => Object.values(progress.learned).filter((iso) => localDateKey(new Date(iso)) === dateKey).length,
    getTodaySet(allIds, progress = getProgress()) {
      const stored = readJson<TodaySet | null>(TODAY_KEY, null)
      if (stored && stored.date === localDateKey() && Array.isArray(stored.ids) && stored.ids.length > 0) {
        const valid = new Set(allIds)
        const ids = stored.ids.filter((n) => valid.has(n))
        if (ids.length > 0) return ids
      }
      return buildTodaySet(allIds, progress, progress.size)
    },
    buildTodaySet,
  }
}
