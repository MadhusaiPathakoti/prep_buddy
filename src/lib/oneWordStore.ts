import { createSharedBank } from './sharedBank'
import { ONE_WORD_BANK } from '../data/oneWordSubstitutes'

const oneWordBank = createSharedBank(ONE_WORD_BANK, 'oneWordSubstitutionHiddenSeedWords', 'oneWordSubstitutionCustomWords')

export const addCustomOneWordEntry = oneWordBank.addCustomEntry
export const deleteOneWordEntry = oneWordBank.deleteEntry
/** The seed phrase bank plus every entry any visitor has added, minus anything deleted — shared across all visitors. */
export const getFullOneWordBank = oneWordBank.getFullBank
