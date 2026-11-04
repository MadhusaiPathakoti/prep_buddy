// Data-interpretation sets: table, bar, line, pie.
// Every question is a small expression (a "recipe") over cells of the rendered stimulus. The generator evaluates it
// twice (once from the raw arrays while building, once from the rendered stimulus parts) and the harness evaluates
// it a third time with its own evaluator, so the key can never drift from what the candidate actually sees.
import type { Rng } from '../rng'
import type { Group, MockDifficulty, QuestionDraft, Stimulus, StimulusPart } from '../types'
import { F, Reject, decStr, ensure, fadd, fcmp, fdec, fdiv, feq, fmul, fsub, fval, need, numQ, ratioStr, strQ, terminating, gcd, decOf } from './util'
import type { Frac } from './util'

// ------------------------------------------------------------------ recipes
export type Rc =
  | { t: 'num'; v: number }
  /** a number printed in the stimulus text (caselet data, pie totals): the harness checks it really appears there. */
  | { t: 'txt'; v: number }
  /** table: rows[r][c + 1]; bar/line: series[r].values[c]; pie: slices[c].value */
  | { t: 'ref'; p: number; r: number; c: number }
  | { t: 'op'; o: '+' | '-' | '*' | '/'; a: Rc; b: Rc }

export interface DiMeta {
  /** value: rcs[0]; ratio: rcs[0] : rcs[1]; label: rcs[i] belongs to labels[i], answer = extreme. */
  kind: 'value' | 'ratio' | 'label'
  rcs: Rc[]
  labels?: string[]
  extreme?: 'max' | 'min'
  /** 'approx' answers are the rounded value. */
  round?: boolean
}
export const DI_META = new WeakMap<object, DiMeta>()

export interface V {
  val: Frac
  rc: Rc
}
export const lit = (n: number): V => ({ val: F(n), rc: { t: 'num', v: n } })
export const txt = (n: number): V => ({ val: F(n), rc: { t: 'txt', v: n } })
function bin(o: '+' | '-' | '*' | '/', a: V, b: V): V {
  const val = o === '+' ? fadd(a.val, b.val) : o === '-' ? fsub(a.val, b.val) : o === '*' ? fmul(a.val, b.val) : fdiv(a.val, b.val)
  return { val, rc: { t: 'op', o, a: a.rc, b: b.rc } }
}
export const vadd = (a: V, b: V): V => bin('+', a, b)
export const vsub = (a: V, b: V): V => bin('-', a, b)
export const vmul = (a: V, b: V): V => bin('*', a, b)
export const vdiv = (a: V, b: V): V => bin('/', a, b)
export const vsum = (xs: V[]): V => xs.reduce((a, b) => vadd(a, b))
export const vavg = (xs: V[]): V => vdiv(vsum(xs), lit(xs.length))
export const vabs = (a: V, b: V): V => (fcmp(a.val, b.val) >= 0 ? vsub(a, b) : vsub(b, a))
export const pctOf = (a: V, b: V): V => vmul(vdiv(a, b), lit(100))

export function evalRc(rc: Rc, st: Stimulus): Frac {
  switch (rc.t) {
    case 'num':
    case 'txt':
      return F(rc.v)
    case 'ref': {
      const part = st.parts[rc.p]
      let x: number
      if (part.kind === 'table') x = Number(part.rows[rc.r][rc.c + 1])
      else if (part.kind === 'bar' || part.kind === 'line') x = part.series[rc.r].values[rc.c]
      else if (part.kind === 'pie') x = part.slices[rc.c].value
      else throw new Error('DI: ref into a text part')
      return fdec(x, 2)
    }
    case 'op': {
      const a = evalRc(rc.a, st)
      const b = evalRc(rc.b, st)
      return rc.o === '+' ? fadd(a, b) : rc.o === '-' ? fsub(a, b) : rc.o === '*' ? fmul(a, b) : fdiv(a, b)
    }
  }
}

// ------------------------------------------------------------------ text helpers
export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
export function listAnd(xs: string[]): string {
  if (xs.length <= 1) return xs.join('')
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}
export const fv = (v: V): string => decStr(v.val, 2)

// ------------------------------------------------------------------ grids
export interface Grid {
  series: string[]
  cats: string[]
  time: boolean
  /** sums over series are meaningful (production of companies, boys + girls…). */
  additive: boolean
  /** series are comparable peers (companies), so averaging across them makes sense. */
  peers?: boolean
  /** pies: category sums are not offered. */
  pie?: boolean
  /** sum over series is directly printed in the stimulus (derived totals), so asking for it is trivial. */
  trivialSum?: boolean
  catWord: string
  catPlural: string
  cell: (s: number, c: number) => V
  cellP: (s: number, c: number) => string
  serP: (s: number) => string
  sumCatsP: (agg: string, s: number, cs: number[]) => string
  /** "From 2018 to 2021" / "In School A, School B and School C together": the category set stated once. */
  catsPhrase: (cs: number[]) => string
  sumSerP: (agg: string, ss: number[], c: number) => string
  grandP: (agg: string) => string
  /** raw (percent-share / angle) access for pies */
  extra?: {
    share: (s: number, c: number) => V
    angle: (s: number, c: number) => V
    pie: boolean
    pct: boolean
  }
}

const contiguous = (cs: number[]): boolean => cs.every((c, i) => i === 0 || c === cs[i - 1] + 1)

export function styleTim(o: { noun: string; serPlural: string; series: string[]; cats: string[]; time: boolean; catWord: string; catPlural: string; ref: (s: number, c: number) => V }): Grid {
  const { noun, serPlural, series, cats, time } = o
  const catsText = (cs: number[]): string => (time && cs.length >= 3 && contiguous(cs) ? `from ${cats[cs[0]]} to ${cats[cs[cs.length - 1]]}` : `in ${listAnd(cs.map((c) => cats[c]))}`)
  const serText = (ss: number[]): string => (ss.length === series.length && ss.length > 2 ? `all the ${serPlural}` : listAnd(ss.map((s) => series[s])))
  return {
    series,
    cats,
    time,
    additive: true,
    peers: true,
    catWord: o.catWord,
    catPlural: o.catPlural,
    cell: o.ref,
    cellP: (s, c) => `the ${noun} of ${series[s]} in ${cats[c]}`,
    serP: (s) => `the ${noun} of ${series[s]}`,
    sumCatsP: (agg, s, cs) => `the ${agg} ${noun} of ${series[s]} ${catsText(cs)}`,
    catsPhrase: (cs) => (time && cs.length >= 3 && contiguous(cs) ? `From ${cats[cs[0]]} to ${cats[cs[cs.length - 1]]}` : `In ${listAnd(cs.map((c) => cats[c]))}`),
    sumSerP: (agg, ss, c) => `the ${agg} ${noun} of ${serText(ss)} in ${cats[c]}`,
    grandP: (agg) => `the ${agg} ${noun} of all the ${serPlural} over all the ${o.catPlural}`,
  }
}

