// SBI PO Mains-level wrong-number and missing-number series (the `difficulty` argument is ignored).
// Every series comes from an explicit second-order rule (squares / cubes / primes in the differences, x k ± n², interleaved
// unlike series, sums of the previous two with a twist, factorial-and-power mixes...). Each question is then checked against
// an independent hypothesis library that tries hundreds of competing rules, so that the key is the only sensible reading.
import type { Rng } from '../../rng'
import type { Group, MockDifficulty, QuantTopicId, QuestionDraft, TopicGenerator } from '../../types'
import { Reject, ensure, genSingles, numQ, strQ } from '../util'
import type { Tpl } from '../util'
import { fitHole } from '../series'

// Rejections are frequent, so they reuse one pre-built Reject (no stack capture).
const REJ = new Reject('rejected')
function need(cond: unknown, _why = 'rejected'): asserts cond {
  if (!cond) throw REJ
}

const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]
const SUP: Record<number, string> = { 2: '²', 3: '³' }
const sgn = (s: number): string => (s >= 0 ? '+' : '−')
const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320]

interface Step {
  v: number
  txt: string
}
interface Fam {
  name: string
  weight: number
  sample(rng: Rng, N: number): number[]
  init(P: number[]): number[]
  /** term number n (0-based, n >= init length) from the earlier terms. */
  step(P: number[], t: number[], n: number): Step
  rule(P: number[]): string
  /** indices of P that a careless solver might be off by one on (they generate trap options). */
  tweak: number[]
}

// ------------------------------------------------------------------ families
const famMulPow: Fam = {
  name: 'mul-pow',
  weight: 14,
  sample: (rng) => {
    const e = rng.chance(0.7) ? 2 : 3
    return [rng.int(2, 9), e === 3 ? 2 : rng.int(2, 4), rng.pick([1, -1]), rng.int(0, 2), e]
  },
  init: (P) => [P[0]],
  step: (P, t, n) => {
    const [, a, s, u, e] = P
    const add = (n + u) ** e
    return { v: a * t[n - 1] + s * add, txt: `${t[n - 1]} × ${a} ${sgn(s)} ${n + u}${SUP[e]} = ${a * t[n - 1] + s * add}` }
  },
  rule: (P) => {
    const [, a, s, u, e] = P
    return `each term = previous term × ${a} ${sgn(s)} ${1 + u}${SUP[e]}, ${2 + u}${SUP[e]}, ${3 + u}${SUP[e]}, ...`
  },
  tweak: [1, 3],
}

const famPrimeSqDiff: Fam = {
  name: 'diff-prime-squares',
  weight: 10,
  sample: (rng, N) => {
    const u = rng.int(0, 2)
    const dir = rng.chance(0.25) ? -1 : 1
    let total = 0
    for (let k = 0; k < N - 1; k++) total += PRIMES[u + k] ** 2
    return [dir === -1 ? total + rng.int(5, 40) : rng.int(2, 30), u, dir]
  },
  init: (P) => [P[0]],
  step: (P, t, n) => {
    const [, u, dir] = P
    const p = PRIMES[u + n - 1]
    return { v: t[n - 1] + dir * p * p, txt: `${t[n - 1]} ${sgn(dir)} ${p}² = ${t[n - 1] + dir * p * p}` }
  },
  rule: (P) => {
    const [, u, dir] = P
    const ps = [0, 1, 2, 3].map((k) => `${PRIMES[u + k]}²`).join(', ')
    return `the ${dir > 0 ? 'increase' : 'decrease'} from each term to the next is the square of consecutive primes (${ps}, ...)`
  },
  tweak: [1],
}

