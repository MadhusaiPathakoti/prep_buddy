import { collection, deleteDoc, doc, getCountFromServer, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { Difficulty } from './types'

const REQUEST_TIMEOUT_MS = 5000
const API_TIMEOUT_MS = 4000

/**
 * Firestore can hang rather than reject when it's unreachable (bad config, network down,
 * the WebChannel connection blocked by a firewall/extension) instead of failing fast, which
 * would otherwise leave the UI stuck on a loading state forever. This guarantees every
 * request eventually settles one way or the other.
 */
function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), REQUEST_TIMEOUT_MS)),
  ])
}

/** How long a loaded collection is reused in memory before it is fetched again. */
const CACHE_TTL_MS = 5 * 60 * 1000

/** After this visitor edits a bank, skip the CDN copy for this long so they see their own change straight away. */
const FRESH_AFTER_WRITE_MS = 10 * 60 * 1000

/** More than enough distinct custom entries to draw a good random quiz sample from, regardless of how large the pool eventually grows — see getFullBankCapped. */
const QUIZ_POOL_CAP = 1000

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

/** The result of a bank load. `degraded` is set when some shared data could not be loaded and the built-in entries are being shown without it. */
export type BankResult<T> = T[] & { degraded?: boolean }

const markDegraded = <T,>(items: T[], degraded: boolean): BankResult<T> => {
  const result = items as BankResult<T>
  if (degraded) result.degraded = true
  return result
}

interface RawDoc {
  id: string
  data: Record<string, unknown>
}

const writeStampKey = (name: string) => `prepbuddy:bankWrite:${name}`
const recentlyWritten = (name: string): boolean => {
  try {
    const at = Number(localStorage.getItem(writeStampKey(name)) || 0)
    return at > 0 && Date.now() - at < FRESH_AFTER_WRITE_MS
  } catch {
    return false
  }
}
const stampWrite = (name: string) => {
  try {
    localStorage.setItem(writeStampKey(name), String(Date.now()))
  } catch {
    /* storage unavailable: the CDN copy may lag this visitor's own edit by a while — harmless */
  }
}

/**
 * Reads every document of a collection. The normal route is the CDN-cached `/api/bank` function (one server read
 * serves every visitor for an hour, so Firestore reads no longer grow with traffic); if that is unavailable —
 * local dev has no /api, or the function is down — it falls back to reading Firestore directly.
 */
async function fetchDocs(name: string): Promise<RawDoc[]> {
  try {
    const bust = recentlyWritten(name) ? `&t=${Date.now()}` : ''
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
    try {
      const res = await fetch(`/api/bank?collection=${encodeURIComponent(name)}${bust}`, { signal: controller.signal })
      if (res.ok && (res.headers.get('content-type') || '').includes('json')) {
        const body = (await res.json()) as { docs?: RawDoc[] }
        if (Array.isArray(body.docs)) return body.docs
      }
    } finally {
      clearTimeout(timer)
    }
  } catch {
    /* fall through to the direct read */
  }
  const snapshot = await withTimeout(getDocs(collection(db, name)), 'Timed out loading shared entries.')
  return snapshot.docs.map((d) => ({ id: d.id, data: d.data() }))
}

async function fetchCount(name: string): Promise<number> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
    try {
      const res = await fetch(`/api/bank?collection=${encodeURIComponent(name)}&mode=count`, { signal: controller.signal })
      if (res.ok && (res.headers.get('content-type') || '').includes('json')) {
        const body = (await res.json()) as { count?: number }
        if (typeof body.count === 'number') return body.count
      }
    } finally {
      clearTimeout(timer)
    }
  } catch {
    /* fall through to the direct count */
  }
  const snap = await withTimeout(getCountFromServer(collection(db, name)), 'Timed out counting shared entries.')
  return snap.data().count
}

/**
 * A Firestore-backed bank of entry data shared across every visitor: a seed list bundled
 * with the app, plus (optionally) entries visitors can add, minus anything any visitor has
 * permanently deleted. Deleting a seed entry can't edit the bundled code, so it's recorded
 * as "hidden" instead and filtered out of every future read. Works with any entry shape
 * that has a string `id` and a `difficulty` (BankEntry, WordEntry, ...).
 *
 * Changing the difficulty of a seed entry is likewise recorded as an override (in
 * `difficultyCollection`) that's applied on top of the bundled data on every read, while a
 * custom entry just has its own document updated.
 *
 * Resilience: the bundled seed list is always available, so if the shared collections cannot be
 * loaded (Firestore down, quota used up, offline) every read still returns the seed entries —
 * flagged with `degraded` — instead of failing. A previously loaded copy is also reused when a refresh fails.
 */