export function styleIn(o: { allWord: string; suffix?: string; series: string[]; cats: string[]; catWord: string; catPlural: string; ref: (s: number, c: number) => V }): Grid {
  const { series, cats } = o
  const suf = o.suffix ?? ''
  return {
    series,
    cats,
    time: false,
    additive: true,
    catWord: o.catWord,
    catPlural: o.catPlural,
    cell: o.ref,
    cellP: (s, c) => `the number of ${series[s]}${suf} in ${cats[c]}`,
    serP: (s) => `the number of ${series[s]}${suf}`,
    sumCatsP: (agg, s, cs) => `the ${agg} number of ${series[s]}${suf} in ${listAnd(cs.map((c) => cats[c]))}`,
    catsPhrase: (cs) => `In ${listAnd(cs.map((c) => cats[c]))} together`,
    sumSerP: (agg, ss, c) => `the ${agg} number of ${ss.length === series.length ? o.allWord : listAnd(ss.map((s) => series[s]))}${suf} in ${cats[c]}`,
    grandP: (agg) => `the ${agg} number of ${o.allWord}${suf} in all the ${o.catPlural}`,
  }
}

export function styleOfc(o: { series: string[]; cats: string[]; catWord: string; catPlural: string; ref: (s: number, c: number) => V }): Grid {
  const { series, cats } = o
  return {
    series,
    cats,
    time: false,
    additive: false,
    catWord: o.catWord,
    catPlural: o.catPlural,
    cell: o.ref,
    cellP: (s, c) => `the ${series[s]} of ${cats[c]}`,
    serP: (s) => `the ${series[s]}`,
    sumCatsP: (agg, s, cs) => `the ${agg} ${series[s]} of ${listAnd(cs.map((c) => cats[c]))}`,
    catsPhrase: (cs) => `For ${listAnd(cs.map((c) => cats[c]))} together`,
    sumSerP: (_agg, ss, c) => `the sum of the ${listAnd(ss.map((s) => series[s]))} of ${cats[c]}`,
    grandP: (agg) => `the ${agg} ${series[0]} of all the ${o.catPlural}`,
  }
}

// ------------------------------------------------------------------ candidates & templates
export type Kind = 'int' | 'dec' | 'pct' | 'ratio' | 'label'
export interface Cand {
  id: string
  stem: string
  kind: Kind
  v?: V
  ratio?: [V, V]
  wrong: (V | number)[]
  why: string
  labels?: string[]
  lv?: V[]
  extreme?: 'max' | 'min'
}
type Template = (rng: Rng, g: Grid, d: MockDifficulty) => Cand | null

function cells2(rng: Rng, g: Grid, d: MockDifficulty): [[number, number], [number, number]] {
  const S = g.series.length
  const C = g.cats.length
  const mode = S > 1 ? rng.int(0, d === 'hard' ? 3 : 2) : 2
  if (mode < 2) {
    const [s1, s2] = rng.sample([...Array(S).keys()], 2)
    const c = rng.int(0, C - 1)
    return [[s1, c], [s2, c]]
  }
  if (mode === 3) {
    const [s1, s2] = rng.sample([...Array(S).keys()], 2)
    const [c1, c2] = rng.sample([...Array(C).keys()], 2)
    return [[s1, c1], [s2, c2]]
  }
  const s = rng.int(0, S - 1)
  const [c1, c2] = rng.sample([...Array(C).keys()], 2)
  return [[s, c1], [s, c2]]
}
function catRange(rng: Rng, g: Grid, min = 3): number[] {
  const C = g.cats.length
  if (g.time) {
    const len = rng.int(min, Math.min(C, min + 2))
    const start = rng.int(0, C - len)
    return Array.from({ length: len }, (_, i) => start + i)
  }
  const len = rng.int(min, Math.min(C, min + 2))
  return rng.sample([...Array(C).keys()], len).sort((a, b) => a - b)
}
const pc = (g: Grid, [s, c]: [number, number]): string => g.cellP(s, c)
const vv = (g: Grid, [s, c]: [number, number]): V => g.cell(s, c)

