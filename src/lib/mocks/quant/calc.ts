// Simplification and Approximation generators.
// Expressions are built as exact trees (BigInt-free rationals), rendered to text, and the text is re-parsed by an
// independent string evaluator (second method) before a question is emitted.
import type { Rng } from '../rng'
import type { Group, MockDifficulty, QuestionDraft } from '../types'
import { F, Reject, ensure, fadd, fdiv, fdec, feq, fint, fmul, fsub, fval, divisorsOf, genSingles, lcm, decOf, need, numQ, rstep, roundTo, terminating, wpick, decStr, gcd } from './util'
import type { Frac, Tpl } from './util'
import { fmtNum } from '../options'

type Op = '+' | '−' | '×' | '÷'
interface Leaf {
  k: 'n'
  v: Frac
  x: number
  /** shown text / round-number text (differ only in approximation). */
  s: string
  sr: string
  of?: boolean
  blank?: { s: string; ans: Frac }
}
interface Bin {
  k: 'b'
  op: Op
  l: Node
  r: Node
  v: Frac
  x: number
  force?: boolean
}
type Node = Leaf | Bin
interface Cfg {
  d: MockDifficulty
  approx: boolean
}

const prec = (op: Op): number => (op === '+' || op === '−' ? 1 : 2)
const cap = (c: Cfg): number => (c.d === 'hard' ? 12000 : 5000)
const decPlaces = (c: Cfg): number => (c.d === 'hard' || c.approx ? 2 : 0)

function paren(s: string): string {
  if (s.includes('[')) return `{${s}}`
  if (s.includes('(')) return `[${s}]`
  return `(${s})`
}

function render(n: Node, which: 's' | 'sr', blank?: Leaf): string {
  if (n.k === 'n') return n === blank && n.blank ? n.blank.s : n[which]
  const child = (c: Node, side: 'l' | 'r'): string => {
    const s = render(c, which, blank)
    if (c.k === 'n') return c.of && (n.op === '×' || n.op === '÷') ? paren(s) : s
    const pc = prec(c.op)
    const pp = prec(n.op)
    const must = pc < pp || (pc === pp && side === 'r' && (n.op === '−' || n.op === '÷'))
    return must || c.force ? paren(s) : s
  }
  return `${child(n.l, 'l')} ${n.op} ${child(n.r, 'r')}`
}

function leaves(n: Node, out: Leaf[] = []): Leaf[] {
  if (n.k === 'n') out.push(n)
  else {
    leaves(n.l, out)
    leaves(n.r, out)
  }
  return out
}
function countOps(n: Node): number {
  return n.k === 'n' ? 0 : 1 + countOps(n.l) + countOps(n.r)
}

function mkBin(cfg: Cfg, op: Op, l: Node, r: Node, force: boolean): Bin {
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
  need(terminating(v, decPlaces(cfg)), 'unclean intermediate')
  need(fval(v) <= cap(cfg) && x > 0, 'too large')
  return { k: 'b', op, l, r, v, x, force }
}

// ------------------------------------------------------------------ leaves
const num = (v: number): string => fmtNum(v, 2)

function perturb(rng: Rng, r: number): number {
  const dec = r < 100 ? 2 : 1
  for (let i = 0; i < 20; i++) {
    const e = (rng.chance(0.5) ? 1 : -1) * (0.0004 + rng.next() * 0.0066)
    const p = roundTo(r * (1 + e), dec)
    if (p !== r && Math.abs(p - r) <= 0.0072 * r) return p
  }
  throw new Reject('cannot perturb')
}

function plainLeaf(rng: Rng, cfg: Cfg, v: Frac): Leaf {
  const s = decStr(v, 2)
  if (!cfg.approx) return { k: 'n', v, x: fval(v), s, sr: s }
  const p = perturb(rng, fval(v))
  return { k: 'n', v, x: p, s: num(p), sr: s }
}

const PCTS_M = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 80]
const PCTS_H = [5, 8, 10, 12.5, 15, 16, 20, 25, 30, 35, 37.5, 40, 45, 60, 62.5, 75, 80, 120, 125, 150]

