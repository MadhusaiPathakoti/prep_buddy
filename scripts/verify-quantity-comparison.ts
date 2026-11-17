// Verification harness for the Quantity Comparison game.  Run:  npx tsx scripts/verify-quantity-comparison.ts
// Independent of the generator's internals: the RENDERED question text is parsed back and re-solved in floating point
// (equations via the quadratic formula, expressions via eval, domains by brute force, surds by squaring, systems by Cramer's rule)
// and the relation compared with the answer on offer. Word-formula quantities (interest, speed, …) can't be re-parsed from text,
// so for those we check structure only (and the generator checks the same algebra in exact fractions).
import { generateQuantityQuestions, QUANTITY_OPTIONS, type QuantityDifficulty } from '../src/lib/quantityComparison'
import type { MCQQuestion } from '../src/lib/generators'

const RUNS = Number(process.env.RUNS ?? 200)
let failures = 0
const fail = (msg: string) => {
  failures++
  if (failures <= 25) console.error('FAIL', msg)
}
const EPS = 1e-7

const norm = (s: string) => s.replace(/−/g, '-')

/** Relation index between two value sets. */
function relationOf(xs: number[], ys: number[]): number {
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const eq = (a: number, b: number) => Math.abs(a - b) < EPS
  if (eq(minX, maxX) && eq(minY, maxY) && eq(minX, minY)) return 4
  if (minX - maxY > EPS) return 0
  if (minY - maxX > EPS) return 2
  if (eq(minX, maxY)) return 1
  if (eq(maxX, minY)) return 3
  return 4
}

/** Roots of an equation in `v`, from its text. f(v) = lhs − rhs is a polynomial of degree ≤ 2, fitted from f(−1), f(0), f(1). */
function equationRoots(text: string, v: string): number[] {
  const t = norm(text)
    .replace(/(\d+)% of (\w)/g, '($1/100*$2)')
    .replace(/²/g, '**2')
    .replace(new RegExp(`(\\d)(${v})`, 'g'), '$1*$2')
    .replace(new RegExp(`\\)(${v}|\\()`, 'g'), ')*$1')
  const [lhs, rhs] = t.split('=')
  const f = (x: number) => new Function(v, `return (${lhs}) - (${rhs})`)(x) as number
  const c = f(0)
  const a = (f(1) + f(-1)) / 2 - c
  const b = (f(1) - f(-1)) / 2
  if (Math.abs(a) < 1e-12) return [-c / b]
  let D = b * b - 4 * a * c
  if (Math.abs(D) < 1e-9) D = 0
  if (D < 0) throw new Error(`complex roots: ${text}`)
  const s = Math.sqrt(D)
  return [(-b + s) / (2 * a), (-b - s) / (2 * a)]
}

function expressionValue(text: string): number | null {
  const t = norm(text)
  if (/[A-Za-z₹]/.test(t.replace(/ of /g, ''))) return null
  if (!/^[\d\s×+\-²()%/√.]+( of [\d\s×+\-²()%/√.]+)*$/.test(t)) return null
  const js = t
    .replace(/(\d+)% of /g, '($1/100)*')
    .replace(/(\d+)\/(\d+) of /g, '($1/$2)*')
    .replace(/(\d+)²/g, '($1**2)')
    .replace(/×/g, '*')
  return new Function(`return ${js}`)() as number
}

function surdValue(text: string): number | null {
  const m = /^(\d*)√(\d+)$/.exec(norm(text))
  return m ? (m[1] === '' ? 1 : Number(m[1])) * Math.sqrt(Number(m[2])) : null
}

