// Verification harness for the SBI-PO-Mains-level generators in src/lib/mocks/quant/mains/arithB.ts.
// Run:  npx tsx scripts/verify-mains-qarithB.ts
// For every topic: >= 300 seeds x varied counts; structure (assertGroup), exact count, determinism, option sanity,
// uniform correct-option position, and an INDEPENDENT recomputation of every key from the raw template parameters
// (float simulation / brute-force enumeration written here, sharing no code with the generators) plus a check that
// the numbers the stem prints are the ones implied by those parameters.  Exits non-zero on any failure.
import { readFileSync } from 'node:fs'
import { createRng } from '../src/lib/mocks/rng'
import { assertGroup } from '../src/lib/mocks/validate'
import { MAINS_ARITH_B, MAINS_B_META } from '../src/lib/mocks/quant/mains/arithB'
import type { QuantTopicId, QuestionDraft } from '../src/lib/mocks/types'

const SEEDS = Number(process.env.SEEDS ?? 320)
const COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
let failures = 0
const failMsgs: string[] = []
function fail(msg: string): void {
  failures++
  if (failMsgs.length < 60) failMsgs.push(msg)
}

// ------------------------------------------------------------------ source hygiene (determinism guard)
{
  const src = readFileSync(new URL('../src/lib/mocks/quant/mains/arithB.ts', import.meta.url), 'utf8')
  for (const bad of [/Math\.random/, /\bDate\b/, /performance\.now/, /crypto\./]) if (bad.test(src)) fail(`arithB.ts must not use ${bad}`)
  const allowed = /^[	 -ÿ−√∛≤≥≠₹→∴⇒≈π²³–—“”’‘×÷…∩∈]*$/
  src.split('\n').forEach((ln, i) => {
    if (!allowed.test(ln)) fail(`arithB.ts line ${i + 1} has unsupported characters: ${[...ln].filter((c) => !allowed.test(c)).join('')}`)
  })
}

// ------------------------------------------------------------------ helpers
const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b))
const fmt = (x: number): string => String(Number(x.toFixed(2)))
const close = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b)) + 0.0051
const fact = (n: number): number => (n <= 1 ? 1 : n * fact(n - 1))
const redFrac = (n: number, d: number): string => `${n / gcd(n, d)}/${d / gcd(n, d)}`

type Expected = { kind: 'num'; v: number } | { kind: 'frac'; n: number; d: number } | { kind: 'ratio'; a: number; b: number }
type Solved = { exp: Expected; must?: string[] }
const num = (v: number, must?: string[]): Solved => ({ exp: { kind: 'num', v }, must })
const fracE = (n: number, d: number, must?: string[]): Solved => ({ exp: { kind: 'frac', n, d }, must })
const ratioE = (a: number, b: number, must?: string[]): Solved => ({ exp: { kind: 'ratio', a, b }, must })

function parseOpt(o: string): { kind: 'num'; v: number } | { kind: 'frac'; n: number; d: number } | { kind: 'ratio'; a: number; b: number } | null {
  let m = /^(\d+) : (\d+)$/.exec(o.trim())
  if (m) return { kind: 'ratio', a: Number(m[1]), b: Number(m[2]) }
  m = /^(\d+)\/(\d+)$/.exec(o.trim())
  if (m) return { kind: 'frac', n: Number(m[1]), d: Number(m[2]) }
  m = /(-?\d+(?:\.\d+)?)/.exec(o.replace(/,/g, '').replace('−', '-'))
  if (m) return { kind: 'num', v: Number(m[1]) }
  return null
}
function sameValue(e: Expected, o: ReturnType<typeof parseOpt>): boolean {
  if (!o || o.kind !== e.kind) return false
  if (e.kind === 'num' && o.kind === 'num') return close(o.v, e.v)
  if (e.kind === 'frac' && o.kind === 'frac') return o.n * e.d === o.d * e.n && gcd(o.n, o.d) === 1
  if (e.kind === 'ratio' && o.kind === 'ratio') return o.a * e.b === o.b * e.a && gcd(o.a, o.b) === 1
  return false
}

