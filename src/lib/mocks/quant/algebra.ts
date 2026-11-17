// Quadratic equations (x vs y) and Quantity Comparison.
import type { Rng } from '../rng'
import type { Group, MockDifficulty, QuestionDraft } from '../types'
import { QUADRATIC_OPTIONS, QUANTITY_OPTIONS } from '../options'
import { F, Reject, stepsText, decStr, ensure, fadd, fcmp, fdec, fdiv, feq, fmul, fracStr, fsum, fval, fixedQ, gcd, lcm, need, terminating, wpick } from './util'
import type { Frac } from './util'

// ------------------------------------------------------------------ roots, relation
/** 0: x>y  1: x≥y  2: x<y  3: x≤y  4: x=y or no relation. Compares ALL root pairs. */
export function relationIndex(X: Frac[], Y: Frac[]): number {
  let gt = 0
  let eq = 0
  let lt = 0
  for (const a of X)
    for (const b of Y) {
      const c = fcmp(a, b)
      if (c > 0) gt++
      else if (c < 0) lt++
      else eq++
    }
  if (lt === 0 && eq === 0) return 0
  if (lt === 0 && gt === 0) return 4 // all pairs equal
  if (lt === 0) return 1
  if (gt === 0 && eq === 0) return 2
  if (gt === 0) return 3
  return 4
}

function rootStr(f: Frac): string {
  const s = terminating(f, 2) ? decStr(f, 2) : fracStr(f)
  return s.replace(/^-/, '−')
}

function signed(n: number, first = false): string {
  if (first) return n < 0 ? `−${-n}` : `${n}`
  return n < 0 ? ` − ${-n}` : ` + ${n}`
}
function term(coef: number, sym: string, first: boolean): string {
  if (coef === 0) return ''
  const a = Math.abs(coef)
  const body = a === 1 ? sym : `${a}${sym}`
  if (first) return coef < 0 ? `−${body}` : body
  return coef < 0 ? ` − ${body}` : ` + ${body}`
}
function polyText(a: number, b: number, c: number, v: string): string {
  return `${term(a, `${v}²`, true)}${term(b, v, false)}${c === 0 ? '' : signed(c)}`
}
function factor(p: number, q: number, v: string): string {
  // (q v − p)
  const lead = q === 1 ? v : `${q}${v}`
  return p >= 0 ? `(${lead} − ${p})` : `(${lead} + ${-p})`
}

export interface Eq {
  text: string
  roots: Frac[]
  sol: string
  kind: string
}

const nz = (rng: Rng, lo: number, hi: number): number => {
  let v = 0
  while (v === 0) v = rng.int(lo, hi)
  return v
}
function pickInt(rng: Rng, lo: number, hi: number, hint?: number): number {
  if (hint !== undefined && rng.chance(0.55)) {
    const v = hint + rng.int(-2, 2)
    if (v !== 0 && v >= lo && v <= hi) return v
  }
  return nz(rng, lo, hi)
}

const mn = (n: number): string => String(n).replace('-', '−')
/** A number written so that it can sit inside an expression: negatives go in brackets. */
const sn = (n: number): string => (n < 0 ? `(−${-n})` : String(n))
const factorInner = (p: number, q: number, v: string): string => `${q === 1 ? v : `${q}${v}`} ${p >= 0 ? '−' : '+'} ${Math.abs(p)}`

/**
 * Split-the-middle-term working for a v² + b v + c = 0 whose factors are (q1 v − p1)(q2 v − p2):
 * u = −p1 q2 and w = −p2 q1 have product a c and sum b; grouping gives q2 v (q1 v − p1) − p2 (q1 v − p1).
 */
