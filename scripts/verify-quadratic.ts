// Verification harness for the Quadratic Equations game.  Run:  npx tsx scripts/verify-quadratic.ts
// Independent of the generator's internals: every question is re-derived from its RENDERED equation text (parsed back into
// A, B, C, solved with the quadratic formula in floating point, relation re-computed) and compared with the answer on offer.
// Also checks the session rules for surd equations: none on easy, 40–50% (rounded up) on medium/hard, none on the easy
// slots of a mixed session, and that surd roots really are whole multiples of the surd.
import { generateQuadraticQuestions, SURD_SHARE, type QuadraticDifficulty } from '../src/lib/quadratic'
import type { MCQQuestion } from '../src/lib/generators'

const RUNS = Number(process.env.RUNS ?? 300)
let failures = 0
const fail = (msg: string) => {
  failures++
  if (failures <= 25) console.error('FAIL', msg)
}

const OPTIONS = ['x > y', 'x ≥ y', 'x < y', 'x ≤ y', 'x = y or the relation cannot be established']

/** Parse "12x² − 36√3x − 360 = 0" (or any rearranged form) into A, B, C with B possibly containing √k. */
function parse(eq: string, v: string): { A: number; B: number; C: number; surds: number[] } {
  const surds: number[] = []
  const coeffs = { sq: 0, lin: 0, con: 0 }
  const sides = eq.replace(/−/g, '-').replace(/\s+/g, '').split('=')
  if (sides.length !== 2) throw new Error(`not an equation: ${eq}`)
  sides.forEach((side, idx) => {
    const sideSign = idx === 0 ? 1 : -1
    let consumed = 0
    for (const m of side.matchAll(/([+-]?)(\d*)(?:√(\d+))?(x²|y²|x|y)?/g)) {
      if (m[0] === '') continue
      consumed += m[0].length
      const sign = m[1] === '-' ? -1 : 1
      const hasVar = m[4] !== undefined
      const hasRoot = m[3] !== undefined
      if (m[2] === '' && !hasVar && !hasRoot) throw new Error(`bad term in ${eq}`)
      const digits = m[2] === '' ? 1 : Number(m[2])
      const value = digits * (hasRoot ? Math.sqrt(Number(m[3])) : 1) * sign * sideSign
      if (hasRoot) surds.push(Number(m[3]))
      if (m[4] === `${v}²`) coeffs.sq += value
      else if (m[4] === v) coeffs.lin += value
      else if (!hasVar) coeffs.con += value
      else throw new Error(`wrong variable in ${eq}`)
    }
    if (consumed !== side.length) throw new Error(`unparsed text in ${eq}`)
  })
  return { A: coeffs.sq, B: coeffs.lin, C: coeffs.con, surds }
}

function roots(A: number, B: number, C: number): number[] {
  let D = B * B - 4 * A * C
  // sqrt(D) magnifies rounding error when D is ~0 (double roots). Real discriminants here are whole numbers >= 1 (or exactly 0),
  // so anything this far below B² is rounding noise.
  if (Math.abs(D) < 1e-7 * Math.max(1, B * B)) D = 0
  if (D < 0) throw new Error('complex roots')
  const s = Math.sqrt(D)
  return [(-B + s) / (2 * A), (-B - s) / (2 * A)]
}

const EPS = 1e-9
function relationOf(xs: number[], ys: number[]): number {
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const eq = (a: number, b: number) => Math.abs(a - b) < EPS
  if (eq(minX, maxX) && eq(minY, maxY) && eq(minX, minY)) return 4
  if (minX > maxY + EPS) return 0
  if (maxX < minY - EPS) return 2
  if (eq(minX, maxY)) return 1
  if (eq(maxX, minY)) return 3
  return 4
}

let checked = 0
let surdChecked = 0
const surdRelations = new Set<string>()
let differentK = 0