// ------------------------------------------------------------------ brute-force combinatorics
function subsets(n: number, k: number, fn: (s: number[]) => void): void {
  const idx: number[] = []
  const go = (st: number): void => {
    if (idx.length === k) return fn(idx)
    for (let i = st; i < n; i++) {
      idx.push(i)
      go(i + 1)
      idx.pop()
    }
  }
  go(0)
}
function permutations<T>(arr: T[], fn: (p: T[]) => void): void {
  const a = arr.slice()
  const heap = (k: number): void => {
    if (k === 1) return fn(a)
    heap(k - 1)
    for (let i = 0; i < k - 1; i++) {
      if (k % 2 === 0) [a[i], a[k - 1]] = [a[k - 1], a[i]]
      else [a[0], a[k - 1]] = [a[k - 1], a[0]]
      heap(k - 1)
    }
  }
  heap(a.length)
}
const isVowel = (ch: string): boolean => 'AEIOU'.includes(ch)

type P = Record<string, any>

// ------------------------------------------------------------------ independent solvers
const SOLVERS: Record<string, (p: P) => Solved> = {
  // ----- time & work
  'tw-alternate': (p) => {
    const rates = p.ord.map((i: number) => 1 / p.d[i])
    let done = 0
    for (let day = 0; day < 500; day++) {
      const r = rates[day % 3]
      if (done + r >= 1 - 1e-12) return num(day + (1 - done) / r)
      done += r
    }
    throw new Error('no finish')
  },
  'tw-leave': (p) => {
    const [da, db, dc] = p.d
    const f = (T: number): number => T / dc + Math.max(0, T - p.xa) / da + Math.max(0, T - p.xb) / db
    let lo = 0
    let hi = 1000
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2
      if (f(mid) < 1) lo = mid
      else hi = mid
    }
    return num(p.ask === 0 ? lo : lo - p.xb)
  },
  'tw-wages': (p) => {
    const [ab, bc, ac] = p.pd.map((x: number) => 1 / x)
    const sum = (ab + bc + ac) / 2
    const u = [sum - bc, sum - ac, sum - ab]
    const rest = (1 - p.t * sum) / (sum - u[p.leaver])
    const work = u.map((x: number, i: number) => (i === p.leaver ? x * p.t : x * (p.t + rest)))
    return num(p.W * work[p.asked], [`₹${p.W}`])
  },
  'tw-efficiency': (p) => {
    const eb = p.ec * (1 - p.q / 100)
    const ea = eb * (1 + p.p / 100)
    const W = p.ec * p.dC
    const rem = (W - p.m * (ea + eb)) / (eb + p.ec)
    return num(p.ask === 0 ? rem : p.m + rem, [`${p.dC} days`])
  },
  'tw-pipes-leak': (p) => {
    const A = 1 / p.a
    const B = 1 / p.b
    const C = -1 / p.c
    const vol0 = p.f0[0] / p.f0[1]
    const v1 = vol0 + (A + B + C) * p.t
    const n2 = p.variant === 0 ? A + B : p.variant === 1 ? A + C : B + C
    const more = (1 - v1) / n2
    return num(p.ask === 0 ? more : p.t + more)
  },
  'tw-pipes-rotate': (p) => {
    const rate = [1 / p.a, 1 / p.b, -1 / p.c]
    const STEP = 600
    let vol = 0
    for (let h = 0; h < 400; h++) {
      const r = rate[p.ord[h % 3]]
      for (let s = 1; s <= STEP; s++) {
        vol += r / STEP
        if (vol >= 1 - 1e-9) return num(h + s / STEP)
      }
    }
    throw new Error('never full')
  },
  'tw-menwomen': (p) => {
    const r1 = p.A * p.rM + p.B * p.rW
    const total = r1 * p.D
    const r2 = (p.A - p.x) * p.rM + (p.B + p.y) * p.rW
    const rem = (total - p.t * r1) / r2
    return num(p.ask === 0 ? rem : p.t + rem)
  },
  // ----- speed & distance
  'sd-boat-ratio': (p) => {
    const up = p.b - p.s
    const dn = p.b + p.s
    const T = p.D / up + p.D / dn
    const g = gcd(dn, up)
    const ratioTxt = `${dn / g} : ${up / g}`
    const must = [`${fmt(T)} hours to go ${p.D} km downstream`, ratioTxt]
    return num(p.ask === 0 ? p.s : p.ask === 1 ? p.b : (2 * p.D) / p.b, must)
  },
  'sd-boat-system': (p) => {
    const up = p.b - p.s
    const dn = p.b + p.s
    const T1 = p.x1 / up + p.y1 / dn
    const T2 = p.x2 / up + p.y2 / dn
    return num(p.ask === 0 ? p.s : p.b, [`${p.x1} km upstream and ${p.y1} km downstream in ${fmt(T1)} hours`, `${p.x2} km upstream and ${p.y2} km downstream in ${fmt(T2)} hours`])
  },
  'sd-trains': (p) => {
    const vA = p.kA / 3.6
    const vB = p.kB / 3.6
    const LA = vA * p.tA
    const LB = vB * p.tB - p.plat
    const t = (LA + LB) / (p.same ? vA - vB : vA + vB)
    return num(t, [`Train A, ${Math.round(LA)} m long, crosses a pole in ${p.tA} seconds`, `running at ${p.kB} km/h`])
  },
  'sd-meeting': (p) => {
    const tt = p.tTwice / 2
    const D = p.a * (tt - p.sMin / 60) + p.b * (tt - p.h / 60)
    const DT = Math.round(D)
    // bisection on the piecewise position functions (A halts for sMin minutes after x km; B starts h minutes late)
    const x = p.a * p.xh
    const stopLen = p.sMin / 60
    const posA = (t: number): number => (t <= p.xh ? p.a * t : t <= p.xh + stopLen ? x : x + p.a * (t - p.xh - stopLen))
    const posB = (t: number): number => (t <= p.h / 60 ? 0 : p.b * (t - p.h / 60))
    let lo = 0
    let hi = 40
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2
      if (posA(mid) + posB(mid) < DT) lo = mid
      else hi = mid
    }
    return { exp: { kind: 'num', v: p.ask === 0 ? posA(lo) : posB(lo) }, must: [`${DT} km apart`] }
  },
  'sd-avg3': (p) => {
    let time = p.halt / 60
    p.fr.forEach((f: number[], i: number) => (time += (p.D * f[0]) / f[1] / p.v[i]))
    return num(p.D / time, [`${p.D} km away`])
  },
  'sd-avg-find': (p) => {
    const d = p.v.map((x: number, i: number) => x * p.t[i])
    const D = d[0] + d[1] + d[2]
    const total = p.t[0] + p.t[1] + p.t[2] + p.halt / 60
    return num(p.v[2], [`travels ${D} km`, `${fmt(D / total)} km/h`])
  },
  'sd-race-chain': (p) => {
    // speeds from "start" statements, then a race of R2 metres
    const vA = 1
    const vB = (p.R - p.x) / p.R
    const vC = vB * ((p.R - p.y) / p.R)
    const cDist = (vC / vA) * p.R2
    return num(p.R2 - cDist, [`start of ${p.x} m`, `start of ${p.y} m`])
  },
  'sd-race-time': (p) => {
    const x = p.vB * p.tt
    const tB = p.R / p.vB
    const tA = tB - p.tt
    return num(p.ask === 0 ? tA : (p.R / tA) * 3.6, [`by ${x} m or by ${p.tt} seconds`])
  },
  'sd-circular': (p) => {
    const C = (p.a + p.b) * p.t1
    if ((p.a - p.b) * p.t2 !== C) throw new Error('track inconsistent')
    return num(p.ask === 0 ? C : p.b * 3.6, [`after ${p.t1} seconds`, `after ${p.t2} seconds`])
  },
  'sd-twomen': (p) => {
    const v = p.v / 3.6
    const L = (v - p.s1 / 3.6) * p.t1
    const t2 = L / (v + p.s2 / 3.6)
    const must = [`in ${p.t1} seconds`, `in ${Math.round(t2)} seconds`]
    if (Math.abs(t2 - Math.round(t2)) > 1e-9) throw new Error('t2 not whole')
    return num(p.ask === 0 ? L : p.ask === 1 ? p.v : (L + p.plat) / v, must)
  },
  // ----- mixture
  'mx-replace-twice': (p) => {
    let milk = p.V
    let water = 0
    for (const x of [p.x1, p.x2]) {
      const mTake = (milk * x) / p.V
      const wTake = (water * x) / p.V
      milk -= mTake
      water = water - wTake + x
    }
    if (p.ask === 0) return num(milk)
    if (p.ask === 2) milk += p.extra
    const g = gcd(Math.round(milk * 100), Math.round(water * 100))
    return ratioE(Math.round(milk * 100) / g, Math.round(water * 100) / g)
  },
  'mx-two-vessels': (p) => {
    const milk0 = (p.x * p.a) / (p.a + p.b) + (p.y * p.c) / (p.c + p.d)
    const water0 = (p.x * p.b) / (p.a + p.b) + (p.y * p.d) / (p.c + p.d)
    const milk = p.addWater ? milk0 : milk0 + p.z
    const water = p.addWater ? water0 + p.z : water0
    if (p.ask === 1) return num((milk / (milk + water)) * 100)
    const g = gcd(Math.round(milk * 60), Math.round(water * 60))
    return ratioE(Math.round(milk * 60) / g, Math.round(water * 60) / g)
  },
  'mx-three-var': (p) => {
    // simulate a 1000 kg lot
    const tot = p.rt[0] + p.rt[1] + p.rt[2]
    const kg = p.rt.map((r: number) => (1000 * r) / tot)
    const cost = kg.reduce((acc: number, q: number, i: number) => acc + q * p.costs[i], 0)
    const saleable = 1000 * (1 - p.loss / 100)
    if (p.ask === 0) return num((cost * (1 + p.g / 100)) / saleable, [`${p.loss}% of the weight`])
    return num(((saleable * p.Sp - cost) / cost) * 100, [`₹${p.Sp} per kg`])
  },
  'mx-allig-profit': (p) => {
    const c = (p.x * p.a + p.y * p.b) / (p.x + p.y)
    const S = c * (1 + p.g / 100)
    // independent: solve q a + (1 − q) b = c' for the cheaper fraction q, with c' recovered from the selling price
    const cp = S / (1 + p.g / 100)
    const q = (p.b - cp) / (p.b - p.a)
    if (Math.abs(S - Math.round(S)) > 1e-9) throw new Error('S not integral')
    if (p.ask === 0) return num(p.Qk * q, [`₹${Math.round(S) * p.Qk}`, `${p.Qk} kg`])
    const g = gcd(p.x, p.y)
    if (Math.abs(q / (1 - q) - p.x / p.y) > 1e-9) throw new Error('ratio mismatch')
    return ratioE(p.x / g, p.y / g, [`₹${Math.round(S)} per kg`])
  },
  'mx-ratio-solve': (p) => {
    const milk0 = (p.V * p.a) / (p.a + p.b)
    const milk1 = milk0 - (p.x * p.a) / (p.a + p.b)
    const water1 = p.V - milk1
    const g = gcd(Math.round(milk1), Math.round(water1))
    const must = [`${Math.round(milk1) / g} : ${Math.round(water1) / g}`]
    return num(p.ask === 0 ? p.V : milk1 * ((p.V - p.y) / p.V), must)
  },
  'mx-milkman': (p) => {
    const M = p.V + p.w
    const q1 = (M * p.f1[0]) / p.f1[1]
    const rev = q1 * p.s1 + (M - q1) * p.s2
    const cost = p.V * p.c
    const profit = ((rev - cost) / cost) * 100
    return p.ask === 0 ? num(profit) : num(p.s2, [`${fmt(profit)}%`])
  },
  'mx-find-replaced': (p) => {
    const f = p.f[0] / p.f[1]
    const x = p.V * f
    const M = p.V * (1 - f) * (1 - f)
    // simulate the two operations
    let milk = p.V
    for (let i = 0; i < 2; i++) milk -= (milk * x) / p.V
    if (Math.abs(milk - M) > 1e-9) throw new Error('simulation mismatch')
    const W = p.V - M
    const g = gcd(Math.round(M), Math.round(W))
    return num(x, [p.ask === 0 ? `${Math.round(M)} litres of milk is now left` : `${Math.round(M) / g} : ${Math.round(W) / g}`])
  },
  // ----- mensuration (π = 22/7)
  'me-recast': (p) => {
    const pi = 22 / 7
    const V = pi * p.r * p.r * p.h + (pi * p.r * p.r * p.hc) / 3 + (2 * pi * p.r ** 3) / 3
    if (p.form === 0) return num(V / ((4 / 3) * pi * (p.dd / 2) ** 3), [`diameter ${p.dd} cm`])
    const rad = p.wd / 20
    return num(V / (pi * rad * rad) / 100, [`diameter ${p.wd} mm`])
  },
  'me-tent': (p) => {
    const pi = 22 / 7
    const l = Math.sqrt(p.r * p.r + p.hc * p.hc)
    const area = 2 * pi * p.r * p.h + pi * p.r * l
    const used = area * (1 + p.w / 100)
    return num(p.form === 0 ? used * p.rate : (used / p.wid) * p.rate, [`radius ${p.r} m and height ${p.h} m`, `${p.w}% extra`])
  },
  'me-path': (p) => {
    const pi = 22 / 7
    const R = p.r + p.w
    const circ = 2 * pi * R
    const ring = pi * (R * R - p.r * p.r)
    return num(p.ask === 0 ? circ * p.fence + ring * p.pave : ring * p.pave, [`radius ${p.r} m`, `₹${p.fence} per metre`])
  },
  'me-rect-pond': (p) => {
    const pi = 22 / 7
    const inner = (p.L - 2 * p.w) * (p.B - 2 * p.w)
    const grass = (inner - pi * p.rp * p.rp) * p.pGrass
    const path = (p.L * p.B - inner) * p.pPath
    return num(p.ask === 0 ? grass + path : grass, [`${p.L} m long and ${p.B} m wide`, `radius ${p.rp} m`])
  },
  'me-grazing': (p) => {
    const pi = 22 / 7
    const k = p.corner ? 4 : 2
    const a1 = (pi * p.l * p.l) / k
    const a2 = (pi * (p.l + p.e) ** 2) / k
    const v = p.ask === 0 ? a2 - a1 : p.ask === 1 ? (a2 - a1) * p.rate : ((a2 - a1) / a1) * 100
    return num(v, [`${p.l} m long`, `by ${p.e} m`])
  },
  'me-shapes': (p) => {
    const pi = 22 / 7
    const circ = pi * p.r * p.r
    if (p.form === 0) return num((circ - 2 * p.r * p.r) * p.rate, [`radius ${p.r} m`])
    if (p.form === 1) return num((4 * p.r * p.r - circ) * p.rate, [`radius ${p.r} m`])
    const C = 2 * pi * p.r
    const L = ((C / 2) * p.a) / (p.a + p.b)
    const B = ((C / 2) * p.b) / (p.a + p.b)
    return num(circ - L * B, [`radius ${p.r} cm`, `${p.a} : ${p.b}`])
  },
  'me-pipe-tank': (p) => {
    const pi = 22 / 7
    const radM = p.rad / 100
    const perMin = pi * radM * radM * ((p.v * 1000) / 60)
    const need = p.L * p.B * p.H * (1 - p.f0[0] / p.f0[1])
    return num(need / perMin, [`diameter ${2 * p.rad} cm`, `${p.L} m long, ${p.B} m wide and ${p.H} m high`])
  },
  'me-balls': (p) => {
    const pi = 22 / 7
    const vol = p.n * ((4 / 3) * pi * p.rho ** 3) + (p.withCone ? (pi * p.rc * p.rc * p.hc) / 3 : 0)
    const rise = vol / (pi * p.R * p.R)
    return num(p.ask === 0 ? rise : p.n, [`base radius ${p.R} cm`])
  },
  // ----- probability & P&C
  'pb-committee': (p) => {
    const n = p.m + p.w
    const woman = (i: number): boolean => i >= p.m
    let fav = 0
    let tot = 0
    subsets(n, p.k, (s) => {
      tot++
      const wc = s.filter(woman).length
      const has = (x: number): boolean => s.includes(x)
      if (p.variant === 0) fav += wc >= p.param && !(has(0) && has(p.m)) ? 1 : 0
      else if (p.variant === 1) fav += wc <= p.param && has(0) === has(1) ? 1 : 0
      else if (p.variant === 2) fav += wc === p.param && has(p.m) && !has(0) ? 1 : 0
      else fav += wc >= 1 && p.k - wc >= 2 ? wc : 0
    })
    if (p.ask === 0) return num(fav)
    return fracE(fav / gcd(fav, tot), tot / gcd(fav, tot))
  },
  'pb-letters': (p) => {
    const letters: string[] = p.word.split('')
    const seen = new Set<string>()
    permutations(letters, (perm) => seen.add(perm.join('')))
    let fav = 0
    for (const w of seen) {
      const t = w.split('').map(isVowel)
      const n = t.length
      let ok = false
      if (p.cond === 'together') {
        const first = t.indexOf(true)
        const last = t.lastIndexOf(true)
        ok = t.slice(first, last + 1).every(Boolean)
      } else if (p.cond === 'apart') ok = !t.some((x, i) => x && t[i + 1])
      else if (p.cond === 'odd') ok = t.every((x, i) => !x || (i + 1) % 2 === 1)
      else if (p.cond === 'startC-endV') ok = !t[0] && t[n - 1]
      else ok = !t[0] && !t[n - 1]
      if (ok) fav++
    }
    return p.ask === 0 ? num(fav) : fracE(fav / gcd(fav, seen.size), seen.size / gcd(fav, seen.size))
  },
  'pb-balls': (p) => {
    const colours: number[] = []
    p.cnt.forEach((c: number, i: number) => {
      for (let q = 0; q < c; q++) colours.push(i)
    })
    const ev: Record<string, (c: number[]) => boolean> = {
      'all the balls are of different colours': (c) => c[0] === 1 && c[1] === 1 && c[2] === 1,
      'exactly two balls are red': (c) => c[0] === 2,
      'at least two balls are red': (c) => c[0] >= 2,
      'at least one ball of each colour is drawn': (c) => c.every((x) => x >= 1),
      'exactly two balls are blue': (c) => c[1] === 2,
      'exactly two balls are of the same colour': (c) => c.includes(2) && c.every((x) => x <= 2) && c.filter((x) => x === 2).length === 1 && c.reduce((a, b) => a + b, 0) === 3,
      'no green ball is drawn': (c) => c[2] === 0,
      'at least one blue ball is drawn': (c) => c[1] >= 1,
      'at least one red ball is drawn': (c) => c[0] >= 1,
    }
    let fav = 0
    let tot = 0
    subsets(colours.length, p.k, (s) => {
      const c = [0, 0, 0]
      s.forEach((i) => c[colours[i]]++)
      if (p.B && !ev[p.B](c)) return
      tot++
      if (ev[p.A](c)) fav++
    })
    return fracE(fav / gcd(fav, tot), tot / gcd(fav, tot))
  },
  'pb-dice': (p) => {
    const prime = [2, 3, 5, 7, 11]
    const ev: Record<string, (d: number[]) => boolean> = {
      'sum-prime': (d) => prime.includes(d[0] + d[1]),
      'sum-mult4': (d) => (d[0] + d[1]) % 4 === 0,
      'sum-ge9': (d) => d[0] + d[1] >= 9,
      'prod-even': (d) => d[0] * d[1] % 2 === 0,
      diff: (d) => d[0] !== d[1],
      'prod-gt12': (d) => d[0] * d[1] > 12,
      'sum-even': (d) => (d[0] + d[1]) % 2 === 0,
      has6: (d) => d.includes(6),
      'both-odd': (d) => d.every((x) => x % 2 === 1),
      'prod-mult3': (d) => d[0] * d[1] % 3 === 0,
      'exactly-two-same': (d) => new Set(d).size === 2,
      max5: (d) => Math.max(...d) === 5,
      'all-diff': (d) => new Set(d).size === 3,
      'first-odd': (d) => d[0] % 2 === 1,
    }
    if (p.nd === 3) ev[`sum-${p.s}`] = (d) => d[0] + d[1] + d[2] === p.s
    let fav = 0
    let tot = 0
    const total = 6 ** p.nd
    for (let code = 0; code < total; code++) {
      const d: number[] = []
      let c = code
      for (let i = 0; i < p.nd; i++) {
        d.push((c % 6) + 1)
        c = Math.floor(c / 6)
      }
      d.reverse()
      if (ev[p.B](d)) {
        tot++
        if (ev[p.A](d)) fav++
      }
    }
    return fracE(fav / gcd(fav, tot), tot / gcd(fav, tot))
  },
  'pb-cards': (p) => {
    // card index 0..51: suit = floor(i/13) (0 hearts, 1 diamonds, 2 spades, 3 clubs), rank = i % 13 (0 = ace .. 12 = king)
    const suit = (i: number): number => Math.floor(i / 13)
    const rank = (i: number): number => i % 13
    const red = (i: number): boolean => suit(i) <= 1
    const ev: Record<string, (a: number, b: number) => boolean> = {
      'same-suit': (a, b) => suit(a) === suit(b),
      'same-colour': (a, b) => red(a) === red(b),
      'one-ace': (a, b) => rank(a) === 0 || rank(b) === 0,
      'king-queen': (a, b) => [rank(a), rank(b)].sort().join() === [11, 12].join(),
      'both-face': (a, b) => rank(a) >= 10 && rank(b) >= 10,
      'heart-spade': (a, b) => [suit(a), suit(b)].sort().join() === '0,2',
      pair: (a, b) => rank(a) === rank(b),
      'at-least-one-red': (a, b) => red(a) || red(b),
      'both-red': (a, b) => red(a) && red(b),
      'one-face': (a, b) => rank(a) >= 10 || rank(b) >= 10,
    }
    let fav = 0
    let tot = 0
    for (let i = 0; i < 52; i++) {
      for (let j = 0; j < 52; j++) {
        if (i === j) continue
        if (p.B && !ev[p.B](i, j)) continue
        tot++
        if (ev[p.A](i, j)) fav++
      }
    }
    return fracE(fav / gcd(fav, tot), tot / gcd(fav, tot))
  },
  'pb-numbers': (p) => {
    let count = 0
    const rec = (cur: number[]): void => {
      if (cur.length === p.nd) {
        const n = cur.reduce((a, d) => a * 10 + d, 0)
        const okCond = p.cond === 'even' ? n % 2 === 0 : p.cond === 'odd' ? n % 2 === 1 : n % 5 === 0
        if (cur[0] !== 0 && n >= p.t * 10 ** (p.nd - 1) && okCond) count++
        return
      }
      for (const d of p.S0) {
        if (!p.rep && cur.includes(d)) continue
        rec([...cur, d])
      }
    }
    rec([])
    return num(count)
  },
  'pb-circular': (p) => {
    const n = p.m + p.w
    const woman = (i: number): boolean => i >= p.m
    let good = 0
    // all n! seatings; a circular arrangement counts n times (one per rotation)
    permutations(
      Array.from({ length: n }, (_, i) => i),
      (seat) => {
        const next = (i: number): number => seat[(i + 1) % n]
        const adjacent = (a: number, b: number): boolean => seat.some((x, i) => (x === a && next(i) === b) || (x === b && next(i) === a))
        let ok: boolean
        if (p.variant === 0) ok = seat.every((x, i) => woman(x) !== woman(next(i)))
        else if (p.variant === 1) ok = seat.every((x, i) => !(woman(x) && woman(next(i))))
        else if (p.variant === 2) ok = seat.every((x, i) => !(woman(x) && woman(next(i)))) && adjacent(0, 1)
        else if (p.variant === 3) ok = !adjacent(0, 1)
        else {
          const runs = seat.filter((x, i) => woman(x) && !woman(seat[(i + n - 1) % n])).length
          ok = runs === 1
        }
        if (ok) good++
      },
    )
    return num(good / n)
  },
  'pb-select-arrange': (p) => {
    const letters: string[] = p.word.split('')
    let count = 0
    const rec = (cur: number[]): void => {
      if (cur.length === p.k) {
        const t = cur.map((i) => isVowel(letters[i]))
        if (t.filter(Boolean).length !== p.vv) return
        if (p.cond === 'none') count++
        else if (p.cond === 'startC') count += t[0] ? 0 : 1
        else {
          const first = t.indexOf(true)
          const last = t.lastIndexOf(true)
          if (t.slice(first, last + 1).every(Boolean)) count++
        }
        return
      }
      for (let i = 0; i < letters.length; i++) if (!cur.includes(i)) rec([...cur, i])
    }
    rec([])
    return num(count)
  },
}
void fact
void redFrac

