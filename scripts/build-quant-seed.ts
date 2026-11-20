// Builds the launch question bank from the app's own Quant generators (the ones the mocks and the Daily Dose use,
// every one of which cross-checks its answer with a second method). Data Interpretation is skipped: it needs a table
// or chart, and the bank is plain text. The output is fully deterministic (fixed seeds, no timestamps), so re-running
// it changes nothing unless the generators change.
//
// Writes:  public/qbank/seed/<topic>.json   one file per topic, an array of QuantQuestion
//          public/qbank/manifest.json       counts, so the app can show totals without loading every file
//          public/qbank/index.json          one short row per question (tags + a preview line), so the table can filter without loading any question text
//          api/_lib/seedSigs.json           each question's id and similarity fingerprint, so the server can tell a new question is a copy of one of these
//          api/_lib/seedQuadKeys.json       the same for quadratic questions by their equations, so a retyped copy of one is caught (scripts/quad-keys.ts)
// Run:     npm run build:qbank [perSet]     perSet = questions per (generator, difficulty); default 90, fewer for topics whose templates run out

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { previewOf } from '../api/_lib/qbIndex.js'
import { questionKey } from '../api/_lib/qbankKey.js'
import { signatureOf } from '../api/_lib/qbSimilar.js'
import { writeQuadKeys } from './quad-keys'
import { QUANT_GENERATORS } from '../src/lib/mocks/quant'
import { QUANT_MAINS_GENERATORS } from '../src/lib/mocks/quant/mains'
import { createRng } from '../src/lib/mocks/rng'
import type { MockDifficulty, TopicGenerator } from '../src/lib/mocks/types'
import { validateDraft } from '../src/lib/mocks/validate'
import { BANK_TOPIC_IDS, GENERATED_EXAM_NAME, isBankTopic } from '../src/lib/qbank/types'
import type { BankTopicId, ExamType, QuantQuestion, QuestionIndexEntry, SeedManifest } from '../src/lib/qbank/types'
import type { Difficulty } from '../src/lib/types'

const PER_SET = Number(process.argv[2] ?? 90)
const OUT_DIR = join(process.cwd(), 'public', 'qbank')
/** A fixed date, so the output never changes between runs. */
const SEED_DATE = '2026-11-18T00:00:00.000Z'

