// SBI PO Mains-level Simplification and Approximation generators (always "very hard", the `difficulty` argument is ignored).
// Expressions are exact trees (rational arithmetic) that carry both a "shown" and a "rounded" rendering; the text is
// re-parsed by an independent evaluator (second method) before a question is emitted, and "find the ?" questions are
// additionally solved backwards along the path to the blank and re-substituted.
import type { Rng } from '../../rng'
import type { Group, MockDifficulty, QuestionDraft, TopicGenerator } from '../../types'
import type { QuantTopicId } from '../../types'
import { fmtNum } from '../../options'
import { F, Reject, decOf, decStr, ensure, fadd, fdiv, fdec, feq, fint, fmul, fracStr, fsub, fval, gcd, genSingles, numQ, rstep, roundTo, terminating, wpick } from '../util'
import type { Frac, Tpl } from '../util'

type Op = '+' | '−' | '×' | '÷'
type UKind = 'pct' | 'frac' | 'sq' | 'cu' | 'sqrt' | 'cbrt'
type Shape = 'int' | 'dec' | 'mix' | 'frac'

interface NumN {
  k: 'n'
  v: Frac
  /** value of the shown (possibly perturbed) numbers; equals fval(v) in exact mode. */
  x: number
  s: string
  sr: string
  shape: Shape
}
interface UniN {
  k: 'u'
  f: UKind
  c: Node
  v: Frac
  x: number
  /** shown / rounded text of the percentage or fraction parameter. */
  ps: string
  pr: string
  pv: Frac
  px: number
}
interface BinN {
  k: 'b'
  op: Op
  l: Node
  r: Node
  v: Frac
  x: number
  force: boolean
}
type Node = NumN | UniN | BinN
interface Cfg {
  approx: boolean
  /** weights of the node kinds when ops > 0. */
  w: { bin: number; pct: number; frac: number; pow: number; root: number }
}

const CAP = 20000

// Rejections are frequent in a rejection-sampling generator, so they reuse one pre-built Reject (no stack capture).
const REJ = new Reject('rejected')
function bad(_why: string): never {
  throw REJ
}
function need(cond: unknown, why = 'rejected'): asserts cond {
  if (!cond) bad(why)
}

// ------------------------------------------------------------------ small maths
function iroot(n: number, k: number): number | null {
  const r = Math.round(n ** (1 / k))
  for (const c of [r - 1, r, r + 1]) if (c >= 0 && c ** k === n) return c
  return null
}
function exactRoot(f: Frac, k: 2 | 3): Frac | null {
  const a = iroot(f.n, k)
  const b = iroot(f.d, k)
  return a === null || b === null ? null : F(a, b)
}
const nice = (f: Frac, dec = 3): boolean => terminating(f, dec)
const fstr = (f: Frac): string => (nice(f) ? decStr(f, 3) : fracStr(f))
const isPlain = (s: string): boolean => /^\d+$/.test(s) || s === '?'
const pickCoprime = (rng: Rng, b: number): number => {
  const cand: number[] = []
  for (let a = 1; a < b; a++) if (gcd(a, b) === 1) cand.push(a)
  return rng.pick(cand)
}

// ------------------------------------------------------------------ rendering
function bracket(s: string): string {
  need(!s.includes('{'), 'too deeply nested')
  return s.includes('[') ? `{${s}}` : s.includes('(') ? `[${s}]` : `(${s})`
}
const prec = (op: Op): number => (op === '+' || op === '−' ? 1 : 2)

/** `cl`: nodes shown as their plain value (used when explaining solutions). */
function rend(n: Node, w: 's' | 'sr', blank?: Node, cl?: Set<Node>): string {
  if (cl && n !== blank && cl.has(n)) return fstr(n.v)
  if (n.k === 'n') return n === blank ? '?' : n[w]
  if (n.k === 'u') {
    const cs = rend(n.c, w, blank, cl)
    const collapsed = cl?.has(n.c) === true
    const ofChild = (): string => {
      if (collapsed) return cs
      if (n.c.k === 'b') return bracket(cs)
      if (n.c.k === 'n') return n.c.shape === 'mix' || n.c.shape === 'frac' ? bracket(cs) : cs
      return n.c.f === 'sq' || n.c.f === 'cu' ? bracket(cs) : cs
    }
    const param = w === 's' ? n.ps : n.pr
    switch (n.f) {
      case 'pct':
        return `${param}% of ${ofChild()}`
      case 'frac':
        return `${param} of ${ofChild()}`
      case 'sq':
      case 'cu': {
        const bare = !collapsed && n.c.k === 'n' && isPlain(cs)
        return `${bare || (collapsed && isPlain(cs)) ? cs : bracket(cs)}${n.f === 'sq' ? '²' : '³'}`
      }
      case 'sqrt':
      case 'cbrt': {
        const bare = n.c.k === 'n' && (n.c.shape === 'int' || n.c.shape === 'dec') && n.c !== blank ? true : collapsed || n.c === blank
        return `${n.f === 'sqrt' ? '√' : '∛'}${bare ? cs : bracket(cs)}`
      }
    }
  }
  const side = (c: Node, which: 'l' | 'r'): string => {
    const s = rend(c, w, blank, cl)
    if (cl?.has(c) && c !== blank) return s
    if (c.k === 'n') return (c.shape === 'mix' || c.shape === 'frac') && (n.op === '×' || n.op === '÷') ? bracket(s) : s
    if (c.k === 'u') return (c.f === 'pct' || c.f === 'frac') && (n.op === '×' || n.op === '÷') ? bracket(s) : s
    const pc = prec(c.op)
    const pp = prec(n.op)
    const must = pc < pp || (pc === pp && which === 'r' && (n.op === '−' || n.op === '÷'))
    return must || c.force ? bracket(s) : s
  }
  return `${side(n.l, 'l')} ${n.op} ${side(n.r, 'r')}`
}

