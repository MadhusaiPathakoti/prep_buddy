import { createSharedBank } from './sharedBank'
import { ONE_WORD_BANK } from '../data/oneWordSubstitutes'

const oneWordBank = createSharedBank(ONE_WORD_BANK, 'oneWordSubstitutionHiddenSeedWords', 'oneWordSubstitutionCustomWords')

export const addCustomOneWordEntry = oneWordBank.addCustomEntry
export const getCustomOneWordById = oneWordBank.getCustomEntryById
export const deleteOneWordEntry = oneWordBank.deleteEntry
/** The seed phrase bank plus every entry any visitor has added, minus anything deleted — shared across all visitors. */
export const getFullOneWordBank = oneWordBank.getFullBank
/** Like getFullOneWordBank, but the custom half is capped — for building a quiz's question pool. */
export const getFullOneWordBankCapped = oneWordBank.getFullBankCapped
/** Total phrase count, without downloading any entry data — for a "N phrases" display. */
export const getOneWordCount = oneWordBank.getTotalCount
