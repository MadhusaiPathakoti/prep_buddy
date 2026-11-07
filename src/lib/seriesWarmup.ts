import type { Question } from './types'
import { between, chance, collect, pick, qid } from './mentalMath'

/**
 * Series Warm-up: instant recognition of the standard number series. Five terms are shown; type the next one.
 *
 * A series is only used when every pattern in our family list (all offsets, plus ×m + c recurrences, add-the-previous-two
 * and degree-3 polynomial fits) that reproduces the shown terms predicts the same next term — so the answer is unique.
 */

export type SeriesWarmupDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'
type Level = 'easy' | 'medium' | 'hard'

const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97]
const sum = (n: number, f: (j: number) => number) => {
  let s = 0
  for (let j = 1; j <= n; j++) s += f(j)
  return s
}
const fact = (k: number): number => (k <= 1 ? 1 : k * fact(k - 1))

interface Family {
  id: string
  level: Level
  label: string
  f: (k: number) => number
  start: [number, number]
  /** How the rule reads, used in the worked note: "k² for k = 4, 5, 6 …" */
  rule: string
}

const FAMILIES: Family[] = [
  { id: 'sq', level: 'easy', label: 'squares', f: (k) => k * k, start: [2, 9], rule: 'k²' },
  { id: 'cu', level: 'easy', label: 'cubes', f: (k) => k ** 3, start: [2, 6], rule: 'k³' },
  { id: 'tri', level: 'easy', label: 'triangular numbers', f: (k) => (k * (k + 1)) / 2, start: [2, 9], rule: 'k(k+1)/2' },
  { id: 'p2', level: 'easy', label: 'powers of 2', f: (k) => 2 ** k, start: [1, 7], rule: '2ᵏ' },
  { id: 'p3', level: 'easy', label: 'powers of 3', f: (k) => 3 ** k, start: [1, 5], rule: '3ᵏ' },
  { id: 'pr', level: 'easy', label: 'primes', f: (k) => PRIMES[k], start: [0, 8], rule: 'the k-th prime' },
  { id: 'sqp1', level: 'easy', label: 'squares plus 1', f: (k) => k * k + 1, start: [2, 9], rule: 'k² + 1' },
  { id: 'sqm1', level: 'easy', label: 'squares minus 1', f: (k) => k * k - 1, start: [2, 9], rule: 'k² − 1' },
  { id: 'n2pn', level: 'easy', label: 'n² + n', f: (k) => k * k + k, start: [1, 8], rule: 'k² + k' },
  { id: 'n2mn', level: 'easy', label: 'n² − n', f: (k) => k * k - k, start: [2, 9], rule: 'k² − k' },
  { id: 'k2k', level: 'easy', label: 'k × (k + 2)', f: (k) => k * (k + 2), start: [1, 8], rule: 'k(k+2)' },
  { id: 'cup1', level: 'medium', label: 'cubes plus 1', f: (k) => k ** 3 + 1, start: [2, 6], rule: 'k³ + 1' },
  { id: 'cum1', level: 'medium', label: 'cubes minus 1', f: (k) => k ** 3 - 1, start: [2, 6], rule: 'k³ − 1' },
  { id: 'c3pk', level: 'medium', label: 'k³ + k', f: (k) => k ** 3 + k, start: [1, 6], rule: 'k³ + k' },
  { id: 'c3mk', level: 'medium', label: 'k³ − k', f: (k) => k ** 3 - k, start: [2, 6], rule: 'k³ − k' },
  { id: 'prsq', level: 'medium', label: 'squares of primes', f: (k) => PRIMES[k] ** 2, start: [0, 6], rule: '(k-th prime)²' },
  { id: 'fact', level: 'medium', label: 'factorials', f: (k) => fact(k), start: [1, 4], rule: 'k!' },
  { id: 'k3', level: 'medium', label: 'k(k+1)(k+2)', f: (k) => k * (k + 1) * (k + 2), start: [1, 5], rule: 'k(k+1)(k+2)' },
  { id: 'cumsq', level: 'medium', label: 'running total of squares', f: (k) => sum(k, (j) => j * j), start: [1, 3], rule: '1² + 2² + … + k²' },
  { id: 'cumpr', level: 'medium', label: 'running total of primes', f: (k) => sum(k, (j) => PRIMES[j - 1]), start: [1, 5], rule: 'sum of the first k primes' },
  { id: 'cumcu', level: 'medium', label: 'running total of cubes', f: (k) => sum(k, (j) => j ** 3), start: [1, 3], rule: '1³ + 2³ + … + k³' },
  { id: 'sqs', level: 'medium', label: 'sum of consecutive squares', f: (k) => k * k + (k + 1) * (k + 1), start: [0, 6], rule: 'k² + (k+1)²' },
  { id: 'k4', level: 'hard', label: 'fourth powers', f: (k) => k ** 4, start: [2, 5], rule: 'k⁴' },
  { id: 'p2pk', level: 'hard', label: '2ᵏ + k', f: (k) => 2 ** k + k, start: [2, 6], rule: '2ᵏ + k' },
  { id: 'p2mk', level: 'hard', label: '2ᵏ − k', f: (k) => 2 ** k - k, start: [2, 6], rule: '2ᵏ − k' },
  { id: 'prpr', level: 'hard', label: 'products of consecutive primes', f: (k) => PRIMES[k] * PRIMES[k + 1], start: [0, 6], rule: 'pₖ × pₖ₊₁' },
  { id: 'c3p2', level: 'hard', label: 'k³ + k²', f: (k) => k ** 3 + k * k, start: [1, 5], rule: 'k³ + k²' },
  { id: 'factp1', level: 'hard', label: 'factorial plus 1', f: (k) => fact(k) + 1, start: [1, 4], rule: 'k! + 1' },
  { id: 'k2k1', level: 'hard', label: 'k² × (k + 1)', f: (k) => k * k * (k + 1), start: [1, 5], rule: 'k²(k+1)' },
]

