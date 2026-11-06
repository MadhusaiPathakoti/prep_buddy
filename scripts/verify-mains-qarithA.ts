// Verifier for the SBI-PO-Mains-level arithmetic generators (set A): percentage, profit-loss, ratio-partnership,
// ages-averages, interest, number-system.  Run:  npx tsx scripts/verify-mains-qarithA.ts
// Per topic it generates 320 seeds (counts cycling through 1..12) and checks: exact count, assertGroup, determinism,
// distinct options, uniform key position (12-28% per letter), and an INDEPENDENT brute-force/simulation re-solve of every
// question from the tagged inputs (never the generator's closed-form code).  Exits non-zero on any failure.
import { createRng } from '../src/lib/mocks/rng'
import { assertGroup } from '../src/lib/mocks/validate'
import { fmtNum } from '../src/lib/mocks/options'
import { MAINS_ARITH_A, mainsArithMeta } from '../src/lib/mocks/quant/mains/arithA'
import type { Group, QuantTopicId, QuestionDraft } from '../src/lib/mocks/types'

const SEEDS = Number(process.env.SEEDS ?? 320)
const TOPICS = Object.keys(MAINS_ARITH_A) as QuantTopicId[]
let failures = 0
const fail = (msg: string): void => {
  failures++
  if (failures <= 40) console.error(`  FAIL ${msg}`)
}

type P = Record<string, number | number[]>
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a))
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b
const txt = (x: number, pcs = 2): string => fmtNum(Number(x.toFixed(pcs)), pcs)
const plText = (x: number): string => (x >= 0 ? `${txt(x)}% profit` : `${txt(-x)}% loss`)
const digitSum = (n: number): number => String(n).split('').reduce((s, c) => s + Number(c), 0)
const cnt = (l: number, lo: number, hi: number): number => Math.floor(hi / l) - Math.floor((lo - 1) / l)

