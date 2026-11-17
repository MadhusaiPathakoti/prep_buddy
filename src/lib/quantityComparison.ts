import type { MCQQuestion } from './generators'
import { between, chance, gcd, pick, qid } from './mentalMath'

/**
 * Quantity Comparison (SBI/IBPS Prelims & Mains): two quantities I and II are given; choose the relation.
 *
 *   A  Quantity I > Quantity II      B  Quantity I ≥ Quantity II      C  Quantity II > Quantity I
 *   D  Quantity II ≥ Quantity I      E  Quantity I = Quantity II or no relation can be established
 *
 * A quantity is a SET of exact rational values: a single number (value of an expression, the root of a linear equation) or
 * several (the roots of a quadratic). The relation is decided from the min/max of the two sets, with exact fractions, never
 * decimals. B and D only arise when sets touch (quadratic roots, or "x is an integer such that …" questions).
 */

export type QuantityDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'
type Level = 'easy' | 'medium' | 'hard'

export const QUANTITY_OPTIONS = [
  'Quantity I > Quantity II',
  'Quantity I ≥ Quantity II',
  'Quantity II > Quantity I',
  'Quantity II ≥ Quantity I',
  'Quantity I = Quantity II or no relation can be established',
] as const

// ---------- exact fractions ----------

interface Frac {
  n: number
  d: number // > 0, lowest terms
}
const F = (n: number, d = 1): Frac => {
  const g = gcd(Math.abs(n), Math.abs(d)) || 1
  const s = d < 0 ? -1 : 1
  return { n: (s * n) / g, d: (s * d) / g }
}
const cmp = (a: Frac, b: Frac) => a.n * b.d - b.n * a.d
const val = (f: Frac) => f.n / f.d

const minus = (s: string) => s.replace(/-/g, '−')
const num = (n: number) => minus(String(n))

/** True when the fraction is a finite decimal with at most `places` decimals (denominator is 2^a·5^b and small enough). */
function terminating(f: Frac, places = 2): boolean {
  return Math.abs(f.n * 10 ** places) % f.d === 0
}
/** Whole number, finite decimal, or a/b — the way a value reads in a worked solution. */
function fv(f: Frac): string {
  if (f.d === 1) return num(f.n)
  if (terminating(f, 4)) return minus(String(Number(val(f).toFixed(4))))
  return minus(`${f.n}/${f.d}`)
}

/** Distinct values, ascending. */
function uniq(vals: Frac[]): Frac[] {
  const out: Frac[] = []
  for (const v of [...vals].sort(cmp)) if (!out.length || cmp(out[out.length - 1], v) !== 0) out.push(v)
  return out
}
const valuesText = (vals: Frac[]) => uniq(vals).map(fv).join(' or ')

// ---------- relation ----------

/** Index into QUANTITY_OPTIONS for two value sets (every value of I compared with every value of II). */
function relation(xs: Frac[], ys: Frac[]): number {
  const lo = (a: Frac[]) => a.reduce((p, q) => (cmp(p, q) <= 0 ? p : q))
  const hi = (a: Frac[]) => a.reduce((p, q) => (cmp(p, q) >= 0 ? p : q))
  const minX = lo(xs)
  const maxX = hi(xs)
  const minY = lo(ys)
  const maxY = hi(ys)
  if (cmp(minX, maxX) === 0 && cmp(minY, maxY) === 0 && cmp(minX, minY) === 0) return 4
  if (cmp(minX, maxY) > 0) return 0
  if (cmp(maxX, minY) < 0) return 2
  if (cmp(minX, maxY) === 0) return 1
  if (cmp(maxX, minY) === 0) return 3
  return 4
}

const REL_WORDS = [
  'every value of Quantity I is greater than every value of Quantity II',
  'Quantity I is never below Quantity II, and the two touch (equal for some pair)',
  'every value of Quantity I is less than every value of Quantity II',
  'Quantity II is never below Quantity I, and the two touch (equal for some pair)',
  'the comparison is not the same every time (or the quantities are always equal), so no single relation holds',
]

// ---------- quantities ----------

interface Qty {
  /** What follows "Quantity I: ". */
  text: string
  values: Frac[]
  /** The calculation, one short line. */
  work: string
  /** Short tag, to tell "same type of question" apart in the hint. */
  hint: string
}
type QtyGen = (v: 'x' | 'y') => Qty | null

