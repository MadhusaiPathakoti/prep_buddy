// Verifies the mock test engine (timers, section locking, status transitions), scoring, the simulated
// cohort model and PDF generation against a hand-built fixture paper. Run: npx tsx scripts/verify-mocks-engine.ts
import { writeFileSync } from 'node:fs'
import { newAttempt, type Attempt } from '../src/lib/mocks/attempts.ts'
import { estimateCohort } from '../src/lib/mocks/cohort.ts'
import { advanceSection, answer, begin, clearAnswer, countStatuses, finish, neighbour, remainingMs, setMarked, tick, totalRemainingMs, visit } from '../src/lib/mocks/engine.ts'
import { buildQuestionPaperPdf, buildResultPdf, pdfText } from '../src/lib/mocks/pdf.ts'
import { buildReport } from '../src/lib/mocks/report.ts'
import { evaluate, statusOf } from '../src/lib/mocks/scoring.ts'
import type { MockPaper, MockQuestion, MockSectionId } from '../src/lib/mocks/types.ts'

let failures = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    failures++
    console.error(`FAIL  ${name}`, detail ?? '')
  } else console.log(`ok    ${name}`)
}
const approx = (a: number, b: number) => Math.abs(a - b) < 1e-9

function q(id: string, section: MockSectionId, topic: MockQuestion['topic'], answerIdx: number, setId?: string): MockQuestion {
  return {
    id,
    section,
    topic,
    setId,
    stem: `Question ${id}: what is the value of x − √16 ≥ ₹5 → ∴ ?`,
    options: ['Option one', 'Option two', 'Option three', 'Option four', 'None of these'],
    answer: answerIdx,
    explanation: `Because of reasons for ${id}. Correct answer: (${'ABCDE'[answerIdx]})`,
  }
}

function fixture(locked: boolean): MockPaper {
  const questions: MockQuestion[] = [
    q('q-1', 'english', 'rc', 0, 's-1'),
    q('q-2', 'english', 'rc', 1, 's-1'),
    q('q-3', 'english', 'fillers', 2),
    q('q-4', 'quant', 'di-bar', 3, 's-2'),
    q('q-5', 'quant', 'di-pie', 4, 's-3'),
    q('q-6', 'quant', 'di-line', 0, 's-4'),
    q('q-7', 'quant', 'di-table', 1, 's-5'),
    q('q-8', 'reasoning', 'syllogism', 2),
  ]
  return {
    id: 'fixture',
    exam: 'po',
    kind: locked ? 'full' : 'sectional',
    title: 'Fixture Mock',
    difficulty: 'hard',
    createdAt: new Date(0).toISOString(),
    sectionLocked: locked,
    totalDurationSec: 60 * 60,
    marksPerQuestion: 1,
    negativeMarks: 0.25,
    sections: [
      { id: 'english', name: 'English Language', durationSec: 20 * 60, questionIds: ['q-1', 'q-2', 'q-3'] },
      { id: 'quant', name: 'Quantitative Aptitude', durationSec: 20 * 60, questionIds: ['q-4', 'q-5', 'q-6', 'q-7'] },
      { id: 'reasoning', name: 'Reasoning Ability', durationSec: 20 * 60, questionIds: ['q-8'] },
    ],
    questions,
    sets: {
      's-1': { directions: 'Read the passage and answer.', parts: [{ kind: 'text', heading: 'Passage', paragraphs: ['First “paragraph” — with dashes…', 'Second paragraph.'] }] },
      's-2': { parts: [{ kind: 'bar', heading: 'Sales (in lakh)', categories: ['2019', '2020', '2021'], series: [{ name: 'A', values: [10, 20, 30] }, { name: 'B', values: [15, 25, 5] }], unit: '₹ lakh' }] },
      's-3': { parts: [{ kind: 'pie', heading: 'Expenditure', slices: [{ label: 'Rent', value: 120 }, { label: 'Food', value: 90 }, { label: 'Misc', value: 150 }], unit: 'degrees' }] },
      's-4': { parts: [{ kind: 'line', heading: 'Production', categories: ['Mon', 'Tue', 'Wed'], series: [{ name: 'Units', values: [4, 9, 6] }] }] },
      's-5': { parts: [{ kind: 'table', heading: 'Employees', columns: ['Dept', 'Men', 'Women'], rows: [['HR', 12, 8], ['IT', 40, 22]], note: 'All figures are headcounts.' }] },
    },
  }
}

const T0 = 1_000_000_000_000

