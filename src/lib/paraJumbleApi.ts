export type ParaJumbleGenre = 'editorial' | 'news' | 'generalKnowledge' | 'scienceNature' | 'biography' | 'fiction' | 'poetry' | 'mixed'
export type ParaJumbleDifficulty = 'medium' | 'hard'

export interface ParaJumbleRawParagraph {
  topic: string
  /** The sentences in their CORRECT order. */
  sentences: string[]
  explanation: string
}

const CONCRETE_GENRES: Exclude<ParaJumbleGenre, 'mixed'>[] = [
  'editorial',
  'news',
  'generalKnowledge',
  'scienceNature',
  'biography',
  'fiction',
  'poetry',
]

const SENTENCES_BY_DIFFICULTY: Record<ParaJumbleDifficulty, number> = { medium: 5, hard: 6 }

// Mirrors the other English games' fetchers (small batches, capped concurrency, one retry), but
// a whole paragraph plus explanation is a heavy generation, so each call asks for only a few.
const BATCH_SIZE: Record<ParaJumbleDifficulty, number> = { medium: 3, hard: 2 }
const BATCH_TIMEOUT_MS = 10000
const MAX_CONCURRENT_BATCHES = 3
const RETRY_DELAY_MS = 800

function pickGenre(genre: ParaJumbleGenre): Exclude<ParaJumbleGenre, 'mixed'> {
  if (genre !== 'mixed') return genre
  return CONCRETE_GENRES[Math.floor(Math.random() * CONCRETE_GENRES.length)]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isValidParagraph(p: unknown, sentenceCount: number): p is ParaJumbleRawParagraph {
  if (!p || typeof p !== 'object') return false
  const r = p as ParaJumbleRawParagraph
  if (typeof r.topic !== 'string' || typeof r.explanation !== 'string') return false
  if (!Array.isArray(r.sentences) || r.sentences.length !== sentenceCount) return false
  return r.sentences.every((s) => typeof s === 'string' && s.trim() !== '')
}

async function fetchBatch(
  genre: Exclude<ParaJumbleGenre, 'mixed'>,
  difficulty: ParaJumbleDifficulty,
  count: number,
): Promise<ParaJumbleRawParagraph[]> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), BATCH_TIMEOUT_MS)
  try {
    const res = await fetch(`/api/paraJumble?genre=${genre}&difficulty=${difficulty}&count=${count}`, { signal: controller.signal })
    if (!res.ok) return []
    const data = await res.json()
    const paragraphs = Array.isArray(data.paragraphs) ? data.paragraphs : []
    return paragraphs.filter((p: unknown) => isValidParagraph(p, SENTENCES_BY_DIFFICULTY[difficulty]))
  } catch {
    return []
  } finally {
    clearTimeout(timeoutId)
  }
}

/** A transient rate-limit or timeout is common enough under load that one retry meaningfully improves success rate. */
async function fetchBatchWithRetry(
  genre: Exclude<ParaJumbleGenre, 'mixed'>,
  difficulty: ParaJumbleDifficulty,
  count: number,
): Promise<ParaJumbleRawParagraph[]> {
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

/** Fetches `totalCount` paragraphs across capped-concurrency batches. May return fewer than requested if some batches fail even after a retry. */
export async function fetchParaJumbleParagraphs(
  genre: ParaJumbleGenre,
  difficulty: ParaJumbleDifficulty,
  totalCount: number,
): Promise<ParaJumbleRawParagraph[]> {
  const batchSize = BATCH_SIZE[difficulty]
  const tasks: (() => Promise<ParaJumbleRawParagraph[]>)[] = []
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