// ------------------------------------------------------------------ profile
interface Prof {
  ops: number
  mix: number
  dec: number
  pct: number
  frac: number
  pow: number
  root: number
  chain: number
  rootSum: number
  depth: number
}
function prof(n: Node, p: Prof = { ops: 0, mix: 0, dec: 0, pct: 0, frac: 0, pow: 0, root: 0, chain: 0, rootSum: 0, depth: 0 }, d = 0): Prof {
  p.depth = Math.max(p.depth, d)
  if (n.k === 'n') {
    if (n.shape === 'mix' || n.shape === 'frac') p.mix++
    if (n.shape === 'dec') p.dec++
    return p
  }
  p.ops++
  if (n.k === 'u') {
    if (n.f === 'pct') p.pct++
    else if (n.f === 'frac') p.frac++
    else if (n.f === 'sq' || n.f === 'cu') p.pow++
    else {
      p.root++
      if (n.c.k === 'b') p.rootSum++
    }
    if ((n.f === 'pct' || n.f === 'frac') && n.c.k === 'u' && (n.c.f === 'pct' || n.c.f === 'frac')) p.chain++
    return prof(n.c, p, d + 1)
  }
  prof(n.l, p, d + 1)
  prof(n.r, p, d + 1)
  return p
}

// ------------------------------------------------------------------ node constructors
function mkBin(op: Op, l: Node, r: Node, force = false): BinN {
  let v: Frac
  let x: number
  switch (op) {
    case '+':
      v = fadd(l.v, r.v)
      x = l.x + r.x
      break
    case '−':
      v = fsub(l.v, r.v)
      x = l.x - r.x
      break
    case '×':
      v = fmul(l.v, r.v)
      x = l.x * r.x
      break
    case '÷':
      need(r.v.n !== 0, 'div by zero')
      v = fdiv(l.v, r.v)
      x = l.x / r.x
      break
  }
  need(v.n > 0, 'non-positive intermediate')
  need(nice(v), 'unclean intermediate')
  need(fval(v) <= CAP && x > 0, 'too large')
  return { k: 'b', op, l, r, v, x, force }
}

interface Param {
  pv: Frac
  ps: string
  pr: string
  px: number
}
function mkUni(f: UKind, c: Node, pa?: Param): UniN {
  let v: Frac
  let x: number
  switch (f) {
    case 'pct':
    case 'frac':
      need(pa !== undefined, 'param')
      v = fmul(pa.pv, c.v)
      x = pa.px * c.x
      break
    case 'sq':
      v = fmul(c.v, c.v)
      x = c.x * c.x
      break
    case 'cu':
      v = fmul(fmul(c.v, c.v), c.v)
      x = c.x ** 3
      break
    case 'sqrt': {
      const r = exactRoot(c.v, 2)
      need(r !== null, 'not a perfect square')
      v = r
      x = Math.sqrt(c.x)
      break
    }
    case 'cbrt': {
      const r = exactRoot(c.v, 3)
      need(r !== null, 'not a perfect cube')
      v = r
      x = Math.cbrt(c.x)
      break
    }
  }
  need(v.n > 0 && nice(v) && fval(v) <= CAP, 'unclean unary value')
  return { k: 'u', f, c, v, x, ps: pa?.ps ?? '', pr: pa?.pr ?? '', pv: pa?.pv ?? F(1), px: pa?.px ?? 1 }
}

// ------------------------------------------------------------------ leaves
function mixText(v: Frac): string {
  const w = Math.floor(v.n / v.d)
  return `${w} ${v.n - w * v.d}/${v.d}`
}
/** A near-by number that still rounds to `b` (to `places` decimals) under ordinary rounding, so "x ≈ b" in the explanation is honest. */
function shownOf(rng: Rng, b: number, places = 0): number {
  const lim = Math.min(0.49 * 10 ** -places, 0.0045 * b)
  for (let i = 0; i < 30; i++) {
    const dec = Math.min(3, places + rng.int(1, 2))
    const e = (0.15 + rng.next() * 0.85) * lim * (rng.chance(0.5) ? 1 : -1)
    const p = roundTo(b + e, dec)
    if (p !== b && Math.abs(p - b) <= lim && p > 0) return p
  }
  bad('cannot perturb')
}
function numLeaf(rng: Rng, cfg: Cfg, v: Frac, shape: Shape): NumN {
  const base = shape === 'mix' ? mixText(v) : shape === 'frac' ? `${v.n}/${v.d}` : decStr(v, 4)
  if (cfg.approx && (shape === 'int' || shape === 'dec')) {
    const p = shownOf(rng, fval(v), decOf(v))
    return { k: 'n', v, x: p, s: fmtNum(p, 3), sr: base, shape }
  }
  return { k: 'n', v, x: fval(v), s: base, sr: base, shape }
}
const intLeaf = (rng: Rng, cfg: Cfg, n: number): NumN => numLeaf(rng, cfg, F(n), 'int')

function genLeaf(rng: Rng, cfg: Cfg): NumN {
  if (cfg.approx) {
    if (rng.chance(0.82)) return intLeaf(rng, cfg, rng.chance(0.55) ? rstep(rng, 10, 900, rng.pick([5, 10])) : rng.int(6, 99))
    return numLeaf(rng, cfg, fdec(rng.pick([2.5, 4.5, 7.5, 12.5, 1.5, 3.5, 6.4, 8.4, 15.5, 22.5, 0.8, 1.6]), 2), 'dec')
  }
  const kind = wpick<string>(rng, [['int', 46], ['dec', 22], ['mix', 24], ['frac', 8]])
  switch (kind) {
    case 'int':
      return intLeaf(rng, cfg, rng.chance(0.65) ? rng.int(3, 60) : rng.int(61, 960))
    case 'dec': {
      if (rng.chance(0.75)) {
        let k = rng.int(3, 99)
        if (k % 10 === 0) k++
        return numLeaf(rng, cfg, F(k, 10), 'dec')
      }
      return numLeaf(rng, cfg, F(5 * rng.int(1, 19), 100), 'dec')
    }
    case 'mix': {
      const d = rng.pick([2, 3, 4, 5, 6, 7, 8, 9, 10, 12])
      return numLeaf(rng, cfg, F(rng.int(1, 9) * d + pickCoprime(rng, d), d), 'mix')
    }
    default: {
      const d = rng.pick([3, 4, 5, 6, 7, 8, 9, 11, 12])
      return numLeaf(rng, cfg, F(pickCoprime(rng, d), d), 'frac')
    }
  }
}

const PCT_E = [2.5, 4, 5, 6, 7.5, 8, 10, 12, 12.5, 15, 16, 18, 20, 22.5, 24, 25, 30, 32, 35, 36, 37.5, 40, 45, 48, 50, 55, 60, 62.5, 64, 65, 70, 75, 80, 84, 85, 87.5, 90, 120, 125, 140, 150, 160]
const PCT_A = [5, 8, 10, 12, 15, 16, 20, 24, 25, 30, 35, 36, 40, 45, 48, 50, 60, 64, 75, 80, 120, 125, 150]
const FRACS: [number, number][] = (() => {
  const out: [number, number][] = []
  for (let b = 3; b <= 16; b++) for (let a = 1; a < b; a++) if (gcd(a, b) === 1) out.push([a, b])
  return out
})()

