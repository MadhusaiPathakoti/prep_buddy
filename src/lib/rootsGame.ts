import type { Question } from './types'
import { between, clean, collect, fmt, pick, qid } from './mentalMath'

/**
 * Square & Cube Roots of perfect squares / cubes — the mental method, not a calculator:
 *   √  last digit → possible last digits of the root; the tens digit comes from bracketing between squares of tens;
 *      when two endings are possible, the square of (tens × 10 + 5) decides.
 *   ∛  the last digit of a cube identifies the last digit of its root (it is one-to-one); the part left after dropping the
 *      last three digits brackets the tens digit between cubes 1³ … 9³.
 * Decimal versions ignore the point, take the root, then place the point (half / third as many decimals).
 */

export type RootKind = 'mixed' | 'square' | 'cube' | 'decimal'
export type RootDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'
type Level = 'easy' | 'medium' | 'hard'

const SQUARE_ENDINGS: Record<number, number[]> = { 0: [0], 1: [1, 9], 4: [2, 8], 5: [5], 6: [4, 6], 9: [3, 7] }
const CUBE_ENDING_ROOT: Record<number, number> = { 0: 0, 1: 1, 8: 2, 7: 3, 4: 4, 5: 5, 6: 6, 3: 7, 2: 8, 9: 9 }

const SQ_RANGE: Record<Level, [number, number]> = { easy: [11, 35], medium: [36, 99], hard: [100, 170] }
const CU_RANGE: Record<Level, [number, number]> = { easy: [3, 12], medium: [13, 30], hard: [31, 99] }

function squareNote(r: number): string {
  const n = r * r
  const last = n % 10
  const cands = SQUARE_ENDINGS[last]
  const t = Math.floor(r / 10)
  const lines = [`Last digit ${last} → the root ends in ${cands.join(' or ')}.`, `${t * 10}² = ${(t * 10) ** 2} ≤ ${n} < ${(t * 10 + 10) ** 2} = ${t * 10 + 10}² → the root starts ${t}_.`]
  if (cands.length === 2) {
    const mid = (t * 10 + 5) ** 2
    lines.push(`${t * 10 + 5}² = ${mid}; ${n} is ${n < mid ? 'below' : 'above'} it → the ${n < mid ? 'smaller' : 'larger'} ending, ${r % 10}.`)
  }
  lines.push(`So √${n} = ${r}.`)
  return lines.join('\n')
}

function cubeNote(r: number): string {
  const n = r ** 3
  if (n < 1000) return `Learn the small cubes: ${r}³ = ${n}, so ∛${n} = ${r}.`
  const front = Math.floor(n / 1000)
  const t = Math.floor(r / 10)
  return [
    `Last digit ${n % 10} → the root ends in ${CUBE_ENDING_ROOT[n % 10]} (cubes and their roots end in matching digits: 2↔8, 3↔7, 4, 5, 6, 9, 1, 0 stay or swap).`,
    `Drop the last three digits: ${front}. ${t}³ = ${t ** 3} ≤ ${front} < ${(t + 1) ** 3} = ${t + 1}³ → the root starts ${t}_.`,
    `So ∛${n} = ${r}.`,
  ].join('\n')
}

function decimalSquare(level: Level): Question | null {
  const twoDecimals = level === 'hard' && Math.random() < 0.4
  const k = twoDecimals ? between(11, 99) : between(11, 99)
  const scale = twoDecimals ? 100 : 10
  const r = k / scale
  const n = (k * k) / scale ** 2
  const decimals = twoDecimals ? 4 : 2
  const shown = n.toFixed(decimals)
  return {
    id: qid('rt'),
    prompt: `√${shown}`,
    answer: clean(r, 2),
    displayAnswer: fmt(r),
    note: `Ignore the point: √${k * k} = ${k}. ${shown} has ${decimals} decimal places, so the root has ${decimals / 2}: ${fmt(r)}.\n${squareNote(k)}`,
  }
}

function decimalCube(): Question | null {
  const k = between(12, 49)
  if (k % 10 === 0) return null
  const r = k / 10
  const shown = ((k ** 3) / 1000).toFixed(3)
  return {
    id: qid('rt'),
    prompt: `∛${shown}`,
    answer: clean(r, 1),
    displayAnswer: fmt(r),
    note: `Ignore the point: ∛${k ** 3} = ${k}. ${shown} has 3 decimal places, so the root has 1: ${fmt(r)}.\n${cubeNote(k)}`,
  }
}

function make(level: Level, kind: Exclude<RootKind, 'mixed'>): Question | null {
  if (kind === 'square') {
    const [lo, hi] = SQ_RANGE[level]
    const r = between(lo, hi)
    return { id: qid('rt'), prompt: `√${r * r}`, answer: r, displayAnswer: String(r), note: squareNote(r) }
  }
  if (kind === 'cube') {
    const [lo, hi] = CU_RANGE[level]
    const r = between(lo, hi)
    return { id: qid('rt'), prompt: `∛${r ** 3}`, answer: r, displayAnswer: String(r), note: cubeNote(r) }
  }
  if (level === 'easy') return null // decimals start at medium
  return level === 'hard' && Math.random() < 0.4 ? decimalCube() : decimalSquare(level)
}

export function generateRootQuestions(difficulty: RootDifficulty, kind: RootKind, count: number): Question[] {
  let i = 0
  return collect(count, () => {
    const level: Level = difficulty === 'mixed' ? (['easy', 'medium', 'hard'] as Level[])[i++ % 3] : difficulty
    let k: Exclude<RootKind, 'mixed'>
    if (kind === 'mixed') k = level === 'easy' ? pick(['square', 'cube'] as const) : pick(['square', 'cube', 'decimal'] as const)
    else k = kind
    if (k === 'decimal' && level === 'easy') k = 'square' // no decimals in easy
    return make(level, k)
  })
}