const famCubeDiff: Fam = {
  name: 'diff-cubes',
  weight: 10,
  sample: (rng) => [rng.int(2, 30), rng.int(0, 2), rng.pick([0, 0, -2, -1, 1, 2, 3])],
  init: (P) => [P[0]],
  step: (P, t, n) => {
    const [, u, c] = P
    const d = (n + u) ** 3 + c
    return { v: t[n - 1] + d, txt: `${t[n - 1]} + (${n + u}³${c ? ` ${sgn(c)} ${Math.abs(c)}` : ''}) = ${t[n - 1] + d}` }
  },
  rule: (P) => {
    const [, u, c] = P
    const ds = [1, 2, 3, 4].map((k) => `${k + u}³${c ? ` ${sgn(c)} ${Math.abs(c)}` : ''}`).join(', ')
    return `the differences between consecutive terms are ${ds}, ...`
  },
  tweak: [1, 2],
}

const famPolyDiff: Fam = {
  name: 'diff-products',
  weight: 10,
  sample: (rng) => [rng.int(2, 30), rng.int(1, 4), rng.int(0, 2)],
  init: (P) => [P[0]],
  step: (P, t, n) => {
    const [, u, kind] = P
    const m = u + n
    const d = kind === 0 ? m * (m + 1) : kind === 1 ? m * m - 1 : (m * (m + 1)) / 2
    const txt = kind === 0 ? `${m} × ${m + 1}` : kind === 1 ? `${m}² − 1` : `${m} × ${m + 1} ÷ 2`
    return { v: t[n - 1] + d, txt: `${t[n - 1]} + (${txt}) = ${t[n - 1] + d}` }
  },
  rule: (P) => {
    const [, u, kind] = P
    const ds = [1, 2, 3, 4].map((k) => {
      const m = u + k
      return kind === 0 ? `${m}×${m + 1}` : kind === 1 ? `${m}² − 1` : `${(m * (m + 1)) / 2}`
    })
    const name = kind === 0 ? 'products of two consecutive integers' : kind === 1 ? 'one less than perfect squares' : 'triangular numbers'
    return `the differences between consecutive terms are ${name}: ${ds.join(', ')}, ...`
  },
  tweak: [1],
}

const famDiff2: Fam = {
  name: 'diff-of-diff',
  weight: 9,
  sample: (rng) => [rng.int(2, 30), rng.int(1, 5), rng.int(1, 4), rng.int(1, 3)],
  init: (P) => [P[0]],
  step: (P, t, n) => {
    const [, d1, g, h] = P
    const d = d1 + g * (n - 1) + (h * (n - 1) * (n - 2)) / 2
    return { v: t[n - 1] + d, txt: `${t[n - 1]} + ${d} = ${t[n - 1] + d}` }
  },
  rule: (P) => {
    const [, d1, g, h] = P
    const ds = [1, 2, 3, 4].map((n) => d1 + g * (n - 1) + (h * (n - 1) * (n - 2)) / 2)
    return `the differences are ${ds.join(', ')}, ... and these differences themselves increase by ${g}, ${g + h}, ${g + 2 * h}, ... (second-order pattern)`
  },
  tweak: [2, 3],
}

