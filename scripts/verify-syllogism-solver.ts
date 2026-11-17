// Verification harness for the Syllogism Solver.  Run:  npx tsx scripts/verify-syllogism-solver.ts   (RUNS=n to change the random-question count)
//
//  1. Parser: a table of phrasings (and a whole pasted question with answer options) compared with the reading we expect.
//  2. Verdicts vs brute force: random questions are decided by the engine and by plain enumeration of every possible picture
//     (every set of occupied Venn regions); "follows" and "possible" must agree for every conclusion.
//  3. Pictures: every drawn picture is re-checked independently (by enumeration) to be the shadow of a legal full picture, to have
//     the truth value it claims, and to be missing no matter what the engine says should be drawable.
//  4. Known exam answers (including the "clocks / keys / mobiles" question → C) and the explanation for every wrong option.
import { buildModel, verdictOf } from '../src/lib/syllogismSolver/engine'
import { parseQuestion, type ParsedQuestion, type Sentence } from '../src/lib/syllogismSolver/parse'
import { SAMPLES } from '../src/lib/syllogismSolver/sample'
import { holdsIn } from '../src/lib/syllogismSolver/engine'
import { resolveHighlight, solve } from '../src/lib/syllogismSolver/solve'

const RUNS = Number(process.env.RUNS ?? 120)
let failures = 0
const fail = (msg: string) => {
  failures++
  if (failures <= 40) console.error('FAIL', msg)
}

// ─── 1. parser ───────────────────────────────────────────────────────────────

const code = (s: Sentence) => `${s.few ? 'F' : s.form}${s.possibility ? '?' : ''}`
const PARSE_CASES: [string, string][] = [
  ['All clocks are keys.', 'A clocks>keys'],
  ['All the clocks are keys', 'A clocks>keys'],
  ['Every clock is a key.', 'A clock>key'],
  ['No mobile is a car.', 'E mobile>car'],
  ['No mobiles are cars', 'E mobiles>cars'],
  ['Some keys are mobiles.', 'I keys>mobiles'],
  ['Some of the keys are mobiles.', 'I keys>mobiles'],
  ['Some keys are not mobiles.', 'O keys>mobiles'],
  ['Some key is not a mobile.', 'O key>mobile'],
  ['Only a few clocks are keys.', 'F clocks>keys'],
  ['A few clocks are keys.', 'I clocks>keys'],
  ['Not all clocks are keys.', 'O clocks>keys'],
  ['Some clocks can be mobiles.', 'I? clocks>mobiles'],
  ['Some clocks may not be mobiles.', 'O? clocks>mobiles'],
  ['All clocks can be keys.', 'A? clocks>keys'],
]
for (const [text, want] of PARSE_CASES) {
  const q = parseQuestion(`Statements:\n${text}\nConclusions:\nI. ${text}`)
  const s = q.conclusions[0]
  if (!s) {
    fail(`parser: "${text}" not understood`)
    continue
  }
  const got = `${code(s)} ${q.terms[s.x].singular === q.terms[s.x].plural ? q.terms[s.x].singular : ''}`
  void got
  const surface = text.toLowerCase().replace(/[.]/g, '')
  const [wantCode, wantTerms] = want.split(' ')
  const [wx, wy] = wantTerms.split('>')
  if (code(s) !== wantCode) fail(`parser: "${text}" read as ${code(s)}, expected ${wantCode}`)
  const x = q.terms[s.x]
  const y = q.terms[s.y]
  if (![x.singular, x.plural].includes(wx.replace(/^the /, '')) && !surface.includes(wx)) fail(`parser: "${text}" subject ${x.singular}, expected ${wx}`)
  if (![y.singular, y.plural].includes(wy)) fail(`parser: "${text}" predicate ${y.singular}, expected ${wy}`)
}

