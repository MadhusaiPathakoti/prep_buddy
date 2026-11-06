// SBI PO Mains-level data-interpretation sets: table, bar, pie, line and caselet.
//
// Every set is built from a HIDDEN full data assignment. The stimulus shows only part of it (percentages / ratios / totals
// instead of raw numbers, '?' cells, quantities described in a text part ...). Each question carries a "recipe": an
// expression tree over cells of the RENDERED stimulus and over numbers printed in its text. The key is checked twice
// before a question is released:
//   1. the recipe evaluated on the rendered stimulus must equal the value computed directly from the hidden data;
//   2. every number the recipe takes from the text must really appear in the stimulus text.
// The verification script re-evaluates the recipes with its own BigInt evaluator (see MAINS_DI_META).
import type { Rng } from '../../rng'
import type { Group, QuantTopicId, QuestionDraft, Stimulus, StimulusPart, TopicGenerator } from '../../types'
import { answerLine, fmtNum } from '../../options'
import { F, Reject, decOf, disp, ensure, fadd, fdec, fdiv, feq, fint, fmul, fsub, fval, gcd, need, rstep, roundTo, terminating } from '../util'
import type { Frac } from '../util'

// ------------------------------------------------------------------ recipes
export type Rc =
  | { t: 'num'; v: number }
  /** a number printed in the stimulus text (heading / paragraph / column title) */
  | { t: 'txt'; v: number }
  /** table: rows[r][c]; bar/line: series[r].values[c]; pie: slices[c].value (r ignored) */
  | { t: 'ref'; p: number; r: number; c: number }
  /** table cell holding "a : b"; s picks the side */
  | { t: 'rat'; p: number; r: number; c: number; s: 0 | 1 }
  | { t: 'op'; o: '+' | '-' | '*' | '/'; a: Rc; b: Rc }

export interface V {
  val: Frac
  rc: Rc
}
export const lit = (n: number): V => ({ val: fdec(n, 2), rc: { t: 'num', v: n } })
export const txt = (n: number): V => ({ val: fdec(n, 2), rc: { t: 'txt', v: n } })
function bin(o: '+' | '-' | '*' | '/', a: V, b: V): V {
  const val = o === '+' ? fadd(a.val, b.val) : o === '-' ? fsub(a.val, b.val) : o === '*' ? fmul(a.val, b.val) : fdiv(a.val, b.val)
  return { val, rc: { t: 'op', o, a: a.rc, b: b.rc } }
}
const vadd = (a: V, b: V): V => bin('+', a, b)
const vsub = (a: V, b: V): V => bin('-', a, b)
const vmul = (a: V, b: V): V => bin('*', a, b)
const vdiv = (a: V, b: V): V => bin('/', a, b)
const vsum = (xs: V[]): V => xs.reduce(vadd)
const vavg = (xs: V[]): V => vdiv(vsum(xs), lit(xs.length))
/** x% of v */
const pctOf = (x: V, v: V): V => vdiv(vmul(v, x), lit(100))
/** a as a percentage of b */
const asPct = (a: V, b: V): V => vmul(vdiv(a, b), lit(100))
/** v increased by x% */
const upBy = (v: V, x: V): V => vdiv(vmul(v, vadd(lit(100), x)), lit(100))
/** v reduced by x% */
const downBy = (v: V, x: V): V => vdiv(vmul(v, vsub(lit(100), x)), lit(100))

export function readCell(st: Stimulus, p: number, r: number, c: number): Frac {
  const part = st.parts[p]
  let x: number | string
  if (part.kind === 'table') x = part.rows[r][c]
  else if (part.kind === 'bar' || part.kind === 'line') x = part.series[r].values[c]
  else if (part.kind === 'pie') x = part.slices[c].value
  else throw new Error('DI: ref into a text part')
  if (typeof x === 'number') return fdec(x, 2)
  const s = x.replace('−', '-').replace(/^\+/, '').replace(/%$/, '')
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`DI: non-numeric cell "${x}"`)
  return fdec(Number(s), 2)
}
export function readRat(st: Stimulus, p: number, r: number, c: number, s: 0 | 1): Frac {
  const part = st.parts[p]
  if (part.kind !== 'table') throw new Error('DI: ratio ref outside a table')
  const m = /^(\d+) : (\d+)$/.exec(String(part.rows[r][c]))
  if (!m) throw new Error(`DI: bad ratio cell "${part.rows[r][c]}"`)
  return F(Number(m[s + 1]))
}
export function evalRc(rc: Rc, st: Stimulus): Frac {
  switch (rc.t) {
    case 'num':
    case 'txt':
      return fdec(rc.v, 2)
    case 'ref':
      return readCell(st, rc.p, rc.r, rc.c)
    case 'rat':
      return readRat(st, rc.p, rc.r, rc.c, rc.s)
    case 'op': {
      const a = evalRc(rc.a, st)
      const b = evalRc(rc.b, st)
      return rc.o === '+' ? fadd(a, b) : rc.o === '-' ? fsub(a, b) : rc.o === '*' ? fmul(a, b) : fdiv(a, b)
    }
  }
}
function stimulusStrings(st: Stimulus): string[] {
  const out: string[] = []
  if (st.directions) out.push(st.directions)
  for (const p of st.parts) {
    if ('heading' in p && p.heading) out.push(p.heading)
    if (p.kind === 'text') out.push(...p.paragraphs)
    else if (p.kind === 'table') out.push(...p.columns, ...(p.note ? [p.note] : []))
    else if (p.kind === 'bar' || p.kind === 'line') out.push(...p.series.map((s) => s.name))
  }
  return out
}
function textHas(st: Stimulus, n: number): boolean {
  const re = new RegExp(`(^|[^\\d.])${String(n).replace('.', '\\.')}($|[^\\d]|\\.(?!\\d))`)
  return stimulusStrings(st).some((s) => re.test(s))
}
function checkTxt(rc: Rc, st: Stimulus): void {
  if (rc.t === 'txt') ensure(textHas(st, rc.v), `recipe uses ${rc.v} which is not printed in the stimulus text`)
  else if (rc.t === 'op') {
    checkTxt(rc.a, st)
    checkTxt(rc.b, st)
  }
}

// ------------------------------------------------------------------ small helpers
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
const listAnd = (xs: string[]): string => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
const n2 = (x: number): string => fmtNum(x, 2)
const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i)
const sumOf = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)
const two = (rng: Rng, n: number): [number, number] => {
  const [a, b] = rng.sample(range(n), 2)
  return [a, b]
}
/** k distinct indexes of 0..n-1, ascending */
const some = (rng: Rng, n: number, k: number): number[] => rng.sample(range(n), k).sort((x, y) => x - y)
/** contiguous run of `len` indexes inside 0..n-1 */
const run = (rng: Rng, n: number, len: number): number[] => {
  const s = rng.int(0, n - len)
  return Array.from({ length: len }, (_, i) => s + i)
}
const YEARS = ['2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023']
const yearsRun = (rng: Rng, len: number): string[] => {
  const s = rng.int(0, YEARS.length - len)
  return YEARS.slice(s, s + len)
}
const DIRS = {
  table: 'Study the following table carefully and answer the questions given below.',
  bar: 'Study the following bar graph(s) carefully and answer the questions given below.',
  pie: 'Study the following pie chart(s) carefully and answer the questions given below.',
  line: 'Study the following line graph(s) carefully and answer the questions given below.',
  mixed: 'Study the following information carefully and answer the questions given below.',
}
/** shares in multiples of 5 summing to 100, each in [min, max] */
function splitShares(rng: Rng, n: number, min: number, max: number): number[] {
  const out = Array.from({ length: n }, () => min)
  let units = (100 - n * min) / 5
  need(Number.isInteger(units) && units >= 0, 'bad share split')
  let guard = 0
  while (units > 0 && guard++ < 400) {
    const i = rng.int(0, n - 1)
    if (out[i] + 5 <= max) {
      out[i] += 5
      units--
    }
  }
  need(units === 0 && new Set(out).size >= 3, 'share split failed')
  return out
}

// ------------------------------------------------------------------ stimulus context
export interface Ctx {
  st: Stimulus
  ref: (p: number, r: number, c: number) => V
  rat: (p: number, r: number, c: number, s: 0 | 1) => V
}
const mkCtx = (st: Stimulus): Ctx => ({
  st,
  ref: (p, r, c) => ({ val: readCell(st, p, r, c), rc: { t: 'ref', p, r, c } }),
  rat: (p, r, c, s) => ({ val: readRat(st, p, r, c, s), rc: { t: 'rat', p, r, c, s } }),
})

// ------------------------------------------------------------------ question candidates and finishing
export interface Dq {
  id: string
  heavy?: boolean
  /** may contain {ly} (approximately ) and {adj} (approximate ), kept only when the exact value is not clean */
  stem: string
  kind: 'int' | 'dec' | 'pct' | 'ratio' | 'label'
  v?: V
  ratio?: [V, V]
  wrongR?: [number, number][]
  labels?: string[]
  lv?: V[]
  extreme?: 'max' | 'min'
  /** the answer computed straight from the hidden data (independent of the recipe) */
  expect: number | [number, number] | number[]
  wrong?: number[]
  why: string
  pre?: string
  post?: string
}
export interface DiMeta {
  id: string
  kind: 'value' | 'ratio' | 'label'
  rcs: Rc[]
  labels?: string[]
  extreme?: 'max' | 'min'
  approx?: boolean
  pre?: string
  post?: string
}
export const MAINS_DI_META = new WeakMap<object, DiMeta>()

function niceUnit(x: number): number {
  const p = 10 ** Math.floor(Math.log10(Math.max(x, 1e-9)))
  const m = x / p
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p
}

/** 5 numeric options (mistake values first, fillers after), correct position uniform. */
function numOptions(rng: Rng, ans: number, wrongs: number[], dec: number, minSep: number, pre: string, post: string): { options: string[]; answer: number } {
  const step = 10 ** -dec
  const sep = Math.max(minSep, step, Math.abs(ans) * 0.02)
  const ansS = fmtNum(ans, dec)
  const seen = new Set<string>([ansS])
  const mB: number[] = []
  const mA: number[] = []
  const fB: number[] = []
  const fA: number[] = []
  const add = (x: number, mist: boolean): void => {
    const v = roundTo(x, dec)
    if (!Number.isFinite(v) || v <= 0 || v > 1e9 || Math.abs(v - ans) < Math.max(minSep, step) - 1e-9) return
    const s = fmtNum(v, dec)
    if (seen.has(s)) return
    seen.add(s)
    ;(v < ans ? (mist ? mB : fB) : mist ? mA : fA).push(v)
  }
  for (const w of rng.shuffle(wrongs)) add(w, true)
  const unit = Math.max(sep, niceUnit(Math.abs(ans) * 0.06))
  const fill: number[] = []
  for (const k of [1, 2, 3, 4, 5, 6, 8]) fill.push(ans + unit * k, ans - unit * k)
  for (const rel of [0.05, 0.08, 0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4]) fill.push(ans * (1 + rel), ans * (1 - rel))
  for (const f of rng.shuffle(fill)) add(f, false)
  const pickSide = (m: number[], f: number[], k: number, taken: number[]): number[] | null => {
    const out: number[] = []
    for (const c of [...rng.shuffle(m), ...rng.shuffle(f)]) {
      if (out.length === k) break
      if (taken.every((t) => Math.abs(t - c) >= sep - 1e-9)) {
        out.push(c)
        taken.push(c)
      }
    }
    return out.length === k ? out : null
  }
  const asc = rng.chance(0.55)
  for (const t of rng.shuffle([0, 1, 2, 3, 4])) {
    if (t > mB.length + fB.length || 4 - t > mA.length + fA.length) continue
    const taken = [ans]
    const lo = pickSide(mB, fB, t, taken)
    const hi = pickSide(mA, fA, 4 - t, taken)
    if (!lo || !hi) continue
    let body = [ans, ...lo, ...hi]
    body = asc ? body.sort((a, b) => a - b) : rng.shuffle(body)
    const strs = body.map((x) => fmtNum(x, dec))
    return { options: strs.map((s) => pre + disp(s) + post), answer: strs.indexOf(ansS) }
  }
  throw new Reject('could not lay out options')
}

/** 5 text options: mistakes first, then fillers; shuffled. */
function strOptions(rng: Rng, correct: string, mistakes: string[], fillers: string[]): { options: string[]; answer: number } {
  const seen = new Set<string>([correct])
  const pool: string[] = []
  for (const s of [...rng.shuffle(mistakes), ...rng.shuffle(fillers)]) {
    if (!seen.has(s)) {
      seen.add(s)
      pool.push(s)
    }
  }
  need(pool.length >= 4, 'not enough text distractors')
  const options = rng.shuffle([correct, ...pool.slice(0, 4)])
  return { options, answer: options.indexOf(correct) }
}

function ratioFillers(a: number, b: number): string[] {
  const raw: [number, number][] = [[b, a], [a + 1, b], [a, b + 1], [a + 1, b + 1], [a + 2, b], [a, b + 2], [Math.max(1, a - 1), b], [a, Math.max(1, b - 1)], [a + b, b], [a, a + b], [2 * a, 3 * b + 1], [3 * a + 1, 2 * b]]
  return raw.map(([x, y]) => `${x / gcd(x, y)} : ${y / gcd(x, y)}`)
}

export function finishDq(rng: Rng, d: Dq, st: Stimulus, topic: QuantTopicId): QuestionDraft {
  const stripTokens = (s: string, approx: boolean): string => s.replace('{ly}', approx ? 'approximately ' : '').replace('{adj}', approx ? 'approximate ' : '')
  if (d.kind === 'ratio') {
    const [a, b] = d.ratio as [V, V]
    const [ea, eb] = d.expect as [number, number]
    ensure(feq(fdiv(a.val, b.val), F(ea, eb)), `${d.id}: ratio recipe disagrees with hidden data`)
    ensure(feq(evalRc(a.rc, st), a.val) && feq(evalRc(b.rc, st), b.val), `${d.id}: ratio recipe re-evaluation differs`)
    checkTxt(a.rc, st)
    checkTxt(b.rc, st)
    need(fint(a.val) && fint(b.val) && a.val.n > 0 && b.val.n > 0, 'ratio of non-integers')
    const g = gcd(a.val.n, b.val.n)
    const ra = a.val.n / g
    const rb = b.val.n / g
    need(ra <= 60 && rb <= 60 && ra !== rb, 'ugly ratio')
    const correct = `${ra} : ${rb}`
    const mist = (d.wrongR ?? []).filter(([x, y]) => x > 0 && y > 0).map(([x, y]) => `${x / gcd(x, y)} : ${y / gcd(x, y)}`)
    const { options, answer } = strOptions(rng, correct, mist, ratioFillers(ra, rb))
    const q: QuestionDraft = { topic, stem: stripTokens(d.stem, false), options, answer, explanation: `${d.why}\nRatio = ${a.val.n} : ${b.val.n} = ${correct}\n${answerLine({ options, answer, answerIsNone: false }, correct)}` }
    MAINS_DI_META.set(q, { id: d.id, kind: 'ratio', rcs: [a.rc, b.rc] })
    return q
  }
  if (d.kind === 'label') {
    const lv = d.lv as V[]
    const labels = d.labels as string[]
    const ex = d.expect as number[]
    ensure(lv.length === labels.length && ex.length === labels.length, `${d.id}: label arity`)
    lv.forEach((x, i) => {
      ensure(Math.abs(fval(x.val) - ex[i]) < 1e-9, `${d.id}: label value ${i} recipe ${fval(x.val)} != hidden ${ex[i]}`)
      ensure(feq(evalRc(x.rc, st), x.val), `${d.id}: label recipe re-evaluation differs`)
      checkTxt(x.rc, st)
    })
    const best = d.extreme === 'max' ? Math.max(...ex) : Math.min(...ex)
    need(ex.filter((x) => x === best).length === 1, 'tie for the extreme')
    const idx = ex.indexOf(best)
    // keep the answer clear of the runner-up
    const sorted = [...ex].sort((a, b) => (d.extreme === 'max' ? b - a : a - b))
    need(Math.abs(sorted[0] - sorted[1]) >= Math.abs(best) * 0.02, 'extreme too close to the runner-up')
    const correct = labels[idx]
    const others = labels.filter((_, i) => i !== idx)
    const { options, answer } = strOptions(rng, correct, others, [])
    const q: QuestionDraft = { topic, stem: stripTokens(d.stem, false), options, answer, explanation: `${d.why}\nThe ${d.extreme === 'max' ? 'highest' : 'lowest'} value is ${n2(best)}, for ${correct}.\n${answerLine({ options, answer, answerIsNone: false }, correct)}` }
    MAINS_DI_META.set(q, { id: d.id, kind: 'label', rcs: lv.map((x) => x.rc), labels, extreme: d.extreme })
    return q
  }
  const v = d.v as V
  const exp = d.expect as number
  ensure(Math.abs(fval(v.val) - exp) < 1e-9, `${d.id}: recipe value ${fval(v.val)} != hidden-data value ${exp}`)
  ensure(feq(evalRc(v.rc, st), v.val), `${d.id}: recipe re-evaluation differs`)
  checkTxt(v.rc, st)
  const ev = v.val
  need(ev.n > 0, 'non-positive answer')
  const post = d.post ?? (d.kind === 'pct' ? '%' : '')
  const pre = d.pre ?? ''
  let ans: number
  let dec = 0
  let approx = false
  if (d.kind === 'int') {
    need(fint(ev) && ev.n >= 2, 'not a clean integer')
    ans = ev.n
  } else if (d.kind === 'dec') {
    need(terminating(ev, 1), 'more than one decimal place')
    ans = fval(ev)
    dec = decOf(ev)
  } else if (terminating(ev, 1)) {
    need(fval(ev) < 1000, 'percent out of range')
    ans = fval(ev)
    dec = decOf(ev)
  } else {
    const x = fval(ev)
    need(d.stem.includes('{ly}') || d.stem.includes('{adj}'), 'inexact percent in an exact stem')
    need(Math.abs(x - Math.floor(x) - 0.5) >= 0.15 && Math.round(x) >= 10 && x < 1000, 'rounding too close to .5')
    ans = Math.round(x)
    approx = true
  }
  let wrongs = d.wrong ?? []
  if (approx) wrongs = wrongs.map((w) => Math.round(w)).filter((w) => Math.abs(w - ans) >= 2)
  const { options, answer } = numOptions(rng, ans, wrongs, dec, approx ? 2 : 0, pre, post)
  const shown = `${pre}${fmtNum(ans, dec)}${post}`
  const exact = fval(ev)
  const q: QuestionDraft = {
    topic,
    stem: stripTokens(d.stem, approx),
    options,
    answer,
    explanation: `${d.why}\n${approx ? `Exact value = ${n2(exact)}${post}, i.e. approximately ${shown}.\n` : ''}${answerLine({ options, answer, answerIsNone: false }, shown)}`,
  }
  MAINS_DI_META.set(q, { id: d.id, kind: 'value', rcs: [v.rc], approx, pre, post })
  return q
}

// ------------------------------------------------------------------ set assembly
export interface PoolItem {
  id: string
  heavy?: boolean
  make: () => Dq
}
export interface Scn {
  stimulus: Stimulus
  pool: PoolItem[]
}
const mk = (id: string, heavy: boolean, make: () => Dq): PoolItem => ({ id, heavy, make })

function buildSet(rng: Rng, topic: QuantTopicId, n: number, scn: Scn): Group {
  const chosen: QuestionDraft[] = []
  const used = new Set<string>()
  const tryMake = (p: PoolItem): boolean => {
    for (let i = 0; i < 10; i++) {
      try {
        const q = finishDq(rng, p.make(), scn.stimulus, topic)
        if (chosen.some((c) => c.stem === q.stem)) continue
        chosen.push(q)
        used.add(p.id)
        return true
      } catch (e) {
        if (!(e instanceof Reject)) throw e
      }
    }
    return false
  }
  const order = rng.shuffle(scn.pool)
  for (const p of order.filter((x) => x.heavy)) if (tryMake(p)) break
  need(chosen.length === 1, 'no heavy question could be built')
  for (const p of order) {
    if (chosen.length >= n) break
    if (!used.has(p.id)) tryMake(p)
  }
  need(chosen.length === n, 'not enough questions')
  return { stimulus: scn.stimulus, questions: rng.shuffle(chosen) }
}

export function mkGen(topic: QuantTopicId, scns: ((rng: Rng) => Scn)[]): TopicGenerator {
  return (rng, _d, count) => {
    const groups: Group[] = []
    let left = count
    const order = rng.shuffle(range(scns.length))
    let k = 0
    while (left > 0) {
      const n = Math.min(5, left)
      let made: Group | null = null
      for (let tries = 0; tries < 80 && !made; tries++) {
        const which = order[(k + (tries >= 30 ? tries : 0)) % order.length]
        try {
          made = buildSet(rng, topic, n, scns[which](rng))
        } catch (e) {
          if (!(e instanceof Reject)) throw e
        }
      }
      if (!made) throw new Error(`${topic}: could not build a ${n}-question set`)
      groups.push(made)
      left -= n
      k++
    }
    return groups
  }
}


// ================================================================== shared "population" model (table S1 and pie P1)
interface PopSkin {
  all: string
  m: string
  f: string
  okN: string
  okA: string
  catWord: string
  catPlural: string
  hdr: string
  cats: string[]
  title: string
  one: (c: string) => string
  many: (cs: string[]) => string
}
const TABLE_POP_SKINS: PopSkin[] = [
  { all: 'employees', m: 'male employees', f: 'female employees', okN: 'graduates', okA: 'graduates', catWord: 'branch', catPlural: 'branches', hdr: 'Branch', cats: ['Branch P', 'Branch Q', 'Branch R', 'Branch S', 'Branch T'], title: 'Details of the employees working in five branches of a bank', one: (c) => c, many: (cs) => listAnd(cs) },
  { all: 'students', m: 'boys', f: 'girls', okN: 'scholarship holders', okA: 'scholarship holders', catWord: 'school', catPlural: 'schools', hdr: 'School', cats: ['School A', 'School B', 'School C', 'School D', 'School E'], title: 'Details of the students studying in five schools of a city', one: (c) => c, many: (cs) => listAnd(cs) },
  { all: 'residents', m: 'men', f: 'women', okN: 'literate people', okA: 'literate', catWord: 'village', catPlural: 'villages', hdr: 'Village', cats: ['Village A', 'Village B', 'Village C', 'Village D', 'Village E'], title: 'Details of the residents of five villages of a block', one: (c) => c, many: (cs) => listAnd(cs) },
]
const PIE_POP_SKINS: PopSkin[] = [
  { all: 'employees', m: 'male employees', f: 'female employees', okN: 'graduates', okA: 'graduates', catWord: 'department', catPlural: 'departments', hdr: 'Department', cats: ['HR', 'Finance', 'Marketing', 'IT', 'Operations', 'Sales'], title: 'employees of a company working in different departments', one: (c) => `the ${c} department`, many: (cs) => `the ${listAnd(cs)} departments` },
  { all: 'students', m: 'boys', f: 'girls', okN: 'hostellers', okA: 'hostellers', catWord: 'stream', catPlural: 'streams', hdr: 'Stream', cats: ['Arts', 'Commerce', 'Science', 'Law', 'Engineering', 'Medicine'], title: 'students of a university studying in different streams', one: (c) => `the ${c} stream`, many: (cs) => `the ${listAnd(cs)} streams` },
]

