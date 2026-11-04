// Builds the curated English seed (src/lib/mocks/english/seed.generated.json) from content/english/<topic>-<difficulty>.json.
//
//   npx tsx scripts/build-english-seed.ts            validate + build (writes the seed only if EVERY item is valid)
//   npx tsx scripts/build-english-seed.ts --blind    also write <contentDir>/_blind/<topic>-<difficulty>.txt: every question as
//                                                    a student sees it (stem, options, passage) WITHOUT keys or explanations
//   CONTENT_DIR=path   read content from another folder (tests use scripts/fixtures/english-seed)
//   SEED_OUT=path      write the seed somewhere else
//
// Every item goes through the SAME server validators and builders as the live generate path (api/mockEnglish.js) AND the client
// checks (checkEnglishGroup). On top of that each built question is PROVED against the authored material:
//   word-swap      the faulty sentence is exactly the correct sentence with the two marked words swapped (and differs from it)
//   para-jumble    the keyed order / position is derived from the authored order of the sentences
//   match-column   the keyed matching is derived from the authored pairs
//   error-detection the key points at the authored part (or No error) / the authored correct sentence
//   cloze          blanks are 1..N and contiguous, every option set contains the authored key
//   rc             vocabulary targets occur in the passage and are absent from the options
//   all            the keyed option text of the built question equals the authored key text
// Duplicates (exact and near) are detected across ALL files. Problems are reported as "file: item [n]: message"; nothing is skipped
// silently and the process exits non-zero.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildCompactItem, COMPACT_TOPICS } from '../api/mockEnglish.js'
import { checkEnglishGroup, dedupeText, jaccard, normKey, passageText, wordCount } from '../src/lib/mocks/english/checks'
import { isNoErrorQuestion } from '../src/lib/mocks/english/index'
import type { SeedEntry } from '../src/lib/mocks/english/seed'
import type { EnglishTopicId, Group, MockDifficulty, QuestionDraft } from '../src/lib/mocks/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

const TOPICS = COMPACT_TOPICS as EnglishTopicId[]
const DIFFICULTIES: MockDifficulty[] = ['hard', 'medium']
const SET_TOPICS = new Set<EnglishTopicId>(['rc', 'cloze'])
/** Topics whose option text is sentence-like, so "the key is the longest option" is a meaningful bias. */
const LONGEST_TOPICS = new Set<EnglishTopicId>(['rc', 'cloze', 'fillers', 'phrase-replacement'])
/** Topics where the authored correctIndex is shuffled at build time but should still not be biased. */
const POSITION_TOPICS = new Set<EnglishTopicId>(['rc', 'cloze', 'fillers', 'phrase-replacement'])
const MIN_QUESTIONS_FOR_BIAS_RULES = 10
const BIAS_LIMIT = 0.4

export interface TopicStats {
  file: string
  topic: EnglishTopicId
  difficulty: MockDifficulty
  items: number
  questions: number
  keyPositions: number[]
  authoredPositions: number[] | null
  noErrorShare: number
  passageWords: { min: number; avg: number; max: number } | null
  keyLongestShare: number | null
}
export interface BuildResult {
  entries: SeedEntry[]
  errors: string[]
  warnings: string[]
  stats: TopicStats[]
  /** file name (topic-difficulty.txt) -> blind view */
  blind: Record<string, string>
}

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim()
const nullish = (v: unknown) => v === null || v === -1 || v === 'null' || v === 'none' || v === 'None'
const keyText = (q: QuestionDraft) => clean(q.options[q.answer])

/** Index of marked words in tokens exactly as the server resolves them (words in order, or token indexes). */
function resolveMarked(tokens: string[], raw: unknown[]): number[] {
  if (raw.every((x) => Number.isInteger(x))) return raw as number[]
  const out: number[] = []
  let from = 1
  for (const w of raw) {
    const target = String(w).trim().toLowerCase()
    const idx = tokens.findIndex((t, i) => i >= from && t.toLowerCase() === target)
    if (idx < 0) return []
    out.push(idx)
    from = idx + 1
  }
  return out
}

