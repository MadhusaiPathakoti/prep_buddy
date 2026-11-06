// SBI PO Mains-level Quadratic Equations (x vs y) and Quantity Comparison (the `difficulty` argument is ignored).
// Every equation is a "disguised" quadratic (brackets, fractions, cross-multiplication, variable denominators) that needs 2-4
// algebra steps before it becomes ax² + bx + c = 0; it is generated from chosen roots and then re-verified by an independent
// evaluator that parses the printed text and interpolates the cleared-denominator polynomial.
import type { Rng } from '../../rng'
import type { Group, MockDifficulty, QuantTopicId, QuestionDraft, TopicGenerator } from '../../types'
import { QUADRATIC_OPTIONS, QUANTITY_OPTIONS } from '../../options'
import { F, Reject, decStr, ensure, fadd, fcmp, fdiv, feq, fmul, fracStr, fsub, fval, fixedQ, gcd, terminating, wpick, lcm } from '../util'
import type { Frac } from '../util'
import { relationIndex } from '../algebra'

// Rejections are frequent, so they reuse one pre-built Reject (no stack capture).
const REJ = new Reject('rejected')
function need(cond: unknown, _why = 'rejected'): asserts cond {
  if (!cond) throw REJ
}

const fnum = (f: Frac): string => (f.d === 1 ? String(f.n) : terminating(f, 2) ? decStr(f, 2) : fracStr(f)).replace(/^-/, '−')
const REL_TEXT = ['x > y', 'x ≥ y', 'x < y', 'x ≤ y', 'x = y or no relation can be established']

// ------------------------------------------------------------------ polynomials (index = power, up to x²)
type Poly = Frac[]
const pz = (): Poly => [F(0), F(0), F(0)]
const padd = (a: Poly, b: Poly): Poly => a.map((c, i) => fadd(c, b[i]))
const psub = (a: Poly, b: Poly): Poly => a.map((c, i) => fsub(c, b[i]))
function pmul(a: Poly, b: Poly): Poly {
  const out = pz()
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      const c = fmul(a[i], b[j])
      if (i + j > 2) need(c.n === 0, 'degree above two')
      else out[i + j] = fadd(out[i + j], c)
    }
  return out
}
const pdiv = (a: Poly, m: number): Poly => a.map((c) => fdiv(c, F(m)))
const lin = (a: number, b: number): Poly => [F(b), F(a), F(0)]
const pscale = (a: Poly, k: number): Poly => a.map((c) => fmul(c, F(k)))

function linText(a: number, b: number, v: string): string {
  const lead = a === 1 ? v : a === -1 ? `−${v}` : `${a < 0 ? '−' : ''}${Math.abs(a)}${v}`
  if (b === 0) return lead
  return `${lead} ${b < 0 ? '−' : '+'} ${Math.abs(b)}`
}
function polyText(p: Poly, v: string): string {
  const parts: string[] = []
  const names = [`${v}²`, v, '']
  for (let i = 2; i >= 0; i--) {
    const c = p[i]
    if (c.n === 0) continue
    const neg = c.n < 0
    const a = F(Math.abs(c.n), c.d)
    const body = i === 0 ? fnum(a) : `${a.n === 1 && a.d === 1 ? '' : a.d === 1 ? a.n : `(${a.n}/${a.d})`}${names[2 - i]}`
    parts.push(parts.length === 0 ? `${neg ? '−' : ''}${body}` : ` ${neg ? '−' : '+'} ${body}`)
  }
  return parts.length ? parts.join('') : '0'
}

/** primitive integer quadratic with the given roots: (q1 v − p1)(q2 v − p2) scaled to coprime integer coefficients. */
function stdQuadratic(r1: Frac, r2: Frac): { a: number; b: number; c: number } {
  const a = r1.d * r2.d
  const b = -(r1.n * r2.d + r2.n * r1.d)
  const c = r1.n * r2.n
  const g = gcd(gcd(a, b), c) || 1
  return { a: a / g, b: b / g, c: c / g }
}
function factorLine(r1: Frac, r2: Frac, v: string): string {
  const fac = (r: Frac): string => {
    const lead = r.d === 1 ? v : `${r.d}${v}`
    return r.n >= 0 ? `(${lead} − ${r.n})` : `(${lead} + ${-r.n})`
  }
  const roots = feq(r1, r2) ? fnum(r1) : `${fnum(r1)} or ${fnum(r2)}`
  return `${fac(r1)}${fac(r2)} = 0 ⇒ ${v} = ${roots}`
}

