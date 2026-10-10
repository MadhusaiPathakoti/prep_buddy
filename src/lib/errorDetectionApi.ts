export type ErrorDetectionGenre = 'editorial' | 'news' | 'generalKnowledge' | 'scienceNature' | 'biography' | 'fiction' | 'poetry' | 'mixed'
export type ErrorDetectionDifficulty = 'medium' | 'hard'

export interface ErrorDetectionRawQuestion {
  topic: string
  parts: string[]
  errorPartIndex: number | null
  explanation: string
}

const CONCRETE_GENRES: Exclude<ErrorDetectionGenre, 'mixed'>[] = [
  'editorial',
  'news',
  'generalKnowledge',
  'scienceNature',
  'biography',
  'fiction',
  'poetry',
]

// Mirrors src/lib/phraseRearrangementApi.ts and src/lib/fillersApi.ts: small batches (so each
// Gemini call stays fast) fired at a capped concurrency (so a big session doesn't trip Gemini's
// rate limit), with one retry per batch to recover from a transient failure.
const BATCH_SIZE: Record<ErrorDetectionDifficulty, number> = { medium: 6, hard: 4 }
const BATCH_TIMEOUT_MS = 10000
const MAX_CONCURRENT_BATCHES = 3
const RETRY_DELAY_MS = 800

function pickGenre(genre: ErrorDetectionGenre): Exclude<ErrorDetectionGenre, 'mixed'> {
  if (genre !== 'mixed') return genre
  return CONCRETE_GENRES[Math.floor(Math.random() * CONCRETE_GENRES.length)]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isValidRaw(q: unknown): q is ErrorDetectionRawQuestion {
  if (!q || typeof q !== 'object') return false
  const r = q as ErrorDetectionRawQuestion
  if (typeof r.topic !== 'string' || typeof r.explanation !== 'string') return false
  if (!Array.isArray(r.parts) || r.parts.length !== 4) return false
  if (!r.parts.every((p) => typeof p === 'string' && p.trim() !== '')) return false
  if (r.errorPartIndex !== null && !(Number.isInteger(r.errorPartIndex) && r.errorPartIndex >= 0 && r.errorPartIndex <= 3)) return false
  return true
}

async function fetchBatch(
  genre: Exclude<ErrorDetectionGenre, 'mixed'>,
  difficulty: ErrorDetectionDifficulty,
  count: number,
): Promise<ErrorDetectionRawQuestion[]> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), BATCH_TIMEOUT_MS)
  try {
    const res = await fetch(`/api/errorDetection?genre=${genre}&difficulty=${difficulty}&count=${count}`, { signal: controller.signal })
    if (!res.ok) return []
    const data = await res.json()
    const questions = Array.isArray(data.questions) ? data.questions : []
    return questions.filter(isValidRaw)
  } catch {
    return []
  } finally {
    clearTimeout(timeoutId)
  }
}

/** A transient rate-limit or timeout is common enough under load that one retry meaningfully improves success rate. */
async function fetchBatchWithRetry(
  genre: Exclude<ErrorDetectionGenre, 'mixed'>,
  difficulty: ErrorDetectionDifficulty,
  count: number,
): Promise<ErrorDetectionRawQuestion[]> {
  const first = await fetchBatch(genre, difficulty, count)
  if (first.length > 0) return first
  await sleep(RETRY_DELAY_MS)
  return fetchBatch(genre, difficulty, count)
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

/** Fetches `totalCount` questions across capped-concurrency batches. May return fewer than requested if some batches fail even after a retry. */
export async function fetchErrorDetectionQuestions(
  genre: ErrorDetectionGenre,
  difficulty: ErrorDetectionDifficulty,
  totalCount: number,
): Promise<ErrorDetectionRawQuestion[]> {
  const batchSize = BATCH_SIZE[difficulty]
  const tasks: (() => Promise<ErrorDetectionRawQuestion[]>)[] = []
  let remaining = totalCount
  while (remaining > 0) {
    const size = Math.min(batchSize, remaining)
    const batchGenre = pickGenre(genre)
    tasks.push(() => fetchBatchWithRetry(batchGenre, difficulty, size))
    remaining -= size
  }
  const results = await runWithConcurrencyLimit(tasks, MAX_CONCURRENT_BATCHES)
  return results.flat()
}