function leafOf(rng: Rng, cfg: Cfg, kind: string): Leaf {
  const hard = cfg.d === 'hard'
  switch (kind) {
    case 'int': {
      let v: number
      if (cfg.approx) v = rng.chance(0.7) ? rstep(rng, 10, 900, rng.pick([5, 10])) : rng.int(6, 99)
      else v = hard ? rng.int(12, 999) : rng.chance(0.7) ? rng.int(12, 99) : rng.int(100, 700)
      return plainLeaf(rng, cfg, F(v))
    }
    case 'dec': {
      const v = rng.pick([2.5, 4.5, 7.5, 12.5, 1.5, 3.5, 0.4, 0.8, 1.2, 6.4, 0.25, 0.75, 1.25, 15.5, 8.4])
      return plainLeaf(rng, cfg, fdec(v, 2))
    }
    case 'sq': {
      const k = cfg.approx ? rng.int(5, 30) : rng.int(hard ? 9 : 6, hard ? 32 : 22)
      const v = F(k * k)
      if (!cfg.approx) return { k: 'n', v, x: k * k, s: `${k}²`, sr: `${k}²` }
      const b = perturb(rng, k)
      return { k: 'n', v, x: b * b, s: `${num(b)}²`, sr: `${k}²` }
    }
    case 'cube': {
      const k = cfg.approx ? rng.int(3, 9) : rng.int(3, hard ? 12 : 9)
      const v = F(k ** 3)
      if (!cfg.approx) return { k: 'n', v, x: k ** 3, s: `${k}³`, sr: `${k}³` }
      const b = perturb(rng, k)
      return { k: 'n', v, x: b ** 3, s: `${num(b)}³`, sr: `${k}³` }
    }
    case 'sqrt': {
      const k = cfg.approx ? rng.int(5, 45) : rng.int(hard ? 8 : 4, hard ? 45 : 30)
      const rad = k * k
      const v = F(k)
      if (!cfg.approx) {
        const leaf: Leaf = { k: 'n', v, x: k, s: `√${rad}`, sr: `√${rad}` }
        if (rng.chance(0.5)) leaf.blank = { s: '√?', ans: F(rad) }
        return leaf
      }
      const r2 = perturb(rng, rad)
      return { k: 'n', v, x: Math.sqrt(r2), s: `√${num(r2)}`, sr: `√${rad}` }
    }
    case 'cbrt': {
      const k = rng.int(3, 12)
      const leaf: Leaf = { k: 'n', v: F(k), x: k, s: `∛${k ** 3}`, sr: `∛${k ** 3}` }
      if (rng.chance(0.5)) leaf.blank = { s: '∛?', ans: F(k ** 3) }
      return leaf
    }
    case 'pct': {
      const p = rng.pick(hard || cfg.approx ? PCTS_H : PCTS_M)
      const pf = fdec(p / 100, 4)
      const unit = cfg.approx ? lcm(pf.d, 10) : pf.d
      const N = unit * rng.int(Math.ceil((cfg.approx ? 60 : 40) / unit), Math.max(Math.ceil(60 / unit), Math.floor((hard ? 960 : 640) / unit)))
      const v = fmul(pf, F(N))
      if (!cfg.approx) return { k: 'n', v, x: fval(v), s: `${num(p)}% of ${N}`, sr: `${num(p)}% of ${N}`, of: true }
      const p2 = perturb(rng, p)
      const N2 = perturb(rng, N)
      return { k: 'n', v, x: (p2 / 100) * N2, s: `${num(p2)}% of ${num(N2)}`, sr: `${num(p)}% of ${N}`, of: true }
    }
    case 'frac': {
      const b = rng.pick([2, 3, 4, 5, 6, 7, 8, 9, 10, 12])
      let a = rng.int(1, b - 1)
      while (gcd(a, b) !== 1) a = rng.int(1, b - 1)
      const N = b * rng.int(Math.ceil(24 / b), Math.floor((hard ? 960 : 600) / b))
      const v = F(a * (N / b))
      const t = `${a}/${b} of ${N}`
      return { k: 'n', v, x: fval(v), s: t, sr: t, of: true }
    }
  }
  throw new Error(`unknown leaf kind ${kind}`)
}

const KINDS_M: [string, number][] = [['int', 40], ['sq', 14], ['sqrt', 12], ['pct', 15], ['frac', 12], ['cube', 5]]
const KINDS_H: [string, number][] = [['int', 20], ['sq', 12], ['cube', 9], ['sqrt', 10], ['cbrt', 5], ['pct', 16], ['frac', 12], ['dec', 16]]
const KINDS_AM: [string, number][] = [['int', 58], ['pct', 24], ['sq', 10], ['sqrt', 8]]
const KINDS_AH: [string, number][] = [['int', 40], ['pct', 20], ['sq', 12], ['sqrt', 12], ['cube', 6], ['dec', 10]]