const tDiff: Template = (rng, g, d) => {
  const x = cells2(rng, g, d)
  const [a, b] = [vv(g, x[0]), vv(g, x[1])]
  const v = vabs(a, b)
  return { id: 'diff', stem: `What is the difference between ${pc(g, x[0])} and ${pc(g, x[1])}?`, kind: 'int', v, wrong: [vadd(a, b)], why: `${cap(pc(g, x[0]))} = ${fv(a)}; ${pc(g, x[1])} = ${fv(b)}.\nDifference = ${fv(v)}.` }
}
const tSumCats: Template = (rng, g) => {
  if (g.pie) return null
  const s = rng.int(0, g.series.length - 1)
  const cs = catRange(rng, g, 3)
  const xs = cs.map((c) => g.cell(s, c))
  const v = vsum(xs)
  return { id: 'sumCats', stem: `What is ${g.sumCatsP('total', s, cs)}?`, kind: 'int', v, wrong: [vavg(xs)], why: `${xs.map(fv).join(' + ')} = ${fv(v)}.` }
}
const tAvgCats: Template = (rng, g) => {
  if (g.pie) return null
  const s = rng.int(0, g.series.length - 1)
  const cs = catRange(rng, g, 3)
  const xs = cs.map((c) => g.cell(s, c))
  const v = vavg(xs)
  return { id: 'avgCats', stem: `What is ${g.sumCatsP('average', s, cs)}?`, kind: 'dec', v, wrong: [vsum(xs)], why: `(${xs.map(fv).join(' + ')}) ÷ ${xs.length} = ${fv(v)}.` }
}
const tSumSer: Template = (rng, g) => {
  if (!g.additive || g.trivialSum || g.series.length < 2) return null
  const c = rng.int(0, g.cats.length - 1)
  const all = [...Array(g.series.length).keys()]
  const ss = g.series.length > 2 && rng.chance(0.4) ? rng.sample(all, 2).sort() : all
  const xs = ss.map((s) => g.cell(s, c))
  const v = vsum(xs)
  return { id: 'sumSer', stem: `What is ${g.sumSerP('total', ss, c)}?`, kind: 'int', v, wrong: [vavg(xs)], why: `${xs.map(fv).join(' + ')} = ${fv(v)}.` }
}
const tAvgSer: Template = (rng, g) => {
  if (!g.additive || !g.peers || g.series.length < 3) return null
  const c = rng.int(0, g.cats.length - 1)
  const all = [...Array(g.series.length).keys()]
  const xs = all.map((s) => g.cell(s, c))
  const v = vavg(xs)
  return { id: 'avgSer', stem: `What is ${g.sumSerP('average', all, c)}?`, kind: 'dec', v, wrong: [vsum(xs)], why: `(${xs.map(fv).join(' + ')}) ÷ ${xs.length} = ${fv(v)}.` }
}
const tRatio: Template = (rng, g, d) => {
  const x = cells2(rng, g, d)
  const [a, b] = [vv(g, x[0]), vv(g, x[1])]
  return { id: 'ratio', stem: `What is the ratio of ${pc(g, x[0])} to ${pc(g, x[1])}?`, kind: 'ratio', ratio: [a, b], wrong: [], why: `${cap(pc(g, x[0]))} = ${fv(a)}; ${pc(g, x[1])} = ${fv(b)}.\nRatio = ${fv(a)} : ${fv(b)}.` }
}
const tPctOf: Template = (rng, g, d) => {
  const x = cells2(rng, g, d)
  const [a, b] = [vv(g, x[0]), vv(g, x[1])]
  const v = pctOf(a, b)
  return { id: 'pctOf', stem: `${cap(pc(g, x[0]))} is what percent of ${pc(g, x[1])}?`, kind: 'pct', v, wrong: [pctOf(b, a)], why: `${cap(pc(g, x[0]))} = ${fv(a)}; ${pc(g, x[1])} = ${fv(b)}.\n(${fv(a)} ÷ ${fv(b)}) × 100 = ${fv(v)}%.` }
}
const tPctMore: Template = (rng, g, d) => {
  const x = cells2(rng, g, d)
  const [a, b] = [vv(g, x[0]), vv(g, x[1])]
  if (feq(a.val, b.val)) return null
  const more = fcmp(a.val, b.val) > 0
  const diff = vabs(a, b)
  const v = pctOf(diff, b)
  const alt = pctOf(diff, a)
  return { id: 'pctMore', stem: `${cap(pc(g, x[0]))} is what percent ${more ? 'more' : 'less'} than ${pc(g, x[1])}?`, kind: 'pct', v, wrong: [alt], why: `${cap(pc(g, x[0]))} = ${fv(a)}; ${pc(g, x[1])} = ${fv(b)}.\n(${fv(diff)} ÷ ${fv(b)}) × 100 = ${fv(v)}%.` }
}
const tPctChange: Template = (rng, g) => {
  if (!g.time) return null
  const s = rng.int(0, g.series.length - 1)
  const c = rng.int(0, g.cats.length - 2)
  const a = g.cell(s, c)
  const b = g.cell(s, c + 1)
  if (feq(a.val, b.val)) return null
  const up = fcmp(b.val, a.val) > 0
  const diff = vabs(a, b)
  const v = pctOf(diff, a)
  return { id: 'pctChange', stem: `What was the percentage ${up ? 'increase' : 'decrease'} in ${g.serP(s)} from ${g.cats[c]} to ${g.cats[c + 1]}?`, kind: 'pct', v, wrong: [pctOf(diff, b)], why: `${g.cats[c]}: ${fv(a)}; ${g.cats[c + 1]}: ${fv(b)}.\nChange = ${fv(diff)}; (${fv(diff)} ÷ ${fv(a)}) × 100 = ${fv(v)}%.` }
}
const tArgmax: Template = (rng, g) => {
  if (g.series.length < 2 || g.cats.length < 5) return null
  const [a, b] = rng.sample([...Array(g.series.length).keys()], 2)
  const diffs = g.cats.map((_, c) => vabs(g.cell(a, c), g.cell(b, c)))
  const max = rng.chance(0.6)
  const best = diffs.reduce((m, x) => (max ? (fcmp(x.val, m.val) > 0 ? x : m) : fcmp(x.val, m.val) < 0 ? x : m))
  if (diffs.filter((x) => feq(x.val, best.val)).length !== 1 || best.val.n === 0) return null
  const word = max ? 'maximum' : 'minimum'
  return { id: 'argmax', stem: `In which ${g.catWord} was the difference between ${g.serP(a)} and ${g.serP(b)} the ${word}?`, kind: 'label', labels: g.cats, lv: diffs, extreme: max ? 'max' : 'min', wrong: [], why: `Differences: ${g.cats.map((c, i) => `${c}: ${fv(diffs[i])}`).join(', ')}.\nThe ${word} difference is ${fv(best)}.` }
}
const tShareAll: Template = (rng, g) => {
  if (!g.additive || g.trivialSum || g.series.length < 2) return null
  const s = rng.int(0, g.series.length - 1)
  const c = rng.int(0, g.cats.length - 1)
  const all = [...Array(g.series.length).keys()]
  const tot = vsum(all.map((i) => g.cell(i, c)))
  const a = g.cell(s, c)
  const v = pctOf(a, tot)
  return { id: 'shareAll', stem: `${cap(g.cellP(s, c))} is what percent of ${g.sumSerP('total', all, c)}?`, kind: 'pct', v, wrong: [pctOf(a, vsub(tot, a))], why: `${cap(g.cellP(s, c))} = ${fv(a)}; total = ${fv(tot)}.\n(${fv(a)} ÷ ${fv(tot)}) × 100 = ${fv(v)}%.` }
}
const aggOf = (agg: string, phrase: string): string => phrase.replace(/^the /, `the ${agg} `)

