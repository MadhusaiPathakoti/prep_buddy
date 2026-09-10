import { createSharedBank } from './sharedBank'
import { IDIOMS_BANK } from '../data/idioms'

const idiomsBank = createSharedBank(IDIOMS_BANK, 'idiomsHiddenSeedWords')

export const deleteIdiom = idiomsBank.deleteEntry
/** The seed idiom bank minus anything any visitor has deleted — shared across all visitors. */
export const getFullIdiomsBank = idiomsBank.getFullBank