// ------------------------------------------------------------------ equation text evaluator (independent method)
function evalSide(src: string, v: string, x: Frac): Frac {
  const toks = src.match(new RegExp(`\\d+(?:\\.\\d+)?|${v}|[+−()/²×]`, 'g')) ?? []
  need(toks.join('') === src.replace(/\s+/g, ''), 'unparsable equation text')
  let i = 0
  const num = (s: string): Frac => {
    const [ip, fr = ''] = s.split('.')
    return F(Number(ip + fr), 10 ** fr.length)
  }
  const isStart = (t: string | undefined): boolean => t !== undefined && (t === '(' || t === v || /^\d/.test(t))
  function expr(): Frac {
    let neg = false
    if (toks[i] === '−') {
      neg = true
      i++
    }
    let a = term()
    if (neg) a = F(-a.n, a.d)
    while (toks[i] === '+' || toks[i] === '−') {
      const op = toks[i++]
      const b = term()
      a = op === '+' ? fadd(a, b) : fsub(a, b)
    }
    return a
  }
  function term(): Frac {
    let a = factor()
    for (;;) {
      if (toks[i] === '/') {
        i++
        a = fdiv(a, factor())
      } else if (toks[i] === '×') {
        i++
        a = fmul(a, factor())
      } else if (isStart(toks[i])) a = fmul(a, factor())
      else return a
    }
  }
  function factor(): Frac {
    const t = toks[i++]
    let a: Frac
    if (t === '(') {
      a = expr()
      need(toks[i++] === ')', 'bracket mismatch')
    } else if (t === v) a = x
    else {
      need(t !== undefined && /^\d/.test(t), 'number expected')
      a = num(t)
    }
    if (toks[i] === '²') {
      i++
      a = fmul(a, a)
    }
    return a
  }
  const r = expr()
  need(i === toks.length, 'trailing tokens')
  return r
}

export interface Eq {
  text: string
  roots: Frac[]
  lines: string[]
}

/** Parses `L = R`, checks that (L − R)·den(x) is a degree-2 polynomial whose roots are exactly `roots` (and that no root is a pole). */
function verifyEq(text: string, v: string, roots: Frac[], den: (x: Frac) => Frac): void {
  const [L, R] = text.split(' = ')
  ensure(L !== undefined && R !== undefined && text.split(' = ').length === 2, 'equation must have two sides')
  const N = (x: Frac): Frac => fmul(fsub(evalSide(L, v, x), evalSide(R, v, x)), den(x))
  const pts: { x: Frac; y: Frac }[] = []
  for (const xi of [-4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 9]) {
    try {
      pts.push({ x: F(xi), y: N(F(xi)) })
    } catch (e) {
      if (!(e instanceof Reject)) throw e
    }
  }
  ensure(pts.length >= 6, 'quadratic: too few sample points')
  const [a, b, c] = pts
  const interp = (x: Frac): Frac => {
    let tot = F(0)
    for (const [p, q, r] of [[a, b, c], [b, a, c], [c, a, b]]) {
      const w = fmul(fdiv(fsub(x, q.x), fsub(p.x, q.x)), fdiv(fsub(x, r.x), fsub(p.x, r.x)))
      tot = fadd(tot, fmul(p.y, w))
    }
    return tot
  }
  for (const pt of pts) ensure(feq(interp(pt.x), pt.y), `quadratic: ${text} is not a quadratic equation`)
  const lead = fsub(fadd(interp(F(2)), interp(F(0))), fmul(F(2), interp(F(1)))) // 2·(x² coefficient)
  ensure(lead.n !== 0, `quadratic: ${text} is not of degree two`)
  for (const r of roots) {
    ensure(feq(interp(r), F(0)), `quadratic: ${fnum(r)} is not a root of ${text}`)
    ensure(den(r).n !== 0, 'quadratic: a root is a pole of the equation')
  }
  ensure(!feq(roots[0], roots[roots.length - 1]) || roots.length === 1, 'quadratic: repeated roots listed twice')
}

// ------------------------------------------------------------------ disguised quadratics
const nz = (rng: Rng, lo: number, hi: number): number => {
  let v = 0
  for (let i = 0; i < 20 && v === 0; i++) v = rng.int(lo, hi)
  need(v !== 0, 'zero')
  return v
}
interface Piece {
  text: string
  poly: Poly
}
function piece(rng: Rng, v: string): Piece {
  const kind = wpick<string>(rng, [['prod', 40], ['sq', 14], ['scaled', 22], ['xprod', 18], ['lin', 6]])
  const a1 = rng.int(1, 4)
  const b1 = nz(rng, -9, 9)
  const a2 = rng.int(1, 5)
  const b2 = nz(rng, -9, 9)
  let p: Piece
  switch (kind) {
    case 'prod':
      p = { text: `(${linText(a1, b1, v)})(${linText(a2, b2, v)})`, poly: pmul(lin(a1, b1), lin(a2, b2)) }
      break
    case 'sq':
      p = { text: `(${linText(a1, b1, v)})²`, poly: pmul(lin(a1, b1), lin(a1, b1)) }
      break
    case 'scaled': {
      const k = rng.int(2, 7)
      p = { text: `${k}(${linText(a2, b2, v)}${rng.chance(0.4) ? '' : ''})`, poly: pscale(lin(a2, b2), k) }
      break
    }
    case 'xprod':
      p = { text: `${v}(${linText(a2, b2, v)})`, poly: pmul([F(0), F(1), F(0)], lin(a2, b2)) }
      break
    default:
      p = { text: `(${linText(a1, b1, v)})`, poly: lin(a1, b1) }
  }
  // sometimes the piece sits over a small denominator
  if (kind !== 'scaled' && kind !== 'lin' && rng.chance(0.3)) {
    const m = rng.pick([2, 3, 4, 5])
    return { text: `${p.text}/${m}`, poly: pdiv(p.poly, m) }
  }
  if (kind === 'lin') {
    const m = rng.pick([2, 3, 4, 5, 6])
    return { text: `${p.text}/${m}`, poly: pdiv(p.poly, m) }
  }
  return p
}