const tRatioSums: Template = (rng, g) => {
  if (g.pie) return null
  if (!g.additive || g.series.length < 2) return null
  const [a, b] = rng.sample([...Array(g.series.length).keys()], 2)
  const cs = catRange(rng, g, 3)
  const sa = vsum(cs.map((c) => g.cell(a, c)))
  const sb = vsum(cs.map((c) => g.cell(b, c)))
  return { id: 'ratioSums', stem: `${g.catsPhrase(cs)}, what is the ratio of ${aggOf('total', g.serP(a))} to ${aggOf('total', g.serP(b))}?`, kind: 'ratio', ratio: [sa, sb], wrong: [], why: `${cap(g.sumCatsP('total', a, cs))} = ${fv(sa)}; ${g.sumCatsP('total', b, cs)} = ${fv(sb)}.\nRatio = ${fv(sa)} : ${fv(sb)}.` }
}
const tDiffSums: Template = (rng, g) => {
  if (g.pie) return null
  if (!g.additive || g.series.length < 2) return null
  const [a, b] = rng.sample([...Array(g.series.length).keys()], 2)
  const cs = catRange(rng, g, 3)
  const sa = vsum(cs.map((c) => g.cell(a, c)))
  const sb = vsum(cs.map((c) => g.cell(b, c)))
  if (feq(sa.val, sb.val)) return null
  const v = vabs(sa, sb)
  return { id: 'diffSums', stem: `${g.catsPhrase(cs)}, what is the difference between ${aggOf('total', g.serP(a))} and ${aggOf('total', g.serP(b))}?`, kind: 'int', v, wrong: [vadd(sa, sb)], why: `${cap(g.sumCatsP('total', a, cs))} = ${fv(sa)}; ${g.sumCatsP('total', b, cs)} = ${fv(sb)}.\nDifference = ${fv(v)}.` }
}
const tAvgDiff: Template = (rng, g) => {
  if (g.pie) return null
  if (g.series.length < 2) return null
  const [a, b] = rng.sample([...Array(g.series.length).keys()], 2)
  const cs = catRange(rng, g, 3)
  const aa = vavg(cs.map((c) => g.cell(a, c)))
  const ab = vavg(cs.map((c) => g.cell(b, c)))
  if (feq(aa.val, ab.val)) return null
  const v = vabs(aa, ab)
  return { id: 'avgDiff', stem: `${g.catsPhrase(cs)}, what is the difference between ${aggOf('average', g.serP(a))} and ${aggOf('average', g.serP(b))}?`, kind: 'dec', v, wrong: [vadd(aa, ab)], why: `${cap(g.sumCatsP('average', a, cs))} = ${fv(aa)}; ${g.sumCatsP('average', b, cs)} = ${fv(ab)}.\nDifference = ${fv(v)}.` }
}
const tShareGrand: Template = (rng, g) => {
  if (g.pie) return null
  if (!g.additive || g.series.length < 2) return null
  const s = rng.int(0, g.series.length - 1)
  const all = [...Array(g.series.length).keys()]
  const allC = [...Array(g.cats.length).keys()]
  const part = vsum(allC.map((c) => g.cell(s, c)))
  const tot = vsum(all.flatMap((i) => allC.map((c) => g.cell(i, c))))
  const v = pctOf(part, tot)
  return { id: 'shareGrand', stem: `${cap(g.time ? g.sumCatsP('total', s, allC).replace(/ from .*$/, ` over all the ${g.catPlural}`) : g.sumCatsP('total', s, allC).replace(/ in .*$/, ` in all the ${g.catPlural}`))} is what percent of ${g.grandP('total')}?`, kind: 'pct', v, wrong: [], why: `Total for ${g.series[s]} = ${fv(part)}; overall total = ${fv(tot)}.\n(${fv(part)} ÷ ${fv(tot)}) × 100 = ${fv(v)}%.` }
}
const tProj: Template = (rng, g, d) => {
  const x = cells2(rng, g, d)
  const a = vv(g, x[0])
  const p = rng.pick([10, 20, 25, 30, 40, 50])
  const v = vmul(a, vdiv(lit(100 + p), lit(100)))
  return { id: 'proj', stem: `What will be ${pc(g, x[0])} if it is increased by ${p}%?`, kind: 'dec', v, wrong: [vsub(a, vmul(a, vdiv(lit(p), lit(100))))], why: `${cap(pc(g, x[0]))} = ${fv(a)}.\nNew value = ${fv(a)} × ${100 + p}/100 = ${fv(v)}.` }
}
const tMixPct: Template = (rng, g, d) => {
  const x = cells2(rng, g, d)
  const [a, b] = [vv(g, x[0]), vv(g, x[1])]
  const p = rng.pick([20, 25, 40, 50, 60, 75, 80])
  const q = rng.pick([10, 20, 25, 30, 50])
  const pa = vmul(a, vdiv(lit(p), lit(100)))
  const qb = vmul(b, vdiv(lit(q), lit(100)))
  const v = vabs(pa, qb)
  if (feq(pa.val, qb.val)) return null
  return { id: 'mixPct', stem: `What is the difference between ${p}% of ${pc(g, x[0])} and ${q}% of ${pc(g, x[1])}?`, kind: 'dec', v, wrong: [vadd(pa, qb)], why: `${p}% of ${fv(a)} = ${fv(pa)}; ${q}% of ${fv(b)} = ${fv(qb)}.\nDifference = ${fv(v)}.` }
}
const tAngle: Template = (rng, g) => {
  if (!g.extra || !g.extra.pie || !g.extra.pct) return null
  const s = rng.int(0, g.series.length - 1)
  const c = rng.int(0, g.cats.length - 1)
  const v = g.extra.angle(s, c)
  return { id: 'angle', stem: `What is the central angle (in degrees) of the sector for ${g.cats[c]}${g.series.length > 1 ? ` in the pie chart of ${g.series[s]}` : ''}?`, kind: 'dec', v, wrong: [g.extra.share(s, c)], why: `${g.cats[c]} = ${fv(g.extra.share(s, c))}% of the total.\nAngle = ${fv(g.extra.share(s, c))} × 360/100 = ${fv(v)}°.` }
}
const tSharePie: Template = (rng, g) => {
  if (!g.extra || !g.extra.pie) return null
  const s = rng.int(0, g.series.length - 1)
  const [c1, c2] = rng.sample([...Array(g.cats.length).keys()], 2)
  const v = vadd(g.extra.share(s, c1), g.extra.share(s, c2))
  return { id: 'sharePie', stem: `What percent of the total do ${g.cats[c1]} and ${g.cats[c2]} together account for${g.series.length > 1 ? ` in the pie chart of ${g.series[s]}` : ''}?`, kind: 'pct', v, wrong: [vsub(lit(100), v)], why: `${g.cats[c1]} = ${fv(g.extra.share(s, c1))}%; ${g.cats[c2]} = ${fv(g.extra.share(s, c2))}%.\nTogether = ${fv(v)}%.` }
}

