import type { QuantTopicId, TopicGenerator } from '../types'
import { genApproximation, genSimplification } from './calc'
import { genMissingSeries, genWrongSeries } from './series'
import { genQuadratic, genQuantityComparison } from './algebra'
import { genDiBar, genDiLine, genDiPie, genDiTable } from './di'
import { genCaselet } from './caselet'
import { genAgesAverages, genPercentage, genProfitLoss, genRatioPartnership } from './arith1'
import { genInterest, genMixture, genSpeedDistance, genTimeWork } from './arith2'
import { genMensuration, genNumberSystem, genProbability } from './arith3'

export const QUANT_GENERATORS: Record<QuantTopicId, TopicGenerator> = {
  simplification: genSimplification,
  approximation: genApproximation,
  'wrong-number-series': genWrongSeries,
  'missing-number-series': genMissingSeries,
  'quadratic-equations': genQuadratic,
  'quantity-comparison': genQuantityComparison,
  'di-table': genDiTable,
  'di-bar': genDiBar,
  'di-pie': genDiPie,
  'di-line': genDiLine,
  'di-caselet': genCaselet,
  percentage: genPercentage,
  'profit-loss': genProfitLoss,
  'ratio-partnership': genRatioPartnership,
  'ages-averages': genAgesAverages,
  interest: genInterest,
  'time-work': genTimeWork,
  'speed-distance': genSpeedDistance,
  'mixture-alligation': genMixture,
  mensuration: genMensuration,
  'probability-pnc': genProbability,
  'number-system': genNumberSystem,
}
