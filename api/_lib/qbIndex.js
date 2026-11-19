// The list of questions people have added, kept in one Redis hash (qb:index: question id -> a short JSON "index entry").
// An entry holds only what the question table needs plus the question's similarity fingerprint (n, w), so one
// HGETALL gives both the list and what the duplicate check needs. The full question lives in Firestore; if this hash is
// ever lost it can be rebuilt from there.

import { redisPipeline, toMap } from './redis.js'
import { SimilarIndex } from './qbSimilar.js'

export const INDEX_KEY = 'qb:index'
/** Added questions the list can carry for now. The whole list is sent in one response, so it is capped. */
export const MAX_USER_QUESTIONS = 6000

/** One line for the question table: the stem on a single line, without a leading instruction line like "…give answer:". */
export function previewOf(stem) {
  let lines = String(stem).split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length > 1 && /[:?.]$/.test(lines[0]) && !/\d/.test(lines[0])) lines = lines.slice(1)
  const flat = lines.join('  ·  ')
  return flat.length > 110 ? `${flat.slice(0, 107).trimEnd()}…` : flat
}

/** The index entry for a stored question (the same fields the static launch index has, plus the fingerprint). */
export function indexEntryFor(question, sig) {
  return {
    id: question.id,
    topic: question.topic,
    difficulty: question.difficulty,
    examName: question.examName,
    examType: question.examType,
    year: question.year,
    source: question.source,
    trust: question.trust,
    preview: previewOf(question.stem),
    createdAt: question.createdAt,
    n: sig.n,
    w: sig.w,
  }
}

/** What browsers get: the entry without the fingerprint. */
export function publicEntry(entry) {
  const { n: _n, w: _w, ...rest } = entry
  return rest
}

/** All added questions' entries, oldest first. Entries that cannot be read are skipped. */
export async function loadUserEntries() {
  const [reply] = await redisPipeline([['HGETALL', INDEX_KEY]])
  const entries = []
  for (const [id, json] of toMap(reply)) {
    try {
      const e = JSON.parse(json)
      if (e && e.id === id && typeof e.n === 'string' && typeof e.w === 'string') entries.push(e)
    } catch {
      /* skip */
    }
  }
  return entries.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id))
}

/** The added questions as something the duplicate check can use: has(id), similar.find(sig), size. */
export async function loadUserLookup() {
  const entries = await loadUserEntries()
  const ids = new Set(entries.map((e) => e.id))
  const similar = new SimilarIndex()
  for (const e of entries) similar.add(e.id, { n: e.n, w: e.w })
  return { has: (id) => ids.has(id), similar, size: entries.length }
}

export async function putIndexEntry(entry) {
  await redisPipeline([['HSET', INDEX_KEY, entry.id, JSON.stringify(entry)]])
}

/** Takes a question out of the list (nothing happens if it is not there). */
export async function removeIndexEntry(id) {
  await redisPipeline([['HDEL', INDEX_KEY, id]])
}