const tPieSum: Template = (rng, g) => {
  if (!g.pie) return null
  const s = rng.int(0, g.series.length - 1)
  const [c1, c2] = rng.sample([...Array(g.cats.length).keys()], 2)
  const a = g.cell(s, c1)
  const b = g.cell(s, c2)
  const v = vadd(a, b)
  return { id: 'pieSum', stem: `What is the total of ${g.cellP(s, c1)} and ${g.cellP(s, c2)}?`, kind: 'int', v, wrong: [vabs(a, b)], why: `${cap(g.cellP(s, c1))} = ${fv(a)}; ${g.cellP(s, c2)} = ${fv(b)}.
Total = ${fv(v)}.` }
}

export const MEDIUM_TEMPLATES: Template[] = [tDiff, tSumCats, tAvgCats, tSumSer, tAvgSer, tRatio, tPctOf, tPctChange, tPctMore, tAngle]
export const HARD_ONLY: Template[] = [tShareAll, tRatioSums, tDiffSums, tAvgDiff, tShareGrand, tProj, tMixPct, tArgmax]
export const PIE_EXTRAS: Template[] = [tAngle, tSharePie, tPieSum]

// ------------------------------------------------------------------ finishing a candidate into a question
/** Reduced, distinct ratio strings that differ from the correct one (a : b is already reduced). */
function ratioWrongs(a: number, b: number): string[] {
  const raw: [number, number][] = [[b, a], [a + 1, b], [a, b + 1], [a + 1, b + 1], [a + 2, b], [a, b + 2], [Math.max(1, a - 1), b], [a, Math.max(1, b - 1)], [a + b, b], [a, a + b], [a + b, a], [b, a + b], [2 * a + 1, b], [a, 2 * b + 1]]
  const seen = new Set<string>([`${a} : ${b}`])
  const out: string[] = []
  for (const [x, y] of raw) {
    const g = gcd(x, y)
    const t = `${x / g} : ${y / g}`
    if (!seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
  }
  return out
}

export type DiTopic = 'di-table' | 'di-bar' | 'di-line' | 'di-pie' | 'di-caselet'
export function finish(rng: Rng, c: Cand, st: Stimulus, topic: DiTopic): QuestionDraft | null {
  const confirm = (v: V): void => {
    ensure(feq(evalRc(v.rc, st), v.val), `DI: re-evaluating the recipe on the rendered stimulus gives ${decStr(evalRc(v.rc, st), 3)} not ${decStr(v.val, 3)} (${c.id})`)
  }
  const wrongNums = c.wrong.map((w) => (typeof w === 'number' ? w : fval(w.val)))
  const suffix = c.kind === 'pct' ? '%' : ''
  if (c.kind === 'ratio') {
    const [a, b] = c.ratio as [V, V]
    confirm(a)
    confirm(b)
    const x = fval(a.val)
    const y = fval(b.val)
    need(Number.isInteger(x) && Number.isInteger(y) && x > 0 && y > 0, 'ratio of non-integers')
    const g = gcd(x, y)
    const ra = x / g
    const rb = y / g
    need(ra <= 40 && rb <= 40 && !(ra === rb), 'ugly ratio')
    const q = strQ(rng, { topic, stem: c.stem, correct: `${ra} : ${rb}`, wrong: ratioWrongs(ra, rb), why: `${c.why}\n= ${ratioStr(x, y)}.` })
    DI_META.set(q, { kind: 'ratio', rcs: [a.rc, b.rc] })
    return q
  }
  if (c.kind === 'label') {
    const lv = c.lv as V[]
    lv.forEach(confirm)
    const labels = c.labels as string[]
    const idx = lv.reduce((m, x, i) => ((c.extreme === 'max' ? fcmp(x.val, lv[m].val) > 0 : fcmp(x.val, lv[m].val) < 0) ? i : m), 0)
    const q = strQ(rng, { topic, stem: c.stem, correct: labels[idx], wrong: labels.filter((_, i) => i !== idx), why: c.why })
    DI_META.set(q, { kind: 'label', rcs: lv.map((x) => x.rc), labels, extreme: c.extreme })
    return q
  }
  const v = c.v as V
  confirm(v)
  let ans: Frac = v.val
  let stem = c.stem
  let round = false
  let kind: Kind = c.kind
  if (kind === 'int') {
    need(ans.d === 1 && ans.n >= 2 && ans.n <= 99999, 'not a clean integer')
  } else if (kind === 'dec') {
    need(terminating(ans, 2) && ans.n > 0 && fval(ans) < 99999, 'not a clean decimal')
    if (ans.d === 1) kind = 'int'
  } else {
    // percent: exact when clean, otherwise "approximately" with a safe rounding margin
    need(fval(ans) > 0 && fval(ans) < 1000, 'percent out of range')
    if (!terminating(ans, 1)) {
      const x = fval(ans)
      need(Math.abs(x - Math.floor(x) - 0.5) >= 0.17 && Math.round(x) >= 12, 'rounding too close to .5')
      ans = F(Math.round(x))
      round = true
      stem = stem.replace(/^What was the percentage/, 'What was the approximate percentage').replace('is what percent', 'is approximately what percent')
      if (stem === c.stem) stem = stem.replace(/\?$/, ' (approximately)?')
    }
  }
  const dec = decOf(ans)
  const wrong = round ? [2, 3, 5, 8, 12, 18].flatMap((o) => [fval(ans) - o, fval(ans) + o]) : wrongNums
  const q = numQ(rng, { topic, stem, ans: ans, dec, wrong, post: suffix, why: round ? `${c.why}\n≈ ${fval(ans)}%.` : c.why })
  DI_META.set(q, { kind: 'value', rcs: [v.rc], round })
  return q
}

/** Draw `n` questions with distinct template ids. */
export function drawQuestions(rng: Rng, g: Grid, st: Stimulus, topic: 'di-table' | 'di-bar' | 'di-line' | 'di-pie', d: MockDifficulty, n: number, extra: Template[] = []): QuestionDraft[] {
  const pool: Template[] = d === 'hard' ? [...HARD_ONLY, ...HARD_ONLY, ...MEDIUM_TEMPLATES, ...extra] : [...MEDIUM_TEMPLATES, ...extra]
  const out: QuestionDraft[] = []
  const used = new Set<string>()
  let attempts = 0
  while (out.length < n && attempts++ < 400) {
    const t = rng.pick(pool)
    let c: Cand | null = null
    try {
      c = t(rng, g, d)
    } catch (e) {
      if (!(e instanceof Reject)) throw e
    }
    if (!c || used.has(c.id)) continue
    try {
      const q = finish(rng, c, st, topic)
      if (q && !out.some((o) => o.stem === q.stem)) {
        out.push(q)
        used.add(c.id)
      }
    } catch (e) {
      if (!(e instanceof Reject)) throw e
    }
  }
  if (out.length < n) throw new Reject('could not draw enough distinct DI questions')
  return out
}

// ------------------------------------------------------------------ scenario data
const YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023].map(String)
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July']
const COMPANIES = ['P', 'Q', 'R', 'S', 'T', 'U']
const STATES = ['State A', 'State B', 'State C', 'State D', 'State E', 'State F']
const CITIES = ['Delhi', 'Mumbai', 'Chennai', 'Kolkata', 'Pune', 'Jaipur', 'Lucknow']

