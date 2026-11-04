import { EXAMS, MARKS_PER_QUESTION, NEGATIVE_MARKS, SECTION_NAMES, entryTotal, type BlueprintEntry, type SectionBlueprint } from './blueprints'
import { createRng, randomSeed, type Rng } from './rng'
import { assertGroup } from './validate'
import { TOPIC_BY_ID, topicLabel } from './topics'
import { QUANT_GENERATORS } from './quant'
import { REASONING_GENERATORS } from './reasoning'
import { fetchEnglishGroups } from './english'
import type {
  EnglishTopicId,
  Group,
  MockExamId,
  MockKind,
  MockPaper,
  MockQuestion,
  MockSection,
  MockDifficulty,
  MockSectionId,
  MockTopicId,
  Stimulus,
  TopicGenerator,
} from './types'

export interface ComposeRequest {
  exam: MockExamId
  kind: MockKind
  /** Required for 'sectional' and 'topic'. */
  section?: MockSectionId
  /** Required for 'topic'. */
  topic?: MockTopicId
  /** 'topic' only. */
  questionCount?: number
  /** 'topic' only: seconds allowed per question. */
  secPerQuestion?: number
}

export interface ComposeOptions {
  signal?: AbortSignal
  onProgress?: (p: { done: number; total: number; label: string }) => void
}

const MAX_SYNC_ATTEMPTS = 12

function generatorFor(topic: MockTopicId): TopicGenerator | null {
  return (QUANT_GENERATORS as Record<string, TopicGenerator>)[topic] ?? (REASONING_GENERATORS as Record<string, TopicGenerator>)[topic] ?? null
}

/**
 * A signature used to keep the same question (or the same set) from appearing twice in one paper.
 * It covers the options as well as the stem, because generic stems ("Which of the following
 * statements is true?") legitimately repeat across different puzzles and passages.
 */
function questionKey(q: { stem: string; options: string[] }): string {
  return `${q.stem}|${q.options.join('|')}`.toLowerCase().replace(/\s+/g, ' ').trim()
}

function stimulusKey(s: Stimulus | undefined): string {
  return s ? JSON.stringify(s.parts).toLowerCase() : ''
}

/** Splits `count` across the entry's topic pool. */
function allocate(rng: Rng, entry: BlueprintEntry): { topic: MockTopicId; count: number }[] {
  if (entry.mode === 'one' || entry.topics.length === 1) return [{ topic: rng.pick(entry.topics), count: entry.count }]
  const order = rng.shuffle(entry.topics)
  const counts = new Map<MockTopicId, number>()
  for (let i = 0; i < entry.count; i++) {
    const t = order[i % order.length]
    counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  return [...counts].map(([topic, count]) => ({ topic, count }))
}

function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Paper preparation cancelled', 'AbortError')
}

interface Seen {
  stems: Set<string>
  stimuli: Set<string>
}

function isFresh(groups: Group[], seen: Seen): boolean {
  for (const g of groups) {
    const sk = stimulusKey(g.stimulus)
    if (sk && seen.stimuli.has(sk)) return false
    for (const q of g.questions) if (seen.stems.has(questionKey(q))) return false
  }
  return true
}

function remember(groups: Group[], seen: Seen) {
  for (const g of groups) {
    const sk = stimulusKey(g.stimulus)
    if (sk) seen.stimuli.add(sk)
    for (const q of g.questions) seen.stems.add(questionKey(q))
  }
}

async function produce(topic: MockTopicId, rng: Rng, difficulty: MockDifficulty, count: number, seen: Seen, opts: ComposeOptions): Promise<Group[]> {
  const info = TOPIC_BY_ID[topic]
  if (!info) throw new Error(`Unknown topic: ${topic}`)

  if (info.section === 'english') {
    for (let attempt = 0; attempt < 3; attempt++) {
      checkAborted(opts.signal)
      const groups = await fetchEnglishGroups(topic as EnglishTopicId, difficulty, count, { signal: opts.signal })
      groups.forEach((g, i) => assertGroup(g, `${topic} group ${i + 1}`))
      if (groups.reduce((n, g) => n + g.questions.length, 0) !== count) throw new Error(`${topicLabel(topic)}: wrong question count`)
      if (isFresh(groups, seen)) return groups
    }
    throw new Error(`Couldn't prepare enough distinct ${topicLabel(topic)} questions — please try again.`)
  }

  const gen = generatorFor(topic)
  if (!gen) throw new Error(`No generator for topic: ${topic}`)
  let lastError: unknown
  let fallback: Group[] | null = null
  for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt++) {
    checkAborted(opts.signal)
    try {
      const groups = gen(rng, difficulty, count)
      groups.forEach((g, i) => assertGroup(g, `${topic} group ${i + 1}`))
      if (groups.reduce((n, g) => n + g.questions.length, 0) !== count) throw new Error('wrong question count')
      if (isFresh(groups, seen)) return groups
      fallback = groups
    } catch (e) {
      lastError = e
    }
  }
  // A pool so small that every draw collides is better served by a repeat than by failing the paper.
  if (fallback) return fallback
  throw new Error(`Couldn't generate ${topicLabel(topic)} questions: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

function makeId(): string {
  return `mock-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
}

