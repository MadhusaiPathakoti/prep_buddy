import type { MCQQuestion } from './generators'
import { between, chance, gcd, pick, qid } from './mentalMath'

/**
 * Quadratic Equations (SBI/IBPS Prelims): two equations in x and y, pick the relation between x and y.
 * Roots are exact rationals; the relation is decided from min/max of the two root sets:
 *   min x > max y → x > y     max x < min y → x < y
 *   min x = max y → x ≥ y     max x = min y → x ≤ y     otherwise (or x = y throughout) → no relation.
 */

export type QuadraticDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'
type Level = 'easy' | 'medium' | 'hard'

interface Frac {
  n: number
  d: number // > 0, lowest terms
}
const frac = (n: number, d = 1): Frac => {
  const g = gcd(n, d) || 1
  const s = d < 0 ? -1 : 1
  return { n: (s * n) / g, d: (s * d) / g }
}
const cmp = (a: Frac, b: Frac) => a.n * b.d - b.n * a.d
const fracText = (f: Frac) => (f.d === 1 ? `${f.n}` : `${f.n}/${f.d}`).replace('-', '−')

const OPTIONS = ['x > y', 'x ≥ y', 'x < y', 'x ≤ y', 'x = y or the relation cannot be established'] as const

function relation(xs: Frac[], ys: Frac[]): number {
  const minX = xs.reduce((a, b) => (cmp(a, b) <= 0 ? a : b))
  const maxX = xs.reduce((a, b) => (cmp(a, b) >= 0 ? a : b))
  const minY = ys.reduce((a, b) => (cmp(a, b) <= 0 ? a : b))
  const maxY = ys.reduce((a, b) => (cmp(a, b) >= 0 ? a : b))
  if (cmp(minX, maxX) === 0 && cmp(minY, maxY) === 0 && cmp(minX, minY) === 0) return 4
  if (cmp(minX, maxY) > 0) return 0
  if (cmp(maxX, minY) < 0) return 2
  if (cmp(minX, maxY) === 0) return 1
  if (cmp(maxX, minY) === 0) return 3
  return 4
}

// ---------- building one equation ----------

const sgn = (n: number) => (n < 0 ? '−' : '+')
/** "+ 5x" style tail term, or "" when the coefficient is 0. */
function tail(coef: number, sym: string): string {
  if (coef === 0) return ''
  const a = Math.abs(coef)
  return ` ${sgn(coef)} ${a === 1 && sym ? '' : a}${sym}`
}
const lead = (coef: number, sym: string): string => {
  const a = Math.abs(coef)
  return `${coef < 0 ? '−' : ''}${a === 1 && sym ? '' : a}${sym}`
}

interface Eq {
  text: string
  roots: Frac[]
  work: string
}

function build(v: string, level: Level): Eq {
  const sq = `${v}²`
  let A = 1
  let r1: Frac
  let r2: Frac
  const span = level === 'easy' ? 9 : level === 'medium' ? 14 : 12
  const pickRoot = () => between(-span, span)
  let work: string
  if (level === 'hard' && chance(0.7)) {
    // a > 1: (q1·v − p1)(q2·v − p2)
    const q1 = pick([1, 2, 3, 4])
    const q2 = pick([2, 3, 5])
    const p1 = between(-9, 9) || 1
    const p2 = between(-9, 9) || 2
    r1 = frac(p1, q1)
    r2 = frac(p2, q2)
    A = q1 * q2
    const B = -(q1 * p2 + q2 * p1)
    const C = p1 * p2
    work = `(${lead(q1, v)} ${sgn(-p1)} ${Math.abs(p1)})(${lead(q2, v)} ${sgn(-p2)} ${Math.abs(p2)}) = 0 → ${v} = ${fracText(r1)}, ${fracText(r2)}`
    return finish(v, sq, A, B, C, [r1, r2], work, level)
  }
  const double = level !== 'easy' && chance(0.12)
  const a = pickRoot()
  const b = double ? a : pickRoot()
  r1 = frac(a)
  r2 = frac(b)
  const B = -(a + b)
  const C = a * b
  if (level === 'easy' && chance(0.2) && a !== 0) {
    // v² = k²
    const k = Math.abs(a) || 3
    return { text: chance(0.5) ? `${sq} = ${k * k}` : `${sq} − ${k * k} = 0`, roots: [frac(-k), frac(k)], work: `${v}² = ${k * k} → ${v} = ±${k}` }
  }
  const factor = (r: number) => (r === 0 ? v : `(${v} ${sgn(-r)} ${Math.abs(r)})`)
  work = `${a === b ? `${factor(a)}²` : `${factor(a)}${factor(b)}`} = 0 → ${v} = ${[r1, r2].filter((_, i) => i === 0 || a !== b).map(fracText).join(', ')}`
  return finish(v, sq, A, B, C, [r1, r2], work, level)
}

