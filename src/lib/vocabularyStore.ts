import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { VOCAB_BANK } from '../data/vocabulary'
import type { BankEntry } from './types'

const CUSTOM_WORDS_COLLECTION = 'vocabularyCustomWords'
const HIDDEN_SEED_WORDS_COLLECTION = 'vocabularyHiddenSeedWords'
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

/** Words any visitor has added, shared across everyone via Firestore. */
export async function getCustomWords(): Promise<BankEntry[]> {
  const snapshot = await withTimeout(getDocs(collection(db, CUSTOM_WORDS_COLLECTION)), 'Timed out loading shared words.')
  return snapshot.docs.map((d) => d.data() as BankEntry)
}

export async function addCustomWord(entry: BankEntry): Promise<void> {
  await withTimeout(setDoc(doc(db, CUSTOM_WORDS_COLLECTION, entry.id), entry), 'Timed out saving your word.')
}

async function getHiddenSeedWordIds(): Promise<Set<string>> {
  const snapshot = await withTimeout(getDocs(collection(db, HIDDEN_SEED_WORDS_COLLECTION)), 'Timed out loading shared words.')
  return new Set(snapshot.docs.map((d) => d.id))
}

/**
 * Permanently removes a word from the shared vocabulary bank for every visitor. A
 * user-added word is deleted outright. A seed word ships in the app bundle and can't be
 * edited in place, so it's recorded as hidden in Firestore instead and filtered out of
 * every future read.
 */
export async function deleteWord(id: string): Promise<void> {
  if (id.startsWith('custom-')) {
    await withTimeout(deleteDoc(doc(db, CUSTOM_WORDS_COLLECTION, id)), 'Timed out deleting that word.')
  } else {
    await withTimeout(setDoc(doc(db, HIDDEN_SEED_WORDS_COLLECTION, id), { hiddenAt: Date.now() }), 'Timed out deleting that word.')
  }
}

/** The seed vocabulary bank plus every word any visitor has added, minus anything deleted — shared across all visitors. */
export async function getFullVocabBank(): Promise<BankEntry[]> {
  const [customWords, hiddenIds] = await Promise.all([getCustomWords(), getHiddenSeedWordIds()])
  return [...customWords, ...VOCAB_BANK.filter((w) => !hiddenIds.has(w.id))]
}
