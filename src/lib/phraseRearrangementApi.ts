export type PhraseGenre = 'editorial' | 'news' | 'generalKnowledge' | 'scienceNature' | 'biography' | 'fiction' | 'poetry' | 'mixed'
export type PhraseDifficulty = 'medium' | 'hard'

export interface PhraseSentenceSeed {
  topic: string
  parts: string[]
}

const CONCRETE_GENRES: Exclude<PhraseGenre, 'mixed'>[] = [
  'editorial',
  'news',
  'generalKnowledge',
  'scienceNature',
  'biography',
  'fiction',
  'poetry',
]

// Asking Gemini for many structured sentences in one call risks running past Vercel's default
// serverless timeout; splitting into small batches keeps each call fast. Hard sentences are much
// longer, so each hard batch asks for fewer of them to keep generation time comparable.
const BATCH_SIZE: Record<PhraseDifficulty, number> = { medium: 6, hard: 4 }
const BATCH_TIMEOUT_MS = 10000

// Every batch call races 2 Gemini models (see api/phraseRearrangement.js), so firing every batch
// at once for a large question count could mean a dozen-plus simultaneous Gemini requests —
// enough to trip the free-tier rate limit and fail the whole session. Capping how many batches
// are ever in flight at once keeps total API load bounded regardless of question count.
const MAX_CONCURRENT_BATCHES = 3
const RETRY_DELAY_MS = 800

function pickGenre(genre: PhraseGenre): Exclude<PhraseGenre, 'mixed'> {
  if (genre !== 'mixed') return genre
  return CONCRETE_GENRES[Math.floor(Math.random() * CONCRETE_GENRES.length)]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchBatch(genre: Exclude<PhraseGenre, 'mixed'>, difficulty: PhraseDifficulty, count: number): Promise<PhraseSentenceSeed[]> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), BATCH_TIMEOUT_MS)
  try {
    const res = await fetch(`/api/phraseRearrangement?genre=${genre}&difficulty=${difficulty}&count=${count}`, {
      signal: controller.signal,
    })
    if (!res.ok) return []
    const data = await res.json()
    const sentences = Array.isArray(data.sentences) ? data.sentences : []
    return sentences.filter(
      (s: unknown): s is PhraseSentenceSeed =>
        !!s &&
        typeof (s as PhraseSentenceSeed).topic === 'string' &&
        Array.isArray((s as PhraseSentenceSeed).parts) &&
        (s as PhraseSentenceSeed).parts.length === 5 &&
        (s as PhraseSentenceSeed).parts.every((p) => typeof p === 'string' && p.trim() !== ''),
    )
  } catch {
    return []
  } finally {
    clearTimeout(timeoutId)
  }
}

/** A transient rate-limit or timeout is common enough under load that one retry meaningfully improves success rate. */
async function fetchBatchWithRetry(genre: Exclude<PhraseGenre, 'mixed'>, difficulty: PhraseDifficulty, count: number): Promise<PhraseSentenceSeed[]> {
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

/** Fetches `totalCount` sentences across capped-concurrency batches. May return fewer than requested if some batches fail even after a retry. */
export async function fetchPhraseSentences(genre: PhraseGenre, difficulty: PhraseDifficulty, totalCount: number): Promise<PhraseSentenceSeed[]> {
  const batchSize = BATCH_SIZE[difficulty]
  const tasks: (() => Promise<PhraseSentenceSeed[]>)[] = []
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