const sgn = (n: number) => (n < 0 ? '−' : '+')
function tail(coef: number, sym: string): string {
  if (coef === 0) return ''
  const a = Math.abs(coef)
  return ` ${sgn(coef)} ${a === 1 && sym ? '' : a}${sym}`
}
const lead = (coef: number, sym: string): string => {
  const a = Math.abs(coef)
  return `${coef < 0 ? '−' : ''}${a === 1 && sym ? '' : a}${sym}`
}

const EQ_HINT = 'Solve each equation first to get the value of the variable, then compare.'
const ROOT_HINT = 'Factorise each equation to get its roots, then compare every root of I with every root of II.'

function eq(v: string, equation: string, roots: Frac[], work: string, hint = EQ_HINT): Qty {
  return { text: `${v}, where ${equation}`, values: roots, work, hint }
}

// ----- linear equations -----

const linEasy: QtyGen = (v) => {
  const a = between(2, 9)
  const x = between(2, 15)
  const b = between(3, 30)
  const minusB = chance(0.35)
  const c = minusB ? a * x - b : a * x + b
  if (c <= 0) return null
  return eq(
    v,
    `${a}${v} ${minusB ? '−' : '+'} ${b} = ${c}`,
    [F(x)],
    `${a}${v} = ${c} ${minusB ? '+' : '−'} ${b} = ${a * x} → ${v} = ${x}`,
  )
}

const linMedium: QtyGen = (v) => {
  const kind = pick(['both', 'divide', 'percent', 'bracket'] as const)
  if (kind === 'both') {
    // a·v + b = c·v + d  →  (a − c)·v = d − b
    const x = between(2, 15)
    const a = between(4, 12)
    const c = between(1, a - 2)
    const b = between(1, 30)
    const d = (a - c) * x + b
    return eq(v, `${lead(a, v)} + ${b} = ${lead(c, v)} + ${d}`, [F(x)], `${lead(a, v)} − ${lead(c, v)} = ${d} − ${b} → ${lead(a - c, v)} = ${d - b} → ${v} = ${x}`)
  }
  if (kind === 'divide') {
    const k = between(2, 9)
    const t = between(2, 12)
    const m = between(1, 20)
    return eq(v, `${v}/${k} + ${m} = ${t + m}`, [F(k * t)], `${v}/${k} = ${t + m} − ${m} = ${t} → ${v} = ${t} × ${k} = ${k * t}`)
  }
  if (kind === 'percent') {
    const p = pick([5, 10, 15, 20, 25, 30, 40, 50, 60, 75])
    const x = between(2, 30) * 20
    const q = (p * x) / 100
    if (!Number.isInteger(q)) return null
    return eq(v, `${p}% of ${v} = ${q}`, [F(x)], `${v} = ${q} × 100 ÷ ${p} = ${x}`)
  }
  const b = between(2, 9)
  const c = between(3, 15)
  const a = between(1, 20)
  const x = b * c - a
  if (x <= 0) return null
  return eq(v, `(${v} + ${a})/${b} = ${c}`, [F(x)], `${v} + ${a} = ${c} × ${b} = ${b * c} → ${v} = ${b * c} − ${a} = ${x}`)
}

// ----- quadratic equations -----

/**
 * A quadratic with the given roots. `fixed` forces one root (used to make the two quantities touch, for options B and D).
 * Hard sessions use fractional roots (leading coefficient > 1); medium ones integer roots, sometimes a repeated root.
 */
