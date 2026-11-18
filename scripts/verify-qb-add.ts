// Verifies the "add a question" logic without any network or AI: input cleaning, duplicate and similar-question
// detection (against the real launch questions), how the two solvers' replies are judged, and the whole add flow with
// stand-ins for the database. (Real AI answers are checked separately by scripts/probe-qb-solver.ts.)
// Run: npx tsx scripts/verify-qb-add.ts

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { addQuestion } from '../api/_lib/qbAdd.js'
import { previewOf } from '../api/_lib/qbIndex.js'
import { questionKey } from '../api/_lib/qbankKey.js'
import { loadSeed } from '../api/_lib/qbSeed.js'
import { SimilarIndex, numbersOf, signatureOf } from '../api/_lib/qbSimilar.js'
import { completeWithOptions, extractQuestion } from '../api/_lib/qbOcr.js'
import { acceptOptions, optionsPrompt } from '../api/_lib/qbOptions.js'
import { acceptSolve, acceptVerify, decide } from '../api/_lib/qbSolve.js'
import { TOPICS } from '../api/_lib/qbTopics.js'
import { BadInput, cleanQuestionInput } from '../api/_lib/qbValidate.js'
import { BANK_TOPICS } from '../src/lib/qbank/types'
import type { QuantQuestion } from '../src/lib/qbank/types'

