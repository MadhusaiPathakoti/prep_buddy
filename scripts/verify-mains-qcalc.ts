// Verification harness for the SBI PO Mains-level Quant generators: simplification, approximation, wrong/missing number series,
// quadratic equations and quantity comparison.   Run:  npx tsx scripts/verify-mains-qcalc.ts
// Every answer key is re-derived FROM THE PRINTED QUESTION TEXT by code that shares nothing with the generators
// (own tokenizer, own BigInt rationals, own equation parser + exhaustive rational-root search, regex-based word-problem solvers).
// Structural checks: exact count, assertGroup, determinism, distinct options, uniform key positions, speed.
import { createRng } from '../src/lib/mocks/rng'
import { assertGroup } from '../src/lib/mocks/validate'
import { QUADRATIC_OPTIONS, QUANTITY_OPTIONS } from '../src/lib/mocks/options'
import { MAINS_CALC } from '../src/lib/mocks/quant/mains/calc'
import { MAINS_SERIES } from '../src/lib/mocks/quant/mains/series'
import { MAINS_ALGEBRA } from '../src/lib/mocks/quant/mains/algebra'
import type { Group, QuantTopicId, QuestionDraft, TopicGenerator } from '../src/lib/mocks/types'

const EXTRA_OK = '−—√∛≤≥≠₹→∴⇒≈π²³'
/** Characters outside Latin-1 (plus newline) and the allowed symbols; the shared "None of these" helper also uses an em dash. */
const BAD_CHAR = {
  match: (s: string): string[] | null => {
    const bad = [...s].filter((c) => {
      const k = c.charCodeAt(0)
      return !(k === 10 || (k >= 32 && k <= 255) || EXTRA_OK.includes(c))
    })
    return bad.length ? bad : null
  },
}
const SEEDS = Number(process.env.SEEDS ?? 300)
let failures = 0
const fail = (msg: string): void => {
  failures++
  if (failures <= 25) console.error('FAIL: ' + msg)
}