// the user's example, pasted with its answer options, and with the roman numerals glued onto one line
const PASTED = `be true even if they seem at variance with commonly known facts.
Statements:
All clocks are keys.
Some keys are not mobiles.
No mobile is a car.
All cars are tables.
Conclusions:
I. No clock is a mobile.
II. Some clocks are mobiles.
A. Only conclusion I follows
B. Only conclusion II follows
C. Either conclusion I or II follows
D. Neither conclusion I nor II follows
E. Both conclusions I and II follow`
{
  const q = parseQuestion(PASTED)
  if (q.statements.length !== 4 || q.conclusions.length !== 2 || q.terms.length !== 5 || q.unparsed.length) fail(`pasted question misread: ${JSON.stringify({ s: q.statements.length, c: q.conclusions.length, t: q.terms.length, u: q.unparsed })}`)
  const sol = solve(q)
  if (sol.correct !== 2) fail(`clocks/keys/mobiles should be C (index 2), got ${sol.correct}`)
  const inline = parseQuestion('Statements: All clocks are keys. Some keys are not mobiles.\nConclusions: I. No clock is a mobile. II. Some clocks are mobiles.')
  if (inline.statements.length !== 2 || inline.conclusions.length !== 2) fail('inline statements / conclusions were not split')
  const noHeading = parseQuestion('All pens are books.\nAll books are tables.\nI. All pens are tables.\nII. Some tables are pens.')
  if (noHeading.statements.length !== 2 || noHeading.conclusions.length !== 2) fail('question without headings was not split into statements / conclusions')
}

// "Which of the following conclusions definitely follows?" with five lettered options
{
  const q = parseQuestion(SAMPLES.find((x) => x.id === 'which')!.text)
  if (q.mode !== 'which' || q.conclusions.length !== 5 || q.statements.length !== 5 || q.terms.length !== 5 || q.unparsed.length) fail(`which-question misread: ${JSON.stringify({ m: q.mode, c: q.conclusions.length, s: q.statements.length, t: q.terms.length, u: q.unparsed })}`)
  const sol = solve(q)
  const kinds = sol.conclusions.map((c) => c.kind).join(',')
  if (kinds !== 'never,open,open,follows,never') fail(`which-question verdicts: ${kinds}`)
  if (sol.correct !== 3 || sol.mode !== 'which' || sol.note) fail('which-question should have exactly one right option, D')
  for (let o = 0; o < 5; o++) {
    const f = sol.feedback(o)
    if (f.correct !== (o === 3) || !f.points.length) fail(`which-question feedback ${o}`)
    if (!sol.conclusions[o].pictures.length) fail(`which-question: no picture for option ${o}`)
  }
  // the same question with each option letter on its own line, as copied from some sites
  const split = parseQuestion(SAMPLES.find((x) => x.id === 'which')!.text.replace(/^([A-E])\. /gm, '$1.\n'))
  if (split.mode !== 'which' || split.conclusions.length !== 5 || split.statements.length !== 5 || split.unparsed.length || solve(split).correct !== 3) fail(`letters on their own lines misread: ${JSON.stringify({ m: split.mode, c: split.conclusions.length, s: split.statements.length, u: split.unparsed })}`)
  // "does NOT follow" variant: the one option that fails to follow is right
  const neg = parseQuestion('All pens are books.\nAll books are tables.\nWhich of the following does not follow?\nA. All pens are tables\nB. Some pens are tables\nC. Some tables are pens\nD. No table is a pen\nE. Some pens are books')
  const ns = solve(neg)
  if (!neg.negate || ns.correct !== 3 || ns.note) fail(`negated question: negate=${neg.negate} correct=${ns.correct} note=${ns.note}`)
  // a pasted question that also lists the usual "Only conclusion I follows" options is still the I/II kind
  if (parseQuestion(PASTED).mode !== 'conclusions') fail('I/II question was taken for a which-question')
}

// ─── 2/3. brute force ────────────────────────────────────────────────────────

const rnd = (n: number) => Math.floor(Math.random() * n)
const bit = (r: number, t: number) => ((r >> t) & 1) === 1
const NAMES = ['pens', 'books', 'tables', 'chairs', 'roads', 'trees']

