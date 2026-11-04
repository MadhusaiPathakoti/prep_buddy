// Wrong-number and missing-number series.
// Every series is generated from an explicit rule, then checked against an independent hypothesis library
// (`fitHole`) that tries to explain the data with ~1000 candidate rules without knowing the intended one.
import type { Rng } from '../rng'
import type { Group, MockDifficulty, QuestionDraft } from '../types'
import { F, ensure, fadd, fmul, genSingles, need, numQ, strQ, wpick } from './util'
import type { Frac, Tpl } from './util'

const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]
const sq = (m: number): number => m * m
const cube = (m: number): number => m * m * m
const A_LIST = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, -1, -2, -3]
const AA_LIST = [1, 2, 3, 4, 5, 6]

type Known = (number | null)[]

// ---------------------------------------------------------------------------- hypothesis library
interface RecFam {
  mult: (n: number) => number
  add: (n: number) => number
}

const REC_FAMILIES: RecFam[] = (() => {
  const out: RecFam[] = []
  for (const a of A_LIST) {
    out.push({ mult: () => a, add: () => 0 })
    for (let u = 0; u <= 4; u++)
      for (const s of [1, -1]) {
        out.push({ mult: () => a, add: (n) => s * sq(n + u) })
        out.push({ mult: () => a, add: (n) => s * cube(n + u) })
        out.push({ mult: () => a, add: (n) => s * (n + u) })
      }
  }
  for (let u = 0; u <= 4; u++) {
    out.push({ mult: (n) => n + u, add: () => 0 })
    out.push({ mult: (n) => n + u, add: (n) => n + u })
  }
  for (let u = 0; u <= 6; u++)
    for (const s of [1, -1]) out.push({ mult: () => 1, add: (n) => s * PRIMES[n + u] })
  return out
})()

function nearInt(x: number): boolean {
  return Number.isFinite(x) && Math.abs(x - Math.round(x)) < 1e-9
}

function fitRec(known: Known, p: number, fam: RecFam): number | null {
  const N = known.length
  let k: number | null = null
  for (let i = 0; i + 1 < N; i++) {
    if (i !== p && i + 1 !== p) {
      k = (known[i + 1] as number) - fam.mult(i) * (known[i] as number) - fam.add(i)
      break
    }
  }
  if (k === null || Math.abs(k) > 500) return null
  let x: number
  if (p > 0) x = fam.mult(p - 1) * (known[p - 1] as number) + fam.add(p - 1) + k
  else {
    const m = fam.mult(0)
    if (m === 0) return null
    x = ((known[1] as number) - fam.add(0) - k) / m
  }
  if (!nearInt(x)) return null
  const full = known.map((v, i) => (i === p ? x : (v as number)))
  for (let i = 0; i + 1 < N; i++) if (full[i + 1] !== fam.mult(i) * full[i] + fam.add(i) + k) return null
  return x
}

function fitAlt(known: Known, p: number, out: Set<number>): void {
  const N = known.length
  for (const a1 of AA_LIST)
    for (const a2 of AA_LIST) {
      let b1: number | null = null
      let b2: number | null = null
      for (let i = 0; i + 1 < N; i++) {
        if (i === p || i + 1 === p) continue
        if (i % 2 === 0 && b1 === null) b1 = (known[i + 1] as number) - a1 * (known[i] as number)
        if (i % 2 === 1 && b2 === null) b2 = (known[i + 1] as number) - a2 * (known[i] as number)
      }
      if (b1 === null || b2 === null) continue
      const aa = (i: number): number => (i % 2 === 0 ? a1 : a2)
      const bb = (i: number): number => (i % 2 === 0 ? (b1 as number) : (b2 as number))
      const x = p > 0 ? aa(p - 1) * (known[p - 1] as number) + bb(p - 1) : ((known[1] as number) - bb(0)) / aa(0)
      if (!nearInt(x)) continue
      const full = known.map((v, i) => (i === p ? x : (v as number)))
      let ok = true
      for (let i = 0; i + 1 < N && ok; i++) if (full[i + 1] !== aa(i) * full[i] + bb(i)) ok = false
      if (ok) out.add(x)
    }
}

