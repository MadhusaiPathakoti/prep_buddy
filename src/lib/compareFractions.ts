import { shuffle, type MCQQuestion } from './generators'
import { between, chance, collect, gcd, qid } from './mentalMath'

/**
 * Compare Fractions: pick the largest or smallest of 4–5 fractions. Every fraction is in lowest terms, all values
 * differ, and the winner beats the runner-up by a margin that depends on the level (so there is never a coin-flip).
 */

export type CompareDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'
export type CompareMode = 'mixed' | 'largest' | 'smallest'
type Level = 'easy' | 'medium' | 'hard'

interface Cfg {
  maxDen: number
  options: number
  spread: number // how far the fractions are allowed to drift from a common centre
  minGap: number // relative gap between the winner and the runner-up
}
const CFG: Record<Level, Cfg> = {
  easy: { maxDen: 15, options: 4, spread: 0.3, minGap: 0.1 },
  medium: { maxDen: 30, options: 4, spread: 0.14, minGap: 0.04 },
  hard: { maxDen: 60, options: 5, spread: 0.07, minGap: 0.015 },
}

interface Frac {
  p: number
  q: number
  v: number
}
const text = (f: Frac) => `${f.p}/${f.q}`

function method(sorted: Frac[], largest: boolean): string {
  const win = largest ? sorted[sorted.length - 1] : sorted[0]
  const runner = largest ? sorted[sorted.length - 2] : sorted[1]
  const cross = `${win.p} × ${runner.q} = ${win.p * runner.q} versus ${runner.p} × ${win.q} = ${runner.p * win.q}`
  const hints: string[] = []
  if (sorted.every((f) => f.p === sorted[0].p)) hints.push('Same numerator: the smaller the denominator, the larger the fraction.')
  else if (sorted.every((f) => f.q === sorted[0].q)) hints.push('Same denominator: the larger the numerator, the larger the fraction.')
  else if (sorted.every((f) => f.v > 0.5)) hints.push('All are above ½ — compare how far each is from 1: (q − p)/q; the smaller gap means the larger fraction.')
  else if (sorted.every((f) => f.v < 0.5)) hints.push('All are below ½ — compare each with ½ first; the closer to ½, the larger.')
  else hints.push('Some are above ½ and some below, so the biggest and smallest are easy to spot against ½.')
  return `${hints[0]}\nTop two cross-multiplied: ${cross}.`
}

function make(level: Level, mode: Exclude<CompareMode, 'mixed'>): MCQQuestion | null {
  const cfg = CFG[level]
  const centre = 0.25 + Math.random() * 0.65
  const fracs: Frac[] = []
  for (let t = 0; t < 60 && fracs.length < cfg.options; t++) {
    const q = between(level === 'easy' ? 3 : 7, cfg.maxDen)
    const target = centre + (Math.random() * 2 - 1) * cfg.spread
    const p = Math.round(target * q)
    if (p < 1 || p >= q || gcd(p, q) !== 1) continue
    const v = p / q
    if (fracs.some((f) => Math.abs(f.v - v) < 1e-9 || f.q === q)) continue
    fracs.push({ p, q, v })
  }
  if (fracs.length < cfg.options) return null
  const largest = mode === 'largest'
  const sorted = [...fracs].sort((a, b) => a.v - b.v)
  const win = largest ? sorted[sorted.length - 1] : sorted[0]
  const runner = largest ? sorted[sorted.length - 2] : sorted[1]
  if (Math.abs(win.v - runner.v) / Math.max(win.v, runner.v) < cfg.minGap) return null
  const decimals = sorted.map((f) => `${text(f)} = ${f.v.toFixed(3)}`).join(',  ')
  return {
    id: qid('cf'),
    instruction: `Compare fractions · ${level}`,
    term: `Which fraction is the ${largest ? 'largest' : 'smallest'}?`,
    correctMeaning: text(win),
    options: shuffle(fracs).map(text),
    hint: 'Compare each with ½ first, then cross-multiply only the two that are left.',
    explanation: `In order (small → large): ${decimals}.\n${method(sorted, largest)}`,
  }
}

export function generateCompareFractionQuestions(difficulty: CompareDifficulty, mode: CompareMode, count: number): MCQQuestion[] {
  let i = 0
  return collect(count, () => {
    const level: Level = difficulty === 'mixed' ? (['easy', 'medium', 'hard'] as Level[])[i++ % 3] : difficulty
    return make(level, mode === 'mixed' ? (chance(0.5) ? 'largest' : 'smallest') : mode)
  })
}