interface PopRow {
  T: number
  a: number
  b: number
  x: number
  y: number
}
const POP_RATIOS: [number, number][] = [[3, 2], [2, 3], [3, 1], [1, 3], [4, 3], [3, 4], [5, 3], [3, 5], [5, 4], [4, 5], [7, 5], [5, 7], [2, 1], [1, 2], [7, 3], [5, 2], [4, 1], [9, 7], [8, 5]]
const POP_PCTS = [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80]
function popRow(rng: Rng, T: number): PopRow {
  for (let i = 0; i < 40; i++) {
    const [a, b] = rng.pick(POP_RATIOS)
    if ((T * a) % (a + b) !== 0) continue
    const M = (T * a) / (a + b)
    const Fm = T - M
    const xs = POP_PCTS.filter((p) => (M * p) % 100 === 0)
    const ys = POP_PCTS.filter((p) => (Fm * p) % 100 === 0)
    if (!xs.length || !ys.length) continue
    return { T, a, b, x: rng.pick(xs), y: rng.pick(ys) }
  }
  throw new Reject('no ratio fits')
}

/** |a - b| as a recipe (the larger first) */
function absDiff(a: V, b: V, ha: number, hb: number): V {
  return ha >= hb ? vsub(a, b) : vsub(b, a)
}

function popPool(rng: Rng, sk: PopSkin, cats: string[], rows: PopRow[], ctx: Ctx, TV: (r: number) => V, tLine: (r: number) => string, tp: number, colRat: number, colX: number, colY: number): PoolItem[] {
  const n = rows.length
  const ra = (r: number): V => ctx.rat(tp, r, colRat, 0)
  const rb = (r: number): V => ctx.rat(tp, r, colRat, 1)
  const xv = (r: number): V => ctx.ref(tp, r, colX)
  const yv = (r: number): V => ctx.ref(tp, r, colY)
  const Mv = (r: number): V => vdiv(vmul(TV(r), ra(r)), vadd(ra(r), rb(r)))
  const Fv = (r: number): V => vdiv(vmul(TV(r), rb(r)), vadd(ra(r), rb(r)))
  const MG = (r: number): V => pctOf(xv(r), Mv(r))
  const FG = (r: number): V => pctOf(yv(r), Fv(r))
  const hM = (r: number): number => (rows[r].T * rows[r].a) / (rows[r].a + rows[r].b)
  const hF = (r: number): number => rows[r].T - hM(r)
  const hMG = (r: number): number => (hM(r) * rows[r].x) / 100
  const hFG = (r: number): number => (hF(r) * rows[r].y) / 100
  const inC = (r: number): string => `in ${sk.one(cats[r])}`
  const splitLines = (r: number): string => `${tLine(r)}${cap(sk.m)} ${inC(r)} = ${rows[r].T} × ${rows[r].a}/${rows[r].a + rows[r].b} = ${hM(r)}\n${cap(sk.f)} ${inC(r)} = ${rows[r].T} − ${hM(r)} = ${hF(r)}`
  const gradLines = (r: number): string => `${cap(sk.m)} who are ${sk.okA} = ${rows[r].x}% of ${hM(r)} = ${hMG(r)}\n${cap(sk.f)} who are ${sk.okA} = ${rows[r].y}% of ${hF(r)} = ${hFG(r)}`
  const pick = (k: number): number[] => rng.sample(range(n), k)

  return [
    mk('grads', true, () => {
      const [r] = pick(1)
      const R = rows[r]
      const tot = hMG(r) + hFG(r)
      return {
        id: 'grads',
        stem: `What is the total number of ${sk.okN} ${inC(r)}?`,
        kind: 'int',
        v: vadd(MG(r), FG(r)),
        expect: tot,
        wrong: [(hF(r) * R.x) / 100 + (hM(r) * R.y) / 100, (R.T * (R.x + R.y)) / 200, hMG(r), hFG(r)],
        why: `${splitLines(r)}\n${gradLines(r)}\nTotal ${sk.okN} = ${hMG(r)} + ${hFG(r)} = ${tot}`,
      }
    }),
    mk('ratioGrad', true, () => {
      const [r1, r2] = pick(2)
      return {
        id: 'ratioGrad',
        stem: `What is the ratio of the number of ${sk.f} who are ${sk.okA} ${inC(r1)} to the number of ${sk.m} who are ${sk.okA} ${inC(r2)}?`,
        kind: 'ratio',
        ratio: [FG(r1), MG(r2)],
        expect: [hFG(r1), hMG(r2)],
        wrongR: [[hMG(r1), hFG(r2)], [hF(r1), hM(r2)], [hFG(r1), hMG(r1)], [hMG(r2), hFG(r1)]],
        why: `${splitLines(r1)}\n${cap(sk.f)} who are ${sk.okA} ${inC(r1)} = ${rows[r1].y}% of ${hF(r1)} = ${hFG(r1)}\n${splitLines(r2)}\n${cap(sk.m)} who are ${sk.okA} ${inC(r2)} = ${rows[r2].x}% of ${hM(r2)} = ${hMG(r2)}`,
      }
    }),
    mk('pctGrad', false, () => {
      const [r] = pick(1)
      const R = rows[r]
      const tot = hMG(r) + hFG(r)
      return {
        id: 'pctGrad',
        stem: `The number of ${sk.okN} ${inC(r)} is {ly}what percent of the total number of ${sk.all} ${inC(r)}?`,
        kind: 'pct',
        v: asPct(vadd(MG(r), FG(r)), TV(r)),
        expect: (tot * 100) / R.T,
        wrong: [(R.x + R.y) / 2, R.x, R.y, ((hF(r) * R.x) / 100 + (hM(r) * R.y) / 100) * (100 / R.T)],
        why: `${splitLines(r)}\n${gradLines(r)}\nTotal ${sk.okN} = ${hMG(r)} + ${hFG(r)} = ${tot}\nRequired % = ${tot}/${R.T} × 100 = ${n2((tot * 100) / R.T)}%`,
      }
    }),
    mk('diffM', true, () => {
      const [c1, c2, c3] = pick(3)
      const hv = hM(c1) + hM(c2)
      const hw = hF(c3)
      need(hv !== hw, 'equal')
      return {
        id: 'diffM',
        stem: `What is the difference between the total number of ${sk.m} in ${sk.many([cats[c1], cats[c2]])} together and the number of ${sk.f} ${inC(c3)}?`,
        kind: 'int',
        v: absDiff(vadd(Mv(c1), Mv(c2)), Fv(c3), hv, hw),
        expect: Math.abs(hv - hw),
        wrong: [hv + hw, hM(c1) + hM(c2) - hM(c3), Math.abs(hv - hF(c1) - hF(c2)), hv - hM(c3)],
        why: `${splitLines(c1)}\n${splitLines(c2)}\n${splitLines(c3)}\n${cap(sk.m)} in the first two = ${hM(c1)} + ${hM(c2)} = ${hv}\nDifference = |${hv} − ${hw}| = ${Math.abs(hv - hw)}`,
      }
    }),
    mk('nonGradF', false, () => {
      const [r] = pick(1)
      return {
        id: 'nonGradF',
        stem: `How many ${sk.f} ${inC(r)} are not ${sk.okA}?`,
        kind: 'int',
        v: vsub(Fv(r), FG(r)),
        expect: hF(r) - hFG(r),
        wrong: [hFG(r), hM(r) - hMG(r), hF(r) - hF(r) * rows[r].x / 100, hF(r)],
        why: `${splitLines(r)}\n${cap(sk.f)} who are ${sk.okA} = ${rows[r].y}% of ${hF(r)} = ${hFG(r)}\n${cap(sk.f)} who are not ${sk.okA} = ${hF(r)} − ${hFG(r)} = ${hF(r) - hFG(r)}`,
      }
    }),
    mk('maxGrad', false, () => {
      const hs = range(n).map(hMG)
      return {
        id: 'maxGrad',
        stem: `In which ${sk.catWord} is the number of ${sk.m} who are ${sk.okA} the highest?`,
        kind: 'label',
        labels: cats.slice(0, n),
        lv: range(n).map(MG),
        extreme: 'max',
        expect: hs,
        why: `${cap(sk.m)} who are ${sk.okA}, ${sk.catWord} by ${sk.catWord}: ${range(n).map((r) => `${cats[r]} = ${hMG(r)}`).join(', ')}`,
      }
    }),
    mk('avgF', true, () => {
      const tot = sumOf(range(n).map(hF))
      return {
        id: 'avgF',
        stem: `What is the average number of ${sk.f} per ${sk.catWord} over all the ${n} ${sk.catPlural}?`,
        kind: 'dec',
        v: vavg(range(n).map(Fv)),
        expect: tot / n,
        wrong: [tot / n + 1, sumOf(range(n).map(hM)) / n, tot, (sumOf(range(n).map((r) => rows[r].T)) / n) * 0.5],
        why: `${range(n).map((r) => `${cap(sk.f)} ${inC(r)} = ${rows[r].T} × ${rows[r].b}/${rows[r].a + rows[r].b} = ${hF(r)}`).join('\n')}\nTotal = ${range(n).map(hF).join(' + ')} = ${tot}\nAverage = ${tot}/${n} = ${n2(tot / n)}`,
      }
    }),
    mk('pctMaleAll', true, () => {
      const m = sumOf(range(n).map(hM))
      const t = sumOf(range(n).map((r) => rows[r].T))
      return {
        id: 'pctMaleAll',
        stem: `The total number of ${sk.m} in all the ${sk.catPlural} together is {ly}what percent of the total number of ${sk.all} in all the ${sk.catPlural}?`,
        kind: 'pct',
        v: asPct(vsum(range(n).map(Mv)), vsum(range(n).map(TV))),
        expect: (m * 100) / t,
        wrong: [(sumOf(range(n).map(hF)) * 100) / t, sumOf(range(n).map((r) => (rows[r].a * 100) / (rows[r].a + rows[r].b))) / n, (m * 100) / (t - m)],
        why: `${range(n).map((r) => `${cap(sk.m)} ${inC(r)} = ${rows[r].T} × ${rows[r].a}/${rows[r].a + rows[r].b} = ${hM(r)}`).join('\n')}\nTotal ${sk.m} = ${m}; total ${sk.all} = ${t}\nRequired % = ${m}/${t} × 100 = ${n2((m * 100) / t)}%`,
      }
    }),
    mk('pctMoreGrad', false, () => {
      const [r1, r2] = pick(2)
      const g1 = hMG(r1) + hFG(r1)
      const g2 = hMG(r2) + hFG(r2)
      need(g1 !== g2, 'equal')
      const more = g1 > g2
      const hi = Math.max(g1, g2)
      const lo = Math.min(g1, g2)
      return {
        id: 'pctMoreGrad',
        stem: `The number of ${sk.okN} ${inC(r1)} is {ly}what percent ${more ? 'more' : 'less'} than the number of ${sk.okN} ${inC(r2)}?`,
        kind: 'pct',
        v: more ? asPct(vsub(vadd(MG(r1), FG(r1)), vadd(MG(r2), FG(r2))), vadd(MG(r2), FG(r2))) : asPct(vsub(vadd(MG(r2), FG(r2)), vadd(MG(r1), FG(r1))), vadd(MG(r2), FG(r2))),
        expect: ((hi - lo) * 100) / g2,
        wrong: [((hi - lo) * 100) / g1, (g1 * 100) / g2, (g2 * 100) / g1],
        why: `${splitLines(r1)}\n${gradLines(r1)}\n${splitLines(r2)}\n${gradLines(r2)}\n${cap(sk.okN)}: ${g1} (${cats[r1]}) and ${g2} (${cats[r2]})\nRequired % = (${hi} − ${lo})/${g2} × 100 = ${n2(((hi - lo) * 100) / g2)}%`,
      }
    }),
  ]
}

function scnPopTable(rng: Rng): Scn {
  const sk = rng.pick(TABLE_POP_SKINS)
  const n = 5
  const rows = range(n).map(() => popRow(rng, rstep(rng, 300, 1600, 100)))
  const st: Stimulus = {
    directions: DIRS.table,
    parts: [
      {
        kind: 'table',
        heading: sk.title,
        columns: [sk.hdr, `Total ${sk.all}`, `Ratio of ${sk.m} to ${sk.f}`, `${cap(sk.m)} who are ${sk.okA}`, `${cap(sk.f)} who are ${sk.okA}`],
        rows: rows.map((R, i) => [sk.cats[i], R.T, `${R.a} : ${R.b}`, `${R.x}%`, `${R.y}%`]),
        note: `The last two columns give the percentage of ${sk.m} and of ${sk.f} of that ${sk.catWord} who are ${sk.okA}.`,
      },
    ],
  }
  const ctx = mkCtx(st)
  return { stimulus: st, pool: popPool(rng, sk, sk.cats, rows, ctx, (r) => ctx.ref(0, r, 1), () => '', 0, 2, 3, 4) }
}

// ================================================================== table S2: missing cells recovered from totals and a stated relation
const MISS_RELS: [number, number, number][] = [[20, 6, 5], [25, 5, 4], [50, 3, 2], [40, 7, 5], [60, 8, 5], [100, 2, 1], [75, 7, 4]]
function scnMissingTable(rng: Rng): Scn {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August']
  const skins = [
    { names: ['Product P', 'Product Q', 'Product R'], noun: 'units', title: 'Number of units of three products sold by a company during five consecutive months', sold: 'sold', pr: [20, 90] as [number, number], per: 'unit', hdr: 'Month' },
    { names: ['Mustard oil', 'Sunflower oil', 'Groundnut oil'], noun: 'litres', title: 'Quantity (in litres) of three edible oils sold by a store during five consecutive months', sold: 'sold', pr: [80, 180] as [number, number], per: 'litre', hdr: 'Month' },
  ]
  const sk = rng.pick(skins)
  const start = rng.int(0, MONTHS.length - 5)
  const months = MONTHS.slice(start, start + 5)
  const H: number[][] = range(5).map(() => range(3).map(() => rstep(rng, 150, 900, 10)))
  const order = rng.shuffle(range(5))
  const r2 = order[0]
  const singles = order.slice(1, 4)
  const rel = rng.pick(MISS_RELS)
  const [sa, sb, sk3] = rng.shuffle([0, 1, 2])
  const g = rstep(rng, 20, 160, 10)
  H[r2][sa] = rel[1] * g
  H[r2][sb] = rel[2] * g
  need(H[r2][sa] >= 150 && H[r2][sa] <= 950, 'pair out of range')
  const miss = range(5).map(() => [false, false, false])
  for (const r of singles) miss[r][rng.int(0, 2)] = true
  miss[r2][sa] = true
  miss[r2][sb] = true
  const prices = range(3).map(() => rstep(rng, sk.pr[0], sk.pr[1], 5))
  need(new Set(prices).size === 3, 'equal prices')
  const T = H.map(sumOf)
  const st: Stimulus = {
    directions: DIRS.mixed,
    parts: [
      {
        kind: 'table',
        heading: sk.title,
        columns: [sk.hdr, ...sk.names, 'Total'],
        rows: months.map((m, r) => [m, ...range(3).map((s) => (miss[r][s] ? '?' : H[r][s])), T[r]]),
        note: `'?' denotes a value that is not given; it can be worked out from the other information.`,
      },
      {
        kind: 'text',
        heading: 'Additional information',
        paragraphs: [
          `In ${months[r2]}, the number of ${sk.noun} of ${sk.names[sa]} ${sk.sold} was ${rel[0]}% more than the number of ${sk.noun} of ${sk.names[sb]} ${sk.sold}.`,
          `The selling price per ${sk.per} is ₹${prices[0]} for ${sk.names[0]}, ₹${prices[1]} for ${sk.names[1]} and ₹${prices[2]} for ${sk.names[2]}, and it remained the same in all the months.`,
        ],
      },
    ],
  }
  const ctx = mkCtx(st)
  const cell = (r: number, s: number): V => {
    if (!miss[r][s]) return ctx.ref(0, r, 1 + s)
    const tot = ctx.ref(0, r, 4)
    if (r !== r2) {
      const o = [0, 1, 2].filter((x) => x !== s)
      return vsub(tot, vadd(ctx.ref(0, r, 1 + o[0]), ctx.ref(0, r, 1 + o[1])))
    }
    const rest = vsub(tot, ctx.ref(0, r, 1 + sk3))
    return s === sa ? vdiv(vmul(rest, vadd(lit(100), txt(rel[0]))), vadd(lit(200), txt(rel[0]))) : vdiv(vmul(rest, lit(100)), vadd(lit(200), txt(rel[0])))
  }
  const price = (s: number): V => txt(prices[s])
  const rev = (r: number, s: number): V => vmul(cell(r, s), price(s))
  const hRev = (r: number, s: number): number => H[r][s] * prices[s]
  const mName = (r: number): string => months[r]
  const prodSum = (s: number, rs: number[]): number => sumOf(rs.map((r) => H[r][s]))
  const derive = (rs: number[]): string => {
    const lines: string[] = []
    for (const r of rs) {
      const gaps = range(3).filter((s) => miss[r][s])
      if (!gaps.length) continue
      if (r !== r2) {
        const s = gaps[0]
        const o = [0, 1, 2].filter((x) => x !== s)
        lines.push(`${mName(r)}: ${sk.names[s]} = Total − the other two = ${T[r]} − ${H[r][o[0]]} − ${H[r][o[1]]} = ${H[r][s]}`)
      } else {
        const restV = T[r] - H[r][sk3]
        lines.push(`${mName(r)}: ${sk.names[sa]} + ${sk.names[sb]} = ${T[r]} − ${H[r][sk3]} = ${restV}`)
        lines.push(`${sk.names[sa]} : ${sk.names[sb]} = ${100 + rel[0]} : 100 = ${rel[1]} : ${rel[2]}, so ${sk.names[sa]} = ${restV} × ${rel[1]}/${rel[1] + rel[2]} = ${H[r][sa]} and ${sk.names[sb]} = ${H[r][sb]}`)
      }
    }
    return lines.length ? `${lines.join('\n')}\n` : ''
  }
  const pool: PoolItem[] = [
    mk('totProd', true, () => {
      const s = rng.int(0, 2)
      const tot = prodSum(s, range(5))
      return {
        id: 'totProd',
        stem: `What is the total number of ${sk.noun} of ${sk.names[s]} ${sk.sold} over the five months?`,
        kind: 'int',
        v: vsum(range(5).map((r) => cell(r, s))),
        expect: tot,
        wrong: [sumOf(range(5).filter((r) => !miss[r][s]).map((r) => H[r][s])), tot / 5, tot + prodSum((s + 1) % 3, [r2])],
        why: `${derive(range(5))}${sk.names[s]}: ${range(5).map((r) => H[r][s]).join(' + ')} = ${tot}`,
      }
    }),
    mk('revMonth', true, () => {
      const r = rng.int(0, 4)
      const tot = sumOf(range(3).map((s) => hRev(r, s)))
      return {
        id: 'revMonth',
        stem: `What was the total revenue (in ₹) from the sale of all the three items in ${mName(r)}?`,
        kind: 'int',
        v: vsum(range(3).map((s) => rev(r, s))),
        expect: tot,
        wrong: [T[r] * (sumOf(prices) / 3), sumOf(range(3).filter((s) => !miss[r][s]).map((s) => hRev(r, s))), T[r] * prices[0]],
        why: `${derive([r])}${range(3).map((s) => `${sk.names[s]}: ${H[r][s]} × ₹${prices[s]} = ₹${hRev(r, s)}`).join('\n')}\nTotal revenue = ${range(3).map((s) => hRev(r, s)).join(' + ')} = ₹${tot}`,
        pre: '₹',
      }
    }),
    mk('pctShare', false, () => {
      const r = rng.int(0, 4)
      const s = rng.int(0, 2)
      return {
        id: 'pctShare',
        stem: `In ${mName(r)}, the number of ${sk.noun} of ${sk.names[s]} ${sk.sold} was {ly}what percent of the total ${sk.noun} of all the three items ${sk.sold} in that month?`,
        kind: 'pct',
        v: asPct(cell(r, s), ctx.ref(0, r, 4)),
        expect: (H[r][s] * 100) / T[r],
        wrong: [(H[r][s] * 100) / (T[r] - H[r][s]), (H[r][s] * 100) / T[r] + 5],
        why: `${derive([r])}${sk.names[s]} in ${mName(r)} = ${H[r][s]}; total = ${T[r]}\nRequired % = ${H[r][s]}/${T[r]} × 100 = ${n2((H[r][s] * 100) / T[r])}%`,
      }
    }),
    mk('diffMix', true, () => {
      const [r1, r2b] = two(rng, 5)
      const [s1, s2] = two(rng, 3)
      const hv = H[r1][s1] + H[r1][s2]
      const hw = H[r2b][s1]
      need(hv !== hw, 'equal')
      return {
        id: 'diffMix',
        stem: `What is the difference between the total number of ${sk.noun} of ${sk.names[s1]} and ${sk.names[s2]} together ${sk.sold} in ${mName(r1)} and the number of ${sk.noun} of ${sk.names[s1]} ${sk.sold} in ${mName(r2b)}?`,
        kind: 'int',
        v: absDiff(vadd(cell(r1, s1), cell(r1, s2)), cell(r2b, s1), hv, hw),
        expect: Math.abs(hv - hw),
        wrong: [hv + hw, Math.abs(T[r1] - hw), Math.abs(hv - H[r2b][s2])],
        why: `${derive([r1, r2b])}${sk.names[s1]} + ${sk.names[s2]} in ${mName(r1)} = ${H[r1][s1]} + ${H[r1][s2]} = ${hv}\n${sk.names[s1]} in ${mName(r2b)} = ${hw}\nDifference = |${hv} − ${hw}| = ${Math.abs(hv - hw)}`,
      }
    }),
    mk('avgPart', false, () => {
      const s = rng.int(0, 2)
      const rs = run(rng, 5, rng.int(3, 4))
      const tot = prodSum(s, rs)
      return {
        id: 'avgPart',
        stem: `What is the average number of ${sk.noun} of ${sk.names[s]} ${sk.sold} per month from ${mName(rs[0])} to ${mName(rs[rs.length - 1])}?`,
        kind: 'dec',
        v: vavg(rs.map((r) => cell(r, s))),
        expect: tot / rs.length,
        wrong: [tot, tot / 5, (tot - H[rs[0]][s]) / (rs.length - 1)],
        why: `${derive(rs)}${sk.names[s]}: ${rs.map((r) => H[r][s]).join(' + ')} = ${tot}\nAverage = ${tot}/${rs.length} = ${n2(tot / rs.length)}`,
      }
    }),
    mk('pctChange', false, () => {
      const r = rng.int(0, 3)
      const s = rng.int(0, 2)
      const a = H[r][s]
      const b = H[r + 1][s]
      need(a !== b, 'equal')
      const up = b > a
      return {
        id: 'pctChange',
        stem: `The number of ${sk.noun} of ${sk.names[s]} ${sk.sold} in ${mName(r + 1)} was {ly}what percent ${up ? 'more' : 'less'} than that in ${mName(r)}?`,
        kind: 'pct',
        v: up ? asPct(vsub(cell(r + 1, s), cell(r, s)), cell(r, s)) : asPct(vsub(cell(r, s), cell(r + 1, s)), cell(r, s)),
        expect: (Math.abs(b - a) * 100) / a,
        wrong: [(Math.abs(b - a) * 100) / b, (b * 100) / a],
        why: `${derive([r, r + 1])}${mName(r)}: ${a}; ${mName(r + 1)}: ${b}\nChange = ${Math.abs(b - a)}; % = ${Math.abs(b - a)}/${a} × 100 = ${n2((Math.abs(b - a) * 100) / a)}%`,
      }
    }),
    mk('ratioTot', true, () => {
      const [s1, s2] = two(rng, 3)
      const rs = run(rng, 5, rng.int(3, 4))
      const x = prodSum(s1, rs)
      const y = prodSum(s2, rs)
      return {
        id: 'ratioTot',
        stem: `What is the ratio of the total ${sk.noun} of ${sk.names[s1]} ${sk.sold} to the total ${sk.noun} of ${sk.names[s2]} ${sk.sold} from ${mName(rs[0])} to ${mName(rs[rs.length - 1])}?`,
        kind: 'ratio',
        ratio: [vsum(rs.map((r) => cell(r, s1))), vsum(rs.map((r) => cell(r, s2)))],
        expect: [x, y],
        wrongR: [[y, x], [x, T[rs[0]]], [prodSum(s1, [rs[0]]), prodSum(s2, [rs[0]])]],
        why: `${derive(rs)}${sk.names[s1]}: ${rs.map((r) => H[r][s1]).join(' + ')} = ${x}\n${sk.names[s2]}: ${rs.map((r) => H[r][s2]).join(' + ')} = ${y}`,
      }
    }),
    mk('maxRev', true, () => {
      const hs = range(5).map((r) => sumOf(range(3).map((s) => hRev(r, s))))
      return {
        id: 'maxRev',
        stem: 'In which month was the total revenue from the sale of the three items the highest?',
        kind: 'label',
        labels: months,
        lv: range(5).map((r) => vsum(range(3).map((s) => rev(r, s)))),
        extreme: 'max',
        expect: hs,
        why: `${derive(range(5))}Revenue (₹): ${range(5).map((r) => `${mName(r)} = ${hs[r]}`).join(', ')}`,
      }
    }),
  ]
  return { stimulus: st, pool }
}