function factorSteps(p1: number, q1: number, p2: number, q2: number, v: string, roots: Frac[]): string {
  const a = q1 * q2
  const b = -(p1 * q2 + p2 * q1)
  const c = p1 * p2
  const u = -p1 * q2
  const w = -p2 * q1
  ensure(u + w === b && u * w === a * c, `quadratic: split numbers ${u}, ${w} do not have sum ${b} and product ${a * c}`)
  // the grouping identity, checked by expanding (q2 v − p2)(q1 v − p1) coefficient by coefficient
  ensure(q1 * q2 === a && -(q2 * p1) - p2 * q1 === b && p1 * p2 === c, 'quadratic: grouped form does not expand to the equation')
  const split = `${term(a, `${v}²`, true)}${term(u, v, false)}${term(w, v, false)}${signed(c)} = 0`
  const lead = q2 === 1 ? v : `${q2}${v}`
  const f1 = factorInner(p1, q1, v)
  const group = `${lead}(${f1}) ${-p2 >= 0 ? '+' : '−'} ${Math.abs(p2)}(${f1}) = 0`
  const uniq = roots.filter((r, i) => roots.findIndex((x) => feq(x, r)) === i)
  return [
    `Split the middle term: a × c = ${a} × ${sn(c)} = ${mn(a * c)}, b = ${mn(b)}`,
    `Two numbers with product ${mn(a * c)} and sum ${mn(b)} are ${mn(u)} and ${mn(w)}`,
    split,
    group,
    `${factor(p1, q1, v)}${factor(p2, q2, v)} = 0`,
    uniq.map((r) => `${v} = ${rootStr(r)}`).join(' or '),
  ].join('\n')
}

/** Quadratic with rational roots p1/q1, p2/q2 as (q1 v − p1)(q2 v − p2) = 0. */
function factored(p1: number, q1: number, p2: number, q2: number, v: string): Eq {
  const a = q1 * q2
  const b = -(p1 * q2 + p2 * q1)
  const c = p1 * p2
  const g = gcd(gcd(a, b), c)
  need(g === 1 && a <= 60 && Math.abs(b) <= 90 && Math.abs(c) <= 150 && b !== 0, 'coefficients unsuitable')
  const roots = [F(p1, q1), F(p2, q2)]
  // verify by substitution (second method)
  for (const r of roots) {
    const val = fadd(fadd(fmul(F(a), fmul(r, r)), fmul(F(b), r)), F(c))
    ensure(val.n === 0, `quadratic: root ${rootStr(r)} does not satisfy ${polyText(a, b, c, v)}`)
  }
  return { text: `${polyText(a, b, c, v)} = 0`, roots, sol: factorSteps(p1, q1, p2, q2, v, roots), kind: 'factored' }
}