function checkQuestion(q: MCQQuestion, where: string): { surd: boolean } {
  checked++
  const lines = q.context!.split('\n')
  if (lines.length !== 2 || !lines[0].startsWith('I. ') || !lines[1].startsWith('II. ')) fail(`${where}: bad context ${q.context}`)
  const xe = parse(lines[0].slice(3), 'x')
  const ye = parse(lines[1].slice(4), 'y')
  const xr = roots(xe.A, xe.B, xe.C)
  const yr = roots(ye.A, ye.B, ye.C)
  const expected = OPTIONS[relationOf(xr, yr)]
  if (q.correctMeaning !== expected) fail(`${where}: "${lines[0]}" / "${lines[1]}" → offered ${q.correctMeaning} but re-derived ${expected} (x=${xr}, y=${yr})`)
  if (!q.explanation!.includes(q.correctMeaning)) fail(`${where}: explanation does not state the answer`)
  if (/NaN|undefined/.test(q.explanation! + q.context!)) fail(`${where}: bad text`)
  if (!q.options.includes(q.correctMeaning) || q.options.length !== 5) fail(`${where}: options wrong`)

  const surd = xe.surds.length > 0 || ye.surds.length > 0
  if (surd) {
    surdChecked++
    surdRelations.add(q.correctMeaning)
    if (xe.surds.length === 0 || ye.surds.length === 0) fail(`${where}: surd pair must have surds in BOTH equations (as in the exam papers)`)
    if (!/surds/.test(q.instruction!)) fail(`${where}: surd question not labelled`)
    for (const [e, r, label] of [[xe, xr, 'x'], [ye, yr, 'y']] as const) {
      const k = e.surds[0]
      if (![2, 3, 5, 6].includes(k) || e.surds.some((s) => s !== k)) fail(`${where}: ${label} equation uses odd surds ${e.surds}`)
      if (Math.abs(e.A) < 2 || !Number.isInteger(Math.round(e.A)) || Math.abs(e.A - Math.round(e.A)) > 1e-9) fail(`${where}: ${label} leading coefficient ${e.A} should be a whole number ≥ 2`)
      if (Math.abs(e.C) > 721) fail(`${where}: ${label} constant ${e.C} too large`)
      for (const root of r) {
        const mult = root / Math.sqrt(k)
        if (Math.abs(mult - Math.round(mult)) > 1e-7 || Math.round(mult) === 0) fail(`${where}: ${label} root ${root} is not a nonzero whole multiple of √${k}`)
      }
    }
    if (xe.surds[0] !== ye.surds[0]) differentK++
  }
  return { surd }
}

const DIFFS: QuadraticDifficulty[] = ['easy', 'medium', 'hard', 'mixed']
const COUNTS = [5, 10, 20, 30, 50]
const tally: Record<string, { sessions: number; surd: number; total: number; min: number }> = {}

for (const d of DIFFS) {
  for (const n of COUNTS) {
    const key = `${d}/${n}`
    tally[key] = { sessions: 0, surd: 0, total: 0, min: Infinity }
    for (let run = 0; run < RUNS; run++) {
      const qs = generateQuadraticQuestions(d, n)
      if (qs.length !== n) fail(`${key}: got ${qs.length} questions`)
      let surdCount = 0
      qs.forEach((q, i) => {
        const level = d === 'mixed' ? ['easy', 'medium', 'hard'][i % 3] : d
        if (!q.instruction!.includes(`· ${level}`)) fail(`${key} #${i}: expected level ${level}, label "${q.instruction}"`)
        const { surd } = checkQuestion(q, `${key} #${i}`)
        if (surd) {
          surdCount++
          if (level === 'easy') fail(`${key} #${i}: surd equation on an easy slot`)
        }
      })
      const t = tally[key]
      t.sessions++
      t.surd += surdCount
      t.total += qs.length
      t.min = Math.min(t.min, surdCount)
      const eligible = d === 'easy' ? 0 : d === 'mixed' ? Array.from({ length: n }, (_, i) => i % 3 !== 0).filter(Boolean).length : n
      const lo = Math.min(eligible, Math.ceil(n * SURD_SHARE))
      const hi = Math.min(eligible, Math.ceil(n * (SURD_SHARE + 0.1)))
      if (d === 'easy' && surdCount !== 0) fail(`${key}: easy session contains ${surdCount} surd questions`)
      if (surdCount < lo || surdCount > hi) fail(`${key}: ${surdCount} surd questions, expected ${lo}–${hi}`)
      if (d !== 'easy' && n >= 5 && surdCount / n < 0.4 - 1e-9 && eligible >= Math.ceil(n * 0.4)) fail(`${key}: only ${surdCount}/${n} are surds, under 40%`)
    }
  }
}
if (surdRelations.size !== 5) fail(`surd questions never covered every answer option (saw: ${[...surdRelations].join(' | ')})`)
if (differentK === 0) fail('never paired two different surds (like √2 with √3)')

if (failures > 0) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log(`ok: ${checked} questions re-derived from their equation text (${surdChecked} surd), ${differentK} pair different surds.`)
for (const [k, t] of Object.entries(tally)) console.log(`  ${k.padEnd(10)} surd share ${((100 * t.surd) / t.total).toFixed(1).padStart(5)}%   fewest in one session: ${t.min}/${k.split('/')[1]}`)