interface Built extends Eq {
  den: (x: Frac) => Frac
}

/** pieces on both sides plus a linear tail chosen so that the difference has exactly the wanted roots. */
function soupEq(rng: Rng, v: string, roots: Frac[]): Built {
  const nL = rng.int(1, 2)
  const nR = rng.int(1, 2)
  const side = (n: number): { text: string; poly: Poly } => {
    let text = ''
    let poly = pz()
    for (let k = 0; k < n; k++) {
      const pc = piece(rng, v)
      const neg = k > 0 && rng.chance(0.45)
      text += k === 0 ? pc.text : ` ${neg ? '−' : '+'} ${pc.text}`
      poly = neg ? psub(poly, pc.poly) : padd(poly, pc.poly)
    }
    return { text, poly }
  }
  const L = side(nL)
  const R = side(nR)
  const S = psub(L.poly, R.poly)
  const c2 = S[2]
  need(c2.n !== 0, 'no quadratic term')
  const [r1, r2] = roots
  const P: Poly = [fmul(c2, fmul(r1, r2)), fmul(c2, F(-(r1.n * r2.d + r2.n * r1.d), r1.d * r2.d)), c2]
  const u = fsub(S[1], P[1])
  const w = fsub(S[0], P[0])
  need(u.d === 1 && w.d === 1 && Math.abs(u.n) <= 60 && Math.abs(w.n) <= 150, 'tail not integral')
  need(Math.abs(c2.n) <= 90 && c2.d <= 6, 'leading coefficient too wild')
  let tail = ''
  if (u.n !== 0) tail += ` ${u.n < 0 ? '−' : '+'} ${Math.abs(u.n) === 1 ? '' : Math.abs(u.n)}${v}`
  if (w.n !== 0) tail += ` ${w.n < 0 ? '−' : '+'} ${Math.abs(w.n)}`
  need(tail !== '', 'no tail')
  const rhsPoly = padd(R.poly, [w, u, F(0)])
  const text = `${L.text} = ${R.text}${tail}`
  const std = stdQuadratic(r1, r2)
  const lines = [
    `Expand both sides: LHS = ${polyText(L.poly, v)}, RHS = ${polyText(rhsPoly, v)}`,
    `Bring everything to one side (LHS − RHS = 0)${c2.d !== 1 || S[1].d !== 1 || S[0].d !== 1 ? ' and clear the fractions' : ''}: ${std.a === 1 ? '' : std.a}${v}² ${std.b < 0 ? '−' : '+'} ${Math.abs(std.b)}${v} ${std.c < 0 ? '−' : '+'} ${Math.abs(std.c)} = 0`.replace(/\+ 0v/, '').replace(/ [+−] 0 = 0/, ' = 0'),
    factorLine(r1, r2, v),
  ]
  return { text, roots, lines, den: () => F(1) }
}

/** p/(x + a) + q/(x + b) = r */
function twoFracEq(rng: Rng, v: string, roots: Frac[]): Built {
  const [r1, r2] = roots
  const a = nz(rng, -8, 8)
  const b = nz(rng, -8, 8)
  need(a !== b, 'same pole')
  const m = lcm(r1.d, r2.d)
  const r = m * rng.int(1, 3)
  const sum = fadd(r1, r2)
  const prod = fmul(r1, r2)
  const S = fadd(F(r * (a + b)), fmul(F(r), sum)) // p + q
  const T = fsub(F(r * a * b), fmul(F(r), prod)) // p b + q a
  need(S.d === 1 && T.d === 1, 'not integral')
  const p = fdiv(fsub(T, fmul(S, F(a))), F(b - a))
  need(p.d === 1, 'p not integral')
  const q = fsub(S, p)
  need(p.n !== 0 && q.n !== 0 && Math.abs(p.n) <= 40 && Math.abs(q.n) <= 40, 'unsuitable numerators')
  for (const rt of roots) need(!feq(rt, F(-a)) && !feq(rt, F(-b)), 'root is a pole')
  const frac = (num: number, k: number): string => `${num < 0 ? '−' : ''}${Math.abs(num)}/(${linText(1, k, v)})`
  const t2 = q.n < 0 ? `− ${Math.abs(q.n)}/(${linText(1, b, v)})` : `+ ${q.n}/(${linText(1, b, v)})`
  const text = `${frac(p.n, a)} ${t2} = ${r}`
  const std = stdQuadratic(r1, r2)
  const lines = [
    `Multiply throughout by (${linText(1, a, v)})(${linText(1, b, v)}): ${fnum(F(p.n))}(${linText(1, b, v)}) ${q.n < 0 ? '−' : '+'} ${Math.abs(q.n)}(${linText(1, a, v)}) = ${r === 1 ? '' : r}(${linText(1, a, v)})(${linText(1, b, v)})`,
    `Simplify and collect terms: ${std.a === 1 ? '' : std.a}${v}² ${std.b < 0 ? '−' : '+'} ${Math.abs(std.b)}${v} ${std.c < 0 ? '−' : '+'} ${Math.abs(std.c)} = 0`,
    factorLine(r1, r2, v),
  ]
  return { text, roots, lines, den: (x) => fmul(fadd(x, F(a)), fadd(x, F(b))) }
}

