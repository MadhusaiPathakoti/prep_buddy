import { createSharedBank } from './sharedBank'
import { PHRASAL_VERBS_BANK } from '../data/phrasalVerbs'

const phrasalVerbsBank = createSharedBank(PHRASAL_VERBS_BANK, 'phrasalVerbsHiddenSeedWords')

export const deletePhrasalVerb = phrasalVerbsBank.deleteEntry
/** The seed phrasal verb bank minus anything any visitor has deleted — shared across all visitors. */
export const getFullPhrasalVerbsBank = phrasalVerbsBank.getFullBank