function fitOrder2(known: Known, p: number, out: Set<number>): void {
  const N = known.length
  for (const a of [0, 1, 2, 3, -1]) {
    for (const b of [1, 2, -1, 3, 0]) {
      if (a === 0 && b === 0) continue
      let k: number | null = null
      for (let i = 0; i + 2 < N; i++) {
        if (i !== p && i + 1 !== p && i + 2 !== p) {
          k = (known[i + 2] as number) - a * (known[i + 1] as number) - b * (known[i] as number)
          break
        }
      }
      if (k === null || Math.abs(k) > 100) continue
      let x: number
      if (p >= 2) x = a * (known[p - 1] as number) + b * (known[p - 2] as number) + k
      else if (p === 0) {
        if (b === 0) continue
        x = ((known[2] as number) - a * (known[1] as number) - k) / b
      } else {
        if (a === 0) continue
        x = ((known[2] as number) - b * (known[0] as number) - k) / a
      }
      if (!nearInt(x)) continue
      const full = known.map((v, i) => (i === p ? x : (v as number)))
      let ok = true
      for (let i = 0; i + 2 < N && ok; i++) if (full[i + 2] !== a * full[i + 1] + b * full[i] + k) ok = false
      if (ok) out.add(x)
    }
  }
}

function fitPoly(known: Known, p: number, deg: number, out: Set<number>): void {
  const idx: number[] = []
  known.forEach((v, i) => {
    if (i !== p && v !== null) idx.push(i)
  })
  if (idx.length < deg + 2) return
  const base = idx.slice(0, deg + 1)
  const evalAt = (x: number): Frac => {
    let total = F(0)
    for (const j of base) {
      let term = F(known[j] as number)
      for (const m of base) if (m !== j) term = fmul(term, F(x - m, j - m))
      total = fadd(total, term)
    }
    return total
  }
  for (const i of idx) {
    const v = evalAt(i)
    if (v.d !== 1 || v.n !== known[i]) return
  }
  const px = evalAt(p)
  if (px.d === 1) out.add(px.n)
}

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880]
function fitClosed(known: Known, p: number, g: (n: number) => number, out: Set<number>): void {
  const idx: number[] = []
  known.forEach((v, i) => {
    if (i !== p && v !== null) idx.push(i)
  })
  const [i, j] = idx
  const den = g(j) - g(i)
  if (den === 0) return
  const c = ((known[j] as number) - (known[i] as number)) / den
  if (!nearInt(c) || c === 0) return
  const k = (known[i] as number) - c * g(i)
  for (const m of idx) if (c * g(m) + k !== known[m]) return
  const x = c * g(p) + k
  if (nearInt(x)) out.add(x)
}

function fitInterleave(known: Known, p: number, out: Set<number>): void {
  const N = known.length
  const cls = [0, 1].map((c) => {
    const pos: number[] = []
    for (let i = c; i < N; i += 2) pos.push(i)
    return pos
  })
  const apOk = (vals: number[]): boolean => vals.length < 2 || vals.every((v, i) => i === 0 || v - vals[i - 1] === vals[1] - vals[0])
  const gpOk = (vals: number[]): boolean => vals.length < 2 || (vals[0] !== 0 && vals.every((v, i) => i === 0 || v * vals[0] === vals[i - 1] * vals[1]))
  const holeCls = p % 2
  const other = cls[1 - holeCls].map((i) => known[i] as number)
  if (!(apOk(other) || gpOk(other))) return
  const pos = cls[holeCls]
  const m = pos.indexOf(p)
  const kn = pos.map((i, mi) => ({ mi, v: known[i] })).filter((e) => e.v !== null) as { mi: number; v: number }[]
  const [e0, e1] = kn
  // AP in the hole class
  const steps = e1.mi - e0.mi
  const d = (e1.v - e0.v) / steps
  if (nearInt(d)) {
    const x = e0.v + d * (m - e0.mi)
    if (kn.every((e) => e0.v + d * (e.mi - e0.mi) === e.v)) out.add(x)
  }
  // GP in the hole class with integer ratio >= 2
  for (let r = 2; r <= 9; r++) {
    const geo = (mi: number): number => e0.v * r ** (mi - e0.mi)
    if (kn.every((e) => geo(e.mi) === e.v)) {
      const x = geo(m)
      if (nearInt(x)) out.add(x)
    }
  }
}