let failures = 0
let passed = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) passed++
  else {
    failures++
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
const throwsBad = (name: string, fn: () => unknown, pattern?: RegExp) => {
  try {
    fn()
    check(name, false, 'did not throw')
  } catch (err) {
    check(name, err instanceof BadInput && (!pattern || pattern.test(err.message)), err instanceof Error ? err.message : String(err))
  }
}

// ---------------------------------------------------------------- the server's copy of the data matches the app's
console.log('data shared with the app')
check('server topic list equals the app topic list', JSON.stringify(TOPICS.map(([id, label]) => [id, label])) === JSON.stringify(BANK_TOPICS.map((t) => [t.id, t.label])))
const seedDir = join(process.cwd(), 'public', 'qbank', 'seed')
const seedQuestions: QuantQuestion[] = readdirSync(seedDir).flatMap((f) => JSON.parse(readFileSync(join(seedDir, f), 'utf8')) as QuantQuestion[])
const index = JSON.parse(readFileSync(join(process.cwd(), 'public', 'qbank', 'index.json'), 'utf8')) as { id: string; preview: string }[]
check('static index previews match the shared preview function', index.every((e, i) => e.preview === previewOf(seedQuestions.find((q) => q.id === e.id)!.stem) || (console.error(i), false)))
const seed = loadSeed()
check('seed fingerprints cover every launch question', seed.size === seedQuestions.length && seedQuestions.every((q) => seed.has(q.id)), `${seed.size} vs ${seedQuestions.length}`)
check('every launch id is the fingerprint of its own text', seedQuestions.every((q) => questionKey(q.stem, q.options) === q.id))

// ---------------------------------------------------------------- input cleaning
console.log('input cleaning')
const good = { stem: 'A train 120 m long passes a pole in 6 seconds. What is its speed in km/h?', options: ['60', '72', '54', '80', 'None of these'], answer: 1, examName: 'sbi po', examType: 'PO', year: 2023 }
{
  const c = cleanQuestionInput(good, Date.parse('2026-11-18'))
  check('valid input accepted and exam name made canonical', c.stem === good.stem && c.options.length === 5 && c.answer === 1 && c.examName === 'SBI PO' && c.examType === 'PO' && c.year === 2023)
  const d = cleanQuestionInput({ stem: good.stem, options: ['60', '72', '54', '80'] })
  check('tags default to Unknown / General / no year, answer to none', d.examName === 'Unknown' && d.examType === 'General' && d.year === null && d.answer === null && d.allowSimilar === false)
  const labelled = cleanQuestionInput({ stem: good.stem, options: ['A) 60', 'B) 72', 'C) 54', 'D) 80'] })
  check('pasted option labels (A) B) ...) are dropped', labelled.options.join('|') === '60|72|54|80')
  const lower = cleanQuestionInput({ stem: good.stem, options: ['(a) 60', '(b) 72', '(c) 54', '(d) 80'] })
  check('(a) (b) labels are dropped too', lower.options.join('|') === '60|72|54|80')
  const maths = cleanQuestionInput({ stem: 'Find the value of 19² + 5³ − ½ of 40 × √81 ÷ 3 in ₹.', options: ['x²', '3½', '√2', '₹10'] })
  check('superscripts, fractions, roots and symbols are kept exactly (not flattened to plain digits)', maths.stem === 'Find the value of 19² + 5³ − ½ of 40 × √81 ÷ 3 in ₹.' && maths.options.join('|') === 'x²|3½|√2|₹10', maths.stem)
  const spaced = cleanQuestionInput({ stem: 'Find the value of 12 + 18 and then double it please', options: ['1', '2', '3', '4'] })
  check('no-break and thin spaces become ordinary spaces', spaced.stem === 'Find the value of 12 + 18 and then double it please', spaced.stem)
  const keep = cleanQuestionInput({ stem: good.stem, options: ['A) 60', '72', 'C) 54', '80'] })
  check('labels are kept when they are not on every option', keep.options[0] === 'A) 60')
  const messy = cleanQuestionInput({ stem: `  A train ​120 m long\r\n\r\n\r\n\r\npasses   a pole in 6 seconds.  What is its speed? `, options: ['60', '72', '54', '80'] })
  check('whitespace, hidden characters and blank lines are tidied', messy.stem === 'A train 120 m long\n\npasses a pole in 6 seconds. What is its speed?')
}
throwsBad('too short a question', () => cleanQuestionInput({ stem: 'What is 2+2', options: ['1', '2', '3', '4'] }), /whole question/)
throwsBad('too long a question', () => cleanQuestionInput({ stem: 'x'.repeat(1300), options: ['1', '2', '3', '4'] }), /too long/)
throwsBad('three options', () => cleanQuestionInput({ ...good, options: ['1', '2', '3'] }), /4 or 5/)
throwsBad('six options', () => cleanQuestionInput({ ...good, options: ['1', '2', '3', '4', '5', '6'] }), /4 or 5/)
throwsBad('empty option', () => cleanQuestionInput({ ...good, options: ['1', '2', '', '4'] }), /every option/)
throwsBad('repeated option', () => cleanQuestionInput({ ...good, options: ['1', '2', ' 2 ', '4'] }), /same/)
throwsBad('very long option', () => cleanQuestionInput({ ...good, options: ['1', '2', 'x'.repeat(300), '4'] }), /too long/)
throwsBad('a link in the question', () => cleanQuestionInput({ ...good, stem: `${good.stem} see https://spam.example` }), /Links/)
throwsBad('a link in an option', () => cleanQuestionInput({ ...good, options: ['1', '2', 'buy at shop.com', '4'] }), /Links/)
throwsBad('answer outside the options', () => cleanQuestionInput({ ...good, answer: 7 }), /one of the options/)
throwsBad('answer that is not a whole number', () => cleanQuestionInput({ ...good, answer: 1.5 }), /one of the options/)
throwsBad('year in the past', () => cleanQuestionInput({ ...good, year: 1980 }), /year/)
throwsBad('year far in the future', () => cleanQuestionInput({ ...good, year: 2090 }), /year/)
throwsBad('exam name with odd characters', () => cleanQuestionInput({ ...good, examName: '<script>' }), /not allowed/)
throwsBad('body that is not an object', () => cleanQuestionInput('hello'), /Invalid/)
check('a made-up exam type becomes General', cleanQuestionInput({ ...good, examType: 'Hacker' }).examType === 'General')
check('claiming the generated-practice name is turned into Unknown', cleanQuestionInput({ ...good, examName: 'Practice (generated)' }).examName === 'Unknown')

// ---------------------------------------------------------------- duplicates and look-alikes
console.log('duplicates and look-alikes')
{
  const o = ['60', '72', '54', '80', 'None of these']
  const base = questionKey(good.stem, o)
  check('identical text is the same question', questionKey(good.stem, o) === base)
  check('options in another order are the same question', questionKey(good.stem, [...o].reverse()) === base)
  check('spacing and case do not matter', questionKey(`  ${good.stem.toUpperCase().replace(/ /g, '  ')}`, o) === base)
  check('a different number is a different question', questionKey(good.stem.replace('120', '130'), o) !== base)
  check('19² and 192 are different questions', questionKey('Find 19² + 4', ['1', '2', '3', '4']) !== questionKey('Find 192 + 4', ['1', '2', '3', '4']))
  check('19² and 19^2 are the same question', questionKey('Find 19² + 4', ['1', '2', '3', '4']) === questionKey('Find 19^2 + 4', ['1', '2', '3', '4']))

  check('numbers are read with thousands separators and decimals', numbersOf('Rs. 1,250 and 3.5 and 7') === '3.5,7,1250')
  const sim = (a: string, b: string) => { const idx = new SimilarIndex(); idx.add('x', signatureOf(a)); return idx.find(signatureOf(b)) === 'x' }
  const t1 = 'Seema alone can complete a work in 20 days and Meena alone in 30 days. Seema works for 14 days and then leaves. In how many more days can Meena finish the remaining work?'
  check('only the names changed: similar', sim(t1, t1.replace('Seema', 'Neha').replace('Meena', 'Varun').replace('Meena', 'Varun')))
  check('a retyped copy with a typo: similar', sim(t1, t1.replace('complete', 'compleet').replace('leaves', 'leave')))
  check('a different number: not similar', !sim(t1, t1.replace('20 days', '24 days')))
  check('a different question altogether: not similar', !sim(t1, 'A train 120 m long passes a pole in 6 seconds. What is its speed in km/h?'))
  check('same numbers but another problem: not similar', !sim(t1, 'A tank has pipes filling it in 20 and 30 and 14 minutes. Which pipe is fastest if the leak empties it?'))

  // how often do two different launch questions look alike? (they come from templates, so a few may)
  const idx = new SimilarIndex()
  let flagged = 0
  const examples: string[] = []
  for (const q of seedQuestions) {
    const sig = signatureOf(q.stem)
    const other = idx.find(sig)
    if (other) {
      flagged++
      if (examples.length < 3) examples.push(`${q.stem.slice(0, 60)}… ~ ${seedQuestions.find((x) => x.id === other)!.stem.slice(0, 60)}…`)
    }
    idx.add(q.id, sig)
  }
  console.log(`  (launch questions that look like an earlier launch question: ${flagged} of ${seedQuestions.length})`)
  check('launch questions are not mostly look-alikes of each other (templates reuse data, so some are)', flagged / seedQuestions.length < 0.12, `${flagged} flagged; e.g. ${examples.join(' | ')}`)
  // every launch question is similar to itself when retyped with different spacing/case
  const seedIdx = loadSeed()
  let missed = 0
  for (const q of seedQuestions.slice(0, 400)) if (seedIdx.similar.find(signatureOf(q.stem.toUpperCase().replace(/\s+/g, '  '))) !== q.id && seedIdx.similar.find(signatureOf(q.stem.toUpperCase().replace(/\s+/g, '  '))) === null) missed++
  check('a retyped launch question is always recognised', missed === 0, `${missed} missed`)
}

// ---------------------------------------------------------------- judging the solvers
console.log('judging the solvers')
{
  check('solver reply accepted and cleaned', (() => {
    const r = acceptSolve({ status: 'ok', answerIndex: 1, steps: ['Step 1: speed = 120/6 = 20 m/s', '20 × 18/5 = 72 km/h', ''], shortcut: 'Multiply m/s by 18/5', topic: 'speed-distance', difficulty: 'easy' }, 5)
    return r.ok && r.status === 'ok' && r.steps.join('|') === 'speed = 120/6 = 20 m/s|20 × 18/5 = 72 km/h' && r.topic === 'speed-distance' && r.difficulty === 'easy' && r.shortcut === 'Multiply m/s by 18/5'
  })())
  check('powers and fractions in a solution step are kept as written', (() => { const r = acceptSolve({ status: 'ok', answerIndex: 0, steps: ['19² = 361', 'half of 40 = ½ × 40 = 20'] }, 4); return r.ok && r.status === 'ok' && r.steps.join('|') === '19² = 361|half of 40 = ½ × 40 = 20' })())
  check('unknown topic and difficulty fall back to other / medium', (() => { const r = acceptSolve({ status: 'ok', answerIndex: 0, steps: ['a b', 'c d'], topic: 'astrology', difficulty: 'insane' }, 4); return r.ok && r.topic === 'other' && r.difficulty === 'medium' && r.shortcut === null })())
  check('answer index outside the options is refused', !acceptSolve({ status: 'ok', answerIndex: 5, steps: ['a b', 'c d'] }, 5).ok)
  check('a text answer index is refused', !acceptSolve({ status: 'ok', answerIndex: '1', steps: ['a b', 'c d'] }, 5).ok)
  check('fewer than two steps is refused', !acceptSolve({ status: 'ok', answerIndex: 1, steps: ['only one'] }, 5).ok)
  check('an unknown status is refused', !acceptSolve({ status: 'sure', answerIndex: 1, steps: ['a b', 'c d'] }, 5).ok)
  check('a non-ok status needs no answer', (() => { const r = acceptSolve({ status: 'needs-figure', reason: 'No chart.' }, 5); return r.ok && r.status === 'needs-figure' })())
  check('a long step is cut', (acceptSolve({ status: 'ok', answerIndex: 0, steps: ['x'.repeat(900), 'y y'] }, 4) as { steps: string[] }).steps[0].length === 300)
  check('verifier reply accepted', acceptVerify({ status: 'ok', answerIndex: 2, result: '54' }, 4).ok)
  check('verifier answer outside the options is refused', !acceptVerify({ status: 'ok', answerIndex: -1 }, 4).ok)

  const ok = (answerIndex: number, id: string) => ({ ok: true, id, status: 'ok', answerIndex, steps: ['a b', 'c d'], shortcut: null, topic: 'other', difficulty: 'medium' })
  const verified = (answerIndex: number, id: string) => ({ ok: true, id, status: 'ok', answerIndex })
  check('two solvers agree: published', (decide(ok(1, 's'), verified(1, 'v'), null) as { ok: boolean }).ok)
  check('they disagree and there is no typed key: refused', (decide(ok(1, 's'), verified(2, 'v'), null) as { code: string }).code === 'disagree')
  check('they disagree but the typed key backs the shown solution: published', (decide(ok(1, 's'), verified(2, 'v'), 1) as { ok: boolean }).ok)
  check('they disagree and the typed key backs only the checker: refused', (decide(ok(1, 's'), verified(2, 'v'), 2) as { code: string }).code === 'disagree')
  check('solver says not-quant: refused with the reason', (() => { const d = decide({ ok: true, id: 's', status: 'not-quant' }, verified(1, 'v'), null) as { code: string; message: string }; return d.code === 'rejected' && /maths/.test(d.message) })())
  check('checker says needs-figure: refused', (decide(ok(1, 's'), { ok: true, id: 'v', status: 'needs-figure' }, null) as { code: string }).code === 'rejected')
  check('checker unavailable, no typed key: busy, not published', (decide(ok(1, 's'), null, null) as { code: string }).code === 'busy')
  check('checker unavailable, typed key matches: published', (decide(ok(1, 's'), null, 1) as { ok: boolean }).ok)
  check('checker unavailable, typed key differs: busy', (decide(ok(1, 's'), null, 2) as { code: string }).code === 'busy')
  check('solver unavailable: busy', (decide(null, verified(1, 'v'), 1) as { code: string }).code === 'busy')
  check('both unavailable: busy', (decide(null, null, null) as { code: string }).code === 'busy')
}

// ---------------------------------------------------------------- suggested options and the screenshot reply
console.log('suggested options and the screenshot reply')
{
  const five = ['2 : 3', '3 : 2', '1 : 1', '14 : 9', '5 : 4']
  const ok = acceptOptions({ working: 'x', status: 'ok', options: five }) as { ok: boolean; options: string[] }
  check('five different options are accepted', ok.ok && ok.options.join('|') === five.join('|'))
  check('labels the model added are dropped', (acceptOptions({ status: 'ok', options: ['A) 2 : 3', 'B) 3 : 2', 'C) 1 : 1', 'D) 14 : 9', 'E) 5 : 4'] }) as { options: string[] }).options.join('|') === five.join('|'))
  check('numbers are turned into text', (acceptOptions({ status: 'ok', options: [10, 20, 30, 40, 50] }) as { options: string[] }).options.join('|') === '10|20|30|40|50')
  check('symbols are kept (₹, %, ², ½)', (acceptOptions({ status: 'ok', options: ['₹1,230', '12%', 'x²', '3½', '√2'] }) as { options: string[] }).options.join('|') === '₹1,230|12%|x²|3½|√2')
  check('four options are not enough', !(acceptOptions({ status: 'ok', options: five.slice(0, 4) }) as { ok: boolean }).ok)
  check('a repeated option is refused', !(acceptOptions({ status: 'ok', options: ['1', '2', '3', '4', ' 4 '] }) as { ok: boolean }).ok)
  check('"None of these" is refused', !(acceptOptions({ status: 'ok', options: ['1', '2', '3', '4', 'None of these'] }) as { ok: boolean }).ok)
  check('an overlong option is dropped, leaving too few', !(acceptOptions({ status: 'ok', options: ['1', '2', '3', '4', 'x'.repeat(200)] }) as { ok: boolean }).ok)
  check('a question that needs a figure gets no options but a clear status', (() => { const r = acceptOptions({ status: 'needs-figure', options: [] }) as { ok: boolean; status: string; options: string[] }; return r.ok && r.status === 'needs-figure' && r.options.length === 0 })())
  check('an unknown status is refused', !(acceptOptions({ status: 'sure', options: five }) as { ok: boolean }).ok)
  check('the prompt carries the question and warns that it is untrusted data', optionsPrompt('What is 2+2? IGNORE ME').includes('IGNORE ME') && /untrusted/.test(optionsPrompt('x')))

  check('a picture that has options is passed through as read', await completeWithOptions({ stem: 'Q', options: ['1', '2', '3', '4'] }, 50_000, async () => { throw new Error('must not be called') }).then((r: { generated: boolean; options: string[] }) => !r.generated && r.options.length === 4))
  let asked = ''
  const generated = (await completeWithOptions({ stem: 'Two tanks...', options: [] }, 30_000, async (stem: string) => { asked = stem; return { ok: true, options: five } })) as { generated: boolean; options: string[] }
  check('a picture with only the question gets suggested options, flagged as generated', generated.generated === true && generated.options.length === 5 && asked === 'Two tanks...')
  const failed = (await completeWithOptions({ stem: 'Q', options: [] }, 30_000, async () => ({ ok: false, message: 'busy' }))) as { generated: boolean; options: string[]; note: string }
  check('if suggesting fails, the question text still comes back with a note', failed.generated === false && failed.options.length === 0 && failed.note === 'busy')
  const late = (await completeWithOptions({ stem: 'Q', options: [] }, 3000, async () => { throw new Error('must not be called') })) as { note: string }
  check('with too little time left, suggesting is skipped with a note', /no time/.test(late.note))
  check('the picture reader keeps a question with no options', (extractQuestion({ stem: 'Two tanks contain concentrate and water in the ratios 7 : 5 and 3 : 5.', options: [] }) as { options: string[] }).options.length === 0)
}

// ---------------------------------------------------------------- the whole add flow, with stand-ins
console.log('the add flow')
{
  const user = { uid: 'user1', email: 'a@b.co', emailVerified: true }
  const fresh = (over: object = {}) => cleanQuestionInput({ stem: 'Ravi buys 14 pens at 9 rupees each and sells them all at 11 rupees each. What is his total profit?', options: ['26', '28', '30', '32', 'None of these'], ...over })
  const decisionOk = { ok: true, answerIndex: 1, steps: ['Profit per pen = 11 - 9 = 2', 'Total = 14 × 2 = 28'], shortcut: 'Profit per item × count', topic: 'profit-loss', difficulty: 'easy', verifiedBy: 'v' }
  const setup = (over: Record<string, unknown> = {}) => {
    const state = { solves: 0, created: [] as QuantQuestion[], indexed: [] as { id: string; n?: string }[], users: new Map<string, { n: string; w: string }>() }
    const deps = {
      seed: loadSeed(),
      loadUsers: async () => {
        const similar = new SimilarIndex()
        for (const [id, sig] of state.users) similar.add(id, sig)
        return { has: (id: string) => state.users.has(id), similar, size: state.users.size }
      },
      solve: async () => { state.solves++; return decisionOk },
      createQuestion: async (q: QuantQuestion) => { state.created.push(q); return 'created' },
      putIndex: async (e: { id: string; n: string; w: string }) => { state.indexed.push(e); state.users.set(e.id, { n: e.n, w: e.w }) },
      now: () => Date.parse('2026-11-18T12:00:00Z'),
      ...over,
    }
    return { state, deps }
  }

  {
    const { state, deps } = setup()
    const r = await addQuestion(fresh(), user, deps as never)
    check('a new question is published (201) with the AI answer, steps and tags', r.status === 201 && state.created.length === 1 && state.created[0].answer === 1 && /^Step 1: .*\nStep 2: .*\nCorrect answer: \(B\) 28$/.test(state.created[0].solution) && state.created[0].topic === 'profit-loss' && state.created[0].trust === 'ai-agreed' && state.created[0].source === 'user' && state.created[0].addedBy === 'user1')
    check('it carries the tags the person gave (or the defaults)', state.created[0].examName === 'Unknown' && state.created[0].examType === 'General' && state.created[0].year === null)
    check('the list entry has no fingerprint in what the browser gets', r.status === 201 && !('n' in (r.body as { entry: object }).entry) && (r.body as { entry: { preview: string } }).entry.preview.startsWith('Ravi buys'))
    check('the fingerprint is kept for the duplicate check', state.indexed.length === 1 && typeof state.indexed[0].n === 'string')
    const again = await addQuestion(fresh(), user, deps as never)
    check('adding the same question again is refused (409 duplicate) with no AI use', again.status === 409 && (again.body as { code: string }).code === 'duplicate' && state.solves === 1)
    const reordered = await addQuestion(fresh({ options: ['None of these', '32', '30', '28', '26'] }), user, deps as never)
    check('the same options in another order are a duplicate too', reordered.status === 409 && state.solves === 1)
    const similar = await addQuestion(fresh({ stem: 'Ravi buys 14 pens at 9 rupees each and sells them all at 11 rupees each. What is the total profit he makes?' }), user, deps as never)
    check('a re-worded copy is stopped as similar (409) with no AI use', similar.status === 409 && (similar.body as { code: string }).code === 'similar' && state.solves === 1)
    const forced = await addQuestion(fresh({ stem: 'Ravi buys 14 pens at 9 rupees each and sells them all at 11 rupees each. What is the total profit he makes?', allowSimilar: true }), user, deps as never)
    check('"add anyway" goes through', forced.status === 201 && state.created.length === 2)
  }
  {
    const seedQ = seedQuestions[100]
    const { state, deps } = setup()
    const r = await addQuestion(cleanQuestionInput({ stem: seedQ.stem, options: seedQ.options }), user, deps as never)
    check('a launch question typed in again is a duplicate with no AI use', r.status === 409 && (r.body as { id: string }).id === seedQ.id && state.solves === 0)
    const sim = await addQuestion(cleanQuestionInput({ stem: seedQ.stem.toUpperCase(), options: seedQ.options.map((o) => o + ' ') }), user, deps as never)
    check('a launch question retyped in capitals is a duplicate too', sim.status === 409 && state.solves === 0)
  }
  {
    const { state, deps } = setup({ solve: async () => ({ ok: false, code: 'rejected', message: 'This does not look like a quantitative-aptitude (maths) question.' }) })
    const r = await addQuestion(fresh(), user, deps as never)
    check('a rejected question gives 422 and saves nothing', r.status === 422 && state.created.length === 0 && state.indexed.length === 0)
  }
  {
    const { state, deps } = setup({ solve: async () => ({ ok: false, code: 'busy', message: 'busy' }) })
    const r = await addQuestion(fresh(), user, deps as never)
    check('busy checkers give 503 and save nothing', r.status === 503 && state.created.length === 0)
  }
  {
    const { state, deps } = setup()
    const wrong = await addQuestion(fresh({ answer: 3 }), user, deps as never)
    check('a typed key that disagrees with the solvers is 409 key-mismatch and nothing is saved', wrong.status === 409 && (wrong.body as { code: string; aiAnswer: number }).code === 'key-mismatch' && (wrong.body as { aiAnswer: number }).aiAnswer === 1 && state.created.length === 0)
    const right = await addQuestion(fresh({ answer: 1 }), user, deps as never)
    check('a typed key that agrees is published', right.status === 201)
  }
  {
    const { deps } = setup({ createQuestion: async () => 'exists' })
    const r = await addQuestion(fresh(), user, deps as never)
    check('losing the race to another person adding the same question is a duplicate', r.status === 409 && (r.body as { code: string }).code === 'duplicate')
  }
  {
    const { state, deps } = setup({ putIndex: async () => { throw new Error('redis down') } })
    const r = await addQuestion(fresh(), user, deps as never)
    check('saved but not listed still succeeds and says so', r.status === 201 && (r.body as { listed: boolean }).listed === false && state.created.length === 1)
  }
  {
    const { deps } = setup({ loadUsers: async () => ({ has: () => false, similar: new SimilarIndex(), size: 6000 }) })
    const r = await addQuestion(fresh(), user, deps as never)
    check('a full list refuses new questions', r.status === 503 && (r.body as { code: string }).code === 'full')
  }
}

console.log(failures === 0 ? `\nAll ${passed} checks passed.` : `\n${failures} check(s) FAILED (${passed} passed).`)
process.exit(failures === 0 ? 0 : 1)