function genEq(rng: Rng, d: MockDifficulty, v: string, hint: Frac[] | undefined): Eq {
  const h0 = hint ? Math.round(fval(rng.pick(hint))) : undefined
  const kind = wpick<string>(rng, d === 'hard' ? [['int', 22], ['rat', 28], ['sq', 8], ['root', 6], ['rearr', 22], ['shift', 10], ['cube', 4]] : [['int', 68], ['rat', 22], ['sq', 10]])
  const range = d === 'hard' ? 15 : 14
  const lo = d === 'hard' ? -range : rng.chance(0.15) ? -9 : 1
  if (kind === 'int') {
    const r1 = pickInt(rng, lo, range, h0)
    const r2 = pickInt(rng, lo, range, h0)
    need(r1 + r2 !== 0, 'zero linear coefficient')
    return factored(r1, 1, r2, 1, v)
  }
  if (kind === 'rat') {
    const q1 = rng.pick(d === 'hard' ? [1, 2, 2, 3, 4, 5, 6] : [1, 2, 2, 4])
    const q2 = rng.pick(d === 'hard' ? [2, 3, 4, 5, 6, 1] : [1, 1, 1, 2])
    need(q1 * q2 > 1, 'not rational')
    const p1 = pickInt(rng, lo * q1, range, h0 === undefined ? undefined : h0 * q1)
    const p2 = pickInt(rng, lo * q2, range, h0 === undefined ? undefined : h0 * q2)
    return factored(p1, q1, p2, q2, v)
  }
  if (kind === 'sq') {
    const k = pickInt(rng, 3, 25, h0 === undefined ? undefined : Math.abs(h0))
    const N = k * k
    const moved = rng.chance(0.5)
    const first = moved ? `Move ${N} to the right-hand side: ${v}² = ${N}` : `Take the square root of both sides of ${v}² = ${N}`
    return { text: moved ? `${v}² − ${N} = 0` : `${v}² = ${N}`, roots: [F(k), F(-k)], sol: [first, `${v} = ±√${N} = ±${k}`, `${v} = ${k} or ${v} = −${k}`].join('\n'), kind: 'sq' }
  }
  if (kind === 'root') {
    const k = pickInt(rng, 3, 25, h0)
    need(k > 0, 'root must be positive')
    return { text: `${v} = √${k * k}`, roots: [F(k)], sol: [`${v} = √${k * k} = ${k} (a square root is taken as positive)`, `${v} = ${k}`].join('\n'), kind: 'root' }
  }
  if (kind === 'cube') {
    const k = pickInt(rng, 2, 11, h0)
    need(k > 0, 'cube root must be positive')
    return { text: `${v}³ = ${k ** 3}`, roots: [F(k)], sol: [`${v}³ = ${k ** 3}, so ${v} = ∛${k ** 3} = ${k}`, `${v} = ${k}`].join('\n'), kind: 'cube' }
  }
  if (kind === 'shift') {
    const a = nz(rng, -9, 9)
    const k = rng.int(2, 9)
    const N = k * k
    const text = a > 0 ? `(${v} + ${a})² = ${N}` : `(${v} − ${-a})² = ${N}`
    const sol = [`Take the square root of both sides: ${v} ${a > 0 ? '+' : '−'} ${Math.abs(a)} = ±√${N} = ±${k}`, `${v} = ${mn(-a)} + ${k} = ${mn(-a + k)} or ${v} = ${mn(-a)} − ${k} = ${mn(-a - k)}`].join('\n')
    return { text, roots: [F(-a + k), F(-a - k)], sol, kind: 'shift' }
  }
  // rearranged: v² + p v + q = r v + s
  const r1 = pickInt(rng, lo, range, h0)
  const r2 = pickInt(rng, lo, range, h0)
  const b = -(r1 + r2)
  const c = r1 * r2
  const r = nz(rng, -7, 9)
  const s = nz(rng, -25, 30)
  const p = b + r
  const q = c + s
  need(b !== 0, 'degenerate')
  const lhs = `${v}²${term(p, v, false)}${q === 0 ? '' : signed(q)}`
  const rhs = `${term(r, v, true)}${signed(s)}`
  const roots = [F(r1), F(r2)]
  ensure(p - r === b && q - s === c, 'quadratic: rearranged coefficients do not combine to the monic form')
  const sol = [
    `Bring all terms to one side: ${v}²${term(p, v, false)}${q === 0 ? '' : signed(q)}${term(-r, v, false)}${signed(-s)} = 0`,
    `Combine like terms: ${v}² + (${mn(p)} ${r < 0 ? '+' : '−'} ${Math.abs(r)})${v} + (${mn(q)} ${s < 0 ? '+' : '−'} ${Math.abs(s)}) = 0`,
    `${polyText(1, b, c, v)} = 0`,
    factorSteps(r1, 1, r2, 1, v, roots),
  ].join('\n')
  return { text: `${lhs} = ${rhs}`, roots, sol, kind: 'rearr' }
}

/** Equations for the Quantity-Comparison "x such that…" quantities (adds simple linear equations). */
function genEqQ(rng: Rng, d: MockDifficulty, v: string, hint: Frac[] | undefined): Eq {
  if (rng.chance(0.2)) {
    const x = nz(rng, 2, 15)
    const a = rng.int(2, 7)
    const b = rng.int(1, 20)
    return { text: `${a}${v} + ${b} = ${a * x + b}`, roots: [F(x)], sol: [`Subtract ${b} from both sides: ${a}${v} = ${a * x + b} − ${b} = ${a * x}`, `Divide both sides by ${a}: ${v} = ${a * x} ÷ ${a} = ${x}`].join('\n'), kind: 'linear' }
  }
  return genEq(rng, d, v, hint)
}

const DOM_WORDS = [
  'Quantity I is greater than Quantity II for every x',
  'Quantity I is at least Quantity II for every x, with equality for some x',
  'Quantity I is less than Quantity II for every x',
  'Quantity I is at most Quantity II for every x, with equality for some x',
  'the comparison changes with x (or the quantities are always equal)',
]

