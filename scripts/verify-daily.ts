// Verifies the Daily Dose: every section builds for a long run of dates, is deterministic per date, differs from day
// to day, passes the structural validator, and renders to a PDF whose pages all carry the PrepBuddy mark.
// Run: npx tsx scripts/verify-daily.ts [days]

import { buildDailyPaper, DAILY_SECTIONS } from '../src/lib/daily/compose'
import { buildDailyPaperPdf } from '../src/lib/daily/pdf'
import { assertGroup } from '../src/lib/mocks/validate'
import type { MockPaper } from '../src/lib/mocks/types'

const DAYS = Number(process.argv[2] ?? 40)
const EXPECTED: Record<string, number> = { quant: 25, reasoning: 25, english: 45 }

let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  FAIL ${msg}`)
}

function dateKeys(n: number): string[] {
  const out: string[] = []
  const d = new Date(Date.UTC(2026, 10, 1))
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

const sig = (p: MockPaper) => JSON.stringify([p.questions, p.sets])

for (const s of DAILY_SECTIONS) {
  console.log(`\n== ${s.name}`)
  const seenSigs = new Map<string, string>()
  let repeatedDays = 0
  for (const key of dateKeys(DAYS)) {
    let paper: MockPaper
    try {
      paper = buildDailyPaper(s.id, key)
    } catch (e) {
      fail(`${s.id} ${key}: ${e instanceof Error ? e.message : e}`)
      continue
    }
    if (paper.questions.length !== EXPECTED[s.id]) fail(`${s.id} ${key}: ${paper.questions.length} questions, expected ${EXPECTED[s.id]}`)
    if (sig(paper) !== sig(buildDailyPaper(s.id, key))) fail(`${s.id} ${key}: not deterministic`)
    const ids = new Set(paper.questions.map((q) => q.id))
    if (ids.size !== paper.questions.length) fail(`${s.id} ${key}: duplicate ids`)
    if (paper.sections[0].questionIds.length !== paper.questions.length) fail(`${s.id} ${key}: section list mismatch`)
    const stems = new Set(paper.questions.map((q) => `${q.stem}|${q.options.join('|')}`))
    if (stems.size !== paper.questions.length) fail(`${s.id} ${key}: duplicate questions inside one paper`)
    for (const q of paper.questions) {
      try {
        assertGroup({ questions: [q] }, `${s.id} ${key} ${q.id}`)
      } catch (e) {
        fail(e instanceof Error ? e.message : String(e))
      }
      if (q.setId && !paper.sets[q.setId]) fail(`${s.id} ${key} ${q.id}: missing set`)
    }
    const prev = seenSigs.get(sig(paper))
    if (prev) repeatedDays++
    seenSigs.set(sig(paper), key)
  }
  console.log(`  ${DAYS} days built; identical-paper repeats: ${repeatedDays}`)
  if (repeatedDays > 0) fail(`${s.id}: identical papers on different days`)

  // English/quant/reasoning overlap between consecutive days
  const a = buildDailyPaper(s.id, '2026-11-05')
  const b = buildDailyPaper(s.id, '2026-11-06')
  const shared = a.questions.filter((q) => b.questions.some((x) => x.stem === q.stem && x.options.join('|') === q.options.join('|'))).length
  console.log(`  questions shared by 5 Nov and 6 Nov: ${shared}/${a.questions.length}`)

  // PDF
  const doc = buildDailyPaperPdf(a)
  const pages = doc.getNumberOfPages()
  console.log(`  PDF: ${pages} pages`)
  if (pages < 3) fail(`${s.id}: suspiciously short PDF (${pages} pages)`)
}

console.log(failures === 0 ? '\nAll Daily Dose checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