interface GridScn {
  title: (nSer: number, nCat: number) => string
  style: 'tim' | 'in'
  noun: string
  serPlural: string
  unit: string
  serLabels: string[]
  cats: string[]
  time: boolean
  catWord: string
  catPlural: string
  rowHdr: string
  lo: number
  hi: number
  allWord?: string
  suffix?: string
  stackable: boolean
}

function timScn(noun: string, serPlural: string, unit: string, title: string, serLabels: string[], lo = 20, hi = 150): GridScn {
  return { title: () => title, style: 'tim', noun, serPlural, unit, serLabels, cats: YEARS, time: true, catWord: 'year', catPlural: 'years', rowHdr: serPlural[0].toUpperCase() + serPlural.slice(1), lo, hi, stackable: true }
}
const GRID_SCNS: GridScn[] = [
  timScn('production of cars', 'companies', 'in thousands', 'Number of cars produced (in thousands) by different companies over the years', COMPANIES.map((x) => `Company ${x}`)),
  timScn('sales', 'shops', '₹ in lakh', 'Sales (₹ in lakh) of different shops over the years', COMPANIES.map((x) => `Shop ${x}`)),
  timScn('number of employees', 'branches', 'in hundreds', 'Number of employees (in hundreds) in different branches of a bank over the years', COMPANIES.map((x) => `Branch ${x}`), 20, 120),
  timScn('production of wheat', 'states', 'in thousand tonnes', 'Production of wheat (in thousand tonnes) in different states over the years', STATES),
  timScn('number of visitors', 'cities', 'in thousands', 'Number of tourists (in thousands) who visited different cities over the years', CITIES, 20, 120),
  {
    title: () => 'Sales (₹ in lakh) of different shops during the first few months of a year',
    style: 'tim',
    noun: 'sales',
    serPlural: 'shops',
    unit: '₹ in lakh',
    serLabels: COMPANIES.map((x) => `Shop ${x}`),
    cats: MONTHS,
    time: true,
    catWord: 'month',
    catPlural: 'months',
    rowHdr: 'Shop',
    lo: 20,
    hi: 150,
    stackable: true,
  },
  {
    title: () => 'Number of students (in hundreds) in different schools',
    style: 'in',
    noun: 'students',
    serPlural: 'groups',
    unit: 'in hundreds',
    serLabels: ['boys', 'girls'],
    cats: ['School A', 'School B', 'School C', 'School D', 'School E', 'School F'],
    time: false,
    catWord: 'school',
    catPlural: 'schools',
    rowHdr: 'Group',
    lo: 20,
    hi: 120,
    allWord: 'students',
    stackable: true,
  },
  {
    title: () => 'Number of items sold (in hundreds) at different stores',
    style: 'in',
    noun: 'items',
    serPlural: 'items',
    unit: 'in hundreds',
    serLabels: ['laptops', 'tablets', 'phones'],
    cats: ['Store A', 'Store B', 'Store C', 'Store D', 'Store E', 'Store F'],
    time: false,
    catWord: 'store',
    catPlural: 'stores',
    rowHdr: 'Item',
    lo: 20,
    hi: 120,
    allWord: 'laptops, tablets and phones',
    suffix: ' sold',
    stackable: true,
  },
]

function matrix(rng: Rng, rows: number, cols: number, lo: number, hi: number): number[][] {
  const step = rng.chance(0.65) ? 10 : 5
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => (rng.int(Math.ceil(lo / step), Math.floor(hi / step))) * step))
}

export interface GridSet {
  grid: Grid
  stimulus: Stimulus
}

/** Direct (single-source) grid scenario rendered as table / bar / line. */
export function buildGrid(rng: Rng, d: MockDifficulty, type: 'di-table' | 'di-bar' | 'di-line'): GridSet {
  let scn: GridScn
  for (;;) {
    scn = rng.pick(GRID_SCNS)
    if (type === 'di-line' && !scn.time) continue
    break
  }
  let nSer: number
  if (type === 'di-table') nSer = scn.style === 'in' ? rng.int(2, 3) : rng.int(4, 5)
  else if (type === 'di-bar') nSer = d === 'hard' ? rng.int(2, 3) : rng.chance(0.3) ? 1 : rng.int(2, 3)
  else nSer = d === 'hard' ? 3 : rng.int(2, 3)
  nSer = Math.min(nSer, scn.serLabels.length)
  const nCat = type === 'di-table' ? rng.int(5, 6) : rng.int(5, 6)
  const startAt = scn.time ? rng.int(0, scn.cats.length - nCat) : 0
  const cats = scn.cats.slice(startAt, startAt + nCat)
  const labels = scn.style === 'tim' ? rng.sample(scn.serLabels, nSer).sort() : scn.serLabels.slice(0, nSer)
  const data = matrix(rng, nSer, nCat, scn.lo, scn.hi)
  const ref = (s: number, c: number): V => ({ val: fdec(data[s][c], 2), rc: { t: 'ref', p: 0, r: s, c } })
  const common = { series: labels, cats, time: scn.time, catWord: scn.catWord, catPlural: scn.catPlural, ref }
  const grid =
    scn.style === 'tim'
      ? styleTim({ ...common, noun: scn.noun, serPlural: scn.serPlural })
      : styleIn({ ...common, allWord: nSer === scn.serLabels.length ? (scn.allWord as string) : listAnd(labels), suffix: scn.suffix })
  const heading = scn.title(nSer, nCat)
  let part: StimulusPart
  let directions: string
  if (type === 'di-table') {
    part = { kind: 'table', heading, columns: [scn.rowHdr, ...cats], rows: labels.map((l, s) => [l, ...data[s]]) }
    directions = 'Study the following table carefully and answer the questions that follow.'
  } else if (type === 'di-bar') {
    const stacked = nSer > 1 && scn.stackable && rng.chance(0.4)
    part = { kind: 'bar', heading: `${heading}${stacked ? ' (stacked)' : ''}`, categories: cats, series: labels.map((l, s) => ({ name: l, values: data[s] })), unit: scn.unit, stacked }
    directions = `Study the following ${nSer === 1 ? 'bar graph' : stacked ? 'stacked bar graph' : 'bar graph'} carefully and answer the questions that follow.`
  } else {
    part = { kind: 'line', heading, categories: cats, series: labels.map((l, s) => ({ name: l, values: data[s] })), unit: scn.unit }
    directions = 'Study the following line graph carefully and answer the questions that follow.'
  }
  return { grid, stimulus: { directions, parts: [part] } }
}