// ---------- hypotheses: every pattern that could explain a list of terms ----------

type Predictor = (t: number[]) => number | null

function allHypotheses(): Predictor[] {
  const out: Predictor[] = []
  for (const fam of FAMILIES) {
    for (let o = 0; o <= 14; o++) {
      out.push((t) => {
        const f = (k: number) => {
          try {
            return fam.f(k)
          } catch {
            return NaN
          }
        }
        for (let i = 0; i < t.length; i++) if (f(o + i) !== t[i]) return null
        const next = f(o + t.length)
        return Number.isFinite(next) ? next : null
      })
    }
  }
  for (let m = 1; m <= 6; m++) {
    for (let c = -9; c <= 12; c++) {
      out.push((t) => {
        for (let i = 0; i + 1 < t.length; i++) if (m * t[i] + c !== t[i + 1]) return null
        return m * t[t.length - 1] + c
      })
    }
  }
  // add the previous two terms (optionally plus a constant)
  for (let c = 0; c <= 5; c++) {
    out.push((t) => {
      for (let i = 2; i < t.length; i++) if (t[i - 1] + t[i - 2] + c !== t[i]) return null
      return t[t.length - 1] + t[t.length - 2] + c
    })
  }
  // t(n+1) = n·t(n) + c
  for (let c = 0; c <= 3; c++) {
    out.push((t) => {
      for (let i = 0; i + 1 < t.length; i++) if ((i + 1) * t[i] + c !== t[i + 1]) return null
      return t.length * t[t.length - 1] + c
    })
  }
  // polynomials of degree ≤ 3 through every shown term
  out.push((t) => {
    if (t.length < 5) return null
    let row = t.slice()
    const lasts: number[] = [row[row.length - 1]]
    for (let d = 0; d < 4; d++) {
      row = row.slice(1).map((v, i) => v - row[i])
      lasts.push(row[row.length - 1])
    }
    if (row.some((v) => v !== 0)) return null
    return lasts.reduce((a, b) => a + b, 0)
  })
  return out
}
const HYPS = allHypotheses()

const predictions = (terms: number[]): Set<number> => {
  const s = new Set<number>()
  for (const h of HYPS) {
    const p = h(terms)
    if (p !== null) s.add(p)
  }
  return s
}

// ---------- building a question ----------

const LEVEL_FAMS: Record<Level, Family[]> = {
  easy: FAMILIES.filter((f) => f.level === 'easy'),
  medium: FAMILIES.filter((f) => f.level !== 'hard'),
  hard: FAMILIES.filter((f) => f.level !== 'easy'),
}

function describe(fam: Family, k0: number, terms: number[], answer: number): string {
  // the prime families index from 0 internally, but people count primes from 1 (2 is the 1st prime)
  const shift = fam.id === 'prsq' || fam.id === 'prpr' ? 1 : 0
  const ks = terms.map((_, i) => k0 + i + shift)
  const nextK = k0 + terms.length + shift
  return `${fam.label[0].toUpperCase()}${fam.label.slice(1)}: ${fam.rule}${fam.id === 'pr' ? '' : ` for k = ${ks.join(', ')}`} → ${terms.join(', ')}.\nNext: k = ${nextK} gives ${answer}.`
}

function fromFamily(level: Level): Question | null {
  const fam = pick(LEVEL_FAMS[level])
  const k0 = between(fam.start[0], fam.start[1])
  const terms = Array.from({ length: 5 }, (_, i) => fam.f(k0 + i))
  const answer = fam.f(k0 + 5)
  return finalise(terms, answer, describe(fam, k0, terms, answer))
}

