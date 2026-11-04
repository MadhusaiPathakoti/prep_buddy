// Verification harness for the Quant mock generators.  Run:  npx tsx scripts/verify-mocks-quant.ts
// Structural checks + statistics for every topic x difficulty x 400 seeds, plus cross-checks done from OUTSIDE the
// generators (independent BigInt-rational evaluator for simplification/approximation/quadratics/quantity comparison,
// recipe re-evaluation for DI sets, hypothesis re-fitting for series).  Exits non-zero on any failure.
import { createRng } from '../src/lib/mocks/rng'
import { assertGroup } from '../src/lib/mocks/validate'
import { SET_SIZE } from '../src/lib/mocks/topics'
import { QUADRATIC_OPTIONS, QUANTITY_OPTIONS } from '../src/lib/mocks/options'
import { QUANT_GENERATORS } from '../src/lib/mocks/quant'
import { DI_META } from '../src/lib/mocks/quant/di'
import type { Rc } from '../src/lib/mocks/quant/di'
import { fitHole } from '../src/lib/mocks/quant/series'
import type { Group, MockDifficulty, QuantTopicId, QuestionDraft, Stimulus } from '../src/lib/mocks/types'

const SEEDS = Number(process.env.SEEDS ?? 400)
const TOPICS = Object.keys(QUANT_GENERATORS) as QuantTopicId[]
const DIFFS: MockDifficulty[] = ['medium', 'hard']