/** Builds a complete paper. Quant/Reasoning questions are generated and solver-verified locally; English comes through the verified Gemini pipeline. */
export async function composePaper(req: ComposeRequest, opts: ComposeOptions = {}): Promise<MockPaper> {
  const exam = EXAMS[req.exam]
  const difficulty = exam.difficulty
  const rng = createRng(randomSeed())
  const seen: Seen = { stems: new Set(), stimuli: new Set() }

  // 1. Work out what to generate, as an ordered list of (section, topic, count) jobs.
  interface Job {
    sectionId: MockSectionId
    topic: MockTopicId
    count: number
  }
  const jobs: Job[] = []
  const sectionDefs: { id: MockSectionId; name: string; durationSec: number }[] = []

  const addSectionBlueprint = (sb: SectionBlueprint) => {
    sectionDefs.push({ id: sb.id, name: sb.name, durationSec: sb.durationSec })
    for (const entry of sb.entries) for (const a of allocate(rng, entry)) jobs.push({ sectionId: sb.id, ...a })
  }

  let title: string
  let sectionLocked = false
  if (req.kind === 'full') {
    exam.sections.forEach(addSectionBlueprint)
    sectionLocked = true
    title = `${exam.name} — Full Mock`
  } else if (req.kind === 'sectional') {
    const sb = exam.sections.find((s) => s.id === req.section)
    if (!sb) throw new Error('Pick a section for the sectional mock.')
    addSectionBlueprint(sb)
    title = `${exam.name} — ${sb.name}`
  } else {
    const topic = req.topic
    if (!topic || !TOPIC_BY_ID[topic]) throw new Error('Pick a topic.')
    const n = Math.round(req.questionCount ?? 10)
    const secPerQ = Math.round(req.secPerQuestion ?? 45)
    if (n < 1 || secPerQ < 1) throw new Error('Invalid topic test settings.')
    const sectionId = TOPIC_BY_ID[topic].section
    sectionDefs.push({ id: sectionId, name: SECTION_NAMES[req.exam][sectionId], durationSec: n * secPerQ })
    jobs.push({ sectionId, topic, count: n })
    title = `${exam.name} — ${topicLabel(topic)} (${n} Qs)`
  }

  const total = jobs.reduce((n, j) => n + j.count, 0)
  let done = 0
  const report = (label: string, delta: number) => {
    done += delta
    opts.onProgress?.({ done, total, label })
  }
  opts.onProgress?.({ done: 0, total, label: 'Preparing your paper…' })

  // 2. Quant/Reasoning are instant; English calls the network, so run those jobs a couple at a time.
  const results: Group[][] = new Array(jobs.length)
  const allIdx = jobs.map((_, i) => i)
  const syncIdx = allIdx.filter((i) => TOPIC_BY_ID[jobs[i].topic].section !== 'english')
  const engIdx = allIdx.filter((i) => TOPIC_BY_ID[jobs[i].topic].section === 'english')

  for (const i of syncIdx) {
    results[i] = await produce(jobs[i].topic, rng, difficulty, jobs[i].count, seen, opts)
    remember(results[i], seen)
    report(topicLabel(jobs[i].topic), jobs[i].count)
  }
  let next = 0
  const worker = async () => {
    while (next < engIdx.length) {
      const i = engIdx[next++]
      // `seen` is only read/updated between awaits, so concurrent English jobs can't corrupt it.
      results[i] = await produce(jobs[i].topic, rng, difficulty, jobs[i].count, seen, opts)
      remember(results[i], seen)
      report(topicLabel(jobs[i].topic), jobs[i].count)
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, engIdx.length) }, worker))

  // 3. Assemble in blueprint order, assigning ids.
  const questions: MockQuestion[] = []
  const sets: Record<string, Stimulus> = {}
  const sections: MockSection[] = sectionDefs.map((d) => ({ ...d, questionIds: [] }))
  let qn = 0
  let sn = 0
  jobs.forEach((job, idx) => {
    const section = sections.find((s) => s.id === job.sectionId) as MockSection
    for (const g of results[idx]) {
      let setId: string | undefined
      if (g.stimulus) {
        setId = `s-${++sn}`
        sets[setId] = g.stimulus
      }
      for (const q of g.questions) {
        const id = `q-${++qn}`
        questions.push({ ...q, id, section: job.sectionId, setId })
        section.questionIds.push(id)
      }
    }
  })

  const totalDurationSec = sections.reduce((n, s) => n + s.durationSec, 0)
  const expected = req.kind === 'full' ? exam.sections.reduce((n, s) => n + entryTotal(s.entries), 0) : total
  if (questions.length !== expected) throw new Error(`Paper has ${questions.length} questions, expected ${expected}.`)

  return {
    id: makeId(),
    exam: req.exam,
    kind: req.kind,
    title,
    difficulty,
    createdAt: new Date().toISOString(),
    sectionLocked,
    totalDurationSec,
    marksPerQuestion: MARKS_PER_QUESTION,
    negativeMarks: NEGATIVE_MARKS,
    sections,
    questions,
    sets,
  }
}