// two unlike series woven together
const IK_AP = 0
const IK_GP = 1
const IK_SQ = 2
const IK_MS = 3
function ikStep(kind: number, y: number, prev: number, m: number): Step {
  switch (kind) {
    case IK_AP:
      return { v: prev + y, txt: `${prev} + ${y} = ${prev + y}` }
    case IK_GP:
      return { v: prev * y, txt: `${prev} × ${y} = ${prev * y}` }
    case IK_SQ:
      return { v: prev + (m + y) ** 2, txt: `${prev} + ${m + y}² = ${prev + (m + y) ** 2}` }
    default:
      return { v: prev * y - m, txt: `${prev} × ${y} − ${m} = ${prev * y - m}` }
  }
}
function ikDesc(kind: number, y: number): string {
  switch (kind) {
    case IK_AP:
      return `add ${y} each time`
    case IK_GP:
      return `multiply by ${y} each time`
    case IK_SQ:
      return `add ${1 + y}², ${2 + y}², ${3 + y}², ...`
    default:
      return `multiply by ${y} and subtract 1, 2, 3, ... in turn`
  }
}
const famInterleave: Fam = {
  name: 'interleaved-unlike',
  weight: 12,
  sample: (rng) => {
    const k0 = rng.pick([IK_SQ, IK_MS, IK_AP, IK_GP])
    let k1 = rng.pick([IK_AP, IK_GP, IK_SQ, IK_MS])
    for (let i = 0; i < 8 && (k1 === k0 || (k0 < IK_SQ && k1 < IK_SQ)); i++) k1 = rng.pick([IK_AP, IK_GP, IK_SQ, IK_MS])
    const y = (k: number): number => (k === IK_AP ? rng.int(3, 12) : k === IK_GP ? rng.int(2, 3) : k === IK_SQ ? rng.int(0, 2) : rng.int(2, 3))
    return [k0, rng.int(2, 15), y(k0), k1, rng.int(3, 30), y(k1)]
  },
  init: (P) => [P[1], P[4]],
  step: (P, t, n) => {
    const c = n % 2
    return ikStep(P[3 * c], P[3 * c + 2], t[n - 2], n >> 1)
  },
  rule: (P) => `two series are woven together. Terms at odd places (1st, 3rd, 5th, ...): start with ${P[1]} and ${ikDesc(P[0], P[2])}. Terms at even places (2nd, 4th, 6th, ...): start with ${P[4]} and ${ikDesc(P[3], P[5])}`,
  tweak: [2, 5],
}

const famFibTwist: Fam = {
  name: 'sum-of-previous-two-twist',
  weight: 11,
  sample: (rng) => {
    const kind = rng.int(0, 2)
    return [rng.int(1, 6), rng.int(2, 9), rng.pick([1, 1, 2]), rng.pick([1, 1, 2]), kind, kind === 0 ? rng.pick([-3, -2, -1, 1, 2, 3]) : rng.pick([-1, 1])]
  },
  init: (P) => [P[0], P[1]],
  step: (P, t, n) => {
    const [, , a, b, kind, k] = P
    const pos = n + 1
    const g = kind === 0 ? k : kind === 1 ? k * pos : k * pos * pos
    const v = a * t[n - 1] + b * t[n - 2] + g
    const gt = kind === 0 ? `${Math.abs(k)}` : kind === 1 ? `${pos}` : `${pos}²`
    return { v, txt: `${a > 1 ? `${t[n - 1]} × ${a}` : t[n - 1]} + ${b > 1 ? `${t[n - 2]} × ${b}` : t[n - 2]} ${sgn(g)} ${gt} = ${v}` }
  },
  rule: (P) => {
    const [, , a, b, kind, k] = P
    const tail = kind === 0 ? `${sgn(k)} ${Math.abs(k)}` : kind === 1 ? `${sgn(k)} its position number` : `${sgn(k)} the square of its position number`
    return `each term from the 3rd = previous term${a > 1 ? ` × ${a}` : ''} + term before that${b > 1 ? ` × ${b}` : ''} ${tail}`
  },
  tweak: [5],
}

const famMulVar: Fam = {
  name: 'mul-increasing-plus',
  weight: 11,
  sample: (rng) => {
    const u = rng.int(0, 1)
    const kind = rng.int(0, 1)
    return [u === 0 ? rng.int(2, 4) : rng.int(1, 2), u, kind, kind === 0 ? rng.pick([-2, -1, 1, 2, 3]) : rng.pick([-1, 1])]
  },
  init: (P) => [P[0]],
  step: (P, t, n) => {
    const [, u, kind, s] = P
    const f = n + u
    const add = kind === 0 ? s * f : s * f * f
    const v = t[n - 1] * f + add
    return { v, txt: `${t[n - 1]} × ${f} ${sgn(add)} ${Math.abs(add)} = ${v}` }
  },
  rule: (P) => {
    const [, u, kind, s] = P
    const fs = [1, 2, 3].map((k) => k + u)
    const tail = kind === 0 ? fs.map((f) => `${Math.abs(s) === 1 ? '' : `${Math.abs(s)}×`}${f}`).join(', ') : fs.map((f) => `${f}²`).join(', ')
    return `each term = previous term × ${fs.join(', ')}, ... ${sgn(s)} ${tail}, ... respectively`
  },
  tweak: [1, 3],
}

