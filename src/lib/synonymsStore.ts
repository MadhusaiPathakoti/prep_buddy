import { createSharedBank } from './sharedBank'
import { SYNONYMS_BANK } from '../data/synonyms'

const synonymsBank = createSharedBank(SYNONYMS_BANK, 'synonymsHiddenSeedWords', 'synonymsCustomWords')

export const addCustomSynonymEntry = synonymsBank.addCustomEntry
export const deleteSynonymEntry = synonymsBank.deleteEntry
/** The seed synonyms bank minus anything any visitor has deleted — shared across all visitors. */
export const getFullSynonymsBank = synonymsBank.getFullBank