function quadratic(v: string, level: Exclude<Level, 'easy'>, fixed?: Frac): Qty | null {
  const sq = `${v}²`
  const pickRoot = (): Frac => {
    if (level === 'hard' && chance(0.7)) return F(between(-9, 9) || 1, pick([1, 2, 3, 4, 5]))
    return F(between(level === 'medium' ? -12 : -10, level === 'medium' ? 12 : 10))
  }
  const r1 = fixed ?? pickRoot()
  let r2 = pickRoot()
  if (!fixed && level !== 'hard' && chance(0.12)) r2 = r1
  if (level === 'hard' && r1.d === 1 && r2.d === 1) r2 = F(r2.n || 1, pick([2, 3, 4])) // keep hard questions genuinely fractional
  if (r1.d * r2.d > 20) return null
  const fac = (r: Frac) => (r.d === 1 ? (r.n === 0 ? v : `(${v} ${sgn(-r.n)} ${Math.abs(r.n)})`) : `(${lead(r.d, v)} ${sgn(-r.n)} ${Math.abs(r.n)})`)
  const A = r1.d * r2.d
  const B = -(r1.d * r2.n + r2.d * r1.n)
  const C = r1.n * r2.n
  const same = cmp(r1, r2) === 0
  const work = `${same ? `${fac(r1)}²` : `${fac(r1)}${fac(r2)}`} = 0 → ${v} = ${same ? fv(r1) : `${fv(r1)}, ${fv(r2)}`}`
  const standard = `${lead(A, sq)}${tail(B, v)}${tail(C, '')} = 0`
  let text = standard
  if (chance(0.55)) {
    const style = pick(['moveConstant', 'moveLinear'] as const)
    if (style === 'moveConstant' && C !== 0) text = minus(`${lead(A, sq)}${tail(B, v)} = ${-C}`)
    else if (style === 'moveLinear' && B !== 0) text = `${lead(A, sq)} = ${lead(-B, v)}${tail(-C, '')}`
  }
  return eq(v, text, same ? [r1] : [r1, r2], text === standard ? work : `${standard}; ${work}`, ROOT_HINT)
}

// ----- plain numeric quantities -----

function num1(text: string, value: Frac, work: string, hint: string): Qty {
  return { text, values: [value], work, hint }
}

const pctOf: QtyGen = () => {
  const p = pick([5, 10, 12, 15, 16, 20, 24, 25, 30, 35, 36, 40, 45, 48, 50, 60, 64, 75, 80])
  const N = between(8, 60) * 20
  const value = F(p * N, 100)
  if (!terminating(value, 1)) return null
  return num1(`${p}% of ${N}`, value, `${p}% of ${N} = ${p} × ${N} ÷ 100 = ${fv(value)}`, 'Work out each value, then compare.')
}

const exprEasy: QtyGen = () => {
  const kind = pick(['mulAdd', 'mulSub', 'sqAdd', 'bracket'] as const)
  const a = between(3, 19)
  const b = between(3, 19)
  const c = between(4, 60)
  if (kind === 'mulAdd') return num1(`${a} × ${b} + ${c}`, F(a * b + c), `${a} × ${b} + ${c} = ${a * b} + ${c} = ${a * b + c}`, 'Evaluate each expression; multiply before you add.')
  if (kind === 'mulSub') {
    if (a * b - c <= 0) return null
    return num1(`${a} × ${b} − ${c}`, F(a * b - c), `${a} × ${b} − ${c} = ${a * b} − ${c} = ${a * b - c}`, 'Evaluate each expression; multiply before you subtract.')
  }
  if (kind === 'sqAdd') return num1(`${a}² + ${c}`, F(a * a + c), `${a}² + ${c} = ${a * a} + ${c} = ${a * a + c}`, 'Evaluate each expression; square first.')
  return num1(`(${a} + ${b}) × ${c % 9 + 2}`, F((a + b) * (c % 9 + 2)), `(${a} + ${b}) × ${c % 9 + 2} = ${a + b} × ${c % 9 + 2} = ${(a + b) * (c % 9 + 2)}`, 'Brackets first, then multiply.')
}

const average: QtyGen = () => {
  const n = between(3, 5)
  const nums = Array.from({ length: n }, () => between(10, 99))
  const total = nums.reduce((p, q) => p + q, 0)
  const value = F(total, n)
  if (!terminating(value, 1)) return null
  const list = `${nums.slice(0, -1).join(', ')} and ${nums[n - 1]}`
  return num1(`The average of ${list}`, value, `Average = (${nums.join(' + ')}) ÷ ${n} = ${total} ÷ ${n} = ${fv(value)}`, 'Average = sum ÷ number of terms.')
}

const diffSq: QtyGen = () => {
  const a = between(11, 40)
  const b = between(4, a - 1)
  return num1(`${a}² − ${b}²`, F(a * a - b * b), `${a}² − ${b}² = (${a} − ${b})(${a} + ${b}) = ${a - b} × ${a + b} = ${a * a - b * b}`, 'a² − b² = (a − b)(a + b).')
}

const fracOf: QtyGen = () => {
  const d = pick([4, 5, 6, 7, 8, 9, 10, 12])
  const n = between(1, d - 1)
  if (gcd(n, d) !== 1) return null
  const N = d * between(5, 40)
  return num1(`${n}/${d} of ${N}`, F(n * N, d), `${n}/${d} of ${N} = ${N} ÷ ${d} × ${n} = ${N / d} × ${n} = ${(N / d) * n}`, 'Divide by the denominator, then multiply by the numerator.')
}