/** (a x + b)/(c x + d) = (e x + f)/g */
function crossEq(rng: Rng, v: string, roots: Frac[]): Built {
  const [r1, r2] = roots
  const c = rng.int(1, 3)
  const e = rng.int(1, 4)
  const d = nz(rng, -7, 7)
  const f = nz(rng, -9, 9)
  const g = rng.int(2, 7)
  const sum = fadd(r1, r2)
  const prod = fmul(r1, r2)
  const ec = e * c
  const aF = fdiv(fadd(F(e * d + f * c), fmul(F(ec), sum)), F(g))
  const bF = fdiv(fsub(F(f * d), fmul(F(ec), prod)), F(g))
  need(aF.d === 1 && bF.d === 1 && aF.n > 0 && Math.abs(bF.n) <= 40 && aF.n <= 20 && bF.n !== 0, 'cross-multiplication not integral')
  for (const rt of roots) need(fadd(fmul(F(c), rt), F(d)).n !== 0, 'root is a pole')
  const text = `(${linText(aF.n, bF.n, v)})/(${linText(c, d, v)}) = (${linText(e, f, v)})/${g}`
  const std = stdQuadratic(r1, r2)
  const lines = [
    `Cross-multiply: ${g}(${linText(aF.n, bF.n, v)}) = (${linText(e, f, v)})(${linText(c, d, v)})`,
    `Expand and collect terms: ${std.a === 1 ? '' : std.a}${v}² ${std.b < 0 ? '−' : '+'} ${Math.abs(std.b)}${v} ${std.c < 0 ? '−' : '+'} ${Math.abs(std.c)} = 0`,
    factorLine(r1, r2, v),
  ]
  return { text, roots, lines, den: (x) => fadd(fmul(F(c), x), F(d)) }
}

function buildEq(rng: Rng, v: string, roots: Frac[]): Eq {
  for (let i = 0; i < 80; i++) {
    try {
      const kind = wpick<number>(rng, [[0, 56], [1, 22], [2, 22]])
      const e = kind === 0 ? soupEq(rng, v, roots) : kind === 1 ? twoFracEq(rng, v, roots) : crossEq(rng, v, roots)
      need(e.text.length <= 78, 'too long')
      verifyEq(e.text, v, roots, e.den)
      return { text: e.text, roots, lines: e.lines }
    } catch (err) {
      if (!(err instanceof Reject)) throw err
    }
  }
  throw REJ
}

// ------------------------------------------------------------------ choosing roots with a non-trivial relationship
function pickRoot(rng: Rng): Frac {
  const den = wpick<number>(rng, [[1, 52], [2, 16], [3, 10], [4, 8], [5, 7], [6, 7]])
  for (let i = 0; i < 30; i++) {
    const n = rng.int(-12 * den, 14 * den)
    if (n === 0) continue
    const r = F(n, den)
    if (den > 1 && r.d === 1) continue
    return r
  }
  throw REJ
}
function near(rng: Rng, base: Frac): Frac {
  const den = base.d > 1 ? base.d : rng.pick([1, 1, 2, 2, 3, 4])
  for (let i = 0; i < 30; i++) {
    const r = fadd(base, F(rng.int(-3 * den, 3 * den), den))
    if (r.n !== 0 && fval(r) >= -13 && fval(r) <= 15) return r
  }
  throw REJ
}
/** brute-force relation (second method): compares floats of every root pair. */
function relationBrute(X: Frac[], Y: Frac[]): number {
  let g = 0
  let l = 0
  let q = 0
  for (const a of X)
    for (const b of Y) {
      const d = fval(a) - fval(b)
      if (Math.abs(d) < 1e-12) q++
      else if (d > 0) g++
      else l++
    }
  if (l === 0 && q === 0) return 0
  if (l === 0 && g === 0) return 4
  if (l === 0) return 1
  if (g === 0 && q === 0) return 2
  if (g === 0) return 3
  return 4
}
function rootSets(rng: Rng, target: number, otherIsValue = false): { X: Frac[]; Y: Frac[] } {
  for (let i = 0; i < 500; i++) {
    const x1 = pickRoot(rng)
    const x2 = pickRoot(rng)
    if (feq(x1, x2)) continue
    const y1 = near(rng, rng.pick([x1, x2]))
    const y2 = otherIsValue ? y1 : rng.chance(0.5) ? near(rng, rng.pick([x1, x2])) : pickRoot(rng)
    if (!otherIsValue && feq(y1, y2)) continue
    const X = [x1, x2]
    const Y = otherIsValue ? [y1] : [y1, y2]
    const rel = relationIndex(X, Y)
    if (rel !== target) continue
    let gap = Infinity
    for (const a of X) for (const b of Y) gap = Math.min(gap, Math.abs(fval(a) - fval(b)))
    if (target === 1 || target === 3 ? gap !== 0 : target === 4 ? false : gap === 0 || gap > 3) continue
    if (!X.concat(Y).some((r) => r.d !== 1 || r.n < 0)) continue
    return { X, Y }
  }
  throw REJ
}