/** The correct-by-construction proofs; returns one message per violated proof. */
function prove(topic: EnglishTopicId, item: any, group: Group): string[] {
  const bad: string[] = []
  const qs = group.questions
  const fail = (m: string) => bad.push(m)
  if (topic === 'rc') {
    const passage = clean(group.stimulus ? passageText(group) : '')
    const authored: any[] = item.questions ?? []
    // Built questions keep the authored order (the builder drops rather than reorders), so compare by position.
    qs.forEach((q, i) => {
      const a = authored[i]
      if (!a) return fail(`built question ${i + 1} has no authored counterpart`)
      if (keyText(q) !== clean(a.options?.[a.correctIndex])) fail(`question ${i + 1}: built key text differs from the authored key`)
      if (/vocab/.test(String(a.kind))) {
        const t = clean(a.targetWord)
        if (!new RegExp(`(?<![A-Za-z'-])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z'-])`, 'i').test(passage)) fail(`question ${i + 1}: targetWord "${t}" does not occur in the passage`)
        if (q.options.some((o) => normKey(o) === normKey(t))) fail(`question ${i + 1}: an option equals the targetWord`)
        if (!q.stem.includes(t)) fail(`question ${i + 1}: built stem does not show the targetWord`)
      }
    })
  } else if (topic === 'cloze') {
    const text = clean(passageText(group))
    const nums = [...text.matchAll(/\((\d+)\) ______/g)].map((m) => Number(m[1]))
    const blanks: any[] = item.blanks ?? []
    if (nums.length === 0 || nums.some((n, i) => n !== i + 1)) fail('blank numbers are not contiguous 1..N')
    if (blanks.length !== nums.length) fail(`passage has ${nums.length} blanks but ${blanks.length} blank entries`)
    blanks.forEach((b, i) => {
      if (!Array.isArray(b.options) || b.options.length !== 5 || !Number.isInteger(b.correctIndex) || b.correctIndex < 0 || b.correctIndex > 4) return fail(`blank ${i + 1}: options/correctIndex malformed`)
      if (qs[i] && keyText(qs[i]) !== clean(b.options[b.correctIndex])) fail(`blank ${i + 1}: built key text differs from the authored key`)
    })
  } else if (topic === 'error-detection') {
    const q = qs[0]
    if (item.variant === 'sentences') {
      if (keyText(q) !== clean(item.sentences?.[item.correctIndex])) fail('built key sentence differs from the authored correct sentence')
    } else {
      const idx = nullish(item.errorPartIndex) ? 4 : item.errorPartIndex
      if (!(idx === 4 || (Number.isInteger(idx) && idx >= 0 && idx <= 3))) fail('errorPartIndex out of range')
      if (q.answer !== idx) fail('built key does not point at the authored error part')
      let at = 0
      for (const part of item.parts ?? []) {
        const pos = q.stem.indexOf(clean(part), at)
        if (pos < 0) return [...bad, `part "${clean(part)}" is missing or out of order in the built stem`]
        at = pos + clean(part).length
      }
    }
  } else if (topic === 'para-jumble') {
    const q = qs[0]
    const rows = [...q.stem.matchAll(/^([A-F])\. (.+)$/gm)].map((m) => ({ letter: m[1], text: clean(m[2]) }))
    const authored: string[] = (item.sentences ?? []).map(clean)
    const letterOf = new Map(rows.map((r) => [r.text, r.letter]))
    const order = authored.map((s) => letterOf.get(s) ?? '?').join('')
    if (order.includes('?') || rows.length !== authored.length) return ['a built sentence differs from the authored sentences']
    const m = /should be the (\w+) sentence/.exec(q.stem)
    if (!m) {
      if (q.options[q.answer] !== order) fail(`keyed order ${q.options[q.answer]} is not the authored order ${order}`)
    } else {
      const pos = ['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH'].indexOf(m[1])
      if (pos < 0 || q.options[q.answer] !== order[pos]) fail(`keyed ${m[1]} sentence ${q.options[q.answer]} is not ${order[pos]}`)
    }
  } else if (topic === 'word-swap') {
    const q = qs[0]
    const tokens: string[] = (item.tokens ?? []).map(String)
    const marked = resolveMarked(tokens, item.marked ?? [])
    if (marked.length !== 4) return ['marked words could not be located in tokens']
    const shown = clean(q.stem.split('\n\n').slice(1).join(' ').replace(/\(\d\)(?=\S)/g, ''))
    const correct = tokens.join(' ')
    if (nullish(item.swap) || item.swap === undefined) {
      if (shown !== correct) fail('no-interchange item: the shown sentence differs from the authored sentence')
      if (q.options[q.answer] !== 'No interchange required') fail('no-interchange key is not "No interchange required"')
    } else {
      const [a, b] = item.swap as number[]
      const faulty = tokens.slice()
      ;[faulty[marked[a]], faulty[marked[b]]] = [faulty[marked[b]], faulty[marked[a]]]
      if (faulty.join(' ') === correct) fail('swapping the two marked words does not change the sentence')
      if (shown !== faulty.join(' ')) fail('the shown (faulty) sentence is not the correct sentence with the two marked words swapped')
      if (q.options[q.answer] !== `(${Math.min(a, b) + 1}) and (${Math.max(a, b) + 1})`) fail('the key does not name the swapped pair')
      // Putting them back must be the ONLY single interchange that repairs it.
      const fixes = [] as string[]
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
          const t = faulty.slice()
          ;[t[marked[i]], t[marked[j]]] = [t[marked[j]], t[marked[i]]]
          if (t.join(' ') === correct) fixes.push(`${i}-${j}`)
        }
      }
      if (fixes.length !== 1) fail(`${fixes.length} different interchanges restore the sentence`)
    }
  } else if (topic === 'phrase-replacement') {
    const q = qs[0]
    if (item.variant === 'usage') {
      if (keyText(q) !== clean(item.options?.[item.correctIndex])) fail('built key differs from the authored key')
    } else {
      const expected = nullish(item.correctIndex) ? 'No correction required' : clean(item.options?.[item.correctIndex])
      if (keyText(q) !== expected) fail('built key differs from the authored key')
      const shown = q.stem.split('\n\n').slice(1).join(' ').replace(/\s+/g, '').toLowerCase()
      if (shown !== [item.before, item.phrase, item.after].join('').replace(/\s+/g, '').toLowerCase()) fail('the shown sentence is not before + phrase + after')
    }
  } else if (topic === 'fillers') {
    const q = qs[0]
    const key = item.type === 'double' ? `${clean(item.options?.[item.correctIndex]?.[0])}, ${clean(item.options?.[item.correctIndex]?.[1])}` : clean(item.options?.[item.correctIndex])
    if (keyText(q) !== key) fail('built key differs from the authored key')
  } else if (topic === 'match-column') {
    const q = qs[0]
    const i1 = q.stem.indexOf('Column I\n')
    const i2 = q.stem.indexOf('Column II\n')
    const col1 = [...q.stem.slice(i1, i2).matchAll(/^([1-4])\. (.+)$/gm)].map((m) => clean(m[2]))
    const col2 = new Map([...q.stem.slice(i2).matchAll(/^([A-D])\. (.+)$/gm)].map((m) => [clean(m[2]), m[1]]))
    const pairs: any[] = item.pairs ?? []
    const matching = pairs.map((p, i) => `${i + 1}-${col2.get(clean(p.end)) ?? '?'}`).join(', ')
    if (matching.includes('?')) return ['an authored ending is missing from Column II']
    if (pairs.some((p, i) => col1[i] !== clean(p.begin).replace(/\.$/, ''))) fail('Column I does not list the authored beginnings in order')
    if (q.options[q.answer] !== matching) fail(`keyed matching ${q.options[q.answer]} is not the authored matching ${matching}`)
  }
  return bad
}