// ================================================================== table S3: cost price, profit % and units sold
function scnShopTable(rng: Rng): Scn {
  const skins = [
    { hdr: 'Shop', names: ['Shop A', 'Shop B', 'Shop C', 'Shop D', 'Shop E'], one: 'shop', many: 'shops', item: 'article', items: 'articles', title: 'Details of the articles sold by five shops in a month', cpH: 'Cost price per article (₹)', pH: 'Profit on each article (%)', nH: 'Number of articles sold', exp: 'rent and salaries' },
    { hdr: 'Company', names: ['Company P', 'Company Q', 'Company R', 'Company S', 'Company T'], one: 'company', many: 'companies', item: 'unit', items: 'units', title: 'Details of the units sold by five companies in a year', cpH: 'Cost price per unit (₹)', pH: 'Profit on each unit (%)', nH: 'Number of units sold', exp: 'overheads' },
  ]
  const sk = rng.pick(skins)
  const n = 5
  const cp = range(n).map(() => rstep(rng, 100, 500, 20))
  const pp = range(n).map(() => rstep(rng, 10, 50, 5))
  const qty = range(n).map(() => rstep(rng, 100, 600, 20))
  const fixed = rstep(rng, 5000, 20000, 1000)
  const st: Stimulus = {
    directions: DIRS.mixed,
    parts: [
      { kind: 'table', heading: sk.title, columns: [sk.hdr, sk.cpH, sk.pH, sk.nH], rows: range(n).map((r) => [sk.names[r], cp[r], `${pp[r]}%`, qty[r]]) },
      { kind: 'text', paragraphs: [`Every ${sk.one} had to pay ₹${fixed} as ${sk.exp}, which is deducted from its total profit to get the net profit.`] },
    ],
  }
  const ctx = mkCtx(st)
  const c = (r: number): V => ctx.ref(0, r, 1)
  const p = (r: number): V => ctx.ref(0, r, 2)
  const q = (r: number): V => ctx.ref(0, r, 3)
  const costV = (r: number): V => vmul(c(r), q(r))
  const profV = (r: number): V => pctOf(p(r), costV(r))
  const revV = (r: number): V => vadd(costV(r), profV(r))
  const hCost = (r: number): number => cp[r] * qty[r]
  const hProf = (r: number): number => (hCost(r) * pp[r]) / 100
  const hRev = (r: number): number => hCost(r) + hProf(r)
  const nm = (r: number): string => sk.names[r]
  const costLine = (r: number): string => `${nm(r)}: cost = ${cp[r]} × ${qty[r]} = ₹${hCost(r)}; profit = ${pp[r]}% of ${hCost(r)} = ₹${hProf(r)}; revenue = ₹${hRev(r)}`
  const pool: PoolItem[] = [
    mk('profitShop', true, () => {
      const r = rng.int(0, n - 1)
      return {
        id: 'profitShop',
        stem: `What is the total profit earned by ${nm(r)} on all the ${sk.items} it sold?`,
        kind: 'int',
        v: profV(r),
        expect: hProf(r),
        wrong: [(cp[r] * pp[r]) / 100, qty[r] * pp[r], hRev(r), hCost(r)],
        why: `Total cost = ${cp[r]} × ${qty[r]} = ₹${hCost(r)}\nProfit = ${pp[r]}% of ${hCost(r)} = ₹${hProf(r)}`,
        pre: '₹',
      }
    }),
    mk('totRev', true, () => {
      const [r1, r2] = two(rng, n)
      return {
        id: 'totRev',
        stem: `What is the total revenue (selling price of all ${sk.items} sold) of ${nm(r1)} and ${nm(r2)} together?`,
        kind: 'int',
        v: vadd(revV(r1), revV(r2)),
        expect: hRev(r1) + hRev(r2),
        wrong: [hProf(r1) + hProf(r2), hCost(r1) + hCost(r2), hRev(r1) - hRev(r2)],
        why: `${costLine(r1)}\n${costLine(r2)}\nTotal revenue = ${hRev(r1)} + ${hRev(r2)} = ₹${hRev(r1) + hRev(r2)}`,
        pre: '₹',
      }
    }),
    mk('ratioRevCost', true, () => {
      const [r1, r2] = two(rng, n)
      return {
        id: 'ratioRevCost',
        stem: `What is the ratio of the total revenue of ${nm(r1)} to the total cost price of all ${sk.items} sold by ${nm(r2)}?`,
        kind: 'ratio',
        ratio: [revV(r1), costV(r2)],
        expect: [hRev(r1), hCost(r2)],
        wrongR: [[hCost(r1), hCost(r2)], [hRev(r1), hRev(r2)], [hProf(r1), hCost(r2)]],
        why: `${costLine(r1)}\nTotal cost of ${nm(r2)} = ${cp[r2]} × ${qty[r2]} = ₹${hCost(r2)}`,
      }
    }),
    mk('pctProfitAll', true, () => {
      const pr = sumOf(range(n).map(hProf))
      const co = sumOf(range(n).map(hCost))
      return {
        id: 'pctProfitAll',
        stem: `What is the {adj}overall profit percentage of all the five ${sk.many} taken together?`,
        kind: 'pct',
        v: asPct(vsum(range(n).map(profV)), vsum(range(n).map(costV))),
        expect: (pr * 100) / co,
        wrong: [sumOf(pp) / n, (pr * 100) / (co + pr), (pr * 100) / sumOf(qty)],
        why: `${range(n).map((r) => `${nm(r)}: cost = ₹${hCost(r)}, profit = ₹${hProf(r)}`).join('\n')}\nTotal cost = ₹${co}; total profit = ₹${pr}\nOverall profit % = ${pr}/${co} × 100 = ${n2((pr * 100) / co)}%`,
      }
    }),
    mk('netProfit', false, () => {
      const r = rng.int(0, n - 1)
      need(hProf(r) > fixed, 'profit below fixed expense')
      return {
        id: 'netProfit',
        stem: `What is the net profit of ${nm(r)} after paying the fixed expenses?`,
        kind: 'int',
        v: vsub(profV(r), txt(fixed)),
        expect: hProf(r) - fixed,
        wrong: [hProf(r), hProf(r) + fixed, hRev(r) - fixed],
        why: `Total cost = ${cp[r]} × ${qty[r]} = ₹${hCost(r)}\nProfit = ${pp[r]}% of ${hCost(r)} = ₹${hProf(r)}\nNet profit = ${hProf(r)} − ${fixed} = ₹${hProf(r) - fixed}`,
        pre: '₹',
      }
    }),
    mk('maxProfit', false, () => ({
      id: 'maxProfit',
      stem: `Which ${sk.one} earned the highest total profit?`,
      kind: 'label',
      labels: sk.names,
      lv: range(n).map(profV),
      extreme: 'max',
      expect: range(n).map(hProf),
      why: range(n).map((r) => `${nm(r)}: ${cp[r]} × ${qty[r]} × ${pp[r]}% = ₹${hProf(r)}`).join('\n'),
    })),
    mk('whatIfPrice', false, () => {
      const r = rng.int(0, n - 1)
      const k = rng.pick([10, 20])
      const newP = ((100 + pp[r]) * (100 + k)) / 100 - 100
      return {
        id: 'whatIfPrice',
        stem: `If ${nm(r)} had raised its selling price per ${sk.item} by ${k}% (the cost price and the number of ${sk.items} sold remaining the same), what would its profit percentage have been?`,
        kind: 'pct',
        v: vsub(vdiv(vmul(vadd(lit(100), p(r)), lit(100 + k)), lit(100)), lit(100)),
        expect: newP,
        wrong: [pp[r] + k, pp[r] * (1 + k / 100), k],
        why: `Let the cost price per ${sk.item} be ₹100; the old selling price = ₹${100 + pp[r]}\nNew selling price = ${100 + pp[r]} × ${100 + k}/100 = ₹${n2(((100 + pp[r]) * (100 + k)) / 100)}\nNew profit % = ${n2(((100 + pp[r]) * (100 + k)) / 100)} − 100 = ${n2(newP)}%`,
        post: '%',
      }
    }),
    mk('pctMoreProfit', false, () => {
      const [r1, r2] = two(rng, n)
      need(hProf(r1) !== hProf(r2), 'equal')
      const hi = Math.max(hProf(r1), hProf(r2))
      const lo = Math.min(hProf(r1), hProf(r2))
      const more = hProf(r1) > hProf(r2)
      return {
        id: 'pctMoreProfit',
        stem: `The total profit of ${nm(r1)} is {ly}what percent ${more ? 'more' : 'less'} than that of ${nm(r2)}?`,
        kind: 'pct',
        v: more ? asPct(vsub(profV(r1), profV(r2)), profV(r2)) : asPct(vsub(profV(r2), profV(r1)), profV(r2)),
        expect: ((hi - lo) * 100) / hProf(r2),
        wrong: [((hi - lo) * 100) / hProf(r1), (hProf(r1) * 100) / hProf(r2)],
        why: `${nm(r1)}: profit = ${cp[r1]} × ${qty[r1]} × ${pp[r1]}% = ₹${hProf(r1)}\n${nm(r2)}: profit = ${cp[r2]} × ${qty[r2]} × ${pp[r2]}% = ₹${hProf(r2)}\nRequired % = (${hi} − ${lo})/${hProf(r2)} × 100 = ${n2(((hi - lo) * 100) / hProf(r2))}%`,
      }
    }),
  ]
  return { stimulus: st, pool }
}

// ================================================================== bar B1: total bar + (percentage, percentage-of-percentage) bar
interface BarSkin {
  prep: string
  catWord: string
  catPlural: string
  cats: string[]
  N: string
  P: string
  Q: string
  notP: string
  notQ: string
  Pverb: string
  h0: string
  h1: string
  s0: string
  s1: string
  s2: string
}
const BAR_SKINS: BarSkin[] = [
  { prep: 'in', catWord: 'city', catPlural: 'cities', cats: ['Delhi', 'Mumbai', 'Chennai', 'Kolkata', 'Pune', 'Jaipur', 'Lucknow'], N: 'candidates who appeared', P: 'qualified candidates', Q: 'qualified girls', notP: 'candidates who did not qualify', notQ: 'qualified boys', Pverb: 'qualified', h0: 'Number of candidates who appeared in a recruitment exam from five cities', h1: 'Percentage of appeared candidates who qualified, and percentage of girls among the qualified candidates', s0: 'Candidates appeared', s1: 'Qualified (% of appeared)', s2: 'Girls (% of qualified)' },
  { prep: 'at', catWord: 'plant', catPlural: 'plants', cats: ['Plant A', 'Plant B', 'Plant C', 'Plant D', 'Plant E', 'Plant F'], N: 'items manufactured', P: 'items that passed the quality test', Q: 'passed items that were exported', notP: 'items that failed the quality test', notQ: 'passed items that were not exported', Pverb: 'passed the quality test', h0: 'Number of items manufactured at five plants of a company in a month', h1: 'Percentage of items that passed the quality test, and percentage of passed items that were exported', s0: 'Items manufactured', s1: 'Passed (% of manufactured)', s2: 'Exported (% of passed)' },
  { prep: 'in', catWord: 'college', catPlural: 'colleges', cats: ['College A', 'College B', 'College C', 'College D', 'College E', 'College F'], N: 'students enrolled', P: 'placed students', Q: 'placed students with an overseas offer', notP: 'students who were not placed', notQ: 'placed students without an overseas offer', Pverb: 'were placed', h0: 'Number of final-year students enrolled in five colleges', h1: 'Percentage of students placed, and percentage of placed students with an overseas offer', s0: 'Students enrolled', s1: 'Placed (% of enrolled)', s2: 'Overseas offer (% of placed)' },
]

function scnLinkedBars(rng: Rng): Scn {
  const sk = rng.pick(BAR_SKINS)
  const n = 5
  const idx = some(rng, sk.cats.length, n)
  const cats = idx.map((i) => sk.cats[i])
  const N = range(n).map(() => rstep(rng, 2000, 8000, 400))
  const p = range(n).map(() => rstep(rng, 20, 80, 5))
  const q = range(n).map(() => rstep(rng, 20, 80, 5))
  const st: Stimulus = {
    directions: DIRS.bar,
    parts: [
      { kind: 'bar', heading: sk.h0, categories: cats, series: [{ name: sk.s0, values: N }] },
      { kind: 'bar', heading: sk.h1, categories: cats, series: [{ name: sk.s1, values: p }, { name: sk.s2, values: q }], unit: 'in %' },
    ],
  }
  const ctx = mkCtx(st)
  const Nv = (c: number): V => ctx.ref(0, 0, c)
  const Pv = (c: number): V => pctOf(ctx.ref(1, 0, c), Nv(c))
  const Qv = (c: number): V => pctOf(ctx.ref(1, 1, c), Pv(c))
  const hP = (c: number): number => (N[c] * p[c]) / 100
  const hQ = (c: number): number => (hP(c) * q[c]) / 100
  const at = (c: number): string => `${sk.prep} ${cats[c]}`
  const lineP = (c: number): string => `${cats[c]}: ${sk.P} = ${p[c]}% of ${N[c]} = ${hP(c)}`
  const lineQ = (c: number): string => `${cats[c]}: ${sk.Q} = ${q[c]}% of ${hP(c)} = ${hQ(c)}`
  const pool: PoolItem[] = [
    mk('notQ', true, () => {
      const [c] = rng.sample(range(n), 1)
      return {
        id: 'notQ',
        stem: `How many ${sk.notQ} are there ${at(c)}?`,
        kind: 'int',
        v: vsub(Pv(c), Qv(c)),
        expect: hP(c) - hQ(c),
        wrong: [hQ(c), (N[c] * (100 - q[c])) / 100, hP(c), N[c] - hQ(c)],
        why: `${lineP(c)}\n${lineQ(c)}\n${cap(sk.notQ)} = ${hP(c)} − ${hQ(c)} = ${hP(c) - hQ(c)}`,
      }
    }),
    mk('pctQofN', false, () => {
      const [c1, c2] = two(rng, n)
      return {
        id: 'pctQofN',
        stem: `The number of ${sk.Q} ${at(c1)} is {ly}what percent of the number of ${sk.N} ${at(c2)}?`,
        kind: 'pct',
        v: asPct(Qv(c1), Nv(c2)),
        expect: (hQ(c1) * 100) / N[c2],
        wrong: [(hQ(c1) * 100) / hP(c2), (hP(c1) * 100) / N[c2], (hQ(c1) * 100) / N[c1]],
        why: `${lineP(c1)}\n${lineQ(c1)}\n${sk.N} ${at(c2)} = ${N[c2]}\nRequired % = ${hQ(c1)}/${N[c2]} × 100 = ${n2((hQ(c1) * 100) / N[c2])}%`,
      }
    }),
    mk('ratioP', true, () => {
      const [c1, c2] = two(rng, n)
      return {
        id: 'ratioP',
        stem: `What is the ratio of the number of ${sk.P} ${at(c1)} to the number of ${sk.P} ${at(c2)}?`,
        kind: 'ratio',
        ratio: [Pv(c1), Pv(c2)],
        expect: [hP(c1), hP(c2)],
        wrongR: [[hP(c2), hP(c1)], [N[c1], N[c2]], [hQ(c1), hQ(c2)]],
        why: `${lineP(c1)}\n${lineP(c2)}`,
      }
    }),
    mk('diffSum', true, () => {
      const [c1, c2, c3] = rng.sample(range(n), 3)
      const hv = hP(c1) + hP(c2)
      const hw = hQ(c3)
      need(hv !== hw, 'equal')
      return {
        id: 'diffSum',
        stem: `What is the difference between the total number of ${sk.P} ${sk.prep} ${listAnd([cats[c1], cats[c2]])} together and the number of ${sk.Q} ${at(c3)}?`,
        kind: 'int',
        v: absDiff(vadd(Pv(c1), Pv(c2)), Qv(c3), hv, hw),
        expect: Math.abs(hv - hw),
        wrong: [hv + hw, Math.abs(hv - hP(c3)), Math.abs(N[c1] + N[c2] - hw)],
        why: `${lineP(c1)}\n${lineP(c2)}\n${lineP(c3)}\n${lineQ(c3)}\nDifference = |${hP(c1)} + ${hP(c2)} − ${hw}| = ${Math.abs(hv - hw)}`,
      }
    }),
    mk('avgQ', true, () => {
      const tot = sumOf(range(n).map(hQ))
      return {
        id: 'avgQ',
        stem: `What is the average number of ${sk.Q} per ${sk.catWord} over the five ${sk.catPlural}?`,
        kind: 'dec',
        v: vavg(range(n).map(Qv)),
        expect: tot / n,
        wrong: [sumOf(range(n).map(hP)) / n, tot, tot / (n - 1)],
        why: `${range(n).map((c) => `${cats[c]}: ${hP(c)} × ${q[c]}% = ${hQ(c)}`).join('\n')}\nTotal = ${range(n).map(hQ).join(' + ')} = ${tot}\nAverage = ${tot}/${n} = ${n2(tot / n)}`,
      }
    }),
    mk('maxQ', false, () => ({
      id: 'maxQ',
      stem: `Which ${sk.catWord} has the maximum number of ${sk.Q}?`,
      kind: 'label',
      labels: cats,
      lv: range(n).map(Qv),
      extreme: 'max',
      expect: range(n).map(hQ),
      why: range(n).map((c) => `${cats[c]}: ${N[c]} × ${p[c]}% × ${q[c]}% = ${hQ(c)}`).join('\n'),
    })),
    mk('overallPct', true, () => {
      const pt = sumOf(range(n).map(hP))
      const nt = sumOf(N)
      return {
        id: 'overallPct',
        stem: `What percent of the total number of ${sk.N} ${sk.prep} all the five ${sk.catPlural} together ${sk.Pverb}?`,
        kind: 'pct',
        v: asPct(vsum(range(n).map(Pv)), vsum(range(n).map(Nv))),
        expect: (pt * 100) / nt,
        wrong: [sumOf(p) / n, (pt * 100) / (nt - pt), (sumOf(range(n).map(hQ)) * 100) / nt],
        why: `${range(n).map(lineP).join('\n')}\nTotal ${sk.P} = ${pt}; total ${sk.N} = ${nt}\nRequired % = ${pt}/${nt} × 100 = ${n2((pt * 100) / nt)}%`,
      }
    }),
    mk('notPsum', true, () => {
      const [c1, c2] = two(rng, n)
      const hv = N[c1] - hP(c1) + N[c2] - hP(c2)
      return {
        id: 'notPsum',
        stem: `What is the total number of ${sk.notP} ${sk.prep} ${listAnd([cats[c1], cats[c2]])} together?`,
        kind: 'int',
        v: vadd(vsub(Nv(c1), Pv(c1)), vsub(Nv(c2), Pv(c2))),
        expect: hv,
        wrong: [hP(c1) + hP(c2), hv - hQ(c1), N[c1] + N[c2] - hQ(c1) - hQ(c2)],
        why: `${lineP(c1)}\n${lineP(c2)}\n${cap(sk.notP)} = (${N[c1]} − ${hP(c1)}) + (${N[c2]} − ${hP(c2)}) = ${hv}`,
      }
    }),
  ]
  return { stimulus: st, pool }
}