const famPrimePow: Fam = {
  name: 'primes-powers',
  weight: 10,
  sample: (rng) => [rng.int(0, 2), rng.pick([-3, -2, -1, 0, 1, 2, 3]), rng.int(0, 2)],
  init: (P) => [primeTerm(P, 0).v],
  step: (P, _t, n) => primeTerm(P, n),
  rule: (P) => {
    const [u, c, kind] = P
    const ps = [0, 1, 2, 3].map((k) => PRIMES[u + k])
    const tail = c ? ` ${sgn(c)} ${Math.abs(c)}` : ''
    if (kind === 0) return `the terms are the squares of consecutive primes (${ps.map((p) => `${p}²`).join(', ')}, ...)${tail ? `, each ${sgn(c)} ${Math.abs(c)}` : ''}`
    if (kind === 1) return `the terms are the cubes of consecutive primes (${ps.map((p) => `${p}³`).join(', ')}, ...)${tail ? `, each ${sgn(c)} ${Math.abs(c)}` : ''}`
    return `the terms are p × (p + 1) for consecutive primes p = ${ps.join(', ')}, ...${tail ? `, each ${sgn(c)} ${Math.abs(c)}` : ''}`
  },
  tweak: [0, 1],
}
function primeTerm(P: number[], n: number): Step {
  const [u, c, kind] = P
  const p = PRIMES[u + n]
  const base = kind === 0 ? p * p : kind === 1 ? p ** 3 : p * (p + 1)
  const txt = kind === 0 ? `${p}²` : kind === 1 ? `${p}³` : `${p} × ${p + 1}`
  return { v: base + c, txt: `${txt}${c ? ` ${sgn(c)} ${Math.abs(c)}` : ''} = ${base + c}` }
}

const famPoly3: Fam = {
  name: 'cube-plus-minus',
  weight: 8,
  sample: (rng) => [rng.int(1, 3), rng.int(0, 3), rng.pick([-2, -1, 0, 0, 1, 2, 3])],
  init: (P) => [polyTerm(P, 0).v],
  step: (P, _t, n) => polyTerm(P, n),
  rule: (P) => {
    const [u, kind, c] = P
    const f = ['m³ + m²', 'm³ − m²', 'm³ + m', 'm³ − m'][kind]
    return `the terms follow ${f}${c ? ` ${sgn(c)} ${Math.abs(c)}` : ''} for m = ${u + 1}, ${u + 2}, ${u + 3}, ...`
  },
  tweak: [0, 2],
}
function polyTerm(P: number[], n: number): Step {
  const [u, kind, c] = P
  const m = u + n + 1
  const [a, b] = [[m ** 3, m * m], [m ** 3, -(m * m)], [m ** 3, m], [m ** 3, -m]][kind]
  const v = a + b + c
  const sym = ['+', '−', '+', '−'][kind]
  const second = kind < 2 ? `${m}²` : `${m}`
  return { v, txt: `${m}³ ${sym} ${second}${c ? ` ${sgn(c)} ${Math.abs(c)}` : ''} = ${v}` }
}

const famFactMix: Fam = {
  name: 'factorial-mix',
  weight: 6,
  sample: (rng) => [rng.int(1, 2), rng.pick([1, 1, -1]), rng.int(2, 3)],
  init: (P) => [factTerm(P, 0).v],
  step: (P, _t, n) => factTerm(P, n),
  rule: (P) => {
    const [u, s, e] = P
    return `the terms are m! ${sgn(s)} m${SUP[e]} for m = ${u}, ${u + 1}, ${u + 2}, ...`
  },
  tweak: [0],
}
function factTerm(P: number[], n: number): Step {
  const [u, s, e] = P
  const m = u + n
  need(m < FACT.length, 'factorial too large')
  const v = FACT[m] + s * m ** e
  return { v, txt: `${m}! ${sgn(s)} ${m}${SUP[e]} = ${FACT[m]} ${sgn(s)} ${m ** e} = ${v}` }
}