function checkQuestion(q: MCQQuestion, label: string) {
  const answer = q.options.indexOf(q.correctMeaning)
  if (answer < 0) return fail(`${label}: correct option missing: ${q.correctMeaning}`)
  if (q.options.length !== 5 || q.options.some((o, i) => o !== QUANTITY_OPTIONS[i])) fail(`${label}: options not the fixed five`)
  if (!q.explanation || !q.explanation.includes(QUANTITY_OPTIONS[answer])) fail(`${label}: explanation does not state the answer\n${q.explanation}`)
  if (!q.hint) fail(`${label}: no hint`)
  const lines = (q.context ?? '').split('\n')
  const ctx = `${label}\n${q.context}`

  // --- simultaneous equations ---
  if (lines.length === 4 && lines[2] === 'Quantity I: x' && lines[3] === 'Quantity II: y') {
    const [p, q1, c1] = /^(\d*)x \+ (\d*)y = (\d+)$/.exec(norm(lines[0])).slice(1).map((s, i) => (s === '' && i < 2 ? 1 : Number(s)))
    const [r, s, c2] = /^(\d*)x \+ (\d*)y = (\d+)$/.exec(norm(lines[1])).slice(1).map((s2, i) => (s2 === '' && i < 2 ? 1 : Number(s2)))
    const det = p * s - q1 * r
    const x = (c1 * s - q1 * c2) / det
    const y = (p * c2 - r * c1) / det
    if (relationOf([x], [y]) !== answer) fail(`system wrong\n${ctx}\nanswer ${answer}`)
    return
  }

  // --- integer domain ---
  if (lines[0].startsWith('x is an integer such that')) {
    const m = /such that (-?\d+) (<|≤) x (<|≤) (-?\d+)\.$/.exec(norm(lines[0]))
    if (!m) return fail(`domain header unparsed\n${ctx}`)
    const [lo, hi] = [Number(m[1]), Number(m[4])]
    const f1 = lines[1].replace('Quantity I: ', '')
    const f2 = lines[2].replace('Quantity II: ', '')
    const ev = (f: string, x: number) =>
      new Function('x', `return ${norm(f).replace(/²/g, '**2').replace(/(\d)x/g, '$1*x')}`)(x) as number
    const cs: number[] = []
    for (let x = lo; x <= hi; x++) {
      if (m[2] === '<' && x <= lo) continue
      if (m[3] === '<' && x >= hi) continue
      cs.push(Math.sign(ev(f1, x) - ev(f2, x)))
    }
    const all = (p: (c: number) => boolean) => cs.every(p)
    const rel = all((c) => c > 0) ? 0 : all((c) => c === 0) ? 4 : all((c) => c >= 0) ? 1 : all((c) => c < 0) ? 2 : all((c) => c <= 0) ? 3 : 4
    if (cs.length < 3) fail(`domain too small\n${ctx}`)
    if (rel !== answer) fail(`domain wrong (got ${rel}, answer ${answer})\n${ctx}`)
    return
  }

  // --- two quantities ---
  const a = /^Quantity I: (.*)$/.exec(lines[0])?.[1]
  const b = /^Quantity II: (.*)$/.exec(lines[1])?.[1]
  if (a === undefined || b === undefined || lines.length !== 2) return fail(`unexpected layout\n${ctx}`)

  const ma = /^x, where (.*)$/.exec(a)
  const mb = /^y, where (.*)$/.exec(b)
  if (ma && mb) {
    const xs = equationRoots(ma[1], 'x')
    const ys = equationRoots(mb[1], 'y')
    if (xs.some((r) => !Number.isFinite(r)) || ys.some((r) => !Number.isFinite(r))) return fail(`non-finite roots\n${ctx}`)
    if (relationOf(xs, ys) !== answer) fail(`equation pair wrong (got ${relationOf(xs, ys)}, answer ${answer}; x=${xs} y=${ys})\n${ctx}`)
    return
  }
  const sa = surdValue(a)
  const sb = surdValue(b)
  if (sa !== null && sb !== null) {
    if (relationOf([sa], [sb]) !== answer) fail(`surd wrong\n${ctx}`)
    return
  }
  const va = expressionValue(a)
  const vb = expressionValue(b)
  if (va !== null && vb !== null) {
    if (relationOf([va], [vb]) !== answer) fail(`expression wrong (${va} vs ${vb}, answer ${answer})\n${ctx}`)
    return
  }
  // word-formula quantity: cannot re-evaluate from the text — structural checks only
  if (answer === 1 || answer === 3) fail(`≥/≤ answer on single values\n${ctx}`)
  stats.wordOnly++
}

const stats = { wordOnly: 0 }

for (const difficulty of ['easy', 'medium', 'hard', 'mixed'] as QuantityDifficulty[]) {
  const dist = [0, 0, 0, 0, 0]
  let total = 0
  let short = 0
  const t0 = Date.now()
  for (let run = 0; run < RUNS; run++) {
    const count = 20
    const qs = generateQuantityQuestions(difficulty, count)
    if (qs.length !== count) short++
    const seen = new Set<string>()
    qs.forEach((q, i) => {
      if (seen.has(q.context ?? '')) fail(`${difficulty}: duplicate question in a session\n${q.context}`)
      seen.add(q.context ?? '')
      checkQuestion(q, `${difficulty} #${run}.${i}`)
      dist[q.options.indexOf(q.correctMeaning)]++
      total++
    })
  }
  const pct = dist.map((n) => `${((100 * n) / total).toFixed(0)}%`).join(' / ')
  console.log(`${difficulty.padEnd(6)} ${total} questions, ${short} short sessions, A/B/C/D/E = ${pct}, ${Date.now() - t0} ms`)
  if (short) fail(`${difficulty}: ${short} sessions returned fewer than the requested questions`)
  if (dist.some((n) => n === 0) && difficulty !== 'easy') fail(`${difficulty}: some option is never the answer`)
}
console.log(`word-formula questions checked structurally only: ${stats.wordOnly}`)
console.log(failures ? `${failures} FAILURES` : 'OK')
process.exit(failures ? 1 : 0)
