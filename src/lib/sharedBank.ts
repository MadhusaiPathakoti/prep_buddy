import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { BankEntry } from './types'

const REQUEST_TIMEOUT_MS = 10000

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

/**
 * A Firestore-backed bank of BankEntry data shared across every visitor: a seed list
 * bundled with the app, plus (optionally) entries visitors can add, minus anything any
 * visitor has permanently deleted. Deleting a seed entry can't edit the bundled code, so
 * it's recorded as "hidden" instead and filtered out of every future read.
 */
export function createSharedBank(seedBank: BankEntry[], hiddenCollection: string, customCollection: string | null = null) {
  async function getCustomEntries(): Promise<BankEntry[]> {
    if (!customCollection) return []
    const snapshot = await withTimeout(getDocs(collection(db, customCollection)), 'Timed out loading shared entries.')
    return snapshot.docs.map((d) => d.data() as BankEntry)
  }

  async function addCustomEntry(entry: BankEntry): Promise<void> {
    if (!customCollection) throw new Error('Adding entries is not supported for this bank.')
    await withTimeout(setDoc(doc(db, customCollection, entry.id), entry), 'Timed out saving your entry.')
  }

  async function getHiddenIds(): Promise<Set<string>> {
    const snapshot = await withTimeout(getDocs(collection(db, hiddenCollection)), 'Timed out loading shared entries.')
    return new Set(snapshot.docs.map((d) => d.id))
  }

  /** Permanently removes an entry from the shared bank for every visitor. */
  async function deleteEntry(id: string): Promise<void> {
    if (customCollection && id.startsWith('custom-')) {
      await withTimeout(deleteDoc(doc(db, customCollection, id)), 'Timed out deleting that entry.')
    } else {
      await withTimeout(setDoc(doc(db, hiddenCollection, id), { hiddenAt: Date.now() }), 'Timed out deleting that entry.')
    }
  }

  async function getFullBank(): Promise<BankEntry[]> {
    const [customEntries, hiddenIds] = await Promise.all([getCustomEntries(), getHiddenIds()])
    return [...customEntries, ...seedBank.filter((w) => !hiddenIds.has(w.id))]
  }

  return { getCustomEntries, addCustomEntry, deleteEntry, getFullBank }
}
