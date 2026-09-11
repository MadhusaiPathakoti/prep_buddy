import { createSharedBank } from './sharedBank'
import { ANTONYMS_BANK } from '../data/antonyms'

const antonymsBank = createSharedBank(ANTONYMS_BANK, 'antonymsHiddenSeedWords', 'antonymsCustomWords')

export const addCustomAntonymEntry = antonymsBank.addCustomEntry
export const deleteAntonymEntry = antonymsBank.deleteEntry
/** The seed antonyms bank minus anything any visitor has deleted — shared across all visitors. */
export const getFullAntonymsBank = antonymsBank.getFullBank