/** Names the questions of an rc passage that the validators drop (each question alone in a copy of the passage). */
function diagnoseRc(item: any, difficulty: MockDifficulty, seed: string): string[] {
  const out: string[] = []
  ;(item.questions ?? []).forEach((q: any, i: number) => {
    const { group, drops } = buildCompactItem('rc', { ...item, questions: [q] }, { difficulty, seed })
    if (!group || group.questions.length !== 1) out.push(`question ${i + 1} (${q.kind}): ${drops.join('; ') || 'rejected'}`)
  })
  return out
}

function renderBlind(entries: SeedEntry[], topic: EnglishTopicId, difficulty: MockDifficulty): string {
  const lines = [`${topic} / ${difficulty}: ${entries.length} items. Solve blind: this file withholds the answer keys and the rationales.`, '']
  let n = 0
  entries.forEach((e) => {
    if (e.group.stimulus) {
      lines.push(`=== PASSAGE ${e.id} ===`, passageText(e.group), '')
    }
    for (const q of e.group.questions) {
      n++
      lines.push(`Q${n} [${e.id}]`, q.stem, ...q.options.map((o, i) => `  ${'ABCDE'[i]}) ${o}`), '')
    }
  })
  return lines.join('\n')
}

export function buildSeed(contentDir: string): BuildResult {
  const errors: string[] = []
  const warnings: string[] = []
  const stats: TopicStats[] = []
  const entries: SeedEntry[] = []
  const blind: Record<string, string> = {}
  const dir = resolve(contentDir)
  if (!existsSync(dir)) return { entries, errors: [`content directory not found: ${dir}`], warnings, stats, blind }

  const fileRe = new RegExp(`^(${TOPICS.join('|')})-(medium|hard)\\.json$`)
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.json')) continue
    if (!fileRe.test(name)) errors.push(`${name}: unrecognised file name (expected <topic>-<medium|hard>.json)`)
  }

  for (const topic of TOPICS) {
    for (const difficulty of DIFFICULTIES) {
      const name = `${topic}-${difficulty}.json`
      const path = join(dir, name)
      if (!existsSync(path)) continue
      let data: any
      try {
        data = JSON.parse(readFileSync(path, 'utf8'))
      } catch (e) {
        errors.push(`${name}: not valid JSON (${(e as Error).message})`)
        continue
      }
      const listKey = SET_TOPICS.has(topic) ? 'passages' : 'items'
      const list = data?.[listKey]
      if (!Array.isArray(list)) {
        errors.push(`${name}: top level must be {"${listKey}": [...]}`)
        continue
      }
      const fileEntries: SeedEntry[] = []
      const authoredPositions = [0, 0, 0, 0, 0]
      let authoredCount = 0
      list.forEach((item: any, i: number) => {
        const where = `${name}: ${listKey}[${i}]`
        if (!item || typeof item !== 'object') {
          errors.push(`${where}: not an object`)
          return
        }
        const { group, drops } = buildCompactItem(topic, item, { difficulty, seed: `${topic}-${difficulty}-${i}` })
        if (!group) {
          errors.push(`${where}: rejected by the validators: ${drops.join('; ') || 'unknown reason'}`)
          return
        }
        if (topic === 'rc' && group.questions.length !== (item.questions ?? []).length) {
          errors.push(`${where}: ${(item.questions ?? []).length - group.questions.length} question(s) rejected: ${diagnoseRc(item, difficulty, `${topic}-${difficulty}-${i}`).join(' | ') || drops.join('; ')}`)
          return
        }
        const checked = checkEnglishGroup(topic, difficulty, group)
        if (!checked.group || checked.group.questions.length !== group.questions.length) {
          errors.push(`${where}: rejected by the client checks: ${checked.reasons.join('; ')}`)
          return
        }
        for (const m of prove(topic, item, group)) errors.push(`${where}: PROOF FAILED: ${m}`)
        // authored key positions (before the builder shuffled them)
        const auth: any[] = topic === 'rc' ? item.questions : topic === 'cloze' ? item.blanks : [item]
        for (const a of auth) {
          if (POSITION_TOPICS.has(topic) && Number.isInteger(a?.correctIndex) && a.correctIndex >= 0 && a.correctIndex <= 4) {
            authoredPositions[a.correctIndex]++
            authoredCount++
          }
        }
        fileEntries.push({ id: `${topic}-${difficulty}-${String(i + 1).padStart(3, '0')}`, topic, difficulty, group })
      })
      entries.push(...fileEntries)

      // statistics and bias rules
      const qs = fileEntries.flatMap((e) => e.group.questions)
      const positions = [0, 0, 0, 0, 0]
      for (const q of qs) positions[q.answer]++
      const words = fileEntries.filter((e) => e.group.stimulus).map((e) => wordCount(passageText(e.group).replace(/\(\d+\) ______/g, 'x')))
      const longest = LONGEST_TOPICS.has(topic)
        ? qs.filter((q) => {
            const key = q.options[q.answer]
            return key !== 'No correction required' && q.options.every((o, i) => i === q.answer || o === 'No correction required' || key.length > o.length)
          }).length / Math.max(1, qs.length)
        : null
      stats.push({
        file: name,
        topic,
        difficulty,
        items: fileEntries.length,
        questions: qs.length,
        keyPositions: positions,
        authoredPositions: POSITION_TOPICS.has(topic) ? authoredPositions : null,
        noErrorShare: qs.length ? Number((qs.filter((q) => isNoErrorQuestion(topic, q)).length / qs.length).toFixed(2)) : 0,
        passageWords: words.length ? { min: Math.min(...words), avg: Math.round(words.reduce((a, b) => a + b, 0) / words.length), max: Math.max(...words) } : null,
        keyLongestShare: longest === null ? null : Number(longest.toFixed(2)),
      })
      if (qs.length >= MIN_QUESTIONS_FOR_BIAS_RULES) {
        if (POSITION_TOPICS.has(topic) && authoredCount >= MIN_QUESTIONS_FOR_BIAS_RULES) {
          const worst = Math.max(...authoredPositions) / authoredCount
          if (worst > BIAS_LIMIT) errors.push(`${name}: authored correctIndex ${authoredPositions.indexOf(Math.max(...authoredPositions))} is used for ${Math.round(worst * 100)}% of the keys (limit ${BIAS_LIMIT * 100}%); spread the keys`)
        }
        if (longest !== null && longest > BIAS_LIMIT) errors.push(`${name}: the key is the longest option in ${Math.round(longest * 100)}% of the questions (limit ${BIAS_LIMIT * 100}%); rebalance option lengths`)
      } else if (qs.length > 0) warnings.push(`${name}: only ${qs.length} questions, key-position and option-length rules (>= ${MIN_QUESTIONS_FOR_BIAS_RULES}) not enforced`)
      blind[`${topic}-${difficulty}.txt`] = renderBlind(fileEntries, topic, difficulty)
    }
  }

  // duplicates and near-duplicates across ALL files
  const texts = entries.map((e) => (e.group.stimulus ? { id: e.id, text: passageText(e.group), passage: true } : { id: e.id, text: `${dedupeText(e.group.questions[0]) ?? e.group.questions[0].stem}`, passage: false }))
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i]
      const b = texts[j]
      if (a.passage !== b.passage || entries[i].topic !== entries[j].topic) continue
      if (normKey(a.text) === normKey(b.text)) errors.push(`${entries[j].id} duplicates ${entries[i].id} (identical content)`)
      else if (jaccard(a.text, b.text) >= (a.passage ? 0.6 : 0.85)) errors.push(`${entries[j].id} is a near-duplicate of ${entries[i].id} (Jaccard >= ${a.passage ? 0.6 : 0.85})`)
    }
  }
  return { entries, errors, warnings, stats, blind }
}