// ------------------------------------------------------------------ quadratic equations question
function quadratic(rng: Rng): QuestionDraft {
  const target = wpick<number>(rng, [[0, 19], [1, 19], [2, 19], [3, 19], [4, 24]])
  const { X, Y } = rootSets(rng, target)
  const e1 = buildEq(rng, 'x', X)
  const e2 = buildEq(rng, 'y', Y)
  const rel = relationIndex(X, Y)
  ensure(rel === relationBrute(X, Y) && rel === target, 'quadratic: relation methods disagree')
  const rs = (rts: Frac[]): string => rts.map(fnum).join(', ')
  const why = `I. ${e1.text}\n${e1.lines.join('\n')}\nII. ${e2.text}\n${e2.lines.join('\n')}\nx = ${rs(X)}; y = ${rs(Y)}\nComparing every root of x with every root of y ⇒ ${REL_TEXT[rel]}`
  return fixedQ('quadratic-equations', `In each of the following questions, two equations I and II are given. Solve both the equations and give answer:\nI. ${e1.text}\nII. ${e2.text}`, QUADRATIC_OPTIONS, rel, why)
}

// ------------------------------------------------------------------ derived quantities (word problems with exact values)
interface Dq {
  t: string
  v: Frac
  why: string
}
const pick = <T>(rng: Rng, xs: readonly T[]): T => rng.pick(xs)

