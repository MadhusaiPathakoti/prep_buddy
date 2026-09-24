import { collection, deleteDoc, doc, getCountFromServer, getDoc, getDocs, limit, query, setDoc } from 'firebase/firestore'
import { db } from './firebase'

const REQUEST_TIMEOUT_MS = 5000

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

const CACHE_TTL_MS = 60000

/** More than enough distinct custom entries to draw a good random quiz sample from, regardless of how large the pool eventually grows — see getFullBankCapped. */
const QUIZ_POOL_CAP = 1000

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

/**
 * A Firestore-backed bank of entry data shared across every visitor: a seed list bundled
 * with the app, plus (optionally) entries visitors can add, minus anything any visitor has
 * permanently deleted. Deleting a seed entry can't edit the bundled code, so it's recorded
 * as "hidden" instead and filtered out of every future read. Works with any entry shape
 * that has a string `id` (BankEntry, WordEntry, ...).
 */
export function createSharedBank<T extends { id: string }>(seedBank: T[], hiddenCollection: string, customCollection: string | null = null) {
  // The custom collection only grows (more visitors adding entries over time), so fetching it
  // in full is the one thing here that gets slower as the bank does — caching for a minute
  // means clicking between Library, Quiz, and Add during one visit doesn't re-download it
  // every single time. Invalidated immediately on this session's own add/delete so your own
  // change is never hidden behind a stale cache; other visitors' changes show up once the TTL
  // lapses, without needing a full page reload.
  let customCache: CacheEntry<T[]> | null = null
  let hiddenCache: CacheEntry<Set<string>> | null = null

  async function getCustomEntries(): Promise<T[]> {
    if (!customCollection) return []
    if (customCache && customCache.expiresAt > Date.now()) return customCache.data
    const snapshot = await withTimeout(getDocs(collection(db, customCollection)), 'Timed out loading shared entries.')
    const data = snapshot.docs.map((d) => d.data() as T)
    customCache = { data, expiresAt: Date.now() + CACHE_TTL_MS }
    return data
  }

  /**
   * Like getCustomEntries, but capped to `maxCount` documents — for a use (like sampling quiz
   * questions) that just needs a big-enough pool to draw from, not literally every entry ever
   * added. Bounds fetch time and payload size no matter how large the collection grows;
   * uncached and unaffected by getCustomEntries' cache, since it's a different, smaller query.
   */
  async function getCustomEntriesCapped(maxCount: number): Promise<T[]> {
    if (!customCollection) return []
    const snapshot = await withTimeout(
      getDocs(query(collection(db, customCollection), limit(maxCount))),
      'Timed out loading shared entries.',
    )
    return snapshot.docs.map((d) => d.data() as T)
  }

  async function addCustomEntry(entry: T): Promise<void> {
    if (!customCollection) throw new Error('Adding entries is not supported for this bank.')
    await withTimeout(setDoc(doc(db, customCollection, entry.id), entry), 'Timed out saving your entry.')
    customCache = null
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

  async function getHiddenIds(): Promise<Set<string>> {
    if (hiddenCache && hiddenCache.expiresAt > Date.now()) return hiddenCache.data
    const snapshot = await withTimeout(getDocs(collection(db, hiddenCollection)), 'Timed out loading shared entries.')
    const data = new Set(snapshot.docs.map((d) => d.id))
    hiddenCache = { data, expiresAt: Date.now() + CACHE_TTL_MS }
    return data
  }

  /** Permanently removes an entry from the shared bank for every visitor. */
  async function deleteEntry(id: string): Promise<void> {
    if (customCollection && id.startsWith('custom-')) {
      await withTimeout(deleteDoc(doc(db, customCollection, id)), 'Timed out deleting that entry.')
      customCache = null
    } else {
      await withTimeout(setDoc(doc(db, hiddenCollection, id), { hiddenAt: Date.now() }), 'Timed out deleting that entry.')
      hiddenCache = null
    }
  }

  /**
   * The total entry count (seed - hidden + custom) without downloading a single document's
   * data — just for a "N words in this bank" display, which doesn't need the actual entries.
   * Uses Firestore's server-side count aggregation for the two collections, so this stays
   * just as fast at 100,000 custom entries as it is at 100.
   */
  async function getTotalCount(): Promise<number> {
    if (!customCollection) return seedBank.length
    const [customCountSnap, hiddenCountSnap] = await Promise.all([
      withTimeout(getCountFromServer(collection(db, customCollection)), 'Timed out counting shared entries.'),
      withTimeout(getCountFromServer(collection(db, hiddenCollection)), 'Timed out counting shared entries.'),
    ])
    return seedBank.length - hiddenCountSnap.data().count + customCountSnap.data().count
  }

  async function getFullBank(): Promise<T[]> {
    const [customEntries, hiddenIds] = await Promise.all([getCustomEntries(), getHiddenIds()])
    return [...customEntries, ...seedBank.filter((w) => !hiddenIds.has(w.id))]
  }

  /** Like getFullBank, but the custom half is capped — for building a quiz's question pool, which doesn't need every entry ever added, just enough to draw a good random sample from. */
  async function getFullBankCapped(): Promise<T[]> {
    const [customEntries, hiddenIds] = await Promise.all([getCustomEntriesCapped(QUIZ_POOL_CAP), getHiddenIds()])
    return [...customEntries, ...seedBank.filter((w) => !hiddenIds.has(w.id))]
  }

  return { getCustomEntries, addCustomEntry, getCustomEntryById, deleteEntry, getFullBank, getFullBankCapped, getTotalCount }
}
