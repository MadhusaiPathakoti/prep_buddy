import { createSharedBank } from './sharedBank'
import { VOCAB_BANK } from '../data/vocabulary'

const vocabBank = createSharedBank(VOCAB_BANK, 'vocabularyHiddenSeedWords', 'vocabularyCustomWords')

export const getCustomWords = vocabBank.getCustomEntries
export const addCustomWord = vocabBank.addCustomEntry
export const getCustomWordById = vocabBank.getCustomEntryById
export const deleteWord = vocabBank.deleteEntry
/** The seed vocabulary bank plus every word any visitor has added, minus anything deleted — shared across all visitors. */
export const getFullVocabBank = vocabBank.getFullBank
/** Like getFullVocabBank, but the custom half is capped — for building a quiz's question pool. */
export const getFullVocabBankCapped = vocabBank.getFullBankCapped
/** Total word count, without downloading any entry data — for a "N words" display. */
export const getVocabCount = vocabBank.getTotalCount