const simpleInterest: QtyGen = () => {
  const P = between(4, 30) * 500
  const r = between(4, 15)
  const t = between(2, 6)
  const value = F(P * r * t, 100)
  return num1(`Simple interest (in ₹) on ₹${P} at ${r}% per annum for ${t} years`, value, `SI = P × R × T ÷ 100 = ${P} × ${r} × ${t} ÷ 100 = ${fv(value)}`, 'SI = P × R × T ÷ 100.')
}

const rectangle: QtyGen = () => {
  const l = between(12, 60)
  const b = between(8, 40)
  if (l === b) return null
  if (chance(0.5)) return num1(`The area (in cm²) of a rectangle of length ${l} cm and breadth ${b} cm`, F(l * b), `Area = ${l} × ${b} = ${l * b}`, 'Area = length × breadth.')
  return num1(`The perimeter (in cm) of a rectangle of length ${l} cm and breadth ${b} cm`, F(2 * (l + b)), `Perimeter = 2 × (${l} + ${b}) = ${2 * (l + b)}`, 'Perimeter = 2 × (length + breadth).')
}

const squarePerimeter: QtyGen = () => {
  const k = between(6, 40)
  return num1(`The perimeter (in cm) of a square whose area is ${k * k} cm²`, F(4 * k), `Side = √${k * k} = ${k}; perimeter = 4 × ${k} = ${4 * k}`, 'Side = √area; perimeter = 4 × side.')
}

const sellingPrice: QtyGen = () => {
  const C = between(10, 120) * 20
  const p = pick([5, 10, 15, 20, 25, 30, 40])
  const loss = chance(0.4)
  const value = F(C * (100 + (loss ? -p : p)), 100)
  return num1(
    `The selling price (in ₹) of an article bought for ₹${C} at ${p}% ${loss ? 'loss' : 'profit'}`,
    value,
    `SP = ${C} × ${100 + (loss ? -p : p)} ÷ 100 = ${fv(value)}`,
    'SP = cost × (100 ± profit/loss %) ÷ 100.',
  )
}

const distance: QtyGen = () => {
  const sp = between(8, 25) * 5
  const t = between(2, 9)
  return num1(`The distance (in km) covered by a car moving at ${sp} km/h in ${t} hours`, F(sp * t), `Distance = ${sp} × ${t} = ${sp * t}`, 'Distance = speed × time.')
}

const trainSpeed: QtyGen = () => {
  const L = between(4, 40) * 10
  const t = between(4, 30)
  const value = F(L * 18, 5 * t)
  if (!terminating(value, 1)) return null
  return num1(`The speed (in km/h) of a ${L} m long train that crosses a pole in ${t} seconds`, value, `Speed = ${L} ÷ ${t} m/s × 18/5 = ${fv(value)} km/h`, 'Speed = length ÷ time (m/s); × 18/5 gives km/h.')
}

const sumFirstN: QtyGen = () => {
  const n = between(10, 60)
  const odd = chance(0.35)
  if (odd) return num1(`The sum of the first ${n} odd numbers`, F(n * n), `Sum = n² = ${n}² = ${n * n}`, 'Sum of the first n odd numbers = n².')
  return num1(`The sum of the first ${n} natural numbers`, F((n * (n + 1)) / 2), `Sum = n(n + 1) ÷ 2 = ${n} × ${n + 1} ÷ 2 = ${(n * (n + 1)) / 2}`, 'Sum of the first n natural numbers = n(n + 1) ÷ 2.')
}

const lcmHcf: QtyGen = () => {
  const g = between(2, 12)
  const a = g * between(2, 9)
  const b = g * between(2, 9)
  if (a === b) return null
  const h = gcd(a, b)
  if (chance(0.5)) return num1(`The LCM of ${a} and ${b}`, F((a * b) / h), `LCM = (${a} × ${b}) ÷ HCF = ${a * b} ÷ ${h} = ${(a * b) / h}`, 'LCM = product ÷ HCF.')
  return num1(`The HCF of ${a} and ${b}`, F(h), `The largest number dividing both ${a} and ${b} is ${h}`, 'HCF = the largest common factor.')
}