// ------------------------------------------------------------------ BigInt rationals
function bgcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b]
  return a < 0n ? -a : a
}
class Q {
  n: bigint
  d: bigint
  constructor(n: bigint, d: bigint = 1n) {
    if (d === 0n) throw new Error('division by zero')
    if (d < 0n) [n, d] = [-n, -d]
    const g = bgcd(n, d) || 1n
    this.n = n / g
    this.d = d / g
  }
  static of(s: string): Q {
    const m = /^(\d+)(?:\.(\d+))?$/.exec(s)
    if (!m) throw new Error(`bad number "${s}"`)
    const f = m[2] ?? ''
    return new Q(BigInt(m[1] + f), 10n ** BigInt(f.length))
  }
  add = (o: Q): Q => new Q(this.n * o.d + o.n * this.d, this.d * o.d)
  sub = (o: Q): Q => new Q(this.n * o.d - o.n * this.d, this.d * o.d)
  mul = (o: Q): Q => new Q(this.n * o.n, this.d * o.d)
  div = (o: Q): Q => new Q(this.n * o.d, this.d * o.n)
  cmp = (o: Q): number => {
    const x = this.n * o.d - o.n * this.d
    return x > 0n ? 1 : x < 0n ? -1 : 0
  }
  eq = (o: Q): boolean => this.n === o.n && this.d === o.d
  num = (): number => Number(this.n) / Number(this.d)
  str = (): string => (this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`)
}
const qi = (n: number): Q => new Q(BigInt(n))
function iroot(n: bigint, k: number): bigint | null {
  if (n < 0n) return null
  let x = BigInt(Math.round(Math.pow(Number(n), 1 / k)))
  for (let c = x - 2n; c <= x + 2n; c++) if (c >= 0n && c ** BigInt(k) === n) return c
  x = 0n
  return null
}
const qroot = (a: Q, k: number): Q => {
  const rn = iroot(a.n, k)
  const rd = iroot(a.d, k)
  if (rn === null || rd === null) throw new Error('inexact root')
  return new Q(rn, rd)
}

// ------------------------------------------------------------------ arithmetic expression evaluator (generic over the number type)
interface Dom<T> {
  lit(s: string): T
  add(a: T, b: T): T
  sub(a: T, b: T): T
  mul(a: T, b: T): T
  div(a: T, b: T): T
  root(a: T, k: number): T
}
const qDom: Dom<Q> = { lit: Q.of, add: (a, b) => a.add(b), sub: (a, b) => a.sub(b), mul: (a, b) => a.mul(b), div: (a, b) => a.div(b), root: qroot }
const fDom: Dom<number> = { lit: Number, add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b, div: (a, b) => a / b, root: (a, k) => Math.pow(a, 1 / k) }

function evalText<T>(src: string, dom: Dom<T>): T {
  const toks = src.match(/\d+ \d+\/\d+|\d+(?:\.\d+)?\/\d+|\d+(?:\.\d+)?|of|[+−×÷()[\]{}%²³√∛]/g) ?? []
  if (toks.join('').replace(/\s+/g, '') !== src.replace(/\s+/g, '')) throw new Error(`unparsable: "${src}"`)
  let i = 0
  const closer: Record<string, string> = { '(': ')', '[': ']', '{': '}' }
  const number = (t: string): T => {
    let m = /^(\d+) (\d+)\/(\d+)$/.exec(t)
    if (m) return dom.add(dom.lit(m[1]), dom.div(dom.lit(m[2]), dom.lit(m[3])))
    m = /^([\d.]+)\/(\d+)$/.exec(t)
    if (m) return dom.div(dom.lit(m[1]), dom.lit(m[2]))
    return dom.lit(t)
  }
  const sum = (): T => {
    let a = prod()
    while (toks[i] === '+' || toks[i] === '−') a = toks[i++] === '+' ? dom.add(a, prod()) : dom.sub(a, prod())
    return a
  }
  const prod = (): T => {
    let a = unit()
    while (toks[i] === '×' || toks[i] === '÷') a = toks[i++] === '×' ? dom.mul(a, unit()) : dom.div(a, unit())
    return a
  }
  const primary = (): T => {
    const t = toks[i++]
    if (t in closer) {
      const v = sum()
      if (toks[i++] !== closer[t]) throw new Error('bracket mismatch')
      return v
    }
    if (!/^\d/.test(t ?? '')) throw new Error(`number expected, got ${t}`)
    return number(t)
  }
  const unit = (): T => {
    if (toks[i] === '√' || toks[i] === '∛') {
      const k = toks[i] === '√' ? 2 : 3
      i++
      return dom.root(primary(), k)
    }
    let a = primary()
    if (toks[i] === '%') {
      i++
      a = dom.div(a, dom.lit('100'))
    } else if (toks[i] === '²') {
      i++
      a = dom.mul(a, a)
    } else if (toks[i] === '³') {
      i++
      a = dom.mul(dom.mul(a, a), a)
    }
    if (toks[i] === 'of') {
      i++
      a = dom.mul(a, unit())
    }
    return a
  }
  const v = sum()
  if (i !== toks.length) throw new Error(`trailing tokens in "${src}"`)
  return v
}

/** Numeric value of an option string ("₹4,500", "12.5%", "−7", "36 years"); null for non-numeric ones. */
function optQ(s: string): Q | null {
  const m = /^[₹]?\s*(−|-)?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:%|[a-zA-Z/ ]*)$/.exec(s.trim())
  if (!m) return null
  const q = Q.of(m[2].replace(/,/g, ''))
  return m[1] ? new Q(-q.n, q.d) : q
}
const NONE = 'None of these'
const dec = (q: Q): string => {
  let p = 0
  while ((q.n * 10n ** BigInt(p)) % q.d !== 0n) {
    p++
    if (p > 12) throw new Error('non-terminating value')
  }
  const v = (q.n * 10n ** BigInt(p)) / q.d
  const digits = (v < 0n ? -v : v).toString().padStart(p + 1, '0')
  const body = p === 0 ? digits : `${digits.slice(0, -p)}.${digits.slice(-p)}`
  return v < 0n ? `-${body}` : body
}

// ------------------------------------------------------------------ checkers
type Checker = (q: QuestionDraft) => string | null

/** Numeric answer key must equal `val`; if "None of these" is keyed the value must be absent from the options and named in the explanation. */
function checkNumeric(q: QuestionDraft, val: Q, tag: string): string | null {
  const keyed = q.options[q.answer]
  const others = q.options.map((o) => (o === NONE ? null : optQ(o)))
  if (keyed === NONE) {
    if (others.some((o) => o !== null && o.eq(val))) return `${tag}: None keyed but ${val.str()} is among the options`
    const m = /the correct value, (.+?), is not among/.exec(q.explanation)
    if (!m) return `${tag}: None keyed without naming the value`
    const named = optQ(m[1])
    if (named === null || !named.eq(val)) return `${tag}: explanation names ${m[1]} but true value is ${val.str()}`
    return null
  }
  const ko = optQ(keyed)
  if (ko === null) return `${tag}: keyed option "${keyed}" not numeric`
  if (!ko.eq(val)) return `${tag}: keyed ${keyed} but recomputed ${val.str()}`
  const matches = others.filter((o) => o !== null && o.eq(val)).length
  if (matches !== 1) return `${tag}: value appears in ${matches} options`
  return null
}

const SIMPL_HEAD = 'What will come in place of the question mark (?) in the following question?'
const checkSimplification: Checker = (q) => {
  const lines = q.stem.split('\n')
  if (lines[0] === SIMPL_HEAD) {
    if (lines.length !== 2) return 'simplification: unexpected stem layout'
    const eqm = /^(.*) = (.*)$/.exec(lines[1])
    if (!eqm) return 'simplification: no equals sign'
    const [, L, R] = eqm
    if (R === '?') return checkNumeric(q, evalText(L, qDom), 'eval')
    // "find ?": substitute the key (or the value named for "None of these") and compare both sides
    const target = evalText(R, qDom)
    let cand: Q | null = null
    if (q.options[q.answer] === NONE) {
      const m = /the correct value, (.+?), is not among/.exec(q.explanation)
      cand = m ? optQ(m[1]) : null
    } else cand = optQ(q.options[q.answer])
    if (cand === null) return 'find: cannot read the key value'
    const left = evalText(L.replace('?', dec(cand)), qDom)
    if (!left.eq(target)) return `find: substituting ${cand.str()} gives ${left.str()}, right side is ${target.str()}`
    // no other option may also satisfy the equation (unique key)
    for (const [i, o] of q.options.entries()) {
      if (o === NONE || i === q.answer) continue
      const ov = optQ(o)
      if (ov === null) continue
      let ok = false
      try {
        ok = evalText(L.replace('?', dec(ov)), qDom).eq(target)
      } catch {
        ok = false
      }
      if (ok) return `find: option ${o} also satisfies the equation`
    }
    return null
  }
  const pm = /^Expression I is what percent (of|more than|less than) Expression II\?$/.exec(lines[0])
  if (pm) {
    const a = evalText(lines[1].replace(/^I\. /, ''), qDom)
    const b = evalText(lines[2].replace(/^II\. /, ''), qDom)
    const base = pm[1] === 'of' ? a.div(b) : pm[1] === 'more than' ? a.sub(b).div(b) : b.sub(a).div(b)
    if (pm[1] !== 'of' && base.cmp(qi(0)) <= 0) return 'percent pair: negative percentage'
    return checkNumeric(q, base.mul(qi(100)), 'pct-pair')
  }
  const vm = /^If x = (.*) and y = (.*), then find the value of (.*)\.$/.exec(q.stem)
  if (vm) {
    const x = evalText(vm[1], qDom)
    const y = evalText(vm[2], qDom)
    const two = qi(2)
    const val = vm[3] === 'x² − y²' ? x.mul(x).sub(y.mul(y)) : vm[3] === '(x + y)² − 4xy' ? x.add(y).mul(x.add(y)).sub(qi(4).mul(x).mul(y)) : vm[3] === '(x² + y²) ÷ 2 − xy' ? x.mul(x).add(y.mul(y)).div(two).sub(x.mul(y)) : null
    if (val === null) return `two-var: unknown form ${vm[3]}`
    return checkNumeric(q, val, 'two-var')
  }
  return 'simplification: unrecognised stem'
}

const checkApproximation: Checker = (q) => {
  const lines = q.stem.split('\n')
  if (lines.length !== 3 || !lines[1].startsWith('(You are not expected')) return 'approximation: unexpected stem layout'
  const eqm = /^(.*) = \?$/.exec(lines[2])
  if (!eqm) return 'approximation: no "= ?"'
  const x = evalText(eqm[1], fDom)
  const vals = q.options.map((o) => optQ(o))
  if (vals.some((v) => v === null)) return 'approximation: non-numeric option'
  const nums = (vals as Q[]).map((v) => v.num())
  const dist = nums.map((v) => Math.abs(v - x) / x)
  const best = dist.indexOf(Math.min(...dist))
  if (best !== q.answer) return `approximation: key is option ${q.answer} but option ${best} is nearest to ${x.toFixed(3)}`
  if (dist[q.answer] > 0.0055) return `approximation: key ${nums[q.answer]} is ${(dist[q.answer] * 100).toFixed(2)}% from the exact value ${x.toFixed(3)}`
  for (const [i, d] of dist.entries()) if (i !== q.answer && d < 0.025) return `approximation: distractor ${nums[i]} too close to ${x.toFixed(3)}`
  // the rounded expression named in the explanation must reproduce the key exactly
  const em = /The expression becomes (.*)\./.exec(q.explanation)
  if (!em) return 'approximation: explanation lacks the rounded expression'
  const r = evalText(em[1], qDom)
  if (!r.eq(vals[q.answer] as Q)) return `approximation: rounded expression gives ${r.str()} not ${nums[q.answer]}`
  return null
}

// ------------------------------------------------------------------ series
function parseSeries(stem: string): (number | null)[] {
  const line = stem.split('\n')[1]
  return line.split(/\s+/).map((t) => (t === '?' ? null : Number(t)))
}
/** evaluates "5 × 3 + 2² = 17" style segments: every segment of the chain must have the same value, returned. */
function evalArith(s: string): number {
  const toks = s.match(/\d+|[+−×÷()!²³]/g) ?? []
  if (toks.join('') !== s.replace(/\s+/g, '')) throw new Error(`unparsable arithmetic "${s}"`)
  let i = 0
  const sum = (): number => {
    let a = prod()
    while (toks[i] === '+' || toks[i] === '−') a = toks[i++] === '+' ? a + prod() : a - prod()
    return a
  }
  const prod = (): number => {
    let a = atom()
    while (toks[i] === '×' || toks[i] === '÷') a = toks[i++] === '×' ? a * atom() : a / atom()
    return a
  }
  const atom = (): number => {
    let a: number
    if (toks[i] === '(') {
      i++
      a = sum()
      i++
    } else a = Number(toks[i++])
    for (;;) {
      if (toks[i] === '²') {
        i++
        a = a * a
      } else if (toks[i] === '³') {
        i++
        a = a * a * a
      }
      else if (toks[i] === '!') {
        i++
        let f = 1
        for (let k = 2; k <= a; k++) f *= k
        a = f
      } else return a
    }
  }
  const v = sum()
  if (i !== toks.length) throw new Error(`trailing tokens in "${s}"`)
  return v
}
function termValues(expl: string): Map<number, number> {
  const out = new Map<number, number>()
  for (const line of expl.split('\n')) {
    const m = /^Term (\d+): (.*)$/.exec(line)
    if (!m) continue
    const segs = m[2].split(' = ')
    const vals = segs.map(evalArith)
    if (!vals.every((v) => Math.abs(v - vals[0]) < 1e-9)) throw new Error(`inconsistent chain in "${line}"`)
    out.set(Number(m[1]), vals[0])
  }
  return out
}
const checkWrongSeries: Checker = (q) => {
  const shown = parseSeries(q.stem) as number[]
  const tv = termValues(q.explanation)
  const key = Number(q.options[q.answer])
  const idx = shown.indexOf(key)
  if (idx < 0 || shown.indexOf(key, idx + 1) >= 0) return 'wrong-series: key is not a unique term of the series'
  if (idx < 2) return 'wrong-series: wrong term too early'
  if (idx >= shown.length - 2) return 'wrong-series: wrong term too late'
  if (!q.options.every((o) => shown.includes(Number(o)))) return 'wrong-series: an option is not in the series'
  const sm = /So the series should be ([\d, ]+)\./.exec(q.explanation)
  if (!sm) return 'wrong-series: corrected series missing'
  const fixed = sm[1].split(', ').map(Number)
  const diff = shown.map((v, i) => (v !== fixed[i] ? i : -1)).filter((i) => i >= 0)
  if (fixed.length !== shown.length || diff.length !== 1 || diff[0] !== idx) return 'wrong-series: corrected series differs in the wrong place'
  // the arithmetic lines of the explanation reproduce every corrected term (except the seed terms) and none of the shown ones that differ
  let covered = 0
  for (const [k, v] of tv) {
    if (fixed[k - 1] !== v) return `wrong-series: line for term ${k} gives ${v}, corrected series has ${fixed[k - 1]}`
    covered++
  }
  if (covered < shown.length - 2) return 'wrong-series: explanation covers too few terms'
  if (!tv.has(idx + 1)) return 'wrong-series: the corrected term has no arithmetic line'
  if (new Set(shown).size !== shown.length) return 'wrong-series: repeated terms'
  return null
}
const checkMissingSeries: Checker = (q) => {
  const shown = parseSeries(q.stem)
  const hole = shown.indexOf(null)
  const tv = termValues(q.explanation)
  let val: number | null = null
  if (q.options[q.answer] === NONE) {
    const m = /the correct value, (\d+), is not among/.exec(q.explanation)
    val = m ? Number(m[1]) : null
  } else val = Number(q.options[q.answer])
  if (val === null) return 'missing-series: cannot read the key'
  const line = tv.get(hole + 1)
  if (line === undefined) return 'missing-series: no arithmetic line for the missing term'
  if (line !== val) return `missing-series: key ${val} but the rule line gives ${line}`
  for (const [k, v] of tv) if (k - 1 !== hole && shown[k - 1] !== v) return `missing-series: shown term ${k} (${shown[k - 1]}) disagrees with the rule line ${v}`
  if (q.options.filter((o) => Number(o) === val).length > (q.options[q.answer] === NONE ? 0 : 1)) return 'missing-series: key duplicated among options'
  return null
}

// ------------------------------------------------------------------ equations: own parser + exhaustive rational-root search
type Ast = { t: 'n'; v: string } | { t: 'x' } | { t: 'neg'; a: Ast } | { t: 'sq'; a: Ast } | { t: 'b'; op: string; l: Ast; r: Ast }
function parseEq(src: string, v: string): Ast {
  const toks = src.match(new RegExp(`\\d+(?:\\.\\d+)?|${v}|[+−()/²×]`, 'g')) ?? []
  if (toks.join('') !== src.replace(/\s+/g, '')) throw new Error(`unparsable equation "${src}"`)
  let i = 0
  const starts = (t: string | undefined): boolean => t !== undefined && (t === '(' || t === v || /^\d/.test(t))
  const expr = (): Ast => {
    let neg = false
    if (toks[i] === '−') {
      neg = true
      i++
    }
    let a = term()
    if (neg) a = { t: 'neg', a }
    while (toks[i] === '+' || toks[i] === '−') {
      const op = toks[i++]
      a = { t: 'b', op, l: a, r: term() }
    }
    return a
  }
  const term = (): Ast => {
    let a = factor()
    for (;;) {
      if (toks[i] === '/') {
        i++
        a = { t: 'b', op: '/', l: a, r: factor() }
      }
      else if (starts(toks[i])) a = { t: 'b', op: '*', l: a, r: factor() }
      else return a
    }
  }
  const factor = (): Ast => {
    const t = toks[i++]
    let a: Ast
    if (t === '(') {
      a = expr()
      if (toks[i++] !== ')') throw new Error('bracket')
    } else if (t === v) a = { t: 'x' }
    else a = { t: 'n', v: t }
    if (toks[i] === '²') {
      i++
      a = { t: 'sq', a }
    }
    return a
  }
  const a = expr()
  if (i !== toks.length) throw new Error('trailing')
  return a
}
const astQ = (a: Ast, x: Q): Q => {
  switch (a.t) {
    case 'n':
      return Q.of(a.v)
    case 'x':
      return x
    case 'neg':
      return qi(0).sub(astQ(a.a, x))
    case 'sq': {
      const v = astQ(a.a, x)
      return v.mul(v)
    }
    default: {
      const l = astQ(a.l, x)
      const r = astQ(a.r, x)
      return a.op === '+' ? l.add(r) : a.op === '−' ? l.sub(r) : a.op === '*' ? l.mul(r) : l.div(r)
    }
  }
}
const astF = (a: Ast, x: number): number => {
  switch (a.t) {
    case 'n':
      return Number(a.v)
    case 'x':
      return x
    case 'neg':
      return -astF(a.a, x)
    case 'sq':
      return astF(a.a, x) ** 2
    default: {
      const l = astF(a.l, x)
      const r = astF(a.r, x)
      return a.op === '+' ? l + r : a.op === '−' ? l - r : a.op === '*' ? l * r : l / r
    }
  }
}
const CANDS: { q: Q; f: number }[] = (() => {
  const out: { q: Q; f: number }[] = []
  const seen = new Set<string>()
  for (let den = 1; den <= 12; den++)
    for (let n = -30 * den; n <= 30 * den; n++) {
      const q = new Q(BigInt(n), BigInt(den))
      const k = q.str()
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ q, f: n / den })
    }
  return out
})()
/** All rational roots (denominator <= 12, |x| <= 30) of `L = R`, found by exact exhaustive substitution. Poles are skipped. */
function solveEq(text: string, v: string): Q[] {
  const [L, R] = text.split(' = ')
  const al = parseEq(L, v)
  const ar = parseEq(R, v)
  const roots: Q[] = []
  for (const c of CANDS) {
    const approx = astF(al, c.f) - astF(ar, c.f)
    if (!(Math.abs(approx) < 1e-6)) continue
    try {
      if (astQ(al, c.q).eq(astQ(ar, c.q))) roots.push(c.q)
    } catch {
      /* pole */
    }
  }
  return roots
}
function relation(X: Q[], Y: Q[]): number {
  let g = 0
  let l = 0
  let e = 0
  for (const a of X)
    for (const b of Y) {
      const c = a.cmp(b)
      if (c > 0) g++
      else if (c < 0) l++
      else e++
    }
  if (l === 0 && e === 0) return 0
  if (g === 0 && l === 0) return 4
  if (l === 0) return 1
  if (g === 0 && e === 0) return 2
  if (g === 0) return 3
  return 4
}
const checkQuadratic: Checker = (q) => {
  if (JSON.stringify(q.options) !== JSON.stringify(QUADRATIC_OPTIONS)) return 'quadratic: options differ from the fixed set'
  const m1 = /\nI\. (.*)\nII\. (.*)$/.exec(q.stem)
  if (!m1) return 'quadratic: stem layout'
  const X = solveEq(m1[1], 'x')
  const Y = solveEq(m1[2], 'y')
  if (X.length !== 2 || Y.length !== 2) return `quadratic: found ${X.length} / ${Y.length} rational roots (need 2 each)`
  const rel = relation(X, Y)
  if (rel !== q.answer) return `quadratic: key ${q.answer} but roots ${X.map((r) => r.str())} vs ${Y.map((r) => r.str())} give ${rel}`
  return null
}

// ------------------------------------------------------------------ quantity comparison: independent word-problem solvers
function valuesOfQuantity(t: string): Q[] {
  let m = /^x, where (.*)$/.exec(t)
  if (m) return solveEq(m[1], 'x')
  m = /^y, where (.*)$/.exec(t)
  if (m) return solveEq(m[1], 'y')
  m = /^Compound interest \(in ₹\) on ₹(\d+) at (\d+)% p\.a\. for 2 years, compounded annually$/.exec(t)
  if (m) {
    const f = Q.of(m[2]).div(qi(100)).add(qi(1))
    return [qi(Number(m[1])).mul(f).mul(f).sub(qi(Number(m[1])))]
  }
  m = /^The sum \(in ₹\) on which the difference between compound interest and simple interest for 2 years at (\d+)% p\.a\. is ₹(\d+)$/.exec(t)
  if (m) {
    const r = Q.of(m[1]).div(qi(100))
    return [qi(Number(m[2])).div(r.mul(r))]
  }
  m = /^The (speed of the stream|speed of the boat in still water) \(in km\/h\), if a boat covers (\d+) km downstream in (\d+) hours and returns the same distance upstream in (\d+) hours$/.exec(t)
  if (m) {
    const down = qi(Number(m[2])).div(qi(Number(m[3])))
    const up = qi(Number(m[2])).div(qi(Number(m[4])))
    return [m[1] === 'speed of the stream' ? down.sub(up).div(qi(2)) : down.add(up).div(qi(2))]
  }
  m = /^The speed \(in km\/h\) of the second train, if two trains (\d+) m and (\d+) m long run in opposite directions, the first at (\d+) km\/h, and cross each other in (\d+) seconds$/.exec(t)
  if (m) return [qi(Number(m[1]) + Number(m[2])).div(qi(Number(m[4]))).mul(qi(18)).div(qi(5)).sub(qi(Number(m[3])))]
  m = /^The original number \(in the same unit\), if it is first increased by (\d+)% and then decreased by (\d+)% and the result is (\d+)$/.exec(t)
  if (m) return [qi(Number(m[3])).div(qi(100 + Number(m[1])).div(qi(100)).mul(qi(100 - Number(m[2])).div(qi(100))))]
  m = /^The present age \(in years\) of the younger person, if the ages of two persons are in the ratio (\d+) : (\d+) and after (\d+) years the ratio becomes (\d+) : (\d+)$/.exec(t)
  if (m) {
    const [a, b, y, p, r] = m.slice(1).map(Number)
    const sol: Q[] = []
    for (let k = 1; k <= 300; k++) if ((a * k + y) * r === (b * k + y) * p) sol.push(qi(a * k))
    if (sol.length !== 1) throw new Error('age problem not unique')
    return sol
  }
  m = /A alone (?:can finish it in|does in) (\d+) days and B alone in (\d+) days$/.exec(t)
  if (m) return [qi(Number(m[1]) * Number(m[2])).div(qi(Number(m[1]) + Number(m[2])))]
  m = /^The initial quantity \(in litres\) of milk, if a mixture of milk and water is in the ratio (\d+) : (\d+) and adding (\d+) litres of water changes the ratio of milk to water to (\d+) : (\d+)$/.exec(t)
  if (m) {
    const [a, b, w, p, r] = m.slice(1).map(Number)
    const sol: Q[] = []
    for (let k = 1; k <= 400; k++) if (a * k * r === (b * k + w) * p) sol.push(qi(a * k))
    if (sol.length !== 1) throw new Error('mixture problem not unique')
    return sol
  }
  m = /^The cost price \(in ₹\) of an article, if it is marked (\d+)% above the cost price, sold at a discount of (\d+)% and the profit is ₹(\d+)$/.exec(t)
  if (m) {
    const [mk, ds, pr] = m.slice(1).map(Number)
    return [qi(pr * 10000).div(qi((100 + mk) * (100 - ds) - 10000))]
  }
  m = /^(\d+(?:\.\d+)?)% of (\d+)% of (\d+)$/.exec(t)
  if (m) return [Q.of(m[1]).div(qi(100)).mul(Q.of(m[2]).div(qi(100))).mul(qi(Number(m[3])))]
  m = /^(\d+(?:\.\d+)?)% of (\d+)$/.exec(t)
  if (m) return [Q.of(m[1]).div(qi(100)).mul(qi(Number(m[2])))]
  m = /^The average of (.*) and (\d+)$/.exec(t)
  if (m) {
    const nums = [...m[1].split(', '), m[2]].map(Number)
    return [qi(nums.reduce((s, x) => s + x, 0)).div(qi(nums.length))]
  }
  m = /^The speed \(in km\/h\) of a car that covers (\d+) km in (\d+) hours$/.exec(t)
  if (m) return [qi(Number(m[1])).div(qi(Number(m[2])))]
  throw new Error(`no independent solver for quantity "${t}"`)
}
const checkQuantity: Checker = (q) => {
  if (JSON.stringify(q.options) !== JSON.stringify(QUANTITY_OPTIONS)) return 'quantity: options differ from the fixed set'
  const lines = q.stem.split('\n')
  const a = /^Quantity I: (.*)$/.exec(lines[1])
  const b = /^Quantity II: (.*)$/.exec(lines[2])
  if (!a || !b) return 'quantity: stem layout'
  const A = valuesOfQuantity(a[1])
  const B = valuesOfQuantity(b[1])
  if (a[1].includes(', where') && A.length !== 2) return 'quantity: equation I lacks two roots'
  if (b[1].includes(', where') && B.length !== 2) return 'quantity: equation II lacks two roots'
  if (A.length === 0 || B.length === 0) return 'quantity: empty value set'
  const rel = relation(A, B)
  if (rel !== q.answer) return `quantity: key ${q.answer} but values ${A.map((r) => r.str())} vs ${B.map((r) => r.str())} give ${rel}`
  return null
}

// ------------------------------------------------------------------ harness
interface Spec {
  topic: QuantTopicId
  gen: TopicGenerator
  check: Checker
  counts: number[]
  /** key letter frequencies must lie in [12%, 28%] unless the key position is fixed by design. */
  uniform: boolean
}
const SPECS: Spec[] = [
  { topic: 'simplification', gen: MAINS_CALC.simplification as TopicGenerator, check: checkSimplification, counts: [1, 3, 5, 8], uniform: true },
  { topic: 'approximation', gen: MAINS_CALC.approximation as TopicGenerator, check: checkApproximation, counts: [1, 2, 5, 8], uniform: true },
  { topic: 'wrong-number-series', gen: MAINS_SERIES['wrong-number-series'] as TopicGenerator, check: checkWrongSeries, counts: [1, 2, 5, 8], uniform: true },
  { topic: 'missing-number-series', gen: MAINS_SERIES['missing-number-series'] as TopicGenerator, check: checkMissingSeries, counts: [1, 2, 5, 8], uniform: true },
  { topic: 'quadratic-equations', gen: MAINS_ALGEBRA['quadratic-equations'] as TopicGenerator, check: checkQuadratic, counts: [1, 2, 5, 8], uniform: true },
  { topic: 'quantity-comparison', gen: MAINS_ALGEBRA['quantity-comparison'] as TopicGenerator, check: checkQuantity, counts: [1, 2, 5, 8], uniform: true },
]

const flat = (gs: Group[]): QuestionDraft[] => gs.flatMap((g) => g.questions)
const samples: Record<string, QuestionDraft[]> = {}

for (const spec of SPECS) {
  const label = spec.topic
  if (typeof spec.gen !== 'function') {
    fail(`${label}: generator missing from the registry`)
    continue
  }
  const pos = [0, 0, 0, 0, 0]
  const stems = new Set<string>()
  let total = 0
  let checked = 0
  let ms = 0
  let msQ = 0
  for (let seed = 1; seed <= SEEDS; seed++) {
    const count = spec.counts[seed % spec.counts.length]
    const t0 = performance.now()
    let groups: Group[]
    try {
      groups = spec.gen(createRng(seed * 7919 + 13), 'hard', count)
    } catch (e) {
      fail(`${label} seed ${seed}: generator threw ${(e as Error).message}`)
      continue
    }
    ms += performance.now() - t0
    msQ += count
    const qs = flat(groups)
    if (qs.length !== count) fail(`${label} seed ${seed}: expected ${count} questions, got ${qs.length}`)
    groups.forEach((g, gi) => {
      try {
        assertGroup(g, `${label} seed ${seed} g${gi}`)
      } catch (e) {
        fail((e as Error).message)
      }
    })
    const again = JSON.stringify(spec.gen(createRng(seed * 7919 + 13), 'hard', count))
    if (again !== JSON.stringify(groups)) fail(`${label} seed ${seed}: not deterministic`)
    const seenHere = new Set<string>()
    for (const q of qs) {
      total++
      pos[q.answer]++
      stems.add(q.stem)
      if (seenHere.has(q.stem)) fail(`${label} seed ${seed}: duplicate stem in one paper`)
      seenHere.add(q.stem)
      if (q.topic !== spec.topic) fail(`${label}: wrong topic tag ${q.topic}`)
      if (new Set(q.options.map((o) => o.trim().toLowerCase())).size !== 5) fail(`${label} seed ${seed}: duplicate options`)
      if (!/\n/.test(q.explanation) || !q.explanation.includes('Correct answer: (' + 'ABCDE'[q.answer] + ')')) fail(`${label} seed ${seed}: explanation not multi-line / answer line mismatch`)
      const bad = BAD_CHAR.match(q.stem + q.options.join('') + q.explanation)
      if (bad) fail(`${label} seed ${seed}: disallowed character ${JSON.stringify(bad)}`)
      let msg: string | null
      try {
        msg = spec.check(q)
      } catch (e) {
        msg = `checker threw ${(e as Error).message}`
      }
      checked++
      if (msg !== null) fail(`${label} seed ${seed}: ${msg}\n    ${q.stem.replace(/\n/g, ' | ')}\n    options: ${q.options.join(' ; ')} key=${'ABCDE'[q.answer]}`)
      else if (!samples[label]) samples[label] = [q]
      else if (samples[label].length < 3 && seed % 97 === 0) samples[label].push(q)
    }
  }
  const pct = pos.map((c) => (100 * c) / total)
  if (spec.uniform && pct.some((p) => p < 12 || p > 28)) fail(`${label}: key positions not uniform (${pct.map((p) => p.toFixed(1)).join('% ')}%)`)
  console.log(`${label.padEnd(22)} questions=${total} independently-checked=${checked} distinct-stems=${stems.size} avg-ms-per-30=${((ms / msQ) * 30).toFixed(1)} key%=[${pct.map((p) => p.toFixed(0)).join(' ')}]`)
}

console.log('\n================ SAMPLE QUESTIONS (eyeball the difficulty) ================')
for (const spec of SPECS) {
  const list = samples[spec.topic] ?? []
  while (list.length < 3 && typeof spec.gen === 'function') {
    list.push(flat(spec.gen(createRng(500 + list.length * 31), 'hard', 1))[0])
  }
  for (const q of list.slice(0, 3)) {
    console.log(`\n--- ${spec.topic}`)
    console.log(q.stem)
    console.log(q.options.map((o, i) => `(${'ABCDE'[i]}) ${o}`).join('   '))
    console.log(q.explanation)
  }
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
