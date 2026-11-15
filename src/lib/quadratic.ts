import type { MCQQuestion } from './generators'
import { between, chance, gcd, pick, qid } from './mentalMath'

/**
 * Quadratic Equations (SBI/IBPS Prelims): two equations in x and y, pick the relation between x and y.
 * Roots are exact rationals; the relation is decided from min/max of the two root sets:
 *   min x > max y → x > y     max x < min y → x < y
 *   min x = max y → x ≥ y     max x = min y → x ≤ y     otherwise (or x = y throughout) → no relation.
 *
 * Medium and hard sessions also contain "surd" equations like 5x² + 10√5x + 25 = 0, whose roots are whole multiples of one
 * surd (here x = −√5). At least SURD_SHARE of every medium/hard session is of this kind; roots are kept as exact c√k pairs and
 * compared with integer arithmetic, never with decimals.
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

/** The relation between two root sets (index into OPTIONS), for any root type with an exact comparator. */
function relationBy<T>(xs: T[], ys: T[], c: (a: T, b: T) => number): number {
  const minX = xs.reduce((a, b) => (c(a, b) <= 0 ? a : b))
  const maxX = xs.reduce((a, b) => (c(a, b) >= 0 ? a : b))
  const minY = ys.reduce((a, b) => (c(a, b) <= 0 ? a : b))
  const maxY = ys.reduce((a, b) => (c(a, b) >= 0 ? a : b))
  if (c(minX, maxX) === 0 && c(minY, maxY) === 0 && c(minX, minY) === 0) return 4
  if (c(minX, maxY) > 0) return 0
  if (c(maxX, minY) < 0) return 2
  if (c(minX, maxY) === 0) return 1
  if (c(maxX, minY) === 0) return 3
  return 4
}
const relation = (xs: Frac[], ys: Frac[]) => relationBy(xs, ys, cmp)

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

// ---------- surd-root equations ----------

/** A root of the form c·√k, with k squarefree (2, 3, 5 or 6) so that two different k are never equal. */
interface SurdRoot {
  c: number
  k: number
}
const SURD_K = [2, 3, 5, 6] as const
/** Share of each medium/hard session that must be surd equations. */
export const SURD_SHARE = 0.4

/** Exact comparison of c₁√k₁ and c₂√k₂: by sign first, then by comparing c²k as whole numbers. */
function cmpSurd(a: SurdRoot, b: SurdRoot): number {
  const sa = Math.sign(a.c)
  const sb = Math.sign(b.c)
  if (sa !== sb) return sa - sb
  if (sa === 0) return 0
  const d = a.c * a.c * a.k - b.c * b.c * b.k
  return sa > 0 ? d : -d
}

const surdText = (r: SurdRoot) => `${r.c < 0 ? '−' : ''}${Math.abs(r.c) === 1 ? '' : Math.abs(r.c)}√${r.k}`
const approx = (r: SurdRoot) => (r.c * Math.sqrt(r.k)).toFixed(2).replace('-', '−')

interface SurdEq {
  text: string
  roots: SurdRoot[]
  work: string
}

/** A·v² − A(p+q)√k·v + A·pq·k = 0, whose roots are p√k and q√k. A ≥ 2 so the first step is always "divide through". */
function surdEq(v: string, k: number, p: number, q: number, A: number): SurdEq {
  const sum = p + q
  const prod = p * q * k
  const lin = (coef: number) => (coef === 0 ? '' : ` ${sgn(coef)} ${Math.abs(coef) === 1 ? '' : Math.abs(coef)}√${k}${v}`)
  const text = `${lead(A, `${v}²`)}${lin(-A * sum)}${tail(A * prod, '')} = 0`
  const divided = `${v}²${lin(-sum)}${tail(prod, '')} = 0`
  const factor = (r: SurdRoot) => `(${v} ${r.c < 0 ? '+' : '−'} ${surdText({ c: Math.abs(r.c), k })})`
  const roots: SurdRoot[] = [
    { c: p, k },
    { c: q, k },
  ]
  const shown = p === q ? [roots[0]] : roots
  const work = `${text} → ÷${A}: ${divided} → ${factor(roots[0])}${factor(roots[1])} = 0 → ${v} = ${shown.map(surdText).join(', ')} (≈ ${shown.map(approx).join(', ')})`
  return { text, roots, work }
}

/** Size caps, so the numbers stay as friendly as in the exam papers (their constants top out around 360). */
const SURD_LIMIT: Record<'medium' | 'hard', { span: number; maxA: number; maxC: number }> = {
  medium: { span: 6, maxA: 8, maxC: 500 },
  hard: { span: 9, maxA: 12, maxC: 720 },
}