// ------------------------------------------------------------------ run
const TOPICS: QuantTopicId[] = ['time-work', 'speed-distance', 'mixture-alligation', 'mensuration', 'probability-pnc']
const summary: string[] = []
const LETTERS = 'ABCDE'

for (const topic of TOPICS) {
  const gen = MAINS_ARITH_B[topic]
  if (!gen) {
    fail(`${topic}: generator missing`)
    continue
  }
  const posCount = [0, 0, 0, 0, 0]
  const stems = new Set<string>()
  const perTpl = new Map<string, number>()
  const samples = new Map<string, { q: QuestionDraft; seed: number }>()
  let nQ = 0
  let noneCorrect = 0
  let solvedChecks = 0
  for (let seed = 1; seed <= SEEDS; seed++) {
    const count = COUNTS[seed % COUNTS.length]
    let groups
    try {
      groups = gen(createRng(seed * 7919 + 13), 'hard', count)
      const again = gen(createRng(seed * 7919 + 13), 'hard', count)
      if (JSON.stringify(groups) !== JSON.stringify(again)) fail(`${topic} seed ${seed}: not deterministic`)
    } catch (e) {
      fail(`${topic} seed ${seed} count ${count}: threw ${(e as Error).message}`)
      continue
    }
    const total = groups.reduce((a, g) => a + g.questions.length, 0)
    if (total !== count) fail(`${topic} seed ${seed}: count ${total} != ${count}`)
    for (const [gi, g] of groups.entries()) {
      try {
        assertGroup(g, `${topic}/${seed}/${gi}`)
      } catch (e) {
        fail((e as Error).message)
      }
      for (const q of g.questions) {
        nQ++
        stems.add(q.stem)
        posCount[q.answer]++
        const meta = MAINS_B_META.get(q)
        if (!meta) {
          fail(`${topic} seed ${seed}: question without metadata`)
          continue
        }
        perTpl.set(meta.tpl, (perTpl.get(meta.tpl) ?? 0) + 1)
        if (!samples.has(meta.tpl)) samples.set(meta.tpl, { q, seed })
        if (new Set(q.options.map((o) => o.trim().toLowerCase())).size !== 5) fail(`${meta.tpl}/${seed}: duplicate options`)
        if (!/^Correct answer: \([A-E]\)/m.test(q.explanation)) fail(`${meta.tpl}/${seed}: explanation lacks answer line`)
        if (!q.explanation.includes('\n')) fail(`${meta.tpl}/${seed}: explanation is single line`)
        if (!q.explanation.includes(`(${LETTERS[q.answer]})`)) fail(`${meta.tpl}/${seed}: explanation letter differs from answer`)
        const solver = SOLVERS[meta.tpl]
        if (!solver) {
          fail(`no independent solver for ${meta.tpl}`)
          continue
        }
        try {
          const sol = solver(meta.p)
          solvedChecks++
          for (const m of sol.must ?? []) if (!q.stem.includes(m)) fail(`${meta.tpl}/${seed}: stem lacks "${m}"`)
          const parsed = q.options.map(parseOpt)
          const isNone = q.options[q.answer] === 'None of these'
          if (isNone) {
            noneCorrect++
            if (parsed.some((o) => sameValue(sol.exp, o))) fail(`${meta.tpl}/${seed}: marked None of these but the true value is among the options`)
          } else {
            if (!sameValue(sol.exp, parsed[q.answer])) fail(`${meta.tpl}/${seed}: KEY MISMATCH. independent=${JSON.stringify(sol.exp)} option="${q.options[q.answer]}" stem="${q.stem.slice(0, 90)}"`)
            parsed.forEach((o, i) => {
              if (i !== q.answer && sameValue(sol.exp, o)) fail(`${meta.tpl}/${seed}: true value also appears as option ${LETTERS[i]}`)
            })
          }
        } catch (e) {
          fail(`${meta.tpl}/${seed}: solver error ${(e as Error).message}`)
        }
      }
    }
  }
  // position uniformity
  posCount.forEach((c, i) => {
    const share = c / nQ
    if (share < 0.12 || share > 0.28) fail(`${topic}: option ${LETTERS[i]} correct ${(share * 100).toFixed(1)}% (outside 12-28%)`)
  })
  // timing: average ms to generate 30 questions
  const t0 = performance.now()
  const REP = 20
  for (let r = 0; r < REP; r++) {
    for (let b = 0; b < 3; b++) gen(createRng(900000 + r * 3 + b), 'hard', 10)
  }
  const ms30 = (performance.now() - t0) / REP
  if (ms30 > 200) fail(`${topic}: ${ms30.toFixed(1)} ms per 30 questions (> 200)`)
  summary.push(`${topic.padEnd(20)} questions=${String(nQ).padStart(5)} solverChecks=${String(solvedChecks).padStart(5)} distinctStems=${String(stems.size).padStart(5)} templates=${perTpl.size} ms/30q=${ms30.toFixed(1)} pos%=${posCount.map((c) => ((c / nQ) * 100).toFixed(0)).join('/')} noneCorrect=${noneCorrect}`)

  console.log(`\n==================== ${topic} — sample questions ====================`)
  const picks = [...samples.entries()]
  const chosen = [picks[0], picks[Math.floor(picks.length / 2)], picks[picks.length - 1]]
  for (const [tpl, { q }] of chosen) {
    console.log(`\n[template ${tpl}]`)
    console.log(`Q: ${q.stem}`)
    q.options.forEach((o, i) => console.log(`   ${LETTERS[i]}) ${o}`))
    console.log(q.explanation.split('\n').map((l) => `   | ${l}`).join('\n'))
  }
  console.log(`\ntemplates used: ${[...perTpl.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`)
}

console.log('\n==================== SUMMARY ====================')
summary.forEach((l) => console.log(l))
if (failures > 0) {
  console.log(`\nFAILED: ${failures} problem(s). First ones:`)
  failMsgs.forEach((m) => console.log(' - ' + m))
  process.exit(1)
}
console.log(`\nALL CHECKS PASSED (${SEEDS} seeds per topic).`)