export function createSharedBank<T extends { id: string; difficulty: Difficulty }>(
  seedBank: T[],
  hiddenCollection: string,
  customCollection: string | null = null,
  difficultyCollection: string | null = null,
) {
  // Each collection is loaded at most once per CACHE_TTL_MS per tab and shared by Library, Quiz and Hub.
  // Invalidated immediately on this session's own add/delete so your own change is never hidden behind
  // a stale cache. When a refresh fails the expired copy is served rather than an error.
  const caches = new Map<string, CacheEntry<RawDoc[]>>()
  const pending = new Map<string, Promise<RawDoc[]>>()
  const counts = new Map<string, CacheEntry<number>>()

  /** Cached, de-duplicated load of one collection. Throws only when nothing at all (not even a stale copy) is available. */
  async function loadCollection(name: string): Promise<{ docs: RawDoc[]; stale: boolean }> {
    const hit = caches.get(name)
    if (hit && hit.expiresAt > Date.now()) return { docs: hit.data, stale: false }
    let p = pending.get(name)
    if (!p) {
      p = fetchDocs(name).finally(() => pending.delete(name))
      pending.set(name, p)
    }
    try {
      const docs = await p
      caches.set(name, { data: docs, expiresAt: Date.now() + CACHE_TTL_MS })
      return { docs, stale: false }
    } catch (err) {
      if (hit) return { docs: hit.data, stale: true }
      throw err
    }
  }

  const forget = (name: string | null) => {
    if (name) {
      caches.delete(name)
      counts.delete(name)
    }
  }

  async function getCustomEntries(): Promise<T[]> {
    if (!customCollection) return []
    const { docs } = await loadCollection(customCollection)
    return docs.map((d) => d.data as unknown as T)
  }

  /**
   * Like getCustomEntries, but capped to `maxCount` documents — for a use (like sampling quiz
   * questions) that just needs a big-enough pool to draw from, not literally every entry ever
   * added. It shares the same cached load, so starting a quiz right after browsing the Library costs no extra reads.
   */
  async function getCustomEntriesCapped(maxCount: number): Promise<T[]> {
    const all = await getCustomEntries()
    return all.length > maxCount ? all.slice(0, maxCount) : all
  }

  async function addCustomEntry(entry: T): Promise<void> {
    if (!customCollection) throw new Error('Adding entries is not supported for this bank.')
    await withTimeout(setDoc(doc(db, customCollection, entry.id), entry), 'Timed out saving your entry.')
    forget(customCollection)
    stampWrite(customCollection)
  }

  /**
   * Looks up a single custom entry by id — a targeted read that stays fast regardless of how
   * large the custom collection has grown, unlike fetching the whole collection (getFullBank)
   * just to check whether one entry already exists.
   */
  async function getCustomEntryById(id: string): Promise<T | null> {
    if (!customCollection) return null
    const snapshot = await withTimeout(getDoc(doc(db, customCollection, id)), 'Timed out checking for an existing entry.')
    return snapshot.exists() ? (snapshot.data() as T) : null
  }

  /** Seed words any visitor deleted. If this can't be loaded the seed list is shown unfiltered (and flagged degraded by the caller). */
  async function getHiddenIds(): Promise<{ ids: Set<string>; ok: boolean }> {
    try {
      const { docs, stale } = await loadCollection(hiddenCollection)
      return { ids: new Set(docs.map((d) => d.id)), ok: !stale }
    } catch {
      return { ids: new Set(), ok: false }
    }
  }

  /**
   * Difficulty changes made to seed entries, by id. A failed read just means "no overrides"
   * (bundled difficulties) rather than failing the whole bank load, since this is a
   * refinement on top of data that's still perfectly usable without it.
   */
  async function getDifficultyOverrides(): Promise<Map<string, Difficulty>> {
    if (!difficultyCollection) return new Map()
    try {
      const { docs } = await loadCollection(difficultyCollection)
      const data = new Map<string, Difficulty>()
      docs.forEach((d) => {
        const value = d.data.difficulty
        if (value === 'easy' || value === 'medium' || value === 'hard') data.set(d.id, value)
      })
      return data
    } catch {
      return new Map()
    }
  }

  /** Seed entries (minus any hidden ones) with their shared difficulty changes applied. */
  async function getVisibleSeedEntries(): Promise<{ entries: T[]; ok: boolean }> {
    const [hidden, overrides] = await Promise.all([getHiddenIds(), getDifficultyOverrides()])
    const entries = seedBank.filter((w) => !hidden.ids.has(w.id)).map((w) => (overrides.has(w.id) ? { ...w, difficulty: overrides.get(w.id)! } : w))
    return { entries, ok: hidden.ok }
  }

  /** Changes one entry's difficulty for every visitor. */
  async function updateDifficulty(id: string, difficulty: Difficulty): Promise<void> {
    if (customCollection && id.startsWith('custom-')) {
      await withTimeout(updateDoc(doc(db, customCollection, id), { difficulty }), 'Timed out updating that entry.')
      forget(customCollection)
      stampWrite(customCollection)
    } else {
      if (!difficultyCollection) throw new Error('Changing difficulty is not supported for this bank.')
      await withTimeout(setDoc(doc(db, difficultyCollection, id), { difficulty, updatedAt: Date.now() }), 'Timed out updating that entry.')
      forget(difficultyCollection)
      stampWrite(difficultyCollection)
    }
  }

  /** Permanently removes an entry from the shared bank for every visitor. */
  async function deleteEntry(id: string): Promise<void> {
    if (customCollection && id.startsWith('custom-')) {
      await withTimeout(deleteDoc(doc(db, customCollection, id)), 'Timed out deleting that entry.')
      forget(customCollection)
      stampWrite(customCollection)
    } else {
      await withTimeout(setDoc(doc(db, hiddenCollection, id), { hiddenAt: Date.now() }), 'Timed out deleting that entry.')
      forget(hiddenCollection)
      stampWrite(hiddenCollection)
    }
  }

  async function cachedCount(name: string): Promise<number> {
    const hit = counts.get(name)
    if (hit && hit.expiresAt > Date.now()) return hit.data
    const n = await fetchCount(name)
    counts.set(name, { data: n, expiresAt: Date.now() + CACHE_TTL_MS })
    return n
  }

  /**
   * The total entry count (seed - hidden + custom) without downloading a single document's
   * data — just for a "N words in this bank" display, which doesn't need the actual entries.
   * Served from the cached `/api/bank?mode=count` (or a server-side count aggregation), so it stays
   * cheap at 100,000 custom entries. When the shared counts are unavailable it falls back to the bundled size.
   */
  async function getTotalCount(): Promise<number> {
    if (!customCollection) return seedBank.length
    try {
      const [customCount, hiddenCount] = await Promise.all([cachedCount(customCollection), cachedCount(hiddenCollection)])
      return seedBank.length - hiddenCount + customCount
    } catch {
      return seedBank.length
    }
  }

  async function getFullBank(): Promise<BankResult<T>> {
    const [custom, seed] = await Promise.all([getCustomEntries().then((entries) => ({ entries, ok: true }), () => ({ entries: [] as T[], ok: false })), getVisibleSeedEntries()])
    return markDegraded([...custom.entries, ...seed.entries], !custom.ok || !seed.ok)
  }

  /** Like getFullBank, but the custom half is capped — for building a quiz's question pool, which doesn't need every entry ever added, just enough to draw a good random sample from. */
  async function getFullBankCapped(): Promise<BankResult<T>> {
    const [custom, seed] = await Promise.all([
      getCustomEntriesCapped(QUIZ_POOL_CAP).then((entries) => ({ entries, ok: true }), () => ({ entries: [] as T[], ok: false })),
      getVisibleSeedEntries(),
    ])
    return markDegraded([...custom.entries, ...seed.entries], !custom.ok || !seed.ok)
  }

  return { getCustomEntries, addCustomEntry, getCustomEntryById, deleteEntry, updateDifficulty, getFullBank, getFullBankCapped, getTotalCount }
}