function pctOf(rng: Rng, cfg: Cfg, c: Node): UniN {
  need(c.k !== 'n' || c.shape === 'int' || c.shape === 'dec', 'percentage of a fraction leaf')
  const list = cfg.approx ? PCT_A : PCT_E
  const off = rng.int(0, list.length - 1)
  for (let i = 0; i < list.length; i++) {
    const p = list[(off + i) % list.length]
    const pv = fdec(p / 100, 4)
    const v = fmul(pv, c.v)
    if (!nice(v) || v.n <= 0 || (cfg.approx && v.d !== 1)) continue
    if (cfg.approx) {
      const sh = Number(fmtNum(shownOf(rng, p), 3))
      return mkUni('pct', c, { pv, ps: fmtNum(sh, 3), pr: fmtNum(p, 2), px: sh / 100 })
    }
    return mkUni('pct', c, { pv, ps: fmtNum(p, 2), pr: fmtNum(p, 2), px: p / 100 })
  }
  bad('no percentage fits')
}
function fracOf(rng: Rng, c: Node): UniN {
  need(c.k !== 'n' || c.shape === 'int' || c.shape === 'dec', 'fraction of a fraction leaf')
  const off = rng.int(0, FRACS.length - 1)
  for (let i = 0; i < FRACS.length; i++) {
    const [a, b] = FRACS[(off + i) % FRACS.length]
    const pv = F(a, b)
    const v = fmul(pv, c.v)
    if (!nice(v) || v.n <= 0) continue
    return mkUni('frac', c, { pv, ps: `${a}/${b}`, pr: `${a}/${b}`, px: a / b })
  }
  bad('no fraction fits')
}

const TRIPLES: [number, number, number][] = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29], [9, 40, 41], [12, 35, 37], [11, 60, 61]]

/** √ or ∛ of something that is an exact square/cube: a perfect number, a sum/difference, or a Pythagorean pair. */
function rootable(rng: Rng, cfg: Cfg, kind: 'sqrt' | 'cbrt', ops: number): UniN {
  const sq = kind === 'sqrt'
  const style = wpick<string>(rng, [['leaf', 52], ['sum', ops >= 2 ? 36 : 0], ['pyth', sq && !cfg.approx && ops >= 4 ? 12 : 0]])
  if (style === 'leaf') {
    if (rng.chance(cfg.approx ? 0.1 : 0.22)) {
      const k = rng.int(sq ? 3 : 3, sq ? 95 : 29)
      const dd = F(k, 10)
      const rad = sq ? fmul(dd, dd) : fmul(fmul(dd, dd), dd)
      return mkUni(kind, numLeaf(rng, cfg, rad, 'dec'))
    }
    const k = sq ? rng.int(7, 48) : rng.int(3, 24)
    return mkUni(kind, intLeaf(rng, cfg, sq ? k * k : k ** 3))
  }
  if (style === 'pyth') {
    const [a, b] = rng.pick(TRIPLES)
    const m = rng.pick([1, 1, 2, 3])
    return mkUni('sqrt', mkBin('+', mkUni('sq', intLeaf(rng, cfg, a * m)), mkUni('sq', intLeaf(rng, cfg, b * m))))
  }
  const r = sq ? rng.int(8, 40) : rng.int(4, 14)
  const R = sq ? r * r : r ** 3
  if (rng.chance(0.65)) {
    const A = rng.int(Math.floor(R * 0.2), Math.floor(R * 0.75))
    need(A >= 3 && R - A >= 3, 'bad split')
    return mkUni(kind, mkBin('+', intLeaf(rng, cfg, A), intLeaf(rng, cfg, R - A)))
  }
  const B = rng.int(Math.max(3, Math.floor(R * 0.15)), Math.floor(R * 0.8))
  return mkUni(kind, mkBin('−', intLeaf(rng, cfg, R + B), intLeaf(rng, cfg, B)))
}

// ------------------------------------------------------------------ tree generation
/** Local retries keep the overall acceptance rate high (rejections would otherwise compound over the tree). */
function retry<T>(fn: () => T, times: number): T {
  let last: Reject | null = null
  for (let i = 0; i < times; i++) {
    try {
      return fn()
    } catch (e) {
      if (!(e instanceof Reject)) throw e
      last = e
    }
  }
  throw last ?? new Reject('retry exhausted')
}
function genNode(rng: Rng, cfg: Cfg, ops: number): Node {
  return retry(() => genNodeOnce(rng, cfg, ops), 3)
}
function genRoot(rng: Rng, cfg: Cfg, ops: number): BinN {
  return retry(() => genBin(rng, cfg, ops), 4)
}
function genNodeOnce(rng: Rng, cfg: Cfg, ops: number): Node {
  if (ops <= 0) return genLeaf(rng, cfg)
  const k = wpick<string>(rng, [['bin', cfg.w.bin], ['pct', cfg.w.pct], ['frac', cfg.approx ? 0 : cfg.w.frac], ['pow', cfg.w.pow], ['root', cfg.w.root]])
  switch (k) {
    case 'pct':
      return pctOf(rng, cfg, genNode(rng, cfg, ops - 1))
    case 'frac':
      return fracOf(rng, genNode(rng, cfg, ops - 1))
    case 'pow': {
      const cube = rng.chance(0.3)
      let c: Node
      if (ops >= 2 && rng.chance(0.3)) c = genNode(rng, cfg, ops - 1)
      else if (cfg.approx) c = intLeaf(rng, cfg, rng.int(cube ? 3 : 5, cube ? 12 : 40))
      else if (rng.chance(0.3)) c = numLeaf(rng, cfg, F(rng.int(2, cube ? 25 : 60), 10), 'dec')
      else if (rng.chance(0.2)) c = numLeaf(rng, cfg, F(rng.int(1, 4) * 2 + 1, 2), 'mix')
      else c = intLeaf(rng, cfg, rng.int(cube ? 3 : 6, cube ? 14 : 36))
      return mkUni(cube ? 'cu' : 'sq', c)
    }
    case 'root':
      return rootable(rng, cfg, rng.chance(0.7) ? 'sqrt' : 'cbrt', ops)
    default:
      return genBin(rng, cfg, ops)
  }
}