// ================================================================== bar B2: stacked bar + unit prices and commission in the text
const BAR2_SKINS = [
  { title: 'Number of water bottles of two sizes sold by a distributor', names: ['Small bottles', 'Large bottles'], unit: 'bottles', one: 'bottle', verb: 'sold', pr: [10, 40] as [number, number] },
  { title: 'Number of notebooks of two types sold by a stationer', names: ['Ruled notebooks', 'Plain notebooks'], unit: 'notebooks', one: 'notebook', verb: 'sold', pr: [20, 70] as [number, number] },
  { title: 'Number of T-shirts of two types manufactured and sold by a garment unit', names: ['Round-neck T-shirts', 'Polo T-shirts'], unit: 'T-shirts', one: 'T-shirt', verb: 'sold', pr: [100, 250] as [number, number] },
]
function scnStackedBar(rng: Rng): Scn {
  const sk = rng.pick(BAR2_SKINS)
  const n = 5
  const years = yearsRun(rng, n)
  const A = range(n).map(() => rstep(rng, 800, 3000, 100))
  const B = range(n).map(() => rstep(rng, 800, 3000, 100))
  const pa = rstep(rng, sk.pr[0], sk.pr[1], 5)
  let pb = rstep(rng, sk.pr[0], sk.pr[1], 5)
  if (pb === pa) pb += 5
  const com = rng.pick([10, 20, 25])
  const st: Stimulus = {
    directions: DIRS.mixed,
    parts: [
      { kind: 'bar', heading: `${sk.title} (stacked bar graph)`, categories: years, series: [{ name: sk.names[0], values: A }, { name: sk.names[1], values: B }], stacked: true, unit: sk.unit },
      { kind: 'text', paragraphs: [`The price of one unit was ₹${pa} for ${sk.names[0].toLowerCase()} and ₹${pb} for ${sk.names[1].toLowerCase()} in all the years. A commission of ${com}% of the total revenue of every year is paid to the sales staff.`] },
    ],
  }
  const ctx = mkCtx(st)
  const a = (y: number): V => ctx.ref(0, 0, y)
  const b = (y: number): V => ctx.ref(0, 1, y)
  const revA = (y: number): V => vmul(a(y), txt(pa))
  const revB = (y: number): V => vmul(b(y), txt(pb))
  const rev = (y: number): V => vadd(revA(y), revB(y))
  const hRev = (y: number): number => A[y] * pa + B[y] * pb
  const nm = sk.names.map((x) => x.toLowerCase())
  const pool: PoolItem[] = [
    mk('netRev', true, () => {
      const y = rng.int(0, n - 1)
      const net = (hRev(y) * (100 - com)) / 100
      return {
        id: 'netRev',
        stem: `What was the net revenue (in ₹) of ${years[y]} after paying the commission?`,
        kind: 'int',
        v: downBy(rev(y), txt(com)),
        expect: net,
        wrong: [hRev(y), hRev(y) * (1 + com / 100), (A[y] + B[y]) * ((pa + pb) / 2) * (1 - com / 100), hRev(y) - com],
        why: `Revenue from ${nm[0]} = ${A[y]} × ${pa} = ₹${A[y] * pa}\nRevenue from ${nm[1]} = ${B[y]} × ${pb} = ₹${B[y] * pb}\nTotal revenue = ₹${hRev(y)}\nNet revenue = ${hRev(y)} × ${100 - com}/100 = ₹${net}`,
        pre: '₹',
      }
    }),
    mk('ratioRev', true, () => {
      const [y1, y2] = two(rng, n)
      return {
        id: 'ratioRev',
        stem: `What is the ratio of the revenue from ${nm[0]} in ${years[y1]} to the revenue from ${nm[1]} in ${years[y2]}?`,
        kind: 'ratio',
        ratio: [revA(y1), revB(y2)],
        expect: [A[y1] * pa, B[y2] * pb],
        wrongR: [[A[y1], B[y2]], [A[y2] * pa, B[y1] * pb], [B[y2] * pb, A[y1] * pa]],
        why: `Revenue from ${nm[0]} in ${years[y1]} = ${A[y1]} × ${pa} = ₹${A[y1] * pa}\nRevenue from ${nm[1]} in ${years[y2]} = ${B[y2]} × ${pb} = ₹${B[y2] * pb}`,
      }
    }),
    mk('pctGrowth', false, () => {
      const [y1, y2] = two(rng, n)
      const t1 = A[y1] + B[y1]
      const t2 = A[y2] + B[y2]
      need(t1 !== t2, 'equal')
      const up = t2 > t1
      return {
        id: 'pctGrowth',
        stem: `The total number of ${sk.unit} ${sk.verb} in ${years[y2]} was {ly}what percent ${up ? 'more' : 'less'} than that in ${years[y1]}?`,
        kind: 'pct',
        v: up ? asPct(vsub(vadd(a(y2), b(y2)), vadd(a(y1), b(y1))), vadd(a(y1), b(y1))) : asPct(vsub(vadd(a(y1), b(y1)), vadd(a(y2), b(y2))), vadd(a(y1), b(y1))),
        expect: (Math.abs(t2 - t1) * 100) / t1,
        wrong: [(Math.abs(t2 - t1) * 100) / t2, (t2 * 100) / t1, (Math.abs(A[y2] - A[y1]) * 100) / A[y1]],
        why: `${years[y1]}: ${A[y1]} + ${B[y1]} = ${t1}\n${years[y2]}: ${A[y2]} + ${B[y2]} = ${t2}\nRequired % = ${Math.abs(t2 - t1)}/${t1} × 100 = ${n2((Math.abs(t2 - t1) * 100) / t1)}%`,
      }
    }),
    mk('diffRange', true, () => {
      const ys = run(rng, n, rng.int(3, 4))
      const sa = sumOf(ys.map((y) => A[y]))
      const sb = sumOf(ys.map((y) => B[y]))
      need(sa !== sb, 'equal')
      return {
        id: 'diffRange',
        stem: `What is the difference between the total number of ${nm[0]} and the total number of ${nm[1]} ${sk.verb} from ${years[ys[0]]} to ${years[ys[ys.length - 1]]}?`,
        kind: 'int',
        v: absDiff(vsum(ys.map(a)), vsum(ys.map(b)), sa, sb),
        expect: Math.abs(sa - sb),
        wrong: [sa + sb, Math.abs(sa - sb) / ys.length, Math.abs(sa - sb) + (A[ys[0]] - B[ys[0]])],
        why: `${cap(nm[0])}: ${ys.map((y) => A[y]).join(' + ')} = ${sa}\n${cap(nm[1])}: ${ys.map((y) => B[y]).join(' + ')} = ${sb}\nDifference = |${sa} − ${sb}| = ${Math.abs(sa - sb)}`,
      }
    }),
    mk('avgBoth', false, () => {
      const tot = sumOf(A) + sumOf(B)
      return {
        id: 'avgBoth',
        stem: `What is the average annual number of ${sk.unit} (both types together) ${sk.verb} over the five years?`,
        kind: 'dec',
        v: vavg(range(n).map((y) => vadd(a(y), b(y)))),
        expect: tot / n,
        wrong: [tot, tot / (2 * n), sumOf(A) / n],
        why: `Total = (${A.join(' + ')}) + (${B.join(' + ')}) = ${sumOf(A)} + ${sumOf(B)} = ${tot}\nAverage = ${tot}/${n} = ${n2(tot / n)}`,
      }
    }),
    mk('shareB', true, () => {
      const sa = sumOf(A)
      const sb = sumOf(B)
      return {
        id: 'shareB',
        stem: `The total number of ${nm[1]} ${sk.verb} in the five years is {ly}what percent of the total number of ${sk.unit} (both types) ${sk.verb} in these years?`,
        kind: 'pct',
        v: asPct(vsum(range(n).map(b)), vadd(vsum(range(n).map(a)), vsum(range(n).map(b)))),
        expect: (sb * 100) / (sa + sb),
        wrong: [(sb * 100) / sa, (sa * 100) / (sa + sb), (sb * 100) / (sa + sb) + 5],
        why: `Total ${nm[1]} = ${B.join(' + ')} = ${sb}\nTotal ${nm[0]} = ${A.join(' + ')} = ${sa}\nRequired % = ${sb}/(${sa} + ${sb}) × 100 = ${n2((sb * 100) / (sa + sb))}%`,
      }
    }),
    mk('whatIf', true, () => {
      const y = rng.int(0, n - 1)
      const k = rng.pick([10, 20, 25])
      const m = rng.pick([10, 20, 25])
      const hv = (A[y] * pa * (100 + k)) / 100 + (B[y] * pb * (100 - m)) / 100
      return {
        id: 'whatIf',
        stem: `If in ${years[y]} the price of ${nm[0]} had been ${k}% higher and the price of ${nm[1]} had been ${m}% lower (number sold remaining the same), what would the total revenue (in ₹) of that year have been, before commission?`,
        kind: 'int',
        v: vadd(upBy(revA(y), lit(k)), downBy(revB(y), lit(m))),
        expect: hv,
        wrong: [hRev(y), (A[y] * pa * (100 + k)) / 100 + (B[y] * pb * (100 + m)) / 100, hRev(y) * (1 + (k - m) / 100), (hv * (100 - com)) / 100],
        why: `New price of ${nm[0]} = ${pa} × ${100 + k}/100 = ₹${n2((pa * (100 + k)) / 100)}; new price of ${nm[1]} = ${pb} × ${100 - m}/100 = ₹${n2((pb * (100 - m)) / 100)}\nRevenue = ${A[y]} × ${n2((pa * (100 + k)) / 100)} + ${B[y]} × ${n2((pb * (100 - m)) / 100)}\n= ${n2((A[y] * pa * (100 + k)) / 100)} + ${n2((B[y] * pb * (100 - m)) / 100)} = ₹${n2(hv)}`,
        pre: '₹',
      }
    }),
    mk('maxRev', false, () => ({
      id: 'maxRev',
      stem: 'In which year was the total revenue (before commission) the highest?',
      kind: 'label',
      labels: years,
      lv: range(n).map(rev),
      extreme: 'max',
      expect: range(n).map(hRev),
      why: range(n).map((y) => `${years[y]}: ${A[y]} × ${pa} + ${B[y]} × ${pb} = ₹${hRev(y)}`).join('\n'),
    })),
  ]
  return { stimulus: st, pool }
}

// ================================================================== bar B3: income / expenditure bars for four years, the fifth year only in the text
const BAR3_SKINS = [
  { ent: 'a company', inc: 'income', exp: 'expenditure', prof: 'profit', unit: '₹ lakh', title: 'Income and expenditure (₹ lakh) of a company during four years' },
  { ent: 'a firm', inc: 'revenue', exp: 'cost of operations', prof: 'profit', unit: '₹ lakh', title: 'Revenue and cost of operations (₹ lakh) of a firm during four years' },
]
function scnIncExpBar(rng: Rng): Scn {
  const sk = rng.pick(BAR3_SKINS)
  const years = yearsRun(rng, 5)
  const E = range(4).map(() => rstep(rng, 100, 500, 10))
  const I = E.map((e) => e + rstep(rng, 40, 250, 10))
  const pInc = rng.pick([10, 20, 25, 30, 40, 50])
  const qExp = rng.pick([10, 20, 25, 30, 40])
  const I5 = (I[3] * (100 + pInc)) / 100
  const E5 = ((sumOf(E) / 4) * (100 - qExp)) / 100
  need(Number.isInteger(I5) && Number.isInteger(E5) && I5 > E5 + 20, 'fifth year not integral')
  const HI = [...I, I5]
  const HE = [...E, E5]
  const st: Stimulus = {
    directions: DIRS.mixed,
    parts: [
      { kind: 'bar', heading: sk.title, categories: years.slice(0, 4), series: [{ name: cap(sk.inc), values: I }, { name: cap(sk.exp), values: E }], unit: sk.unit },
      { kind: 'text', paragraphs: [`In ${years[4]}, the ${sk.inc} of the ${sk.ent === 'a firm' ? 'firm' : 'company'} was ${pInc}% more than its ${sk.inc} in ${years[3]}, while its ${sk.exp} was ${qExp}% less than the average annual ${sk.exp} of the first four years.`] },
    ],
  }
  const ctx = mkCtx(st)
  const inc = (y: number): V => (y < 4 ? ctx.ref(0, 0, y) : upBy(ctx.ref(0, 0, 3), txt(pInc)))
  const exp = (y: number): V => (y < 4 ? ctx.ref(0, 1, y) : downBy(vavg(range(4).map((k) => ctx.ref(0, 1, k))), txt(qExp)))
  const prof = (y: number): V => vsub(inc(y), exp(y))
  const hProf = (y: number): number => HI[y] - HE[y]
  const yl = (y: number): string => `${years[y]}: ${sk.inc} ${HI[y]}, ${sk.exp} ${HE[y]}, ${sk.prof} ${hProf(y)}`
  const y5line = `${years[4]}: ${sk.inc} = ${I[3]} × ${100 + pInc}/100 = ${I5}; ${sk.exp} = (${E.join(' + ')})/4 × ${100 - qExp}/100 = ${n2(sumOf(E) / 4)} × ${100 - qExp}/100 = ${E5}`
  const pool: PoolItem[] = [
    mk('profPctY5', true, () => ({
      id: 'profPctY5',
      stem: `What was the {adj}${sk.prof} percentage (on ${sk.exp}) in ${years[4]}?`,
      kind: 'pct',
      v: asPct(prof(4), exp(4)),
      expect: (hProf(4) * 100) / E5,
      wrong: [(hProf(4) * 100) / I5, pInc - qExp, (hProf(4) * 100) / (sumOf(E) / 4)],
      why: `${y5line}\n${cap(sk.prof)} in ${years[4]} = ${I5} − ${E5} = ${hProf(4)}\n${cap(sk.prof)} % = ${hProf(4)}/${E5} × 100 = ${n2((hProf(4) * 100) / E5)}%`,
    })),
    mk('avgProfit', true, () => {
      const tot = sumOf(range(5).map(hProf))
      return {
        id: 'avgProfit',
        stem: `What was the average annual ${sk.prof} (in ${sk.unit}) of the five years taken together?`,
        kind: 'dec',
        v: vavg(range(5).map(prof)),
        expect: tot / 5,
        wrong: [sumOf(range(4).map(hProf)) / 4, tot, (tot - hProf(4)) / 5],
        why: `${y5line}\n${range(5).map((y) => `${years[y]}: ${HI[y]} − ${HE[y]} = ${hProf(y)}`).join('\n')}\nTotal ${sk.prof} = ${tot}; average = ${tot}/5 = ${n2(tot / 5)}`,
        pre: '₹',
        post: ' lakh',
      }
    }),
    mk('pctChangeProfit', false, () => {
      const k = rng.int(0, 3)
      const a = hProf(k)
      const b = hProf(k + 1)
      need(a !== b, 'equal')
      const up = b > a
      return {
        id: 'pctChangeProfit',
        stem: `The ${sk.prof} in ${years[k + 1]} was {ly}what percent ${up ? 'more' : 'less'} than the ${sk.prof} in ${years[k]}?`,
        kind: 'pct',
        v: up ? asPct(vsub(prof(k + 1), prof(k)), prof(k)) : asPct(vsub(prof(k), prof(k + 1)), prof(k)),
        expect: (Math.abs(b - a) * 100) / a,
        wrong: [(Math.abs(b - a) * 100) / b, (b * 100) / a, (Math.abs(HI[k + 1] - HI[k]) * 100) / HI[k]],
        why: `${k === 3 ? `${y5line}\n` : ''}${yl(k)}\n${yl(k + 1)}\nRequired % = ${Math.abs(b - a)}/${a} × 100 = ${n2((Math.abs(b - a) * 100) / a)}%`,
      }
    }),
    mk('ratioIncExp', true, () => {
      const si = HI[0] + HI[1] + HI[2]
      const se = HE[2] + HE[3] + HE[4]
      return {
        id: 'ratioIncExp',
        stem: `What is the ratio of the total ${sk.inc} of the first three years to the total ${sk.exp} of the last three years?`,
        kind: 'ratio',
        ratio: [vsum([0, 1, 2].map(inc)), vsum([2, 3, 4].map(exp))],
        expect: [si, se],
        wrongR: [[se, si], [HI[0] + HI[1] + HI[2], HE[0] + HE[1] + HE[2]], [HI[2] + HI[3] + HI[4], se]],
        why: `${y5line}\nTotal ${sk.inc} of ${years[0]} to ${years[2]} = ${HI[0]} + ${HI[1]} + ${HI[2]} = ${si}\nTotal ${sk.exp} of ${years[2]} to ${years[4]} = ${HE[2]} + ${HE[3]} + ${HE[4]} = ${se}`,
      }
    }),
    mk('totalProfit', true, () => {
      const tot = sumOf(range(5).map(hProf))
      return {
        id: 'totalProfit',
        stem: `What is the total ${sk.prof} (in ${sk.unit}) earned in the five years together?`,
        kind: 'int',
        v: vsub(vsum(range(5).map(inc)), vsum(range(5).map(exp))),
        expect: tot,
        wrong: [sumOf(range(4).map(hProf)), tot + hProf(4), sumOf(HI) - sumOf(E)],
        why: `${y5line}\nTotal ${sk.inc} = ${HI.join(' + ')} = ${sumOf(HI)}\nTotal ${sk.exp} = ${HE.join(' + ')} = ${sumOf(HE)}\nTotal ${sk.prof} = ${sumOf(HI)} − ${sumOf(HE)} = ${tot}`,
        pre: '₹',
        post: ' lakh',
      }
    }),
    mk('maxProfit', false, () => ({
      id: 'maxProfit',
      stem: `In which year was the ${sk.prof} the highest?`,
      kind: 'label',
      labels: years,
      lv: range(5).map(prof),
      extreme: 'max',
      expect: range(5).map(hProf),
      why: `${y5line}\n${range(5).map((y) => `${years[y]}: ${HI[y]} − ${HE[y]} = ${hProf(y)}`).join('\n')}`,
    })),
    mk('whatIfExp', false, () => {
      const y = rng.int(0, 4)
      const k = rng.pick([10, 20, 25])
      const ne = (HE[y] * (100 - k)) / 100
      return {
        id: 'whatIfExp',
        stem: `If the ${sk.exp} in ${years[y]} had been ${k}% less (the ${sk.inc} remaining the same), what would the ${sk.prof} percentage in that year have been?`,
        kind: 'pct',
        v: asPct(vsub(inc(y), downBy(exp(y), lit(k))), downBy(exp(y), lit(k))),
        expect: ((HI[y] - ne) * 100) / ne,
        wrong: [(hProf(y) * 100) / HE[y], ((HI[y] - ne) * 100) / HI[y], (hProf(y) * 100) / HE[y] + k],
        why: `${y === 4 ? `${y5line}\n` : ''}${years[y]}: ${sk.inc} = ${HI[y]}, ${sk.exp} = ${HE[y]}\nNew ${sk.exp} = ${HE[y]} × ${100 - k}/100 = ${n2(ne)}\nNew ${sk.prof} = ${HI[y]} − ${n2(ne)} = ${n2(HI[y] - ne)}\n${cap(sk.prof)} % = ${n2(HI[y] - ne)}/${n2(ne)} × 100 = ${n2(((HI[y] - ne) * 100) / ne)}%`,
      }
    }),
    mk('incAboveAvg', false, () => {
      const avg = sumOf(I) / 4
      return {
        id: 'incAboveAvg',
        stem: `The ${sk.inc} in ${years[4]} was {ly}what percent more than the average annual ${sk.inc} of the first four years?`,
        kind: 'pct',
        v: asPct(vsub(inc(4), vavg([0, 1, 2, 3].map(inc))), vavg([0, 1, 2, 3].map(inc))),
        expect: ((I5 - avg) * 100) / avg,
        wrong: [((I5 - avg) * 100) / I5, pInc, ((I5 - I[0]) * 100) / I[0]],
        why: `${years[4]} ${sk.inc} = ${I[3]} × ${100 + pInc}/100 = ${I5}\nAverage ${sk.inc} of the first four years = (${I.join(' + ')})/4 = ${n2(avg)}\nRequired % = (${I5} − ${n2(avg)})/${n2(avg)} × 100 = ${n2(((I5 - avg) * 100) / avg)}%`,
      }
    }),
  ]
  return { stimulus: st, pool }
}

// ================================================================== pies
const degOf = (s: number): number => (s * 18) / 5
/** slice value as displayed: percent, or degrees (5% = 18 degrees) */
const sliceShown = (s: number, deg: boolean): number => (deg ? degOf(s) : s)
/** share (in %) recipe of pie slice c */
const pieShare = (ctx: Ctx, p: number, c: number, deg: boolean): V => (deg ? vdiv(vmul(ctx.ref(p, 0, c), lit(5)), lit(18)) : ctx.ref(p, 0, c))

// ---- P1: pie of totals + table of ratio / percentages
function scnPopPie(rng: Rng): Scn {
  const sk = rng.pick(PIE_POP_SKINS)
  const n = rng.int(5, 6)
  const shares = n === 5 ? splitShares(rng, n, 10, 35) : splitShares(rng, n, 5, 30)
  const N = rstep(rng, 2000, 8000, 1000)
  const deg = rng.chance(0.5)
  const cats = sk.cats.slice(0, n)
  const rows = shares.map((s) => popRow(rng, (N * s) / 100))
  const st: Stimulus = {
    directions: DIRS.pie,
    parts: [
      { kind: 'pie', heading: `Distribution of ${N} ${sk.title} ${deg ? '(in degrees)' : '(in %)'}`, slices: cats.map((c, i) => ({ label: c, value: sliceShown(shares[i], deg) })), unit: deg ? '°' : '%' },
      {
        kind: 'table',
        heading: `Further details of the ${sk.all} in each ${sk.catWord}`,
        columns: [sk.hdr, `Ratio of ${sk.m} to ${sk.f}`, `${cap(sk.m)} who are ${sk.okA}`, `${cap(sk.f)} who are ${sk.okA}`],
        rows: rows.map((R, i) => [cats[i], `${R.a} : ${R.b}`, `${R.x}%`, `${R.y}%`]),
        note: `The last two columns give the percentage of ${sk.m} and of ${sk.f} of that ${sk.catWord} who are ${sk.okA}.`,
      },
    ],
  }
  const ctx = mkCtx(st)
  const TV = (r: number): V => pctOf(pieShare(ctx, 0, r, deg), txt(N))
  const tLine = (r: number): string => `Total ${sk.all} ${`in ${sk.one(cats[r])}`} = ${N} × ${shares[r]}% = ${rows[r].T}\n`
  return { stimulus: st, pool: popPool(rng, sk, cats, rows, ctx, TV, tLine, 1, 1, 2, 3) }
}

