export type ClozeGenre = 'editorial' | 'news' | 'generalKnowledge' | 'scienceNature' | 'biography' | 'fiction' | 'poetry' | 'mixed'
export type ClozeDifficulty = 'medium' | 'hard'

export interface ClozeRawBlank {
  options: string[]
  correctIndex: number
  explanation: string
}

export interface ClozeRawPassage {
  topic: string
  paragraph: string
  blanks: ClozeRawBlank[]
}

const CONCRETE_GENRES: Exclude<ClozeGenre, 'mixed'>[] = [
  'editorial',
  'news',
  'generalKnowledge',
  'scienceNature',
  'biography',
  'fiction',
  'poetry',
]

// Each call generates one full passage (6-7 blanks), a heavier task than the other English
// games' independent sentences — mirrors their concurrency-cap + retry reliability pattern, but
// "batch size" here is just "one passage per call" since blanks within a passage can't be split.
const BLANK_COUNT_BY_DIFFICULTY: Record<ClozeDifficulty, number> = { medium: 6, hard: 7 }
const FETCH_TIMEOUT_MS = 10000
const MAX_CONCURRENT_REQUESTS = 3
const RETRY_DELAY_MS = 800

function pickGenre(genre: ClozeGenre): Exclude<ClozeGenre, 'mixed'> {
  if (genre !== 'mixed') return genre
  return CONCRETE_GENRES[Math.floor(Math.random() * CONCRETE_GENRES.length)]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isValidRawPassage(p: unknown): p is ClozeRawPassage {
  if (!p || typeof p !== 'object') return false
  const r = p as ClozeRawPassage
  if (typeof r.topic !== 'string' || typeof r.paragraph !== 'string') return false
  if (!Array.isArray(r.blanks) || r.blanks.length === 0) return false
  return r.blanks.every(
    (b) =>
      b &&
      Array.isArray(b.options) &&
      b.options.length === 5 &&
      b.options.every((o) => typeof o === 'string' && o.trim() !== '') &&
      Number.isInteger(b.correctIndex) &&
      typeof b.explanation === 'string',
  )
}

async function fetchPassage(genre: Exclude<ClozeGenre, 'mixed'>, difficulty: ClozeDifficulty): Promise<ClozeRawPassage | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`/api/clozeTest?genre=${genre}&difficulty=${difficulty}`, { signal: controller.signal })
    if (!res.ok) return null
    const data = await res.json()
    return isValidRawPassage(data.passage) ? data.passage : null
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

/** A transient rate-limit or timeout is common enough under load that one retry meaningfully improves success rate. */
async function fetchPassageWithRetry(genre: Exclude<ClozeGenre, 'mixed'>, difficulty: ClozeDifficulty): Promise<ClozeRawPassage | null> {
  const first = await fetchPassage(genre, difficulty)
  if (first) return first
  await sleep(RETRY_DELAY_MS)
  return fetchPassage(genre, difficulty)
}

async function runWithConcurrencyLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < tasks.length) {
      const current = nextIndex
      nextIndex += 1
      results[current] = await tasks[current]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return results
}

/** Fetches enough whole passages to cover `totalBlanksWanted` blanks. May return fewer blanks than requested if some passages fail even after a retry. */
export async function fetchClozePassages(genre: ClozeGenre, difficulty: ClozeDifficulty, totalBlanksWanted: number): Promise<ClozeRawPassage[]> {
  const blanksPerPassage = BLANK_COUNT_BY_DIFFICULTY[difficulty]
  const passagesNeeded = Math.max(1, Math.ceil(totalBlanksWanted / blanksPerPassage))
  const tasks = Array.from({ length: passagesNeeded }, () => () => fetchPassageWithRetry(pickGenre(genre), difficulty))
  const results = await runWithConcurrencyLimit(tasks, MAX_CONCURRENT_REQUESTS)
  return results.filter((p): p is ClozeRawPassage => p !== null)
}