function genBin(rng: Rng, cfg: Cfg, ops: number): BinN {
  const b = genBinRaw(rng, cfg, ops)
  need(!cfg.approx || fint(b.v), 'approximation keeps integers')
  return b
}
function genBinRaw(rng: Rng, cfg: Cfg, ops: number): BinN {
  const op = wpick<Op>(rng, [['+', 3], ['−', 3], ['×', 3.2], ['÷', 2.4]])
  if (op === '+' || op === '−') {
    const lo = rng.int(0, ops - 1)
    const l = genNode(rng, cfg, lo)
    const r = genNode(rng, cfg, ops - 1 - lo)
    const force = (l.k === 'b' && rng.chance(0.3)) || (r.k === 'b' && rng.chance(0.4))
    if (op === '−' && fval(r.v) > fval(l.v)) return mkBin('−', r, l, force)
    return mkBin(op, l, r, force)
  }
  const lb = rng.int(Math.ceil((ops - 1) / 2), ops - 1)
  const l = genNode(rng, cfg, lb)
  const rb = ops - 1 - lb
  if (op === '÷' && rb === 0 && fint(l.v) && (cfg.approx || rng.chance(0.6))) {
    const ds: number[] = []
    for (let d = 2; d <= 60 && d < l.v.n; d++) if (l.v.n % d === 0) ds.push(d)
    need(ds.length > 0, 'no divisor')
    return mkBin('÷', l, intLeaf(rng, cfg, rng.pick(ds)), l.k === 'b' && rng.chance(0.5))
  }
  let last: unknown = null
  for (let i = 0; i < 14; i++) {
    try {
      const r = rb > 0 ? genNode(rng, cfg, rb) : genLeaf(rng, cfg)
      if (op === '÷' && !(l.v.d === 1 || nice(l.v))) bad('dividend not clean')
      if (op === '÷' && fval(r.v) > fval(l.v)) return mkBin('÷', r, l, r.k === 'b' && rng.chance(0.5))
      return mkBin(op, l, r, l.k === 'b' && rng.chance(0.5))
    } catch (e) {
      if (!(e instanceof Reject)) throw e
      last = e
    }
  }
  throw last instanceof Reject ? last : new Reject('no right operand')
}

// ------------------------------------------------------------------ independent text evaluator (second method)
interface Dom<T> {
  num(s: string): T
  add(a: T, b: T): T
  sub(a: T, b: T): T
  mul(a: T, b: T): T
  div(a: T, b: T): T
  root(a: T, k: 2 | 3): T
}
function tokenize(src: string): string[] {
  const toks = src.match(/\d+ \d+\/\d+|\d+(?:\.\d+)?\/\d+|\d+(?:\.\d+)?|of|[+−×÷()[\]{}%²³√∛]/g)
  need(toks !== null, 'tokenize')
  ensure(toks.join('').replace(/\s+/g, '') === src.replace(/\s+/g, ''), 'tokenizer dropped characters')
  return toks
}
function parseText<T>(src: string, dom: Dom<T>): T {
  const toks = tokenize(src)
  let i = 0
  const peek = (): string | undefined => toks[i]
  const take = (): string => toks[i++]
  const closing: Record<string, string> = { '(': ')', '[': ']', '{': '}' }
  const lit = (t: string): T => {
    ensure(/^\d/.test(t), `number expected, got ${t}`)
    const mx = /^(\d+) (\d+)\/(\d+)$/.exec(t)
    if (mx) return dom.add(dom.num(mx[1]), dom.div(dom.num(mx[2]), dom.num(mx[3])))
    const fr = /^([\d.]+)\/(\d+)$/.exec(t)
    if (fr) return dom.div(dom.num(fr[1]), dom.num(fr[2]))
    return dom.num(t)
  }
  function expr(): T {
    let a = term()
    while (peek() === '+' || peek() === '−') {
      const op = take()
      const b = term()
      a = op === '+' ? dom.add(a, b) : dom.sub(a, b)
    }
    return a
  }
  function term(): T {
    let a = atom()
    while (peek() === '×' || peek() === '÷') {
      const op = take()
      const b = atom()
      a = op === '×' ? dom.mul(a, b) : dom.div(a, b)
    }
    return a
  }
  function bracketed(t: string): T {
    take()
    const v = expr()
    ensure(take() === closing[t], 'bracket mismatch')
    return v
  }
  function base(): T {
    const t = peek()
    if (t !== undefined && t in closing) return bracketed(t)
    return lit(take())
  }
  function atom(): T {
    const t = peek()
    if (t === '√' || t === '∛') {
      take()
      return dom.root(base(), t === '√' ? 2 : 3)
    }
    let a = base()
    const n = peek()
    if (n === '%') {
      take()
      a = dom.div(a, dom.num('100'))
    } else if (n === '²') {
      take()
      a = dom.mul(a, a)
    } else if (n === '³') {
      take()
      a = dom.mul(dom.mul(a, a), a)
    }
    if (peek() === 'of') {
      take()
      a = dom.mul(a, atom())
    }
    return a
  }
  const v = expr()
  ensure(i === toks.length, `unparsed tokens in "${src}"`)
  return v
}
const exactDom: Dom<Frac> = {
  num: (s) => {
    const [ip, fp = ''] = s.split('.')
    return F(Number(ip + fp), 10 ** fp.length)
  },
  add: fadd,
  sub: fsub,
  mul: fmul,
  div: fdiv,
  root: (a, k) => {
    const r = exactRoot(a, k)
    ensure(r !== null, 'inexact root in re-evaluation')
    return r
  },
}
const floatDom: Dom<number> = { num: Number, add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b, div: (a, b) => a / b, root: (a, k) => (k === 2 ? Math.sqrt(a) : Math.cbrt(a)) }
const evalExact = (s: string): Frac => parseText(s, exactDom)