function fromRecurrence(level: Level): Question | null {
  const kind = pick(level === 'hard' ? (['mul', 'fibc', 'nmul'] as const) : (['mul', 'fib'] as const))
  const terms: number[] = []
  let note = ''
  if (kind === 'mul') {
    const m = between(2, level === 'hard' ? 5 : 4)
    const c = between(level === 'hard' ? -5 : -3, level === 'hard' ? 9 : 6)
    let t = between(1, 8)
    for (let i = 0; i < 6; i++) {
      terms.push(t)
      t = m * t + c
    }
    note = `Each term = previous × ${m} ${c < 0 ? '−' : '+'} ${Math.abs(c)}: ${terms.slice(0, 5).join(', ')} → next ${terms[5]}.`
  } else if (kind === 'fib' || kind === 'fibc') {
    const c = kind === 'fibc' ? between(1, 3) : 0
    let a = between(1, 6)
    let b = between(2, 9)
    for (let i = 0; i < 6; i++) {
      terms.push(a)
      ;[a, b] = [b, a + b + c]
    }
    note = `Each term = sum of the previous two${c ? ` + ${c}` : ''}: ${terms.slice(0, 5).join(', ')} → next ${terms[5]}.`
  } else {
    const c = between(0, 2)
    let t = between(1, 3)
    for (let i = 0; i < 6; i++) {
      terms.push(t)
      t = (i + 1) * t + c
    }
    note = `Term(n+1) = n × term(n) + ${c}: ${terms.slice(0, 5).join(', ')} → next ${terms[5]}.`
  }
  return finalise(terms.slice(0, 5), terms[5], note)
}

/** Two interleaved series: positions 1, 3, 5, 7 follow one rule and 2, 4, 6, 8 another. */
function interleaved(): Question | null {
  const sub = (): { f: (i: number) => number; text: string } => {
    const kind = pick(['arith', 'arith', 'sq', 'geo'] as const)
    if (kind === 'arith') {
      const a = between(2, 20)
      const d = between(2, 9)
      return { f: (i) => a + d * i, text: `+${d} each time` }
    }
    if (kind === 'sq') {
      const k = between(2, 6)
      return { f: (i) => (k + i) ** 2, text: 'consecutive squares' }
    }
    const a = between(2, 6)
    const r = pick([2, 3])
    return { f: (i) => a * r ** i, text: `×${r} each time` }
  }
  const A = sub()
  const B = sub()
  const terms: number[] = []
  for (let i = 0; i < 8; i++) terms.push(i % 2 === 0 ? A.f(i / 2) : B.f((i - 1) / 2))
  const shown = terms.slice(0, 7)
  const answer = terms[7]
  // alternative explanations must not disagree; the interleaved reading itself is the intended one
  const preds = predictions(shown)
  preds.delete(answer)
  if (preds.size > 0 || terms.some((t) => t > 99999 || t < 1)) return null
  // the two halves must be different rules, or it is just one ordinary series
  if (A.text === B.text) return null
  return {
    id: qid('sw'),
    prompt: shown.join(', '),
    answer,
    displayAnswer: String(answer),
    note: `Two series are interleaved.\n1st, 3rd, 5th, 7th terms: ${[0, 2, 4, 6].map((i) => terms[i]).join(', ')} (${A.text}).\n2nd, 4th, 6th terms: ${[1, 3, 5].map((i) => terms[i]).join(', ')} (${B.text}) → next ${answer}.`,
  }
}

function finalise(terms: number[], answer: number, note: string): Question | null {
  if (terms.some((t) => !Number.isFinite(t) || t < 1 || t > 99999) || !Number.isFinite(answer) || answer < 1 || answer > 99999) return null
  if (new Set(terms).size < 4) return null
  const preds = predictions(terms)
  if (preds.size !== 1 || !preds.has(answer)) return null
  return { id: qid('sw'), prompt: terms.join(', '), answer, displayAnswer: String(answer), note }
}

function make(level: Level): Question | null {
  if (level === 'easy') return fromFamily('easy')
  if (level === 'medium') return chance(0.2) ? fromRecurrence('medium') : fromFamily('medium')
  const r = Math.random()
  if (r < 0.3) return interleaved()
  if (r < 0.5) return fromRecurrence('hard')
  return fromFamily('hard')
}

export function generateSeriesWarmupQuestions(difficulty: SeriesWarmupDifficulty, count: number): Question[] {
  let i = 0
  return collect(count, () => make(difficulty === 'mixed' ? (['easy', 'medium', 'hard'] as Level[])[i++ % 3] : difficulty))
}