// ------------------------------------------------------------------ independent solvers (brute force / simulation)
const SOLVERS: Record<string, (p: P) => number | string> = {
  'pct-literacy': (p) => {
    const { m, f, p: pp, q, D, femMore } = p as Record<string, number>
    for (let T = 1; T <= 400000; T++) {
      if ((T * m) % (m + f) || (T * f) % (m + f)) continue
      const males = (T * m) / (m + f)
      const fem = T - males
      if ((males * pp) % 100 || (fem * q) % 100) continue
      const lm = (males * pp) / 100
      const lf = (fem * q) / 100
      if ((femMore ? lf - lm : lm - lf) === D) return T - lm - lf
    }
    throw new Error('no solution')
  },
  'pct-election-shift': (p) => {
    const { i, p: pp, y, D } = p as Record<string, number>
    for (let T = 100; T <= 400000; T++) {
      if ((T * (100 - i)) % 100) continue
      const V = (T * (100 - i)) / 100
      if ((V * pp) % 100) continue
      const w = (V * pp) / 100
      if ((w * y) % 100) continue
      const s = (w * y) / 100
      if (V - w + s - (w - s) === D) return T
    }
    throw new Error('no solution')
  },
  'pct-expenditure-change': (p) => {
    const { u, v, a, b, c, d } = p as Record<string, number>
    const oldT = (u + v) * 1e6
    const newT = u * 1e6 * (1 + a / 100) * (1 - c / 100) + v * 1e6 * (1 - b / 100) * (1 + d / 100)
    const ch = ((newT - oldT) / oldT) * 100
    return `${txt(Math.abs(ch))}% ${ch >= 0 ? 'increase' : 'decrease'}`
  },
  'pct-expenditure-amount': (p) => {
    const { u, v, a, b, c, d, E } = p as Record<string, number>
    const share = E / (u + v)
    return Math.round(u * share * (1 + a / 100) * (1 - c / 100) * 1e6 + v * share * (1 - b / 100) * (1 + d / 100) * 1e6) / 1e6
  },
  'pct-sections-marks': (p) => {
    const { M1, M2, M3, s1, s2, q } = p as Record<string, number>
    const T = M1 + M2 + M3
    for (let m3 = 0; m3 <= M3; m3++) if (M1 * s1 + M2 * s2 + 100 * m3 >= q * T) return m3
    throw new Error('no solution')
  },
  'pct-sections-pct': (p) => {
    const { M1, M2, M3, s1, s2, q } = p as Record<string, number>
    const T = M1 + M2 + M3
    for (let m3 = 0; m3 <= M3; m3++) if (M1 * s1 + M2 * s2 + 100 * m3 >= q * T) return (m3 * 100) / M3
    throw new Error('no solution')
  },
  'pct-salary-chain': (p) => {
    const { x, y, z, w, S } = p as Record<string, number>
    for (let C = 1; C <= S; C++) {
      if ((C * (100 - y)) % 100) continue
      const B = (C * (100 - y)) / 100
      if ((B * (100 + x)) % 100) continue
      const A = (B * (100 + x)) / 100
      if (A + C === S) return A + (B * (100 + z)) / 100 + (C * (100 - w)) / 100
    }
    throw new Error('no solution')
  },
  'pct-venn-both': (p) => {
    const { x, y, z, K } = p as Record<string, number>
    for (let T = 100; T <= 60000; T += 1) {
      if ((T * x) % 100 || (T * y) % 100 || (T * z) % 100) continue
      const fm = (T * x) / 100
      const fe = (T * y) / 100
      const fb = (T * z) / 100
      if (fm - fb + (fe - fb) === K) return T - (fm + fe - fb)
    }
    throw new Error('no solution')
  },
  'pct-venn-only': (p) => {
    const { x, y, z, K } = p as Record<string, number>
    for (let T = 100; T <= 60000; T += 1) {
      if ((T * x) % 100 || (T * y) % 100 || (T * z) % 100) continue
      const fm = (T * x) / 100
      const fe = (T * y) / 100
      const fb = (T * z) / 100
      if (fm - fb + (fe - fb) === K) return fm - fb
    }
    throw new Error('no solution')
  },
  'pct-population-reverse': (p) => {
    const { a, b, c, N } = p as Record<string, number>
    for (let P0 = 1; P0 <= 500000; P0++) {
      if ((P0 * (100 + a)) % 100) continue
      const P1 = (P0 * (100 + a)) / 100
      if ((P1 * (100 - b)) % 100) continue
      const P2 = (P1 * (100 - b)) / 100
      if ((P2 * (100 + c)) % 100) continue
      if ((P2 * (100 + c)) / 100 === N) return Math.abs(N - P0)
    }
    throw new Error('no solution')
  },
  'pct-income-savings': (p) => {
    const { a, b, c, x, y, z, S0 } = p as Record<string, number>
    for (let I = 100; I <= 400000; I += 100) {
      const rent = (I * a) / 100
      const r1 = I - rent
      const food = (r1 * b) / 100
      const r2 = r1 - food
      const trav = (r2 * c) / 100
      if (![rent, food, trav].every(Number.isInteger) || r2 - trav !== S0) continue
      return (I * (100 + x)) / 100 - (rent * (100 + y)) / 100 - ((food + trav) * (100 + z)) / 100
    }
    throw new Error('no solution')
  },
  'pl-two-articles': (p) => {
    const { p: pp, q, T, G } = p as Record<string, number>
    for (let a = 1; a < T; a++) if (a * pp - (T - a) * q === 100 * G) return a
    throw new Error('no solution')
  },
  'pl-discount-compare': (p) => {
    const { m, d1, d2, d3, G } = p as Record<string, number>
    for (let c = 100; c <= 200000; c += 100) {
      const g = c * (100 + m) * ((100 - d3) * 100 - (100 - d1) * (100 - d2))
      if (g === G * 1e6) return c
    }
    throw new Error('no solution')
  },
  'pl-lots': (p) => {
    const { Q, c, f1, f2, p1, l2, g } = p as Record<string, number>
    const q1 = (Q * f1) / 100
    const q2 = (Q * f2) / 100
    const q3 = Q - q1 - q2
    const target = Q * c * (100 + g)
    for (let sc = 1; sc <= 200000; sc++) {
      if (q1 * c * (100 + p1) + q2 * c * (100 - l2) + q3 * sc === target) return sc / 100
    }
    throw new Error('no solution')
  },
  'pl-mixture-wastage': (p) => {
    const { u, v, a, b, w, g } = p as Record<string, number>
    for (let sc = 1; sc <= 1000000; sc++) if (sc * (100 - w) * 100 * (u + v) === (u * a + v * b) * 10000 * (100 + g)) return sc / 100
    throw new Error('no solution')
  },
  'pl-chain': (p) => {
    const { p: pp, q, r, d } = p as Record<string, number>
    for (let a = 1; a <= d; a++) {
      if ((a * (100 + pp)) % 100) continue
      const b = (a * (100 + pp)) / 100
      if ((b * (100 - q)) % 100) continue
      const c = (b * (100 - q)) / 100
      if ((c * (100 + r)) % 100) continue
      if ((c * (100 + r)) / 100 === d) return b - a + (c - b) + (d - c)
    }
    throw new Error('no solution')
  },
  'pl-false-weight': (p) => {
    const { m, d, w } = p as Record<string, number>
    const cost = w / 1000 // cost of w grams at 1 per gram-kilo
    const revenue = ((1 + m / 100) * (1 - d / 100)) // price charged for the 1 kg claimed
    return plText(((revenue - cost) / cost) * 100)
  },
  'pl-free-offer': (p) => {
    const { m, d, x, y } = p as Record<string, number>
    const items = x + y
    const revenue = x * (1 + m / 100) * (1 - d / 100)
    return plText(((revenue - items) / items) * 100)
  },
  'pl-sp-difference': (p) => {
    const { p: pp, q, r, d, X } = p as Record<string, number>
    for (let c = 1; c <= 400000; c++) {
      if ((c * (pp + q)) / 100 !== X) continue
      const spr = (c * (100 + r)) / 100
      return (spr * 100) / (100 - d)
    }
    throw new Error('no solution')
  },
  'pl-overheads': (p) => {
    const { c, t, T, m, d } = p as Record<string, number>
    const outlay = c + (c * t) / 100 + T
    const sp = (c * (100 + m) * (100 - d)) / 10000
    return ((sp - outlay) / outlay) * 100
  },
  'rp-working-c': (p) => workingShares(p).C,
  'rp-working-a': (p) => workingShares(p).Atot,
  'rp-working-diff': (p) => workingShares(p).Atot - workingShares(p).B,
  'rp-capital-diff': (p) => {
    const w = capWeights(p)
    return (Math.abs(w.A - w.B) * (p.Pr as number)) / (w.A + w.B)
  },
  'rp-capital-total': (p) => {
    const w = capWeights(p)
    const D = p.D as number
    for (let Pr = 1; Pr <= 3000000; Pr++) if (Pr * Math.abs(w.A - w.B) === D * (w.A + w.B)) return Pr
    throw new Error('no solution')
  },
  'rp-transfers': (p) => {
    const { a, b, c, x, y, p: pp, q, r } = p as Record<string, number>
    for (let k = 1; k <= 100000; k++) {
      const A1 = a * k - x
      const B1 = b * k + x - y
      const C1 = c * k + y
      if (A1 > 0 && B1 > 0 && C1 > 0 && A1 * q === B1 * pp && B1 * r === C1 * q) return (a + b + c) * k
    }
    throw new Error('no solution')
  },
  'rp-two-years': (p) => {
    const { a, b, x, y, Pr1, Pr2 } = p as Record<string, number>
    const a2 = (a * (100 + x)) / 100
    const b2 = (b * (100 - y)) / 100
    return (Pr1 * a) / (a + b) + (Pr2 * a2) / (a2 + b2)
  },
  'rp-inverse': (p) => {
    const { T, h, gi, ri } = p as Record<string, number>
    const trio = p.trio as number[]
    const inv = trio.map((t) => 1 / t)
    const tot = inv.reduce((s, v) => s + v, 0)
    const sh = inv.map((v) => (T * v) / tot)
    return sh[ri] + (sh[gi] * h) / 100
  },
  'rp-income-expenditure': (p) => {
    const { a, b, c, d, S, x, y } = p as Record<string, number>
    for (let inc = 1; inc <= 200000; inc++) {
      const incA = a * inc
      if ((incA - S) % c) continue
      const ex = (incA - S) / c
      if (b * inc - d * ex === S && ex > 0) return (b * inc * (100 + x)) / 100 - (d * ex * (100 + y)) / 100
    }
    throw new Error('no solution')
  },
  'rp-find-capital': (p) => {
    const { a, b, m1, m2, Pr, sA } = p as Record<string, number>
    for (let c = 1; c <= 400000; c++) {
      const wa = 12 * a
      const W = wa + (12 - m1) * b + (12 - m2) * c
      if (sA * W === Pr * wa) return c
    }
    throw new Error('no solution')
  },
  'ag-ratio-past-future': (p) => {
    const { x, y, p1, q1, p2, q2, z } = p as Record<string, number>
    for (let A = 1; A <= 150; A++)
      for (let B = x + 1; B < A; B++) if (q1 * (A - x) === p1 * (B - x) && q2 * (A + y) === p2 * (B + y)) return A + B + 2 * z
    throw new Error('no solution')
  },
  'ag-family': (p) => {
    const { n, x, A, y, z, d } = p as Record<string, number>
    const dead0 = d - (x - z)
    const rest = n * A - dead0
    let total = 0
    for (let i = 0; i < n - 1; i++) total += Math.floor(rest / (n - 1)) + (i < rest % (n - 1) ? 1 : 0) + x
    return (total + y) / n
  },
  'ag-captain': (p) => {
    const { n, A, R, k, older } = p as Record<string, number>
    for (let c = 1; c <= 120; c++) {
      const o = older ? c + k : c - k
      if (c + o + R * (n - 2) === n * A) return c
    }
    throw new Error('no solution')
  },
  'ag-misread': (p) => {
    const { A, B, t1, t2, m1, m2 } = p as Record<string, number>
    const delta = t1 - m1 + (t2 - m2)
    for (let n = 1; n <= 300; n++) if (n * A * 10 + delta * 10 === n * B) return (n * B) / 10
    throw new Error('no solution')
  },
  'ag-father-sons': (p) => {
    const { S, k, p: pp, j } = p as Record<string, number>
    for (let Y = 1; Y <= 100; Y++) {
      const E = Y + pp
      const Fa = k * E
      if (Fa + E + Y !== S) continue
      for (let t = 1; t <= 200; t++) if (Fa + t === j * (Y + t)) return t
    }
    throw new Error('no solution')
  },
  'ag-replacement': (p) => {
    const { n, A, t, t2, p: pp, Bn, Bd, B2n, B2d } = p as Record<string, number>
    const B = Bn / Bd
    const B2 = B2n / B2d
    let q = -1
    for (let v = 1; v <= 100; v++) if (Math.abs(n * (A + t) - pp + v - n * B) < 1e-6) q = v
    for (let v = 1; v <= 100; v++) if (Math.abs(n * B + n * t2 - (q + t2) + v - n * B2) < 1e-6) return v
    throw new Error('no solution')
  },
  'ag-men-women': (p) => {
    const { n, M, W, An, Ad, k, e } = p as Record<string, number>
    for (let nm = k + 1; nm < n; nm++) if ((nm * M + (n - nm) * W) * Ad === n * An) return (nm * M - k * e) / (nm - k)
    throw new Error('no solution')
  },
  'ag-sections': (p) => {
    const { n1, a1, k, remA, a1c, n2, a2 } = p as Record<string, number>
    for (let x = 0; x <= 100; x++) if (Math.abs((n1 * a1 - k * x) / remA - a1c / 100) < 1e-6) return (n2 * a2 + k * x) / (n2 + k)
    throw new Error('no solution')
  },
  'in-split-sum': (p) => {
    const { u, v, r1, t1, r2, I } = p as Record<string, number>
    for (let k = 1; k <= 200000; k++) if (u * k * r1 * t1 * 100 + v * k * ((100 + r2) ** 2 - 10000) === I * 10000) return (u + v) * k
    throw new Error('no solution')
  },
  'in-difference-chain': (p) => {
    const { D, S3 } = p as Record<string, number>
    for (let r = 1; r <= 60; r++) {
      const P0 = (S3 * 100) / (3 * r)
      if (Number.isInteger(P0) && P0 * r * r === D * 10000) return (P0 * ((100 + r) ** 3 - 1e6)) / 1e6
    }
    throw new Error('no solution')
  },
  'in-instalments-x': (p) => instalment(p).x,
  'in-instalments-extra': (p) => {
    const x = instalment(p).x
    return (p.n as number) * x - (p.L0 as number)
  },
  'in-amounts-reveal': (p) => {
    const { a2, a3, t } = p as Record<string, number>
    for (let r = 1; r <= 100; r++) {
      const P0 = (a2 * 10000) / (100 + r) ** 2
      if (Number.isInteger(P0) && P0 * (100 + r) ** 3 === a3 * 1e6) return (P0 * r * t) / 100
    }
    throw new Error('no solution')
  },
  'in-half-yearly': (p) => {
    const { r, D } = p as Record<string, number>
    for (let P0 = 1; P0 <= 4000000; P0++) if (P0 * r * r === D * 40000) return (P0 * ((200 + r) ** 3 - 200 ** 3)) / 200 ** 3
    throw new Error('no solution')
  },
  'in-equal-interest': (p) => {
    const { r1, t1, r2, S, second } = p as Record<string, number>
    for (let p1 = 1; p1 < S; p1++) {
      const p2 = S - p1
      if (p1 * r1 * t1 * 100 === p2 * ((100 + r2) ** 2 - 10000)) return second ? p2 : p1
    }
    throw new Error('no solution')
  },
  'in-borrow-lend': (p) => {
    const { r1, f, Pn, G } = p as Record<string, number>
    const ci = (Pn * ((100 + r1) ** 2 - 10000)) / 10000
    for (let r2 = 1; r2 <= 200; r2++) if ((Pn * r2 * 2) / 100 - ci - (Pn * f) / 100 === G) return r2
    throw new Error('no solution')
  },
  'in-variable-rates': (p) => {
    const { r1, r2, r3, A } = p as Record<string, number>
    for (let P0 = 1; P0 <= A; P0++) if (P0 * (100 + r1) * (100 + r2) * (100 + r3) === A * 1e6) return A - P0
    throw new Error('no solution')
  },
  'ns-short-by': (p) => {
    const ds = p.ds as number[]
    const { s, d } = p as Record<string, number>
    for (let N = 1; N <= 5000000; N++) if (N % d === 0 && ds.every((x) => N % x === x - s)) return N
    throw new Error('no solution')
  },
  'ns-greatest-divisor': (p) => {
    const nums = p.nums as number[]
    const rem = p.rem as number[]
    let best = 0
    for (let g = Math.max(...rem) + 1; g <= 500; g++) if (nums.every((nn, i) => nn % g === rem[i])) best = g
    return (nums[0] + nums[1] + nums[2]) % best
  },
  'ns-largest-five-digit': (p) => {
    const ds = p.ds as number[]
    const r = p.r as number
    for (let N = 99999; N >= 10000; N--) if (ds.every((x) => N % x === r)) return digitSum(N)
    throw new Error('no solution')
  },
  'ns-missing-digits': (p) => {
    const { D, cx, cy } = p as Record<string, number>
    const arr = p.pattern as number[]
    const digs = arr.slice(0, 5)
    const pos = arr.slice(5)
    const out: number[] = []
    for (let x = 0; x <= 9; x++)
      for (let y = 0; y <= 9; y++) {
        const t = digs.slice()
        t[pos[0]] = x
        t[pos[1]] = y
        if (t[0] === 0) continue
        if (Number(t.join('')) % D === 0) out.push(cx * x + cy * y)
      }
    if (out.length !== 1) throw new Error(`digit solutions: ${out.length}`)
    return out[0]
  },
  'ns-consecutive': (p) => {
    const { step, cnt: c, S2, form } = p as Record<string, number>
    for (let a = 1; a <= 1000; a++) {
      const nums = Array.from({ length: c }, (_, i) => a + step * i)
      if (nums.reduce((s, v) => s + v * v, 0) !== S2) continue
      if (form === 0) return nums.reduce((s, v) => s + v ** 3, 0)
      if (form === 1) return nums[0] * nums[c - 1]
      return nums[c - 1] ** 2 - nums[0] ** 2
    }
    throw new Error('no solution')
  },
  'ns-reversal': (p) => {
    const { S, k, D } = p as Record<string, number>
    const hits: number[] = []
    for (let n = 100; n <= 999; n++) {
      const h = Math.floor(n / 100)
      const t = Math.floor(n / 10) % 10
      const u = n % 10
      const rev = u * 100 + t * 10 + h
      if (h + t + u === S && h === k * u && n - rev === D) hits.push(n + rev)
    }
    if (hits.length !== 1) throw new Error('reversal solutions ' + hits.length)
    return hits[0]
  },
  'ns-power-remainder': (p) => {
    const { m, A, B, e1, e2, prod } = p as Record<string, number>
    const bm = BigInt(m)
    const pw = (b: number, e: number): bigint => {
      let r = 1n
      let base = BigInt(b) % bm
      let k = BigInt(e)
      while (k > 0n) {
        if (k & 1n) r = (r * base) % bm
        base = (base * base) % bm
        k >>= 1n
      }
      return r
    }
    const x = pw(A, e1)
    const y = pw(B, e2)
    return Number(prod ? (x * y) % bm : (x + y) % bm)
  },
  'ns-counting': (p) => {
    const { a, b, c, lo, hi, lab } = p as Record<string, number>
    let n = 0
    for (let v = lo; v <= hi; v++) {
      const da = v % a === 0
      const db = v % b === 0
      if (lab === 0 ? da && db && v % c !== 0 : da !== db) n++
    }
    void cnt
    void lcm
    return n
  },
  'ns-hcf-lcm': (p) => {
    const { h, lcmv, S, askLarge } = p as Record<string, number>
    for (let x = h; x <= S; x += h) {
      const y = S - x
      if (y > x && y % h === 0 && gcd(x, y) === h && (x * y) / h === lcmv) return askLarge ? y : y * y - x * x
    }
    throw new Error('no solution')
  },
}