/** Pairwise comparison of every root of the first equation with every root of the second, with the reason for the verdict. */
function compareStep(X: Frac[], Y: Frac[], rel: number, n1: string, n2: string): string {
  const uniq = (rs: Frac[]): Frac[] => rs.filter((r, i) => rs.findIndex((q) => feq(q, r)) === i)
  const pairs: string[] = []
  let g = 0
  let e = 0
  let l = 0
  for (const a of uniq(X))
    for (const b of uniq(Y)) {
      const c = fcmp(a, b)
      pairs.push(`${rootStr(a)} ${c > 0 ? '>' : c < 0 ? '<' : '='} ${rootStr(b)}`)
      if (c > 0) g++
      else if (c < 0) l++
      else e++
    }
  const why = [
    `every pair gives ${n1} > ${n2}, so ${n1} > ${n2}`,
    `no pair gives ${n1} < ${n2} and at least one pair gives ${n1} = ${n2}, so ${n1} ≥ ${n2}`,
    `every pair gives ${n1} < ${n2}, so ${n1} < ${n2}`,
    `no pair gives ${n1} > ${n2} and at least one pair gives ${n1} = ${n2}, so ${n1} ≤ ${n2}`,
    g === 0 && l === 0 ? `every pair gives ${n1} = ${n2}, so ${n1} = ${n2}` : `some pairs give ${n1} > ${n2} and some give ${n1} < ${n2}, so no definite relation can be established`,
  ][rel]
  ensure(rel === relationIndex(X, Y), 'quadratic: comparison text disagrees with the relation')
  return `Compare every value of x with every value of y:\n${pairs.join(', ')}\nHence ${why}`
}

function quadratic(rng: Rng, d: MockDifficulty): QuestionDraft {
  const target = d === 'hard' ? wpick<number>(rng, [[0, 18], [1, 18], [2, 18], [3, 18], [4, 28]]) : rng.int(0, 4)
  for (let i = 0; i < 600; i++) {
    let e1: Eq
    let e2: Eq
    try {
      e1 = genEq(rng, d, 'x', undefined)
      e2 = genEq(rng, d, 'y', e1.roots)
    } catch (e) {
      if (e instanceof Reject) continue
      throw e
    }
    const rel = relationIndex(e1.roots, e2.roots)
    if (rel !== target) continue
    // second method: brute-force the sign of every difference with plain floats
    let g = 0
    let l = 0
    let q = 0
    for (const a of e1.roots)
      for (const b of e2.roots) {
        if (Math.abs(fval(a) - fval(b)) < 1e-12) q++
        else if (fval(a) > fval(b)) g++
        else l++
      }
    const rel2 = l === 0 && q === 0 ? 0 : l === 0 && g === 0 ? 4 : l === 0 ? 1 : g === 0 && q === 0 ? 2 : g === 0 ? 3 : 4
    ensure(rel2 === rel, 'quadratic: relation methods disagree')
    const why = stepsText([`Solve equation I (x):\n${e1.sol}`, `Solve equation II (y):\n${e2.sol}`, compareStep(e1.roots, e2.roots, rel, 'x', 'y')], QUADRATIC_OPTIONS[rel])
    return fixedQ('quadratic-equations', `In each of the following questions, two equations I and II are given. Solve both the equations and give answer:\nI. ${e1.text}\nII. ${e2.text}`, QUADRATIC_OPTIONS, rel, why)
  }
  throw new Reject('no equation pair for target relation')
}

// ------------------------------------------------------------------ quantity comparison
interface Qty {
  text: string
  v: Frac
  /** the computation, shown in the solution */
  calc: string
}
type QtyGen = (rng: Rng) => Qty

