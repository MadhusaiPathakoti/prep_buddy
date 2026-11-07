import type { Question } from './types'
import { between, chance, collect, intQuestion, pick } from './mentalMath'

/**
 * Multiply Near a Base: both numbers sit close to a round base (100, 1000, 50 …), so
 *   a × b = (a + d₂) × base + d₁ × d₂        where d₁ = a − base, d₂ = b − base.
 * That is the "cross-add, then multiply the gaps" method: 97 × 94 → (97 − 6) | (−3 × −6) → 91|18.
 */

export type NearBaseDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'
type Level = 'easy' | 'medium' | 'hard'

const signed = (n: number) => (n < 0 ? `(−${Math.abs(n)})` : String(n))
const gap = (n: number, base: number) => (n < base ? `${base} − ${base - n}` : `${base} + ${n - base}`)

function noteFor(a: number, b: number, base: number, equidistant: boolean): string {
  const d1 = a - base
  const d2 = b - base
  const cross = a + d2
  const product = a * b
  const lines = [
    `Base ${base}: ${a} = ${gap(a, base)}, ${b} = ${gap(b, base)}.`,
    `Cross-add: ${a} ${d2 < 0 ? '−' : '+'} ${Math.abs(d2)} = ${cross} (or ${b} ${d1 < 0 ? '−' : '+'} ${Math.abs(d1)} = ${cross}).`,
    `Gaps multiply: ${signed(d1)} × ${signed(d2)} = ${d1 * d2}.`,
    `${cross} × ${base} ${d1 * d2 < 0 ? '−' : '+'} ${Math.abs(d1 * d2)} = ${cross * base} ${d1 * d2 < 0 ? '−' : '+'} ${Math.abs(d1 * d2)} = ${product}.`,
  ]
  if (equidistant) lines.push(`Shortcut: the numbers are equally far from ${base}, so ${a} × ${b} = ${base}² − ${Math.abs(d1)}² = ${base * base} − ${d1 * d1}.`)
  return lines.join('\n')
}

function make(level: Level): Question | null {
  let base: number
  let a: number
  let b: number
  let equidistant = false
  if (level === 'easy') {
    base = 100
    const sign = chance(0.5) ? -1 : 1
    a = base + sign * between(1, 9)
    b = base + sign * between(1, 9)
  } else if (level === 'medium') {
    if (chance(0.7)) {
      base = 100
      a = base + (chance(0.5) ? -1 : 1) * between(1, 15)
      b = base + (chance(0.5) ? -1 : 1) * between(1, 15)
    } else {
      base = 50
      const sign = chance(0.5) ? -1 : 1
      a = base + sign * between(1, 7)
      b = base + sign * between(1, 7)
    }
  } else {
    const kind = pick(['thousand', 'thousand', 'wide', 'equi'] as const)
    if (kind === 'thousand') {
      base = 1000
      a = base + (chance(0.5) ? -1 : 1) * between(2, 30)
      b = base + (chance(0.5) ? -1 : 1) * between(2, 30)
    } else if (kind === 'wide') {
      base = pick([100, 200, 500] as const)
      const span = base === 100 ? 25 : 20
      a = base + (chance(0.5) ? -1 : 1) * between(8, span)
      b = base + (chance(0.5) ? -1 : 1) * between(8, span)
    } else {
      base = pick([50, 100, 200, 500, 1000] as const)
      const d = between(2, base >= 500 ? 30 : 15)
      a = base - d
      b = base + d
      equidistant = true
    }
  }
  if (a === b && chance(0.7)) return null // keep squares occasional
  if (chance(0.5)) [a, b] = [b, a]
  return intQuestion('nb', `${a} × ${b}`, a * b, noteFor(a, b, base, equidistant))
}

export function generateNearBaseQuestions(difficulty: NearBaseDifficulty, count: number): Question[] {
  let i = 0
  return collect(count, () => {
    const level: Level = difficulty === 'mixed' ? (['easy', 'medium', 'hard'] as Level[])[i++ % 3] : difficulty
    return make(level)
  })
}