// ---- P2: two pies (different totals, one in % and one in degrees) + gender ratios in the text
const PIE2_SKINS = [
  { cos: ['Company X', 'Company Y'], all: 'employees', m: 'male employees', f: 'female employees', cats: ['HR', 'Finance', 'Marketing', 'IT', 'Operations'], word: 'department', one: (c: string) => `the ${c} department`, title: (co: string, N: number, deg: boolean) => `Distribution of ${N} employees of ${co} in different departments ${deg ? '(in degrees)' : '(in %)'}` },
  { cos: ['College P', 'College Q'], all: 'students', m: 'boys', f: 'girls', cats: ['Arts', 'Commerce', 'Science', 'Law', 'Engineering'], word: 'stream', one: (c: string) => `the ${c} stream`, title: (co: string, N: number, deg: boolean) => `Distribution of ${N} students of ${co} in different streams ${deg ? '(in degrees)' : '(in %)'}` },
]
function scnTwoPies(rng: Rng): Scn {
  const sk = rng.pick(PIE2_SKINS)
  const n = 5
  const sh = [splitShares(rng, n, 10, 35), splitShares(rng, n, 10, 35)]
  const Ns = [rstep(rng, 2000, 8000, 1000), rstep(rng, 2000, 8000, 1000)]
  need(Ns[0] !== Ns[1], 'equal totals')
  const deg = [rng.chance(0.4), rng.chance(0.5)]
  const rat = [rng.pick(POP_RATIOS), rng.pick(POP_RATIOS)]
  for (const k of [0, 1]) need((Ns[k] * rat[k][1]) % (rat[k][0] + rat[k][1]) === 0, 'ratio does not divide the total')
  const st: Stimulus = {
    directions: DIRS.mixed,
    parts: [
      ...[0, 1].map((k): StimulusPart => ({ kind: 'pie', heading: sk.title(sk.cos[k], Ns[k], deg[k]), slices: sk.cats.map((c, i) => ({ label: c, value: sliceShown(sh[k][i], deg[k]) })), unit: deg[k] ? '°' : '%' })),
      { kind: 'text', paragraphs: [`In ${sk.cos[0]}, the ratio of ${sk.m} to ${sk.f} is ${rat[0][0]} : ${rat[0][1]}, while in ${sk.cos[1]} it is ${rat[1][0]} : ${rat[1][1]}.`] },
    ],
  }
  const ctx = mkCtx(st)
  const T = (k: number, d: number): V => pctOf(pieShare(ctx, k, d, deg[k]), txt(Ns[k]))
  const hT = (k: number, d: number): number => (Ns[k] * sh[k][d]) / 100
  const cn = (k: number): string => sk.cos[k]
  const dn = (d: number): string => sk.one(sk.cats[d])
  const tl = (k: number, d: number): string => `${cn(k)}, ${dn(d)}: ${Ns[k]} × ${sh[k][d]}% = ${hT(k, d)}`
  const hFem = (k: number): number => (Ns[k] * rat[k][1]) / (rat[k][0] + rat[k][1])
  const fem = (k: number): V => vdiv(vmul(txt(Ns[k]), txt(rat[k][1])), vadd(txt(rat[k][0]), txt(rat[k][1])))
  const pool: PoolItem[] = [
    mk('diffDept', true, () => {
      const [d1, d2] = two(rng, n)
      const hv = hT(0, d1)
      const hw = hT(1, d2)
      need(hv !== hw, 'equal')
      return {
        id: 'diffDept',
        stem: `What is the difference between the number of ${sk.all} in ${dn(d1)} of ${cn(0)} and the number of ${sk.all} in ${dn(d2)} of ${cn(1)}?`,
        kind: 'int',
        v: absDiff(T(0, d1), T(1, d2), hv, hw),
        expect: Math.abs(hv - hw),
        wrong: [hv + hw, Math.abs(hT(0, d2) - hw), Math.abs(hT(1, d1) - hv), (Math.abs(sh[0][d1] - sh[1][d2]) * (Ns[0] + Ns[1])) / 200],
        why: `${tl(0, d1)}\n${tl(1, d2)}\nDifference = |${hv} − ${hw}| = ${Math.abs(hv - hw)}`,
      }
    }),
    mk('ratioDept', true, () => {
      const [d1, d2, d3] = rng.sample(range(n), 3)
      return {
        id: 'ratioDept',
        stem: `What is the ratio of the total number of ${sk.all} in ${dn(d1)} and ${dn(d2)} of ${cn(0)} together to the number of ${sk.all} in ${dn(d3)} of ${cn(1)}?`,
        kind: 'ratio',
        ratio: [vadd(T(0, d1), T(0, d2)), T(1, d3)],
        expect: [hT(0, d1) + hT(0, d2), hT(1, d3)],
        wrongR: [[hT(0, d1), hT(1, d3)], [hT(0, d1) + hT(0, d2), hT(0, d3)], [hT(1, d3), hT(0, d1) + hT(0, d2)]],
        why: `${tl(0, d1)}\n${tl(0, d2)}\n${tl(1, d3)}\nRequired ratio = (${hT(0, d1)} + ${hT(0, d2)}) : ${hT(1, d3)}`,
      }
    }),
    mk('pctBoth', true, () => {
      const [d] = rng.sample(range(n), 1)
      const hv = hT(0, d) + hT(1, d)
      const tot = Ns[0] + Ns[1]
      return {
        id: 'pctBoth',
        stem: `The total number of ${sk.all} in ${dn(d)} of both the ${sk.all === 'employees' ? 'companies' : 'colleges'} together is {ly}what percent of the total number of ${sk.all} of both together?`,
        kind: 'pct',
        v: asPct(vadd(T(0, d), T(1, d)), vadd(txt(Ns[0]), txt(Ns[1]))),
        expect: (hv * 100) / tot,
        wrong: [(sh[0][d] + sh[1][d]) / 2, (hT(0, d) * 100) / Ns[0], (hv * 100) / Math.max(Ns[0], Ns[1])],
        why: `${tl(0, d)}\n${tl(1, d)}\nTotal in ${dn(d)} = ${hv}; total ${sk.all} = ${Ns[0]} + ${Ns[1]} = ${tot}\nRequired % = ${hv}/${tot} × 100 = ${n2((hv * 100) / tot)}%`,
      }
    }),
    mk('transfer', true, () => {
      const [d1, d2] = two(rng, n)
      const p = rng.pick([10, 20, 25, 40, 50])
      const moved = (hT(1, d1) * p) / 100
      need(Number.isInteger(moved), 'non-integral transfer')
      return {
        id: 'transfer',
        stem: `If ${p}% of the ${sk.all} in ${dn(d1)} of ${cn(1)} are shifted to ${dn(d2)} of ${cn(0)}, what will be the new number of ${sk.all} in ${dn(d2)} of ${cn(0)}?`,
        kind: 'int',
        v: vadd(T(0, d2), pctOf(lit(p), T(1, d1))),
        expect: hT(0, d2) + moved,
        wrong: [hT(0, d2) - moved, hT(0, d2) + (hT(0, d1) * p) / 100, hT(0, d2) + hT(1, d1), hT(1, d2) + moved],
        why: `${tl(1, d1)}\n${tl(0, d2)}\n${p}% of ${hT(1, d1)} = ${moved}\nNew number = ${hT(0, d2)} + ${moved} = ${hT(0, d2) + moved}`,
      }
    }),
    mk('avgDept', false, () => {
      const [d1, d2, d3] = rng.sample(range(n), 3)
      const k = rng.int(0, 1)
      const tot = hT(k, d1) + hT(k, d2) + hT(k, d3)
      return {
        id: 'avgDept',
        stem: `What is the average number of ${sk.all} in ${sk.one(sk.cats[d1])}, ${sk.one(sk.cats[d2])} and ${sk.one(sk.cats[d3])} of ${cn(k)}?`,
        kind: 'dec',
        v: vavg([d1, d2, d3].map((d) => T(k, d))),
        expect: tot / 3,
        wrong: [tot, tot / 2, (sh[k][d1] + sh[k][d2] + sh[k][d3]) / 3],
        why: `${[d1, d2, d3].map((d) => tl(k, d)).join('\n')}\nAverage = (${hT(k, d1)} + ${hT(k, d2)} + ${hT(k, d3)})/3 = ${tot}/3 = ${n2(tot / 3)}`,
      }
    }),
    mk('pctMore', false, () => {
      const [d1, d2] = rng.sample(range(n), 2)
      const a = hT(0, d1)
      const b = hT(1, d2)
      need(a !== b, 'equal')
      const more = a > b
      return {
        id: 'pctMore',
        stem: `The number of ${sk.all} in ${dn(d1)} of ${cn(0)} is {ly}what percent ${more ? 'more' : 'less'} than the number of ${sk.all} in ${dn(d2)} of ${cn(1)}?`,
        kind: 'pct',
        v: more ? asPct(vsub(T(0, d1), T(1, d2)), T(1, d2)) : asPct(vsub(T(1, d2), T(0, d1)), T(1, d2)),
        expect: (Math.abs(a - b) * 100) / b,
        wrong: [(Math.abs(a - b) * 100) / a, (a * 100) / b, Math.abs(sh[0][d1] - sh[1][d2]) * 2],
        why: `${tl(0, d1)}\n${tl(1, d2)}\nRequired % = ${Math.abs(a - b)}/${b} × 100 = ${n2((Math.abs(a - b) * 100) / b)}%`,
      }
    }),
    mk('females', true, () => {
      const hv = hFem(0) + hFem(1)
      return {
        id: 'females',
        stem: `What is the total number of ${sk.f} in ${cn(0)} and ${cn(1)} together?`,
        kind: 'int',
        v: vadd(fem(0), fem(1)),
        expect: hv,
        wrong: [Ns[0] - hFem(0) + Ns[1] - hFem(1), (Ns[0] * rat[0][0]) / (rat[0][0] + rat[0][1]) + (Ns[1] * rat[1][1]) / (rat[1][0] + rat[1][1]), hFem(0) + Ns[1] - hFem(1)],
        why: `${cap(sk.f)} in ${cn(0)} = ${Ns[0]} × ${rat[0][1]}/${rat[0][0] + rat[0][1]} = ${hFem(0)}\n${cap(sk.f)} in ${cn(1)} = ${Ns[1]} × ${rat[1][1]}/${rat[1][0] + rat[1][1]} = ${hFem(1)}\nTotal = ${hFem(0)} + ${hFem(1)} = ${hv}`,
      }
    }),
    mk('maxCombined', false, () => ({
      id: 'maxCombined',
      stem: `In which ${sk.word} is the combined number of ${sk.all} of ${cn(0)} and ${cn(1)} the highest?`,
      kind: 'label',
      labels: sk.cats,
      lv: range(n).map((d) => vadd(T(0, d), T(1, d))),
      extreme: 'max',
      expect: range(n).map((d) => hT(0, d) + hT(1, d)),
      why: range(n).map((d) => `${sk.cats[d]}: ${hT(0, d)} + ${hT(1, d)} = ${hT(0, d) + hT(1, d)}`).join('\n'),
    })),
  ]
  return { stimulus: st, pool }
}

// ---- P3: expenditure pie (income in the heading) + table of next year's changes
const PIE3_SKINS = [
  { heads: ['Rent', 'Food', 'Education', 'Transport', 'Entertainment'], save: 'Savings', who: 'a family', inc: 'monthly income', title: (I: number, deg: boolean) => `Distribution of the monthly income of ₹${I} of a family ${deg ? '(in degrees)' : '(in %)'}`, ent: 'the family', tableH: 'Expected change in expenditure next year', savWord: 'savings' },
  { heads: ['Salaries', 'Laboratory', 'Library', 'Sports', 'Maintenance'], save: 'Reserve fund', who: 'a college', inc: 'annual grant', title: (I: number, deg: boolean) => `Distribution of the annual grant of ₹${I} of a college ${deg ? '(in degrees)' : '(in %)'}`, ent: 'the college', tableH: 'Expected change in spending next year', savWord: 'reserve fund' },
]
function scnPieChange(rng: Rng): Scn {
  const sk = rng.pick(PIE3_SKINS)
  const n = 5
  const shares = splitShares(rng, 6, 5, 30)
  const deg = rng.chance(0.3)
  const I = rstep(rng, 40000, 100000, 5000)
  const chg = range(n).map(() => rng.pick([-30, -20, -10, 10, 20, 30, 40]))
  const x = rng.pick([10, 20, 25])
  const I2 = (I * (100 + x)) / 100
  const E = range(n).map((h) => (I * shares[h]) / 100)
  const E2 = range(n).map((h) => (E[h] * (100 + chg[h])) / 100)
  const S = (I * shares[5]) / 100
  const S2 = I2 - sumOf(E2)
  need(E2.every(Number.isInteger) && Number.isInteger(I2) && S2 > 0.05 * I2, 'unsuitable next-year figures')
  const st: Stimulus = {
    directions: DIRS.mixed,
    parts: [
      { kind: 'pie', heading: sk.title(I, deg), slices: [...sk.heads, sk.save].map((c, i) => ({ label: c, value: sliceShown(shares[i], deg) })), unit: deg ? '°' : '%' },
      {
        kind: 'table',
        heading: `${sk.tableH} (+ means increase, − means decrease)`,
        columns: ['Head', 'Change next year'],
        rows: sk.heads.map((h, i) => [h, `${chg[i] > 0 ? '+' : '−'}${Math.abs(chg[i])}%`]),
      },
      { kind: 'text', paragraphs: [`Next year, the ${sk.inc} of ${sk.ent} is expected to increase by ${x}%. Whatever is not spent on the five heads is treated as the ${sk.savWord}.`] },
    ],
  }
  const ctx = mkCtx(st)
  const e1 = (h: number): V => pctOf(pieShare(ctx, 0, h, deg), txt(I))
  const e2 = (h: number): V => vdiv(vmul(e1(h), vadd(lit(100), ctx.ref(1, h, 1))), lit(100))
  const inc2 = (): V => upBy(txt(I), txt(x))
  const sav2 = (): V => vsub(inc2(), vsum(range(n).map(e2)))
  const sav1 = (): V => pctOf(pieShare(ctx, 0, 5, deg), txt(I))
  const H = sk.heads
  const l1 = (h: number): string => `${H[h]}: ${shares[h]}% of ${I} = ${E[h]}`
  const l2 = (h: number): string => `${H[h]} next year = ${E[h]} × ${100 + chg[h]}/100 = ${E2[h]}`
  const pool: PoolItem[] = [
    mk('diffNew', true, () => {
      const [h1, h2] = two(rng, n)
      need(E2[h1] !== E2[h2], 'equal')
      return {
        id: 'diffNew',
        stem: `What will be the difference between the expenditure on ${H[h1]} and that on ${H[h2]} next year?`,
        kind: 'int',
        v: absDiff(e2(h1), e2(h2), E2[h1], E2[h2]),
        expect: Math.abs(E2[h1] - E2[h2]),
        wrong: [Math.abs(E[h1] - E[h2]), E2[h1] + E2[h2], Math.abs(E2[h1] - E[h2])],
        why: `${l1(h1)}\n${l2(h1)}\n${l1(h2)}\n${l2(h2)}\nDifference = |${E2[h1]} − ${E2[h2]}| = ${Math.abs(E2[h1] - E2[h2])}`,
        pre: '₹',
      }
    }),
    mk('newSavings', true, () => ({
      id: 'newSavings',
      stem: `What will be the ${sk.savWord} (in ₹) next year?`,
      kind: 'int',
      v: sav2(),
      expect: S2,
      wrong: [S * (100 + x) / 100, I2 - sumOf(E), S, I2 * shares[5] / 100],
      why: `${range(n).map((h) => l2(h)).join('\n')}\nTotal spending next year = ${E2.join(' + ')} = ${sumOf(E2)}\nIncome next year = ${I} × ${100 + x}/100 = ${I2}\n${cap(sk.savWord)} = ${I2} − ${sumOf(E2)} = ${S2}`,
      pre: '₹',
    })),
    mk('pctSavNew', true, () => ({
      id: 'pctSavNew',
      stem: `Next year, the ${sk.savWord} will be {ly}what percent of the ${sk.inc} of that year?`,
      kind: 'pct',
      v: asPct(sav2(), inc2()),
      expect: (S2 * 100) / I2,
      wrong: [shares[5], (S2 * 100) / I, (S * 100) / I2],
      why: `${range(n).map((h) => l2(h)).join('\n')}\nIncome next year = ${I2}; spending = ${sumOf(E2)}; ${sk.savWord} = ${S2}\nRequired % = ${S2}/${I2} × 100 = ${n2((S2 * 100) / I2)}%`,
    })),
    mk('ratioNew', true, () => {
      const [h1, h2] = two(rng, n)
      return {
        id: 'ratioNew',
        stem: `What is the ratio of the expenditure on ${H[h1]} this year to the expenditure on ${H[h2]} next year?`,
        kind: 'ratio',
        ratio: [e1(h1), e2(h2)],
        expect: [E[h1], E2[h2]],
        wrongR: [[E[h1], E[h2]], [E2[h1], E2[h2]], [E2[h2], E[h1]]],
        why: `${l1(h1)}\n${l1(h2)}\n${l2(h2)}`,
      }
    }),
    mk('pctTotalChange', true, () => {
      const t1 = sumOf(E)
      const t2 = sumOf(E2)
      need(t1 !== t2, 'equal')
      const up = t2 > t1
      return {
        id: 'pctTotalChange',
        stem: `By what {adj}percent will the total expenditure on the five heads ${up ? 'increase' : 'decrease'} next year?`,
        kind: 'pct',
        v: up ? asPct(vsub(vsum(range(n).map(e2)), vsum(range(n).map(e1))), vsum(range(n).map(e1))) : asPct(vsub(vsum(range(n).map(e1)), vsum(range(n).map(e2))), vsum(range(n).map(e1))),
        expect: (Math.abs(t2 - t1) * 100) / t1,
        wrong: [(Math.abs(t2 - t1) * 100) / t2, sumOf(chg) / n, x],
        why: `${range(n).map(l1).join('\n')}\n${range(n).map(l2).join('\n')}\nTotal this year = ${t1}; total next year = ${t2}\n% change = ${Math.abs(t2 - t1)}/${t1} × 100 = ${n2((Math.abs(t2 - t1) * 100) / t1)}%`,
      }
    }),
    mk('maxIncr', false, () => {
      const inc = range(n).map((h) => E2[h] - E[h])
      need(Math.max(...inc) > 0, 'no increase')
      return {
        id: 'maxIncr',
        stem: 'On which head will the increase in expenditure (in rupees) next year be the maximum?',
        kind: 'label',
        labels: H,
        lv: range(n).map((h) => vsub(e2(h), e1(h))),
        extreme: 'max',
        expect: inc,
        why: range(n).map((h) => `${H[h]}: ${E[h]} → ${E2[h]}, change = ${disp(String(E2[h] - E[h]))}`).join('\n'),
      }
    }),
    mk('avgNew', false, () => {
      const [h1, h2, h3] = rng.sample(range(n), 3)
      const tot = E2[h1] + E2[h2] + E2[h3]
      return {
        id: 'avgNew',
        stem: `What will be the average expenditure (in ₹) on ${H[h1]}, ${H[h2]} and ${H[h3]} next year?`,
        kind: 'dec',
        v: vavg([h1, h2, h3].map(e2)),
        expect: tot / 3,
        wrong: [(E[h1] + E[h2] + E[h3]) / 3, tot, tot / 2],
        why: `${[h1, h2, h3].map((h) => `${l1(h)}; ${l2(h)}`).join('\n')}\nAverage = (${E2[h1]} + ${E2[h2]} + ${E2[h3]})/3 = ${n2(tot / 3)}`,
        pre: '₹',
      }
    }),
    mk('savChange', true, () => {
      need(S !== S2, 'equal')
      const up = S2 > S
      return {
        id: 'savChange',
        stem: `By what {adj}percent will the ${sk.savWord} ${up ? 'increase' : 'decrease'} next year compared with this year?`,
        kind: 'pct',
        v: up ? asPct(vsub(sav2(), sav1()), sav1()) : asPct(vsub(sav1(), sav2()), sav1()),
        expect: (Math.abs(S2 - S) * 100) / S,
        wrong: [(Math.abs(S2 - S) * 100) / S2, x, Math.abs(shares[5] - (S2 * 100) / I2)],
        why: `${cap(sk.savWord)} this year = ${shares[5]}% of ${I} = ${S}\n${range(n).map((h) => l2(h)).join('\n')}\nIncome next year = ${I2}; ${sk.savWord} next year = ${I2} − ${sumOf(E2)} = ${S2}\n% change = ${Math.abs(S2 - S)}/${S} × 100 = ${n2((Math.abs(S2 - S) * 100) / S)}%`,
      }
    }),
  ]
  return { stimulus: st, pool }
}

// ================================================================== line L1: profit % lines + expenditure table
function scnProfitLine(rng: Rng): Scn {
  const n = 5
  const years = yearsRun(rng, n)
  const co = rng.sample(['P', 'Q', 'R', 'S', 'T'], 2).sort().map((x) => `Company ${x}`)
  const e = range(2).map(() => range(n).map(() => rstep(rng, 200, 900, 20)))
  const p = range(2).map(() => range(n).map(() => rstep(rng, 10, 60, 5)))
  const st: Stimulus = {
    directions: DIRS.mixed,
    parts: [
      { kind: 'line', heading: 'Profit percentage (on expenditure) earned by two companies over the years', categories: years, series: co.map((c, s) => ({ name: c, values: p[s] })), unit: 'in %' },
      { kind: 'table', heading: 'Expenditure (₹ lakh) of the two companies over the years', columns: ['Year', `Expenditure of ${co[0]}`, `Expenditure of ${co[1]}`], rows: years.map((y, i) => [y, e[0][i], e[1][i]]) },
    ],
  }
  const ctx = mkCtx(st)
  const pv = (s: number, y: number): V => ctx.ref(0, s, y)
  const ev = (s: number, y: number): V => ctx.ref(1, y, 1 + s)
  const inc = (s: number, y: number): V => upBy(ev(s, y), pv(s, y))
  const prof = (s: number, y: number): V => pctOf(pv(s, y), ev(s, y))
  const hProf = (s: number, y: number): number => (e[s][y] * p[s][y]) / 100
  const hInc = (s: number, y: number): number => e[s][y] + hProf(s, y)
  const incLine = (s: number, y: number): string => `${co[s]}, ${years[y]}: income = ${e[s][y]} × ${100 + p[s][y]}/100 = ${hInc(s, y)}`
  const profLine = (s: number, y: number): string => `${co[s]}, ${years[y]}: profit = ${p[s][y]}% of ${e[s][y]} = ${hProf(s, y)}`
  const pool: PoolItem[] = [
    mk('incSum', true, () => {
      const s = rng.int(0, 1)
      const ys = run(rng, n, 3)
      const tot = sumOf(ys.map((y) => hInc(s, y)))
      return {
        id: 'incSum',
        stem: `What was the total income (in ₹ lakh) of ${co[s]} from ${years[ys[0]]} to ${years[ys[2]]}?`,
        kind: 'int',
        v: vsum(ys.map((y) => inc(s, y))),
        expect: tot,
        wrong: [sumOf(ys.map((y) => hProf(s, y))), sumOf(ys.map((y) => e[s][y])), tot / 3],
        why: `${ys.map((y) => incLine(s, y)).join('\n')}\nTotal income = ${ys.map((y) => hInc(s, y)).join(' + ')} = ${tot}`,
        pre: '₹',
        post: ' lakh',
      }
    }),
    mk('ratioProfit', true, () => {
      const [y1, y2] = two(rng, n)
      return {
        id: 'ratioProfit',
        stem: `What is the ratio of the profit earned by ${co[0]} in ${years[y1]} to the profit earned by ${co[1]} in ${years[y2]}?`,
        kind: 'ratio',
        ratio: [prof(0, y1), prof(1, y2)],
        expect: [hProf(0, y1), hProf(1, y2)],
        wrongR: [[hInc(0, y1), hInc(1, y2)], [hProf(1, y1), hProf(0, y2)], [p[0][y1], p[1][y2]]],
        why: `${profLine(0, y1)}\n${profLine(1, y2)}`,
      }
    }),
    mk('pctChangeProfit', false, () => {
      const s = rng.int(0, 1)
      const k = rng.int(0, n - 2)
      const a = hProf(s, k)
      const b = hProf(s, k + 1)
      need(a !== b, 'equal')
      const up = b > a
      return {
        id: 'pctChangeProfit',
        stem: `The profit of ${co[s]} in ${years[k + 1]} was {ly}what percent ${up ? 'more' : 'less'} than its profit in ${years[k]}?`,
        kind: 'pct',
        v: up ? asPct(vsub(prof(s, k + 1), prof(s, k)), prof(s, k)) : asPct(vsub(prof(s, k), prof(s, k + 1)), prof(s, k)),
        expect: (Math.abs(b - a) * 100) / a,
        wrong: [(Math.abs(b - a) * 100) / b, (b * 100) / a, Math.abs(p[s][k + 1] - p[s][k])],
        why: `${profLine(s, k)}\n${profLine(s, k + 1)}\nRequired % = ${n2(Math.abs(b - a))}/${n2(a)} × 100 = ${n2((Math.abs(b - a) * 100) / a)}%`,
      }
    }),
    mk('avgIncome', true, () => {
      const s = rng.int(0, 1)
      const tot = sumOf(range(n).map((y) => hInc(s, y)))
      return {
        id: 'avgIncome',
        stem: `What was the average annual income (in ₹ lakh) of ${co[s]} over the five years?`,
        kind: 'dec',
        v: vavg(range(n).map((y) => inc(s, y))),
        expect: tot / n,
        wrong: [sumOf(e[s]) / n, tot, sumOf(range(n).map((y) => hProf(s, y))) / n],
        why: `${range(n).map((y) => incLine(s, y)).join('\n')}\nTotal = ${tot}; average = ${tot}/${n} = ${n2(tot / n)}`,
        pre: '₹',
        post: ' lakh',
      }
    }),
    mk('diffInc', false, () => {
      const y = rng.int(0, n - 1)
      need(hInc(0, y) !== hInc(1, y), 'equal')
      return {
        id: 'diffInc',
        stem: `What was the difference between the incomes (in ₹ lakh) of ${co[0]} and ${co[1]} in ${years[y]}?`,
        kind: 'int',
        v: absDiff(inc(0, y), inc(1, y), hInc(0, y), hInc(1, y)),
        expect: Math.abs(hInc(0, y) - hInc(1, y)),
        wrong: [Math.abs(e[0][y] - e[1][y]), Math.abs(hProf(0, y) - hProf(1, y)), hInc(0, y) + hInc(1, y)],
        why: `${incLine(0, y)}\n${incLine(1, y)}\nDifference = |${hInc(0, y)} − ${hInc(1, y)}| = ${Math.abs(hInc(0, y) - hInc(1, y))}`,
        pre: '₹',
        post: ' lakh',
      }
    }),
    mk('maxCombProfit', false, () => ({
      id: 'maxCombProfit',
      stem: 'In which year was the combined profit of the two companies the highest?',
      kind: 'label',
      labels: years,
      lv: range(n).map((y) => vadd(prof(0, y), prof(1, y))),
      extreme: 'max',
      expect: range(n).map((y) => hProf(0, y) + hProf(1, y)),
      why: range(n).map((y) => `${years[y]}: ${hProf(0, y)} + ${hProf(1, y)} = ${n2(hProf(0, y) + hProf(1, y))}`).join('\n'),
    })),
    mk('overallPct', true, () => {
      const s = rng.int(0, 1)
      const pr = sumOf(range(n).map((y) => hProf(s, y)))
      const ex = sumOf(e[s])
      return {
        id: 'overallPct',
        stem: `What was the {adj}overall profit percentage of ${co[s]} over the five years taken together?`,
        kind: 'pct',
        v: asPct(vsum(range(n).map((y) => prof(s, y))), vsum(range(n).map((y) => ev(s, y)))),
        expect: (pr * 100) / ex,
        wrong: [sumOf(p[s]) / n, (pr * 100) / (ex + pr), (pr * 100) / sumOf(range(n).map((y) => hInc(s, y)))],
        why: `${range(n).map((y) => profLine(s, y)).join('\n')}\nTotal profit = ${n2(pr)}; total expenditure = ${ex}\nOverall profit % = ${n2(pr)}/${ex} × 100 = ${n2((pr * 100) / ex)}%`,
      }
    }),
    mk('whatIfExp', false, () => {
      const s = rng.int(0, 1)
      const y = rng.int(0, n - 1)
      const k = rng.pick([10, 20, 25])
      const ne = (e[s][y] * (100 - k)) / 100
      return {
        id: 'whatIfExp',
        stem: `If the expenditure of ${co[s]} in ${years[y]} had been ${k}% less (its income remaining the same), what would its profit percentage in that year have been?`,
        kind: 'pct',
        v: asPct(vsub(inc(s, y), downBy(ev(s, y), lit(k))), downBy(ev(s, y), lit(k))),
        expect: ((hInc(s, y) - ne) * 100) / ne,
        wrong: [p[s][y] + k, ((hInc(s, y) - ne) * 100) / hInc(s, y), p[s][y] * (1 + k / 100)],
        why: `${incLine(s, y)}\nNew expenditure = ${e[s][y]} × ${100 - k}/100 = ${n2(ne)}\nNew profit = ${hInc(s, y)} − ${n2(ne)} = ${n2(hInc(s, y) - ne)}\nProfit % = ${n2(hInc(s, y) - ne)}/${n2(ne)} × 100 = ${n2(((hInc(s, y) - ne) * 100) / ne)}%`,
      }
    }),
    mk('combinedPct', true, () => {
      const y = rng.int(0, n - 1)
      const pr = hProf(0, y) + hProf(1, y)
      const ex = e[0][y] + e[1][y]
      return {
        id: 'combinedPct',
        stem: `What was the {adj}combined profit percentage of ${co[0]} and ${co[1]} together in ${years[y]}?`,
        kind: 'pct',
        v: asPct(vadd(prof(0, y), prof(1, y)), vadd(ev(0, y), ev(1, y))),
        expect: (pr * 100) / ex,
        wrong: [(p[0][y] + p[1][y]) / 2, (pr * 100) / (ex + pr), p[0][y] + p[1][y]],
        why: `${profLine(0, y)}\n${profLine(1, y)}\nCombined profit = ${n2(pr)}; combined expenditure = ${e[0][y]} + ${e[1][y]} = ${ex}\nProfit % = ${n2(pr)}/${ex} × 100 = ${n2((pr * 100) / ex)}%`,
      }
    }),
  ]
  return { stimulus: st, pool }
}