function dqCI(rng: Rng): Dq {
  const r = pick(rng, [5, 10, 15, 20])
  const unit = 10000 / gcd(10000, 200 * r + r * r)
  const P = unit * rng.int(Math.ceil(2000 / unit), Math.max(Math.ceil(2000 / unit), Math.floor(20000 / unit)))
  const v = F(P * (200 * r + r * r), 10000)
  need(v.d === 1, 'CI not integral')
  // second method: year-by-year compounding
  let amt = F(P)
  for (let y = 0; y < 2; y++) amt = fadd(amt, fdiv(fmul(amt, F(r)), F(100)))
  ensure(feq(fsub(amt, F(P)), v), 'CI mismatch')
  return { t: `Compound interest (in ₹) on ₹${P} at ${r}% p.a. for 2 years, compounded annually`, v, why: `Amount after 2 years = ${P} × (1 + ${r}/100)² = ₹${fnum(amt)}\nCI = ${fnum(amt)} − ${P} = ₹${fnum(v)}` }
}
function dqCIdiff(rng: Rng): Dq {
  const r = pick(rng, [4, 5, 8, 10, 12, 15, 20])
  const unit = 10000 / gcd(10000, r * r)
  const P = unit * rng.int(Math.ceil(2000 / unit), Math.max(Math.ceil(2000 / unit), Math.floor(24000 / unit)))
  const d = F(P * r * r, 10000)
  need(d.d === 1 && d.n >= 20, 'difference not integral')
  // second method: compute CI and SI separately
  let amt = F(P)
  for (let y = 0; y < 2; y++) amt = fadd(amt, fdiv(fmul(amt, F(r)), F(100)))
  const ci = fsub(amt, F(P))
  const si = F(P * r * 2, 100)
  ensure(feq(fsub(ci, si), d), 'CI-SI mismatch')
  return {
    t: `The sum (in ₹) on which the difference between compound interest and simple interest for 2 years at ${r}% p.a. is ₹${d.n}`,
    v: F(P),
    why: `For 2 years, CI − SI = P × (r/100)² ⇒ ${d.n} = P × (${r}/100)²\nP = ${d.n} × 10000/${r * r} = ₹${P}`,
  }
}
function dqBoat(rng: Rng): Dq {
  const t1 = rng.int(2, 6)
  const t2 = t1 + rng.int(1, 4)
  const L = lcm(t1, t2)
  const dist = L * rng.int(1, 4) * rng.pick([1, 2, 5])
  const down = F(dist, t1)
  const up = F(dist, t2)
  const stream = fdiv(fsub(down, up), F(2))
  const still = fdiv(fadd(down, up), F(2))
  need(terminating(stream, 1) && terminating(still, 1) && stream.n > 0, 'speeds unclean')
  const askStream = rng.chance(0.5)
  const v = askStream ? stream : still
  // second method: solve the two linear equations by trial of the still-water speed
  let found = false
  for (let b2 = 1; b2 <= 400; b2++) {
    const b = F(b2, 2)
    const s = fsub(down, b)
    if (feq(fadd(b, s), down) && feq(fsub(b, s), up) && feq(askStream ? s : b, v)) found = true
  }
  ensure(found, 'boat mismatch')
  return {
    t: `The ${askStream ? 'speed of the stream' : 'speed of the boat in still water'} (in km/h), if a boat covers ${dist} km downstream in ${t1} hours and returns the same distance upstream in ${t2} hours`,
    v,
    why: `Downstream speed = ${dist}/${t1} = ${fnum(down)} km/h; upstream speed = ${dist}/${t2} = ${fnum(up)} km/h\n${askStream ? `Stream = (down − up)/2 = (${fnum(down)} − ${fnum(up)})/2 = ${fnum(v)}` : `Still water = (down + up)/2 = (${fnum(down)} + ${fnum(up)})/2 = ${fnum(v)}`} km/h`,
  }
}
function dqTrain(rng: Rng): Dq {
  const s1 = rng.int(4, 14) * 5
  const s2 = rng.int(4, 14) * 5
  need(s1 !== s2, 'same speed')
  const L1 = rng.int(8, 30) * 10
  const L2 = rng.int(8, 30) * 10
  const T = F(18 * (L1 + L2), 5 * (s1 + s2))
  need(T.d === 1 && T.n >= 6 && T.n <= 40, 'time not integral')
  // second method: distances in metres per second
  const rel = F((L1 + L2), T.n)
  ensure(feq(fmul(rel, F(18, 5)), F(s1 + s2)), 'train mismatch')
  return {
    t: `The speed (in km/h) of the second train, if two trains ${L1} m and ${L2} m long run in opposite directions, the first at ${s1} km/h, and cross each other in ${T.n} seconds`,
    v: F(s2),
    why: `Relative speed = (${L1} + ${L2})/${T.n} m/s = ${fnum(rel)} m/s = ${fnum(rel)} × 18/5 = ${s1 + s2} km/h\nSecond train = ${s1 + s2} − ${s1} = ${s2} km/h`,
  }
}
function dqSucc(rng: Rng): Dq {
  const a = pick(rng, [10, 20, 25, 40, 50])
  const b = pick(rng, [10, 20, 25, 30, 40])
  const orig = rng.int(5, 90) * 20
  const N = F(orig * (100 + a) * (100 - b), 10000)
  need(N.d === 1, 'result not integral')
  const inc = rng.chance(0.5)
  // second method: forward recomputation from the claimed original
  ensure(feq(fmul(fmul(F(orig), F(100 + a, 100)), F(100 - b, 100)), N), 'successive change mismatch')
  return {
    t: `The original number (in the same unit), if it is first increased by ${a}% and then decreased by ${b}% and the result is ${N.n}`,
    v: F(orig),
    why: `Net factor = (1 + ${a}/100)(1 − ${b}/100) = ${100 + a}/100 × ${100 - b}/100\nOriginal = ${N.n} ÷ [${100 + a}/100 × ${100 - b}/100] = ${orig}${inc ? '' : ''}`,
  }
}
function dqAge(rng: Rng): Dq {
  const m = rng.int(2, 7)
  const n = rng.int(2, 9)
  need(m < n, 'ordering')
  const k = rng.int(3, 12)
  const t = rng.int(3, 12)
  const p = m * k + t
  const q = n * k + t
  const g = gcd(p, q)
  const pr = p / g
  const qr = q / g
  const mm = m / gcd(m, n)
  const nn = n / gcd(m, n)
  need(gcd(m, n) === 1 && !(pr === mm && qr === nn), 'ratio unchanged')
  // second method: search all ages
  let found = -1
  for (let kk = 1; kk <= 200; kk++) if ((mm * kk + t) * qr === (nn * kk + t) * pr && found < 0) found = kk
  ensure(found === k, 'age mismatch')
  return {
    t: `The present age (in years) of the younger person, if the ages of two persons are in the ratio ${m} : ${n} and after ${t} years the ratio becomes ${pr} : ${qr}`,
    v: F(m * k),
    why: `Let the ages be ${m}k and ${n}k. (${m}k + ${t})/(${n}k + ${t}) = ${pr}/${qr}\n${qr}(${m}k + ${t}) = ${pr}(${n}k + ${t}) ⇒ k = ${k}\nYounger = ${m} × ${k} = ${m * k} years`,
  }
}
function dqWork(rng: Rng): Dq {
  const x = rng.int(4, 40)
  const y = rng.int(4, 40)
  need(x < y, 'order')
  const v = F(x * y, x + y)
  need(terminating(v, 1) && fval(v) >= 3, 'days unclean')
  // second method: work per day
  ensure(feq(fdiv(F(1), fadd(F(1, x), F(1, y))), v), 'work mismatch')
  return { t: `The number of days in which A and B together can finish a work, if A alone can finish it in ${x} days and B alone in ${y} days`, v, why: `Together in one day = 1/${x} + 1/${y} = ${x + y}/${x * y}\nDays = ${x * y}/${x + y} = ${fnum(v)}` }
}
function dqMixture(rng: Rng): Dq {
  const m = rng.int(2, 7)
  const n = rng.int(2, 7)
  need(gcd(m, n) === 1 && m !== n, 'ratio')
  const k = rng.int(2, 12) * 2
  const W = rng.int(3, 18)
  // new ratio milk : water = mk : (nk + W)
  const mk = m * k
  const nw = n * k + W
  const g = gcd(mk, nw)
  const pr = mk / g
  const qr = nw / g
  need(pr <= 16 && qr <= 16 && !(pr === m && qr === n), 'new ratio unsuitable')
  let found = -1
  for (let kk = 1; kk <= 300; kk++) if (m * kk * qr === (n * kk + W) * pr && found < 0) found = kk
  ensure(found === k, 'mixture mismatch')
  return {
    t: `The initial quantity (in litres) of milk, if a mixture of milk and water is in the ratio ${m} : ${n} and adding ${W} litres of water changes the ratio of milk to water to ${pr} : ${qr}`,
    v: F(mk),
    why: `Let milk = ${m}k and water = ${n}k. ${m}k/(${n}k + ${W}) = ${pr}/${qr}\n${qr} × ${m}k = ${pr}(${n}k + ${W}) ⇒ k = ${k}\nMilk = ${m} × ${k} = ${mk} litres`,
  }
}
function dqProfit(rng: Rng): Dq {
  const mk = pick(rng, [20, 25, 30, 40, 50])
  const ds = pick(rng, [10, 15, 20, 25])
  const cp = rng.int(5, 60) * 100
  const profit = F(cp * ((100 + mk) * (100 - ds) - 10000), 10000)
  need(profit.d === 1 && profit.n > 0, 'profit unsuitable')
  const sp = F(cp * (100 + mk) * (100 - ds), 10000)
  ensure(feq(fsub(sp, F(cp)), profit), 'profit mismatch')
  return {
    t: `The cost price (in ₹) of an article, if it is marked ${mk}% above the cost price, sold at a discount of ${ds}% and the profit is ₹${profit.n}`,
    v: F(cp),
    why: `Let CP = ₹x. MP = ${100 + mk}% of x; SP = ${100 - ds}% of MP = x × ${100 + mk}/100 × ${100 - ds}/100\nProfit = SP − CP = x × (${(100 + mk) * (100 - ds)}/10000 − 1) = ${profit.n} ⇒ x = ₹${cp}`,
  }
}
function dqChain(rng: Rng): Dq {
  const p1 = pick(rng, [10, 20, 25, 40, 50, 60, 75, 80])
  const p2 = pick(rng, [10, 20, 25, 30, 40, 50, 60, 75])
  const N = rng.int(4, 60) * 20
  const v = F(p1 * p2 * N, 10000)
  need(terminating(v, 1) && fval(v) >= 5, 'unclean')
  ensure(feq(fmul(fdiv(F(p1), F(100)), fmul(fdiv(F(p2), F(100)), F(N))), v), 'chain mismatch')
  return { t: `${p1}% of ${p2}% of ${N}`, v, why: `${p2}% of ${N} = ${fnum(F(p2 * N, 100))}\n${p1}% of ${fnum(F(p2 * N, 100))} = ${fnum(v)}` }
}
const DQ_GENS = [dqCI, dqCIdiff, dqBoat, dqTrain, dqSucc, dqAge, dqWork, dqMixture, dqProfit, dqChain]