/** All integer values the hypothesis library can put in the single hole (null) of `known` while explaining every other term. */
export function fitHole(known: Known): number[] {
  const holes = known.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0)
  if (holes.length !== 1) throw new Error('fitHole needs exactly one hole')
  const p = holes[0]
  const out = new Set<number>()
  for (const fam of REC_FAMILIES) {
    const x = fitRec(known, p, fam)
    if (x !== null) out.add(x)
  }
  fitAlt(known, p, out)
  fitOrder2(known, p, out)
  for (const deg of [1, 2, 3]) fitPoly(known, p, deg, out)
  for (let m = 2; m <= 6; m++) fitClosed(known, p, (n) => m ** n, out)
  for (let u = 0; u <= 3; u++) fitClosed(known, p, (n) => FACT[n + u], out)
  for (let u = 0; u <= 6; u++) fitClosed(known, p, (n) => PRIMES[n + u], out)
  fitInterleave(known, p, out)
  return [...out]
}

// ---------------------------------------------------------------------------- series families
interface SeriesDef {
  t: number[]
  rule: string
}
type Fam = (rng: Rng, d: MockDifficulty, N: number) => SeriesDef

const op = (k: number): string => (k >= 0 ? `+ ${k}` : `− ${-k}`)

function build(t0: number, N: number, step: (n: number, t: number) => number): number[] {
  const t = [t0]
  for (let i = 0; i + 1 < N; i++) t.push(step(i, t[i]))
  return t
}