function genLeaf(rng: Rng, cfg: Cfg): Leaf {
  const kinds = cfg.approx ? (cfg.d === 'hard' ? KINDS_AH : KINDS_AM) : cfg.d === 'hard' ? KINDS_H : KINDS_M
  return leafOf(rng, cfg, wpick(rng, kinds))
}

function genTree(rng: Rng, cfg: Cfg, ops: number): Node {
  if (ops === 0) return genLeaf(rng, cfg)
  const op = wpick<Op>(rng, [['+', 3], ['−', 3], ['×', 3], ['÷', 2.4]])
  if (op === '+' || op === '−') {
    const lo = rng.int(0, ops - 1)
    const l = genTree(rng, cfg, lo)
    const r = genTree(rng, cfg, ops - 1 - lo)
    return mkBin(cfg, op, l, r, (l.k === 'b' && prec(l.op) > 1 && rng.chance(0.5)) || (r.k === 'b' && rng.chance(0.2)))
  }
  // × and ÷: the right operand is a small leaf (or a small bracketed sum) so values stay readable
  const useSub = ops >= 2 && rng.chance(0.3)
  const l = genTree(rng, cfg, useSub ? ops - 2 : ops - 1)
  let r: Node
  if (op === '÷') {
    need(fint(l.v), 'dividend not integer')
    const ds = divisorsOf(l.v.n).filter((d) => d >= 2 && d <= (cfg.d === 'hard' ? 30 : 25))
    need(ds.length > 0, 'no divisor')
    if (useSub) {
      const sub = genTree(rng, cfg, 1)
      need(sub.k === 'b' && fint(sub.v) && ds.includes(sub.v.n), 'bracket not a divisor')
      r = sub
    } else r = plainLeaf(rng, cfg, F(rng.pick(ds)))
  } else if (useSub) {
    const sub = genTree(rng, cfg, 1)
    need(sub.k === 'b' && fint(sub.v) && sub.v.n >= 2 && sub.v.n <= 30, 'bracket too big')
    r = sub
  } else {
    r = cfg.d === 'hard' && rng.chance(0.25) ? leafOf(rng, cfg, 'dec') : plainLeaf(rng, cfg, F(rng.int(2, cfg.d === 'hard' ? 25 : 15)))
  }
  return mkBin(cfg, op, l, r, rng.chance(0.55) && l.k === 'b')
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
  const toks = src.match(/\d+(?:\.\d+)?|of|[+−×÷()[\]{}%/²³√∛]/g)
  need(toks !== null, 'tokenize')
  ensure(toks.join('') === src.replace(/\s+/g, ''), 'tokenizer dropped characters')
  return toks
}
function parseText<T>(src: string, dom: Dom<T>): T {
  const toks = tokenize(src)
  let i = 0
  const peek = (): string | undefined => toks[i]
  const take = (): string => toks[i++]
  const closing: Record<string, string> = { '(': ')', '[': ']', '{': '}' }
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
  function numTok(): T {
    const t = take()
    ensure(/^\d/.test(t), `number expected, got ${t}`)
    return dom.num(t)
  }
  function atom(): T {
    const t = peek()
    if (t && t in closing) {
      take()
      const v = expr()
      ensure(take() === closing[t], 'bracket mismatch')
      return v
    }
    if (t === '√' || t === '∛') {
      take()
      return dom.root(numTok(), t === '√' ? 2 : 3)
    }
    let a = numTok()
    const n = peek()
    if (n === '%') {
      take()
      ensure(take() === 'of', 'expected of')
      a = dom.mul(dom.div(a, dom.num('100')), numTok())
    } else if (n === '/') {
      take()
      const b = numTok()
      ensure(take() === 'of', 'expected of')
      a = dom.mul(dom.div(a, b), numTok())
    } else if (n === '²') {
      take()
      a = dom.mul(a, a)
    } else if (n === '³') {
      take()
      a = dom.mul(dom.mul(a, a), a)
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
    const rn = Math.round(a.n ** (1 / k))
    const rd = Math.round(a.d ** (1 / k))
    ensure(rn ** k === a.n && rd ** k === a.d, 'inexact root')
    return F(rn, rd)
  },
}
const floatDom: Dom<number> = {
  num: Number,
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  mul: (a, b) => a * b,
  div: (a, b) => a / b,
  root: (a, k) => (k === 2 ? Math.sqrt(a) : Math.cbrt(a)),
}
export const evalExact = (s: string): Frac => parseText(s, exactDom)

// ------------------------------------------------------------------ simplification
function pathTo(n: Node, target: Leaf, acc: { node: Bin; side: 'l' | 'r' }[] = []): { node: Bin; side: 'l' | 'r' }[] | null {
  if (n === target) return acc
  if (n.k === 'n') return null
  return pathTo(n.l, target, [...acc, { node: n, side: 'l' }]) ?? pathTo(n.r, target, [...acc, { node: n, side: 'r' }])
}

function fstr(f: Frac): string {
  return decStr(f, 2)
}

function evalSteps(root: Node): string[] {
  const lines: string[] = []
  const walk = (n: Node, isRoot: boolean): void => {
    if (n.k === 'n') return
    walk(n.l, false)
    walk(n.r, false)
    if (!isRoot) lines.push(`${render(n, 'sr')} = ${fstr(n.v)}`)
  }
  walk(root, true)
  return lines
}

function rngDec(rng: Rng): number {
  return rng.chance(0.2) ? 2 : 1
}
function hasOp(n: Node, op: Op): boolean {
  return n.k === 'b' && (n.op === op || hasOp(n.l, op) || hasOp(n.r, op))
}

function exprNode(rng: Rng, cfg: Cfg, ops: number): Node {
  const t = genTree(rng, cfg, ops)
  need(t.k === 'b' && countOps(t) === ops, 'ops mismatch')
  need(fval(t.v) >= 2, 'tiny result')
  need(!cfg.approx, 'exact trees only')
  need(terminating(t.v, rngDec(rng)), 'too many decimals')
  if (cfg.d === 'hard') need(hasOp(t, '×') || hasOp(t, '÷'), 'hard needs multiplication or division')
  need(!render(t, 's').includes('{'), 'too deeply nested')
  need(render(t, 's').length <= 70, 'too long')
  return t
}

function simplFind(rng: Rng, d: MockDifficulty): QuestionDraft {
  const cfg: Cfg = { d, approx: false }
  const ops = d === 'hard' ? rng.int(3, 4) : rng.int(2, 3)
  const t = exprNode(rng, cfg, ops)
  const ls = leaves(t).filter((l) => !l.of)
  need(ls.length > 0, 'no blankable leaf')
  const leaf = rng.pick(ls)
  const saved = leaf.blank
  const ans = saved ? saved.ans : leaf.v
  if (!saved) leaf.blank = { s: '?', ans: leaf.v }
  const shown = render(t, 's', leaf)
  // second method: substitute the answer in the text and re-evaluate; must reproduce the right-hand side
  const check = evalExact(shown.replace('?', decStr(ans, 2)))
  ensure(feq(check, t.v), `simplification: re-evaluation ${fstr(check)} != ${fstr(t.v)} for ${shown}`)
  // third method: solve backwards along the path
  const path = pathTo(t, leaf) as { node: Bin; side: 'l' | 'r' }[]
  let target = t.v
  const lines: string[] = []
  const solve: string[] = []
  for (const { node, side } of path) {
    const other = side === 'l' ? node.r : node.l
    const ov = other.v
    let nt: Frac
    if (node.op === '+') nt = fsub(target, ov)
    else if (node.op === '×') nt = fdiv(target, ov)
    else if (node.op === '−') nt = side === 'l' ? fadd(target, ov) : fsub(ov, target)
    else nt = side === 'l' ? fmul(target, ov) : fdiv(ov, target)
    if (other.k === 'b' || other.sr !== fstr(ov)) lines.push(`${render(other, 'sr')} = ${fstr(ov)}`)
    // The step a student would write: peel off one operation to isolate the part that holds the "?".
    const child = side === 'l' ? node.l : node.r
    solve.push(`${render(child, 's', leaf)} = ${fstr(nt)}`)
    target = nt
  }
  ensure(feq(target, leaf.v), 'simplification: backward solve disagrees')
  const closing = `? = ${fstr(ans)}`
  const why = [...lines, `${shown} = ${fstr(t.v)}`, ...solve, ...(solve[solve.length - 1] !== closing ? [closing] : [])].join('\n')
  return numQ(rng, { topic: 'simplification', stem: `What will come in place of the question mark (?) in the following question?\n${shown} = ${fstr(t.v)}`, ans, dec: decOf(ans), why, none: 0.15 })
}

function simplEval(rng: Rng, d: MockDifficulty): QuestionDraft {
  const cfg: Cfg = { d, approx: false }
  const ops = d === 'hard' ? rng.int(3, 5) : rng.int(2, 3)
  const t = exprNode(rng, cfg, ops)
  const text = render(t, 's')
  ensure(feq(evalExact(text), t.v), `simplification: evaluation mismatch for ${text}`)
  const steps = evalSteps(t)
  const why = `${steps.slice(0, 4).join('\n')}${steps.length ? '\n' : ''}${text} = ${fstr(t.v)}`
  return numQ(rng, { topic: 'simplification', stem: `What will come in place of the question mark (?) in the following question?\n${text} = ?`, ans: t.v, dec: decOf(t.v), why, none: 0.15 })
}

function simplDiff(rng: Rng, d: MockDifficulty): QuestionDraft {
  const cfg: Cfg = { d, approx: false }
  const ops = d === 'hard' ? 3 : 2
  const a = exprNode(rng, cfg, ops)
  const b = exprNode(rng, cfg, ops)
  need(!feq(a.v, b.v), 'equal values')
  const ta = render(a, 's')
  const tb = render(b, 's')
  ensure(feq(evalExact(ta), a.v) && feq(evalExact(tb), b.v), 'simplification: diff evaluation mismatch')
  const big = fval(a.v) > fval(b.v) ? a : b
  const small = big === a ? b : a
  const ans = fsub(big.v, small.v)
  const why = `I. ${ta} = ${fstr(a.v)}\nII. ${tb} = ${fstr(b.v)}\nRequired difference = ${fstr(big.v)} − ${fstr(small.v)} = ${fstr(ans)}`
  return numQ(rng, { topic: 'simplification', stem: `What is the difference between the values of expression I and expression II?\nI. ${ta}\nII. ${tb}`, ans, dec: decOf(ans), wrong: [fadd(a.v, b.v)], why, none: 0.15 })
}

const SIMPL_TPLS: Tpl[] = [
  { name: 'simpl-find', gen: simplFind },
  { name: 'simpl-find2', gen: simplFind },
  { name: 'simpl-eval', gen: simplEval },
  { name: 'simpl-diff', gen: simplDiff },
]
export function genSimplification(rng: Rng, d: MockDifficulty, count: number): Group[] {
  return genSingles(rng, d, count, SIMPL_TPLS)
}

// ------------------------------------------------------------------ approximation
function approxQ(rng: Rng, d: MockDifficulty): QuestionDraft {
  const cfg: Cfg = { d, approx: true }
  const ops = d === 'hard' ? rng.int(3, 4) : rng.int(2, 3)
  const t = genTree(rng, cfg, ops)
  need(t.k === 'b' && countOps(t) === ops, 'ops mismatch')
  need(fint(t.v) && t.v.n >= 80 && t.v.n <= 12000, 'key not a clean integer')
  const K = t.v.n
  const X = t.x
  need(Math.abs(X - K) / K <= 0.0048, 'rounded value too far from exact')
  const shown = render(t, 's')
  const round = render(t, 'sr')
  need(!shown.includes('{') && shown.length <= 80, 'too nested')
  // second methods: re-parse both renderings
  ensure(feq(evalExact(round), t.v), `approximation: round expression ${round} != ${K}`)
  const X2 = parseText(shown, floatDom)
  ensure(Math.abs(X2 - X) <= 1e-6 * Math.max(1, Math.abs(X)), `approximation: float re-evaluation ${X2} != ${X} for ${shown}`)
  ensure(Math.abs(X2 - K) / K <= 0.005, 'approximation: exact value drifted from key')
  const rels = [0.05, 0.08, 0.12, 0.17, 0.23, 0.3]
  const wrong: number[] = []
  for (const r of rels) {
    wrong.push(Math.round(K * (1 - r)), Math.round(K * (1 + r)))
  }
  for (const w of wrong) ensure(Math.abs(w - X) / X >= 0.03 && Math.abs(w - K) >= 2, `approximation: distractor ${w} too close (K=${K}, X=${X}) ${shown}`)
  const why = `Rounding each number to the nearest convenient value: ${round} = ${K}.`
  return numQ(rng, { topic: 'approximation', stem: `What approximate value will come in place of the question mark (?) in the following question?\n(You are not expected to calculate the exact value.)\n${shown} = ?`, ans: K, wrong, why })
}
const APPROX_TPLS: Tpl[] = [{ name: 'approx', gen: approxQ }]
export function genApproximation(rng: Rng, d: MockDifficulty, count: number): Group[] {
  return genSingles(rng, d, count, APPROX_TPLS)
}
