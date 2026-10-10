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
// serverless timeout; splitting into small batches fired in parallel keeps each call fast while
// still scaling total question count through parallelism rather than serial wait time.
const BATCH_SIZE = 4
const BATCH_TIMEOUT_MS = 9000

function pickGenre(genre: PhraseGenre): Exclude<PhraseGenre, 'mixed'> {
  if (genre !== 'mixed') return genre
  return CONCRETE_GENRES[Math.floor(Math.random() * CONCRETE_GENRES.length)]
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

/** Fetches `totalCount` sentences across parallel batches. May return fewer than requested if some batches fail. */
export async function fetchPhraseSentences(genre: PhraseGenre, difficulty: PhraseDifficulty, totalCount: number): Promise<PhraseSentenceSeed[]> {
  const batches: Promise<PhraseSentenceSeed[]>[] = []
  let remaining = totalCount
  while (remaining > 0) {
    const size = Math.min(BATCH_SIZE, remaining)
    batches.push(fetchBatch(pickGenre(genre), difficulty, size))
    remaining -= size
  }
  const results = await Promise.all(batches)
  return results.flat()
}
