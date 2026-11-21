// Checks the Computer Awareness book data: every chapter file and question file must match the shapes in
// src/lib/computerAwareness/types.ts and the content rules below.
//
//   npx tsx scripts/verify-computer-awareness.ts                 # every chapter in meta.ts
//   npx tsx scripts/verify-computer-awareness.ts memory email    # just those chapters (by id)
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CA_CHAPTERS } from '../src/lib/computerAwareness/meta'

const DIR = join(import.meta.dirname, '..', 'src', 'data', 'computerAwareness')
const BLOCKS = new Set(['text', 'bullets', 'keyvalue', 'table', 'steps', 'timeline', 'callout', 'figure'])
const CALLOUTS = new Set(['remember', 'trap', 'tip', 'fact'])
const FIGURES = new Set(['flow', 'layers', 'pyramid', 'cycle'])

const wanted = process.argv.slice(2)
const chapters = wanted.length ? CA_CHAPTERS.filter((c) => wanted.includes(c.id)) : CA_CHAPTERS
const problems: string[] = []
let questionCount = 0

const isStr = (v: unknown, min = 1, max = 2000): v is string => typeof v === 'string' && v.trim().length >= min && v.length <= max
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

for (const meta of chapters) {
  const bad = (msg: string) => problems.push(`[${meta.id}] ${msg}`)
  const bookPath = join(DIR, 'chapters', `${meta.id}.json`)
  const qPath = join(DIR, 'questions', `${meta.id}.json`)
  if (!existsSync(bookPath)) {
    bad('chapters file is missing')
    continue
  }
  if (!existsSync(qPath)) bad('questions file is missing')

  let book: unknown
  try {
    book = readJson(bookPath)
  } catch (e) {
    bad(`chapters file is not valid JSON: ${(e as Error).message}`)
    continue
  }
  if (!isObj(book)) {
    bad('chapters file must be an object')
    continue
  }
  if (book.id !== meta.id) bad(`id must be "${meta.id}"`)

  const sectionIds = new Set<string>()
  const sections = Array.isArray(book.sections) ? book.sections : []
  if (sections.length < 5 || sections.length > 16) bad(`needs 5-16 sections, has ${sections.length}`)
  for (const [si, s] of sections.entries()) {
    const where = `section ${si + 1}`
    if (!isObj(s)) {
      bad(`${where} must be an object`)
      continue
    }
    if (!isStr(s.id, 2, 60) || !/^[a-z0-9-]+$/.test(s.id)) bad(`${where}: id must be kebab-case`)
    else if (sectionIds.has(s.id)) bad(`${where}: duplicate id ${s.id}`)
    else sectionIds.add(s.id)
    if (!isStr(s.title, 3, 90)) bad(`${where}: title missing or too long`)
    if (!isStr(s.icon, 1, 12)) bad(`${where}: icon (one emoji) missing`)
    const blocks = Array.isArray(s.blocks) ? s.blocks : []
    if (blocks.length < 2) bad(`${where} (${s.id}): needs at least 2 blocks`)
    for (const [bi, b] of blocks.entries()) {
      const w = `${where} block ${bi + 1}`
      if (!isObj(b) || typeof b.type !== 'string' || !BLOCKS.has(b.type)) {
        bad(`${w}: unknown block type`)
        continue
      }
      switch (b.type) {
        case 'text':
          if (!isStr(b.text, 5, 1200)) bad(`${w}: text missing or over 1200 chars`)
          break
        case 'bullets':
        case 'steps':
          if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > 14 || !b.items.every((x) => isStr(x, 2, 400))) bad(`${w}: ${b.type} needs 1-14 string items (max 400 chars)`)
          break
        case 'keyvalue':
          if (!Array.isArray(b.rows) || b.rows.length < 1 || b.rows.length > 30 || !b.rows.every((r) => Array.isArray(r) && r.length === 2 && isStr(r[0], 1, 120) && isStr(r[1], 1, 500))) bad(`${w}: keyvalue needs 1-30 rows of [term, meaning]`)
          break
        case 'table':
          if (!Array.isArray(b.headers) || b.headers.length < 2 || b.headers.length > 6 || !b.headers.every((x) => isStr(x, 1, 60))) bad(`${w}: table needs 2-6 headers`)
          else if (!Array.isArray(b.rows) || b.rows.length < 1 || b.rows.length > 30 || !b.rows.every((r) => Array.isArray(r) && r.length === (b.headers as unknown[]).length && r.every((c) => isStr(c, 1, 300)))) bad(`${w}: table rows must each have ${(b.headers as unknown[]).length} non-empty cells`)
          break
        case 'timeline':
          if (!Array.isArray(b.items) || b.items.length < 2 || b.items.length > 30 || !b.items.every((r) => Array.isArray(r) && r.length === 2 && isStr(r[0], 1, 40) && isStr(r[1], 1, 400))) bad(`${w}: timeline needs 2-30 items of [when, what]`)
          break
        case 'callout':
          if (typeof b.kind !== 'string' || !CALLOUTS.has(b.kind)) bad(`${w}: callout kind must be remember|trap|tip|fact`)
          if (!isStr(b.text, 5, 700)) bad(`${w}: callout text missing or over 700 chars`)
          break
        case 'figure':
          if (typeof b.kind !== 'string' || !FIGURES.has(b.kind)) bad(`${w}: figure kind must be flow|layers|pyramid|cycle`)
          if (!isStr(b.title, 3, 80)) bad(`${w}: figure title missing`)
          if (!Array.isArray(b.items) || b.items.length < 3 || b.items.length > 8 || !b.items.every((r) => Array.isArray(r) && r.length >= 1 && r.length <= 2 && isStr(r[0], 1, 28) && (r[1] === undefined || isStr(r[1], 1, 60)))) bad(`${w}: figure needs 3-8 items of [label (max 28 chars), optional note (max 60 chars)]`)
          break
      }
      if ('title' in b && b.title !== undefined && !isStr(b.title, 2, 90)) bad(`${w}: title must be 2-90 chars`)
    }
  }

  const rev = book.revision
  if (!Array.isArray(rev) || rev.length < 8 || rev.length > 20 || !rev.every((x) => isStr(x, 5, 220))) bad('revision needs 8-20 one-line facts (max 220 chars each)')

  const mm = book.mindmap
  if (!isObj(mm) || !isStr(mm.center, 2, 36)) bad('mindmap.center missing (max 36 chars)')
  else {
    const branches = Array.isArray(mm.branches) ? mm.branches : []
    if (branches.length < 4 || branches.length > 8) bad(`mindmap needs 4-8 branches, has ${branches.length}`)
    for (const [i, br] of branches.entries()) {
      if (!isObj(br) || !isStr(br.label, 2, 30)) bad(`mindmap branch ${i + 1}: label missing (max 30 chars)`)
      else if (!Array.isArray(br.children) || br.children.length < 2 || br.children.length > 6 || !br.children.every((c) => isStr(c, 2, 34))) bad(`mindmap branch "${br.label}": needs 2-6 children (max 34 chars each)`)
    }
  }

  if (!existsSync(qPath)) continue
  let qs: unknown
  try {
    qs = readJson(qPath)
  } catch (e) {
    bad(`questions file is not valid JSON: ${(e as Error).message}`)
    continue
  }
  if (!Array.isArray(qs)) {
    bad('questions file must be an array')
    continue
  }
  if (qs.length < 20) bad(`needs at least 20 questions, has ${qs.length}`)
  questionCount += qs.length
  const ids = new Set<string>()
  const stems = new Set<string>()
  const answerSpread = [0, 0, 0, 0]
  for (const [qi, q] of qs.entries()) {
    const w = `question ${qi + 1}`
    if (!isObj(q)) {
      bad(`${w} must be an object`)
      continue
    }
    if (!isStr(q.id, 3, 60) || !/^[a-z0-9-]+$/.test(q.id) || !q.id.startsWith(`${meta.id}-`)) bad(`${w}: id must be "${meta.id}-NN"`)
    else if (ids.has(q.id)) bad(`${w}: duplicate id ${q.id}`)
    else ids.add(q.id)
    if (!isStr(q.q, 10, 400)) bad(`${w}: q missing or over 400 chars`)
    else if (stems.has(q.q.trim().toLowerCase())) bad(`${w}: duplicate question text`)
    else stems.add(q.q.trim().toLowerCase())
    const opts = q.options
    if (!Array.isArray(opts) || opts.length !== 4 || !opts.every((o) => isStr(o, 1, 160))) bad(`${w}: needs exactly 4 non-empty options (max 160 chars)`)
    else {
      if (new Set(opts.map((o) => String(o).trim().toLowerCase())).size !== 4) bad(`${w}: options must be distinct`)
      if (opts.some((o) => /\b(all|none|both)\s+of\s+(the\s+)?(above|these)|\ball the above\b|\bnone of the above\b/i.test(String(o)))) bad(`${w}: no "all/none of the above" options (options get shuffled)`)
    }
    if (!Number.isInteger(q.answer) || (q.answer as number) < 0 || (q.answer as number) > 3) bad(`${w}: answer must be 0-3`)
    else answerSpread[q.answer as number]++
    if (!isStr(q.explain, 10, 500)) bad(`${w}: explain missing or over 500 chars`)
    if (!isStr(q.section, 2, 60) || !sectionIds.has(q.section as string)) bad(`${w}: section "${String(q.section)}" is not a section id of this chapter`)
  }
  if (qs.length >= 20 && Math.max(...answerSpread) > qs.length * 0.6) bad(`correct answers are bunched on one position: ${answerSpread.join('/')} (spread them across the four options)`)
}

if (problems.length) {
  console.error(`${problems.length} problem(s):\n` + problems.map((p) => `  - ${p}`).join('\n'))
  process.exit(1)
}
console.log(`OK: ${chapters.length} chapter(s), ${questionCount} questions`)