/** Stable 32-bit seed from a label (FNV-1a), so every (topic, level, difficulty) set always draws the same questions. */
function seedOf(label: string): number {
  let h = 2166136261
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

interface Source {
  level: 'prelims' | 'mains'
  generators: Partial<Record<string, TopicGenerator>>
  difficulties: MockDifficulty[]
}

// Prelims-style generators in both difficulties (medium reads like a Clerk paper, hard like a PO paper); the harder
// SBI PO Mains-style generators in hard only, as the Daily Dose uses them.
const SOURCES: Source[] = [
  { level: 'prelims', generators: QUANT_GENERATORS, difficulties: ['medium', 'hard'] },
  { level: 'mains', generators: QUANT_MAINS_GENERATORS, difficulties: ['hard'] },
]

const byTopic = new Map<BankTopicId, QuantQuestion[]>()
const seenKeys = new Set<string>()
let duplicates = 0
let skippedSets = 0

/** Questions asked of a generator per call. Small calls keep a template with few distinct questions from running dry. */
const BATCH = 12
/** Give up on a (topic, difficulty) set after this many calls in a row that added nothing new. */
const STALE_LIMIT = 4

for (const topic of BANK_TOPIC_IDS) {
  if (topic === 'other') continue
  for (const source of SOURCES) {
    const generate = source.generators[topic]
    if (!generate) continue
    for (const difficulty of source.difficulties) {
      let added = 0
      let stale = 0
      for (let batch = 0; added < PER_SET && stale < STALE_LIMIT; batch++) {
        const rng = createRng(seedOf(`qbank:${source.level}:${topic}:${difficulty}:${batch}`))
        let groups
        try {
          groups = generate(rng, difficulty, BATCH)
        } catch (err) {
          // A template that has run out of new wordings is expected; a failed self-check or anything else is not.
          if (err instanceof Error && /could not produce a question/.test(err.message)) {
            stale++
            continue
          }
          throw err
        }
        let addedThisBatch = 0
        for (const group of groups) {
          // A question that needs a shared table or passage cannot stand alone in the bank.
          if (group.stimulus) {
            skippedSets++
            continue
          }
          for (const q of group.questions) {
            if (added >= PER_SET) break
            const problem = validateDraft(q)
            if (problem) throw new Error(`${topic} (${source.level}/${difficulty}): ${problem}`)
            if (!isBankTopic(q.topic)) {
              skippedSets++
              continue
            }
            const id = questionKey(q.stem, q.options)
            if (seenKeys.has(id)) {
              duplicates++
              continue
            }
            seenKeys.add(id)
            const examType: ExamType = difficulty === 'hard' ? 'PO' : 'Clerk'
            const record: QuantQuestion = {
              id,
              stem: q.stem,
              options: q.options,
              answer: q.answer,
              solution: q.explanation,
              shortcut: null,
              topic: q.topic,
              difficulty: difficulty as Difficulty,
              examName: GENERATED_EXAM_NAME,
              examType,
              year: null,
              source: 'generated',
              trust: 'proven',
              createdAt: SEED_DATE,
              addedBy: null,
            }
            const list = byTopic.get(q.topic) ?? []
            list.push(record)
            byTopic.set(q.topic, list)
            added++
            addedThisBatch++
          }
        }
        stale = addedThisBatch === 0 ? stale + 1 : 0
      }
    }
  }
}

// Generation runs medium, then hard, then mains-style, so mix each topic in a fixed order: "next question" should
// not mean ninety easy ones followed by ninety hard ones.
for (const [topic, list] of byTopic) byTopic.set(topic, createRng(seedOf(`qbank:order:${topic}`)).shuffle(list))

rmSync(join(OUT_DIR, 'seed'), { recursive: true, force: true })
mkdirSync(join(OUT_DIR, 'seed'), { recursive: true })

const manifest: SeedManifest = { version: 1, total: 0, topics: {} }
const index: QuestionIndexEntry[] = []
for (const topic of BANK_TOPIC_IDS) {
  const list = byTopic.get(topic)
  if (!list?.length) continue
  writeFileSync(join(OUT_DIR, 'seed', `${topic}.json`), JSON.stringify(list))
  const byDifficulty: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 }
  for (const q of list) byDifficulty[q.difficulty]++
  manifest.topics[topic] = { count: list.length, byDifficulty }
  manifest.total += list.length
  for (const q of list) {
    index.push({ id: q.id, topic: q.topic, difficulty: q.difficulty, examName: q.examName, examType: q.examType, year: q.year, source: q.source, trust: q.trust, preview: previewOf(q.stem) })
  }
}
writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(index))
const sigs = [...byTopic.values()].flat().map((q) => { const s = signatureOf(q.stem); return [q.id, s.n, s.w] })
writeFileSync(join(process.cwd(), 'api', '_lib', 'seedSigs.json'), JSON.stringify(sigs))
writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n')

console.log(`questions: ${manifest.total} across ${Object.keys(manifest.topics).length} topics (${PER_SET} per generator and difficulty)`)
console.log(`quadratic questions the equation reader can match against pasted ones: ${quadKeys}`)
console.log(`duplicates dropped: ${duplicates}; sets skipped (need a table or chart): ${skippedSets}`)
for (const [topic, info] of Object.entries(manifest.topics)) {
  console.log(`  ${topic.padEnd(22)} ${String(info!.count).padStart(4)}  (medium ${info!.byDifficulty.medium}, hard ${info!.byDifficulty.hard})`)
}