function workingShares(p: P): { A: number; B: number; C: number; Atot: number } {
  const { a, b, c, m, w, Pr } = p as Record<string, number>
  let mA = 0
  let mB = 0
  let mC = 0
  for (let mo = 1; mo <= 12; mo++) {
    mA += a
    mB += b
    if (mo > m) mC += c
  }
  const comm = (Pr * w) / 100
  const rem = Pr - comm
  const W = mA + mB + mC
  return { A: (rem * mA) / W, B: (rem * mB) / W, C: (rem * mC) / W, Atot: comm + (rem * mA) / W }
}
function capWeights(p: P): { A: number; B: number } {
  const { a, b, t1, t2, x1, y2 } = p as Record<string, number>
  let A = 0
  let B = 0
  for (let mo = 1; mo <= 12; mo++) {
    A += mo <= t1 ? a : a - x1
    B += mo <= t2 ? b : b + y2
  }
  return { A, B }
}
function instalment(p: P): { x: number } {
  const { r, n, L0 } = p as Record<string, number>
  for (let x = 1; x <= 2 * L0; x++) {
    let rhs = 0
    for (let i = 0; i < n; i++) rhs += x * (100 + r) ** i * 100 ** (n - i)
    if (L0 * (100 + r) ** n === rhs) return { x }
  }
  throw new Error('no solution')
}