const qPct: QtyGen = (rng) => {
  const p = rng.pick([5, 8, 10, 12, 15, 16, 20, 24, 25, 30, 35, 36, 40, 45, 48, 50, 60, 64, 75, 80])
  const N = rng.int(8, 60) * 20
  const v = F(p * N, 100)
  ensure(feq(v, fmul(fdec(p / 100, 4), F(N))), 'qty percent mismatch')
  need(terminating(v, 1), 'unclean')
  return { text: `${p}% of ${N}`, v, calc: `${p}% of ${N} = ${p} × ${N} ÷ 100 = ${decStr(v, 2)}` }
}
const qAvg: QtyGen = (rng) => {
  const n = rng.int(3, 5)
  const nums = Array.from({ length: n }, () => rng.int(10, 99))
  const v = F(nums.reduce((a, b) => a + b, 0), n)
  const v2 = fadd(F(nums[0]), fdiv(fsum(nums.map((x) => F(x - nums[0]))), F(n)))
  ensure(feq(v, v2), 'qty average mismatch')
  need(terminating(v, 1), 'unclean')
  const list = nums.slice(0, -1).join(', ') + ' and ' + nums[n - 1]
  return { text: `The average of ${list}`, v, calc: `Average = (${nums.join(' + ')}) ÷ ${n} = ${nums.reduce((x, y) => x + y, 0)} ÷ ${n} = ${decStr(v, 2)}` }
}
const qSI: QtyGen = (rng) => {
  const P = rng.int(4, 30) * 500
  const r = rng.int(4, 15)
  const t = rng.int(2, 6)
  const v = F(P * r * t, 100)
  let loop = 0
  for (let y = 0; y < t; y++) loop += (P * r) / 100
  ensure(loop === fval(v), 'qty SI mismatch')
  return { text: `Simple interest (in ₹) on ₹${P} at ${r}% per annum for ${t} years`, v, calc: `Simple interest = P × R × T ÷ 100 = ${P} × ${r} × ${t} ÷ 100 = ${decStr(v, 2)}` }
}
const qArea: QtyGen = (rng) => {
  const l = rng.int(12, 60)
  const b = rng.int(8, 40)
  need(l !== b, 'square')
  let acc = 0
  for (let i = 0; i < l; i++) acc += b
  ensure(acc === l * b, 'qty area mismatch')
  return { text: `The area (in cm²) of a rectangle with length ${l} cm and breadth ${b} cm`, v: F(l * b), calc: `Area = length × breadth = ${l} × ${b} = ${l * b}` }
}
const qSqPerim: QtyGen = (rng) => {
  const k = rng.int(6, 40)
  ensure(Math.round(Math.sqrt(k * k)) * 4 === 4 * k, 'qty perimeter mismatch')
  return { text: `The perimeter (in cm) of a square whose area is ${k * k} cm²`, v: F(4 * k), calc: `Side = √${k * k} = ${k}; perimeter = 4 × ${k} = ${4 * k}` }
}
const qLcmHcf: QtyGen = (rng) => {
  const g = rng.int(2, 12)
  const a = g * rng.int(2, 9)
  const b = g * rng.int(2, 9)
  need(a !== b, 'same')
  const isL = rng.chance(0.5)
  if (isL) {
    let m = Math.max(a, b)
    while (m % a !== 0 || m % b !== 0) m++
    ensure(m === lcm(a, b), 'qty lcm mismatch')
    return { text: `The LCM of ${a} and ${b}`, v: F(m), calc: `LCM = (${a} × ${b}) ÷ HCF = ${a * b} ÷ ${gcd(a, b)} = ${m}` }
  }
  let h = Math.min(a, b)
  while (a % h !== 0 || b % h !== 0) h--
  ensure(h === gcd(a, b), 'qty hcf mismatch')
  return { text: `The HCF of ${a} and ${b}`, v: F(h), calc: `The largest number that divides both ${a} and ${b} is ${h}` }
}
const qSumN: QtyGen = (rng) => {
  const n = rng.int(10, 60)
  let s = 0
  for (let i = 1; i <= n; i++) s += i
  ensure(s === (n * (n + 1)) / 2, 'qty sum mismatch')
  return { text: `The sum of the first ${n} natural numbers`, v: F(s), calc: `Sum = n(n + 1) ÷ 2 = ${n} × ${n + 1} ÷ 2 = ${s}` }
}
const qSP: QtyGen = (rng) => {
  const C = rng.int(10, 120) * 20
  const p = rng.pick([5, 10, 15, 20, 25, 30, 40])
  const loss = rng.chance(0.4)
  const v = F(C * (100 + (loss ? -p : p)), 100)
  const v2 = fadd(F(C), fmul(F(loss ? -p : p, 100), F(C)))
  ensure(feq(v, v2), 'qty SP mismatch')
  return { text: `The selling price (in ₹) of an article bought for ₹${C} at ${p}% ${loss ? 'loss' : 'profit'}`, v, calc: `Selling price = cost × (100 ${loss ? '−' : '+'} ${p}) ÷ 100 = ${C} × ${100 + (loss ? -p : p)} ÷ 100 = ${decStr(v, 2)}` }
}
const qDist: QtyGen = (rng) => {
  const sp = rng.int(8, 25) * 5
  const t = rng.int(2, 9)
  return { text: `The distance (in km) covered by a car moving at ${sp} km/h in ${t} hours`, v: F(sp * t), calc: `Distance = speed × time = ${sp} × ${t} = ${sp * t}` }
}
const qDiffSq: QtyGen = (rng) => {
  const a = rng.int(15, 60)
  const b = rng.int(5, a - 1)
  ensure(a * a - b * b === (a - b) * (a + b), 'qty difference of squares mismatch')
  return { text: `The value of ${a}² − ${b}²`, v: F(a * a - b * b), calc: `${a}² − ${b}² = ${a * a} − ${b * b} = ${a * a - b * b}` }
}
const qTrain: QtyGen = (rng) => {
  const L = rng.int(4, 40) * 10
  const t = rng.int(4, 30)
  const v = F(L * 18, 5 * t)
  need(terminating(v, 1), 'unclean')
  const v2 = fdiv(fdiv(F(L), F(1000)), fdiv(F(t), F(3600)))
  ensure(feq(v, v2), 'qty train mismatch')
  return { text: `The speed (in km/h) of a ${L} m long train that crosses a pole in ${t} seconds`, v, calc: `Speed = ${L} × 18 ÷ (${t} × 5) = ${L * 18} ÷ ${5 * t} = ${decStr(v, 2)}` }
}
const QTY_GENS: QtyGen[] = [qPct, qAvg, qSI, qArea, qSqPerim, qLcmHcf, qSumN, qSP, qDist, qDiffSq, qTrain]

