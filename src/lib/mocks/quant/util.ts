// Shared helpers for the Quant generators: exact fractions, retry/self-check plumbing and option layout.
import type { Rng } from '../rng'
import type { Group, MockDifficulty, QuantTopicId, QuestionDraft } from '../types'
import { NONE_OF_THESE, answerLine, buildOptions, fmtNum } from '../options'

/** Thrown to make the surrounding template retry with a fresh random draw (never surfaces to callers). */
export class Reject extends Error {}
export function need(cond: unknown, why = 'rejected'): asserts cond {
  if (!cond) throw new Reject(why)
}
/** A genuine self-check failure: two independent computations disagreed. Must reach the harness. */
export function ensure(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`SELF-CHECK FAILED: ${msg}`)
}

// ---------------------------------------------------------------- exact rationals
export interface Frac {
  n: number
  d: number
}
export function gcd(a: number, b: number): number {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b) [a, b] = [b, a % b]
  return a
}
export function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b
}
export function F(n: number, d = 1): Frac {
  if (d === 0 || !Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw new Reject('bad fraction')
  if (d < 0) {
    n = -n
    d = -d
  }
  const g = gcd(n, d) || 1
  return { n: n / g, d: d / g }
}
export const fadd = (a: Frac, b: Frac): Frac => F(a.n * b.d + b.n * a.d, a.d * b.d)
export const fsub = (a: Frac, b: Frac): Frac => F(a.n * b.d - b.n * a.d, a.d * b.d)
export const fmul = (a: Frac, b: Frac): Frac => F(a.n * b.n, a.d * b.d)
export const fdiv = (a: Frac, b: Frac): Frac => F(a.n * b.d, a.d * b.n)
export const fcmp = (a: Frac, b: Frac): number => Math.sign(a.n * b.d - b.n * a.d)
export const feq = (a: Frac, b: Frac): boolean => a.n === b.n && a.d === b.d
export const fval = (a: Frac): number => a.n / a.d
export const fint = (a: Frac): boolean => a.d === 1
export const fsum = (xs: Frac[]): Frac => xs.reduce(fadd, F(0))
/** Decimal literal such as 12.5 or 0.25 -> exact fraction. */
export function fdec(x: number, places = 4): Frac {
  const m = 10 ** places
  return F(Math.round(x * m), m)
}
export function terminating(f: Frac, maxDec: number): boolean {
  return 10 ** maxDec % f.d === 0
}
/** Exact decimal string of a terminating fraction (trailing zeros trimmed). */
export function decStr(f: Frac, maxDec = 2): string {
  need(terminating(f, maxDec), 'non-terminating')
  const scaled = (f.n * 10 ** maxDec) / f.d
  return fmtNum(scaled / 10 ** maxDec, maxDec)
}
/** Decimal places needed to show a terminating fraction (0 for integers). */
export function decOf(f: Frac): number {
  return f.d === 1 ? 0 : 10 % f.d === 0 ? 1 : 2
}
/** "a/b" or an integer. */
export function fracStr(f: Frac): string {
  return f.d === 1 ? String(f.n) : `${f.n}/${f.d}`
}
export function ratioStr(...xs: number[]): string {
  const g = xs.reduce((a, b) => gcd(a, b), 0) || 1
  return xs.map((x) => x / g).join(' : ')
}

// ---------------------------------------------------------------- small utilities
export const NAMES = ['Ramesh', 'Suresh', 'Mahesh', 'Anil', 'Sunil', 'Rohit', 'Amit', 'Vikas', 'Deepak', 'Kiran', 'Rahul', 'Manoj', 'Sanjay', 'Ajay', 'Vijay', 'Nitin', 'Arun', 'Pooja', 'Neha', 'Priya', 'Anita', 'Sunita', 'Meena', 'Rekha', 'Kavita', 'Divya', 'Sneha', 'Ritu', 'Seema', 'Geeta', 'Varun', 'Tarun', 'Harish', 'Gopal', 'Naveen', 'Mohan', 'Sohan', 'Lalit', 'Ashok', 'Dinesh']
export function pickNames(rng: Rng, n: number): string[] {
  return rng.sample(NAMES, n)
}
const MEN = ['Ramesh', 'Suresh', 'Mahesh', 'Anil', 'Sunil', 'Rohit', 'Amit', 'Vikas', 'Deepak', 'Kiran', 'Rahul', 'Manoj', 'Sanjay', 'Ajay', 'Vijay', 'Nitin', 'Arun', 'Varun', 'Tarun', 'Harish', 'Gopal', 'Naveen', 'Mohan', 'Sohan', 'Lalit', 'Ashok', 'Dinesh']
/** Male names, for stems that use "he/his". */
export function pickMen(rng: Rng, n: number): string[] {
  return rng.sample(MEN, n)
}
/** Random multiple of `step` in [min, max]. */
export function rstep(rng: Rng, min: number, max: number, step: number): number {
  const lo = Math.ceil(min / step)
  const hi = Math.floor(max / step)
  need(hi >= lo, 'empty range')
  return rng.int(lo, hi) * step
}
export function wpick<T>(rng: Rng, items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((s, [, w]) => s + w, 0)
  let r = rng.next() * total
  for (const [v, w] of items) {
    r -= w
    if (r < 0) return v
  }
  return items[items.length - 1][0]
}
export const inr = (n: number | string): string => `₹${n}`
export function divisorsOf(n: number): number[] {
  const out: number[] = []
  for (let i = 1; i <= n; i++) if (n % i === 0) out.push(i)
  return out
}
export function roundTo(x: number, dec: number): number {
  return Number(x.toFixed(dec))
}
/** Display with a true minus sign. */
export const disp = (s: string): string => s.replace(/^-/, '−')
export function fact(n: number): number {
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}
export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  let r = 1
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i
  return Math.round(r)
}

