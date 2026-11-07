import type { Question } from './types'
import { chance, clean, collect, fmt, hasAtMostDecimals, pick, qid } from './mentalMath'

/**
 * Successive percentages and discounts. Everything is worked with multipliers:
 *   +20% then −10%  →  1.20 × 0.90 = 1.08  →  net +8%.
 * Answers are typed as plain numbers (the review says whether it was an increase or a decrease), always exact with
 * at most 2 decimals.
 */

export type SuccessiveMode = 'mixed' | 'net' | 'discount' | 'price' | 'profit'
export type SuccessiveDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'
type Level = 'easy' | 'medium' | 'hard'

const PCTS: Record<Level, number[]> = {
  easy: [10, 20, 25, 50, 5, 15, 30, 40],
  medium: [5, 8, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50],
  hard: [4, 6, 8, 12, 12.5, 15, 16, 18, 20, 24, 25, 28, 30, 32, 35, 36, 40, 45, 60, 75],
}
const STEPS: Record<Level, number> = { easy: 2, medium: 2, hard: 3 }

const sgn = (v: number) => (v > 0 ? '+' : '−')
const signedPct = (v: number) => `${sgn(v)}${fmt(Math.abs(v))}%`
const mult = (v: number) => fmt(clean(1 + v / 100, 4))

function randomChanges(level: Level, steps: number, allowUp: boolean): number[] {
  return Array.from({ length: steps }, () => (allowUp && chance(0.5) ? 1 : -1) * pick(PCTS[level]))
}

function net(level: Level): Question | null {
  const ch = randomChanges(level, STEPS[level], true)
  const factor = ch.reduce((f, c) => f * (1 + c / 100), 1)
  const pct = clean((factor - 1) * 100, 4)
  if (pct === 0 || !hasAtMostDecimals(pct, 2)) return null
  if (ch.every((c) => c > 0) && level === 'easy' && chance(0.5)) return null
  const answer = Math.abs(pct)
  const lines = [
    `Multipliers: ${ch.map((c) => `${signedPct(c)} → ${mult(c)}`).join(',  ')}.`,
    `${ch.map((c) => mult(c)).join(' × ')} = ${fmt(clean(factor, 6))}.`,
    `Net ${pct > 0 ? 'increase' : 'decrease'} = ${fmt(answer)}%.`,
  ]
  if (ch.length === 2) lines.push(`Shortcut for two changes: a + b + ab/100 = ${fmt(ch[0])} + (${fmt(ch[1])}) + (${fmt(clean((ch[0] * ch[1]) / 100, 4))}) = ${fmt(pct)}%.`)
  return { id: qid('sp'), prompt: `Net % change: ${ch.map(signedPct).join(', ')}`, answer, displayAnswer: fmt(answer), note: lines.join('\n') }
}

function discount(level: Level): Question | null {
  const ds = randomChanges(level, STEPS[level], false)
  const factor = ds.reduce((f, d) => f * (1 + d / 100), 1)
  const single = clean((1 - factor) * 100, 4)
  if (!hasAtMostDecimals(single, 2)) return null
  const note = [
    `Pay ${ds.map((d) => mult(d)).join(' × ')} = ${fmt(clean(factor, 6))} of the price.`,
    `Single discount = 1 − ${fmt(clean(factor, 6))} = ${fmt(clean(1 - factor, 6))} → ${fmt(single)}%.`,
    ds.length === 2 ? `Shortcut: ${fmt(-ds[0])} + ${fmt(-ds[1])} − (${fmt(-ds[0])} × ${fmt(-ds[1])})/100 = ${fmt(single)}%.` : '',
  ]
    .filter(Boolean)
    .join('\n')
  return { id: qid('sp'), prompt: `Single discount equal to ${ds.map((d) => `${fmt(-d)}%`).join(' + ')}`, answer: single, displayAnswer: fmt(single), note }
}

function price(level: Level): Question | null {
  const ch = randomChanges(level, STEPS[level], true)
  const base = pick([200, 240, 250, 300, 400, 480, 500, 600, 640, 800, 1000, 1200, 1600, 2000, 2400, 2500, 4000])
  const final = clean(ch.reduce((v, c) => v * (1 + c / 100), base), 4)
  if (!Number.isInteger(final) || final === base) return null
  let v = base
  const steps = ch.map((c) => {
    const next = clean(v * (1 + c / 100), 4)
    const s = `${fmt(v)} ${c > 0 ? '+' : '−'} ${fmt(Math.abs(c))}% = ${fmt(next)}`
    v = next
    return s
  })
  return { id: qid('sp'), prompt: `₹${base}: ${ch.map(signedPct).join(', ')} → final price`, answer: final, displayAnswer: String(final), note: `${steps.join(',  then ')}.` }
}

function profit(level: Level): Question | null {
  const mark = pick(level === 'easy' ? [20, 25, 30, 40, 50] : [20, 25, 30, 35, 40, 45, 50, 60, 70, 80])
  const disc = pick(PCTS[level].filter((d) => d <= 40))
  const factor = (1 + mark / 100) * (1 - disc / 100)
  const gain = clean((factor - 1) * 100, 4)
  if (gain <= 0 || !hasAtMostDecimals(gain, 2)) return null
  const note = [
    `Take cost price = 100: marked price = ${fmt(100 + mark)}.`,
    `After ${fmt(disc)}% discount: ${fmt(100 + mark)} × ${fmt(clean(1 - disc / 100, 4))} = ${fmt(clean(factor * 100, 4))}.`,
    `Profit = ${fmt(clean(factor * 100, 4))} − 100 = ${fmt(gain)}%.`,
  ].join('\n')
  return { id: qid('sp'), prompt: `Marked ${fmt(mark)}% above cost, ${fmt(disc)}% discount: profit %`, answer: gain, displayAnswer: fmt(gain), note }
}

export function generateSuccessiveQuestions(difficulty: SuccessiveDifficulty, mode: SuccessiveMode, count: number): Question[] {
  let i = 0
  return collect(count, () => {
    const level: Level = difficulty === 'mixed' ? (['easy', 'medium', 'hard'] as Level[])[i++ % 3] : difficulty
    const m = mode === 'mixed' ? pick(['net', 'net', 'discount', 'price', 'profit'] as const) : mode
    if (m === 'net') return net(level)
    if (m === 'discount') return discount(level)
    if (m === 'price') return price(level)
    return profit(level)
  })
}

