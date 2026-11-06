// Builds the Daily Dose paper for one section on one day. The paper is a pure function of (section, dateKey):
// the same day always gives the same questions, in the same order, with the same options.
//
// Quant and Reasoning come from the solver-verified mock generators (hard / SBI-PO level) seeded from the date;
// English comes from the curated bank and the word banks (see ./english.ts).

import { ARITHMETIC_POOL, MARKS_PER_QUESTION, NEGATIVE_MARKS } from '../mocks/blueprints'
import { QUANT_GENERATORS } from '../mocks/quant'
import { QUANT_MAINS_GENERATORS } from '../mocks/quant/mains'
import { REASONING_GENERATORS } from '../mocks/reasoning'
import { REASONING_MAINS_GENERATORS } from '../mocks/reasoning/mains'
import { createRng, type Rng } from '../mocks/rng'
import { topicLabel } from '../mocks/topics'
import { assertGroup } from '../mocks/validate'
import type { Group, MockPaper, MockQuestion, MockSection, MockSectionId, MockTopicId, Stimulus, TopicGenerator } from '../mocks/types'
import { buildDailyEnglishGroups, DAILY_ENGLISH_PLAN, hashString } from './english'

/** Bump whenever a daily plan or generator changes the paper for a given date. Cached papers of another version are rebuilt. */
export const DAILY_VERSION = 2

export const DAILY_SECTIONS: { id: MockSectionId; name: string; short: string; icon: string; blurb: string }[] = [
  { id: 'quant', name: 'Quantitative Aptitude', short: 'Quant', icon: '📊', blurb: 'Simplification, approximation, arithmetic, quadratics, number series and a data-interpretation set.' },
  { id: 'reasoning', name: 'Reasoning Ability', short: 'Reasoning', icon: '🧩', blurb: 'A seating arrangement, a puzzle, syllogism, inequality, blood relations, direction and coding.' },
  { id: 'english', name: 'English Language', short: 'English', icon: '📚', blurb: 'Error detection, RC, para jumble, cloze, sentence improvement, vocabulary, idioms, phrasal verbs and one-word substitutes.' },
]

/** Questions in each section's daily paper. */
export function dailyQuestionCount(section: MockSectionId): number {
  const plan = section === 'quant' ? QUANT_PLAN : section === 'reasoning' ? REASONING_PLAN : null
  return plan ? plan.reduce((n, j) => n + j.count, 0) : DAILY_ENGLISH_PLAN.reduce((n, s) => n + s.count, 0)
}

export const sectionInfo = (id: MockSectionId) => DAILY_SECTIONS.find((s) => s.id === id) ?? DAILY_SECTIONS[0]
export const isSectionId = (s: string | undefined): s is MockSectionId => s === 'quant' || s === 'reasoning' || s === 'english'

