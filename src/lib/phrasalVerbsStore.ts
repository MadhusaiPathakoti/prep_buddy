import { createSharedBank } from './sharedBank'
import { PHRASAL_VERBS_BANK } from '../data/phrasalVerbs'

const phrasalVerbsBank = createSharedBank(PHRASAL_VERBS_BANK, 'phrasalVerbsHiddenSeedWords', 'phrasalVerbsCustomWords')

export const addCustomPhrasalVerb = phrasalVerbsBank.addCustomEntry
export const getCustomPhrasalVerbById = phrasalVerbsBank.getCustomEntryById
export const deletePhrasalVerb = phrasalVerbsBank.deleteEntry
/** The seed phrasal verb bank minus anything any visitor has deleted — shared across all visitors. */
export const getFullPhrasalVerbsBank = phrasalVerbsBank.getFullBank
/** Like getFullPhrasalVerbsBank, but the custom half is capped — for building a quiz's question pool. */
export const getFullPhrasalVerbsBankCapped = phrasalVerbsBank.getFullBankCapped
/** Total phrasal verb count, without downloading any entry data — for a "N phrasal verbs" display. */
export const getPhrasalVerbsCount = phrasalVerbsBank.getTotalCount