const successive: QtyGen = () => {
  const N = between(2, 20) * 100
  const p = pick([10, 20, 25, 30, 40, 50])
  const q = pick([10, 20, 25, 50])
  const up = chance(0.5)
  const first = 100 + p
  const second = up ? 100 + q : 100 - q
  const value = F(N * first * second, 10000)
  if (!terminating(value, 2)) return null
  return num1(
    `The value of ${N} after a ${p}% increase followed by a ${q}% ${up ? 'increase' : 'decrease'}`,
    value,
    `${N} × ${first}/100 × ${second}/100 = ${fv(value)}`,
    'Apply each percentage change to the new value, one after the other.',
  )
}

const compound: QtyGen = () => {
  const r = pick([5, 10, 20])
  const P = between(2, 20) * 100 * (r === 5 ? 4 : 1)
  const t = chance(0.6) ? 2 : 3
  const mult = (1 + r / 100) ** t
  const value = F(Math.round(P * mult * 100) - P * 100, 100)
  if (Math.abs(val(value) - (P * mult - P)) > 1e-6) return null
  return num1(
    `Compound interest (in ₹) on ₹${P} at ${r}% per annum for ${t} years`,
    value,
    `CI = ${P} × ((1 + ${r}/100)^${t} − 1) = ${P} × ${Number(mult.toFixed(6))} − ${P} = ${fv(value)}`,
    'CI = P × ((1 + R/100)^T − 1). Use successive growth factors.',
  )
}

const ratioLarger: QtyGen = () => {
  const a = between(2, 9)
  const b = between(a + 1, 12)
  if (gcd(a, b) !== 1) return null
  const k = between(3, 20)
  const total = (a + b) * k
  const large = chance(0.6)
  return num1(
    `The ${large ? 'larger' : 'smaller'} of two numbers in the ratio ${a} : ${b} whose sum is ${total}`,
    F((large ? b : a) * k),
    `1 part = ${total} ÷ ${a + b} = ${k}; ${large ? 'larger' : 'smaller'} = ${large ? b : a} × ${k} = ${(large ? b : a) * k}`,
    'Divide the sum by the total number of parts to get one part.',
  )
}

const pctOfPct: QtyGen = () => {
  const p = pick([10, 20, 25, 30, 40, 50, 60, 80])
  const q = pick([10, 20, 25, 40, 50, 75])
  const N = between(2, 24) * 100
  const value = F(p * q * N, 10000)
  if (!terminating(value, 2)) return null
  return num1(`${p}% of ${q}% of ${N}`, value, `${p}% of ${q}% of ${N} = ${p}/100 × ${q}/100 × ${N} = ${fv(value)}`, 'Convert each percentage to a fraction and multiply.')
}

const workTogether: QtyGen = () => {
  const a = pick([6, 8, 10, 12, 15, 20, 24, 30])
  const b = pick([6, 8, 10, 12, 15, 20, 24, 30, 36, 40])
  if (a >= b) return null
  const value = F(a * b, a + b)
  if (!terminating(value, 2)) return null
  return num1(
    `Days taken by A and B working together, if A alone takes ${a} days and B alone takes ${b} days`,
    value,
    `Together = (${a} × ${b}) ÷ (${a} + ${b}) = ${a * b} ÷ ${a + b} = ${fv(value)}`,
    'Together = (a × b) ÷ (a + b).',
  )
}

const averageSpeed: QtyGen = () => {
  const s1 = between(4, 15) * 5
  const s2 = between(4, 15) * 5
  if (s1 >= s2) return null
  const value = F(2 * s1 * s2, s1 + s2)
  if (!terminating(value, 2)) return null
  return num1(
    `The average speed (in km/h) of a car that covers equal distances at ${s1} km/h and ${s2} km/h`,
    value,
    `Average speed = 2 × ${s1} × ${s2} ÷ (${s1} + ${s2}) = ${2 * s1 * s2} ÷ ${s1 + s2} = ${fv(value)}`,
    'For equal distances, average speed = 2ab ÷ (a + b).',
  )
}

// ---------- family pools per level ----------

const EQUATION: Record<Level, QtyGen[]> = {
  easy: [linEasy],
  medium: [linMedium, linMedium, (v) => quadratic(v, 'medium')],
  hard: [(v) => quadratic(v, 'hard'), (v) => quadratic(v, 'hard'), linMedium],
}
const NUMERIC: Record<Level, QtyGen[]> = {
  easy: [pctOf, exprEasy, average, diffSq],
  medium: [pctOf, fracOf, simpleInterest, rectangle, squarePerimeter, sellingPrice, distance, trainSpeed, sumFirstN, lcmHcf, successive],
  hard: [compound, ratioLarger, pctOfPct, workTogether, averageSpeed, successive, trainSpeed, diffSq],
}
/** How close the two values must be (larger ÷ smaller), so that the comparison needs real work. */
const CLOSE: Record<Level, number> = { easy: 2, medium: 1.7, hard: 1.35 }