// ---------------------------------------------------------------- question assembly
export interface NumSpec {
  topic: QuantTopicId
  stem: string
  /** The exact answer. A Frac is formatted exactly; a number must be representable in `dec` places. */
  ans: number | Frac
  /** Values common mistakes produce (they are filtered for duplicates / equality with the answer). */
  wrong?: (number | Frac)[]
  dec?: number
  pre?: string
  post?: string
  why: string
  /** 'asc' | 'none' forces the layout; default is ~55% ascending, otherwise shuffled. */
  sort?: 'asc' | 'none'
  /** Probability that option E is "None of these". */
  none?: number
  allowNeg?: boolean
}

/** Rounds a positive number to 1, 2, 5 or 10 times a power of ten. */
function niceStep(x: number): number {
  const p = 10 ** Math.floor(Math.log10(x))
  const m = x / p
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p
}

function exactNumStr(x: number | Frac, dec: number): string {
  if (typeof x !== 'number') return decStr(x, dec)
  const scaled = x * 10 ** dec
  need(Number.isFinite(x) && Math.abs(scaled - Math.round(scaled)) < 1e-6, 'answer not representable')
  return fmtNum(x, dec)
}

/** Numeric-answer question. Correct position is uniform, also in the ascending layout (rank chosen first). */
export function numQ(rng: Rng, o: NumSpec): QuestionDraft {
  const dec = o.dec ?? 0
  const pre = o.pre ?? ''
  const post = o.post ?? ''
  const ansS = exactNumStr(o.ans, dec)
  const ansV = typeof o.ans === 'number' ? o.ans : fval(o.ans)
  const seen = new Set<string>([ansS])
  const step = 10 ** -dec
  type Cand = { v: number; s: string }
  const below: Cand[] = []
  const above: Cand[] = []
  const push = (x: number): void => {
    if (!Number.isFinite(x)) return
    const v = roundTo(x, dec)
    if (ansV > 0 && v <= 0 && !o.allowNeg) return
    if (Math.abs(v) > 1e9) return
    const s = fmtNum(v, dec)
    if (seen.has(s)) return
    seen.add(s)
    ;(v < ansV ? below : above).push({ v, s })
  }
  for (const w of rng.shuffle(o.wrong ?? [])) push(typeof w === 'number' ? w : fval(w))
  const mistakeBelow = below.length
  const mistakeAbove = above.length
  let guard = 0
  const rels = [0.05, 0.08, 0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5]
  const unit = Math.max(step, niceStep(Math.max(step, Math.abs(ansV) * 0.06)))
  while ((below.length < 8 || above.length < 8) && guard++ < 600) {
    const sgn = below.length < 8 && (above.length >= 8 || rng.chance(0.5)) ? -1 : 1
    const mag = Math.max(step, Math.abs(ansV) * rng.pick(rels))
    const bump = rng.chance(0.55) ? unit * rng.int(1, 5) : mag
    push(ansV + sgn * bump)
  }
  need(below.length + above.length >= 4, 'not enough distractors')
  const useNone = o.none !== undefined && rng.chance(o.none)
  const noneCorrect = useNone && rng.chance(0.5)
  const slots = useNone ? 4 : 5 // numeric options shown
  const layoutAsc = (o.sort ?? (rng.chance(0.55) ? 'asc' : 'none')) === 'asc'
  // options must be visibly different: at least 2% of the answer (and one unit) apart
  const sep = Math.max(step, Math.abs(ansV) * 0.02)
  const pickSide = (arr: Cand[], nMist: number, k: number, taken: number[]): string[] | null => {
    // mistake-derived entries come first in each array (fillers were appended later)
    const ordered = [...rng.shuffle(arr.slice(0, nMist)), ...rng.shuffle(arr.slice(nMist))]
    const out: string[] = []
    for (const c of ordered) {
      if (out.length === k) break
      if (taken.every((t) => Math.abs(t - c.v) >= sep - 1e-9)) {
        out.push(c.s)
        taken.push(c.v)
      }
    }
    return out.length === k ? out : null
  }
  let body: string[] = []
  if (noneCorrect) {
    const t = rng.int(Math.max(0, 4 - above.length), Math.min(4, below.length))
    const taken: number[] = []
    const lo = pickSide(below, mistakeBelow, t, taken)
    const hi = pickSide(above, mistakeAbove, 4 - t, taken)
    need(lo !== null && hi !== null, 'options too close together')
    body = [...lo, ...hi]
    body = layoutAsc ? body.sort((x, y) => Number(x) - Number(y)) : rng.shuffle(body)
  } else {
    const lo = Math.max(0, slots - 1 - above.length)
    const hi = Math.min(slots - 1, below.length)
    need(lo <= hi, 'cannot place distractors')
    const t = rng.int(lo, hi) // number of distractors below the answer
    const taken: number[] = [ansV]
    const lows = pickSide(below, mistakeBelow, t, taken)
    const highs = pickSide(above, mistakeAbove, slots - 1 - t, taken)
    need(lows !== null && highs !== null, 'options too close together')
    const items = [ansS, ...lows, ...highs]
    body = layoutAsc ? items.sort((x, y) => Number(x) - Number(y)) : rng.shuffle(items)
  }
  need(new Set(body).size === body.length, 'duplicate options')
  const dispOpt = (s: string): string => pre + disp(s) + (s === '1' && /^ [a-z]+s$/.test(post) ? post.slice(0, -1) : post)
  const options = [...body.map(dispOpt), ...(useNone ? [NONE_OF_THESE] : [])]
  const answer = noneCorrect ? 4 : body.indexOf(ansS)
  need(answer >= 0, 'answer lost')
  const line = answerLine({ options, answer, answerIsNone: noneCorrect }, dispOpt(ansS))
  return { topic: o.topic, stem: o.stem, options, answer, explanation: `${o.why}\n${line}` }
}

