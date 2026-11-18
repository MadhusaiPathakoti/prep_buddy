import { SEED_BASE_URL, SEED_INDEX_URL } from './types'
import type { BankTopicId, QuantQuestion, QuestionIndexEntry } from './types'

/**
 * Loads the question bank. The index (one short row per question) is loaded once and is all the table needs; the
 * full text, options and solution of a topic load only when someone opens a question from it. Both are plain static
 * files, so they are served from the CDN with no database reads. Questions added by people will join the same lists
 * later, behind these same two functions.
 */

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load the question bank (${res.status}).`)
  // A missing file can come back as the app's own HTML page; treat that as a failure, not as data.
  if (!(res.headers.get('content-type') || '').includes('json')) throw new Error('Could not load the question bank (unexpected response).')
  return (await res.json()) as T
}

let indexLoad: Promise<QuestionIndexEntry[]> | null = null
const topicLoads = new Map<BankTopicId, Promise<Map<string, QuantQuestion>>>()

/** Every question's tags and preview line. Loaded once; a failed load is forgotten so "Try again" really retries. */
export function loadIndex(): Promise<QuestionIndexEntry[]> {
  if (!indexLoad) {
    indexLoad = fetchJson<QuestionIndexEntry[]>(SEED_INDEX_URL)
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

/** The full question for an index row, or null if it is not in the bank any more. */
export async function loadQuestion(entry: Pick<QuestionIndexEntry, 'id' | 'topic'>): Promise<QuantQuestion | null> {
  const topic = await loadTopic(entry.topic)
  return topic.get(entry.id) ?? null
}

/** Warms the next question's topic file in the background so "Next" feels instant. Failures are ignored. */
export function preloadTopic(topic: BankTopicId): void {
  loadTopic(topic).catch(() => {})
}
