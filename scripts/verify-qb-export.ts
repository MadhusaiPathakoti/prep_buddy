// Verifies the favourites PDF export: the rule that only filtered favourites can be exported, the file name, loading
// the full questions for a filtered list (with a stand-in for the network), and the PDF itself (pages, branding, answer
// key, solutions, shortcuts, special characters, the largest allowed export).
// Run: npx tsx scripts/verify-qb-export.ts

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

let failures = 0
let passed = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) passed++
  else {
    failures++
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// ---- the real launch questions, and a stand-in for fetch so the loader can run outside a browser
const seedDir = join(process.cwd(), 'public', 'qbank', 'seed')
const files = readdirSync(seedDir)
const g = globalThis as any
let fetchCount = 0
const addedQuestions = new Map<string, unknown>()
g.fetch = async (url: string) => {
  fetchCount++
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const seed = /\/qbank\/seed\/([a-z-]+)\.json$/.exec(url)
  if (seed) return files.includes(`${seed[1]}.json`) ? json(200, JSON.parse(readFileSync(join(seedDir, `${seed[1]}.json`), 'utf8'))) : json(404, {})
  const added = /action=question&id=(q-[0-9a-f]+)/.exec(url)
  if (added) return addedQuestions.has(added[1]) ? json(200, addedQuestions.get(added[1])) : json(404, {})
  return json(404, {})
}
g.localStorage = { getItem: () => null, setItem() {} }

const { NO_FILTERS, MAX_EXPORT, describeFilters, exportBlockedReason, tagFilterCount, applyFilters } = await import('../src/lib/qbank/filters')
const { loadQuestions } = await import('../src/lib/qbank/store')
const { buildFavouritesPdf, downloadFavouritesPdf, favouritesPdfFileName } = await import('../src/lib/qbank/exportPdf')
import type { BankFilters } from '../src/lib/qbank/filters'
import type { QuantQuestion } from '../src/lib/qbank/types'

const all: QuantQuestion[] = files.flatMap((f) => JSON.parse(readFileSync(join(seedDir, f), 'utf8')) as QuantQuestion[])
const entry = (q: QuantQuestion) => ({ id: q.id, topic: q.topic, source: q.source })
const withF = (patch: Partial<BankFilters>): BankFilters => ({ ...NO_FILTERS, ...patch })

// ================================================================ the rule: only filtered favourites can be exported
console.log('the export rule')
check('all questions, no filter: blocked', exportBlockedReason(withF({}), 100) !== null)
check('recently played with a tag filter: blocked (only favourites export)', exportBlockedReason(withF({ show: 'recent', topic: 'percentage' }), 10) !== null)
check('favourites with no filter: blocked, and the message says to filter', /filter your favourites/.test(exportBlockedReason(withF({ show: 'favourites' }), 100) ?? ''))
check('favourites with only a text search: blocked (a search is not a tag)', exportBlockedReason(withF({ show: 'favourites', q: 'train' }), 10) !== null)
for (const [name, patch] of [['topic', { topic: 'percentage' }], ['difficulty', { difficulty: 'hard' }], ['exam type', { examType: 'PO' }], ['exam name', { examName: 'SBI PO' }], ['year', { year: '2023' }], ['year unknown', { year: 'unknown' }], ['source', { source: 'user' }]] as const) {
  check(`favourites filtered by ${name}: allowed`, exportBlockedReason(withF({ show: 'favourites', ...(patch as object) }), 10) === null)
}
check('filtered but nothing matches: blocked', exportBlockedReason(withF({ show: 'favourites', topic: 'percentage' }), 0) !== null)
check(`exactly ${MAX_EXPORT} matches: allowed`, exportBlockedReason(withF({ show: 'favourites', topic: 'percentage' }), MAX_EXPORT) === null)
check(`more than ${MAX_EXPORT} matches: blocked`, /Narrow/.test(exportBlockedReason(withF({ show: 'favourites', topic: 'percentage' }), MAX_EXPORT + 1) ?? ''))
check('tag filters are counted without the show view or search', tagFilterCount(withF({ show: 'favourites', q: 'x', topic: 'percentage', difficulty: 'hard' })) === 2)
check('filters are described in words', describeFilters(withF({ topic: 'time-work', difficulty: 'hard', examType: 'PO', year: 'unknown', source: 'user' })).join(' | ') === 'Topic: Time & Work | Difficulty: Hard | Exam type: PO | Year: Unknown | Source: Added by students')

// the download function itself refuses too, whatever the screen does
{
  const some = all.slice(0, 3)
  let refused = 0
  for (const filters of [withF({}), withF({ show: 'favourites' }), withF({ show: 'recent', topic: 'percentage' })]) {
    try {
      downloadFavouritesPdf(filters, [], some)
    } catch (err) {
      if (err instanceof Error && err.message.length > 10) refused++
    }
  }
  check('the download function refuses an unfiltered or non-favourites list', refused === 3, `${refused} of 3`)
}

// ================================================================ file name
console.log('file name')
{
  const d = new Date('2026-11-18T10:00:00Z')
  check('named after the filters and the date', favouritesPdfFileName(withF({ show: 'favourites', topic: 'percentage', difficulty: 'hard' }), d) === 'prepbuddy-favourites-percentage-hard-2026-11-18.pdf')
  check('awkward exam names are made safe', favouritesPdfFileName(withF({ show: 'favourites', examName: 'RRB Officer Scale-I (2023)/x', source: 'user' }), d) === 'prepbuddy-favourites-rrb-officer-scale-i-2023-x-student-added-2026-11-18.pdf')
}

// ================================================================ loading the full questions
console.log('loading the questions')
{
  const percentage = all.filter((q) => q.topic === 'percentage').slice(0, 5)
  const mixed = [...percentage, ...all.filter((q) => q.topic === 'time-work').slice(0, 3)]
  fetchCount = 0
  const { questions, missing } = await loadQuestions(mixed.map(entry))
  check('questions come back in the order asked', questions.map((q) => q.id).join() === mixed.map((q) => q.id).join() && missing === 0)
  check('one download per topic, not per question', fetchCount === 2, `${fetchCount} fetches`)
  const fakeAdded = { ...all[0], id: 'q-aaaaaaaaaaaaaaaaaaaa', source: 'user' } as QuantQuestion
  addedQuestions.set(fakeAdded.id, fakeAdded)
  const withAdded = await loadQuestions([entry(all[1]), { id: fakeAdded.id, topic: fakeAdded.topic, source: 'user' }, { id: 'q-bbbbbbbbbbbbbbbbbbbb', topic: 'percentage', source: 'user' }, { id: 'q-00000000000000000000', topic: 'percentage', source: 'generated' }])
  check('added questions are fetched individually; unknown ones are counted as missing, not fatal', withAdded.questions.length === 2 && withAdded.missing === 2 && withAdded.questions[1].id === fakeAdded.id)
  g.fetch = async () => { throw new TypeError('offline') }
  const offline = await loadQuestions([...percentage.map(entry)])
  // (the topic file for percentage is already cached by the first call, so use a topic not yet loaded)
  const cold = await loadQuestions(all.filter((q) => q.topic === 'mensuration').slice(0, 2).map(entry))
  check('offline: nothing is loaded and all are reported missing (no crash)', cold.questions.length === 0 && cold.missing === 2 && offline.questions.length === 5)
}

// ================================================================ the PDF
console.log('the PDF')
{
  const pick = (topic: string, n: number) => all.filter((q) => q.topic === topic).slice(0, n)
  const sample = [...pick('percentage', 4), ...pick('quadratic-equations', 2), ...pick('simplification', 3), ...pick('mensuration', 2)]
  const added: QuantQuestion = {
    ...sample[0],
    id: 'q-cccccccccccccccccccc',
    stem: 'Find the value of 19² + 5³ − ½ of 40 × √81 ÷ 3 in ₹ (π ≈ 22/7) where x ≤ 5 and y ≠ 2.',
    options: ['₹120', '₹130', '₹140', '₹150', 'None of these'],
    answer: 4,
    solution: 'Step 1: 19² = 361 and 5³ = 125\nStep 2: ½ of 40 = 20; 20 × √81 ÷ 3 = 60\nStep 3: 361 + 125 − 60 = 426\nCorrect answer: (E) None of these',
    shortcut: 'Squares to 30 by heart',
    source: 'user',
    trust: 'unverified',
    examName: 'SBI PO',
    year: 2023,
  }
  const questions = [...sample, added]
  const date = new Date('2026-11-18T10:00:00Z')
  const doc = buildFavouritesPdf({ questions, filters: ['Topic: Percentage', 'Difficulty: Hard'], date })
  const pages = doc.getNumberOfPages()
  const bytes = Buffer.from(doc.output('arraybuffer') as ArrayBuffer)
  const text = bytes.toString('latin1')
  check('a real PDF file', text.startsWith('%PDF-') && bytes.length > 5000, `${bytes.length} bytes`)
  check('several pages (questions, answers, solutions)', pages >= 3, `${pages} pages`)
  check('title, filters and count at the top', text.includes('My favourite Quant questions') && text.includes('Filters: Topic: Percentage') && text.includes(`${questions.length} questions`))
  check('every question is numbered', questions.every((_, i) => text.includes(`Q${i + 1}.`)))
  check('answer key and solutions sections are there', text.includes('(Answers:)') && text.includes('(Solutions:)'))
  // (parentheses inside a PDF text string are written as \( and \))
  check('every question has a correct-answer line', questions.every((q, i) => text.includes(`${i + 1}. Correct answer: \\(${'ABCDE'[q.answer]}\\)`)))
  check('own shortcut and the topic tips are included', text.includes('Shortcut: Squares to 30 by heart') && text.includes('Shortcut: Successive changes'))
  check('the unverified warning is included', text.includes('could not be independently confirmed'))
  check('tags are shown on each question', text.includes('SBI PO') && text.includes('2023') && text.includes('Percentage'))
  check('special characters survive in readable form', text.includes('19') && text.includes('Rs.120') && text.includes('sqrt') && text.includes('<=') && text.includes('!='), 'check mapped symbols')
  check('no question marks stand in for symbols we know how to draw', !/Rs\.\?|\(\?\)/.test(text))
  check('PrepBuddy branding on every page', (text.match(/\(PrepBuddy\) Tj/g) ?? []).length >= pages, `${(text.match(/\(PrepBuddy\)/g) ?? []).length} marks, ${pages} pages`)
  check('page numbers on every page', Array.from({ length: pages }, (_, i) => `Page ${i + 1} of ${pages}`).every((s) => text.includes(s)))
  let threw = false
  try {
    buildFavouritesPdf({ questions: [], filters: [], date })
  } catch {
    threw = true
  }
  check('an empty list cannot be exported', threw)

  // the largest allowed export
  const big = all.slice(0, MAX_EXPORT)
  const started = Date.now()
  const bigDoc = buildFavouritesPdf({ questions: big, filters: ['Difficulty: Hard'], date })
  const ms = Date.now() - started
  console.log(`  (${MAX_EXPORT} questions: ${bigDoc.getNumberOfPages()} pages in ${ms} ms)`)
  check(`${MAX_EXPORT} questions build in a few seconds`, ms < 8000, `${ms} ms`)
  check('the answer grid covers every question', (Buffer.from(bigDoc.output('arraybuffer') as ArrayBuffer).toString('latin1').match(/\(\d+\. [A-E]\)/g) ?? []).length >= MAX_EXPORT)
}

// ================================================================ filters really narrow the favourites
console.log('what gets exported follows the filters')
{
  const entries = all.map((q) => ({ id: q.id, topic: q.topic, difficulty: q.difficulty, examName: q.examName, examType: q.examType, year: q.year, source: q.source, trust: q.trust, preview: q.stem }))
  const favourites = new Set(entries.filter((e, i) => i % 7 === 0).map((e) => e.id))
  const user = { favourites, progress: new Map() }
  const filtered = applyFilters(entries as never, withF({ show: 'favourites', topic: 'percentage', difficulty: 'hard' }), user)
  check('only favourites that match every tag are listed', filtered.length > 0 && filtered.every((e) => favourites.has(e.id) && e.topic === 'percentage' && e.difficulty === 'hard'))
  check('questions that are not favourites never appear', applyFilters(entries as never, withF({ show: 'favourites' }), user).length === favourites.size)
}

console.log(failures === 0 ? `\nAll ${passed} checks passed.` : `\n${failures} check(s) FAILED (${passed} passed).`)
process.exit(failures === 0 ? 0 : 1)