// ================================================================== line L2: year-on-year % growth lines + base year in the text
const LINE2_SKINS = [
  { names: ['Company A', 'Company B'], what: 'production of cars', unit: 'cars', one: 'cars' },
  { names: ['Plant X', 'Plant Y'], what: 'production of mobile phones', unit: 'phones', one: 'phones' },
  { names: ['Institute P', 'Institute Q'], what: 'number of students enrolled', unit: 'students', one: 'students' },
]
function scnGrowthLine(rng: Rng): Scn {
  const sk = rng.pick(LINE2_SKINS)
  const n = 5
  const ys = yearsRun(rng, n + 1)
  const years = ys.slice(1)
  const base = [rstep(rng, 2000, 8000, 1000), rstep(rng, 2000, 8000, 1000)]
  const g = range(2).map(() => range(n).map(() => rng.pick([10, 20, 25, 40, 50])))
  const H = range(2).map((s) => {
    const out = [base[s]]
    for (let k = 0; k < n; k++) {
      const nx = (out[k] * (100 + g[s][k])) / 100
      need(Number.isInteger(nx) && nx < 60000, 'non-integral growth')
      out.push(nx)
    }
    return out
  })
  const st: Stimulus = {
    directions: DIRS.mixed,
    parts: [
      { kind: 'line', heading: `Percentage increase in the ${sk.what} over the previous year`, categories: years, series: sk.names.map((c, s) => ({ name: c, values: g[s] })), unit: 'in %' },
      { kind: 'text', paragraphs: [`In ${ys[0]}, the ${sk.what} of ${sk.names[0]} was ${base[0]} and that of ${sk.names[1]} was ${base[1]}.`] },
    ],
  }
  const ctx = mkCtx(st)
  const prod = (s: number, k: number): V => {
    let v = txt(base[s])
    for (let i = 0; i < k; i++) v = upBy(v, ctx.ref(0, s, i))
    return v
  }
  const yr = (k: number): string => ys[k]
  const stepLines = (s: number, k: number): string => range(k).map((i) => `${yr(i + 1)}: ${H[s][i]} × ${100 + g[s][i]}/100 = ${H[s][i + 1]}`).join('\n')
  const pool: PoolItem[] = [
    mk('prodY', true, () => {
      const s = rng.int(0, 1)
      const k = rng.int(3, n)
      return {
        id: 'prodY',
        stem: `What was the ${sk.what} of ${sk.names[s]} in ${yr(k)}?`,
        kind: 'int',
        v: prod(s, k),
        expect: H[s][k],
        wrong: [(base[s] * (100 + sumOf(g[s].slice(0, k)))) / 100, H[s][k - 1], (base[s] * (100 + g[s][k - 1])) / 100, H[s][k] - base[s]],
        why: `${sk.names[s]} in ${yr(0)} = ${base[s]}\n${stepLines(s, k)}`,
      }
    }),
    mk('totalProd', true, () => {
      const s = rng.int(0, 1)
      const m = rng.int(3, 4)
      const tot = sumOf(range(m).map((k) => H[s][k + 1]))
      return {
        id: 'totalProd',
        stem: `What was the total ${sk.what} of ${sk.names[s]} from ${yr(1)} to ${yr(m)}?`,
        kind: 'int',
        v: vsum(range(m).map((k) => prod(s, k + 1))),
        expect: tot,
        wrong: [tot + base[s], tot - H[s][m], (base[s] * m * (100 + sumOf(g[s].slice(0, m)) / m)) / 100],
        why: `${sk.names[s]} in ${yr(0)} = ${base[s]}\n${stepLines(s, m)}\nTotal = ${range(m).map((k) => H[s][k + 1]).join(' + ')} = ${tot}`,
      }
    }),
    mk('pctOverall', true, () => {
      const s = rng.int(0, 1)
      const k = rng.int(3, n)
      return {
        id: 'pctOverall',
        stem: `By what {adj}percent did the ${sk.what} of ${sk.names[s]} increase from ${yr(0)} to ${yr(k)}?`,
        kind: 'pct',
        v: asPct(vsub(prod(s, k), txt(base[s])), txt(base[s])),
        expect: ((H[s][k] - base[s]) * 100) / base[s],
        wrong: [sumOf(g[s].slice(0, k)), ((H[s][k] - base[s]) * 100) / H[s][k], sumOf(g[s].slice(0, k)) / k],
        why: `${sk.names[s]} in ${yr(0)} = ${base[s]}\n${stepLines(s, k)}\nIncrease = ${H[s][k]} − ${base[s]} = ${H[s][k] - base[s]}\nRequired % = ${H[s][k] - base[s]}/${base[s]} × 100 = ${n2(((H[s][k] - base[s]) * 100) / base[s])}%`,
      }
    }),
    mk('diffAB', false, () => {
      const k = rng.int(2, n)
      need(H[0][k] !== H[1][k], 'equal')
      return {
        id: 'diffAB',
        stem: `What is the difference between the ${sk.what} of ${sk.names[0]} and that of ${sk.names[1]} in ${yr(k)}?`,
        kind: 'int',
        v: absDiff(prod(0, k), prod(1, k), H[0][k], H[1][k]),
        expect: Math.abs(H[0][k] - H[1][k]),
        wrong: [H[0][k] + H[1][k], Math.abs(H[0][k - 1] - H[1][k - 1]), Math.abs(base[0] - base[1])],
        why: `Each year = previous year × (100 + growth)/100\n${sk.names[0]}: ${range(k + 1).map((i) => H[0][i]).join(' → ')}\n${sk.names[1]}: ${range(k + 1).map((i) => H[1][i]).join(' → ')}\nDifference in ${yr(k)} = |${H[0][k]} − ${H[1][k]}| = ${Math.abs(H[0][k] - H[1][k])}`,
      }
    }),
    mk('ratioAB', true, () => {
      const k1 = rng.int(1, n)
      const k2 = rng.int(1, n)
      return {
        id: 'ratioAB',
        stem: `What is the ratio of the ${sk.what} of ${sk.names[0]} in ${yr(k1)} to that of ${sk.names[1]} in ${yr(k2)}?`,
        kind: 'ratio',
        ratio: [prod(0, k1), prod(1, k2)],
        expect: [H[0][k1], H[1][k2]],
        wrongR: [[H[1][k1], H[0][k2]], [H[0][k1 - 1], H[1][k2]], [H[1][k2], H[0][k1]]],
        why: `${sk.names[0]}: ${range(k1 + 1).map((i) => H[0][i]).join(' → ')} (each step × (100 + growth)/100)\n${sk.names[1]}: ${range(k2 + 1).map((i) => H[1][i]).join(' → ')}`,
      }
    }),
    mk('avgProd', true, () => {
      const s = rng.int(0, 1)
      const tot = sumOf(range(n).map((k) => H[s][k + 1]))
      return {
        id: 'avgProd',
        stem: `What was the average annual ${sk.what} of ${sk.names[s]} from ${yr(1)} to ${yr(n)}?`,
        kind: 'dec',
        v: vavg(range(n).map((k) => prod(s, k + 1))),
        expect: tot / n,
        wrong: [(tot + base[s]) / (n + 1), tot, (base[s] + H[s][n]) / 2],
        why: `${sk.names[s]}: ${range(n + 1).map((i) => H[s][i]).join(' → ')} (${yr(0)} to ${yr(n)})\nTotal for ${yr(1)} to ${yr(n)} = ${tot}\nAverage = ${tot}/${n} = ${n2(tot / n)}`,
      }
    }),
    mk('maxAbsInc', false, () => {
      const s = rng.int(0, 1)
      return {
        id: 'maxAbsInc',
        stem: `In which year was the absolute increase in the ${sk.what} of ${sk.names[s]} over the previous year the maximum?`,
        kind: 'label',
        labels: years,
        lv: range(n).map((k) => vsub(prod(s, k + 1), prod(s, k))),
        extreme: 'max',
        expect: range(n).map((k) => H[s][k + 1] - H[s][k]),
        why: `${sk.names[s]}: ${range(n + 1).map((i) => H[s][i]).join(' → ')}\nIncreases: ${range(n).map((k) => `${yr(k + 1)} = ${H[s][k + 1] - H[s][k]}`).join(', ')}`,
      }
    }),
    mk('pctGap', false, () => {
      const k = rng.int(2, n)
      need(H[0][k] !== H[1][k], 'equal')
      const more = H[0][k] > H[1][k]
      return {
        id: 'pctGap',
        stem: `The ${sk.what} of ${sk.names[0]} in ${yr(k)} was {ly}what percent ${more ? 'more' : 'less'} than that of ${sk.names[1]} in ${yr(k)}?`,
        kind: 'pct',
        v: more ? asPct(vsub(prod(0, k), prod(1, k)), prod(1, k)) : asPct(vsub(prod(1, k), prod(0, k)), prod(1, k)),
        expect: (Math.abs(H[0][k] - H[1][k]) * 100) / H[1][k],
        wrong: [(Math.abs(H[0][k] - H[1][k]) * 100) / H[0][k], (H[0][k] * 100) / H[1][k], Math.abs(g[0][k - 1] - g[1][k - 1])],
        why: `${sk.names[0]}: ${range(k + 1).map((i) => H[0][i]).join(' → ')}; ${sk.names[1]}: ${range(k + 1).map((i) => H[1][i]).join(' → ')}\nIn ${yr(k)}: ${H[0][k]} and ${H[1][k]}\nRequired % = ${Math.abs(H[0][k] - H[1][k])}/${H[1][k]} × 100 = ${n2((Math.abs(H[0][k] - H[1][k]) * 100) / H[1][k])}%`,
      }
    }),
  ]
  return { stimulus: st, pool }
}

// ================================================================== line L3: units line + price / discount table
const LINE3_SKINS = [
  { names: ['School bags', 'Lunch boxes'], title: 'Number of school bags and lunch boxes sold by a wholesaler over the years', pr: [100, 400] as [number, number] },
  { names: ['Table fans', 'Mixer grinders'], title: 'Number of table fans and mixer grinders sold by a dealer over the years', pr: [200, 600] as [number, number] },
]
function scnUnitsPriceLine(rng: Rng): Scn {
  const sk = rng.pick(LINE3_SKINS)
  const n = 5
  const years = yearsRun(rng, n)
  const u = range(2).map(() => range(n).map(() => rstep(rng, 400, 2000, 100)))
  const pr = range(2).map(() => range(n).map(() => rstep(rng, sk.pr[0], sk.pr[1], 10)))
  const d = range(n).map(() => rng.pick([5, 10, 15, 20, 25]))
  const st: Stimulus = {
    directions: DIRS.mixed,
    parts: [
      { kind: 'line', heading: sk.title, categories: years, series: sk.names.map((c, s) => ({ name: c, values: u[s] })), unit: 'in numbers' },
      { kind: 'table', heading: 'Price per unit (in ₹) and discount allowed on every sale', columns: ['Year', `Price of ${sk.names[0].toLowerCase()}`, `Price of ${sk.names[1].toLowerCase()}`, 'Discount allowed'], rows: years.map((y, i) => [y, pr[0][i], pr[1][i], `${d[i]}%`]) },
    ],
  }
  const ctx = mkCtx(st)
  const gross = (s: number, y: number): V => vmul(ctx.ref(0, s, y), ctx.ref(1, y, 1 + s))
  const net = (s: number, y: number): V => downBy(gross(s, y), ctx.ref(1, y, 3))
  const hG = (s: number, y: number): number => u[s][y] * pr[s][y]
  const hN = (s: number, y: number): number => (hG(s, y) * (100 - d[y])) / 100
  const nl = (s: number, y: number): string => `${sk.names[s]}, ${years[y]}: ${u[s][y]} × ${pr[s][y]} = ${hG(s, y)}; after ${d[y]}% discount = ${hN(s, y)}`
  const pool: PoolItem[] = [
    mk('revYear', true, () => {
      const y = rng.int(0, n - 1)
      const tot = hN(0, y) + hN(1, y)
      return {
        id: 'revYear',
        stem: `What was the total revenue (in ₹) of both the products together in ${years[y]}, after allowing the discount?`,
        kind: 'int',
        v: vadd(net(0, y), net(1, y)),
        expect: tot,
        wrong: [hG(0, y) + hG(1, y), (hG(0, y) + hG(1, y)) * (1 + d[y] / 100), hN(0, y) + hG(1, y), (u[0][y] + u[1][y]) * ((pr[0][y] + pr[1][y]) / 2) * (1 - d[y] / 100)],
        why: `${nl(0, y)}\n${nl(1, y)}\nTotal = ${hN(0, y)} + ${hN(1, y)} = ₹${tot}`,
        pre: '₹',
      }
    }),
    mk('ratioRev', true, () => {
      const [y1, y2] = two(rng, n)
      return {
        id: 'ratioRev',
        stem: `What is the ratio of the revenue from ${sk.names[0].toLowerCase()} in ${years[y1]} to the revenue from ${sk.names[1].toLowerCase()} in ${years[y2]}, both after the discount?`,
        kind: 'ratio',
        ratio: [net(0, y1), net(1, y2)],
        expect: [hN(0, y1), hN(1, y2)],
        wrongR: [[hG(0, y1), hG(1, y2)], [u[0][y1], u[1][y2]], [hN(1, y1), hN(0, y2)]],
        why: `${nl(0, y1)}\n${nl(1, y2)}`,
      }
    }),
    mk('pctRevChange', false, () => {
      const s = rng.int(0, 1)
      const [y1, y2] = two(rng, n)
      const a = hN(s, y1)
      const b = hN(s, y2)
      need(a !== b, 'equal')
      const up = b > a
      return {
        id: 'pctRevChange',
        stem: `The revenue from ${sk.names[s].toLowerCase()} (after discount) in ${years[y2]} was {ly}what percent ${up ? 'more' : 'less'} than that in ${years[y1]}?`,
        kind: 'pct',
        v: up ? asPct(vsub(net(s, y2), net(s, y1)), net(s, y1)) : asPct(vsub(net(s, y1), net(s, y2)), net(s, y1)),
        expect: (Math.abs(b - a) * 100) / a,
        wrong: [(Math.abs(b - a) * 100) / b, (Math.abs(u[s][y2] - u[s][y1]) * 100) / u[s][y1], (b * 100) / a],
        why: `${nl(s, y1)}\n${nl(s, y2)}\nRequired % = ${Math.abs(b - a)}/${a} × 100 = ${n2((Math.abs(b - a) * 100) / a)}%`,
      }
    }),
    mk('diffRevRange', true, () => {
      const ys = run(rng, n, 3)
      const sa = sumOf(ys.map((y) => hN(0, y)))
      const sb = sumOf(ys.map((y) => hN(1, y)))
      need(sa !== sb, 'equal')
      return {
        id: 'diffRevRange',
        stem: `What is the difference between the total revenue from ${sk.names[0].toLowerCase()} and from ${sk.names[1].toLowerCase()} (both after discount) from ${years[ys[0]]} to ${years[ys[2]]}?`,
        kind: 'int',
        v: absDiff(vsum(ys.map((y) => net(0, y))), vsum(ys.map((y) => net(1, y))), sa, sb),
        expect: Math.abs(sa - sb),
        wrong: [sa + sb, Math.abs(sumOf(ys.map((y) => hG(0, y))) - sumOf(ys.map((y) => hG(1, y)))), Math.abs(sa - sb) / 3],
        why: `${ys.map((y) => nl(0, y)).join('\n')}\nTotal for ${sk.names[0].toLowerCase()} = ${sa}\n${ys.map((y) => nl(1, y)).join('\n')}\nTotal for ${sk.names[1].toLowerCase()} = ${sb}\nDifference = |${sa} − ${sb}| = ${Math.abs(sa - sb)}`,
        pre: '₹',
      }
    }),
    mk('avgRev', true, () => {
      const s = rng.int(0, 1)
      const tot = sumOf(range(n).map((y) => hN(s, y)))
      return {
        id: 'avgRev',
        stem: `What was the average annual revenue (in ₹) from ${sk.names[s].toLowerCase()} after discount over the five years?`,
        kind: 'dec',
        v: vavg(range(n).map((y) => net(s, y))),
        expect: tot / n,
        wrong: [sumOf(range(n).map((y) => hG(s, y))) / n, tot, tot / (n - 1)],
        why: `${range(n).map((y) => nl(s, y)).join('\n')}\nTotal = ${tot}; average = ${tot}/${n} = ${n2(tot / n)}`,
        pre: '₹',
      }
    }),
    mk('maxRev', false, () => ({
      id: 'maxRev',
      stem: 'In which year was the combined revenue (after discount) from both the products the highest?',
      kind: 'label',
      labels: years,
      lv: range(n).map((y) => vadd(net(0, y), net(1, y))),
      extreme: 'max',
      expect: range(n).map((y) => hN(0, y) + hN(1, y)),
      why: range(n).map((y) => `${years[y]}: ${hN(0, y)} + ${hN(1, y)} = ${hN(0, y) + hN(1, y)}`).join('\n'),
    })),
    mk('discLoss', false, () => {
      const s = rng.int(0, 1)
      const y = rng.int(0, n - 1)
      return {
        id: 'discLoss',
        stem: `By how much (in ₹) was the revenue from ${sk.names[s].toLowerCase()} reduced in ${years[y]} because of the discount?`,
        kind: 'int',
        v: pctOf(ctx.ref(1, y, 3), gross(s, y)),
        expect: (hG(s, y) * d[y]) / 100,
        wrong: [hN(s, y), (u[s][y] * d[y]) / 100, hG(s, y)],
        why: `Gross revenue = ${u[s][y]} × ${pr[s][y]} = ₹${hG(s, y)}\nDiscount = ${d[y]}% of ${hG(s, y)} = ₹${(hG(s, y) * d[y]) / 100}`,
        pre: '₹',
      }
    }),
    mk('pctShare', false, () => {
      const s = rng.int(0, 1)
      const y = rng.int(0, n - 1)
      return {
        id: 'pctShare',
        stem: `In ${years[y]}, the revenue from ${sk.names[s].toLowerCase()} (after discount) was {ly}what percent of the total revenue from both the products?`,
        kind: 'pct',
        v: asPct(net(s, y), vadd(net(0, y), net(1, y))),
        expect: (hN(s, y) * 100) / (hN(0, y) + hN(1, y)),
        wrong: [(u[s][y] * 100) / (u[0][y] + u[1][y]), (hN(s, y) * 100) / (hN(1 - s, y)), (hG(s, y) * 100) / (hG(0, y) + hG(1, y)) + 5],
        why: `${nl(0, y)}\n${nl(1, y)}\nRequired % = ${hN(s, y)}/${hN(0, y) + hN(1, y)} × 100 = ${n2((hN(s, y) * 100) / (hN(0, y) + hN(1, y)))}%`,
      }
    }),
  ]
  return { stimulus: st, pool }
}

// ================================================================== caselets: statements = linear equations over hidden region sizes
// A hidden assignment h (all regions) is drawn first. A pool of TRUE statements about it is generated; a random subset
// whose equations have full rank is printed as the paragraph. Every question is a linear form over the regions; its key is
// computed from h and independently from the solution of the printed equations (Gauss-Jordan over exact fractions).
export interface LCons {
  rows: number[][]
  rhs: number[]
  text: string
  eq: string
}
export interface LinMeta {
  id: string
  kind: 'int' | 'pct' | 'ratio'
  num: number[]
  den?: number[]
  cons: { rows: number[][]; rhs: number[]; text: string }[]
  n: number
  approx?: boolean
}
export const MAINS_CASELET_META = new WeakMap<object, LinMeta>()

