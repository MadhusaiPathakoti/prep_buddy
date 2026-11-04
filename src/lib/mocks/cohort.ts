import type { MockExamId, MockKind } from './types'

// PrepBuddy has no other live test-takers, so rank / percentile / topper / average in the result are
// ESTIMATES against a simulated cohort: scores follow a normal distribution whose centre and spread
// are calibrated to typical SBI/IBPS prelims outcomes. Everything derived here is labelled
// "estimated" wherever it is shown or printed.

export const COHORT_SIZE = 2000

export const COHORT_DISCLAIMER = `Rank, percentile, topper and average are estimates against a simulated cohort of ${COHORT_SIZE.toLocaleString('en-IN')} aspirants calibrated to typical SBI/IBPS prelims score spreads. They are not real test-takers.`

export interface Tier {
  id: 'Legendary' | 'Master' | 'Diamond' | 'Platinum' | 'Gold' | 'Silver' | 'Bronze'
  /** Minimum percentile (members behind you, %) to hold this tier. */
  min: number
  color: string
}

/** Highest first, as listed in the report. */
export const TIERS: Tier[] = [
  { id: 'Legendary', min: 99.5, color: '#f59e0b' },
  { id: 'Master', min: 97, color: '#8b5cf6' },
  { id: 'Diamond', min: 90, color: '#06b6d4' },
  { id: 'Platinum', min: 75, color: '#3b82f6' },
  { id: 'Gold', min: 50, color: '#eab308' },
  { id: 'Silver', min: 20, color: '#94a3b8' },
  { id: 'Bronze', min: 0, color: '#c2410c' },
]

export interface Benchmark {
  score: number
  maxScore: number
  accuracy: number
  correct: number
  wrong: number
  timeSec: number
}

export interface CohortEstimate {
  size: number
  rank: number
  percentile: number
  ahead: number
  behind: number
  tier: Tier
  nextTier: Tier | null
  /** 0–100 progress from this tier's floor to the next tier's floor. */
  progressToNext: number
  topper: Benchmark
  average: Benchmark
}

// Mean / spread of the simulated cohort as a fraction of the maximum score.
const PROFILE: Record<MockExamId, { full: [number, number]; part: [number, number] }> = {
  po: { full: [0.36, 0.14], part: [0.38, 0.15] },
  clerk: { full: [0.44, 0.15], part: [0.46, 0.16] },
}

/** Standard normal CDF (Abramowitz–Stegun erf approximation, abs. error < 1.5e-7). */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2)
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
  const erf = 1 - poly * Math.exp(-(z * z) / 2)
  return 0.5 * (1 + (z < 0 ? -erf : erf))
}

const roundQuarter = (n: number) => Math.round(n * 4) / 4

function benchmark(score: number, maxScore: number, totalQuestions: number, accuracy: number, negative: number, timeSec: number): Benchmark {
  // attempts a: score = a * (acc - (1 - acc) * negative)
  const per = accuracy - (1 - accuracy) * negative
  const attempted = Math.min(totalQuestions, Math.max(0, Math.round(score / per)))
  const correct = Math.round(attempted * accuracy)
  const wrong = attempted - correct
  return { score: roundQuarter(correct - wrong * negative), maxScore, accuracy: attempted ? (correct / attempted) * 100 : 0, correct, wrong, timeSec }
}

export function estimateCohort(exam: MockExamId, kind: MockKind, score: number, maxScore: number, totalQuestions: number, negative: number, durationSec: number): CohortEstimate {
  const [meanRatio, sdRatio] = kind === 'full' ? PROFILE[exam].full : PROFILE[exam].part
  const mean = meanRatio * maxScore
  const sd = sdRatio * maxScore

  const p = Math.min(0.9995, Math.max(0.0005, normalCdf((score - mean) / sd)))
  const behind = Math.round(p * (COHORT_SIZE - 1))
  const ahead = COHORT_SIZE - 1 - behind
  const percentile = (behind / COHORT_SIZE) * 100

  const tierIdx = TIERS.findIndex((t) => percentile >= t.min)
  const tier = TIERS[tierIdx]
  const nextTier = tierIdx > 0 ? TIERS[tierIdx - 1] : null
  const progressToNext = nextTier ? Math.min(100, Math.max(0, ((percentile - tier.min) / (nextTier.min - tier.min)) * 100)) : 100

  const topperScore = Math.min(maxScore, roundQuarter(mean + 3.2 * sd))
  return {
    size: COHORT_SIZE,
    rank: ahead + 1,
    percentile,
    ahead,
    behind,
    tier,
    nextTier,
    progressToNext,
    topper: benchmark(topperScore, maxScore, totalQuestions, 0.96, negative, durationSec * 0.95),
    average: benchmark(mean, maxScore, totalQuestions, 0.78, negative, durationSec),
  }
}
