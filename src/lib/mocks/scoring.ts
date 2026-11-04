import { topicLabel } from './topics'
import type { MockPaper, MockQuestion, MockSectionId, MockTopicId } from './types'

export interface QResponse {
  /** Chosen option index, or null when unanswered. */
  selected: number | null
  marked: boolean
  visited: boolean
  /** Total time spent on this question (ms). */
  timeMs: number
}

export type QStatus = 'not-visited' | 'not-answered' | 'answered' | 'marked' | 'answered-marked'

export function emptyResponse(): QResponse {
  return { selected: null, marked: false, visited: false, timeMs: 0 }
}

export function statusOf(r: QResponse | undefined): QStatus {
  if (!r || !r.visited) return 'not-visited'
  if (r.selected !== null) return r.marked ? 'answered-marked' : 'answered'
  return r.marked ? 'marked' : 'not-answered'
}

export type Verdict = 'correct' | 'incorrect' | 'unattempted'

export interface QuestionResult {
  q: MockQuestion
  /** 1-based number across the whole paper. */
  number: number
  sectionIndex: number
  /** 1-based number within its section (what the candidate saw on screen). */
  numberInSection: number
  selected: number | null
  verdict: Verdict
  marked: boolean
  timeMs: number
}

export interface SectionStats {
  id: MockSectionId | 'overall'
  name: string
  total: number
  attempted: number
  correct: number
  incorrect: number
  unattempted: number
  score: number
  maxScore: number
  /** Correct as a percentage of attempted (0 when nothing attempted). */
  accuracy: number
  timeMs: number
}

export interface TopicStats {
  topic: MockTopicId
  label: string
  section: MockSectionId
  total: number
  attempted: number
  correct: number
  incorrect: number
  accuracy: number
  timeMs: number
}

export interface Scorecard {
  sections: SectionStats[]
  overall: SectionStats
  questions: QuestionResult[]
  topics: TopicStats[]
}

function statsFor(id: SectionStats['id'], name: string, rows: QuestionResult[], paper: MockPaper): SectionStats {
  const correct = rows.filter((r) => r.verdict === 'correct').length
  const incorrect = rows.filter((r) => r.verdict === 'incorrect').length
  const attempted = correct + incorrect
  return {
    id,
    name,
    total: rows.length,
    attempted,
    correct,
    incorrect,
    unattempted: rows.length - attempted,
    score: correct * paper.marksPerQuestion - incorrect * paper.negativeMarks,
    maxScore: rows.length * paper.marksPerQuestion,
    accuracy: attempted > 0 ? (correct / attempted) * 100 : 0,
    timeMs: rows.reduce((n, r) => n + r.timeMs, 0),
  }
}

export function evaluate(paper: MockPaper, responses: Record<string, QResponse>): Scorecard {
  const byId = new Map(paper.questions.map((q) => [q.id, q]))
  const questions: QuestionResult[] = []
  let number = 0
  paper.sections.forEach((section, sectionIndex) => {
    section.questionIds.forEach((id, i) => {
      const q = byId.get(id) as MockQuestion
      const r = responses[id] ?? emptyResponse()
      questions.push({
        q,
        number: ++number,
        sectionIndex,
        numberInSection: i + 1,
        selected: r.selected,
        verdict: r.selected === null ? 'unattempted' : r.selected === q.answer ? 'correct' : 'incorrect',
        marked: r.marked,
        timeMs: r.timeMs,
      })
    })
  })

  const sections = paper.sections.map((s, i) =>
    statsFor(
      s.id,
      s.name,
      questions.filter((r) => r.sectionIndex === i),
      paper,
    ),
  )

  const topicMap = new Map<MockTopicId, QuestionResult[]>()
  for (const r of questions) topicMap.set(r.q.topic, [...(topicMap.get(r.q.topic) ?? []), r])
  const topics: TopicStats[] = [...topicMap].map(([topic, rows]) => {
    const s = statsFor('overall', topicLabel(topic), rows, paper)
    return { topic, label: topicLabel(topic), section: rows[0].q.section, total: s.total, attempted: s.attempted, correct: s.correct, incorrect: s.incorrect, accuracy: s.accuracy, timeMs: s.timeMs }
  })

  return { sections, overall: statsFor('overall', 'OVERALL', questions, paper), questions, topics }
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

/** h:mm:ss, as shown in the result report. */
export function formatHms(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

export function formatScore(n: number): string {
  return n.toFixed(2)
}
