import { SEED_BASE_URL, SEED_INDEX_URL } from './types'
import type { BankTopicId, QuantQuestion, QuestionIndexEntry } from './types'

/**
 * Loads the question bank. The index (one short row per question) is loaded once and is all the table needs; the
 * full text, options and solution of a topic load only when someone opens a question from it. The launch questions are
 * plain static files (CDN, no database reads). Questions people have added come from the server (/api/qb) and join the same
 * list and the same play screen, so nothing else has to know where a question came from.
 */

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load the question bank (${res.status}).`)
  // A missing file can come back as the app's own HTML page; treat that as a failure, not as data.
  if (!(res.headers.get('content-type') || '').includes('json')) throw new Error('Could not load the question bank (unexpected response).')
  return (await res.json()) as T
}

/** When this browser last added a question: for a few minutes afterwards the list is fetched fresh, so your own question shows up at once. */
const ADDED_AT_KEY = 'prepbuddy:qbank:addedAt'
const FRESH_AFTER_ADD_MS = 3 * 60_000

function addedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(ADDED_AT_KEY) || 0)
    return at > 0 && Date.now() - at < FRESH_AFTER_ADD_MS
  } catch {
    return false
  }
}

const isEntry = (e: unknown): e is QuestionIndexEntry => !!e && typeof e === 'object' && typeof (e as QuestionIndexEntry).id === 'string' && typeof (e as QuestionIndexEntry).preview === 'string'

/** Questions people have added. A failure is not fatal: the launch questions still work without them. */
async function loadAddedEntries(): Promise<QuestionIndexEntry[]> {
  try {
    const bust = addedRecently() ? `&t=${Date.now()}` : ''
    const body = await fetchJson<{ entries?: unknown }>(`/api/qb?action=index${bust}`)
    return Array.isArray(body.entries) ? body.entries.filter(isEntry) : []
  } catch {
    return []
  }
}

let indexLoad: Promise<QuestionIndexEntry[]> | null = null
const topicLoads = new Map<BankTopicId, Promise<Map<string, QuantQuestion>>>()
const addedLoads = new Map<string, Promise<QuantQuestion | null>>()

/** Every question's tags and preview line: the launch questions, then the added ones (oldest first, so numbers stay put). */
export function loadIndex(): Promise<QuestionIndexEntry[]> {
  if (!indexLoad) {
    indexLoad = Promise.all([fetchJson<QuestionIndexEntry[]>(SEED_INDEX_URL), loadAddedEntries()]).then(([seed, added]) => {
      const known = new Set(seed.map((e) => e.id))
      return [...seed, ...added.filter((e) => !known.has(e.id))]
    })
    indexLoad.catch(() => {
      indexLoad = null
    })
  }
  return indexLoad
}

function loadTopic(topic: BankTopicId): Promise<Map<string, QuantQuestion>> {
  let load = topicLoads.get(topic)
  if (!load) {
    load = fetchJson<QuantQuestion[]>(`${SEED_BASE_URL}/${topic}.json`).then((list) => new Map(list.map((q) => [q.id, q])))
    topicLoads.set(topic, load)
    load.catch(() => topicLoads.delete(topic))
  }
  return load
}

function loadAddedQuestion(id: string): Promise<QuantQuestion | null> {
  let load = addedLoads.get(id)
  if (!load) {
    load = fetch(`/api/qb?action=question&id=${encodeURIComponent(id)}`).then(async (res) => {
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`Could not load the question (${res.status}).`)
      return (await res.json()) as QuantQuestion
    })
    addedLoads.set(id, load)
    load.catch(() => addedLoads.delete(id))
  }
  return load
}

/** The full question for an index row, or null if it is not in the bank any more. */
export async function loadQuestion(entry: Pick<QuestionIndexEntry, 'id' | 'topic' | 'source'>): Promise<QuantQuestion | null> {
  if (entry.source === 'user') return loadAddedQuestion(entry.id)
  const topic = await loadTopic(entry.topic)
  return topic.get(entry.id) ?? null
}

/** How many added questions are fetched from the server at the same time when many are needed at once. */
const BATCH_CONCURRENCY = 6

/**
 * The full questions for a list of index rows, in the same order (for the PDF export). Launch questions come from their
 * topic files (one download per topic, shared with playing); added ones are fetched a few at a time. A question that cannot
 * be loaded is left out and counted in `missing`, so one bad one does not spoil the rest.
 */
export async function loadQuestions(entries: Pick<QuestionIndexEntry, 'id' | 'topic' | 'source'>[]): Promise<{ questions: QuantQuestion[]; missing: number }> {
  const found = new Map<string, QuantQuestion>()
  const launch = entries.filter((e) => e.source !== 'user')
  const added = entries.filter((e) => e.source === 'user')

  await Promise.all(
    [...new Set(launch.map((e) => e.topic))].map(async (topic) => {
      const list = await loadTopic(topic).catch(() => null)
      if (list) for (const e of launch) if (e.topic === topic) {
        const q = list.get(e.id)
        if (q) found.set(e.id, q)
      }
    }),
  )

  let next = 0
  const worker = async () => {
    while (next < added.length) {
      const entry = added[next++]
      const q = await loadAddedQuestion(entry.id).catch(() => null)
      if (q) found.set(entry.id, q)
    }
  }
  await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, added.length) }, worker))

  const questions = entries.map((e) => found.get(e.id)).filter((q): q is QuantQuestion => !!q)
  return { questions, missing: entries.length - questions.length }
}

/** Warms the next question's data in the background so "Next" feels instant. Failures are ignored. */
export function preloadQuestionData(entry: Pick<QuestionIndexEntry, 'id' | 'topic' | 'source'>): void {
  if (entry.source === 'user') loadAddedQuestion(entry.id).catch(() => {})
  else loadTopic(entry.topic).catch(() => {})
}

/** Takes a deleted question out of the loaded list and the question cache; the list is fetched fresh for a few minutes. */
export function forgetQuestion(id: string): void {
  addedLoads.delete(id)
  try {
    localStorage.setItem(ADDED_AT_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
  if (indexLoad) {
    const without = indexLoad.then((list) => list.filter((e) => e.id !== id))
    indexLoad = without
    without.catch(() => {
      indexLoad = null
    })
  }
}

/** Puts a question this person has just added into the loaded list and the question cache, so it can be opened straight away. */
export function rememberAddedQuestion(entry: QuestionIndexEntry, question: QuantQuestion): void {
  addedLoads.set(question.id, Promise.resolve(question))
  try {
    localStorage.setItem(ADDED_AT_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
  // chained on the list that is loading (or loaded), so anyone who asks for the list from now on gets it with this question in
  const withEntry = loadIndex().then((list) => (list.some((e) => e.id === entry.id) ? list : [...list, entry]))
  indexLoad = withEntry
  withEntry.catch(() => {
    indexLoad = null
  })
}