function qtyArith(rng: Rng): { t1: string; t2: string; rel: number; why: string } {
  const target = wpick<number>(rng, [[0, 30], [2, 30], [4, 40]])
  const g1 = rng.pick(QTY_GENS)
  for (let i = 0; i < 400; i++) {
    let a: Qty
    let b: Qty
    try {
      a = g1(rng)
      // same-family comparisons are common, but half the time use a different family
      b = (rng.chance(0.5) ? g1 : rng.pick(QTY_GENS))(rng)
    } catch (e) {
      if (e instanceof Reject) continue
      throw e
    }
    const c = fcmp(a.v, b.v)
    const rel = c > 0 ? 0 : c < 0 ? 2 : 4
    if (rel !== target) continue
    const ratio = fval(a.v) / fval(b.v)
    if (ratio < 0.5 || ratio > 2) continue
    if (a.text === b.text) continue
    const s = (f: Frac): string => (terminating(f, 2) ? decStr(f, 2) : fracStr(f))
    return { t1: a.text, t2: b.text, rel, why: stepsText([`Quantity I: ${a.calc}`, `Quantity II: ${b.calc}`, `Compare the two values: ${s(a.v)} ${rel === 0 ? '>' : rel === 2 ? '<' : '='} ${s(b.v)}`], QUANTITY_OPTIONS[rel]) }
  }
  throw new Reject('no comparable pair')
}

function qtyHeader(): string {
  return 'In the following question, two quantities I and II are given. Compare them and choose the correct option.'
}

function qcArith(rng: Rng): QuestionDraft {
  const r = qtyArith(rng)
  return fixedQ('quantity-comparison', `${qtyHeader()}\nQuantity I: ${r.t1}\nQuantity II: ${r.t2}`, QUANTITY_OPTIONS, r.rel, r.why)
}

function qcRoots(rng: Rng, d: MockDifficulty): QuestionDraft {
  const target = rng.int(0, 4)
  for (let i = 0; i < 600; i++) {
    let e1: Eq
    let e2: Eq
    try {
      e1 = genEqQ(rng, d, 'x', undefined)
      e2 = genEqQ(rng, d, 'y', e1.roots)
    } catch (e) {
      if (e instanceof Reject) continue
      throw e
    }
    const rel = relationIndex(e1.roots, e2.roots)
    if (rel !== target) continue
    const why = stepsText([`Solve the equation for Quantity I (x):\n${e1.sol}`, `Solve the equation for Quantity II (y):\n${e2.sol}`, compareStep(e1.roots, e2.roots, rel, 'Quantity I', 'Quantity II')], QUANTITY_OPTIONS[rel])
    return fixedQ('quantity-comparison', `${qtyHeader()}\nQuantity I: x, where ${e1.text}\nQuantity II: y, where ${e2.text}`, QUANTITY_OPTIONS, rel, why)
  }
  throw new Reject('no pair')
}

interface Form {
  kind: 'lin' | 'sq' | 'sqk' | 'const'
  a: number
  b: number
}
function formText(f: Form): string {
  switch (f.kind) {
    case 'lin':
      return `${f.a === 1 ? 'x' : `${f.a}x`}${f.b === 0 ? '' : signed(f.b)}`
    case 'sq':
      return `x²`
    case 'sqk':
      return `x²${signed(f.b)}`
    case 'const':
      return `${f.b}`
  }
}
function formVal(f: Form, x: number): number {
  switch (f.kind) {
    case 'lin':
      return f.a * x + f.b
    case 'sq':
      return x * x
    case 'sqk':
      return x * x + f.b
    case 'const':
      return f.b
  }
}
function randForm(rng: Rng, d: MockDifficulty): Form {
  const kind = wpick<Form['kind']>(rng, [['lin', 5], ['sq', 2], ['sqk', d === 'hard' ? 3 : 1], ['const', 1]])
  return { kind, a: rng.int(1, 4), b: kind === 'sqk' ? nz(rng, -8, 12) : kind === 'const' ? rng.int(1, 40) : rng.int(-6, 12) }
}