// ------------------------------------------------------------------ derived (two-source) scenarios for PO
export function buildDerived(rng: Rng, type: 'di-table' | 'di-bar' | 'di-line'): GridSet {
  const kind = rng.int(0, 2)
  const nCat = 5
  const timeCats = type === 'di-line' || (type !== 'di-table' && rng.chance(0.4))
  let cats: string[]
  let catWord: string
  let catPlural: string
  if (kind === 2) {
    cats = rng.sample(COMPANIES, nCat).sort().map((x) => `Company ${x}`)
    catWord = 'company'
    catPlural = 'companies'
  } else if (timeCats) {
    const s = rng.int(0, YEARS.length - nCat)
    cats = YEARS.slice(s, s + nCat).map(String)
    catWord = 'year'
    catPlural = 'years'
  } else {
    cats = ['School A', 'School B', 'School C', 'School D', 'School E'].map((x) => (kind === 1 ? x.replace('School', 'Village') : x))
    catWord = kind === 1 ? 'village' : 'school'
    catPlural = kind === 1 ? 'villages' : 'schools'
  }
  const totals = Array.from({ length: nCat }, () => rng.int(8, 40) * 100)
  const pcts = Array.from({ length: nCat }, () => rng.int(6, 16) * 5)
  const totalName = kind === 0 ? 'Total number of students' : kind === 1 ? 'Total population' : 'Expenditure (₹ in lakh)'
  const pctName = kind === 0 ? '% of girls' : kind === 1 ? '% of literate people' : 'Profit (in %)'
  let grid: Grid
  const sNames = kind === 0 ? ['girls', 'boys'] : kind === 1 ? ['literate people', 'illiterate people'] : ['profit', 'income']
  let pctRef: (c: number) => V
  let stimulus: Stimulus
  const headingA = kind === 0 ? 'Total number of students' : kind === 1 ? 'Population (in numbers)' : 'Expenditure (₹ in lakh)'
  const headingB = kind === 0 ? 'Percentage of girls' : kind === 1 ? 'Percentage of literate people' : 'Profit percentage'
  const data0 = kind === 2 ? totals.map((t) => t / 10) : totals
  if (type === 'di-table') {
    const rows = cats.map((c, i) => [c, data0[i], pcts[i]])
    stimulus = {
      directions: 'Study the following table carefully and answer the questions that follow.',
      parts: [{ kind: 'table', heading: `${headingA} and ${headingB.toLowerCase()} in different ${catPlural}`, columns: [catWord[0].toUpperCase() + catWord.slice(1), totalName, pctName], rows }],
    }
    pctRef = (c) => ({ val: F(pcts[c]), rc: { t: 'ref', p: 0, r: c, c: 1 } })
  } else {
    const mkPart = (heading: string, values: number[], unit: string): StimulusPart =>
      type === 'di-bar'
        ? { kind: 'bar', heading, categories: cats, series: [{ name: heading, values }], unit }
        : { kind: 'line', heading, categories: cats, series: [{ name: heading, values }], unit }
    stimulus = {
      directions: `Study the following ${type === 'di-bar' ? 'bar graphs' : 'line graphs'} carefully and answer the questions that follow.`,
      parts: [mkPart(headingA, data0, kind === 2 ? '₹ in lakh' : 'in numbers'), mkPart(headingB, pcts, 'in %')],
    }
    pctRef = (c) => ({ val: F(pcts[c]), rc: { t: 'ref', p: 1, r: 0, c } })
  }
  const base = (c: number): V => (type === 'di-table' ? { val: fdec(data0[c], 2), rc: { t: 'ref', p: 0, r: c, c: 0 } } : { val: fdec(data0[c], 2), rc: { t: 'ref', p: 0, r: 0, c } })
  const part = (c: number): V => vdiv(vmul(base(c), pctRef(c)), lit(100))
  const rest = (c: number): V => (kind === 2 ? vdiv(vmul(base(c), vadd(lit(100), pctRef(c))), lit(100)) : vsub(base(c), part(c)))
  const ref = (s: number, c: number): V => (s === 0 ? part(c) : rest(c))
  const common = { series: sNames, cats, catWord, catPlural, ref }
  if (kind === 2) {
    grid = styleOfc(common)
    grid.time = timeCats
  } else {
    grid = styleIn({ ...common, allWord: kind === 0 ? 'students' : 'people' })
    grid.time = timeCats
    grid.trivialSum = true
    if (timeCats) {
      grid.cellP = (s, c) => `the number of ${sNames[s]} in ${cats[c]}`
    }
  }
  return { grid, stimulus }
}

