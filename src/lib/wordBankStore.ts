import { createSharedBank } from './sharedBank'
import { WORD_BANK } from '../data/wordBank'
import type { WordEntry } from './types'

const wordBank = createSharedBank<WordEntry>(WORD_BANK, 'wordBankHiddenSeedWords', 'wordBankCustomWords')

export const addCustomWordEntry = wordBank.addCustomEntry
export const deleteWordEntry = wordBank.deleteEntry
/** The seed word bank minus anything any visitor has deleted, plus anything any visitor has added — shared across all visitors, and shared between the Synonyms and Antonyms games. */
export const getFullWordBank = wordBank.getFullBank
