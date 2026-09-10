import { VOCAB_BANK } from '../data/vocabulary'
import type { BankEntry } from './types'

const CUSTOM_WORDS_KEY = 'prepbuddy:vocabulary:custom-words'

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

/** The seed vocabulary bank plus any words the user has added on this device. */
export function getFullVocabBank(): BankEntry[] {
  return [...getCustomWords(), ...VOCAB_BANK]
}