// ------------------------------------------------------------------ explanation helpers
const vs = (n: Node): string => (n.k === 'n' ? (n.shape === 'mix' || n.shape === 'frac' ? bracket(n.sr) : n.sr) : fstr(n.v))
function opLine(n: Node): string | null {
  if (n.k === 'n') return null
  if (n.k === 'b') return `${vs(n.l)} ${n.op} ${vs(n.r)} = ${fstr(n.v)}`
  const c = vs(n.c)
  switch (n.f) {
    case 'pct':
      return `${n.pr}% of ${c} = ${c} × ${n.pr}/100 = ${fstr(n.v)}`
    case 'frac':
      return `${n.pr} of ${c} = ${fstr(n.v)}`
    case 'sq':
      return `${/^\d+$/.test(c) || c.startsWith('(') ? c : bracket(c)}² = ${fstr(n.v)}`
    case 'cu':
      return `${/^\d+$/.test(c) || c.startsWith('(') ? c : bracket(c)}³ = ${fstr(n.v)}`
    case 'sqrt':
      return `√${/^[\d.]+$/.test(c) || c.startsWith('(') ? c : bracket(c)} = ${fstr(n.v)}`
    case 'cbrt':
      return `∛${/^[\d.]+$/.test(c) || c.startsWith('(') ? c : bracket(c)} = ${fstr(n.v)}`
  }
}
/** One line per operation, innermost first (post-order), each a single complete computation on numbers. */
function stepLines(root: Node): string[] {
  const out: string[] = []
  const walk = (n: Node): void => {
    if (n.k === 'u') walk(n.c)
    else if (n.k === 'b') {
      walk(n.l)
      walk(n.r)
    }
    const l = opLine(n)
    if (l !== null && !out.includes(l)) out.push(l)
  }
  walk(root)
  return out
}

/** Value of the tree when ONE operation is evaluated the "classic wrong way" (op swapped, decimal slip, root halved...). */
function tweaked(n: Node, target: Node): Frac {
  const v = (c: Node): Frac => tweaked(c, target)
  if (n.k === 'n') return n.v
  if (n.k === 'b') {
    const l = v(n.l)
    const r = v(n.r)
    let op = n.op
    if (n === target) op = n.op === '+' ? '−' : n.op === '−' ? '+' : n.op === '×' ? '÷' : '×'
    switch (op) {
      case '+':
        return fadd(l, r)
      case '−':
        return fsub(l, r)
      case '×':
        return fmul(l, r)
      default:
        return fdiv(l, r)
    }
  }
  const c = v(n.c)
  if (n === target) {
    switch (n.f) {
      case 'pct':
        return fmul(c, n.pv.d === 1 ? n.pv : fmul(n.pv, F(10)))
      case 'frac':
        return fmul(c, F(n.pv.d, n.pv.n))
      case 'sq':
        return fmul(c, F(2))
      case 'cu':
        return fmul(c, F(3))
      case 'sqrt':
        return fdiv(c, F(2))
      case 'cbrt':
        return fdiv(c, F(3))
    }
  }
  switch (n.f) {
    case 'pct':
    case 'frac':
      return fmul(n.pv, c)
    case 'sq':
      return fmul(c, c)
    case 'cu':
      return fmul(fmul(c, c), c)
    case 'sqrt':
    case 'cbrt': {
      const r = exactRoot(c, n.f === 'sqrt' ? 2 : 3)
      if (r === null) bad('inexact tweak')
      return r
    }
  }
}
function allNodes(n: Node, out: Node[] = []): Node[] {
  if (n.k !== 'n') out.push(n)
  if (n.k === 'u') allNodes(n.c, out)
  else if (n.k === 'b') {
    allNodes(n.l, out)
    allNodes(n.r, out)
  }
  return out
}
function trapValues(root: Node, lo = 0.2, hi = 5): number[] {
  const out: number[] = []
  for (const t of allNodes(root)) {
    try {
      const f = tweaked(root, t)
      const x = fval(f)
      const ref = fval(root.v)
      if (Number.isFinite(x) && x > 0 && !feq(f, root.v) && x >= ref * lo && x <= ref * hi) out.push(x)
    } catch (e) {
      if (!(e instanceof Reject)) throw e
    }
  }
  return out
}

// ------------------------------------------------------------------ configuration presets
const W_BASE = { bin: 62, pct: 13, frac: 6, pow: 7, root: 12 }
const W_ROOTS = { bin: 52, pct: 9, frac: 4, pow: 14, root: 21 }
const W_PCT = { bin: 52, pct: 28, frac: 8, pow: 5, root: 7 }
const exact = (w = W_BASE): Cfg => ({ approx: false, w })
const approxCfg = (w = W_BASE): Cfg => ({ approx: true, w })

function finishRoot(t: BinN): BinN {
  need(fval(t.v) >= 2 && nice(t.v, 2), 'tiny or too-precise result')
  return t
}
const genExpr = (rng: Rng, cfg: Cfg, ops: number): BinN => retry(() => finishRoot(genRoot(rng, cfg, ops)), 10)

const HEAD = 'What will come in place of the question mark (?) in the following question?'
const BODMAS = 'Apply BODMAS: brackets first, then "of", then ÷ and ×, then + and −.'

// ------------------------------------------------------------------ simplification: evaluate
interface EvalReq {
  w: Cfg['w']
  ops: [number, number]
  ok: (p: Prof) => boolean
}
function evalQ(rng: Rng, o: EvalReq): QuestionDraft {
  const cfg = exact(o.w)
  const ops = rng.int(o.ops[0], o.ops[1])
  const t = retry(() => {
    const t = finishRoot(genRoot(rng, cfg, ops))
    const p = prof(t)
    need(p.ops >= o.ops[0] && p.ops <= o.ops[1] + 1 && o.ok(p), 'profile mismatch')
    const text = rend(t, 's')
    need(text.length <= 96 && !text.includes('{'), 'too long')
    return t
  }, 14)
  const text = rend(t, 's')
  ensure(feq(evalExact(text), t.v), `simplification: re-evaluation mismatch for ${text}`)
  const why = `${BODMAS}\n${stepLines(t).join('\n')}`
  return numQ(rng, { topic: 'simplification', stem: `${HEAD}\n${text} = ?`, ans: t.v, dec: decOf(t.v), wrong: trapValues(t), why, none: 0.12 })
}