const famLin: Fam = (rng, d, N) => {
  const a = d === 'hard' ? rng.int(2, 6) : rng.int(2, 4)
  const b = rng.pick(d === 'hard' ? [-9, -7, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  const t0 = rng.int(2, d === 'hard' ? 15 : 12)
  return { t: build(t0, N, (_n, t) => a * t + b), rule: `each term = previous term × ${a} ${op(b)}` }
}
const famAP: Fam = (rng, d, N) => {
  const dd = rng.int(3, d === 'hard' ? 25 : 15)
  const desc = rng.chance(0.3)
  const t0 = desc ? rng.int(dd * N + 5, dd * N + 60) : rng.int(3, 40)
  return { t: build(t0, N, (_n, t) => (desc ? t - dd : t + dd)), rule: `each term ${desc ? 'decreases' : 'increases'} by ${dd}` }
}
const famDiffAP: Fam = (rng, d, N) => {
  const d0 = rng.int(1, 8)
  const e = rng.int(1, d === 'hard' ? 7 : 5)
  const desc = rng.chance(0.3)
  const total = (N - 1) * d0 + (e * (N - 1) * (N - 2)) / 2
  const t0 = desc ? total + rng.int(5, 40) : rng.int(2, 40)
  const diffs = Array.from({ length: N - 1 }, (_, n) => d0 + e * n)
  return { t: build(t0, N, (n, t) => (desc ? t - diffs[n] : t + diffs[n])), rule: `the differences are ${diffs.slice(0, 4).join(', ')}, … (they ${e > 0 ? 'increase' : 'change'} by ${e} each time)${desc ? ', subtracted from each term' : ''}` }
}
const famDiffSq: Fam = (rng, d, N) => {
  const u = rng.int(1, d === 'hard' ? 5 : 3)
  const desc = rng.chance(0.25)
  const diffs = Array.from({ length: N - 1 }, (_, n) => sq(n + u))
  const total = diffs.reduce((a, b) => a + b, 0)
  const t0 = desc ? total + rng.int(3, 40) : rng.int(2, 40)
  return { t: build(t0, N, (n, t) => (desc ? t - diffs[n] : t + diffs[n])), rule: `the differences are the squares ${diffs.slice(0, 4).map((_, n) => `${n + u}²`).join(', ')}, …` }
}
const famDiffCube: Fam = (rng, _d, N) => {
  const u = rng.int(1, 3)
  const diffs = Array.from({ length: N - 1 }, (_, n) => cube(n + u))
  return { t: build(rng.int(2, 30), N, (n, t) => t + diffs[n]), rule: `the differences are the cubes ${diffs.slice(0, 4).map((_, n) => `${n + u}³`).join(', ')}, …` }
}
const famDiffPrime: Fam = (rng, _d, N) => {
  const u = rng.int(0, 4)
  const desc = rng.chance(0.25)
  const diffs = Array.from({ length: N - 1 }, (_, n) => PRIMES[n + u])
  const total = diffs.reduce((a, b) => a + b, 0)
  const t0 = desc ? total + rng.int(5, 40) : rng.int(2, 40)
  return { t: build(t0, N, (n, t) => (desc ? t - diffs[n] : t + diffs[n])), rule: `the differences are consecutive prime numbers ${diffs.slice(0, 4).join(', ')}, …` }
}
const famMulInc: Fam = (rng, _d, N) => {
  const u = rng.int(1, 2)
  const k = rng.pick([-2, -1, 1, 2, 3])
  const t0 = rng.int(2, 6)
  return { t: build(t0, N, (n, t) => t * (n + u) + k), rule: `each term = previous term × ${u}, ${u + 1}, ${u + 2}, … ${op(k)}` }
}
const famSquares: Fam = (rng, _d, N) => {
  const u = rng.int(2, 9)
  const k = rng.pick([-6, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 8])
  return { t: Array.from({ length: N }, (_, n) => sq(n + u) + k), rule: `the terms are ${u}²${k ? ` ${op(k)}` : ''}, ${u + 1}²${k ? ` ${op(k)}` : ''}, ${u + 2}²${k ? ` ${op(k)}` : ''}, …` }
}
const famCubes: Fam = (rng, _d, N) => {
  const u = rng.int(1, 4)
  const k = rng.pick([-5, -3, -2, -1, 0, 1, 2, 3, 4, 6])
  return { t: Array.from({ length: N }, (_, n) => cube(n + u) + k), rule: `the terms are ${u}³${k ? ` ${op(k)}` : ''}, ${u + 1}³${k ? ` ${op(k)}` : ''}, ${u + 2}³${k ? ` ${op(k)}` : ''}, …` }
}
const famNN1: Fam = (rng, _d, N) => {
  const u = rng.int(1, 5)
  const k = rng.pick([0, 0, 1, 2, 3, -1, -2])
  return { t: Array.from({ length: N }, (_, n) => (n + u) * (n + u + 1) + k), rule: `the terms are n(n + 1)${k ? ` ${op(k)}` : ''} for n = ${u}, ${u + 1}, ${u + 2}, …` }
}
const famAlt: Fam = (rng, d, N) => {
  const kind = rng.int(0, d === 'hard' ? 3 : 2)
  const a = rng.int(2, 4)
  const b = rng.int(1, 9)
  const t0 = rng.int(2, 9)
  if (kind === 0) return { t: build(t0, N, (n, t) => (n % 2 === 0 ? t * a : t + b)), rule: `the operations alternate: × ${a}, + ${b}, × ${a}, + ${b}, …` }
  if (kind === 1) return { t: build(t0, N, (n, t) => (n % 2 === 0 ? t + b : t * a)), rule: `the operations alternate: + ${b}, × ${a}, + ${b}, × ${a}, …` }
  if (kind === 2) {
    const a2 = rng.pick([2, 3, 4, 5].filter((x) => x !== a))
    return { t: build(t0, N, (n, t) => t * (n % 2 === 0 ? a : a2)), rule: `the terms are multiplied alternately by ${a} and ${a2}` }
  }
  return { t: build(t0 + 2, N, (n, t) => (n % 2 === 0 ? t * a - b : t * a + b)), rule: `the operations alternate: × ${a} − ${b}, × ${a} + ${b}, …` }
}
const famInterleave: Fam = (rng, d, N) => {
  const t = new Array<number>(N).fill(0)
  const mk = (start: number): ((m: number) => number) => {
    if (d === 'hard' && rng.chance(0.4)) {
      const r = rng.int(2, 3)
      return (m) => start * r ** m
    }
    const dd = rng.int(2, 14)
    return (m) => start + dd * m
  }
  const f0 = mk(rng.int(2, 12))
  const f1 = mk(rng.int(3, 30))
  for (let i = 0; i < N; i++) t[i] = i % 2 === 0 ? f0(i >> 1) : f1(i >> 1)
  const desc = (f: (m: number) => number): string => {
    const x = [f(0), f(1), f(2)]
    return x[1] - x[0] === x[2] - x[1] ? `an AP with common difference ${x[1] - x[0]}` : `a GP with ratio ${x[1] / x[0]}`
  }
  return { t, rule: `the terms at odd positions form ${desc(f0)} (${f0(0)}, ${f0(1)}, ${f0(2)}, …) and those at even positions form ${desc(f1)} (${f1(0)}, ${f1(1)}, ${f1(2)}, …)` }
}
const famLinSq: Fam = (rng, _d, N) => {
  const a = rng.int(1, 3)
  const u = rng.int(1, 2)
  const s = rng.pick([1, -1])
  const t0 = rng.int(3, 12)
  return { t: build(t0, N, (n, t) => a * t + s * sq(n + u)), rule: `each term = previous term × ${a} ${s > 0 ? '+' : '−'} ${u}², ${u + 1}², ${u + 2}², …` }
}
const famLinN: Fam = (rng, _d, N) => {
  const a = rng.int(2, 4)
  const u = rng.int(1, 3)
  const s = rng.pick([1, -1])
  const t0 = rng.int(3, 12)
  return { t: build(t0, N, (n, t) => a * t + s * (n + u)), rule: `each term = previous term × ${a} ${s > 0 ? '+' : '−'} ${u}, ${u + 1}, ${u + 2}, …` }
}
const famFib: Fam = (rng, _d, N) => {
  const k = rng.pick([0, 0, 1, -1, 2, 3])
  const t = [rng.int(1, 6), rng.int(2, 9)]
  for (let i = 2; i < N; i++) t.push(t[i - 1] + t[i - 2] + k)
  return { t, rule: `each term = sum of the previous two terms${k ? ` ${op(k)}` : ''}` }
}
const famFact: Fam = (rng, _d, N) => {
  const u = rng.int(1, 2)
  const k = rng.pick([1, 2, 3, -1])
  return { t: Array.from({ length: N }, (_, n) => FACT[n + u] + k), rule: `the terms are ${u}!, ${u + 1}!, ${u + 2}!, … ${op(k)}` }
}
const famGP: Fam = (rng, _d, N) => {
  const m = rng.int(2, 4)
  const c = rng.int(1, 5)
  const k = rng.pick([-3, -2, -1, 1, 2, 3, 5])
  return { t: Array.from({ length: N }, (_, n) => c * m ** n + k), rule: `the terms are ${c}×${m}⁰ ${op(k)}, ${c}×${m}¹ ${op(k)}, ${c}×${m}² ${op(k)}, …` }
}

const FAMS_MEDIUM: [Fam, number][] = [[famLin, 22], [famAP, 8], [famDiffAP, 18], [famDiffSq, 12], [famSquares, 14], [famAlt, 10], [famDiffPrime, 8], [famNN1, 5], [famCubes, 3]]
const FAMS_HARD: [Fam, number][] = [[famLin, 10], [famDiffAP, 8], [famDiffSq, 8], [famDiffCube, 6], [famDiffPrime, 6], [famMulInc, 9], [famSquares, 6], [famCubes, 8], [famAlt, 9], [famInterleave, 9], [famLinSq, 7], [famLinN, 6], [famFib, 5], [famFact, 3], [famGP, 3], [famNN1, 3]]

function makeSeries(rng: Rng, d: MockDifficulty, N: number): SeriesDef {
  const fam = wpick(rng, d === 'hard' ? FAMS_HARD : FAMS_MEDIUM)
  const s = fam(rng, d, N)
  const lim = d === 'hard' ? 9000 : 2000
  need(s.t.length === N && s.t.every((x) => Number.isInteger(x) && x >= 1 && x <= lim), 'series out of range')
  need(new Set(s.t).size === N, 'repeated terms')
  return s
}

// ---------------------------------------------------------------------------- questions
const fmtSeries = (t: (number | string)[]): string => t.join('   ')

function wrongNumber(rng: Rng, d: MockDifficulty): QuestionDraft {
  const N = d === 'hard' && rng.chance(0.4) ? 7 : 6
  const s = makeSeries(rng, d, N)
  const i = rng.int(0, N - 1)
  const maxDelta = Math.max(3, Math.round(s.t[i] * 0.18))
  const delta = rng.int(1, maxDelta) * (rng.chance(0.5) ? 1 : -1)
  const w = s.t[i] + delta
  need(w >= 1 && !s.t.includes(w), 'bad corrupted value')
  const shown = s.t.map((x, j) => (j === i ? w : x))
  // uniqueness: no other term can be the odd one out under any hypothesis, and the intended hole is recovered exactly
  for (let p = 0; p < N; p++) {
    const k: Known = shown.map((x, j) => (j === p ? null : x))
    const fits = fitHole(k)
    if (p !== i) need(fits.length === 0, `alternative explanation with term ${p + 1} wrong`)
    else need(fits.includes(s.t[i]), 'library cannot recover intended term')
  }
  ensure(shown[i] !== s.t[i], 'wrong series: corrupted term equals the original')
  const others = s.t.filter((_, j) => j !== i)
  const pick4 = rng.sample(others, 4)
  const why = `Pattern: ${s.rule}.\nSeries should be ${s.t.join(', ')}.\nSo ${w} is wrong; it should be ${s.t[i]}.`
  return strQ(rng, { topic: 'wrong-number-series', stem: `Find the wrong number in the following number series.\n${fmtSeries(shown)}`, correct: String(w), wrong: pick4.map(String), why })
}

function missingNumber(rng: Rng, d: MockDifficulty): QuestionDraft {
  const N = 6
  const s = makeSeries(rng, d, N)
  const b = rng.int(d === 'hard' ? 0 : 1, N - 1)
  const known: Known = s.t.map((x, j) => (j === b ? null : x))
  const fits = fitHole(known)
  need(fits.length === 1, 'ambiguous or unrecovered missing term')
  ensure(fits[0] === s.t[b], 'missing series: library and rule disagree')
  const shown = s.t.map((x, j) => (j === b ? '?' : x))
  const v = s.t[b]
  const nearMiss = [v + rng.int(1, 3), v - rng.int(1, 3), v + rng.int(4, 12), v - rng.int(4, 12), v + rng.int(13, 30), v * 2]
  const prev = s.t[b - 1]
  if (b >= 2) nearMiss.push(2 * prev - s.t[b - 2])
  if (b >= 1 && b + 1 < N) nearMiss.push(Math.round((prev + s.t[b + 1]) / 2))
  const why = `Pattern: ${s.rule}.\nSeries: ${s.t.join(', ')}.\nMissing term = ${s.t[b]}.`
  return numQ(rng, { topic: 'missing-number-series', stem: `What will come in place of the question mark (?) in the following number series?\n${fmtSeries(shown)}`, ans: s.t[b], wrong: nearMiss, why, none: 0.15 })
}

const WRONG_TPLS: Tpl[] = [{ name: 'wrong-number', gen: wrongNumber }]
const MISSING_TPLS: Tpl[] = [{ name: 'missing-number', gen: missingNumber }]
export function genWrongSeries(rng: Rng, d: MockDifficulty, count: number): Group[] {
  return genSingles(rng, d, count, WRONG_TPLS)
}
export function genMissingSeries(rng: Rng, d: MockDifficulty, count: number): Group[] {
  return genSingles(rng, d, count, MISSING_TPLS)
}

