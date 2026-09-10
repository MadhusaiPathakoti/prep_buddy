import { createSharedBank } from './sharedBank'
import { VOCAB_BANK } from '../data/vocabulary'

const vocabBank = createSharedBank(VOCAB_BANK, 'vocabularyHiddenSeedWords', 'vocabularyCustomWords')

export const getCustomWords = vocabBank.getCustomEntries
export const addCustomWord = vocabBank.addCustomEntry
export const deleteWord = vocabBank.deleteEntry
/** The seed vocabulary bank plus every word any visitor has added, minus anything deleted — shared across all visitors. */
export const getFullVocabBank = vocabBank.getFullBank