function randomQuestion(k: number): ParsedQuestion {
  const forms = ['A', 'E', 'I', 'O'] as const
  const mk = (x: number, y: number, possibility = false): Sentence => {
    const form = forms[rnd(4)]
    return { form, x, y, few: false, possibility, text: `${form} ${NAMES[x]} ${NAMES[y]}` }
  }
  const stmts: Sentence[] = []
  for (let i = 1; i < k; i++) stmts.push(mk(rnd(i), i))
  if (Math.random() < 0.4) {
    const a = rnd(k)
    let b = rnd(k)
    while (b === a) b = rnd(k)
    stmts.push(mk(a, b))
  }
  if (Math.random() < 0.15) stmts[rnd(stmts.length)].few = true
  const concs: Sentence[] = []
  for (let i = 0; i < 2; i++) {
    const a = rnd(k)
    let b = rnd(k)
    while (b === a) b = rnd(k)
    concs.push(mk(a, b, Math.random() < 0.2))
  }
  return {
    mode: 'conclusions',
    negate: false,
    terms: NAMES.slice(0, k).map((n) => ({ plural: n, singular: n.slice(0, -1), label: n[0].toUpperCase() + n.slice(1) })),
    statements: stmts,
    conclusions: concs,
    unparsed: [],
    errors: [],
    warnings: [],
  }
}

/** Every legal picture (set of occupied regions) by plain enumeration. Null when there are too many allowed regions. */
function enumeratePictures(q: ParsedQuestion): number[][] | null {
  const k = q.terms.length
  const n = 1 << k
  const allowed: number[] = []
  for (let r = 1; r < n; r++) {
    let ok = true
    for (const s of q.statements) {
      if (s.few) continue
      if (s.form === 'A' && bit(r, s.x) && !bit(r, s.y)) ok = false
      if (s.form === 'E' && bit(r, s.x) && bit(r, s.y)) ok = false
    }
    if (ok) allowed.push(r)
  }
  if (allowed.length > 14) return null
  const needs: ((r: number) => boolean)[] = []
  const used = new Set<number>()
  for (const s of q.statements) {
    used.add(s.x)
    used.add(s.y)
    if (s.few || s.form === 'I') needs.push((r) => bit(r, s.x) && bit(r, s.y))
    if (s.few || s.form === 'O') needs.push((r) => bit(r, s.x) && !bit(r, s.y))
  }
  for (const t of used) needs.push((r) => bit(r, t))
  const out: number[][] = []
  for (let m = 0; m < 1 << allowed.length; m++) {
    const occ = allowed.filter((_, i) => (m >> i) & 1)
    if (needs.every((f) => occ.some(f))) out.push(occ)
  }
  return out
}