// ------------------------------------------------------------------ checks
const norm = (s: string): string => s.replace(/[₹,%]|\s*years?$/g, '').replace(/−/g, '-').trim()
function keyText(q: QuestionDraft): string {
  const o = q.options[q.answer]
  if (o === 'None of these') {
    const m = /the correct value, (.+?), is not among/.exec(q.explanation)
    if (!m) throw new Error('None-of-these answer without the stated value')
    return m[1]
  }
  return o
}
function same(expected: number | string, key: string): boolean {
  if (typeof expected === 'string') return expected === key
  const n = Number(norm(key))
  return Number.isFinite(n) && Math.abs(n - expected) <= 1e-6 * Math.max(1, Math.abs(expected))
}

// ------------------------------------------------------------------ run
const seenTypes = new Set<string>()
for (const topic of TOPICS) {
  const g = MAINS_ARITH_A[topic]!
  const pos = [0, 0, 0, 0, 0]
  const stems = new Set<string>()
  let questions = 0
  let solved = 0
  const t0 = Date.now()
  for (let seed = 1; seed <= SEEDS; seed++) {
    const count = 1 + ((seed - 1) % 12)
    let groups: Group[]
    try {
      groups = g(createRng(seed * 7919 + topic.length), 'hard', count)
    } catch (e) {
      fail(`${topic} seed ${seed}: generator threw ${(e as Error).message}`)
      continue
    }
    const total = groups.reduce((s, x) => s + x.questions.length, 0)
    if (total !== count) fail(`${topic} seed ${seed}: count ${total} != ${count}`)
    const again = g(createRng(seed * 7919 + topic.length), 'hard', count)
    if (JSON.stringify(groups) !== JSON.stringify(again)) fail(`${topic} seed ${seed}: not deterministic`)
    for (const gr of groups) {
      try {
        assertGroup(gr, `${topic} seed ${seed}`)
      } catch (e) {
        fail((e as Error).message)
      }
      for (const q of gr.questions) {
        questions++
        stems.add(q.stem)
        pos[q.answer]++
        if (new Set(q.options).size !== 5) fail(`${topic} seed ${seed}: duplicate options`)
        if (/[^\n -ÿ−√∛≤≥≠₹→∴⇒≈π²³—]/.test(q.stem + q.options.join('') + q.explanation)) fail(`${topic} seed ${seed}: unsupported character in "${q.stem.slice(0, 40)}"`)
        if (!/Correct answer: \([A-E]\)/.test(q.explanation) || q.explanation.split('\n').length < 3) fail(`${topic} seed ${seed}: explanation not multi-line / missing answer line`)
        const meta = mainsArithMeta(q)
        if (!meta) {
          fail(`${topic} seed ${seed}: question has no meta`)
          continue
        }
        seenTypes.add(meta.t)
        const solver = SOLVERS[meta.t]
        if (!solver) {
          fail(`no independent solver for ${meta.t}`)
          continue
        }
        try {
          const expected = solver(meta.p)
          const key = keyText(q)
          if (!same(expected, key)) fail(`${topic}/${meta.t} seed ${seed}: independent answer ${expected} != key "${key}"\n    ${q.stem}`)
          else solved++
          // the key must sit in the right slot: the correct text is option[answer] (or None-of-these)
          if (q.options[q.answer] !== 'None of these' && q.options.filter((o) => same(expected, o)).length !== 1) fail(`${topic}/${meta.t} seed ${seed}: expected value matches ${q.options.filter((o) => same(expected, o)).length} options`)
        } catch (e) {
          fail(`${topic}/${meta.t} seed ${seed}: solver error ${(e as Error).message}\n    ${q.stem}`)
        }
      }
    }
  }
  const pct = pos.map((c) => (100 * c) / questions)
  if (pct.some((x) => x < 12 || x > 28)) fail(`${topic}: key position not uniform: ${pct.map((x) => x.toFixed(1)).join('/')}`)
  // timing: 30 questions at a time
  const tt = Date.now()
  const reps = 25
  for (let i = 0; i < reps; i++) g(createRng(100000 + i), 'hard', 30)
  const msPer30 = (Date.now() - tt) / reps
  if (msPer30 > 200) fail(`${topic}: ${msPer30.toFixed(1)} ms per 30 questions (limit 200)`)
  console.log(`${topic.padEnd(18)} questions=${questions} independently-verified=${solved} distinct-stems=${stems.size} avg=${msPer30.toFixed(1)}ms/30q key-positions A-E=${pct.map((x) => x.toFixed(1)).join('/')}% (${((Date.now() - t0) / 1000).toFixed(1)}s total)`)
}

const missing = Object.keys(SOLVERS).filter((t) => !seenTypes.has(t))
if (missing.length) fail(`template variants never generated: ${missing.join(', ')}`)

// ------------------------------------------------------------------ samples for eyeballing
for (const topic of TOPICS) {
  console.log(`\n==================== ${topic}: 3 samples ====================`)
  const gr = MAINS_ARITH_A[topic]!(createRng(4242), 'hard', 3)
  for (const x of gr) for (const q of x.questions) console.log(`\nQ. ${q.stem}\n${q.options.map((o, i) => `   ${'ABCDE'[i]}. ${o}`).join('\n')}\n${q.explanation}`)
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `FAILURES: ${failures}`}  (templates covered: ${seenTypes.size}/${Object.keys(SOLVERS).length})`)
process.exit(failures === 0 ? 0 : 1)
