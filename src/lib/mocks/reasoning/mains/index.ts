// SBI PO Mains-level Reasoning generators. Used by the Daily Dose in preference to the prelims-level ones in ../index.ts.
import type { ReasoningTopicId, TopicGenerator } from '../../types'
import { MAINS_ARRANGE } from './arrange'
import { MAINS_LOGIC_A } from './logicA'
import { MAINS_LOGIC_B } from './logicB'

export const REASONING_MAINS_GENERATORS: Partial<Record<ReasoningTopicId, TopicGenerator>> = {
  ...MAINS_ARRANGE,
  ...MAINS_LOGIC_A,
  ...MAINS_LOGIC_B,
}