/** A quantity (as text) whose value is exactly `v`, for comparing with a root or with another quantity. */
function quantityWithValue(rng: Rng, v: Frac): Dq {
  const order = rng.shuffle([0, 1, 2, 3, 4])
  for (const style of order) {
    if (style === 0) {
      for (const p of rng.shuffle([10, 12.5, 15, 20, 25, 30, 40, 50, 60, 75, 80, 120, 150])) {
        const N = fdiv(fmul(v, F(100)), F(Math.round(p * 2), 2))
        if (N.d === 1 && N.n >= 8 && N.n <= 600) return { t: `${p}% of ${N.n}`, v, why: `${p}% of ${N.n} = ${N.n} × ${p}/100 = ${fnum(v)}` }
      }
    } else if (style === 1) {
      const n = rng.pick([3, 4, 5])
      const sum = fmul(v, F(n))
      if (sum.d !== 1 || sum.n < n * 3) continue
      const nums: number[] = []
      let rest = sum.n
      for (let i = 0; i < n - 1; i++) {
        const x = Math.max(1, Math.round(fval(v)) + rng.int(-6, 6))
        nums.push(x)
        rest -= x
      }
      if (rest < 1) continue
      nums.push(rest)
      return { t: `The average of ${nums.slice(0, -1).join(', ')} and ${nums[n - 1]}`, v, why: `Sum = ${nums.join(' + ')} = ${sum.n}\nAverage = ${sum.n}/${n} = ${fnum(v)}` }
    } else if (style === 2) {
      const t = rng.int(2, 9)
      const d = fmul(v, F(t))
      if (d.d === 1 && d.n >= 4) return { t: `The speed (in km/h) of a car that covers ${d.n} km in ${t} hours`, v, why: `Speed = ${d.n}/${t} = ${fnum(v)} km/h` }
    } else if (style === 3) {
      for (let x = 2; x <= 40; x++) {
        const y = fdiv(fmul(v, F(x)), fsub(F(x), v))
        if (fval(v) < x && y.d === 1 && y.n >= 2 && y.n <= 60 && y.n !== x) return { t: `The number of days in which A and B together finish a work that A alone does in ${x} days and B alone in ${y.n} days`, v, why: `Together in one day = 1/${x} + 1/${y.n}\nDays = ${x * y.n}/${x + y.n} = ${fnum(v)}` }
      }
    } else {
      for (const p of rng.shuffle([10, 20, 25, 40, 50, 60, 75, 80])) {
        for (const q of rng.shuffle([10, 20, 25, 30, 40, 50, 60, 75])) {
          const N = fdiv(fmul(v, F(10000)), F(p * q))
          if (N.d === 1 && N.n >= 40 && N.n <= 2400) return { t: `${p}% of ${q}% of ${N.n}`, v, why: `${q}% of ${N.n} = ${fnum(F(q * N.n, 100))}\n${p}% of that = ${fnum(v)}` }
        }
      }
    }
  }
  throw REJ
}

// ------------------------------------------------------------------ quantity comparison
const HEADER = 'In the following question, two quantities I and II are given. Compare them and choose the correct option.'

