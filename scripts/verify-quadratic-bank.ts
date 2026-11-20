// Verification harness for the Quadratic Equations bank solver (api/_lib/qbQuadratic.js).  Run:  npx tsx scripts/verify-quadratic-bank.ts
// 1. Many random equation pairs (rational roots, surd roots, double roots, no real roots, linear) are solved and the relation
//    is compared with an independent floating-point oracle that works from the roots the equations were BUILT from.
// 2. Every generated question already in the bank that this solver can read must get the bank's own stored answer.
// 3. The same equation typed several ways must give the same canonical form (that is what catches duplicates).
// 4. The worked solution is well formed, and unusable input is refused with a message instead of a wrong answer.
import { readFileSync } from 'node:fs'
import { addQuadratic } from '../api/_lib/qbAddQuadratic.js'
import { canonicalOfStem, parseQuadraticInput, solveQuadraticPair } from '../api/_lib/qbQuadratic.js'
import { loadSeed, loadSeedQuadKeys } from '../api/_lib/qbSeed.js'
import { cleanQuadraticInput } from '../api/_lib/qbValidate.js'
import { parseSolution } from '../src/lib/qbank/solution'

const RUNS = Number(process.env.RUNS ?? 4000)
let failures = 0
const fail = (msg: string) => {
  failures++
  if (failures <= 30) console.error('FAIL', msg)
}

// ------------------------------------------------------------------------------------------------ random generator
const rnd = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1))
const nz = (span: number) => {
  let n = 0
  while (n === 0) n = rnd(-span, span)
  return n
}
const pick = <T,>(a: T[]) => a[rnd(0, a.length - 1)]

interface Built {
  text: string
  roots: number[]
  /** true when it has no real roots */
  none?: boolean
}
const sgn = (n: number) => (n < 0 ? '−' : '+')
const term = (coef: number, sym: string, first = false) => {
  if (coef === 0) return ''
  const a = Math.abs(coef)
  const body = a === 1 && sym && !sym.startsWith('√') ? sym : `${a === 1 && sym.startsWith('√') ? '' : a}${sym}`
  return first ? `${coef < 0 ? '−' : ''}${body}` : ` ${sgn(coef)} ${body}`
}

/** A·v² + B·v + C = 0 where the roots are p√k and q√k (k = 1 means rational). */
function surdEq(v: string, k: number, p: number, q: number, A: number): Built {
  const sum = p + q
  const prod = p * q * k
  const lin = k === 1 ? term(-A * sum, v) : term(-A * sum, `√${k}${v}`)
  return { text: `${term(A, `${v}²`, true)}${lin}${term(A * prod, '')} = 0`, roots: [p * Math.sqrt(k), q * Math.sqrt(k)] }
}
/** (q1·v − p1)(q2·v − p2) = 0 expanded: rational roots p1/q1, p2/q2. */
function fracEq(v: string): Built {
  const q1 = pick([1, 2, 3, 4])
  const q2 = pick([1, 2, 3, 5])
  const p1 = nz(9)
  const p2 = nz(9)
  const A = q1 * q2
  const B = -(q1 * p2 + q2 * p1)
  const C = p1 * p2
  return { text: `${term(A, `${v}²`, true)}${term(B, v)}${term(C, '')} = 0`, roots: [p1 / q1, p2 / q2] }
}
function noRoots(v: string): Built {
  // v² + b v + c with b² < 4c
  const b = rnd(-5, 5)
  const c = Math.floor((b * b) / 4) + rnd(1, 6)
  return { text: `${v}²${term(b, v)}${term(c, '')} = 0`, roots: [], none: true }
}
function linear(v: string): Built {
  const a = nz(9)
  const r = rnd(-12, 12)
  return { text: `${term(a, v, true)}${term(-a * r, '')} = 0`, roots: [r] }
}
function pure(v: string): Built {
  const k = rnd(1, 12)
  return { text: pick([`${v}² = ${k * k}`, `${v}² − ${k * k} = 0`]), roots: [-k, k] }
}
function build(v: string): Built {
  const r = Math.random()
  if (r < 0.3) return surdEq(v, pick([2, 3, 5, 6, 7]), nz(6), nz(6), rnd(2, 9))
  if (r < 0.55) return fracEq(v)
  if (r < 0.65) return surdEq(v, 1, nz(12), nz(12), 1)
  if (r < 0.72) {
    const a = nz(8)
    return surdEq(v, pick([2, 3, 5, 7]), a, a, rnd(2, 6)) // double root
  }
  if (r < 0.8) return noRoots(v)
  if (r < 0.9) return linear(v)
  return pure(v)
}