// ------------------------------------------------------------------ simplification: find the ? (blank in the middle)
interface Step {
  node: Node
  /** the child (on the path) of `node`. */
  child: Node
  side?: 'l' | 'r'
}
function pathSteps(n: Node, target: Node, acc: Step[] = []): Step[] | null {
  if (n === target) return acc
  if (n.k === 'n') return null
  if (n.k === 'u') return pathSteps(n.c, target, [...acc, { node: n, child: n.c }])
  return pathSteps(n.l, target, [...acc, { node: n, child: n.l, side: 'l' }]) ?? pathSteps(n.r, target, [...acc, { node: n, child: n.r, side: 'r' }])
}
/** Value the blank must take so that the whole left-hand side equals `target`; `wrongAt` applies one classic mistake. */
function solveBack(steps: Step[], target: Frac, wrongAt = -1): { vals: Frac[]; final: Frac } {
  let t = target
  const vals: Frac[] = []
  steps.forEach((st, i) => {
    const n = st.node
    const bad = i === wrongAt
    if (n.k === 'b') {
      const other = st.side === 'l' ? n.r : n.l
      const o = other.v
      switch (n.op) {
        case '+':
          t = bad ? fadd(t, o) : fsub(t, o)
          break
        case '×':
          t = bad ? fmul(t, o) : fdiv(t, o)
          break
        case '−':
          t = st.side === 'l' ? (bad ? fsub(t, o) : fadd(t, o)) : bad ? fsub(t, o) : fsub(o, t)
          break
        default:
          t = st.side === 'l' ? (bad ? fdiv(t, o) : fmul(t, o)) : bad ? fmul(t, o) : fdiv(o, t)
      }
    } else if (n.k === 'u') {
      switch (n.f) {
        case 'pct':
        case 'frac':
          t = bad ? fmul(t, n.pv) : fdiv(t, n.pv)
          break
        case 'sqrt':
          t = bad ? t : fmul(t, t)
          break
        case 'cbrt':
          t = bad ? t : fmul(fmul(t, t), t)
          break
        case 'sq': {
          const r = exactRoot(t, 2)
          need(r !== null, 'no exact square root')
          t = bad ? fdiv(t, F(2)) : r
          break
        }
        case 'cu': {
          const r = exactRoot(t, 3)
          need(r !== null, 'no exact cube root')
          t = bad ? fdiv(t, F(3)) : r
          break
        }
      }
    }
    vals.push(t)
  })
  return { vals, final: t }
}
const NOTE: Record<string, string> = { sqrt: ' (squaring both sides)', cbrt: ' (cubing both sides)', pct: ' (dividing by the percentage)', frac: ' (dividing by the fraction)', sq: ' (taking the square root)', cu: ' (taking the cube root)' }

function findQ(rng: Rng, style: 'mid' | 'rad'): QuestionDraft {
  const cfg = exact(style === 'rad' ? W_ROOTS : W_BASE)
  const lhsOps = rng.int(5, 7)
  const t = retry(() => {
    const t = genRoot(rng, cfg, lhsOps)
    need(fval(t.v) >= 6 && nice(t.v, 2), 'bad left side')
    const p = prof(t)
    need(p.ops >= 5 && p.ops <= 8, 'ops out of range')
    return t
  }, 10)
  const leaves = allNodes(t).flatMap((n) => (n.k === 'u' ? [n.c] : n.k === 'b' ? [n.l, n.r] : [])).filter((n): n is NumN => n.k === 'n' && (n.shape === 'int' || n.shape === 'dec'))
  const cands = leaves.flatMap((l) => {
    const st = pathSteps(t, l)
    if (st === null || st.length < 2) return []
    if (style === 'mid') return st.length >= 3 ? [{ l, st }] : []
    return st.some((q) => q.node.k === 'u' && (q.node.f === 'sqrt' || q.node.f === 'cbrt' || q.node.f === 'pct')) ? [{ l, st }] : []
  })
  need(cands.length > 0, 'no suitable blank position')
  const pk = rng.pick(cands)
  const blank = pk.l
  const steps = pk.st
  const R = t.v
  // right-hand side: a small expression "X ± c" whose value is R (adds a computation on the right too)
  let rhsText = fstr(R)
  let rhs: Node | null = null
  if (rng.chance(0.55)) {
    const x = retry(() => genRoot(rng, exact(W_BASE), rng.int(1, 2)), 6)
    need(nice(x.v, 2), 'rhs part unusable')
    const c = fsub(R, x.v)
    if (fval(c) >= 2 && nice(c, 2) && fval(c) <= 2000) {
      const cn: NumN = { k: 'n', v: c, x: fval(c), s: decStr(c, 2), sr: decStr(c, 2), shape: c.d === 1 ? 'int' : 'dec' }
      rhs = mkBin('+', x, cn)
    } else {
      const c2 = fsub(x.v, R)
      need(fval(c2) >= 2 && nice(c2, 2) && fval(c2) <= 2000, 'no offset')
      const cn: NumN = { k: 'n', v: c2, x: fval(c2), s: decStr(c2, 2), sr: decStr(c2, 2), shape: c2.d === 1 ? 'int' : 'dec' }
      rhs = mkBin('−', x, cn)
    }
    need(feq(rhs.v, R), 'rhs mismatch')
    rhsText = rend(rhs, 's')
    need(rhsText.length <= 40, 'rhs too long')
  }
  const lhsText = rend(t, 's', blank)
  need(lhsText.length <= 92 && !lhsText.includes('{'), 'too long')
  // solve backwards (method 1)
  const solved = solveBack(steps, R)
  const ans = solved.final
  need(feq(ans, blank.v), 'backward solve disagrees with the construction')
  need(ans.n > 0 && nice(ans, 2), 'answer unclean')
  // substitute and re-evaluate the printed text (method 2)
  const sub = decStr(ans, 2)
  ensure(feq(evalExact(lhsText.replace('?', sub)), R), `find: substitution does not reproduce the right side for ${lhsText}`)
  if (rhs) ensure(feq(evalExact(rhsText), R), `find: right side ${rhsText} != ${fstr(R)}`)
  // explanation
  const known = new Set<Node>()
  const lines: string[] = []
  steps.forEach((st) => {
    const other = st.node.k === 'b' ? (st.side === 'l' ? st.node.r : st.node.l) : null
    if (other && other.k !== 'n') {
      known.add(other)
      for (const l of stepLines(other)) if (!lines.includes(l)) lines.push(l)
    }
  })
  if (rhs) lines.unshift(...stepLines(rhs), `Right side = ${fstr(R)}`)
  const peel: string[] = [`${rend(t, 's', blank, known)} = ${fstr(R)}`]
  steps.forEach((st, i) => {
    peel.push(`${rend(st.child, 's', blank, known)} = ${fstr(solved.vals[i])}${NOTE[st.node.k === 'u' ? st.node.f : ''] ?? ''}`)
  })
  if (!/^\? = /.test(peel[peel.length - 1])) peel.push(`? = ${fstr(ans)}`)
  const why = `${lines.join('\n')}${lines.length ? '\n' : ''}${peel.join('\n')}`
  // classic mistakes: one wrong inversion along the path
  const wrong: Frac[] = []
  for (let i = 0; i < steps.length; i++) {
    try {
      const w = solveBack(steps, R, i).final
      if (!feq(w, ans) && w.n > 0) wrong.push(w)
    } catch (e) {
      if (!(e instanceof Reject)) throw e
    }
  }
  return numQ(rng, { topic: 'simplification', stem: `${HEAD}\n${lhsText} = ${rhsText}`, ans, dec: decOf(ans), wrong, why, none: 0.12 })
}

