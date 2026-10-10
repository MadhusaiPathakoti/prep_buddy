export type FillersGenre = 'editorial' | 'news' | 'generalKnowledge' | 'scienceNature' | 'biography' | 'fiction' | 'poetry' | 'mixed'
export type FillersDifficulty = 'medium' | 'hard'

export interface FillersRawQuestion {
  topic: string
  sentence: string
  options: string[]
  correctIndices: number[]
}

const CONCRETE_GENRES: Exclude<FillersGenre, 'mixed'>[] = [
  'editorial',
  'news',
  'generalKnowledge',
  'scienceNature',
  'biography',
  'fiction',
  'poetry',
]

// Mirrors src/lib/phraseRearrangementApi.ts: small batches (so each Gemini call stays fast)
// fired at a capped concurrency (so a big session doesn't trip Gemini's rate limit), with one
// retry per batch to recover from a transient failure.
const BATCH_SIZE: Record<FillersDifficulty, number> = { medium: 6, hard: 4 }
const BATCH_TIMEOUT_MS = 10000
const MAX_CONCURRENT_BATCHES = 3
const RETRY_DELAY_MS = 800

function pickGenre(genre: FillersGenre): Exclude<FillersGenre, 'mixed'> {
  if (genre !== 'mixed') return genre
  return CONCRETE_GENRES[Math.floor(Math.random() * CONCRETE_GENRES.length)]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchBatch(genre: Exclude<FillersGenre, 'mixed'>, difficulty: FillersDifficulty, count: number): Promise<FillersRawQuestion[]> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), BATCH_TIMEOUT_MS)
  try {
    const res = await fetch(`/api/fillers?genre=${genre}&difficulty=${difficulty}&count=${count}`, { signal: controller.signal })
    if (!res.ok) return []
    const data = await res.json()
    const questions = Array.isArray(data.questions) ? data.questions : []
    return questions.filter(
      (q: unknown): q is FillersRawQuestion =>
        !!q &&
        typeof (q as FillersRawQuestion).topic === 'string' &&
        typeof (q as FillersRawQuestion).sentence === 'string' &&
        Array.isArray((q as FillersRawQuestion).options) &&
        (q as FillersRawQuestion).options.length === 3 &&
        (q as FillersRawQuestion).options.every((o) => typeof o === 'string' && o.trim() !== '') &&
        Array.isArray((q as FillersRawQuestion).correctIndices),
    )
  } catch {
    return []
  } finally {
    clearTimeout(timeoutId)
  }
}

/** A transient rate-limit or timeout is common enough under load that one retry meaningfully improves success rate. */
async function fetchBatchWithRetry(genre: Exclude<FillersGenre, 'mixed'>, difficulty: FillersDifficulty, count: number): Promise<FillersRawQuestion[]> {
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
export async function fetchFillersQuestions(genre: FillersGenre, difficulty: FillersDifficulty, totalCount: number): Promise<FillersRawQuestion[]> {
  const batchSize = BATCH_SIZE[difficulty]
  const tasks: (() => Promise<FillersRawQuestion[]>)[] = []
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