// ---------- building questions ----------

interface Draft {
  context: string
  rel: number
  work: string
  hint: string
}

function draw(gen: QtyGen, v: 'x' | 'y', n: number): Qty[] {
  const out: Qty[] = []
  for (let i = 0; i < n * 4 && out.length < n; i++) {
    const q = gen(v)
    if (q) out.push(q)
  }
  return out
}

function compareLines(a: Qty, b: Qty, rel: number): string {
  const single = a.values.length === 1 && b.values.length === 1
  const head = `Quantity I = ${valuesText(a.values)}; Quantity II = ${valuesText(b.values)}`
  const body = single ? '' : ` — ${REL_WORDS[rel]}`
  return `${head}${body} → ${QUANTITY_OPTIONS[rel]}`
}

/** Pick two same-kind quantities (pools of candidates, every pair tried) with the wanted relation and a fair closeness. */
function pairFrom(xs: Qty[], ys: Qty[], target: number, level: Level, equations: boolean): Draft | null {
  const hits: [Qty, Qty][] = []
  for (const a of xs)
    for (const b of ys) {
      if (a.text === b.text) continue
      if (relation(a.values, b.values) !== target) continue
      // closeness only matters for single numeric values (a ratio of the sets' extremes is meaningless for roots)
      if (!equations && a.values.length === 1 && b.values.length === 1) {
        const x = Math.abs(val(a.values[0]))
        const y = Math.abs(val(b.values[0]))
        if (x === 0 || y === 0) continue
        const ratio = Math.max(x, y) / Math.min(x, y)
        if (ratio > CLOSE[level]) continue
      }
      hits.push([a, b])
    }
  if (!hits.length) return null
  const [a, b] = pick(hits)
  const context = `Quantity I: ${a.text}\nQuantity II: ${b.text}`
  const work = equations ? `I. ${a.work}\nII. ${b.work}` : `Quantity I: ${a.work}\nQuantity II: ${b.work}`
  return { context, rel: target, work: `${work}\n${compareLines(a, b, target)}`, hint: a.hint }
}

function numericPair(level: Level, target: number): Draft | null {
  const pool = NUMERIC[level]
  const g1 = pick(pool)
  const g2 = chance(0.65) ? g1 : pick(pool)
  return pairFrom(draw(g1, 'x', 28), draw(g2, 'y', 28), target, level, false)
}

function equationPair(level: Level, target: number): Draft | null {
  const pool = EQUATION[level]
  if ((target === 1 || target === 3) && level !== 'easy') {
    // B / D need the two root sets to touch: build y with one root equal to the extreme root of x that it must meet
    const g1 = pick(pool)
    const xs = draw(g1, 'x', 20)
    const ys: Qty[] = []
    for (const x of xs) {
      const sorted = uniq(x.values)
      const meet = target === 1 ? sorted[0] : sorted[sorted.length - 1] // x ≥ y: y's largest root = x's smallest
      for (let i = 0; i < 3; i++) {
        const y = quadratic('y', level, meet)
        if (y) ys.push(y)
      }
    }
    return pairFrom(xs, ys, target, level, true)
  }
  const g1 = pick(pool)
  const g2 = chance(0.7) ? g1 : pick(pool)
  return pairFrom(draw(g1, 'x', 30), draw(g2, 'y', 30), target, level, true)
}

// ----- "x is an integer such that …" (hard) -----