/** Picks the multiples (p, q) for x and for y so that the pair has the wanted relation. */
function surdRoots(span: number, target: number): { x: [number, number]; y: [number, number]; sameK: boolean } | null {
  const nz = () => {
    let n = 0
    while (n === 0) n = between(-span, span)
    return n
  }
  const second = (first: number) => (chance(0.12) ? first : nz())
  if (target === 1 || target === 3) {
    // the roots must touch: x ≥ y needs min x = max y (= s), x ≤ y needs max x = min y (= s)
    const s = nz()
    const away = (dir: 1 | -1) => {
      for (let i = 0; i < 50; i++) {
        const n = nz()
        if ((n - s) * dir >= 0) return n
      }
      return s
    }
    const x: [number, number] = target === 1 ? [s, away(1)] : [s, away(-1)]
    const y: [number, number] = target === 1 ? [s, away(-1)] : [s, away(1)]
    if (x[1] === s && y[1] === s) return null // two double roots at s would be plain equality
    return { x, y, sameK: true }
  }
  const x1 = nz()
  const y1 = nz()
  return { x: [x1, second(x1)], y: [y1, second(y1)], sameK: false }
}

function makeSurd(level: 'medium' | 'hard', target: number): MCQQuestion | null {
  const { span, maxA, maxC } = SURD_LIMIT[level]
  const picked = surdRoots(span, target)
  if (!picked) return null
  // p + q = 0 would drop the √ term (5y² − 135 = 0) and the equation would no longer look like a surd one
  if (picked.x[0] + picked.x[1] === 0 || picked.y[0] + picked.y[1] === 0) return null
  const kx = pick(SURD_K)
  const ky = picked.sameK || chance(level === 'hard' ? 0.35 : 0.5) ? kx : pick(SURD_K)
  const ceilA = (p: number, q: number, k: number) => Math.min(maxA, Math.floor(maxC / (Math.abs(p * q) * k)))
  const ax = ceilA(picked.x[0], picked.x[1], kx)
  const ay = ceilA(picked.y[0], picked.y[1], ky)
  if (ax < 2 || ay < 2) return null
  const x = surdEq('x', kx, picked.x[0], picked.x[1], between(2, ax))
  const y = surdEq('y', ky, picked.y[0], picked.y[1], between(2, ay))
  const rel = relationBy(x.roots, y.roots, cmpSurd)
  if (rel !== target) return null
  const rootsText = (e: SurdEq, v: string) => `${v} = ${[...new Set(e.roots.map(surdText))].join(', ')}`
  return {
    id: qid('qd'),
    instruction: `Quadratic equations · ${level} · surds`,
    context: `I. ${x.text}\nII. ${y.text}`,
    term: 'What is the relation between x and y?',
    correctMeaning: OPTIONS[rel],
    options: [...OPTIONS],
    hint: 'Divide through by the leading coefficient. The roots are multiples of one surd, p√k and q√k: p + q is minus the coefficient of the √ term, and p × q × k is the constant.',
    explanation: `I. ${x.work}\nII. ${y.work}\n${rootsText(x, 'x')} and ${rootsText(y, 'y')} → ${OPTIONS[rel]}.`,
  }
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

function shuffled<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * One question per slot. Surd equations go only on medium/hard slots (every slot of a medium or hard session, the medium and
 * hard thirds of a mixed one): at least ceil(40%) of the session and up to 50%, never on easy slots, at random positions.
 */
export function generateQuadraticQuestions(difficulty: QuadraticDifficulty, count: number): MCQQuestion[] {
  const levels: Level[] = Array.from({ length: count }, (_, i) => (difficulty === 'mixed' ? (['easy', 'medium', 'hard'] as Level[])[i % 3] : difficulty))
  const eligible = levels.flatMap((l, i) => (l === 'easy' ? [] : [i]))
  const quota = Math.min(eligible.length, between(Math.ceil(count * SURD_SHARE), Math.ceil(count * (SURD_SHARE + 0.1))))
  const surdSlots = new Set(shuffled(eligible).slice(0, quota))

  const out: MCQQuestion[] = []
  for (let i = 0; i < count; i++) {
    const level = levels[i]
    let q: MCQQuestion | null = null
    let target = pickTarget()
    for (let t = 0; t < 3000 && !q; t++) {
      if (t > 0 && t % 400 === 0) target = pickTarget() // a relation can be rare for a given draw: try another rather than stall
      q = surdSlots.has(i) && level !== 'easy' ? makeSurd(level, target) : make(level, target)
    }
    if (q) out.push(q)
  }
  return out
}