const famAltMix: Fam = {
  name: 'alternating-operations',
  weight: 9,
  sample: (rng) => [rng.int(2, 8), rng.int(2, 4), rng.int(1, 9)],
  init: (P) => [P[0]],
  step: (P, t, n) => {
    const [, a, b] = P
    if (n % 2 === 1) return { v: a * t[n - 1] - b, txt: `${t[n - 1]} × ${a} − ${b} = ${a * t[n - 1] - b}` }
    return { v: t[n - 1] + n * n, txt: `${t[n - 1]} + ${n}² = ${t[n - 1] + n * n}` }
  },
  rule: (P) => `the operations alternate: × ${P[1]} − ${P[2]}, then + 2², then × ${P[1]} − ${P[2]}, then + 4², then × ${P[1]} − ${P[2]}, then + 6²`,
  tweak: [1, 2],
}

const FAMS: Fam[] = [famMulPow, famPrimeSqDiff, famCubeDiff, famPolyDiff, famDiff2, famInterleave, famFibTwist, famMulVar, famPrimePow, famPoly3, famFactMix, famAltMix]

interface Series {
  fam: Fam
  P: number[]
  t: number[]
  steps: (Step | null)[]
}
function buildSeries(rng: Rng, fam: Fam, N: number): Series {
  const P = fam.sample(rng, N)
  const t = fam.init(P)
  const steps: (Step | null)[] = t.map(() => null)
  for (let n = t.length; n < N; n++) {
    const s = fam.step(P, t, n)
    t.push(s.v)
    steps.push(s)
  }
  need(t.length === N && t.every((x) => Number.isInteger(x) && x >= 1 && x <= 20000), 'series out of range')
  need(new Set(t).size === N, 'repeated terms')
  // values must not explode / stay trivially small
  need(t[N - 1] >= 12 && Math.max(...t) / Math.min(...t) <= 600, 'series too flat or too steep')
  return { fam, P, t, steps }
}

// ------------------------------------------------------------------ hypothesis library (competing explanations)
type Known = (number | null)[]
const nearInt = (x: number): boolean => Number.isFinite(x) && Math.abs(x - Math.round(x)) < 1e-9

const GFUNCS: ((m: number) => number)[] = [
  (m) => m,
  (m) => m * m,
  (m) => m ** 3,
  (m) => m * (m + 1),
  (m) => m * m - 1,
  (m) => (m * (m + 1)) / 2,
  (m) => (m * (m + 1) * (m + 2)) / 6,
  (m) => PRIMES[m] ?? NaN,
  (m) => (PRIMES[m] ?? NaN) ** 2,
  (m) => (PRIMES[m] ?? NaN) ** 3,
  (m) => FACT[m] ?? NaN,
  (m) => 2 ** m,
  (m) => 3 ** m,
  (m) => 4 ** m,
  (m) => m ** 4,
  (m) => m * m + m + 1,
]

/** t[i] = s·g(i + u) + c, with s, c integers inferred from the data. */
function fitClosedG(known: Known, p: number, out: Set<number>): void {
  const idx: number[] = []
  known.forEach((v, i) => {
    if (i !== p && v !== null) idx.push(i)
  })
  if (idx.length < 3) return
  const [i, j] = idx
  for (const g of GFUNCS)
    for (let u = 0; u <= 6; u++) {
      const gi = g(i + u)
      const gj = g(j + u)
      if (!Number.isFinite(gi) || !Number.isFinite(gj) || gi === gj) continue
      const s = ((known[j] as number) - (known[i] as number)) / (gj - gi)
      if (!nearInt(s) || s === 0) continue
      const c = (known[i] as number) - s * gi
      if (!idx.every((k) => s * g(k + u) + c === known[k])) continue
      const x = s * g(p + u) + c
      if (nearInt(x)) out.add(x)
    }
}