// ------------------------------------------------------------------ pie
interface PieScn {
  cats: string[]
  pies: string[]
  noun: (pie: string, cat: string, single: boolean) => string
  serP: (pie: string, single: boolean) => string
  title: (pie: string, total: number, deg: boolean) => string
  totalText: string
  unitTotal: [number, number, number]
}
const PIE_SCNS: PieScn[] = [
  {
    cats: ['Cricket', 'Football', 'Hockey', 'Tennis', 'Badminton', 'Kabaddi'],
    pies: ['boys', 'girls'],
    noun: (p, c, single) => `the number of ${single ? 'students' : p} who prefer ${c}`,
    serP: (p, single) => `the number of ${single ? 'students' : p}`,
    title: (p, t, deg) => `Distribution of ${t} ${p} according to their favourite game ${deg ? '(in degrees)' : '(in %)'}`,
    totalText: 'students',
    unitTotal: [600, 3000, 100],
  },
  {
    cats: ['Rent', 'Food', 'Education', 'Transport', 'Savings', 'Miscellaneous'],
    pies: ['Family A', 'Family B'],
    noun: (p, c, single) => `the amount (in ₹) spent ${single ? '' : `by ${p} `}on ${c}`,
    serP: (p, single) => `the monthly income${single ? '' : ` of ${p}`}`,
    title: (p, t, deg) => `Monthly income of ${p}: ₹${t} — distribution of expenditure ${deg ? '(in degrees)' : '(in %)'}`,
    totalText: 'monthly income',
    unitTotal: [20000, 80000, 1000],
  },
  {
    cats: ['HR', 'Finance', 'Marketing', 'IT', 'Operations', 'Sales'],
    pies: ['Company X', 'Company Y'],
    noun: (p, c, single) => `the number of employees in the ${c} department${single ? '' : ` of ${p}`}`,
    serP: (p, single) => `the total number of employees${single ? '' : ` of ${p}`}`,
    title: (p, t, deg) => `Departmentwise distribution of ${t} employees of ${p} ${deg ? '(in degrees)' : '(in %)'}`,
    totalText: 'employees',
    unitTotal: [800, 4000, 100],
  },
]

function splitPcts(rng: Rng, n: number): number[] {
  for (;;) {
    const cuts = Array.from({ length: n }, () => rng.int(1, 7) * 5)
    const sum = cuts.reduce((a, b) => a + b, 0)
    if (sum === 100) return cuts
    // adjust one slice
    const fix = 100 - (sum - cuts[0])
    if (fix >= 5 && fix <= 40) {
      cuts[0] = fix
      return cuts
    }
  }
}

export function buildPie(rng: Rng, d: MockDifficulty): GridSet {
  const scn = rng.pick(PIE_SCNS)
  const two = d === 'hard' && rng.chance(0.75)
  const nPies = two ? 2 : 1
  const nCats = rng.int(5, 6)
  const cats = scn.cats.slice(0, nCats)
  const deg = rng.chance(0.4)
  const pctData: number[][] = []
  const totals: number[] = []
  for (let i = 0; i < nPies; i++) {
    pctData.push(splitPcts(rng, nCats))
    totals.push(rng.int(Math.ceil(scn.unitTotal[0] / scn.unitTotal[2]), Math.floor(scn.unitTotal[1] / scn.unitTotal[2])) * scn.unitTotal[2])
  }
  const pies = scn.pies.slice(0, nPies)
  const single = nPies === 1
  const pieNames = single ? [scn.totalText === 'students' ? 'students' : scn.pies[0]] : pies
  const shown = pctData.map((row) => row.map((p) => (deg ? (p * 18) / 5 : p)))
  const parts: StimulusPart[] = pies.map((p, i) => ({
    kind: 'pie',
    heading: single && scn.totalText === 'students' ? `Distribution of ${totals[i]} students according to their favourite game ${deg ? '(in degrees)' : '(in %)'}` : scn.title(p, totals[i], deg),
    slices: cats.map((c, j) => ({ label: c, value: shown[i][j] })),
    unit: deg ? '°' : '%',
  }))
  const share = (s: number, c: number): V => {
    const r: V = { val: fdec(shown[s][c], 2), rc: { t: 'ref', p: s, r: 0, c } }
    return deg ? vdiv(vmul(r, lit(5)), lit(18)) : r
  }
  const angle = (s: number, c: number): V => (deg ? { val: fdec(shown[s][c], 2), rc: { t: 'ref', p: s, r: 0, c } } : vdiv(vmul({ val: fdec(shown[s][c], 2), rc: { t: 'ref', p: s, r: 0, c } }, lit(18)), lit(5)))
  const cell = (s: number, c: number): V => vdiv(vmul(share(s, c), txt(totals[s])), lit(100))
  const grid: Grid = {
    series: single ? [pieNames[0]] : pies,
    cats,
    time: false,
    additive: false,
    catWord: 'category',
    catPlural: 'categories',
    cell,
    cellP: (s, c) => scn.noun(pies[s], cats[c], single),
    serP: (s) => scn.serP(pies[s], single),
    pie: true,
    sumCatsP: () => '',
    catsPhrase: () => '',
    sumSerP: () => '',
    grandP: () => '',
    extra: { share, angle, pie: true, pct: !deg },
  }
  const stimulus: Stimulus = {
    directions: single ? 'Study the following pie chart carefully and answer the questions that follow.' : 'Study the following pie charts carefully and answer the questions that follow.',
    parts,
  }
  return { grid, stimulus }
}

// ------------------------------------------------------------------ public generators
function wrapGroups(rng: Rng, d: MockDifficulty, count: number, topic: 'di-table' | 'di-bar' | 'di-line' | 'di-pie', mk: () => GridSet, extra: Template[] = []): Group[] {
  const groups: Group[] = []
  let left = count
  while (left > 0) {
    const n = Math.min(5, left)
    let made: Group | null = null
    for (let i = 0; i < 40 && !made; i++) {
      try {
        const { grid, stimulus } = mk()
        const qs = drawQuestions(rng, grid, stimulus, topic, d, n, extra)
        made = { stimulus, questions: qs }
      } catch (e) {
        if (!(e instanceof Reject)) throw e
      }
    }
    if (!made) throw new Error(`${topic}: could not build a ${n}-question set`)
    groups.push(made)
    left -= n
  }
  return groups
}

export function genDiTable(rng: Rng, d: MockDifficulty, count: number): Group[] {
  return wrapGroups(rng, d, count, 'di-table', () => (d === 'hard' && rng.chance(0.55) ? buildDerived(rng, 'di-table') : buildGrid(rng, d, 'di-table')))
}
export function genDiBar(rng: Rng, d: MockDifficulty, count: number): Group[] {
  return wrapGroups(rng, d, count, 'di-bar', () => (d === 'hard' && rng.chance(0.45) ? buildDerived(rng, 'di-bar') : buildGrid(rng, d, 'di-bar')))
}
export function genDiLine(rng: Rng, d: MockDifficulty, count: number): Group[] {
  return wrapGroups(rng, d, count, 'di-line', () => (d === 'hard' && rng.chance(0.45) ? buildDerived(rng, 'di-line') : buildGrid(rng, d, 'di-line')))
}
export function genDiPie(rng: Rng, d: MockDifficulty, count: number): Group[] {
  return wrapGroups(rng, d, count, 'di-pie', () => buildPie(rng, d), PIE_EXTRAS)
}

