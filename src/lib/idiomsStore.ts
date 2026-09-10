import { createSharedBank } from './sharedBank'
import { IDIOMS_BANK } from '../data/idioms'

const idiomsBank = createSharedBank(IDIOMS_BANK, 'idiomsHiddenSeedWords', 'idiomsCustomWords')

export const addCustomIdiom = idiomsBank.addCustomEntry
export const deleteIdiom = idiomsBank.deleteEntry
/** The seed idiom bank plus every idiom any visitor has added, minus anything deleted — shared across all visitors. */
export const getFullIdiomsBank = idiomsBank.getFullBank