/** Local calendar date as YYYY-MM-DD (the "day" a student sees on their own clock). */
export function todayKey(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

export function isDateKey(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
}

export function formatDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

interface Job {
  /** Pool the day's topic is drawn from (one topic is picked, or the count is spread across the pool). */
  topics: MockTopicId[]
  count: number
  mode: 'one' | 'spread'
}
const one = (topics: MockTopicId[] | MockTopicId, count: number): Job => ({ topics: Array.isArray(topics) ? topics : [topics], count, mode: 'one' })
const spread = (topics: MockTopicId[], count: number): Job => ({ topics, count, mode: 'spread' })

/** 30 questions at SBI PO Mains level: calculation, equations, series, ten word problems and two DI sets. */
const QUANT_PLAN: Job[] = [
  one('simplification', 3),
  one('approximation', 2),
  one('quadratic-equations', 2),
  one('quantity-comparison', 1),
  one('wrong-number-series', 1),
  one('missing-number-series', 1),
  spread(ARITHMETIC_POOL, 10),
  one(['di-table', 'di-bar'], 5),
  one(['di-pie', 'di-line', 'di-caselet'], 5),
]

/** 30 questions: two arrangement sets plus a puzzle set, then the verbal-logic types, ending with machine / data sufficiency. */
const REASONING_PLAN: Job[] = [
  one(['seating-linear', 'seating-circular'], 5),
  one(['puzzle-floor', 'puzzle-schedule', 'puzzle-box'], 5),
  one(['puzzle-floor', 'puzzle-schedule', 'puzzle-box'], 5),
  one('syllogism', 3),
  one('inequality', 3),
  one('blood-relation', 3),
  one('direction-distance', 2),
  one('order-ranking', 2),
  one('reasoning-misc', 2),
]

function generatorFor(topic: MockTopicId): TopicGenerator {
  const g =
    (QUANT_MAINS_GENERATORS as Record<string, TopicGenerator>)[topic] ??
    (REASONING_MAINS_GENERATORS as Record<string, TopicGenerator>)[topic] ??
    (QUANT_GENERATORS as Record<string, TopicGenerator>)[topic] ??
    (REASONING_GENERATORS as Record<string, TopicGenerator>)[topic]
  if (!g) throw new Error(`No generator for topic: ${topic}`)
  return g
}

const questionKey = (q: { stem: string; options: string[] }) => `${q.stem}|${q.options.join('|')}`.toLowerCase().replace(/\s+/g, ' ').trim()
const stimulusKey = (s: Stimulus | undefined) => (s ? JSON.stringify(s.parts).toLowerCase() : '')

function allocate(rng: Rng, job: Job, used: Set<MockTopicId>): { topic: MockTopicId; count: number }[] {
  if (job.mode === 'one' || job.topics.length === 1) {
    // Two slots drawing from the same pool should not land on the same topic when another is available.
    const fresh = job.topics.filter((t) => !used.has(t))
    const topic = rng.pick(fresh.length ? fresh : job.topics)
    used.add(topic)
    return [{ topic, count: job.count }]
  }
  const order = rng.shuffle(job.topics)
  const counts = new Map<MockTopicId, number>()
  for (let i = 0; i < job.count; i++) counts.set(order[i % order.length], (counts.get(order[i % order.length]) ?? 0) + 1)
  return [...counts].map(([topic, count]) => ({ topic, count }))
}

/** Several generator attempts per slot (the verified generators occasionally reject a draw); the rng stays deterministic. */
function generate(topic: MockTopicId, rng: Rng, count: number, seen: Set<string>): Group[] {
  const gen = generatorFor(topic)
  let lastError: unknown
  let fallback: Group[] | null = null
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const groups = gen(rng, 'hard', count)
      groups.forEach((g, i) => assertGroup(g, `${topic} group ${i + 1}`))
      if (groups.reduce((n, g) => n + g.questions.length, 0) !== count) throw new Error('wrong question count')
      const fresh = groups.every((g) => !seen.has(`s:${stimulusKey(g.stimulus)}`) || !g.stimulus) && groups.every((g) => g.questions.every((q) => !seen.has(questionKey(q))))
      if (fresh) return groups
      fallback = groups
    } catch (e) {
      lastError = e
    }
  }
  if (fallback) return fallback
  throw new Error(`Couldn't generate ${topicLabel(topic)} questions: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

export function dailyPaperId(section: MockSectionId, dateKey: string): string {
  return `daily-${dateKey}-${section}`
}

/** Builds (without any caching) the paper for `section` on `dateKey`. */
export function buildDailyPaper(section: MockSectionId, dateKey: string): MockPaper {
  const groupsInOrder: { topic: MockTopicId; groups: Group[] }[] = []

  if (section === 'english') {
    for (const { slot, groups } of buildDailyEnglishGroups(dateKey)) groupsInOrder.push({ topic: slot.topic, groups })
  } else {
    const rng = createRng(hashString(`daily:${section}:${dateKey}`))
    const seen = new Set<string>()
    const usedTopics = new Set<MockTopicId>()
    for (const job of section === 'quant' ? QUANT_PLAN : REASONING_PLAN) {
      for (const a of allocate(rng, job, usedTopics)) {
        const groups = generate(a.topic, rng, a.count, seen)
        for (const g of groups) {
          if (g.stimulus) seen.add(`s:${stimulusKey(g.stimulus)}`)
          for (const q of g.questions) seen.add(questionKey(q))
        }
        groupsInOrder.push({ topic: a.topic, groups })
      }
    }
  }

  const questions: MockQuestion[] = []
  const sets: Record<string, Stimulus> = {}
  const questionIds: string[] = []
  let qn = 0
  let sn = 0
  for (const { groups } of groupsInOrder) {
    for (const g of groups) {
      assertGroup(g, `daily ${section}`)
      let setId: string | undefined
      if (g.stimulus) {
        setId = `s-${++sn}`
        sets[setId] = g.stimulus
      }
      for (const q of g.questions) {
        const id = `q-${++qn}`
        questions.push({ ...q, id, section, setId })
        questionIds.push(id)
      }
    }
  }

  const info = sectionInfo(section)
  const nominalSec = questions.length * 60
  const sections: MockSection[] = [{ id: section, name: info.name, durationSec: nominalSec, questionIds }]
  return {
    id: dailyPaperId(section, dateKey),
    exam: 'po',
    kind: 'daily',
    title: `Daily Dose · ${info.name} · ${formatDateKey(dateKey)}`,
    difficulty: 'hard',
    createdAt: `${dateKey}T00:00:00.000Z`,
    sectionLocked: false,
    // Daily Dose has no clock; this nominal figure only feeds the result page's benchmark columns.
    totalDurationSec: nominalSec,
    marksPerQuestion: MARKS_PER_QUESTION,
    negativeMarks: NEGATIVE_MARKS,
    sections,
    questions,
    sets,
    daily: { dateKey, section, version: DAILY_VERSION },
  }
}