interface Form {
  kind: 'lin' | 'sq' | 'sqk' | 'const'
  a: number
  b: number
}
function formText(f: Form): string {
  if (f.kind === 'lin') return `${f.a === 1 ? 'x' : `${f.a}x`}${tail(f.b, '')}`
  if (f.kind === 'sq') return 'x²'
  if (f.kind === 'sqk') return `x²${tail(f.b, '')}`
  return `${f.b}`
}
const formVal = (f: Form, x: number): number => (f.kind === 'lin' ? f.a * x + f.b : f.kind === 'sq' ? x * x : f.kind === 'sqk' ? x * x + f.b : f.b)
function randForm(): Form {
  const kind = pick(['lin', 'lin', 'lin', 'sq', 'sqk', 'sqk', 'const'] as const)
  return { kind, a: between(1, 4), b: kind === 'sqk' ? between(-8, 12) || 3 : kind === 'const' ? between(1, 40) : between(-6, 12) }
}
const DOM_WORDS = [
  'Quantity I is greater than Quantity II for every allowed x',
  'Quantity I is at least Quantity II for every allowed x, with equality for some x',
  'Quantity I is less than Quantity II for every allowed x',
  'Quantity I is at most Quantity II for every allowed x, with equality for some x',
  'the comparison changes with x (or the quantities are always equal)',
]

function domainQuestion(target: number): Draft | null {
  const lo = between(-3, 4)
  const hi = lo + between(3, 6)
  const strictLo = chance(0.4)
  const strictHi = chance(0.4)
  const dom: number[] = []
  for (let x = lo; x <= hi; x++) if ((strictLo ? x > lo : x >= lo) && (strictHi ? x < hi : x <= hi)) dom.push(x)
  if (dom.length < 3) return null
  const f1 = randForm()
  const f2 = randForm()
  if ((target === 1 || target === 3) && f2.kind !== 'sq') {
    // make the quantities meet at one allowed x, so that "≥" / "≤" is actually possible
    const x0 = pick(dom)
    f2.b += formVal(f1, x0) - formVal(f2, x0)
  }
  if (formText(f1) === formText(f2) || (f1.kind === 'const' && f2.kind === 'const')) return null
  const cs = dom.map((x) => Math.sign(formVal(f1, x) - formVal(f2, x)))
  const rel = cs.every((c) => c > 0) ? 0 : cs.every((c) => c === 0) ? 4 : cs.every((c) => c >= 0) ? 1 : cs.every((c) => c < 0) ? 2 : cs.every((c) => c <= 0) ? 3 : 4
  if (rel !== target) return null
  const cond = `${num(lo)} ${strictLo ? '<' : '≤'} x ${strictHi ? '<' : '≤'} ${num(hi)}`
  const table = dom.map((x) => `x = ${num(x)}: I = ${num(formVal(f1, x))}, II = ${num(formVal(f2, x))}`).join('\n')
  return {
    context: `x is an integer such that ${cond}.\nQuantity I: ${formText(f1)}\nQuantity II: ${formText(f2)}`,
    rel,
    work: `x can be ${dom.map(num).join(', ')}\n${table}\n${DOM_WORDS[rel]} → ${QUANTITY_OPTIONS[rel]}`,
    hint: 'List every integer x allowed, put each into both quantities, and see whether the same relation holds every time.',
  }
}

// ----- two simultaneous equations (hard) -----

function systemQuestion(target: number): Draft | null {
  if (target === 1 || target === 3) return null
  const X = between(1, 20)
  const Y = between(1, 20)
  const p = between(1, 5)
  const q = between(1, 5)
  const r = between(1, 5)
  const s = between(1, 5)
  const det = p * s - q * r
  if (det === 0) return null
  const c1 = p * X + q * Y
  const c2 = r * X + s * Y
  const rel = X > Y ? 0 : X < Y ? 2 : 4
  if (rel !== target) return null
  const t1 = `${lead(p, 'x')} + ${lead(q, 'y')} = ${c1}`
  const t2 = `${lead(r, 'x')} + ${lead(s, 'y')} = ${c2}`
  const work =
    `(1) ${t1}; (2) ${t2}\n` +
    `Multiply (1) by ${s} and (2) by ${q}, then subtract: ${p * s - q * r}x = ${s * c1 - q * c2} → x = ${X}\n` +
    `Put x = ${X} in (1): ${q}y = ${c1} − ${p * X} = ${q * Y} → y = ${Y}\n` +
    `Quantity I = ${X}; Quantity II = ${Y} → ${QUANTITY_OPTIONS[rel]}`
  return {
    context: `${t1}\n${t2}\nQuantity I: x\nQuantity II: y`,
    rel,
    work,
    hint: 'Eliminate one variable (multiply so a coefficient matches, then subtract), solve, and back-substitute.',
  }
}

// ----- surds (hard) -----

const SURD_K = [2, 3, 5, 6, 7, 8, 10, 11, 12, 18, 20, 27, 32, 45, 48, 50, 72, 75]
interface Surd {
  a: number
  k: number
}
const surdText = (s: Surd) => `${s.a === 1 ? '' : s.a}√${s.k}`

