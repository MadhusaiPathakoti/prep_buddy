import { createSharedBank } from './sharedBank'
import { ONE_WORD_BANK } from '../data/oneWordSubstitutes'

const oneWordBank = createSharedBank(ONE_WORD_BANK, 'oneWordSubstitutionHiddenSeedWords')

export const deleteOneWordEntry = oneWordBank.deleteEntry
/** The seed phrase bank minus anything any visitor has deleted — shared across all visitors. */
export const getFullOneWordBank = oneWordBank.getFullBank
