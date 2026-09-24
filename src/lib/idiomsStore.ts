import { createSharedBank } from './sharedBank'
import { IDIOMS_BANK } from '../data/idioms'

const idiomsBank = createSharedBank(IDIOMS_BANK, 'idiomsHiddenSeedWords', 'idiomsCustomWords')

export const addCustomIdiom = idiomsBank.addCustomEntry
export const getCustomIdiomById = idiomsBank.getCustomEntryById
export const deleteIdiom = idiomsBank.deleteEntry
/** The seed idiom bank plus every idiom any visitor has added, minus anything deleted — shared across all visitors. */
export const getFullIdiomsBank = idiomsBank.getFullBank
/** Like getFullIdiomsBank, but the custom half is capped — for building a quiz's question pool. */
export const getFullIdiomsBankCapped = idiomsBank.getFullBankCapped
/** Total idiom count, without downloading any entry data — for a "N idioms" display. */
export const getIdiomsCount = idiomsBank.getTotalCount