/** differences d[k] = t[k+1] − t[k] equal s·g(k + u) + c. */
function fitDiffG(known: Known, p: number, out: Set<number>): void {
  const N = known.length
  const dk: number[] = []
  for (let k = 0; k + 1 < N; k++) if (k !== p && k + 1 !== p) dk.push(k)
  if (dk.length < 3) return
  const d = (k: number): number => (known[k + 1] as number) - (known[k] as number)
  const [i, j] = dk
  for (const g of GFUNCS)
    for (let u = 0; u <= 6; u++) {
      const gi = g(i + u)
      const gj = g(j + u)
      if (!Number.isFinite(gi) || !Number.isFinite(gj) || gi === gj) continue
      const s = (d(j) - d(i)) / (gj - gi)
      if (!nearInt(s) || s === 0) continue
      const c = d(i) - s * gi
      if (!dk.every((k) => s * g(k + u) + c === d(k))) continue
      const pred = (k: number): number => s * g(k + u) + c
      let x: number
      if (p === 0) x = (known[1] as number) - pred(0)
      else {
        x = (known[p - 1] as number) + pred(p - 1)
        if (p + 1 < N && (known[p + 1] as number) - x !== pred(p)) continue
      }
      if (nearInt(x)) out.add(x)
    }
}

/** t[n] = a·t[n−1] + b·t[n−2] + s·g(n) + c with g in {1, n, n²}. */
function fitOrder2G(known: Known, p: number, out: Set<number>): void {
  const N = known.length
  const gs: ((n: number) => number)[] = [() => 0, (n) => n + 1, (n) => (n + 1) ** 2]
  for (const a of [0, 1, 2, 3, -1])
    for (const b of [1, 2, 3, -1, -2])
      for (const g of gs)
        for (const s of g(0) === 0 ? [0] : [1, -1]) {
          let k: number | null = null
          for (let i = 0; i + 2 < N; i++) {
            if (i !== p && i + 1 !== p && i + 2 !== p) {
              k = (known[i + 2] as number) - a * (known[i + 1] as number) - b * (known[i] as number) - s * g(i + 2)
              break
            }
          }
          if (k === null || Math.abs(k) > 60) continue
          let x: number
          if (p >= 2) x = a * (known[p - 1] as number) + b * (known[p - 2] as number) + s * g(p) + k
          else if (p === 1) {
            if (a === 0) continue
            x = ((known[2] as number) - b * (known[0] as number) - s * g(2) - k) / a
          } else x = ((known[2] as number) - a * (known[1] as number) - s * g(2) - k) / b
          if (!nearInt(x)) continue
          const full = known.map((v, i) => (i === p ? x : (v as number)))
          let ok = true
          for (let i = 0; i + 2 < N && ok; i++) if (full[i + 2] !== a * full[i + 1] + b * full[i] + s * g(i + 2) + k) ok = false
          if (ok) out.add(x)
        }
}