// --- statuses & transitions ---
{
  let a: Attempt = newAttempt(fixture(true))
  check('new attempt starts in instructions phase', a.phase === 'instructions')
  a = begin(a, T0)
  check('begin → running, first question visited', a.phase === 'running' && statusOf(a.responses['q-1']) === 'not-answered')
  check('unvisited question is not-visited', statusOf(a.responses['q-2']) === 'not-visited')
  a = answer(a, 'q-1', 0)
  check('answer → answered', statusOf(a.responses['q-1']) === 'answered')
  a = setMarked(a, 'q-1', true)
  check('answer + mark → answered-marked', statusOf(a.responses['q-1']) === 'answered-marked')
  a = clearAnswer(a, 'q-1')
  check('clear keeps mark → marked', statusOf(a.responses['q-1']) === 'marked')
  a = visit(a, 'q-2', T0 + 5000)
  check('visit accrues 5s on previous question', a.responses['q-1'].timeMs === 5000, a.responses['q-1'])
  check('visit to question in another section is ignored (locked)', visit(a, 'q-5', T0 + 6000) === a)
  check('neighbour forward/back', neighbour(a, 1) === 'q-3' && neighbour(a, -1) === 'q-1')
  check('no neighbour past section end', neighbour(visit(a, 'q-3', T0 + 7000), 1) === null)
  const c = countStatuses(a, 0)
  check('status counts add up', c.total === 3 && c.marked === 1 && c['not-answered'] === 1 && c['not-visited'] === 1, c)
}

// --- locked-section timing ---
{
  let a = begin(newAttempt(fixture(true)), T0)
  check('section clock = 20:00 at start', remainingMs(a, T0) === 20 * 60_000)
  check('total clock = 60:00 at start', totalRemainingMs(a, T0) === 60 * 60_000)
  check('section clock counts down', remainingMs(a, T0 + 60_000) === 19 * 60_000)

  let r = tick(a, T0 + 19 * 60_000)
  check('no event before expiry', r.event === null && r.attempt === a)
  r = tick(a, T0 + 20 * 60_000 + 1)
  check('section expiry advances to next section', r.event === 'section-expired' && r.attempt.currentSection === 1, r.event)
  check('next section clock started at the boundary (no lost time)', remainingMs(r.attempt, T0 + 20 * 60_000 + 1) === 20 * 60_000 - 1)
  check('first question of new section visited', statusOf(r.attempt.responses['q-4']) === 'not-answered')

  // Candidate vanishes for 70 minutes → every section lapses, test finishes at the deadline.
  r = tick(a, T0 + 70 * 60_000)
  check('returning after total expiry finishes the test', r.event === 'finished' && r.attempt.phase === 'finished')
  check('finish is stamped at the deadline, not "now"', r.attempt.finishedAt === T0 + 60 * 60_000, r.attempt.finishedAt)
  const billed = Object.values(r.attempt.responses).reduce((n, x) => n + x.timeMs, 0)
  check('time billed to questions never exceeds the paper duration, however long the candidate was away', billed === 60 * 60_000, billed)

  // Manual section submit
  a = answer(a, 'q-1', 0)
  const b = advanceSection(a, T0 + 5 * 60_000)
  check('manual submit starts next clock at now', remainingMs(b, T0 + 5 * 60_000) === 20 * 60_000)
  check('total clock drops the unused time', totalRemainingMs(b, T0 + 5 * 60_000) === 40 * 60_000)
  const last = advanceSection(advanceSection(a, T0 + 1000), T0 + 2000)
  check('cannot advance past last section', advanceSection(last, T0 + 3000) === last)
}

// --- unlocked (sectional / topic) timing ---
{
  const p = fixture(false)
  p.sections = [{ id: 'quant', name: 'Quantitative Aptitude', durationSec: 10 * 60, questionIds: ['q-4', 'q-5'] }]
  p.totalDurationSec = 10 * 60
  p.questions = p.questions.filter((x) => ['q-4', 'q-5'].includes(x.id))
  let a = begin(newAttempt(p), T0)
  check('single clock = total', remainingMs(a, T0 + 60_000) === 9 * 60_000)
  const r = tick(a, T0 + 11 * 60_000)
  check('expiry finishes an unlocked test', r.event === 'finished' && r.attempt.finishedAt === T0 + 10 * 60_000)
  a = finish(answer(a, 'q-4', 3), T0 + 120_000)
  check('manual finish records used seconds', a.usedSec === 120, a.usedSec)
}

