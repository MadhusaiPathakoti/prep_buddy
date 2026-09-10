import { VOCAB_BANK } from '../data/vocabulary'
import type { BankEntry } from './types'

const CUSTOM_WORDS_KEY = 'prepbuddy:vocabulary:custom-words'
const HIDDEN_SEED_WORDS_KEY = 'prepbuddy:vocabulary:hidden-seed-words'

export function getCustomWords(): BankEntry[] {
  try {
    const raw = localStorage.getItem(CUSTOM_WORDS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function addCustomWord(entry: BankEntry) {
  try {
    const existing = getCustomWords()
    localStorage.setItem(CUSTOM_WORDS_KEY, JSON.stringify([entry, ...existing]))
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — silently skip persistence
  }
}

function removeCustomWord(id: string) {
  try {
    const existing = getCustomWords()
    localStorage.setItem(CUSTOM_WORDS_KEY, JSON.stringify(existing.filter((w) => w.id !== id)))
  } catch {
    // ignore
  }
}

function getHiddenSeedWordIds(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_SEED_WORDS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function hideSeedWord(id: string) {
  try {
    const hidden = getHiddenSeedWordIds()
    if (!hidden.includes(id)) {
      localStorage.setItem(HIDDEN_SEED_WORDS_KEY, JSON.stringify([...hidden, id]))
    }
  } catch {
    // ignore
  }
}

/**
 * Permanently removes a word from this browser's vocabulary bank. A user-added word is
 * dropped entirely; a seed word can't be edited in place (it ships in the app bundle), so
 * it's recorded as hidden and filtered out of every future read instead.
 */
export function deleteWord(id: string) {
  if (id.startsWith('custom-')) {
    removeCustomWord(id)
  } else {
    hideSeedWord(id)
  }
}

/** The seed vocabulary bank plus any words the user has added, minus anything they deleted, on this device. */
export function getFullVocabBank(): BankEntry[] {
  const hidden = new Set(getHiddenSeedWordIds())
  return [...getCustomWords(), ...VOCAB_BANK.filter((w) => !hidden.has(w.id))]
}