// ------------------------------------------------------------------ simplification: one expression as a percentage of another
/** Expression with a known target value, built as "X ± c" so that the ratio between two expressions is a clean percentage. */
function exprWithValue(rng: Rng, cfg: Cfg, target: Frac, ops: number): BinN {
  return retry(() => {
    const x = genExpr(rng, cfg, ops)
    need(/[×÷²³√∛]|of/.test(rend(x, 's')), 'part too plain')
    const d = fsub(target, x.v)
    const up = d.n > 0
    const c = up ? d : fsub(x.v, target)
    need(c.n > 0 && fval(c) >= 2 && fval(c) <= 0.85 * fval(target) && nice(c, 2), 'no clean offset')
    const cn: NumN = { k: 'n', v: c, x: fval(c), s: decStr(c, 2), sr: decStr(c, 2), shape: c.d === 1 ? 'int' : 'dec' }
    const e = mkBin(up ? '+' : '−', x, cn)
    ensure(feq(e.v, target), 'exprWithValue: value mismatch')
    return e
  }, 12)
}
function pctPair(rng: Rng): QuestionDraft {
  const cfg = exact(W_BASE)
  const kind = rng.pick(['of', 'more', 'less'] as const)
  const p = kind === 'of' ? rng.pick([12.5, 20, 25, 37.5, 40, 60, 62.5, 75, 80, 120, 125, 150, 175, 240]) : rng.pick([10, 12.5, 15, 20, 25, 30, 35, 37.5, 40, 45, 50, 60, 75])
  const pv = fdec(p / 100, 4)
  const b = genExpr(rng, cfg, rng.int(3, 4))
  need(fval(b.v) >= 24 && fval(b.v) <= 2400, 'second expression out of range')
  const tv = kind === 'of' ? fmul(pv, b.v) : kind === 'more' ? fmul(fadd(F(1), pv), b.v) : fmul(fsub(F(1), pv), b.v)
  need(nice(tv, 2) && fval(tv) >= 12 && fval(tv) <= 5000 && !feq(tv, b.v), 'first value unsuitable')
  const a = exprWithValue(rng, cfg, tv, rng.int(2, 3))
  const ta = rend(a, 's')
  const tb = rend(b, 's')
  need(ta.length <= 64 && tb.length <= 56 && !ta.includes('{') && !tb.includes('{'), 'too long')
  ensure(feq(evalExact(ta), a.v) && feq(evalExact(tb), b.v), 'pct pair: re-evaluation mismatch')
  const hundred = F(100)
  const r = (x: Frac, y: Frac): Frac => fmul(hundred, fdiv(x, y))
  const L1 = `I. ${ta}\n${stepLines(a).join('\n')}\nI = ${fstr(a.v)}`
  const L2 = `II. ${tb}\n${stepLines(b).join('\n')}\nII = ${fstr(b.v)}`
  let ans: Frac
  let q: string
  let wrong: Frac[]
  let why: string
  if (kind === 'of') {
    ans = r(a.v, b.v)
    q = 'Expression I is what percent of Expression II?'
    wrong = [r(b.v, a.v), r(fsub(b.v, a.v).n < 0 ? fsub(a.v, b.v) : fsub(b.v, a.v), b.v), r(fadd(a.v, b.v), b.v)]
    why = `${L1}\n${L2}\nRequired % = I/II × 100 = ${fstr(a.v)}/${fstr(b.v)} × 100 = ${fstr(ans)}%`
  } else if (kind === 'more') {
    ans = r(fsub(a.v, b.v), b.v)
    q = 'Expression I is what percent more than Expression II?'
    wrong = [r(a.v, b.v), r(fsub(a.v, b.v), a.v), r(b.v, a.v)]
    why = `${L1}\n${L2}\nI − II = ${fstr(a.v)} − ${fstr(b.v)} = ${fstr(fsub(a.v, b.v))}\nRequired % = (I − II)/II × 100 = ${fstr(fsub(a.v, b.v))}/${fstr(b.v)} × 100 = ${fstr(ans)}%`
  } else {
    ans = r(fsub(b.v, a.v), b.v)
    q = 'Expression I is what percent less than Expression II?'
    wrong = [r(a.v, b.v), r(fsub(b.v, a.v), a.v), r(b.v, a.v)]
    why = `${L1}\n${L2}\nII − I = ${fstr(b.v)} − ${fstr(a.v)} = ${fstr(fsub(b.v, a.v))}\nRequired % = (II − I)/II × 100 = ${fstr(fsub(b.v, a.v))}/${fstr(b.v)} × 100 = ${fstr(ans)}%`
  }
  ensure(feq(ans, fdec(p, 4)), `pct pair: computed ${fstr(ans)}% but constructed ${p}%`)
  return numQ(rng, { topic: 'simplification', stem: `${q}\nI. ${ta}\nII. ${tb}`, ans, dec: decOf(ans), wrong, why, post: '%', none: 0.1 })
}

// ------------------------------------------------------------------ simplification: define variables, then combine
const intExpr = (rng: Rng, cfg: Cfg, ops: number): BinN =>
  retry(() => {
    const e = genExpr(rng, cfg, ops)
    need(fint(e.v) && e.v.n >= 4 && e.v.n <= 400 && rend(e, 's').length <= 50 && !rend(e, 's').includes('{'), 'integer value out of range')
    return e
  }, 30)