/** numeric question wrapper: picks the decimal places from the exact answer, 15% "None of these". */
export function nq(rng: Rng, topic: QuantTopicId, stem: string, ans: number | Frac, wrong: (number | Frac)[], why: string, o: { pre?: string; post?: string; none?: number | null; sort?: 'asc' | 'none'; allowNeg?: boolean } = {}): QuestionDraft {
  const a = typeof ans === 'number' ? F(Math.round(ans * 1000), 1000) : ans
  need(terminating(a, 2), 'answer not a clean decimal')
  return numQ(rng, { topic, stem, ans: a, dec: decOf(a), wrong, why, pre: o.pre, post: o.post, none: o.none === null ? undefined : (o.none ?? 0.15), sort: o.sort, allowNeg: o.allowNeg })
}

export interface StrSpec {
  topic: QuantTopicId
  stem: string
  correct: string
  wrong: string[]
  why: string
  none?: number
}
/** Text-answer question (ratios, fractions, years…): shuffled layout via buildOptions. */
export function strQ(rng: Rng, o: StrSpec): QuestionDraft {
  need(new Set(o.wrong.filter((w) => w !== o.correct)).size >= 4, 'not enough distinct text distractors')
  const built = buildOptions(rng, o.correct, o.wrong, { noneProb: o.none })
  return { topic: o.topic, stem: o.stem, options: built.options, answer: built.answer, explanation: `${o.why}\n${answerLine(built, o.correct)}` }
}

/** Fixed-option question (quadratic / quantity comparison). */
export function fixedQ(topic: QuantTopicId, stem: string, options: string[], answer: number, why: string): QuestionDraft {
  return { topic, stem, options, answer, explanation: `${why}\n${answerLine({ options, answer, answerIsNone: false }, options[answer])}` }
}

// ---------------------------------------------------------------- template runner
export interface Tpl {
  name: string
  /** Restrict the template to one difficulty. */
  d?: MockDifficulty
  gen: (rng: Rng, d: MockDifficulty) => QuestionDraft
}

/** Produces `count` one-question groups, cycling through the (shuffled) templates for variety; retries on Reject. */
export function genSingles(rng: Rng, d: MockDifficulty, count: number, tpls: Tpl[]): Group[] {
  const pool = tpls.filter((t) => !t.d || t.d === d)
  const out: Group[] = []
  const seen = new Set<string>()
  let order: Tpl[] = []
  while (out.length < count) {
    if (!order.length) order = rng.shuffle(pool)
    const t = order.pop() as Tpl
    let q: QuestionDraft | null = null
    for (let i = 0; i < 300 && !q; i++) {
      try {
        const c = t.gen(rng, d)
        if (!seen.has(c.stem)) q = c
      } catch (e) {
        if (!(e instanceof Reject)) throw e
      }
    }
    if (!q) {
      if (order.length) continue
      throw new Error(`template "${t.name}" could not produce a question`)
    }
    seen.add(q.stem)
    out.push({ questions: [q] })
  }
  return out
}
