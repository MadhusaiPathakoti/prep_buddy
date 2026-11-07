import type { Question } from './types'
import { between, clean, collect, fmt, gcd, pick, qid } from './mentalMath'

/**
 * Percentage of a Number — three ways round:
 *   of      "18% of 450"            → 81
 *   percent "81 is what % of 450"   → 18
 *   whole   "81 is 18% of"          → 450
 * Every answer is exact and has at most 2 decimals.
 */

export type PercentMode = 'mixed' | 'of' | 'percent' | 'whole'
export type PercentDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'
type Level = 'easy' | 'medium' | 'hard'

const FRACTION: Record<number, [number, number]> = {
  5: [1, 20], 10: [1, 10], 12.5: [1, 8], 15: [3, 20], 20: [1, 5], 25: [1, 4], 30: [3, 10], 35: [7, 20], 37.5: [3, 8], 40: [2, 5],
  45: [9, 20], 50: [1, 2], 55: [11, 20], 60: [3, 5], 62.5: [5, 8], 65: [13, 20], 70: [7, 10], 75: [3, 4], 80: [4, 5], 85: [17, 20],
  87.5: [7, 8], 90: [9, 10], 95: [19, 20], 6.25: [1, 16],
}

const PERCENTS: Record<Level, number[]> = {
  easy: [10, 20, 25, 50, 5, 15, 30, 40, 60, 75, 80, 90],
  medium: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 12.5, 37.5, 62.5, 87.5, 8, 12, 16, 24, 36, 44],
  hard: [12.5, 37.5, 62.5, 87.5, 6.25, ...Array.from({ length: 99 }, (_, i) => i + 1).filter((p) => p % 5 !== 0 || p === 5)],
}

const SIZE: Record<Level, [number, number]> = { easy: [20, 400], medium: [40, 2000], hard: [100, 9000] }

/** A whole number n in range such that p% of n is a friendly value (integer; quarter-steps allowed in hard). */
function friendlyBase(p: number, level: Level): number | null {
  const [lo, hi] = SIZE[level]
  for (let t = 0; t < 400; t++) {
    // hard numbers stay round (multiples of 10) so the arithmetic is mental, not a long division
    const n = level === 'hard' ? between(Math.ceil(lo / 10), Math.floor(hi / 10)) * 10 : between(lo, hi)
    const ans = clean((p * n) / 100)
    const ok = level === 'hard' ? ans * 4 === Math.round(ans * 4) : Number.isInteger(ans)
    if (ok && ans > 0 && ans !== n) return n
  }
  return null
}

function splitNote(p: number, n: number): string {
  const ans = clean((p * n) / 100)
  const f = FRACTION[p]
  if (f) {
    const [num, den] = f
    const part = n / den
    if (Number.isInteger(part)) {
      return `${fmt(p)}% = ${num}/${den}. ${n} ÷ ${den} = ${fmt(part)}${num === 1 ? '' : `, × ${num} = ${fmt(ans)}`}.`
    }
  }
  if (Number.isInteger(p) && p > 10) {
    const tens = Math.floor(p / 10)
    const ones = p % 10
    const tenPct = clean(n / 10)
    const onePct = clean(n / 100)
    return `${p}% = ${tens * 10}% + ${ones}%. 10% of ${n} = ${fmt(tenPct)}, 1% = ${fmt(onePct)} → ${tens} × ${fmt(tenPct)} + ${ones} × ${fmt(onePct)} = ${fmt(ans)}.`
  }
  return `1% of ${n} = ${fmt(clean(n / 100))}, so ${fmt(p)}% = ${fmt(p)} × ${fmt(clean(n / 100))} = ${fmt(ans)}.`
}

function make(level: Level, mode: Exclude<PercentMode, 'mixed'>): Question | null {
  const p = pick(PERCENTS[level])
  const n = friendlyBase(p, level)
  if (n === null) return null
  const ans = clean((p * n) / 100)
  if (mode === 'of') {
    return { id: qid('po'), prompt: `${fmt(p)}% of ${n}`, answer: ans, displayAnswer: fmt(ans), note: splitNote(p, n) }
  }
  if (mode === 'percent') {
    const g = gcd(Math.round(ans * 4), n * 4)
    const frac = `${Math.round(ans * 4) / g}/${(n * 4) / g}`
    return {
      id: qid('po'),
      prompt: `${fmt(ans)} is what % of ${n}`,
      answer: p,
      displayAnswer: fmt(p),
      note: `${fmt(ans)} ÷ ${n} = ${frac} → × 100 = ${fmt(p)}%.`,
    }
  }
  return {
    id: qid('po'),
    prompt: `${fmt(ans)} is ${fmt(p)}% of what number`,
    answer: n,
    displayAnswer: String(n),
    note: `${fmt(p)}% ↔ ${fmt(ans)}, so 1% = ${fmt(clean(ans / p, 4))} and 100% = ${fmt(clean(ans / p, 4))} × 100 = ${n}.`,
  }
}

export function generatePercentageQuestions(difficulty: PercentDifficulty, mode: PercentMode, count: number): Question[] {
  let i = 0
  return collect(count, () => {
    const level: Level = difficulty === 'mixed' ? (['easy', 'medium', 'hard'] as Level[])[i++ % 3] : difficulty
    const m = mode === 'mixed' ? pick(['of', 'of', 'percent', 'whole'] as const) : mode
    return make(level, m)
  })
}