function twoVar(rng: Rng): QuestionDraft {
  const cfg = exact(W_BASE)
  const a = intExpr(rng, cfg, rng.int(2, 3))
  const b = intExpr(rng, cfg, rng.int(2, 3))
  need(a.v.n !== b.v.n, 'equal values')
  const ta = rend(a, 's')
  const tb = rend(b, 's')
  ensure(feq(evalExact(ta), a.v) && feq(evalExact(tb), b.v), 'two-var: re-evaluation mismatch')
  const [A, B] = [a.v.n, b.v.n]
  const forms: { text: string; val: Frac; why: string; wrong: number[] }[] = [
    { text: 'x² − y²', val: F(A * A - B * B), why: `x² − y² = (x + y)(x − y) = ${A + B} × ${A - B} = ${(A + B) * (A - B)}`, wrong: [(A - B) * (A - B), (A + B) * (A + B), A * A + B * B] },
    { text: '(x + y)² − 4xy', val: F((A - B) * (A - B)), why: `(x + y)² − 4xy = (x − y)² = (${A} − ${B})² = ${(A - B) ** 2}`, wrong: [(A + B) ** 2, (A + B) ** 2 - 2 * A * B, A * A + B * B] },
    { text: '(x² + y²) ÷ 2 − xy', val: F((A - B) * (A - B), 2), why: `(x² + y²) ÷ 2 − xy = (x − y)²/2 = (${A} − ${B})²/2 = ${fstr(F((A - B) ** 2, 2))}`, wrong: [(A + B) ** 2 / 2, (A * A + B * B) / 2, (A - B) / 2] },
  ]
  const f = rng.pick(forms)
  need(nice(f.val, 2) && fval(f.val) >= 4 && fval(f.val) <= 9000, 'combination unsuitable')
  // second method: evaluate the printed form with plain numbers
  const direct = f.text === 'x² − y²' ? A * A - B * B : f.text === '(x + y)² − 4xy' ? (A + B) ** 2 - 4 * A * B : (A * A + B * B) / 2 - A * B
  ensure(Math.abs(direct - fval(f.val)) < 1e-9, 'two-var: identity mismatch')
  const why = `x = ${ta}\n${stepLines(a).join('\n')}\ny = ${tb}\n${stepLines(b).join('\n')}\nx = ${A}, y = ${B}\n${f.why}`
  return numQ(rng, { topic: 'simplification', stem: `If x = ${ta} and y = ${tb}, then find the value of ${f.text}.`, ans: f.val, dec: decOf(f.val), wrong: f.wrong, why, none: 0.1 })
}

// ------------------------------------------------------------------ approximation
function approxQ(rng: Rng, o: { w: Cfg['w']; ok: (p: Prof) => boolean }): QuestionDraft {
  const cfg = approxCfg(o.w)
  const ops = rng.int(5, 6)
  const t = retry(() => {
    const t = genRoot(rng, cfg, ops)
    need(fint(t.v) && t.v.n >= 30 && t.v.n <= 12000, 'key not a clean integer')
    const p = prof(t)
    need(p.ops >= 5 && p.ops <= 7 && o.ok(p), 'profile mismatch')
    need(Math.abs(t.x - t.v.n) / t.v.n <= 0.0042, 'rounded value too far from the exact value')
    return t
  }, 30)
  const K = t.v.n
  const X = t.x
  const shown = rend(t, 's')
  const round = rend(t, 'sr')
  need(!shown.includes('{') && shown.length <= 104, 'too long')
  ensure(feq(evalExact(round), t.v), `approximation: round expression ${round} != ${K}`)
  const X2 = parseText(shown, floatDom)
  ensure(Math.abs(X2 - X) <= 1e-6 * Math.max(1, Math.abs(X)), `approximation: float re-evaluation ${X2} != ${X} for ${shown}`)
  ensure(Math.abs(X2 - K) / K <= 0.0045, 'approximation: exact value drifted from key')
  const wrong: number[] = []
  for (const w of trapValues(t, 0.4, 2.5)) {
    const r = Math.round(w)
    if (r >= 1 && Math.abs(r - X) / X >= 0.035 && Math.abs(r - K) >= 2) wrong.push(r)
  }
  for (const r of [0.06, 0.1, 0.15, 0.22]) wrong.push(Math.round(K * (1 - r)), Math.round(K * (1 + r)))
  const changed: string[] = []
  const collect = (n: Node): void => {
    if (n.k === 'n') {
      if (n.s !== n.sr) changed.push(`${n.s} ≈ ${n.sr}`)
    } else if (n.k === 'u') {
      if ((n.f === 'pct') && n.ps !== n.pr) changed.push(`${n.ps}% ≈ ${n.pr}%`)
      collect(n.c)
    } else {
      collect(n.l)
      collect(n.r)
    }
  }
  collect(t)
  const uniq = [...new Set(changed)]
  const why = `Round off each number to the nearest convenient value: ${uniq.join(', ')}.\nThe expression becomes ${round}.\n${stepLines(t).join('\n')}\n? ≈ ${K}`
  return numQ(rng, { topic: 'approximation', stem: `What approximate value will come in place of the question mark (?) in the following question?\n(You are not expected to calculate the exact value.)\n${shown} = ?`, ans: K, wrong, why })
}

// ------------------------------------------------------------------ registries
const SIMPL_TPLS: Tpl[] = [
  { name: 'eval-mixed', gen: (rng) => evalQ(rng, { w: W_BASE, ops: [6, 7], ok: (p) => p.mix >= 1 && p.dec >= 1 && p.pct + p.frac >= 1 }) },
  { name: 'eval-roots', gen: (rng) => evalQ(rng, { w: W_ROOTS, ops: [6, 8], ok: (p) => p.root >= 1 && p.pow + p.root >= 3 }) },
  { name: 'eval-chain', gen: (rng) => evalQ(rng, { w: { bin: 46, pct: 34, frac: 8, pow: 5, root: 7 }, ops: [6, 7], ok: (p) => p.chain >= 1 }) },
  { name: 'find-middle', gen: (rng) => findQ(rng, 'mid') },
  { name: 'find-inside-root', gen: (rng) => findQ(rng, 'rad') },
  { name: 'percent-of-expression', gen: pctPair },
  { name: 'two-variables', gen: twoVar },
]
const APPROX_TPLS: Tpl[] = [
  { name: 'approx-mixed', gen: (rng) => approxQ(rng, { w: W_BASE, ok: (p) => p.pct >= 1 && p.root + p.pow >= 1 }) },
  { name: 'approx-roots', gen: (rng) => approxQ(rng, { w: W_ROOTS, ok: (p) => p.root >= 1 && p.pow + p.root >= 2 }) },
  { name: 'approx-percent', gen: (rng) => approxQ(rng, { w: W_PCT, ok: (p) => p.pct >= 2 }) },
]

const genSimplificationMains: TopicGenerator = (rng: Rng, _d: MockDifficulty, count: number): Group[] => genSingles(rng, 'hard', count, SIMPL_TPLS)
const genApproximationMains: TopicGenerator = (rng: Rng, _d: MockDifficulty, count: number): Group[] => genSingles(rng, 'hard', count, APPROX_TPLS)

export const MAINS_CALC: Partial<Record<QuantTopicId, TopicGenerator>> = {
  simplification: genSimplificationMains,
  approximation: genApproximationMains,
}