function gauss(rows: number[][], rhs: number[], n: number): { rank: number; sol: Frac[] | null } {
  const m: Frac[][] = rows.map((r, i) => [...r.map((x) => F(x)), F(rhs[i])])
  let rank = 0
  for (let c = 0; c < n && rank < m.length; c++) {
    let p = -1
    for (let i = rank; i < m.length; i++) {
      if (m[i][c].n !== 0) {
        p = i
        break
      }
    }
    if (p < 0) continue
    ;[m[rank], m[p]] = [m[p], m[rank]]
    const pv = m[rank][c]
    m[rank] = m[rank].map((x) => fdiv(x, pv))
    for (let i = 0; i < m.length; i++) {
      if (i !== rank && m[i][c].n !== 0) {
        const f = m[i][c]
        m[i] = m[i].map((x, j) => fsub(x, fmul(f, m[rank][j])))
      }
    }
    rank++
  }
  for (let i = rank; i < m.length; i++) if (m[i][n].n !== 0) return { rank, sol: null }
  if (rank < n) return { rank, sol: null }
  return { rank, sol: range(n).map((c) => m[c][n]) }
}
const dotN = (a: number[], b: number[]): number => a.reduce((s, x, i) => s + x * b[i], 0)
const dotF = (a: number[], sol: Frac[]): Frac => a.reduce((s, x, i) => fadd(s, fmul(F(x), sol[i])), F(0))
const vec = (n: number, idx: number[]): number[] => {
  const v = Array<number>(n).fill(0)
  for (const i of idx) v[i] += 1
  return v
}
const sameVec = (a: number[], b: number[]): boolean => a.length === b.length && a.every((x, i) => x === b[i])

function formStr(coef: number[], names: string[], h: number[]): string {
  const idx = range(coef.length).filter((i) => coef[i] !== 0)
  idx.sort((x, y) => (coef[y] > 0 ? 1 : 0) - (coef[x] > 0 ? 1 : 0))
  const total = dotN(coef, h)
  if (idx.length === 1 && coef[idx[0]] === 1) return `${names[idx[0]]} = ${total}`
  const sym: string[] = []
  const num: string[] = []
  idx.forEach((i, k) => {
    const c = coef[i]
    const a = Math.abs(c)
    const sName = `${a === 1 ? '' : a}${names[i]}`
    const nv = a === 1 ? String(h[i]) : `${a} × ${h[i]}`
    sym.push(k === 0 ? `${c < 0 ? '−' : ''}${sName}` : `${c < 0 ? '−' : '+'} ${sName}`)
    num.push(k === 0 ? `${c < 0 ? '−' : ''}${nv}` : `${c < 0 ? '−' : '+'} ${nv}`)
  })
  return `${sym.join(' ')} = ${num.join(' ')} = ${total}`
}

// constraint makers (each returns null when the hidden data do not allow a clean statement)
const cCount = (f: number[], hv: number, text: string, eq: string): LCons => ({ rows: [f], rhs: [hv], text, eq })
function cPct(num: number[], den: number[], hn: number, hd: number, text: (p: number) => string, eq: (p: number) => string): LCons | null {
  if ((hn * 100) % hd !== 0) return null
  const p = (hn * 100) / hd
  if (p < 5 || p > 95) return null
  return { rows: [num.map((x, i) => 100 * x - p * den[i])], rhs: [0], text: text(p), eq: eq(p) }
}
function cRatio(num: number[], den: number[], hn: number, hd: number, text: (r: number, s: number) => string, eq: (r: number, s: number) => string): LCons | null {
  if (hn <= 0 || hd <= 0) return null
  const g = gcd(hn, hd)
  const r = hn / g
  const s = hd / g
  if (r > 12 || s > 12 || r === s) return null
  return { rows: [num.map((x, i) => s * x - r * den[i])], rhs: [0], text: text(r, s), eq: eq(r, s) }
}
function cDiff(fa: number[], fb: number[], ha: number, hb: number, text: (k: number, aBigger: boolean) => string, eq: (k: number, aBigger: boolean) => string): LCons | null {
  if (ha === hb) return null
  const aBig = ha > hb
  const k = Math.abs(ha - hb)
  const row = aBig ? fa.map((x, i) => x - fb[i]) : fb.map((x, i) => x - fa[i])
  return { rows: [row], rhs: [k], text: text(k, aBig), eq: eq(k, aBig) }
}

export interface LinQ {
  id: string
  stem: string
  kind: 'int' | 'pct' | 'ratio'
  num: number[]
  den?: number[]
  wrong?: number[]
  wrongR?: [number, number][]
}
interface LPool {
  id: string
  make: () => LinQ
}
interface Fam {
  stimulus: Stimulus
  names: string[]
  h: number[]
  cons: LCons[]
  legend: string
  pool: LPool[]
}

function chooseCons(rng: Rng, first: LCons, cands: (LCons | null)[], n: number, maxStatements: number): LCons[] {
  const chosen: LCons[] = [first]
  let rows = [...first.rows]
  let rhs = [...first.rhs]
  let rank = gauss(rows, rhs, n).rank
  for (const c of rng.shuffle(cands.filter((x): x is LCons => x !== null))) {
    if (rank >= n) break
    const r2 = gauss([...rows, ...c.rows], [...rhs, ...c.rhs], n).rank
    if (r2 > rank) {
      chosen.push(c)
      rows = [...rows, ...c.rows]
      rhs = [...rhs, ...c.rhs]
      rank = r2
    }
  }
  need(rank === n && chosen.length <= maxStatements, 'statements do not determine the regions')
  return [first, ...rng.shuffle(chosen.slice(1))]
}

function finishLin(rng: Rng, q: LinQ, fam: Fam): QuestionDraft {
  const { h, names, cons } = fam
  const n = h.length
  const sol = gauss(cons.flatMap((c) => c.rows), cons.flatMap((c) => c.rhs), n).sol
  ensure(sol !== null, 'caselet system lost its unique solution')
  need(q.kind !== 'int' || !trivialForm(cons, q.num), 'question restates a given statement')
  const hv = dotN(q.num, h)
  ensure(feq(dotF(q.num, sol), F(hv)), `${q.id}: solved equations give ${fval(dotF(q.num, sol))} but hidden data give ${hv}`)
  const legend = fam.legend
  const eqs = cons.map((c) => c.eq).join('\n')
  const solLine = `Solving these equations: ${names.map((nm, i) => `${nm} = ${h[i]}`).join(', ')}`
  const head = `${legend}\nEquations from the statements:\n${eqs}\n${solLine}`
  let dq: Dq
  if (q.kind === 'int') {
    dq = { id: q.id, stem: q.stem, kind: 'int', v: lit(hv), expect: hv, wrong: q.wrong, why: `${head}\n${formStr(q.num, names, h)}` }
  } else {
    const den = q.den as number[]
    const hd = dotN(den, h)
    ensure(feq(dotF(den, sol), F(hd)), `${q.id}: denominator mismatch`)
    if (q.kind === 'pct') {
      dq = { id: q.id, stem: q.stem, kind: 'pct', v: asPct(lit(hv), lit(hd)), expect: (hv * 100) / hd, wrong: q.wrong, why: `${head}\nNumerator: ${formStr(q.num, names, h)}\nBase: ${formStr(den, names, h)}\nRequired % = ${hv}/${hd} × 100 = ${n2((hv * 100) / hd)}%` }
    } else {
      dq = {
        id: q.id,
        stem: q.stem,
        kind: 'ratio',
        ratio: [lit(hv), lit(hd)],
        expect: [hv, hd],
        wrongR: q.wrongR,
        why: `${head}\nFirst quantity: ${formStr(q.num, names, h)}\nSecond quantity: ${formStr(den, names, h)}`,
      }
    }
  }
  const out = finishDq(rng, dq, fam.stimulus, 'di-caselet')
  const dm = MAINS_DI_META.get(out)
  MAINS_CASELET_META.set(out, { id: q.id, kind: q.kind, num: q.num, den: q.den, cons: cons.map((c) => ({ rows: c.rows, rhs: c.rhs, text: c.text })), n, approx: dm?.approx })
  return out
}

function buildCaselet(rng: Rng, n: number, mkFam: (rng: Rng) => Fam): Group {
  const fam = mkFam(rng)
  const chosen: QuestionDraft[] = []
  const used = new Set<string>()
  for (const p of rng.shuffle(fam.pool)) {
    if (chosen.length >= n) break
    for (let i = 0; i < 12 && !used.has(p.id); i++) {
      try {
        const q = finishLin(rng, p.make(), fam)
        if (!chosen.some((c) => c.stem === q.stem)) {
          chosen.push(q)
          used.add(p.id)
        }
      } catch (e) {
        if (!(e instanceof Reject)) throw e
      }
    }
  }
  need(chosen.length === n, 'not enough caselet questions')
  need(chosen.some((q) => {
    const m = MAINS_CASELET_META.get(q)
    return m !== undefined && m.num.filter((x) => x !== 0).length + (m.den ? m.den.filter((x) => x !== 0).length : 0) >= 3
  }), 'no multi-term caselet question')
  return { stimulus: fam.stimulus, questions: chosen }
}

const trivialForm = (cons: LCons[], form: number[]): boolean => cons.some((c) => c.rows.length === 1 && c.rhs[0] !== 0 && sameVec(c.rows[0], form))
const clamp1 = (x: number): number => Math.max(1, x)

// ---------------------------------------------------------------- Venn-3 family
const V3_SKINS = [
  { u: 'students', v: 'play', items: ['cricket', 'football', 'hockey'], kind: 'games', total: (T: number) => `A college has ${T} students, each of whom may play any of the games cricket, football and hockey.` },
  { u: 'people', v: 'speak', items: ['Hindi', 'English', 'Tamil'], kind: 'languages', total: (T: number) => `A group of ${T} people was surveyed about the languages Hindi, English and Tamil.` },
  { u: 'employees', v: 'know', items: ['Python', 'Java', 'SQL'], kind: 'programming languages', total: (T: number) => `A company has ${T} employees, who were asked about the programming languages Python, Java and SQL.` },
  { u: 'residents', v: 'read', items: ['The Daily', 'The Chronicle', 'The Herald'], kind: 'newspapers', total: (T: number) => `A colony has ${T} residents, who were asked about the newspapers The Daily, The Chronicle and The Herald.` },
]
function famVenn3(rng: Rng): Fam {
  const sk = rng.pick(V3_SKINS)
  const [i1, i2, i3] = sk.items
  const { u, v, kind } = sk
  const n = 8
  const names = ['a', 'b', 'c', 'p', 'q', 'r', 't', 'n']
  const h = [rstep(rng, 20, 100, 10), rstep(rng, 20, 100, 10), rstep(rng, 20, 100, 10), rstep(rng, 10, 60, 10), rstep(rng, 10, 60, 10), rstep(rng, 10, 60, 10), rstep(rng, 10, 40, 10), rstep(rng, 10, 60, 10)]
  const T = sumOf(h)
  const S = (idx: number[]): string => idx.map((i) => names[i]).join(' + ')
  const val = (idx: number[]): number => sumOf(idx.map((i) => h[i]))
  const ones = vec(n, range(n))
  const A = [0, 3, 5, 6]
  const B = [1, 3, 4, 6]
  const C = [2, 4, 5, 6]
  const first: LCons = cCount(ones, T, sk.total(T), `${S(range(n))} = ${T}`)
  const cands: (LCons | null)[] = []
  ;([[A, i1], [B, i2], [C, i3]] as [number[], string][]).forEach(([X, it]) => {
    cands.push(cPct(vec(n, X), ones, val(X), T, (p) => `${p}% of the ${u} ${v} ${it}.`, (p) => `${S(X)} = ${p}% of ${T} = ${val(X)}`))
    cands.push(cCount(vec(n, X), val(X), `${val(X)} ${u} ${v} ${it}.`, `${S(X)} = ${val(X)}`))
  })
  cands.push(cCount(vec(n, [6]), h[6], `${h[6]} ${u} ${v} all the three ${kind}.`, `t = ${h[6]}`))
  cands.push(cCount(vec(n, [7]), h[7], `${h[7]} ${u} ${v} none of the three ${kind}.`, `n = ${h[7]}`))
  ;([[[3, 6], i1, i2], [[4, 6], i2, i3], [[5, 6], i1, i3]] as [number[], string, string][]).forEach(([X, a, b]) => {
    cands.push(cCount(vec(n, X), val(X), `${val(X)} ${u} ${v} both ${a} and ${b}, including those who ${v} all the three ${kind}.`, `${S(X)} = ${val(X)}`))
  })
  cands.push(cCount(vec(n, [3, 4, 5]), val([3, 4, 5]), `${val([3, 4, 5])} ${u} ${v} exactly two of the three ${kind}.`, `p + q + r = ${val([3, 4, 5])}`))
  cands.push(cCount(vec(n, [0, 1, 2]), val([0, 1, 2]), `${val([0, 1, 2])} ${u} ${v} exactly one of the three ${kind}.`, `a + b + c = ${val([0, 1, 2])}`))
  cands.push(cCount(vec(n, [3, 4, 5, 6]), val([3, 4, 5, 6]), `${val([3, 4, 5, 6])} ${u} ${v} at least two of the three ${kind}.`, `p + q + r + t = ${val([3, 4, 5, 6])}`))
  cands.push(cCount(vec(n, range(7)), T - h[7], `${T - h[7]} ${u} ${v} at least one of the three ${kind}.`, `a + b + c + p + q + r + t = ${T - h[7]}`))
  ;([[0, 1], [1, 2], [0, 2]] as [number, number][]).forEach(([x, y]) => {
    const ix = sk.items[x]
    const iy = sk.items[y]
    cands.push(cRatio(vec(n, [x]), vec(n, [y]), h[x], h[y], (r, s) => `The number of ${u} who ${v} only ${ix} and the number who ${v} only ${iy} are in the ratio ${r} : ${s}.`, (r, s) => `${names[x]} : ${names[y]} = ${r} : ${s}`))
    cands.push(cDiff(vec(n, [x]), vec(n, [y]), h[x], h[y], (k, big) => `The number of ${u} who ${v} only ${big ? ix : iy} is ${k} more than the number who ${v} only ${big ? iy : ix}.`, (k, big) => `${big ? names[x] : names[y]} − ${big ? names[y] : names[x]} = ${k}`))
  })
  cands.push(cRatio(vec(n, [6]), vec(n, [3, 4, 5]), h[6], val([3, 4, 5]), (r, s) => `The ratio of the number of ${u} who ${v} all the three ${kind} to the number who ${v} exactly two of them is ${r} : ${s}.`, (r, s) => `t : (p + q + r) = ${r} : ${s}`))
  const cons = chooseCons(rng, first, cands, n, 9)
  const legend = `Let a, b, c be the numbers who ${v} only ${i1}, only ${i2}, only ${i3}; p = ${i1} and ${i2} only; q = ${i2} and ${i3} only; r = ${i1} and ${i3} only; t = all three; n = none of the three.`
  const D: { id: string; bare: string; set: number[] }[] = [
    { id: 'oA', bare: `only ${i1}`, set: [0] },
    { id: 'oB', bare: `only ${i2}`, set: [1] },
    { id: 'oC', bare: `only ${i3}`, set: [2] },
    { id: 'pAB', bare: `${i1} and ${i2} but not ${i3}`, set: [3] },
    { id: 'pBC', bare: `${i2} and ${i3} but not ${i1}`, set: [4] },
    { id: 'pAC', bare: `${i1} and ${i3} but not ${i2}`, set: [5] },
    { id: 'ex2', bare: `exactly two of the three ${kind}`, set: [3, 4, 5] },
    { id: 'ge2', bare: `at least two of the three ${kind}`, set: [3, 4, 5, 6] },
    { id: 'ex1', bare: `exactly one of the three ${kind}`, set: [0, 1, 2] },
    { id: 'ge1', bare: `at least one of the three ${kind}`, set: range(7) },
    { id: 'nn', bare: `none of the three ${kind}`, set: [7] },
    { id: 'bAB', bare: `both ${i1} and ${i2}`, set: [3, 6] },
    { id: 'bBC', bare: `both ${i2} and ${i3}`, set: [4, 6] },
    { id: 'bAC', bare: `both ${i1} and ${i3}`, set: [5, 6] },
    { id: 'orAB', bare: `${i1} or ${i2} but not ${i3}`, set: [0, 1, 3] },
    { id: 'orBC', bare: `${i2} or ${i3} but not ${i1}`, set: [1, 2, 4] },
    { id: 'orAC', bare: `${i1} or ${i3} but not ${i2}`, set: [0, 2, 5] },
    { id: 'tA', bare: i1, set: A },
    { id: 'tB', bare: i2, set: B },
    { id: 'tC', bare: i3, set: C },
  ]
  const wrongsFor = (set: number[]): number[] => {
    const base = val(set)
    return [base + h[6], clamp1(base - h[6]), ...rng.sample(D, 4).map((d) => val(d.set))]
  }
  const pickD = (): { id: string; bare: string; set: number[] } => rng.pick(D)
  const cnt = (id: string): LPool => ({
    id,
    make: () => {
      const d = pickD()
      const f = vec(n, d.set)
      need(!trivialForm(cons, f), 'trivial question')
      return { id, stem: `How many ${u} ${v} ${d.bare}?`, kind: 'int', num: f, wrong: wrongsFor(d.set) }
    },
  })
  const oneOf = (item: string): number[] => (item === i1 ? A : item === i2 ? B : C)
  const pool: LPool[] = [
    cnt('cnt1'),
    cnt('cnt2'),
    {
      id: 'diff',
      make: () => {
        const [d1, d2] = rng.sample(D, 2)
        const a = val(d1.set)
        const b = val(d2.set)
        need(a !== b && d1.set.length + d2.set.length <= 7, 'unsuitable pair')
        const [hi, lo] = a > b ? [d1, d2] : [d2, d1]
        const f = vec(n, hi.set).map((x, i) => x - vec(n, lo.set)[i])
        return { id: 'diff', stem: `How many more ${u} ${v} ${hi.bare} than ${lo.bare}?`, kind: 'int', num: f, wrong: [a + b, val(hi.set), Math.abs(a - b) + h[6], clamp1(Math.abs(a - b) - h[6])] }
      },
    },
    {
      id: 'ratio',
      make: () => {
        const [d1, d2] = rng.sample(D, 2)
        const a = val(d1.set)
        const b = val(d2.set)
        return { id: 'ratio', stem: `What is the ratio of the number of ${u} who ${v} ${d1.bare} to the number of ${u} who ${v} ${d2.bare}?`, kind: 'ratio', num: vec(n, d1.set), den: vec(n, d2.set), wrongR: [[b, a], [a + h[6], b], [a, b + h[6]], [a + h[7], b]] }
      },
    },
    {
      id: 'pctOther',
      make: () => {
        const it = rng.pick(sk.items)
        const X = oneOf(it)
        const others = X.filter((i) => i !== (it === i1 ? 0 : it === i2 ? 1 : 2))
        const hv = val(others)
        return { id: 'pctOther', stem: `What percent of the ${u} who ${v} ${it} also ${v} at least one of the other two ${kind}?`, kind: 'pct', num: vec(n, others), den: vec(n, X), wrong: [(100 * (val(X) - hv)) / val(X), (100 * hv) / T, (100 * (hv - h[6])) / val(X)] }
      },
    },
    {
      id: 'pctOne',
      make: () => ({ id: 'pctOne', stem: `What percent of the ${u} who ${v} at least one of the three ${kind} ${v} exactly one of them?`, kind: 'pct', num: vec(n, [0, 1, 2]), den: vec(n, range(7)), wrong: [(100 * val([0, 1, 2])) / T, (100 * val([3, 4, 5, 6])) / (T - h[7]), (100 * (val([0, 1, 2]) + h[6])) / (T - h[7])] }),
    },
    {
      id: 'pctNone',
      make: () => ({ id: 'pctNone', stem: `What percent of the total number of ${u} ${v} none of the three ${kind}?`, kind: 'pct', num: vec(n, [7]), den: ones, wrong: [(100 * h[7]) / (T - h[7]), (100 * (T - val([0, 1, 2]))) / T, (100 * h[6]) / T] }),
    },
    {
      id: 'pctAll',
      make: () => ({ id: 'pctAll', stem: `The number of ${u} who ${v} all the three ${kind} is what percent of the number who ${v} at least two of them?`, kind: 'pct', num: vec(n, [6]), den: vec(n, [3, 4, 5, 6]), wrong: [(100 * h[6]) / val([3, 4, 5]), (100 * h[6]) / T, (100 * h[6]) / val([0, 1, 2, 3, 4, 5, 6])] }),
    },
    {
      id: 'pctOnly',
      make: () => {
        const k = rng.int(0, 2)
        const it = sk.items[k]
        const X = oneOf(it)
        return { id: 'pctOnly', stem: `What percent of the ${u} who ${v} ${it} ${v} only ${it}?`, kind: 'pct', num: vec(n, [k]), den: vec(n, X), wrong: [(100 * h[k]) / T, (100 * (val(X) - h[k])) / val(X), (100 * h[k]) / (val(X) - h[6])] }
      },
    },
  ]
  return { stimulus: { directions: DIRS.mixed, parts: [{ kind: 'text', paragraphs: [cons.map((c) => c.text).join(' ')] }] }, names, h, cons, legend, pool }
}