function qcDomain(rng: Rng, d: MockDifficulty): QuestionDraft {
  const target = rng.int(0, 4)
  for (let i = 0; i < 800; i++) {
    const lo = d === 'hard' ? rng.int(-4, 3) : rng.int(1, 5)
    const hi = lo + rng.int(3, 6)
    const strictLo = rng.chance(0.4)
    const strictHi = rng.chance(0.4)
    const dom: number[] = []
    for (let x = lo; x <= hi; x++) if ((strictLo ? x > lo : x >= lo) && (strictHi ? x < hi : x <= hi)) dom.push(x)
    if (dom.length < 3) continue
    const f1 = randForm(rng, d)
    const f2 = randForm(rng, d)
    if (formText(f1) === formText(f2) || f1.kind === 'const' && f2.kind === 'const') continue
    const v1 = dom.map((x) => F(formVal(f1, x)))
    const v2 = dom.map((x) => F(formVal(f2, x)))
    let g = 0
    let l = 0
    let q = 0
    dom.forEach((_, i) => (v1[i].n > v2[i].n ? g++ : v1[i].n < v2[i].n ? l++ : q++))
    const rel = l === 0 && q === 0 ? 0 : l === 0 && g === 0 ? 4 : l === 0 ? 1 : g === 0 && q === 0 ? 2 : g === 0 ? 3 : 4
    const cs = dom.map((_, i) => fcmp(v1[i], v2[i]))
    const rel2 = cs.every((c) => c > 0) ? 0 : cs.every((c) => c === 0) ? 4 : cs.every((c) => c >= 0) ? 1 : cs.every((c) => c < 0) ? 2 : cs.every((c) => c <= 0) ? 3 : 4
    ensure(rel === rel2, 'quantity comparison: domain relation methods disagree')
    if (rel !== target) continue
    const cond = `${mn(lo)} ${strictLo ? '<' : '≤'} x ${strictHi ? '<' : '≤'} ${mn(hi)}`
    const table = dom.map((x) => `x = ${mn(x)}: I = ${mn(formVal(f1, x))}, II = ${mn(formVal(f2, x))}`).join('\n')
    const why = stepsText([`x can take the values ${dom.map(mn).join(', ')}`, `Value of each quantity for every x:\n${table}`, `Compare: ${DOM_WORDS[rel]}`], QUANTITY_OPTIONS[rel])
    return fixedQ('quantity-comparison', `In the following question, x is an integer such that ${cond}. Compare Quantity I and Quantity II and choose the correct option.\nQuantity I: ${formText(f1)}\nQuantity II: ${formText(f2)}`, QUANTITY_OPTIONS, rel, why)
  }
  throw new Reject('no domain pair')
}

export function genQuadratic(rng: Rng, d: MockDifficulty, count: number): Group[] {
  return many(rng, count, (r) => quadratic(r, d))
}
export function genQuantityComparison(rng: Rng, d: MockDifficulty, count: number): Group[] {
  const gens: ((r: Rng) => QuestionDraft)[] = [qcArith, (r) => qcRoots(r, d), (r) => qcDomain(r, d)]
  const weights: [number, number][] = [[0, 45], [1, 30], [2, 25]]
  return many(rng, count, (r) => {
    const k = wpick(r, weights)
    return gens[k](r)
  })
}

function many(rng: Rng, count: number, one: (r: Rng) => QuestionDraft): Group[] {
  const out: Group[] = []
  const seen = new Set<string>()
  let guard = 0
  while (out.length < count) {
    if (guard++ > count * 400) throw new Error('quadratic/quantity generator stalled')
    try {
      const q = one(rng)
      if (seen.has(q.stem)) continue
      seen.add(q.stem)
      out.push({ questions: [q] })
    } catch (e) {
      if (!(e instanceof Reject)) throw e
    }
  }
  return out
}

