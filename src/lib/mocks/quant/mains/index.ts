// SBI PO Mains-level Quant generators. Used by the Daily Dose in preference to the prelims-level ones in ../index.ts.
import type { QuantTopicId, TopicGenerator } from '../../types'
import { MAINS_ALGEBRA } from './algebra'
import { MAINS_ARITH_A } from './arithA'
import { MAINS_ARITH_B } from './arithB'
import { MAINS_CALC } from './calc'
import { MAINS_DI } from './di'
import { MAINS_SERIES } from './series'

export const QUANT_MAINS_GENERATORS: Partial<Record<QuantTopicId, TopicGenerator>> = {
  ...MAINS_CALC,
  ...MAINS_SERIES,
  ...MAINS_ALGEBRA,
  ...MAINS_ARITH_A,
  ...MAINS_ARITH_B,
  ...MAINS_DI,
}