// ---------------------------------------------------------------- region x gender family
const RG_SKINS = [
  { u: 'employees', regs: ['North', 'East', 'West'], m: 'male employees', f: 'female employees', total: (T: number) => `A company has ${T} employees working in three plants: North, East and West.`, inR: (r: string) => `in the ${r} plant` },
  { u: 'students', regs: ['School A', 'School B', 'School C'], m: 'boys', f: 'girls', total: (T: number) => `Three schools A, B and C of a town have ${T} students in all.`, inR: (r: string) => `in ${r}` },
  { u: 'voters', regs: ['Ward 1', 'Ward 2', 'Ward 3'], m: 'men', f: 'women', total: (T: number) => `A constituency has ${T} voters spread over three wards.`, inR: (r: string) => `in ${r}` },
]
const RG_PAIRS: [number, number][] = [[3, 2], [2, 3], [3, 1], [1, 3], [4, 3], [3, 4], [5, 3], [3, 5], [2, 1], [1, 2], [5, 4], [4, 5], [7, 3], [3, 7]]
function famRegionGender(rng: Rng): Fam {
  const sk = rng.pick(RG_SKINS)
  const { u, regs } = sk
  const n = 6
  const names = ['m1', 'f1', 'm2', 'f2', 'm3', 'f3']
  const legend = `Let m1, m2, m3 = ${sk.m} ${sk.inR(regs[0])}, ${sk.inR(regs[1])}, ${sk.inR(regs[2])} and f1, f2, f3 = ${sk.f} in the same order.`
  // hidden: region totals in a small ratio, gender split by a ratio
  const rat = rng.sample([2, 3, 4, 5, 6, 7], 3)
  const k = rstep(rng, 20, 60, 20)
  const tot = rat.map((x) => x * k)
  const h: number[] = []
  for (let i = 0; i < 3; i++) {
    const options = RG_PAIRS.filter(([r, s]) => (tot[i] * r) % (r + s) === 0)
    need(options.length > 0, 'no gender ratio fits')
    const [r, s] = rng.pick(options)
    const male = (tot[i] * r) / (r + s)
    h.push(male, tot[i] - male)
  }
  const T = sumOf(h)
  const M = [0, 2, 4]
  const Fm = [1, 3, 5]
  const S = (idx: number[]): string => idx.map((i) => names[i]).join(' + ')
  const val = (idx: number[]): number => sumOf(idx.map((i) => h[i]))
  const ones = vec(n, range(n))
  const first: LCons = cCount(ones, T, sk.total(T), `${S(range(n))} = ${T}`)
  const cands: (LCons | null)[] = []
  const regT = (i: number): number[] => [2 * i, 2 * i + 1]
  // region-total ratio (triple, two equations)
  {
    const g = gcd(gcd(val(regT(0)), val(regT(1))), val(regT(2)))
    const a = val(regT(0)) / g
    const b = val(regT(1)) / g
    const c = val(regT(2)) / g
    if (a <= 12 && b <= 12 && c <= 12) {
      const r1 = vec(n, regT(1)).map((x, i) => x * a - vec(n, regT(0))[i] * b)
      const r2 = vec(n, regT(2)).map((x, i) => x * b - vec(n, regT(1))[i] * c)
      cands.push({ rows: [r1, r2], rhs: [0, 0], text: `The numbers of ${u} ${sk.inR(regs[0])}, ${sk.inR(regs[1])} and ${sk.inR(regs[2])} are in the ratio ${a} : ${b} : ${c}.`, eq: `(${S(regT(0))}) : (${S(regT(1))}) : (${S(regT(2))}) = ${a} : ${b} : ${c}` })
    }
  }
  for (let i = 0; i < 3; i++) {
    cands.push(cRatio(vec(n, [2 * i]), vec(n, [2 * i + 1]), h[2 * i], h[2 * i + 1], (r, s) => `${cap(sk.inR(regs[i]))}, the ratio of ${sk.m} to ${sk.f} is ${r} : ${s}.`, (r, s) => `m${i + 1} : f${i + 1} = ${r} : ${s}`))
    cands.push(cPct(vec(n, [2 * i + 1]), vec(n, regT(i)), h[2 * i + 1], val(regT(i)), (p) => `${p}% of the ${u} ${sk.inR(regs[i])} are ${sk.f}.`, (p) => `f${i + 1} = ${p}% of (m${i + 1} + f${i + 1})`))
    cands.push(cPct(vec(n, [2 * i]), vec(n, M), h[2 * i], val(M), (p) => `${cap(regs[i])} has ${p}% of all the ${sk.m}.`, (p) => `m${i + 1} = ${p}% of (m1 + m2 + m3)`))
    cands.push(cPct(vec(n, [2 * i + 1]), vec(n, Fm), h[2 * i + 1], val(Fm), (p) => `${cap(regs[i])} has ${p}% of all the ${sk.f}.`, (p) => `f${i + 1} = ${p}% of (f1 + f2 + f3)`))
    cands.push(cCount(vec(n, [2 * i]), h[2 * i], `There are ${h[2 * i]} ${sk.m} ${sk.inR(regs[i])}.`, `m${i + 1} = ${h[2 * i]}`))
    cands.push(cCount(vec(n, regT(i)), val(regT(i)), `There are ${val(regT(i))} ${u} ${sk.inR(regs[i])}.`, `${S(regT(i))} = ${val(regT(i))}`))
  }
  cands.push(cPct(vec(n, M), ones, val(M), T, (p) => `${p}% of all the ${u} are ${sk.m.split(' ')[0] === 'male' ? 'male' : sk.m}.`, (p) => `m1 + m2 + m3 = ${p}% of ${T} = ${val(M)}`))
  cands.push(cCount(vec(n, M), val(M), `The total number of ${sk.m} is ${val(M)}.`, `m1 + m2 + m3 = ${val(M)}`))
  cands.push(cCount(vec(n, Fm), val(Fm), `The total number of ${sk.f} is ${val(Fm)}.`, `f1 + f2 + f3 = ${val(Fm)}`))
  for (const [x, y] of [[0, 1], [1, 2], [0, 2]] as [number, number][]) {
    cands.push(cDiff(vec(n, [2 * x + 1]), vec(n, [2 * y + 1]), h[2 * x + 1], h[2 * y + 1], (kk, big) => `The number of ${sk.f} ${sk.inR(regs[big ? x : y])} is ${kk} more than that ${sk.inR(regs[big ? y : x])}.`, (kk, big) => `f${big ? x + 1 : y + 1} − f${big ? y + 1 : x + 1} = ${kk}`))
    cands.push(cDiff(vec(n, [2 * x]), vec(n, [2 * y]), h[2 * x], h[2 * y], (kk, big) => `The number of ${sk.m} ${sk.inR(regs[big ? x : y])} is ${kk} more than that ${sk.inR(regs[big ? y : x])}.`, (kk, big) => `m${big ? x + 1 : y + 1} − m${big ? y + 1 : x + 1} = ${kk}`))
  }
  const cons = chooseCons(rng, first, cands, n, 8)
  const R = (i: number): string => sk.inR(regs[i])
  const trivialOk = (f: number[]): void => need(!trivialForm(cons, f), 'trivial')
  const pool: LPool[] = [
    {
      id: 'regTotal',
      make: () => {
        const i = rng.int(0, 2)
        const f = vec(n, regT(i))
        trivialOk(f)
        return { id: 'regTotal', stem: `How many ${u} are there ${R(i)}?`, kind: 'int', num: f, wrong: [val(regT((i + 1) % 3)), h[2 * i], val(Fm), (val(regT(i)) + val(regT((i + 1) % 3))) / 2] }
      },
    },
    {
      id: 'femReg',
      make: () => {
        const i = rng.int(0, 2)
        const f = vec(n, [2 * i + 1])
        trivialOk(f)
        return { id: 'femReg', stem: `How many ${sk.f} are there ${R(i)}?`, kind: 'int', num: f, wrong: [h[2 * i], val(regT(i)), h[(2 * i + 3) % 6], val(Fm) - h[2 * i + 1]] }
      },
    },
    {
      id: 'totMale',
      make: () => {
        const f = vec(n, M)
        trivialOk(f)
        return { id: 'totMale', stem: `What is the total number of ${sk.m} in all the three ${regs[0].startsWith('School') ? 'schools' : regs[0].startsWith('Ward') ? 'wards' : 'plants'}?`, kind: 'int', num: f, wrong: [val(Fm), T - h[0], val(M) - h[2], T / 2] }
      },
    },
    {
      id: 'diffMF',
      make: () => {
        const [i, j] = two(rng, 3)
        const a = h[2 * i]
        const b = h[2 * j + 1]
        need(a !== b, 'equal')
        const [pi, pj] = a > b ? [vec(n, [2 * i]), vec(n, [2 * j + 1])] : [vec(n, [2 * j + 1]), vec(n, [2 * i])]
        return { id: 'diffMF', stem: `What is the difference between the number of ${sk.m} ${R(i)} and the number of ${sk.f} ${R(j)}?`, kind: 'int', num: pi.map((x, t) => x - pj[t]), wrong: [a + b, Math.abs(h[2 * i + 1] - h[2 * j]), Math.abs(val(regT(i)) - val(regT(j))), Math.abs(a - h[2 * j])] }
      },
    },
    {
      id: 'pctFemReg',
      make: () => {
        const i = rng.int(0, 2)
        const f = vec(n, [2 * i + 1])
        trivialOk(f)
        return { id: 'pctFemReg', stem: `The number of ${sk.f} ${R(i)} is {ly}what percent of the total number of ${u} ${R(i)}?`, kind: 'pct', num: f, den: vec(n, regT(i)), wrong: [(100 * h[2 * i]) / val(regT(i)), (100 * h[2 * i + 1]) / T, (100 * h[2 * i + 1]) / val(Fm)] }
      },
    },
    {
      id: 'ratioMF',
      make: () => ({ id: 'ratioMF', stem: `What is the ratio of the total number of ${sk.m} to the total number of ${sk.f}?`, kind: 'ratio', num: vec(n, M), den: vec(n, Fm), wrongR: [[val(Fm), val(M)], [val(M), T], [val(M) + h[0], val(Fm)]] }),
    },
    {
      id: 'ratioMix',
      make: () => {
        const [i, j] = two(rng, 3)
        return { id: 'ratioMix', stem: `What is the ratio of the number of ${sk.m} ${R(i)} to the number of ${sk.f} ${R(j)}?`, kind: 'ratio', num: vec(n, [2 * i]), den: vec(n, [2 * j + 1]), wrongR: [[h[2 * j + 1], h[2 * i]], [h[2 * i], h[2 * j]], [h[2 * i + 1], h[2 * j + 1]]] }
      },
    },
    {
      id: 'pctShare',
      make: () => {
        const [i, j] = two(rng, 3)
        return { id: 'pctShare', stem: `The total number of ${sk.m} ${R(i)} and ${R(j)} together is {ly}what percent of the total number of ${u}?`, kind: 'pct', num: vec(n, [2 * i, 2 * j]), den: ones, wrong: [(100 * (h[2 * i] + h[2 * j])) / val(M), (100 * (val(regT(i)) + val(regT(j)))) / T, (100 * (h[2 * i + 1] + h[2 * j + 1])) / T] }
      },
    },
    {
      id: 'sumFemTwo',
      make: () => {
        const [i, j] = two(rng, 3)
        const f = vec(n, [2 * i + 1, 2 * j + 1])
        trivialOk(f)
        return { id: 'sumFemTwo', stem: `How many ${sk.f} are there ${R(i)} and ${R(j)} together?`, kind: 'int', num: f, wrong: [h[2 * i + 1] + h[2 * j], val(regT(i)) + val(regT(j)), h[2 * i] + h[2 * j], val(Fm)] }
      },
    },
  ]
  return { stimulus: { directions: DIRS.mixed, parts: [{ kind: 'text', paragraphs: [cons.map((c) => c.text).join(' ')] }] }, names, h, cons, legend, pool }
}

// ---------------------------------------------------------------- two-set Venn x gender family
const SG_SKINS = [
  { u: 'members', m: 'men', f: 'women', t: 'tea', c: 'coffee', v: 'drink', total: (T: number) => `A club has ${T} members, each of whom may drink tea, coffee, both or neither.` },
  { u: 'students', m: 'boys', f: 'girls', t: 'cricket', c: 'football', v: 'play', total: (T: number) => `A school has ${T} students, each of whom may play cricket, football, both or neither.` },
  { u: 'employees', m: 'male employees', f: 'female employees', t: 'Hindi', c: 'English', v: 'know', total: (T: number) => `An office has ${T} employees, each of whom may know Hindi, English, both or neither.` },
]
function famSetsGender(rng: Rng): Fam {
  const sk = rng.pick(SG_SKINS)
  const { u, m, f, t, c, v } = sk
  const n = 8
  const names = ['mt', 'mc', 'mb', 'mn', 'ft', 'fc', 'fb', 'fn']
  const legend = `Let mt, mc, mb, mn = ${m} who ${v} only ${t}, only ${c}, both, neither; ft, fc, fb, fn = the same for ${f}.`
  const h = range(n).map(() => rstep(rng, 20, 150, 10))
  const T = sumOf(h)
  const S = (idx: number[]): string => idx.map((i) => names[i]).join(' + ')
  const val = (idx: number[]): number => sumOf(idx.map((i) => h[i]))
  const ones = vec(n, range(n))
  const M = [0, 1, 2, 3]
  const Fm = [4, 5, 6, 7]
  const Mt = [0, 2]
  const Mc = [1, 2]
  const Ft = [4, 6]
  const Fc = [5, 6]
  const first: LCons = cCount(ones, T, sk.total(T), `${S(range(n))} = ${T}`)
  const cands: (LCons | null)[] = []
  cands.push(cRatio(vec(n, M), vec(n, Fm), val(M), val(Fm), (r, s) => `The ratio of ${m} to ${f} is ${r} : ${s}.`, (r, s) => `(mt + mc + mb + mn) : (ft + fc + fb + fn) = ${r} : ${s}`))
  cands.push(cPct(vec(n, Mt), vec(n, M), val(Mt), val(M), (p) => `${p}% of the ${m} ${v} ${t} (some of them ${v} ${c} as well).`, (p) => `mt + mb = ${p}% of (mt + mc + mb + mn)`))
  cands.push(cPct(vec(n, Mc), vec(n, M), val(Mc), val(M), (p) => `${p}% of the ${m} ${v} ${c} (some of them ${v} ${t} as well).`, (p) => `mc + mb = ${p}% of (mt + mc + mb + mn)`))
  cands.push(cPct(vec(n, Ft), vec(n, Fm), val(Ft), val(Fm), (p) => `${p}% of the ${f} ${v} ${t} (some of them ${v} ${c} as well).`, (p) => `ft + fb = ${p}% of (ft + fc + fb + fn)`))
  cands.push(cPct(vec(n, Fc), vec(n, Fm), val(Fc), val(Fm), (p) => `${p}% of the ${f} ${v} ${c} (some of them ${v} ${t} as well).`, (p) => `fc + fb = ${p}% of (ft + fc + fb + fn)`))
  cands.push(cCount(vec(n, [2, 6]), val([2, 6]), `${val([2, 6])} ${u} ${v} both ${t} and ${c}.`, `mb + fb = ${val([2, 6])}`))
  cands.push(cCount(vec(n, [3, 7]), val([3, 7]), `${val([3, 7])} ${u} ${v} neither ${t} nor ${c}.`, `mn + fn = ${val([3, 7])}`))
  cands.push(cCount(vec(n, [0, 2, 4, 6]), val([0, 2, 4, 6]), `${val([0, 2, 4, 6])} ${u} ${v} ${t}.`, `mt + mb + ft + fb = ${val([0, 2, 4, 6])}`))
  cands.push(cCount(vec(n, [1, 2, 5, 6]), val([1, 2, 5, 6]), `${val([1, 2, 5, 6])} ${u} ${v} ${c}.`, `mc + mb + fc + fb = ${val([1, 2, 5, 6])}`))
  cands.push(cCount(vec(n, Ft), val(Ft), `${val(Ft)} ${f} ${v} ${t}.`, `ft + fb = ${val(Ft)}`))
  cands.push(cCount(vec(n, Mc), val(Mc), `${val(Mc)} ${m} ${v} ${c}.`, `mc + mb = ${val(Mc)}`))
  cands.push(cRatio(vec(n, [2]), vec(n, [6]), h[2], h[6], (r, s) => `The number of ${m} who ${v} both ${t} and ${c} and the number of ${f} who ${v} both are in the ratio ${r} : ${s}.`, (r, s) => `mb : fb = ${r} : ${s}`))
  cands.push(cRatio(vec(n, [3]), vec(n, [7]), h[3], h[7], (r, s) => `The number of ${m} who ${v} neither and the number of ${f} who ${v} neither are in the ratio ${r} : ${s}.`, (r, s) => `mn : fn = ${r} : ${s}`))
  cands.push(cPct(vec(n, [7]), vec(n, [3, 7]), h[7], h[3] + h[7], (p) => `${p}% of those who ${v} neither ${t} nor ${c} are ${f}.`, (p) => `fn = ${p}% of (mn + fn)`))
  cands.push(cPct(vec(n, [6]), vec(n, [2, 6]), h[6], h[2] + h[6], (p) => `${p}% of those who ${v} both ${t} and ${c} are ${f}.`, (p) => `fb = ${p}% of (mb + fb)`))
  cands.push(cDiff(vec(n, [4]), vec(n, [0]), h[4], h[0], (k, big) => `The number of ${big ? f : m} who ${v} only ${t} is ${k} more than the number of ${big ? m : f} who ${v} only ${t}.`, (k, big) => `${big ? 'ft' : 'mt'} − ${big ? 'mt' : 'ft'} = ${k}`))
  cands.push(cDiff(vec(n, [1]), vec(n, [5]), h[1], h[5], (k, big) => `The number of ${big ? m : f} who ${v} only ${c} is ${k} more than the number of ${big ? f : m} who ${v} only ${c}.`, (k, big) => `${big ? 'mc' : 'fc'} − ${big ? 'fc' : 'mc'} = ${k}`))
  const cons = chooseCons(rng, first, cands, n, 10)
  const trivialOk = (form: number[]): void => need(!trivialForm(cons, form), 'trivial')
  const G: { id: string; bare: string; set: number[] }[] = [
    { id: 'onlyT', bare: `only ${t}`, set: [0, 4] },
    { id: 'onlyC', bare: `only ${c}`, set: [1, 5] },
    { id: 'both', bare: `both ${t} and ${c}`, set: [2, 6] },
    { id: 'neither', bare: `neither ${t} nor ${c}`, set: [3, 7] },
    { id: 'anyT', bare: t, set: [0, 2, 4, 6] },
    { id: 'anyC', bare: c, set: [1, 2, 5, 6] },
    { id: 'atLeast', bare: `at least one of ${t} and ${c}`, set: [0, 1, 2, 4, 5, 6] },
    { id: 'exactlyOne', bare: `exactly one of ${t} and ${c}`, set: [0, 1, 4, 5] },
  ]
  const pool: LPool[] = [
    {
      id: 'cntBoth',
      make: () => {
        const d = rng.pick(G)
        const gset = rng.pick([M, Fm])
        const form = vec(n, d.set.filter((i) => gset.includes(i)))
        trivialOk(form)
        const who = gset === M ? m : f
        return { id: 'cntBoth', stem: `How many ${who} ${v} ${d.bare}?`, kind: 'int', num: form, wrong: [val(d.set), val(d.set.filter((i) => !gset.includes(i))), val(gset) - val(d.set.filter((i) => gset.includes(i))), val(gset.filter((i) => d.set.includes(i - 4) || d.set.includes(i + 4)))] }
      },
    },
    {
      id: 'cntAll',
      make: () => {
        const d = rng.pick(G)
        const form = vec(n, d.set)
        trivialOk(form)
        return { id: 'cntAll', stem: `How many ${u} ${v} ${d.bare}?`, kind: 'int', num: form, wrong: [val(d.set) - h[2] - h[6], val(d.set) + h[2] + h[6], val(M.filter((i) => d.set.includes(i))), val(Fm.filter((i) => d.set.includes(i)))] }
      },
    },
    {
      id: 'diff',
      make: () => {
        const d1 = rng.pick(G)
        const gset = rng.pick([M, Fm])
        const other = gset === M ? Fm : M
        const a = val(d1.set.filter((i) => gset.includes(i)))
        const d2 = rng.pick(G)
        const b = val(d2.set.filter((i) => other.includes(i)))
        need(a !== b && d1.id !== d2.id, 'equal')
        const fa = vec(n, d1.set.filter((i) => gset.includes(i)))
        const fb = vec(n, d2.set.filter((i) => other.includes(i)))
        const form = a > b ? fa.map((x, i) => x - fb[i]) : fb.map((x, i) => x - fa[i])
        const wa = gset === M ? m : f
        const wb = gset === M ? f : m
        const [pa, pb, ba, bb] = a > b ? [wa, wb, d1.bare, d2.bare] : [wb, wa, d2.bare, d1.bare]
        return { id: 'diff', stem: `How many more ${pa} ${v} ${ba} than ${pb} ${v} ${bb}?`, kind: 'int', num: form, wrong: [a + b, a, b, Math.abs(a - b) + 10] }
      },
    },
    {
      id: 'pctOfGender',
      make: () => {
        const d = rng.pick(G.filter((x) => x.id !== 'neither'))
        const gset = rng.pick([M, Fm])
        const who = gset === M ? m : f
        const num = vec(n, d.set.filter((i) => gset.includes(i)))
        trivialOk(num)
        return { id: 'pctOfGender', stem: `The number of ${who} who ${v} ${d.bare} is {ly}what percent of the total number of ${who}?`, kind: 'pct', num, den: vec(n, gset), wrong: [(100 * val(d.set.filter((i) => gset.includes(i)))) / T, (100 * val(d.set.filter((i) => gset.includes(i)))) / val(d.set), (100 * val(d.set.filter((i) => gset.includes(i)))) / (val(gset) - h[gset === M ? 3 : 7])] }
      },
    },
    {
      id: 'ratioGen',
      make: () => {
        const d = rng.pick(G)
        const a = val(d.set.filter((i) => M.includes(i)))
        const b = val(d.set.filter((i) => Fm.includes(i)))
        return { id: 'ratioGen', stem: `What is the ratio of the number of ${m} to the number of ${f} who ${v} ${d.bare}?`, kind: 'ratio', num: vec(n, d.set.filter((i) => M.includes(i))), den: vec(n, d.set.filter((i) => Fm.includes(i))), wrongR: [[b, a], [val(M), val(Fm)], [a + 10, b]] }
      },
    },
    {
      id: 'pctShareT',
      make: () => {
        const d = rng.pick(G.filter((x) => x.id === 'anyT' || x.id === 'anyC' || x.id === 'both' || x.id === 'onlyT' || x.id === 'onlyC'))
        const num = vec(n, d.set.filter((i) => Fm.includes(i)))
        return { id: 'pctShareT', stem: `What percent of the ${u} who ${v} ${d.bare} are ${f}?`, kind: 'pct', num, den: vec(n, d.set), wrong: [(100 * val(d.set.filter((i) => M.includes(i)))) / val(d.set), (100 * val(d.set.filter((i) => Fm.includes(i)))) / T, (100 * val(d.set.filter((i) => Fm.includes(i)))) / val(Fm)] }
      },
    },
    {
      id: 'pctNeither',
      make: () => ({ id: 'pctNeither', stem: `What percent of the total number of ${u} ${v} neither ${t} nor ${c}?`, kind: 'pct', num: vec(n, [3, 7]), den: ones, wrong: [(100 * h[3]) / val(M), (100 * h[7]) / val(Fm), (100 * val([3, 7])) / (T - val([3, 7]))] }),
    },
    {
      id: 'cntMix',
      make: () => {
        const d1 = rng.pick(G.filter((x) => x.id === 'onlyT' || x.id === 'onlyC' || x.id === 'both'))
        const d2 = rng.pick(G.filter((x) => x.id === 'neither' || x.id === 'anyT' || x.id === 'anyC'))
        const set = [...d1.set.filter((i) => M.includes(i)), ...d2.set.filter((i) => Fm.includes(i))]
        const form = vec(n, set)
        trivialOk(form)
        return { id: 'cntMix', stem: `What is the total number of ${m} who ${v} ${d1.bare} and ${f} who ${v} ${d2.bare}?`, kind: 'int', num: form, wrong: [val(d1.set) + val(d2.set), val(set) - h[2], val(d1.set.filter((i) => M.includes(i))) + val(d2.set), val(set) + h[6]] }
      },
    },
  ]
  return { stimulus: { directions: DIRS.mixed, parts: [{ kind: 'text', paragraphs: [cons.map((c) => c.text).join(' ')] }] }, names, h, cons, legend, pool }
}

function genCaselets(): TopicGenerator {
  const fams = [famVenn3, famRegionGender, famSetsGender]
  return (rng, _d, count) => {
    const groups: Group[] = []
    let left = count
    const order = rng.shuffle(range(fams.length))
    let k = 0
    while (left > 0) {
      const n = Math.min(5, left)
      let made: Group | null = null
      for (let tries = 0; tries < 200 && !made; tries++) {
        const fam = fams[order[(k + (tries >= 60 ? tries : 0)) % order.length]]
        try {
          made = buildCaselet(rng, n, fam)
        } catch (e) {
          if (!(e instanceof Reject)) throw e
        }
      }
      if (!made) throw new Error('di-caselet: could not build a set')
      groups.push(made)
      left -= n
      k++
    }
    return groups
  }
}

export const MAINS_DI: Partial<Record<QuantTopicId, TopicGenerator>> = {
  'di-table': mkGen('di-table', [scnPopTable, scnMissingTable, scnShopTable]),
  'di-bar': mkGen('di-bar', [scnLinkedBars, scnStackedBar, scnIncExpBar]),
  'di-pie': mkGen('di-pie', [scnPopPie, scnTwoPies, scnPieChange]),
  'di-line': mkGen('di-line', [scnProfitLine, scnGrowthLine, scnUnitsPriceLine]),
  'di-caselet': genCaselets(),
}