/** Two interleaved simple series: the class without the hole must itself be simple, the hole's class is completed by the same simple models. */
function fitInterleaveG(known: Known, p: number, out: Set<number>): void {
  const N = known.length
  const holeCls = p % 2
  const posOf = (c: number): number[] => {
    const r: number[] = []
    for (let i = c; i < N; i += 2) r.push(i)
    return r
  }
  const other = posOf(1 - holeCls).map((i) => known[i] as number)
  const hole = posOf(holeCls)
  const m = hole.indexOf(p)
  type Model = (prev: number, k: number) => number
  // all simple models with parameters taken from a pair (e0 at class index k0, e1 at k0 + 1)
  const models = (e0: number, e1: number, k0: number): Model[] => {
    const out2: Model[] = []
    const d = e1 - e0
    out2.push((prev) => prev + d)
    if (e0 !== 0 && e1 % e0 === 0) out2.push((prev) => prev * (e1 / e0))
    for (let a = 2; a <= 5; a++) {
      const c = e1 - a * e0
      if (Math.abs(c) <= 12) out2.push((prev) => a * prev + c)
    }
    const y = Math.sqrt(d) - (k0 + 1)
    if (d > 0 && nearInt(y) && y >= 0) out2.push((prev, k) => prev + (k + 1 + y) ** 2)
    const am = (e1 + k0 + 1) / e0
    if (e0 !== 0 && nearInt(am) && am >= 2 && am <= 4) out2.push((prev, k) => am * prev - (k + 1))
    return out2
  }
  const simple = (vals: number[]): boolean => {
    if (vals.length < 3) return false
    return models(vals[0], vals[1], 0).some((md) => vals.every((v, k) => k === 0 || md(vals[k - 1], k - 1) === v))
  }
  if (!simple(other)) return
  const kn = hole.map((i, k) => ({ k, v: known[i] })).filter((e) => e.v !== null) as { k: number; v: number }[]
  // consecutive known pair in the hole's class
  if (kn.length >= 2 && kn[1].k === kn[0].k + 1) {
    for (const md of models(kn[0].v, kn[1].v, kn[0].k)) {
      let cur = kn[0].v
      let ok = true
      let target: number | null = null
      for (let k = kn[0].k + 1; k < hole.length && ok; k++) {
        cur = md(cur, k - 1)
        if (k === m) target = cur
        else if (known[hole[k]] !== cur) ok = false
      }
      if (ok && target !== null && nearInt(target)) out.add(target)
    }
  }
  // no consecutive pair: AP / GP across the gap
  const e0 = kn[0]
  const e1 = kn[1]
  if (e0 && e1 && kn.length >= 2) {
    const steps = e1.k - e0.k
    const dd = (e1.v - e0.v) / steps
    if (nearInt(dd) && kn.every((e) => e0.v + dd * (e.k - e0.k) === e.v)) out.add(e0.v + dd * (m - e0.k))
    for (let r = 2; r <= 6; r++) {
      const geo = (k: number): number => e0.v * r ** (k - e0.k)
      if (kn.every((e) => geo(e.k) === e.v)) out.add(geo(m))
    }
  }
}

/** Every integer the hypothesis library can put in the single hole of `known` while explaining all the other terms. */
function explainHole(known: Known): number[] {
  const holes = known.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0)
  if (holes.length !== 1) throw new Error('explainHole needs exactly one hole')
  const p = holes[0]
  const out = new Set<number>(fitHole(known))
  fitClosedG(known, p, out)
  fitDiffG(known, p, out)
  fitOrder2G(known, p, out)
  fitInterleaveG(known, p, out)
  return [...out]
}

// ------------------------------------------------------------------ questions
const fmtSeries = (t: (number | string)[]): string => t.join('   ')

function explainLines(s: Series): string[] {
  const lines = [`Pattern: ${s.fam.rule(s.P)}.`]
  s.steps.forEach((st, n) => {
    if (st) lines.push(`Term ${n + 1}: ${st.txt}`)
  })
  return lines
}

function wrongNumber(rng: Rng, fam: Fam): QuestionDraft {
  const N = fam === famInterleave || rng.chance(0.75) ? 7 : 6
  const s = buildSeries(rng, fam, N)
  // an interleaved series needs its wrong term in the four-term class so that the other class stays decisive
  const i = fam === famInterleave ? rng.pick([2, 4]) : rng.int(2, N - 3)
  const base = s.t[i]
  const maxDelta = Math.max(3, Math.round(base * 0.12))
  const cands: number[] = []
  for (let dl = 2; dl <= maxDelta; dl++)
    for (const sg of [1, -1]) {
      const w = base + sg * dl
      if (w >= 1 && !s.t.includes(w)) cands.push(w)
    }
  need(cands.length > 0, 'no corrupted value')
  // prefer a value that keeps the series in order (a monotone series then gives no visual hint)
  const lo = Math.min(s.t[i - 1], s.t[i + 1])
  const hi = Math.max(s.t[i - 1], s.t[i + 1])
  const inOrder = cands.filter((w) => w > lo && w < hi)
  const w = rng.pick(inOrder.length > 0 && rng.chance(0.85) ? inOrder : cands)
  const shown = s.t.map((x, j) => (j === i ? w : x))
  // uniqueness: no other single term can be the odd one out under any rule in the library
  for (let p = 0; p < N; p++) {
    const fits = explainHole(shown.map((x, j) => (j === p ? null : x)))
    if (p !== i) need(fits.length === 0, `alternative explanation with term ${p + 1} wrong`)
    else need(fits.every((x) => x === s.t[i]), 'library reads the series differently')
  }
  ensure(shown[i] !== s.t[i] && shown.filter((x, j) => x !== s.t[j]).length === 1, 'wrong series: corruption is not a single term')
  const near = [i - 1, i + 1].map((j) => s.t[j])
  const others = rng.sample(s.t.filter((_, j) => j !== i && j !== i - 1 && j !== i + 1), 2)
  const why = `${explainLines(s).join('\n')}\nSo the series should be ${s.t.join(', ')}.\nThe term ${w} breaks the pattern; it should be ${s.t[i]}.`
  return strQ(rng, { topic: 'wrong-number-series', stem: `Find the wrong number in the following number series.\n${fmtSeries(shown)}`, correct: String(w), wrong: [...near, ...others].map(String), why })
}