/** Lay out A·v² + B·v + C = 0 in standard or rearranged form. */
function finish(v: string, sq: string, A: number, B: number, C: number, roots: Frac[], work: string, level: Level): Eq {
  const standard = `${lead(A, sq)}${tail(B, v)}${tail(C, '')} = 0`
  if (level === 'easy' || chance(0.35)) return { text: standard, roots, work }
  const style = pick(['moveConstant', 'moveLinear', 'splitLinear'] as const)
  if (style === 'moveConstant' && C !== 0) return { text: `${lead(A, sq)}${tail(B, v)} = ${-C}`.replace('= -', '= −'), roots, work: `${standard}; ${work}` }
  if (style === 'moveLinear' && B !== 0) {
    const rhs = `${lead(-B, v)}${tail(-C, '')}`
    return { text: `${lead(A, sq)} = ${rhs}`, roots, work: `${standard}; ${work}` }
  }
  // split the linear term over both sides when possible: A v² + (B−k) v = −k v − C … only when B is even
  if (B !== 0 && B % 2 === 0) {
    const half = B / 2
    return { text: `${lead(A, sq)}${tail(half, v)} = ${lead(-half, v)}${tail(-C, '')}`, roots, work: `${standard}; ${work}` }
  }
  return { text: standard, roots, work }
}

function pair(level: Level): { x: Eq; y: Eq } {
  return { x: build('x', level), y: build('y', level) }
}

function make(level: Level, target: number): MCQQuestion | null {
  const { x, y } = pair(level)
  const rel = relation(x.roots, y.roots)
  if (rel !== target) return null
  const rootsText = (e: Eq, v: string) => `${v} = ${[...new Set(e.roots.map(fracText))].join(', ')}`
  return {
    id: qid('qd'),
    instruction: `Quadratic equations · ${level}`,
    context: `I. ${x.text}\nII. ${y.text}`,
    term: 'What is the relation between x and y?',
    correctMeaning: OPTIONS[rel],
    options: [...OPTIONS],
    hint: 'Factorise each equation to get both roots, then compare the smallest and largest root of x with those of y.',
    explanation: `I. ${x.work}\nII. ${y.work}\n${rootsText(x, 'x')} and ${rootsText(y, 'y')} → ${OPTIONS[rel]}.`,
  }
}

const pickTarget = () => {
  const r = Math.random()
  return r < 0.24 ? 0 : r < 0.48 ? 2 : r < 0.64 ? 1 : r < 0.8 ? 3 : 4
}

export function generateQuadraticQuestions(difficulty: QuadraticDifficulty, count: number): MCQQuestion[] {
  const out: MCQQuestion[] = []
  let guard = 0
  while (out.length < count && guard++ < count * 30) {
    const level: Level = difficulty === 'mixed' ? (['easy', 'medium', 'hard'] as Level[])[out.length % 3] : difficulty
    const target = pickTarget()
    for (let t = 0; t < 400; t++) {
      const q = make(level, target)
      if (q) {
        out.push(q)
        break
      }
    }
  }
  return out.slice(0, count)
}