// ------------------------------------------------------------------ exact rationals (BigInt) -- independent of the generator's Frac
class Q {
  n: bigint
  d: bigint
  constructor(n: bigint, d: bigint = 1n) {
    if (d === 0n) throw new Error('division by zero')
    if (d < 0n) {
      n = -n
      d = -d
    }
    const g = bgcd(n < 0n ? -n : n, d)
    this.n = n / (g || 1n)
    this.d = d / (g || 1n)
  }
  static of(x: number | string): Q {
    const s = String(x).replace('−', '-')
    const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s)
    if (!m) throw new Error(`bad number ${s}`)
    const frac = m[3] ?? ''
    const n = BigInt(m[2] + frac)
    return new Q(m[1] ? -n : n, 10n ** BigInt(frac.length))
  }
  add(o: Q): Q {
    return new Q(this.n * o.d + o.n * this.d, this.d * o.d)
  }
  sub(o: Q): Q {
    return new Q(this.n * o.d - o.n * this.d, this.d * o.d)
  }
  mul(o: Q): Q {
    return new Q(this.n * o.n, this.d * o.d)
  }
  div(o: Q): Q {
    return new Q(this.n * o.d, this.d * o.n)
  }
  cmp(o: Q): number {
    const x = this.n * o.d - o.n * this.d
    return x > 0n ? 1 : x < 0n ? -1 : 0
  }
  eq(o: Q): boolean {
    return this.n === o.n && this.d === o.d
  }
  num(): number {
    return Number(this.n) / Number(this.d)
  }
  str(): string {
    return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`
  }
}
function bgcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b]
  return a
}
function isqrt(n: bigint): bigint {
  if (n < 0n) throw new Error('neg')
  if (n < 2n) return n
  let x = BigInt(Math.floor(Math.sqrt(Number(n))))
  while (x * x > n) x--
  while ((x + 1n) * (x + 1n) <= n) x++
  return x
}
function icbrt(n: bigint): bigint {
  let x = BigInt(Math.round(Math.cbrt(Number(n))))
  while (x * x * x > n) x--
  while ((x + 1n) ** 3n <= n) x++
  return x
}
function qroot(a: Q, k: 2 | 3): Q | null {
  const r = (v: bigint): bigint | null => {
    const x = k === 2 ? isqrt(v) : icbrt(v)
    return x ** BigInt(k) === v ? x : null
  }
  const rn = r(a.n)
  const rd = r(a.d)
  return rn === null || rd === null ? null : new Q(rn, rd)
}

// ------------------------------------------------------------------ expression evaluator (own tokenizer + parser)
interface Dom<T> {
  lit(s: string): T
  add(a: T, b: T): T
  sub(a: T, b: T): T
  mul(a: T, b: T): T
  div(a: T, b: T): T
  root(a: T, k: 2 | 3): T
}
const qDom: Dom<Q> = {
  lit: (s) => Q.of(s),
  add: (a, b) => a.add(b),
  sub: (a, b) => a.sub(b),
  mul: (a, b) => a.mul(b),
  div: (a, b) => a.div(b),
  root: (a, k) => {
    const r = qroot(a, k)
    if (r === null) throw new Error('inexact root')
    return r
  },
}
const fDom: Dom<number> = { lit: Number, add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b, div: (a, b) => a / b, root: (a, k) => (k === 2 ? Math.sqrt(a) : Math.cbrt(a)) }

function evalText<T>(src: string, dom: Dom<T>): T {
  const toks = src.match(/\d+(?:\.\d+)?|of|[+−×÷()[\]{}%/²³√∛]/g) ?? []
  if (toks.join('') !== src.replace(/\s+/g, '')) throw new Error(`unparsable characters in "${src}"`)
  let i = 0
  const open = new Map([['(', ')'], ['[', ']'], ['{', '}']])
  const additive = (): T => {
    let v = multiplicative()
    while (toks[i] === '+' || toks[i] === '−') v = toks[i++] === '+' ? dom.add(v, multiplicative()) : dom.sub(v, multiplicative())
    return v
  }
  const multiplicative = (): T => {
    let v = unary()
    while (toks[i] === '×' || toks[i] === '÷') v = toks[i++] === '×' ? dom.mul(v, unary()) : dom.div(v, unary())
    return v
  }
  const unary = (): T => {
    if (toks[i] === '√' || toks[i] === '∛') {
      const k = toks[i++] === '√' ? 2 : 3
      return dom.root(primary(), k)
    }
    let v = primary()
    while (toks[i] === '²' || toks[i] === '³') v = toks[i++] === '²' ? dom.mul(v, v) : dom.mul(dom.mul(v, v), v)
    return v
  }
  const primary = (): T => {
    const t = toks[i]
    if (t !== undefined && open.has(t)) {
      i++
      const v = additive()
      if (toks[i++] !== open.get(t)) throw new Error('bracket mismatch')
      return v
    }
    if (t === undefined || !/^\d/.test(t)) throw new Error(`number expected at "${t}" in "${src}"`)
    i++
    const a = dom.lit(t)
    if (toks[i] === '%' && toks[i + 1] === 'of') {
      i += 2
      return dom.mul(dom.div(a, dom.lit('100')), dom.lit(toks[i++]))
    }
    if (toks[i] === '/' && /^\d/.test(toks[i + 1] ?? '') && toks[i + 2] === 'of') {
      const b = dom.lit(toks[i + 1])
      i += 3
      return dom.mul(dom.div(a, b), dom.lit(toks[i++]))
    }
    return a
  }
  const v = additive()
  if (i !== toks.length) throw new Error(`trailing tokens in "${src}"`)
  return v
}

/** Parses an option string such as "₹4,500", "12.5%", "36 years", "−7" into a rational (null if not numeric). */
function optQ(s: string): Q | null {
  const m = /^[₹]?\s*(−|-)?\s*(\d[\d,]*(?:\.\d+)?)/.exec(s.trim())
  if (!m) return null
  if (/^[₹]?\s*(−|-)?\s*\d[\d,]*(?:\.\d+)?\s*(%|[a-zA-Zµ²³/ ]*)$/.test(s.trim()) === false) return null
  const q = Q.of(m[2].replace(/,/g, ''))
  return m[1] ? new Q(-q.n, q.d) : q
}

// ------------------------------------------------------------------ polynomial parser (quadratics / quantity comparison)
type Poly = Map<number, Q>
const pconst = (q: Q): Poly => new Map([[0, q]])
function padd(a: Poly, b: Poly, sign: 1 | -1 = 1): Poly {
  const out: Poly = new Map(a)
  for (const [k, v] of b) out.set(k, (out.get(k) ?? new Q(0n)).add(sign === 1 ? v : new Q(-v.n, v.d)))
  return out
}
function pmul(a: Poly, b: Poly): Poly {
  const out: Poly = new Map()
  for (const [i, x] of a) for (const [j, y] of b) out.set(i + j, (out.get(i + j) ?? new Q(0n)).add(x.mul(y)))
  return out
}
function parsePoly(src: string, v: string): Poly {
  const toks = src.match(new RegExp(`\\d+(?:\\.\\d+)?|${v}|[+−()²³√]`, 'g')) ?? []
  if (toks.join('') !== src.replace(/\s+/g, '')) throw new Error(`unparsable polynomial "${src}"`)
  let i = 0
  const expr = (): Poly => {
    let neg = false
    if (toks[i] === '−') {
      neg = true
      i++
    }
    let acc = term()
    if (neg) acc = padd(new Map(), acc, -1)
    while (toks[i] === '+' || toks[i] === '−') {
      const sgn = toks[i++] === '+' ? 1 : -1
      acc = padd(acc, term(), sgn)
    }
    return acc
  }
  const term = (): Poly => {
    let acc = factor()
    while (i < toks.length && toks[i] !== '+' && toks[i] !== '−' && toks[i] !== ')') acc = pmul(acc, factor())
    return acc
  }
  const factor = (): Poly => {
    const t = toks[i++]
    let f: Poly
    if (t === '(') {
      f = expr()
      if (toks[i++] !== ')') throw new Error('missing )')
    } else if (t === '√') {
      const r = qroot(Q.of(toks[i++]), 2)
      if (r === null) throw new Error('inexact sqrt')
      f = pconst(r)
    } else if (t === v) f = new Map([[1, new Q(1n)]])
    else if (t !== undefined && /^\d/.test(t)) f = pconst(Q.of(t))
    else throw new Error(`unexpected token ${t}`)
    while (toks[i] === '²' || toks[i] === '³') f = toks[i++] === '²' ? pmul(f, f) : pmul(pmul(f, f), f)
    return f
  }
  const p = expr()
  if (i !== toks.length) throw new Error(`trailing tokens in polynomial "${src}"`)
  return p
}
function polyEval(p: Poly, x: Q): Q {
  let r = new Q(0n)
  for (const [k, c] of p) {
    let pw = new Q(1n)
    for (let j = 0; j < k; j++) pw = pw.mul(x)
    r = r.add(c.mul(pw))
  }
  return r
}
function polyDeg(p: Poly): number {
  let d = 0
  for (const [k, c] of p) if (c.n !== 0n && k > d) d = k
  return d
}
/** Solves "lhs = rhs" in variable v over the rationals by exhaustive rational-root search. */
function solveEquation(eq: string, v: string): Q[] {
  const [l, r] = eq.split('=').map((s) => s.trim())
  const p = padd(parsePoly(l, v), parsePoly(r, v), -1)
  const deg = polyDeg(p)
  const roots: Q[] = []
  // rational-root theorem on the integer-scaled polynomial: candidates are ±(divisor of a0)/(divisor of a_n)
  let scale = 1n
  for (const c of p.values()) scale = (scale * c.d) / bgcd(scale, c.d)
  const ic = new Map<number, bigint>()
  for (const [k, c] of p) ic.set(k, (c.n * scale) / c.d)
  let low = Math.min(...[...ic.entries()].filter(([, c]) => c !== 0n).map(([k]) => k))
  if (!Number.isFinite(low)) low = 0
  const a0 = ic.get(low) as bigint
  const an = ic.get(deg) as bigint
  if (low > 0) roots.push(new Q(0n))
  const divisors = (n: bigint): bigint[] => {
    const m = n < 0n ? -n : n
    const out: bigint[] = []
    for (let i = 1n; i * i <= m; i++) if (m % i === 0n) out.push(i, m / i)
    return [...new Set(out)]
  }
  for (const pn of divisors(a0))
    for (const qd of divisors(an))
      for (const sign of [1n, -1n]) {
        const x = new Q(sign * pn, qd)
        if (polyEval(p, x).n === 0n && !roots.some((r) => r.eq(x))) roots.push(x)
      }
  if (deg === 2) {
    const a = p.get(2) as Q
    const b = p.get(1) ?? new Q(0n)
    const c = p.get(0) ?? new Q(0n)
    const disc = b.mul(b).sub(new Q(4n).mul(a).mul(c))
    if (roots.length === 2) {
      // Vieta check
      const s = roots[0].add(roots[1])
      const pr = roots[0].mul(roots[1])
      if (!s.eq(new Q(-b.n, b.d).div(a)) || !pr.eq(c.div(a))) throw new Error(`roots of "${eq}" fail Vieta`)
    } else if (!(roots.length === 1 && disc.n === 0n)) throw new Error(`"${eq}": found ${roots.length} rational root(s) but discriminant ${disc.str()}`)
  } else if (deg === 1 && roots.length !== 1) throw new Error(`linear "${eq}" root count ${roots.length}`)
  else if (deg === 3 && roots.length < 1) throw new Error(`cubic "${eq}" has no rational root`)
  if (roots.length === 0) throw new Error(`no roots found for "${eq}"`)
  return roots
}
function relation(X: Q[], Y: Q[]): number {
  let g = 0
  let l = 0
  let e = 0
  for (const a of X) for (const b of Y) (a.cmp(b) > 0 ? g++ : a.cmp(b) < 0 ? l++ : e++)
  if (l === 0 && e === 0) return 0
  if (l === 0 && g === 0) return 4
  if (l === 0) return 1
  if (g === 0 && e === 0) return 2
  if (g === 0) return 3
  return 4
}

// ------------------------------------------------------------------ DI recipe evaluator
function diEval(rc: Rc, st: Stimulus, textBlob: string): Q {
  switch (rc.t) {
    case 'num':
      return new Q(BigInt(rc.v))
    case 'txt':
      if (!new RegExp(`(?<![\\d.])${rc.v}(?![\\d])`).test(textBlob)) throw new Error(`stated number ${rc.v} not found in the stimulus text`)
      return new Q(BigInt(rc.v))
    case 'ref': {
      const part = st.parts[rc.p]
      if (!part) throw new Error('ref to missing part')
      if (part.kind === 'table') return Q.of(part.rows[rc.r][rc.c + 1])
      if (part.kind === 'bar' || part.kind === 'line') return Q.of(part.series[rc.r].values[rc.c])
      if (part.kind === 'pie') return Q.of(part.slices[rc.c].value)
      throw new Error('ref into text')
    }
    case 'op': {
      const a = diEval(rc.a, st, textBlob)
      const b = diEval(rc.b, st, textBlob)
      return rc.o === '+' ? a.add(b) : rc.o === '-' ? a.sub(b) : rc.o === '*' ? a.mul(b) : a.div(b)
    }
  }
}
function textOf(st: Stimulus): string {
  return JSON.stringify(st)
}

// ------------------------------------------------------------------ series helpers
function parseSeries(line: string): (number | null)[] {
  return line.trim().split(/\s+/).map((t) => (t === '?' ? null : Number(t)))
}
/** Independent hypothesis check: hole p explained by t' = a t + b (a, b rational) or by a degree-2 polynomial. */
function independentFill(known: (number | null)[], p: number): Q[] {
  const N = known.length
  const out: Q[] = []
  const pairs: [number, number, number][] = []
  for (let i = 0; i + 1 < N; i++) if (i !== p && i + 1 !== p) pairs.push([i, known[i] as number, known[i + 1] as number])
  // linear recurrence
  for (let a = 0; a < pairs.length; a++)
    for (let b = a + 1; b < pairs.length; b++) {
      const [, x1, y1] = pairs[a]
      const [, x2, y2] = pairs[b]
      if (x1 === x2) continue
      const A = new Q(BigInt(y2 - y1), BigInt(x2 - x1))
      const B = new Q(BigInt(y1)).sub(A.mul(new Q(BigInt(x1))))
      if (!pairs.every(([, x, y]) => A.mul(new Q(BigInt(x))).add(B).eq(new Q(BigInt(y))))) continue
      const val = p > 0 ? A.mul(new Q(BigInt(known[p - 1] as number))).add(B) : new Q(BigInt(known[1] as number)).sub(B).div(A)
      const full = known.map((v, i) => (i === p ? val : new Q(BigInt(v as number))))
      if (full.every((v, i) => i + 1 >= N || A.mul(v).add(B).eq(full[i + 1]))) out.push(val)
      return out.length ? out : polyFill()
    }
  return polyFill()
  function polyFill(): Q[] {
    const idx: number[] = []
    known.forEach((v, i) => {
      if (i !== p && v !== null) idx.push(i)
    })
    const base = idx.slice(0, 3)
    const ev = (x: number): Q => {
      let tot = new Q(0n)
      for (const j of base) {
        let t = new Q(BigInt(known[j] as number))
        for (const m of base) if (m !== j) t = t.mul(new Q(BigInt(x - m), BigInt(j - m)))
        tot = tot.add(t)
      }
      return tot
    }
    if (!idx.every((i) => ev(i).eq(new Q(BigInt(known[i] as number))))) return []
    const px = ev(p)
    return px.d === 1n ? [px] : []
  }
}

// ------------------------------------------------------------------ per-topic cross-checks (return an error string or null)
type Check = (q: QuestionDraft, g: Group, d: MockDifficulty) => string | null
const NONE = 'None of these'
const keyOf = (q: QuestionDraft): string | null => (q.options[q.answer] === NONE ? null : q.options[q.answer])

function checkSimplification(q: QuestionDraft): string | null {
  const lines = q.stem.split('\n')
  const body = lines.slice(1)
  const key = keyOf(q)
  const optVals = q.options.slice(0, key === null ? 4 : 5).map(optQ)
  const cand = q.options.map(optQ)
  if (q.options.some((o, i) => o !== NONE && cand[i] === null)) return 'non-numeric option'
  if (body[0].startsWith('I. ')) {
    const a = evalText(body[0].slice(3), qDom)
    const b = evalText(body[1].slice(4), qDom)
    const diff = a.cmp(b) > 0 ? a.sub(b) : b.sub(a)
    const hits = q.options.filter((_, i) => cand[i] !== null && (cand[i] as Q).eq(diff))
    return key === null ? (hits.length === 0 ? null : 'None-of-these is keyed but the true value is an option') : hits.length === 1 && cand[q.answer] !== null && (cand[q.answer] as Q).eq(diff) ? null : `difference ${diff.str()} vs key ${key}`
  }
  const eqLine = body[0]
  const [lhs, rhs] = eqLine.split(' = ')
  if (rhs === '?') {
    const v = evalText(lhs, qDom)
    const hits = q.options.filter((_, i) => cand[i] !== null && (cand[i] as Q).eq(v))
    if (key === null) return hits.length === 0 ? null : 'None-of-these keyed but value is among options'
    return hits.length === 1 && (cand[q.answer] as Q).eq(v) ? null : `value ${v.str()} vs key ${key}`
  }
  const target = evalText(rhs, qDom)
  const satisfies = (c: Q | null): boolean => {
    if (c === null) return false
    try {
      const t = lhs.replace('?', c.d === 1n ? `${c.n}` : `${Number(c.n) / Number(c.d)}`)
      return evalText(t, qDom).eq(target)
    } catch {
      return false
    }
  }
  void optVals
  const sat = cand.map(satisfies)
  const count = sat.filter(Boolean).length
  if (key === null) return count === 0 ? null : 'None-of-these keyed but an option satisfies the equation'
  return count === 1 && sat[q.answer] ? null : `equation satisfied by ${count} option(s); key satisfies: ${sat[q.answer]}`
}

function checkApproximation(q: QuestionDraft): string | null {
  const lines = q.stem.split('\n')
  const expr = lines[lines.length - 1].replace(/ = \?$/, '')
  const V = evalText(expr, fDom)
  const vals = q.options.map((o) => Number(o))
  if (vals.some((x) => !Number.isInteger(x))) return 'non-integer option'
  const K = vals[q.answer]
  if (Math.abs(V - K) / K > 0.005 + 1e-9) return `exact value ${V.toFixed(3)} not within 0.5% of key ${K}`
  for (let i = 0; i < 5; i++) if (i !== q.answer && Math.abs(vals[i] - V) / V < 0.03) return `distractor ${vals[i]} within 3% of exact value ${V.toFixed(3)}`
  return null
}

function checkWrongSeries(q: QuestionDraft): string | null {
  const terms = parseSeries(q.stem.split('\n')[1])
  if (terms.some((t) => t === null)) return 'unexpected ? in wrong-number series'
  const t = terms as number[]
  if (new Set(t).size !== t.length) return 'repeated terms'
  const key = Number(q.options[q.answer])
  const idx = t.indexOf(key)
  if (idx < 0) return 'keyed option is not a term of the series'
  if (q.options.some((o) => !t.includes(Number(o)))) return 'an option is not a term of the series'
  for (let p = 0; p < t.length; p++) {
    const known = t.map((x, j) => (j === p ? null : x))
    const lib = fitHole(known)
    const ind = independentFill(known, p)
    if (p !== idx && (lib.length > 0 || ind.length > 0)) return `term ${t[p]} (position ${p + 1}) can also be explained as the wrong one`
    if (p === idx && lib.length === 0 && ind.length === 0) return 'no hypothesis explains the series once the keyed term is removed'
  }
  return null
}

function checkMissingSeries(q: QuestionDraft): string | null {
  const known = parseSeries(q.stem.split('\n')[1])
  const p = known.indexOf(null)
  if (known.filter((x) => x === null).length !== 1) return 'series must have exactly one ?'
  const fits = fitHole(known)
  const ind = independentFill(known, p).map((x) => x.num())
  const key = q.options[q.answer] === NONE ? null : Number(q.options[q.answer])
  if (fits.length !== 1) return `ambiguous/unrecovered missing term: library finds [${fits.join(', ')}]`
  if (ind.some((x) => x !== fits[0])) return 'independent fitter disagrees with the library'
  const optNums = q.options.filter((o) => o !== NONE).map(Number)
  if (key === null) return optNums.includes(fits[0]) ? 'None keyed but the true value is an option' : null
  return fits[0] === key ? null : `library fills ${fits[0]} but key is ${key}`
}

function checkQuadratic(q: QuestionDraft): string | null {
  if (JSON.stringify(q.options) !== JSON.stringify(QUADRATIC_OPTIONS)) return 'quadratic options are not the fixed set'
  const m = /\nI\. (.+)\nII\. (.+)$/.exec(q.stem)
  if (!m) return 'cannot re-parse equations'
  const rel = relation(solveEquation(m[1], 'x'), solveEquation(m[2], 'y'))
  return rel === q.answer ? null : `brute-force relation index ${rel} != key ${q.answer}`
}

const QTY: [RegExp, (m: RegExpExecArray) => Q][] = [
  [/^(\d+)% of (\d+)$/, (m) => Q.of(m[1]).mul(Q.of(m[2])).div(Q.of(100))],
  [/^The average of (.+)$/, (m) => {
    const nums = m[1].split(/, | and /).map((x) => Q.of(x))
    return nums.reduce((a, b) => a.add(b), new Q(0n)).div(new Q(BigInt(nums.length)))
  }],
  [/^Simple interest \(in ₹\) on ₹(\d+) at (\d+)% per annum for (\d+) years$/, (m) => Q.of(m[1]).mul(Q.of(m[2])).mul(Q.of(m[3])).div(Q.of(100))],
  [/^The area \(in cm²\) of a rectangle with length (\d+) cm and breadth (\d+) cm$/, (m) => Q.of(m[1]).mul(Q.of(m[2]))],
  [/^The perimeter \(in cm\) of a square whose area is (\d+) cm²$/, (m) => (qroot(Q.of(m[1]), 2) as Q).mul(Q.of(4))],
  [/^The (LCM|HCF) of (\d+) and (\d+)$/, (m) => {
    const a = BigInt(m[2])
    const b = BigInt(m[3])
    const g = bgcd(a, b)
    return new Q(m[1] === 'HCF' ? g : (a * b) / g)
  }],
  [/^The sum of the first (\d+) natural numbers$/, (m) => Q.of(m[1]).mul(Q.of(m[1]).add(Q.of(1))).div(Q.of(2))],
  [/^The selling price \(in ₹\) of an article bought for ₹(\d+) at (\d+)% (loss|profit)$/, (m) => Q.of(m[1]).mul(Q.of(100).add(m[3] === 'loss' ? Q.of(m[2]).mul(Q.of(-1)) : Q.of(m[2]))).div(Q.of(100))],
  [/^The distance \(in km\) covered by a car moving at (\d+) km\/h in (\d+) hours$/, (m) => Q.of(m[1]).mul(Q.of(m[2]))],
  [/^The value of (\d+)² − (\d+)²$/, (m) => Q.of(m[1]).mul(Q.of(m[1])).sub(Q.of(m[2]).mul(Q.of(m[2])))],
  [/^The speed \(in km\/h\) of a (\d+) m long train that crosses a pole in (\d+) seconds$/, (m) => Q.of(m[1]).div(Q.of(m[2])).mul(Q.of(18)).div(Q.of(5))],
]
function qtyValue(text: string): Q {
  for (const [re, f] of QTY) {
    const m = re.exec(text)
    if (m) return f(m)
  }
  throw new Error(`unrecognised quantity "${text}"`)
}
function checkQuantity(q: QuestionDraft): string | null {
  if (JSON.stringify(q.options) !== JSON.stringify(QUANTITY_OPTIONS)) return 'quantity options are not the fixed set'
  const mRoots = /Quantity I: x, where (.+)\nQuantity II: y, where (.+)$/.exec(q.stem)
  if (mRoots) {
    const rel = relation(solveEquation(mRoots[1], 'x'), solveEquation(mRoots[2], 'y'))
    return rel === q.answer ? null : `root-based relation ${rel} != key ${q.answer}`
  }
  const mDom = /x is an integer such that (-?\d+) (<|≤) x (<|≤) (-?\d+)\. .*\nQuantity I: (.+)\nQuantity II: (.+)$/.exec(q.stem.replace(/−/g, '-'))
  if (mDom) {
    const lo = Number(mDom[1])
    const hi = Number(mDom[4])
    const dom: number[] = []
    for (let x = lo; x <= hi; x++) if ((mDom[2] === '<' ? x > lo : x >= lo) && (mDom[3] === '<' ? x < hi : x <= hi)) dom.push(x)
    const pa = parsePoly(mDom[5].replace(/-/g, '−'), 'x')
    const pb = parsePoly(mDom[6].replace(/-/g, '−'), 'x')
    const cs = dom.map((x) => polyEval(pa, new Q(BigInt(x))).cmp(polyEval(pb, new Q(BigInt(x)))))
    const rel = cs.every((c) => c > 0) ? 0 : cs.every((c) => c === 0) ? 4 : cs.every((c) => c >= 0) ? 1 : cs.every((c) => c < 0) ? 2 : cs.every((c) => c <= 0) ? 3 : 4
    return rel === q.answer ? null : `domain relation ${rel} != key ${q.answer}`
  }
  const mA = /\nQuantity I: (.+)\nQuantity II: (.+)$/.exec(q.stem)
  if (!mA) return 'cannot re-parse quantities'
  const c = qtyValue(mA[1]).cmp(qtyValue(mA[2]))
  const rel = c > 0 ? 0 : c < 0 ? 2 : 4
  return rel === q.answer ? null : `arithmetic relation ${rel} != key ${q.answer}`
}

function checkDi(q: QuestionDraft, g: Group): string | null {
  const meta = DI_META.get(q)
  if (!meta) return 'no DI metadata for question'
  if (!g.stimulus) return 'DI question without stimulus'
  const blob = textOf(g.stimulus)
  const key = q.options[q.answer]
  if (meta.kind === 'value') {
    const v = diEval(meta.rcs[0], g.stimulus, blob)
    const k = optQ(key)
    if (k === null) return `non-numeric key "${key}"`
    if (meta.round) {
      const x = v.num()
      if (Math.abs(x - Number(k.n)) > 0.35) return `rounded key ${key} too far from exact ${x.toFixed(3)}`
      if (!/approximate/.test(q.stem)) return 'rounded answer but the stem does not say approximately'
      return null
    }
    return v.eq(k) ? null : `recipe value ${v.str()} != key ${key}`
  }
  if (meta.kind === 'ratio') {
    const a = diEval(meta.rcs[0], g.stimulus, blob)
    const b = diEval(meta.rcs[1], g.stimulus, blob)
    const r = a.div(b)
    const m = /^(\d+) : (\d+)$/.exec(key)
    if (!m) return 'ratio key malformed'
    return r.eq(new Q(BigInt(m[1]), BigInt(m[2]))) ? null : `ratio ${a.str()} : ${b.str()} != key ${key}`
  }
  const vals = meta.rcs.map((rc) => diEval(rc, g.stimulus as Stimulus, blob))
  const labels = meta.labels as string[]
  const best = vals.reduce((m, x, i) => ((meta.extreme === 'max' ? x.cmp(vals[m]) > 0 : x.cmp(vals[m]) < 0) ? i : m), 0)
  if (vals.filter((x) => x.eq(vals[best])).length !== 1) return 'extreme is not unique'
  return labels[best] === key ? null : `extreme at ${labels[best]} but key is ${key}`
}

function checkStimulusSanity(g: Group): string | null {
  const s = g.stimulus
  if (!s) return null
  for (const p of s.parts) {
    if (p.kind === 'pie') {
      const sum = p.slices.reduce((a, b) => a + b.value, 0)
      if (sum !== (p.unit === '°' ? 360 : 100)) return `pie slices sum to ${sum}`
      if (new Set(p.slices.map((x) => x.label)).size !== p.slices.length) return 'duplicate pie labels'
    }
    if (p.kind === 'bar' || p.kind === 'line') {
      if (new Set(p.categories).size !== p.categories.length) return 'duplicate categories'
      for (const sr of p.series) if (sr.values.some((v) => !(v > 0))) return 'non-positive chart value'
    }
    if (p.kind === 'table') for (const r of p.rows) for (const c of r.slice(1)) if (typeof c === 'number' && !(c > 0)) return 'non-positive table value'
  }
  return null
}

const TOPIC_CHECKS: Partial<Record<QuantTopicId, Check>> = {
  simplification: checkSimplification,
  approximation: checkApproximation,
  'wrong-number-series': checkWrongSeries,
  'missing-number-series': checkMissingSeries,
  'quadratic-equations': checkQuadratic,
  'quantity-comparison': checkQuantity,
  'di-table': checkDi,
  'di-bar': checkDi,
  'di-line': checkDi,
  'di-pie': checkDi,
  'di-caselet': checkDi,
}

// ------------------------------------------------------------------ entity-consistency check
// Names, vehicle/object nouns, unit words and entity letters that appear in the explanation or in the final question
// sentence must also appear in the stem (or stimulus): one drawn entity has to be reused everywhere.
const PEOPLE = ['Ramesh', 'Suresh', 'Mahesh', 'Anil', 'Sunil', 'Rohit', 'Amit', 'Vikas', 'Deepak', 'Kiran', 'Rahul', 'Manoj', 'Sanjay', 'Ajay', 'Vijay', 'Nitin', 'Arun', 'Pooja', 'Neha', 'Priya', 'Anita', 'Sunita', 'Meena', 'Rekha', 'Kavita', 'Divya', 'Sneha', 'Ritu', 'Seema', 'Geeta', 'Varun', 'Tarun', 'Harish', 'Gopal', 'Naveen', 'Mohan', 'Sohan', 'Lalit', 'Ashok', 'Dinesh']
const PLACES = ['Delhi', 'Mumbai', 'Chennai', 'Kolkata', 'Pune', 'Jaipur', 'Lucknow', 'Company', 'Shop', 'Branch', 'School', 'State', 'Store', 'Village', 'Family']
const THINGS = ['car', 'bus', 'truck', 'jeep', 'motorbike', 'taxi', 'cyclist', 'tractor', 'train', 'cart', 'boat', 'sugar', 'rice', 'wheat', 'tea', 'coffee', 'pulses', 'flour', 'copper', 'zinc', 'acid', 'laptop', 'tablet', 'phone', 'pen', 'book', 'bulb', 'toy', 'shirt', 'mango', 'watch', 'bag', 'fan', 'camera', 'jacket', 'television', 'shopkeeper', 'trader', 'dealer', 'wholesaler', 'grocer', 'boys', 'girls', 'men', 'women', 'employees', 'students', 'sphere', 'cone', 'cylinder', 'hemisphere', 'semicircle', 'trapezium', 'rhombus', 'cuboid', 'tank', 'pipe', 'vessel', 'ball', 'card', 'committee', 'bell', 'coin', 'marks']
const UNITS = ['kg', 'litres', 'litre', 'metres', 'hours', 'hour', 'minutes', 'seconds', 'days', 'years', 'rupees']
const norm = (w: string): string => w.toLowerCase().replace(/(es|s)$/, '')
function wordsIn(text: string, list: string[]): Set<string> {
  const out = new Set<string>()
  for (const w of list) if (new RegExp(`\\b${w}(?:s|es)?\\b`, 'i').test(text)) out.add(norm(w))
  return out
}
function lettersIn(text: string): Set<string> {
  const out = new Set<string>()
  for (const m of text.matchAll(/(?<![A-Za-z0-9²³'’])([A-G]|[P-S])(?![A-Za-z0-9²³])/g)) out.add(m[1])
  // letters of a quoted word (anagram questions) are not entity labels
  for (const m of text.matchAll(/'([A-Z]{3,})'/g)) for (const ch of m[1]) out.add(ch)
  return out
}
const expl_ = (q: QuestionDraft): string => q.explanation.split('\nCorrect answer:')[0]
function checkEntities(q: QuestionDraft, g: Group): string | null {
  const stim = g.stimulus ? JSON.stringify(g.stimulus) : ''
  const stemAll = q.stem + ' ' + stim
  const expl = q.explanation.split('\nCorrect answer:')[0]
  const sentences = q.stem.split('\n')[0].split(/(?<=[.?!])\s+/)
  const qLine = [...sentences].reverse().find((s) => s.includes('?')) ?? sentences[sentences.length - 1]
  const probes: [string, string][] = [['explanation', expl], ['question line', qLine]]
  for (const [where, text] of probes) {
    for (const lists of [PEOPLE, PLACES]) {
      for (const w of lists) if (new RegExp(`\\b${w}\\b`).test(text) && !new RegExp(`\\b${w}\\b`).test(stemAll)) return `"${w}" appears in the ${where} but not in the stem`
    }
    const stemThings = wordsIn(stemAll, THINGS)
    for (const t of wordsIn(text, THINGS)) if (!stemThings.has(t)) return `noun "${t}" appears in the ${where} but not in the stem`
    const stemUnits = wordsIn(stemAll, UNITS)
    if (where === 'question line') for (const u of wordsIn(text, UNITS)) if (!stemUnits.has(u) && !(u === 'hour' && stemUnits.has('hour'))) return `unit "${u}" appears in the ${where} but not in the stem`
    // A/B/C are always entity letters; D-G and P-S are treated as entities only when the stem itself uses such labels (otherwise they are algebra symbols)
    const stemLetters = lettersIn(stemAll)
    const stemUsesLabels = [...stemLetters].some((l) => !'ABC'.includes(l))
    for (const l of lettersIn(text)) if (!stemLetters.has(l) && ('ABC'.includes(l) || stemUsesLabels)) return `entity letter "${l}" appears in the ${where} but not in the stem`
    if (text.includes('₹') && !stemAll.includes('₹') && !q.options.some((o) => o.includes('₹'))) return `₹ appears in the ${where} but nowhere in the stem or options`
  }
  const female = new Set(['Pooja', 'Neha', 'Priya', 'Anita', 'Sunita', 'Meena', 'Rekha', 'Kavita', 'Divya', 'Sneha', 'Ritu', 'Seema', 'Geeta'])
  const hasFemale = PEOPLE.some((n) => female.has(n) && new RegExp(`\\b${n}\\b`).test(q.stem))
  const hasMale = PEOPLE.some((n) => !female.has(n) && new RegExp(`\\b${n}\\b`).test(q.stem))
  if (hasFemale && /\b(he|his|him|He|His)\b/.test(q.stem + ' ' + expl_(q))) return 'female name used with he/his'
  if (hasMale && !hasFemale && /\b(she|her|She|Her)\b/.test(q.stem + ' ' + expl_(q))) return 'male name used with she/her'
  // a vehicle noun in the stem's first sentence must not be contradicted by a different one in the question line
  const veh = ['car', 'bus', 'truck', 'jeep', 'motorbike', 'taxi', 'cyclist', 'tractor', 'train', 'cart']
  const qv = [...wordsIn(qLine, veh)]
  const sv = wordsIn(q.stem, veh)
  for (const v of qv) if (!sv.has(v)) return `vehicle "${v}" in the question line is not the one introduced in the stem`
  return null
}

// topics that must (may) use "None of these"
const NONE_TOPICS = new Set<QuantTopicId>(['simplification', 'missing-number-series', 'percentage', 'profit-loss', 'ratio-partnership', 'ages-averages', 'interest', 'time-work', 'speed-distance', 'mixture-alligation', 'mensuration', 'probability-pnc', 'number-system'])
const MAX_NUMERIC = 1e7
const DUP_FAIL = 0.6 // a topic whose pool is this repetitive is considered broken; lower rates are only reported

// ------------------------------------------------------------------ main loop
interface Row {
  topic: QuantTopicId
  diff: MockDifficulty
  groups: number
  questions: number
  failures: number
  hist: number[]
  none: number
  dupRate: number
  explMismatch: number
  samples: { q: QuestionDraft; g: Group }[]
}
const failures: string[] = []
const rows: Row[] = []
const LETTERS = 'ABCDE'

function note(topic: string, diff: string, seed: number, msg: string): void {
  failures.push(`[${topic}/${diff}/seed ${seed}] ${msg}`)
}

for (const topic of TOPICS) {
  for (const diff of DIFFS) {
    const row: Row = { topic, diff, groups: 0, questions: 0, failures: 0, hist: [0, 0, 0, 0, 0], none: 0, dupRate: 0, explMismatch: 0, samples: [] }
    const natural = SET_SIZE[topic]
    const counts = natural ? [1, 3, 5, 7] : [1, 3, 5, 12]
    const stems = new Map<string, number>()
    const gen = QUANT_GENERATORS[topic]
    for (let seed = 0; seed < SEEDS; seed++) {
      const count = counts[seed % counts.length]
      let groups: Group[]
      try {
        groups = gen(createRng(seed * 7919 + 13), diff, count)
      } catch (e) {
        row.failures++
        note(topic, diff, seed, `generator threw: ${(e as Error).message}`)
        continue
      }
      let total = 0
      groups.forEach((g, gi) => {
        row.groups++
        try {
          assertGroup(g, `${topic}/${diff}/seed ${seed} group ${gi + 1}`)
        } catch (e) {
          row.failures++
          note(topic, diff, seed, (e as Error).message)
          return
        }
        if (natural) {
          if (!g.stimulus) {
            row.failures++
            note(topic, diff, seed, 'set topic group without stimulus')
          }
          if (g.questions.length > natural) {
            row.failures++
            note(topic, diff, seed, `group of ${g.questions.length} exceeds natural set size ${natural}`)
          }
          if (gi < groups.length - 1 && g.questions.length !== natural) {
            row.failures++
            note(topic, diff, seed, `non-final group has ${g.questions.length} questions`)
          }
          const bad = checkStimulusSanity(g)
          if (bad) {
            row.failures++
            note(topic, diff, seed, `stimulus: ${bad}`)
          }
        } else if (g.stimulus || g.questions.length !== 1) {
          row.failures++
          note(topic, diff, seed, 'stand-alone topic must return one-question groups without stimulus')
        }
        for (const q of g.questions) {
          total++
          row.questions++
          row.hist[q.answer]++
          if (q.topic !== topic) {
            row.failures++
            note(topic, diff, seed, `question topic is ${q.topic}`)
          }
          const key = natural ? `${q.stem}\u0000${JSON.stringify(g.stimulus)}` : q.stem
          stems.set(key, (stems.get(key) ?? 0) + 1)
          const isNone = q.options[4] === NONE
          if (isNone) row.none++
          if (q.options.slice(0, 4).includes(NONE)) {
            row.failures++
            note(topic, diff, seed, 'None of these appears before option E')
          }
          if (isNone && !NONE_TOPICS.has(topic)) {
            row.failures++
            note(topic, diff, seed, 'None of these used in a topic that must not use it')
          }
          const letter = LETTERS[q.answer]
          const expectLine = `Correct answer: (${letter}) ${q.options[q.answer]}`
          if (!q.explanation.includes(expectLine)) {
            row.failures++
            note(topic, diff, seed, `explanation lacks "${expectLine}"`)
          }
          const lastLine = q.explanation.trimEnd().split('\n').pop() as string
          if (!lastLine.startsWith('Correct answer:')) {
            row.failures++
            note(topic, diff, seed, 'answer line is not the last line of the explanation')
          }
          // numeric sanity: magnitude, near-identical options, worked solution mentions the key
          const nums = q.options.map((o) => (o === NONE ? null : optQ(o)))
          const numeric = nums.filter((x): x is Q => x !== null)
          if (numeric.length === 5 - (isNone ? 1 : 0) && DI_META.get(q)?.kind !== 'label') {
            if (numeric.some((x) => Math.abs(x.num()) > MAX_NUMERIC)) {
              row.failures++
              note(topic, diff, seed, `absurd magnitude in options ${q.options.join(' | ')}`)
            }
            for (let i = 0; i < numeric.length; i++)
              for (let j = i + 1; j < numeric.length; j++) {
                const a = numeric[i].num()
                const b = numeric[j].num()
                if (Math.abs(a - b) < 0.004 * Math.max(Math.abs(a), Math.abs(b))) {
                  row.failures++
                  note(topic, diff, seed, `near-identical options ${q.options[i]} / ${q.options[j]}`)
                }
              }
          }
          if (!isNone && !q.options[q.answer].match(/[<>≥≤=]|Quantity/)) {
            const bare = q.options[q.answer].replace(/^₹/, '').replace(/%$/, '').replace(/ [a-zA-Z/²³]+$/, '')
            if (!q.explanation.split('\nCorrect answer:')[0].includes(bare)) row.explMismatch++
          }
          {
            const ec = checkEntities(q, g)
            if (ec) {
              row.failures++
              note(topic, diff, seed, `entity consistency: ${ec}\n      stem: ${q.stem.replace(/\n/g, ' ⏎ ').slice(0, 300)}\n      explanation: ${q.explanation.replace(/\n/g, ' ⏎ ').slice(0, 300)}`)
            }
          }
          if (natural && q.stem.split(/\s+/).length > 35) {
            row.failures++
            note(topic, diff, seed, `set question stem longer than 35 words: ${q.stem.slice(0, 200)}`)
          }
          const check = TOPIC_CHECKS[topic]
          if (check) {
            let err: string | null = null
            try {
              err = check(q, g, diff)
            } catch (e) {
              err = `cross-check threw: ${(e as Error).message}`
            }
            if (err) {
              row.failures++
              note(topic, diff, seed, `${err}\n      stem: ${q.stem.replace(/\n/g, ' ⏎ ').slice(0, 260)}\n      options: ${q.options.join(' | ')}  key=${LETTERS[q.answer]}`)
            }
          }
          if (row.samples.length < 2 && seed % 37 === 0 && !row.samples.some((s) => s.g === g)) row.samples.push({ q, g })
        }
      })
      if (total !== count) {
        row.failures++
        note(topic, diff, seed, `asked for ${count} questions, got ${total}`)
      }
    }
    let dups = 0
    for (const v of stems.values()) if (v > 1) dups += v - 1
    row.dupRate = row.questions ? dups / row.questions : 0
    // statistical sanity (position == outcome for the two fixed-option topics, which are checked separately below)
    const fixedOptionTopic = topic === 'quadratic-equations' || topic === 'quantity-comparison'
    if (row.questions >= 300) {
      row.hist.forEach((h, i) => {
        const share = h / row.questions
        if (h === 0) {
          row.failures++
          note(topic, diff, -1, `answer position ${LETTERS[i]} never occurs`)
        } else if (share < 0.08 || share > (fixedOptionTopic ? 0.42 : 0.36)) {
          row.failures++
          note(topic, diff, -1, `answer position ${LETTERS[i]} share ${(share * 100).toFixed(1)}% out of bounds`)
        }
      })
    }
    const noneRate = row.none / Math.max(1, row.questions)
    if (NONE_TOPICS.has(topic) && row.questions >= 300 && (noneRate < 0.02 || noneRate > 0.3) && topic !== 'probability-pnc' && topic !== 'ratio-partnership' && topic !== 'mixture-alligation') {
      row.failures++
      note(topic, diff, -1, `None-of-these rate ${(noneRate * 100).toFixed(1)}% out of range`)
    }
    if (row.dupRate > DUP_FAIL && topic !== 'quadratic-equations' && topic !== 'quantity-comparison' && topic !== 'probability-pnc') {
      row.failures++
      note(topic, diff, -1, `duplicate-stem rate ${(row.dupRate * 100).toFixed(1)}% above ${DUP_FAIL * 100}%`)
    }
    rows.push(row)
  }
}

// quadratic / quantity outcome distribution
for (const topic of ['quadratic-equations', 'quantity-comparison'] as QuantTopicId[])
  for (const diff of DIFFS) {
    const r = rows.find((x) => x.topic === topic && x.diff === diff) as Row
    r.hist.forEach((h, i) => {
      if (h / r.questions < 0.08) {
        r.failures++
        note(topic, diff, -1, `outcome ${i} occurs only ${((h / r.questions) * 100).toFixed(1)}% of the time`)
      }
    })
  }

// ------------------------------------------------------------------ report
function renderStimulus(g: Group): string {
  if (!g.stimulus) return ''
  const out: string[] = [`   [${g.stimulus.directions ?? ''}]`]
  for (const p of g.stimulus.parts) {
    if (p.kind === 'text') out.push(...p.paragraphs.map((x) => `   ${x}`))
    else if (p.kind === 'table') out.push(`   ${p.heading ?? ''}`, `   ${p.columns.join(' | ')}`, ...p.rows.map((r) => `   ${r.join(' | ')}`))
    else if (p.kind === 'bar' || p.kind === 'line') out.push(`   ${p.kind}${p.stacked ? ' (stacked)' : ''}: ${p.heading ?? ''} (${p.unit ?? ''})`, `   ${p.categories.join(' | ')}`, ...p.series.map((s) => `   ${s.name}: ${s.values.join(' | ')}`))
    else out.push(`   pie: ${p.heading ?? ''}`, `   ${p.slices.map((s) => `${s.label} ${s.value}`).join(' | ')}`)
  }
  return out.join('\n')
}

console.log('\n==================== QUANT GENERATOR VERIFICATION ====================')
console.log(`seeds per topic/difficulty: ${SEEDS}\n`)
const head = 'topic'.padEnd(22) + 'diff'.padEnd(8) + 'qs'.padStart(6) + 'groups'.padStart(7) + 'fail'.padStart(6) + '   A     B     C     D     E   ' + 'none%'.padStart(6) + 'dup%'.padStart(6) + 'expl?'.padStart(7)
console.log(head)
console.log('-'.repeat(head.length))
for (const r of rows) {
  const pct = r.hist.map((h) => `${((h / Math.max(1, r.questions)) * 100).toFixed(0).padStart(3)}%`).join('  ')
  console.log(r.topic.padEnd(22) + r.diff.padEnd(8) + String(r.questions).padStart(6) + String(r.groups).padStart(7) + String(r.failures).padStart(6) + `  ${pct}  ` + ((r.none / Math.max(1, r.questions)) * 100).toFixed(1).padStart(5) + ' ' + (r.dupRate * 100).toFixed(1).padStart(5) + ' ' + String(r.explMismatch).padStart(6))
}
console.log('\n(expl? = number of questions whose worked solution does not literally contain the keyed value; informational)')

if (process.env.NOSAMPLES !== '1') {
  console.log('\n==================== SAMPLE QUESTIONS ====================')
  for (const r of rows)
    for (const s of r.samples) {
      console.log(`\n--- ${r.topic} / ${r.diff} ---`)
      const st = renderStimulus(s.g)
      if (st) console.log(st)
      console.log(s.q.stem)
      console.log(s.q.options.map((o, i) => `  (${LETTERS[i]}) ${o}`).join('\n'))
      console.log(`  answer: ${LETTERS[s.q.answer]}`)
      console.log(s.q.explanation.split('\n').map((l) => `  | ${l}`).join('\n'))
    }
}

const totalQs = rows.reduce((a, r) => a + r.questions, 0)
console.log(`\nTotal questions generated: ${totalQs}`)
if (failures.length) {
  console.log(`\nFAILURES: ${failures.length}`)
  const groups = new Map<string, { n: number; example: string }>()
  for (const f of failures) {
    const k = f.replace(/seed -?\d+/, '').replace(/\d+(\.\d+)?/g, '#').split('\n')[0].slice(0, 110)
    const g = groups.get(k)
    if (g) g.n++
    else groups.set(k, { n: 1, example: f })
  }
  let shown = 0
  for (const [, g] of groups) {
    console.log(`  x${g.n}  ${g.example}`)
    if (++shown >= 70) break
  }
  process.exit(1)
}
console.log('ALL CHECKS PASSED — zero failures.')