/** Relation (0..4) by floats from the exact roots the equations were built from. */
function oracle(x: Built, y: Built): number {
  if (x.none || y.none) return 4
  const eps = 1e-9
  const xs = x.roots
  const ys = y.roots
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const eq = (a: number, b: number) => Math.abs(a - b) < eps
  if (eq(minX, maxX) && eq(minY, maxY) && eq(minX, minY)) return 4
  if (minX - maxY > eps) return 0
  if (minY - maxX > eps) return 2
  if (eq(minX, maxY)) return 1
  if (eq(maxX, minY)) return 3
  return 4
}

const wellFormed = (q: ReturnType<typeof solveQuadraticPair>, where: string) => {
  if (!/^Step 1: .+\nStep 2: /m.test(q.solution) && !q.solution.includes('Step 1:')) fail(`${where}: no steps`)
  if (!q.solution.includes('Step 3:')) fail(`${where}: no step 3`)
  if (/NaN|undefined|Infinity|\[object|null/.test(q.solution)) fail(`${where}: bad text in solution`)
  const tail = q.solution.split('\n').pop() ?? ''
  if (tail !== `Correct answer: (${'ABCDE'[q.answerIndex]}) ${q.options[q.answerIndex]}`) fail(`${where}: wrong closing line "${tail}"`)
  if (q.options.length !== 5) fail(`${where}: options`)
}

// ----------------------------------------------------------------------------------------------------- 1. random pairs
const counts = [0, 0, 0, 0, 0]
let solvedCount = 0
for (let i = 0; i < RUNS; i++) {
  const x = build('x')
  const y = build('y')
  const text = `I. ${x.text}\nII. ${y.text}`
  try {
    const q = solveQuadraticPair(text)
    solvedCount++
    const want = oracle(x, y)
    counts[q.answerIndex]++
    if (q.answerIndex !== want) fail(`answer ${q.answerIndex} but oracle says ${want} for\n${text}\n${q.solution}`)
    wellFormed(q, text.replace(/\n/g, ' ⏎ '))
  } catch (e) {
    fail(`threw on ${text.replace(/\n/g, ' ⏎ ')}: ${(e as Error).message}`)
  }
}

// roots that touch (a shared value, often an irrational one) are what make x ≥ y and x ≤ y: random pairs rarely hit them
const touching = [0, 0, 0, 0, 0]
for (let i = 0; i < 1200; i++) {
  const k = pick([1, 2, 3, 5, 6, 7])
  const s = nz(6)
  const dir = pick([1, -1])
  const away = (sign: number) => {
    let n = nz(8)
    for (let t = 0; t < 40 && (n - s) * sign < 0; t++) n = nz(8)
    return n
  }
  const xr: [number, number] = [s, away(dir)]
  const yr: [number, number] = [s, away(-dir)]
  const x = surdEq('x', k, xr[0], xr[1], rnd(1, 5))
  const y = surdEq('y', k, yr[0], yr[1], rnd(1, 5))
  const text = `I. ${x.text}\nII. ${y.text}`
  try {
    const q = solveQuadraticPair(text)
    touching[q.answerIndex]++
    if (q.answerIndex !== oracle(x, y)) fail(`touching roots: answer ${q.answerIndex}, oracle ${oracle(x, y)} for\n${text}`)
  } catch (e) {
    fail(`threw on ${text.replace(/\n/g, ' ⏎ ')}: ${(e as Error).message}`)
  }
}
if (touching[1] < 100 || touching[3] < 100) fail(`touching-roots test is not reaching x ≥ y / x ≤ y (${touching.join('/')})`)

// ---------------------------------------------------------------------------- 2. every readable generated bank question
type Seed = { stem: string; answer: number; options: string[] }
const seed: Seed[] = JSON.parse(readFileSync('public/qbank/seed/quadratic-equations.json', 'utf8'))
let readable = 0
let agreed = 0
for (const s of seed) {
  const lines = s.stem.split('\n').slice(1).join('\n')
  let q
  try {
    q = solveQuadraticPair(lines)
  } catch {
    continue // a cubic, or a fraction with x in the denominator: not this solver's job
  }
  readable++
  // the bank's options for these questions are x > y … in the same order
  if (s.options[0] !== 'x > y') continue
  if (q.answerIndex === s.answer) agreed++
  else fail(`seed question disagrees (bank says ${s.answer}, solver ${q.answerIndex}):\n${lines}`)
}
if (readable < 100) fail(`only ${readable} of ${seed.length} generated questions could be read; expected many more`)

// ------------------------------------------------------------------------------ 3. the same equation typed differently
const variants = [
  'I. 6x² − 5√6x + 4 = 0\nII. 4y² − 11√7y + 42 = 0',
  'I. 6x^2-5√6x+4=0\nII. 4y^2-11√7y+42=0',
  'I) 6x² + 4 = 5√6x\nII) 4y² + 42 = 11√7y',
  '1.) I. 6 x² − 5 √6 x + 4 = 0 II. 4 y² − 11 √7 y + 42 = 0',
  'I. −6x² + 5√6x − 4 = 0\nII. −4y² + 11√7y − 42 = 0',
  'I. 12x² − 10√6x + 8 = 0\nII. 8y² − 22√7y + 84 = 0',
  'I. x² − (5√6/6)x + 2/3 = 0\nII. y² − (11√7/4)y + 21/2 = 0',
  'I. 6x² − 5√6·x + 4 = 0\nII. 4y² − 11√7·y + 42 = 0',
]
const keys = variants.map((v) => {
  try {
    return solveQuadraticPair(v).canonical
  } catch (e) {
    fail(`variant did not parse: ${JSON.stringify(v)}: ${(e as Error).message}`)
    return ''
  }
})
if (new Set(keys).size !== 1) fail(`same equations typed differently gave different canonical forms:\n${keys.join('\n')}`)
const other = solveQuadraticPair('I. 6x² − 5√6x + 4 = 0\nII. 4y² − 11√7y + 43 = 0').canonical
if (other === keys[0]) fail('different equations got the same canonical form')
const swapped = solveQuadraticPair('I. 4y² − 11√7y + 42 = 0\nII. 6x² − 5√6x + 4 = 0')
if (swapped.canonical === keys[0]) fail('swapping I and II must not look like a duplicate (the answer reverses)')
// a stored question's stem reads back to the same key
const stored = solveQuadraticPair(variants[0])
if (canonicalOfStem(stored.stem) !== stored.canonical) fail('canonicalOfStem does not match the key made at add time')

// ---------------------------------------------------------------------------------------- 4. the user's own question
{
  const q = solveQuadraticPair('I. 6x² − 5√6x + 4 = 0\nII. 4y² − 11√7y + 42 = 0')
  if (q.answerIndex !== 2) fail(`the example should be x < y, got ${q.options[q.answerIndex]}`)
  const want = ['Remember: √54 = 3√6', 'First root: x = (5√6 + 3√6) / 12 = 8√6 / 12 = 2√6/3', 'Second root: x = (5√6 − 3√6) / 12 = 2√6 / 12 = √6/6', 'Remember: √175 = 5√7', 'First root: y = (11√7 + 5√7) / 8 = 16√7 / 8 = 2√7', 'Second root: y = (11√7 − 5√7) / 8 = 6√7 / 8 = 3√7/4', 'x₂ = 2√6/3 ≈ 1.633', 'y₁ = 3√7/4 ≈ 1.984', 'y₂ = 2√7 ≈ 5.292']
  for (const w of want) if (!q.solution.includes(w)) fail(`the worked example is missing the line "${w}"`)
}

// ----------------------------------------------------------------- special cases and refusals
const answer = (t: string) => solveQuadraticPair(t).answerIndex
const expect = (t: string, idx: number, why: string) => {
  try {
    const got = answer(t)
    if (got !== idx) fail(`${why}: expected ${idx}, got ${got} for ${JSON.stringify(t)}`)
  } catch (e) {
    fail(`${why}: threw ${(e as Error).message}`)
  }
}
expect('I. x² + 8x − 90 = 7x + 20\nII. y = √100', 3, 'bank-style rearranged equation against y = √100') // the bank's own answer is x ≤ y
expect('I. x² = 49\nII. y² = 49', 4, 'identical root sets overlap')
expect('I. x² − 6x + 9 = 0\nII. y² − 4y + 4 = 0', 0, 'double roots 3 and 2')
expect('I. x² + x + 1 = 0\nII. y² − 4y + 4 = 0', 4, 'no real roots')
expect('I. (x − 3)² = 16\nII. y² − 3y − 10 = 0', 4, 'bracket form: x = 7, −1 and y = 5, −2')
expect('I. x² − 5x + 6 = 0\nII. y² − 7y + 12 = 0', 3, 'x in {2,3}, y in {3,4}: the largest x equals the smallest y, so x ≤ y')
expect('I. x² − 7x + 12 = 0\nII. y² − 5y + 6 = 0', 1, 'x in {3,4}, y in {2,3}: the smallest x equals the largest y, so x ≥ y')
expect('I. 2x² − 9x + 10 = 0\nII. y² − 8y + 16 = 0', 2, 'x in {2, 2.5}, y = 4')
const refuses = (t: string, part: RegExp, why: string) => {
  try {
    solveQuadraticPair(t)
    fail(`${why}: should have been refused`)
  } catch (e) {
    if (!(e instanceof Error) || e.name !== 'QuadraticError') fail(`${why}: threw a non-friendly error ${String(e)}`)
    else if (!part.test(e.message)) fail(`${why}: message "${e.message}" does not match ${part}`)
  }
}
refuses('I. x² − 5x + 6 = 0', /exactly two equations/, 'one equation')
refuses('I. x² − 5x + 6 = 0\nII. x² − 3x + 2 = 0', /different variables/, 'same variable twice')
refuses('I. x³ = 27\nII. y = 3', /higher than 2/, 'cubic')
refuses('I. 1/(x − 3) + 1/(x + 3) = 1\nII. y = 3', /variable in it/, 'variable in a denominator')
refuses('I. x² − 5x + 6\nII. y = 3', /"="/, 'no equals sign')
refuses('I. x + y = 5\nII. y = 3', /only one variable/, 'two variables in one equation')
refuses('I. x = x\nII. y = 3', /disappears/, 'variable cancels')
refuses('I. 5 = 5\nII. y = 3', /variable/, 'no variable')
refuses('I. x² − 5x + 6 = 0 @\nII. y = 3', /not understood/, 'odd character')
refuses('I. x² + √2x + √3 = 0\nII. y = 3', /plain number/, 'irrational discriminant')

// every wording of the instruction lines the user may paste along with the equations is rejected cleanly, not mis-read
try {
  if (parseQuadraticInput('1.) I. 6x² − 5√6x + 4 = 0\n    II. 4y² − 11√7y + 42 = 0').length !== 2) fail('numbered paste')
} catch {
  fail('numbered paste should parse')
}

// ------------------------------------------- the play screen splits the stored solution into steps: it must read ours as 3 steps + answer
{
  const q = solveQuadraticPair('I. 6x² − 5√6x + 4 = 0\nII. 4y² − 11√7y + 42 = 0')
  const parsed = parseSolution(q.solution)
  if (parsed.steps.length !== 3) fail(`the play screen should see 3 steps, saw ${parsed.steps.length}`)
  if (parsed.steps.map((st) => st.label).join() !== 'Step 1,Step 2,Step 3') fail('step labels')
  if (parsed.steps[0].lines[0] !== 'Solve Equation I (x)' || parsed.steps[0].lines.length < 8) fail('step 1 should be titled and carry its working lines')
  if (parsed.tail.length !== 1 || !parsed.tail[0].startsWith('Correct answer: (C) x < y')) fail(`closing line: ${JSON.stringify(parsed.tail)}`)
}

// ------------------------------------------------------------------------------------------------ 5. the add flow (fake storage)
async function addFlow() {
  const stored = new Map<string, Record<string, unknown>>()
  const listed = new Map<string, Record<string, unknown>>()
  let indexDown = false
  let existsRace = false
  const deps = (size = 0) => ({
    seed: loadSeed(),
    seedQuad: loadSeedQuadKeys(),
    loadUsers: async () => ({ has: (id: string) => stored.has(id), size: size || stored.size, similar: { find: () => null } }),
    createQuestion: async (q: Record<string, unknown>) => {
      if (existsRace) return 'exists'
      stored.set(String(q.id), q)
      return 'created'
    },
    putIndex: async (e: Record<string, unknown>) => {
      if (indexDown) throw new Error('redis down')
      listed.set(String(e.id), e)
    },
    now: () => Date.parse('2026-11-20T10:00:00Z'),
  })
  const user = { uid: 'u1' }
  const input = (text: string, tags: Record<string, unknown> = {}) => cleanQuadraticInput({ text, ...tags }, Date.parse('2026-11-20T10:00:00Z'))

  const first = await addQuadratic(input('I. 6x² − 5√6x + 4 = 0\nII. 4y² − 11√7y + 42 = 0', { examName: 'sbi po', examType: 'PO', year: 2024 }), user, deps())
  const body = first.body as { id: string; question: Record<string, unknown>; entry: Record<string, unknown>; listed: boolean }
  if (first.status !== 201) fail(`first add should be 201, got ${first.status} ${JSON.stringify(first.body)}`)
  else {
    const q = body.question
    if (!/^q-[0-9a-f]{20}$/.test(body.id)) fail(`id shape: ${body.id}`)
    if (q.topic !== 'quadratic-equations' || q.trust !== 'proven' || q.source !== 'user' || q.answer !== 2) fail(`stored question fields: ${JSON.stringify({ ...q, solution: '…', stem: '…' })}`)
    if ('addedBy' in q) fail('the person who added it must not be sent back')
    if (stored.get(body.id)?.addedBy !== 'u1') fail('addedBy should be kept in storage')
    if (q.examName !== 'SBI PO' || q.examType !== 'PO' || q.year !== 2024) fail('tags were not kept')
    if (!String(q.solution).startsWith('Step 1: Solve Equation I (x)')) fail('stored solution should be the worked one')
    if (!/^I\. 6x² − 5√6x \+ 4 = 0/.test(String(body.entry.preview))) fail(`list preview should lead with the equations, got "${body.entry.preview}"`)
    if (body.listed !== true || !listed.has(body.id)) fail('the question should be in the list')
  }

  // the same equations typed another way: a duplicate, pointing at the first
  for (const again of ['I. 6x^2-5√6x+4=0\nII. 4y^2-11√7y+42=0', 'I) 6x² + 4 = 5√6x\nII) 4y² + 42 = 11√7y', 'I. 12x² − 10√6x + 8 = 0\nII. 4y² − 11√7y + 42 = 0']) {
    const r = await addQuadratic(input(again), user, deps())
    if (r.status !== 409 || (r.body as { id: string }).id !== body.id) fail(`a retyped copy should be a duplicate of the first (${JSON.stringify(again)} -> ${r.status} ${JSON.stringify(r.body)})`)
  }
  if (stored.size !== 1) fail(`only one question should have been stored, found ${stored.size}`)
  // swapping I and II is a different question (the answer reverses)
  const swapped = await addQuadratic(input('I. 4y² − 11√7y + 42 = 0\nII. 6x² − 5√6x + 4 = 0'), user, deps())
  if (swapped.status !== 201 || (swapped.body as { question: { answer: number } }).question.answer !== 0) fail(`swapped pair should be added with the reversed answer, got ${swapped.status}`)

  // a launch question typed out again is caught, and the link points at the launch question
  const quadKeys = loadSeedQuadKeys()
  const launch = seed.find((s) => {
    try {
      solveQuadraticPair(s.stem.split('\n').slice(1).join('\n'))
      return quadKeys.size > 0
    } catch {
      return false
    }
  })
  if (!launch || quadKeys.size < 100) fail('seedQuadKeys.json is missing or empty: run npm run build:quadkeys')
  else {
    let caught = 0
    let tried = 0
    for (const s of seed.slice(0, 60)) {
      const text = s.stem.split('\n').slice(1).join('\n')
      try {
        solveQuadraticPair(text)
      } catch {
        continue
      }
      tried++
      const r = await addQuadratic(input(text), user, deps())
      if (r.status === 409 && [...quadKeys.values()].includes((r.body as { id: string }).id)) caught++
      else fail(`a launch question typed again should be a duplicate: ${JSON.stringify(text)} -> ${r.status}`)
    }
    if (caught !== tried || tried < 10) fail(`launch duplicates: caught ${caught} of ${tried}`)
  }

  // unreadable input is refused with a reason and nothing is saved
  const before = stored.size
  const bad = await addQuadratic(input('I. x³ = 27\nII. y = 3'), user, deps())
  if (bad.status !== 422 || (bad.body as { code: string }).code !== 'unsolvable' || stored.size !== before) fail(`cubic should be refused (422), got ${bad.status}`)
  // a full bank, a lost race, and a list that is down
  const full = await addQuadratic(input('I. x² − 11x + 30 = 0\nII. y² − 2y − 3 = 0'), user, deps(6000))
  if (full.status !== 503) fail(`full bank should be 503, got ${full.status}`)
  existsRace = true
  const race = await addQuadratic(input('I. x² − 12x + 35 = 0\nII. y² − 2y − 8 = 0'), user, deps())
  if (race.status !== 409) fail(`a question saved by someone else a moment earlier should be a duplicate, got ${race.status}`)
  existsRace = false
  indexDown = true
  const down = await addQuadratic(input('I. x² − 13x + 36 = 0\nII. y² − 3y − 10 = 0'), user, deps())
  if (down.status !== 201 || (down.body as { listed: boolean }).listed !== false) fail('with the list down the question is still saved, just not listed')

  // input cleaning
  const refuses = (body: Record<string, unknown>, why: string) => {
    try {
      cleanQuadraticInput(body)
      fail(`${why}: should be refused`)
    } catch (e) {
      if ((e as Error).name !== 'BadInput') fail(`${why}: wrong error ${String(e)}`)
    }
  }
  refuses({ text: '' }, 'empty')
  refuses({ text: 'x'.repeat(401) }, 'too long')
  refuses({ text: 'I. x² = 4 see https://example.com\nII. y = 2' }, 'a link')
  refuses({ text: 'I. x² = 4\nII. y = 2', year: 1850 }, 'a year far in the past')
  refuses(null as unknown as Record<string, unknown>, 'no body')
}
await addFlow()

console.log(
  `${failures === 0 ? 'OK' : 'FAILED'}: ${solvedCount}/${RUNS} random pairs agree with the oracle (answers ${counts.join('/')} for > ≥ < ≤ =); ${agreed}/${readable} readable generated questions match the bank's own answers (of ${seed.length}); ${variants.length} spellings give one canonical form`,
)
process.exit(failures === 0 ? 0 : 1)