function surdQuestion(target: number): Draft | null {
  if (target === 1 || target === 3) return null
  const mk = (): Surd => ({ a: between(1, 9), k: pick(SURD_K) })
  const A = mk()
  const B = mk()
  const sa = A.a * A.a * A.k
  const sb = B.a * B.a * B.k
  const rel = sa > sb ? 0 : sa < sb ? 2 : 4
  if (rel !== target || A.k === B.k) return null
  if (Math.max(sa, sb) / Math.min(sa, sb) > 1.5) return null
  return {
    context: `Quantity I: ${surdText(A)}\nQuantity II: ${surdText(B)}`,
    rel,
    work: `Bring each number under the root: I = √(${A.a}² × ${A.k}) = √${sa}; II = √(${B.a}² × ${B.k}) = √${sb}\n${sa} ${sa > sb ? '>' : sa < sb ? '<' : '='} ${sb} → ${QUANTITY_OPTIONS[rel]}`,
    hint: 'Square both quantities (a√k squared is a² × k), or put the multiplier under the root, and compare the numbers.',
  }
}

// ---------- targets & session ----------

/** Touching types (quadratic roots, integer ranges) ask for B/D often; single-value types only ever have A, C or E. */
const pickTarget = (touches: boolean) => {
  const r = Math.random()
  if (touches) return r < 0.22 ? 0 : r < 0.44 ? 2 : r < 0.6 ? 1 : r < 0.76 ? 3 : 4
  return r < 0.37 ? 0 : r < 0.74 ? 2 : 4
}
/** Single values can only be >, < or = : touching relations are asked of sets (quadratic roots, domains) only. */
const noTouch = (t: number) => (t === 1 ? 0 : t === 3 ? 2 : t)

type Maker = (target: number) => Draft | null
function makers(level: Level): [number, Maker, boolean][] {
  // [weight, maker, can ask for ≥ / ≤]
  if (level === 'easy') return [[40, (t) => equationPair('easy', noTouch(t)), false], [60, (t) => numericPair('easy', noTouch(t)), false]]
  if (level === 'medium')
    return [
      [42, (t) => equationPair('medium', t), true],
      [16, (t) => equationPair('medium', noTouch(t)), false],
      [42, (t) => numericPair('medium', noTouch(t)), false],
    ]
  return [
    [32, (t) => equationPair('hard', t), true],
    [18, (t) => domainQuestion(t), true],
    [9, (t) => surdQuestion(noTouch(t)), false],
    [9, (t) => systemQuestion(noTouch(t)), false],
    [32, (t) => numericPair('hard', noTouch(t)), false],
  ]
}

function pickWeighted(items: [number, Maker, boolean][]): [number, Maker, boolean] {
  const total = items.reduce((s, i) => s + i[0], 0)
  let r = Math.random() * total
  for (const it of items) {
    r -= it[0]
    if (r <= 0) return it
  }
  return items[items.length - 1]
}

const STEM: Record<Level, string> = { easy: 'easy', medium: 'medium', hard: 'hard' }

function makeOne(level: Level, used: Set<string>): MCQQuestion | null {
  const ms = makers(level)
  for (let t = 0; t < 400; t++) {
    const [, make, touches] = pickWeighted(ms)
    const target = pickTarget(touches)
    const d = make(target)
    if (!d || used.has(d.context)) continue
    used.add(d.context)
    return {
      id: qid('qc'),
      instruction: `Quantity comparison · ${STEM[level]}`,
      context: d.context,
      term: 'Compare Quantity I and Quantity II.',
      correctMeaning: QUANTITY_OPTIONS[d.rel],
      options: [...QUANTITY_OPTIONS],
      hint: d.hint,
      explanation: d.work,
    }
  }
  return null
}

/** One question per slot; a mixed session cycles easy → medium → hard. No question repeats within a session. */
export function generateQuantityQuestions(difficulty: QuantityDifficulty, count: number): MCQQuestion[] {
  const used = new Set<string>()
  const out: MCQQuestion[] = []
  for (let i = 0; i < count; i++) {
    const level: Level = difficulty === 'mixed' ? (['easy', 'medium', 'hard'] as Level[])[i % 3] : difficulty
    const q = makeOne(level, used)
    if (q) out.push(q)
  }
  return out
}