function qcEqEq(rng: Rng, target: number): QuestionDraft {
  const { X, Y } = rootSets(rng, target)
  const e1 = buildEq(rng, 'x', X)
  const e2 = buildEq(rng, 'y', Y)
  const rel = relationIndex(X, Y)
  ensure(rel === relationBrute(X, Y) && rel === target, 'quantity: relation methods disagree')
  const why = `I. ${e1.text}\n${e1.lines.join('\n')}\nII. ${e2.text}\n${e2.lines.join('\n')}\nQuantity I (x) = ${X.map(fnum).join(' or ')}; Quantity II (y) = ${Y.map(fnum).join(' or ')}\nEvery value of I is compared with every value of II ⇒ ${QUANTITY_OPTIONS[rel]}`
  return fixedQ('quantity-comparison', `${HEADER}\nQuantity I: x, where ${e1.text}\nQuantity II: y, where ${e2.text}`, QUANTITY_OPTIONS, rel, why)
}

function qcEqValue(rng: Rng, target: number): QuestionDraft {
  const { X, Y } = rootSets(rng, target, true)
  const v = Y[0]
  need(v.d === 1 || terminating(v, 1), 'value not representable')
  const e1 = buildEq(rng, 'x', X)
  const q2 = quantityWithValue(rng, v)
  const rel = relationIndex(X, [v])
  ensure(rel === relationBrute(X, [v]) && rel === target, 'quantity: relation methods disagree (value)')
  const first = rng.chance(0.5)
  const eqTxt = `x, where ${e1.text}`
  const why = `Quantity ${first ? 'I' : 'II'}: ${e1.text}\n${e1.lines.join('\n')}\nx = ${X.map(fnum).join(' or ')}\nQuantity ${first ? 'II' : 'I'}: ${q2.why.replace(/\n/g, '\n')}\nValue = ${fnum(v)}\n${first ? QUANTITY_OPTIONS[rel] : QUANTITY_OPTIONS[[2, 3, 0, 1, 4][rel]]}`
  const options = QUANTITY_OPTIONS
  const idx = first ? rel : [2, 3, 0, 1, 4][rel]
  const stem = first ? `${HEADER}\nQuantity I: ${eqTxt}\nQuantity II: ${q2.t}` : `${HEADER}\nQuantity I: ${q2.t}\nQuantity II: ${eqTxt}`
  return fixedQ('quantity-comparison', stem, options, idx, why)
}

function qcDerived(rng: Rng, target: number): QuestionDraft {
  need(target === 0 || target === 2 || target === 4, 'derived pairs give >, <, =')
  const a = pick(rng, DQ_GENS)(rng)
  let b: Dq
  if (target === 4) {
    need(fval(a.v) <= 700 && (a.v.d === 1 || terminating(a.v, 1)), 'cannot restate the value')
    b = quantityWithValue(rng, a.v)
  } else {
    b = pick(rng, DQ_GENS)(rng)
    const ratio = fval(a.v) / fval(b.v)
    need(ratio >= 0.6 && ratio <= 1.7 && !feq(a.v, b.v), 'values not close enough')
  }
  need(a.t !== b.t && !(a.t.includes('%') && b.t.includes('%')), 'same or near-identical quantities')
  const c = fcmp(a.v, b.v)
  const rel = c > 0 ? 0 : c < 0 ? 2 : 4
  need(rel === target, 'derived relation differs from the wanted one')
  ensure(target !== 4 || feq(a.v, b.v), 'quantity: equal case must be exactly equal')
  const why = `Quantity I: ${a.why}\nValue of Quantity I = ${fnum(a.v)}\nQuantity II: ${b.why}\nValue of Quantity II = ${fnum(b.v)}\n${QUANTITY_OPTIONS[rel]}`
  return fixedQ('quantity-comparison', `${HEADER}\nQuantity I: ${a.t}\nQuantity II: ${b.t}`, QUANTITY_OPTIONS, rel, why)
}

function quantityQ(rng: Rng): QuestionDraft {
  const target = rng.int(0, 4)
  // the wanted relation is fixed first so that the five options are used evenly; only the template is re-drawn on a failed draw
  for (let i = 0; i < 40; i++) {
    const kind = target === 1 || target === 3 ? wpick<number>(rng, [[0, 45], [1, 55]]) : wpick<number>(rng, [[0, 22], [1, 30], [2, 48]])
    try {
      return kind === 0 ? qcEqEq(rng, target) : kind === 1 ? qcEqValue(rng, target) : qcDerived(rng, target)
    } catch (e) {
      if (!(e instanceof Reject)) throw e
    }
  }
  throw REJ
}

// ------------------------------------------------------------------ registry
function many(rng: Rng, count: number, one: (r: Rng) => QuestionDraft): Group[] {
  const out: Group[] = []
  const seen = new Set<string>()
  let guard = 0
  while (out.length < count) {
    if (guard++ > count * 600) throw new Error('mains quadratic/quantity generator stalled')
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

const genQuadraticMains: TopicGenerator = (rng: Rng, _d: MockDifficulty, count: number): Group[] => many(rng, count, quadratic)
const genQuantityMains: TopicGenerator = (rng: Rng, _d: MockDifficulty, count: number): Group[] => many(rng, count, quantityQ)

export const MAINS_ALGEBRA: Partial<Record<QuantTopicId, TopicGenerator>> = {
  'quadratic-equations': genQuadraticMains,
  'quantity-comparison': genQuantityMains,
}