function printStats(stats: TopicStats[]) {
  console.log(`${'file'.padEnd(34)}${'items'.padStart(6)}${'qs'.padStart(5)}  key positions A-E   authored   no-error  passage words (min/avg/max)  key longest`)
  for (const s of stats) {
    console.log(
      `${s.file.padEnd(34)}${String(s.items).padStart(6)}${String(s.questions).padStart(5)}  ${s.keyPositions.join('/').padEnd(17)}   ${(s.authoredPositions ? s.authoredPositions.join('/') : '-').padEnd(9)}  ${String(s.noErrorShare).padEnd(8)}  ${(s.passageWords ? `${s.passageWords.min}/${s.passageWords.avg}/${s.passageWords.max}` : '-').padEnd(28)}  ${s.keyLongestShare === null ? '-' : s.keyLongestShare}`,
    )
  }
}

function main() {
  const contentDir = process.env.CONTENT_DIR || 'content/english'
  const out = resolve(process.env.SEED_OUT || 'src/lib/mocks/english/seed.generated.json')
  const result = buildSeed(contentDir)
  printStats(result.stats)
  for (const w of result.warnings) console.log(`warning: ${w}`)
  if (process.argv.includes('--blind')) {
    const bdir = join(resolve(contentDir), '_blind')
    mkdirSync(bdir, { recursive: true })
    for (const [name, text] of Object.entries(result.blind)) writeFileSync(join(bdir, name), text)
    console.log(`blind views written to ${bdir}`)
  }
  if (result.errors.length) {
    console.error(`\n${result.errors.length} problem(s); the seed was NOT written:`)
    for (const e of result.errors) console.error(` - ${e}`)
    process.exit(1)
  }
  writeFileSync(out, JSON.stringify({ version: 1, entries: result.entries }, null, 1) + '\n')
  console.log(`\nwrote ${result.entries.length} items (${result.entries.reduce((n, e) => n + e.group.questions.length, 0)} questions) to ${out}`)
}

if (process.argv[1] && /build-english-seed\.[tj]s$/.test(process.argv[1].replace(/\\/g, '/'))) main()