// --- scoring ---
{
  const p = fixture(true)
  const responses = {
    'q-1': { selected: 0, marked: false, visited: true, timeMs: 30_000 }, // correct
    'q-2': { selected: 0, marked: false, visited: true, timeMs: 40_000 }, // wrong (answer 1)
    'q-3': { selected: null, marked: true, visited: true, timeMs: 10_000 }, // unattempted, marked
    'q-4': { selected: 3, marked: false, visited: true, timeMs: 20_000 }, // correct
    'q-5': { selected: 1, marked: false, visited: true, timeMs: 20_000 }, // wrong
    'q-6': { selected: 1, marked: false, visited: true, timeMs: 20_000 }, // wrong
    'q-7': { selected: 1, marked: true, visited: true, timeMs: 20_000 }, // correct (answered & marked still counts)
    'q-8': { selected: 2, marked: false, visited: true, timeMs: 20_000 }, // correct
  }
  const sc = evaluate(p, responses)
  check('overall correct/incorrect/unattempted', sc.overall.correct === 4 && sc.overall.incorrect === 3 && sc.overall.unattempted === 1, sc.overall)
  check('score = correct − 0.25×wrong', approx(sc.overall.score, 4 - 0.75), sc.overall.score)
  check('accuracy = correct / attempted', approx(sc.overall.accuracy, (4 / 7) * 100))
  check('section english: 1 correct 1 wrong 1 unattempted', sc.sections[0].correct === 1 && sc.sections[0].incorrect === 1 && sc.sections[0].unattempted === 1)
  check('section time sums question time', sc.sections[0].timeMs === 80_000)
  check('sections sum to overall', sc.sections.reduce((n, s) => n + s.score, 0) === sc.overall.score)
  check('marked-but-unanswered counted unattempted', sc.questions[2].verdict === 'unattempted' && sc.questions[2].marked)
  check('topic stats cover all questions', sc.topics.reduce((n, t) => n + t.total, 0) === 8)
  check('numbering per section', sc.questions[3].numberInSection === 1 && sc.questions[3].number === 4)
}

// --- cohort model ---
{
  let prev = Infinity
  let ok = true
  for (let s = -10; s <= 100; s += 5) {
    const c = estimateCohort('po', 'full', s, 100, 100, 0.25, 3600)
    if (c.rank > prev) ok = false
    prev = c.rank
    if (c.rank < 1 || c.rank > c.size || c.ahead + c.behind + 1 !== c.size) ok = false
  }
  check('rank improves monotonically with score; ahead+behind+1 = N', ok)
  const mid = estimateCohort('clerk', 'full', 44, 100, 100, 0.25, 3600)
  check('score at cohort mean sits near the 50th percentile', mid.percentile > 40 && mid.percentile < 60, mid.percentile)
  const top = estimateCohort('po', 'full', 95, 100, 100, 0.25, 3600)
  check('very high score reaches a top tier', ['Legendary', 'Master'].includes(top.tier.id), top.tier.id)
  const low = estimateCohort('po', 'full', 2, 100, 100, 0.25, 3600)
  check('very low score is Bronze/Silver with progress in range', ['Bronze', 'Silver'].includes(low.tier.id) && low.progressToNext >= 0 && low.progressToNext <= 100, low.tier.id)
  check('topper beats average; benchmark scores are multiples of 0.25', top.topper.score > top.average.score && approx((top.topper.score * 4) % 1, 0) && approx((top.average.score * 4) % 1, 0))
  const t = top.topper
  check('topper benchmark internally consistent', approx(t.score, t.correct - 0.25 * t.wrong), t)
}

// --- pdf text sanitiser ---
check('pdfText maps exam symbols', pdfText('x − √16 ≥ ₹5 → ∴ “q” — ok…') === 'x - sqrt 16 >= Rs.5 -> therefore "q" - ok...', pdfText('x − √16 ≥ ₹5 → ∴ “q” — ok…'))
check('pdfText keeps Latin-1 (× ÷ ² ½ °)', pdfText('3 × 4 ÷ 2 = 6² ½ 90°') === '3 × 4 ÷ 2 = 6² ½ 90°')
check('pdfText replaces unsupported glyphs', pdfText('hi 😀 你好') === 'hi ? ??')

// --- pdf generation smoke ---
{
  const a = begin(newAttempt(fixture(true)), T0)
  let f = answer(a, 'q-1', 0)
  f = visit(f, 'q-2', T0 + 30_000)
  f = answer(f, 'q-2', 0)
  f = visit(f, 'q-3', T0 + 70_000)
  f = setMarked(f, 'q-3', true)
  f = finish(f, T0 + 100_000)
  const report = buildReport(f)
  const doc = buildResultPdf(report)
  const bytes = doc.output('arraybuffer')
  const outPath = process.env.PDF_OUT
  if (outPath) writeFileSync(outPath, Buffer.from(bytes))
  check('PDF builds with ≥ 4 pages and non-trivial size', doc.getNumberOfPages() >= 4 && bytes.byteLength > 10_000, { pages: doc.getNumberOfPages(), bytes: bytes.byteLength })
}

// --- question paper (practice copy) ---
{
  const p = fixture(true)
  const doc = buildQuestionPaperPdf(p, 1, 'Candidate')
  const text = (doc.output('arraybuffer') as ArrayBuffer).byteLength
  check('question paper PDF builds', doc.getNumberOfPages() >= 1 && text > 3_000, { pages: doc.getNumberOfPages(), text })
  // The practice copy must never carry the key or the explanations.
  const raw = Buffer.from(doc.output('arraybuffer')).toString('latin1')
  check('question paper contains no answer key or solutions', !/Correct answer|\[Correct\]|Solution:/.test(raw))
  check('question paper is limited to the requested section', buildQuestionPaperPdf(p, 2).getNumberOfPages() === 1)
}

console.log(failures === 0 ? '\nAll engine checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
