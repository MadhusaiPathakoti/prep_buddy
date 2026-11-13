// SBI PO Mains-level Reasoning generators. Used by the Daily Dose in preference to the prelims-level ones in ../index.ts.
import type { ReasoningTopicId, TopicGenerator } from '../../types'
import { MAINS_ARRANGE } from './arrange'
import { MAINS_LOGIC_A } from './logicA'
import { MAINS_LOGIC_B } from './logicB'
import { MEDIUM_ARRANGE } from './medium'

/** Medium-level arrangement sets (fewer attributes and clues than Mains), for the Daily Dose. */
export const REASONING_MEDIUM_GENERATORS: Partial<Record<ReasoningTopicId, TopicGenerator>> = MEDIUM_ARRANGE

export const REASONING_MAINS_GENERATORS: Partial<Record<ReasoningTopicId, TopicGenerator>> = {
  ...MAINS_ARRANGE,
  ...MAINS_LOGIC_A,
  ...MAINS_LOGIC_B,
}