function missingNumber(rng: Rng, fam: Fam): QuestionDraft {
  const N = rng.chance(0.5) ? 6 : 7
  const s = buildSeries(rng, fam, N)
  const start = Math.max(2, s.fam.init(s.P).length)
  const b = rng.chance(0.3) ? N - 1 : rng.int(start, N - 2)
  const known: Known = s.t.map((x, j) => (j === b ? null : x))
  const fits = explainHole(known)
  need(fits.every((x) => x === s.t[b]), 'ambiguous missing term')
  const v = s.t[b]
  // classic slips: off-by-one in the rule's index/parameter, linear extrapolation, average of the neighbours
  const wrong: number[] = []
  for (const ti of fam.tweak)
    for (const d of [1, -1]) {
      const P2 = s.P.slice()
      P2[ti] += d
      try {
        const x = s.fam.step(P2, s.t, b).v
        if (Number.isInteger(x) && x >= 1) wrong.push(x)
      } catch (e) {
        if (!(e instanceof Reject)) throw e
      }
    }
  if (b >= 2) wrong.push(2 * s.t[b - 1] - s.t[b - 2])
  if (b + 1 < N) wrong.push(Math.round((s.t[b - 1] + s.t[b + 1]) / 2))
  wrong.push(v + rng.int(1, 4), v - rng.int(1, 4))
  const shown = s.t.map((x, j) => (j === b ? '?' : x))
  const why = `${explainLines(s).join('\n')}\nSo the missing number is ${v}.`
  return numQ(rng, { topic: 'missing-number-series', stem: `What will come in place of the question mark (?) in the following number series?\n${fmtSeries(shown)}`, ans: v, wrong, why, none: 0.1 })
}

const WRONG_TPLS: Tpl[] = FAMS.flatMap((f) => [{ name: `wrong-${f.name}`, gen: (rng: Rng) => wrongNumber(rng, f) }, ...(f.weight >= 11 ? [{ name: `wrong-${f.name}-b`, gen: (rng: Rng) => wrongNumber(rng, f) }] : [])])
const MISSING_TPLS: Tpl[] = FAMS.flatMap((f) => [{ name: `missing-${f.name}`, gen: (rng: Rng) => missingNumber(rng, f) }, ...(f.weight >= 11 ? [{ name: `missing-${f.name}-b`, gen: (rng: Rng) => missingNumber(rng, f) }] : [])])

const genWrongSeriesMains: TopicGenerator = (rng: Rng, _d: MockDifficulty, count: number): Group[] => genSingles(rng, 'hard', count, WRONG_TPLS)
const genMissingSeriesMains: TopicGenerator = (rng: Rng, _d: MockDifficulty, count: number): Group[] => genSingles(rng, 'hard', count, MISSING_TPLS)

export const MAINS_SERIES: Partial<Record<QuantTopicId, TopicGenerator>> = {
  'wrong-number-series': genWrongSeriesMains,
  'missing-number-series': genMissingSeriesMains,
}