let checked = 0
let skipped = 0
let pictures = 0
let missing = 0
let slowest = 0
for (let run = 0; run < RUNS; run++) {
  const q = randomQuestion(3 + rnd(2))
  const pics = enumeratePictures(q)
  if (!pics) {
    skipped++
    continue
  }
  if (pics.length === 0) {
    // contradictory statements: the engine must agree
    if (verdictOf(buildModel(q), q.conclusions[0]).possible) fail(`contradictory statements but engine finds a picture: ${JSON.stringify(q.statements)}`)
    continue
  }
  const model = buildModel(q)
  const t0 = performance.now()
  const sol = solve(q)
  slowest = Math.max(slowest, performance.now() - t0)
  q.conclusions.forEach((c, ci) => {
    const truths = pics.map((p) => holdsIn(p, c.form, c.x, c.y))
    const canBeTrue = truths.some(Boolean)
    const canBeFalse = truths.some((t) => !t)
    const v = verdictOf(model, c)
    const wantFollows = c.possibility ? canBeTrue : !canBeFalse
    if (v.follows !== wantFollows || v.possible !== canBeTrue) fail(`verdict mismatch for ${JSON.stringify(c)} in ${JSON.stringify(q.statements)}: engine ${JSON.stringify(v)}, brute follows=${wantFollows} possible=${canBeTrue}`)
    checked++
    const info = sol.conclusions[ci]
    const wantTrue = canBeTrue
    const wantFalse = canBeFalse
    // pictures
    for (const p of info.pictures) {
      pictures++
      const zones = p.world.zones.map((z) => z.mask)
      if (holdsIn(zones, c.form, c.x, c.y) !== p.truth) fail(`picture claims truth=${p.truth} but the drawing says otherwise (${JSON.stringify(c)})`)
      // the drawing must be the shadow of a legal picture
      const fm = p.world.focus.reduce((m, t) => m | (1 << t), 0)
      const shadowOk = pics.some((occ) => {
        const proj = new Set(occ.map((r) => r & fm).filter(Boolean))
        return proj.size === zones.length && zones.every((z) => proj.has(z))
      })
      if (!shadowOk) fail(`drawn picture is not the shadow of any legal picture: zones ${zones} for ${JSON.stringify(q.statements)}`)
      // every drawn zone really is a region of the drawing
      if (p.world.circles.length !== p.world.focus.length) fail('circle count differs from focus')
    }
    const hasTrue = info.pictures.some((p) => p.truth)
    const hasFalse = info.pictures.some((p) => !p.truth)
    const miss = (what: string) => {
      missing++
      if (process.env.DEBUG) console.log(`MISSING ${what}:`, q.statements.map((s) => `${s.few ? 'F' : s.form}(${s.x},${s.y})`).join(' '), '→', `${c.possibility ? 'P' : ''}${c.form}(${c.x},${c.y})`)
    }
    if (wantTrue && !c.possibility && info.kind !== 'never' && !hasTrue) miss('true picture')
    if (!c.possibility && wantFalse && !hasFalse) miss('false picture')
    if (info.kind === 'follows' && hasFalse) fail('a conclusion that follows has a picture where it is false')
    if (c.possibility && wantTrue && !hasTrue) miss('possible picture')
  })
  // the answer letter
  if (sol.correct !== null) {
    const [a, b] = sol.conclusions
    const expect = sol.either ? 2 : a.follows && b.follows ? 4 : a.follows ? 0 : b.follows ? 1 : 3
    if (sol.correct !== expect) fail('wrong option index')
    for (let o = 0; o < 5; o++) {
      const f = sol.feedback(o)
      if ((o === sol.correct) !== f.correct) fail(`feedback ${o} correctness`)
      if (!f.correct && f.points.length === 0) fail(`no explanation for wrong option ${o}`)
    }
  }
}
console.log(`random questions: ${checked} conclusions checked, ${skipped} skipped (too many regions to enumerate), ${pictures} pictures re-verified`)
console.log(`pictures the engine says exist but the drawing search did not find: ${missing}  · slowest solve ${slowest.toFixed(0)} ms`)
if (missing > checked * 0.05) fail(`too many undrawable pictures (${missing})`)

// ─── 4. samples and highlights ───────────────────────────────────────────────

for (const s of SAMPLES) {
  const q = parseQuestion(s.text)
  if (q.errors.length || q.unparsed.length) {
    fail(`sample "${s.title}" does not parse: ${q.errors.join(' ')} ${q.unparsed.join(' | ')}`)
    continue
  }
  const sol = solve(q)
  if (sol.correct === null || 'ABCDE'[sol.correct] !== s.answer) fail(`sample "${s.title}": expected ${s.answer}, got ${sol.correct === null ? 'none' : 'ABCDE'[sol.correct]}`)
  if (!sol.buildWorld) fail(`sample "${s.title}": no build picture`)
  for (const c of sol.conclusions) if (!c.pictures.length) fail(`sample "${s.title}": no picture for ${c.label}`)
  for (const [i, step] of sol.steps.entries()) {
    if (!step.highlight || !sol.buildWorld) continue
    const r = resolveHighlight(sol.buildWorld.zones.map((z) => z.mask), step.highlight)
    if (!r.truth) fail(`sample "${s.title}": statement step ${i} is not true in the build picture`)
  }
  for (let o = 0; o < 5; o++) {
    const f = sol.feedback(o)
    if (!f.correct && f.points.length === 0) fail(`sample "${s.title}": option ${o} has no explanation`)
  }
}

console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed')
process.exit(failures ? 1 : 0)
