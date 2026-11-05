import { evaluate, type QResponse } from './scoring'
import type { MockExamId, MockKind, MockPaper, MockSectionId } from './types'

// Persistence for the Mocks module. An in-progress attempt is autosaved under one key so a refresh or
// accidental tab close resumes the test (the clock keeps running, as it would in a real exam). Finished
// attempts are stored one-per-key (papers are large) with a small index for the history list; if the
// browser's storage fills up, the oldest finished attempts are dropped first.

const PREFIX = 'prepbuddy:mocks'
const ACTIVE_KEY = `${PREFIX}:active`
const INDEX_KEY = `${PREFIX}:index`
const CANDIDATE_KEY = `${PREFIX}:candidate`
const MAX_FINISHED = 12

export type AttemptPhase = 'instructions' | 'running' | 'finished'

export interface Attempt {
  /** Unique per attempt (a re-attempt of the same paper gets a new id). */
  id: string
  paper: MockPaper
  phase: AttemptPhase
  candidate: string
  responses: Record<string, QResponse>
  currentSection: number
  currentQuestionId: string
  /** Epoch ms the clock started (overall timer). */
  startedAt: number | null
  /** Epoch ms the candidate landed on the current question (for per-question time). */
  enteredAt: number | null
  /** Epoch ms each section's clock started (locked papers only). */
  sectionStartedAt: (number | null)[]
  finishedAt: number | null
  /** Seconds the candidate actually used at submit time. */
  usedSec: number | null
  attemptNo: number
}

export interface AttemptSummary {
  id: string
  title: string
  exam: MockExamId
  kind: MockKind
  finishedAt: number
  score: number
  maxScore: number
  correct: number
  incorrect: number
  unattempted: number
  accuracy: number
  /** Daily Dose attempts only. */
  dateKey?: string
  section?: MockSectionId
  attemptNo?: number
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function getCandidateName(): string {
  try {
    return localStorage.getItem(CANDIDATE_KEY) || 'Candidate'
  } catch {
    return 'Candidate'
  }
}

export function setCandidateName(name: string) {
  try {
    localStorage.setItem(CANDIDATE_KEY, name.trim().slice(0, 40) || 'Candidate')
  } catch {
    // storage unavailable — the name just won't persist
  }
}

export function newAttempt(paper: MockPaper, attemptNo = 1): Attempt {
  const firstId = paper.sections[0].questionIds[0]
  return {
    id: `att-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    paper,
    phase: 'instructions',
    candidate: getCandidateName(),
    responses: {},
    currentSection: 0,
    currentQuestionId: firstId,
    startedAt: null,
    enteredAt: null,
    sectionStartedAt: paper.sections.map(() => null),
    finishedAt: null,
    usedSec: null,
    attemptNo,
  }
}

export function loadActive(): Attempt | null {
  return read<Attempt>(ACTIVE_KEY)
}

export function saveActive(attempt: Attempt) {
  write(ACTIVE_KEY, attempt)
}

export function clearActive() {
  try {
    localStorage.removeItem(ACTIVE_KEY)
  } catch {
    // ignore
  }
}

function readIndex(): AttemptSummary[] {
  const idx = read<AttemptSummary[]>(INDEX_KEY)
  return Array.isArray(idx) ? idx : []
}

export function listFinished(): AttemptSummary[] {
  return readIndex().sort((a, b) => b.finishedAt - a.finishedAt)
}

export function loadFinished(id: string): Attempt | null {
  return read<Attempt>(`${PREFIX}:attempt:${id}`)
}

export function deleteFinished(id: string) {
  try {
    localStorage.removeItem(`${PREFIX}:attempt:${id}`)
  } catch {
    // ignore
  }
  write(INDEX_KEY, readIndex().filter((s) => s.id !== id))
}

/** Looks in-progress first (so a result page can render right after submit), then the finished store. */
export function loadAnyAttempt(id: string): Attempt | null {
  const active = loadActive()
  if (active && active.id === id) return active
  return loadFinished(id)
}

export function summarize(attempt: Attempt): AttemptSummary {
  const sc = evaluate(attempt.paper, attempt.responses)
  return {
    id: attempt.id,
    title: attempt.paper.title,
    exam: attempt.paper.exam,
    kind: attempt.paper.kind,
    finishedAt: attempt.finishedAt ?? Date.now(),
    score: sc.overall.score,
    maxScore: sc.overall.maxScore,
    correct: sc.overall.correct,
    incorrect: sc.overall.incorrect,
    unattempted: sc.overall.unattempted,
    accuracy: sc.overall.accuracy,
    ...(attempt.paper.daily ? { dateKey: attempt.paper.daily.dateKey, section: attempt.paper.daily.section, attemptNo: attempt.attemptNo } : {}),
  }
}

/** Moves a submitted attempt from "active" into the finished store. Returns false only if nothing could be persisted. */
export function saveFinished(attempt: Attempt): boolean {
  const summary = summarize(attempt)
  let index = [summary, ...readIndex().filter((s) => s.id !== attempt.id)].sort((a, b) => b.finishedAt - a.finishedAt)

  // Enforce the cap, then keep dropping the oldest on quota errors.
  while (index.length > MAX_FINISHED) deleteFinished((index.pop() as AttemptSummary).id)
  for (;;) {
    if (write(`${PREFIX}:attempt:${attempt.id}`, attempt)) break
    const oldest = index.filter((s) => s.id !== attempt.id).pop()
    if (!oldest) return false
    index = index.filter((s) => s.id !== oldest.id)
    deleteFinished(oldest.id)
  }
  write(INDEX_KEY, index)
  const active = loadActive()
  if (active && active.id === attempt.id) clearActive()
  return true
}

// ---- Daily Dose attempts. They share the per-attempt key (so the result page can load them like any mock) but keep
// their own index and cap, so a streak of daily practice never pushes full-mock results out of storage.

const DAILY_INDEX_KEY = 'prepbuddy:daily:index'
const MAX_DAILY = 45

function readDailyIndex(): AttemptSummary[] {
  const idx = read<AttemptSummary[]>(DAILY_INDEX_KEY)
  return Array.isArray(idx) ? idx : []
}

export function listDailyFinished(): AttemptSummary[] {
  return readDailyIndex().sort((a, b) => b.finishedAt - a.finishedAt)
}

export function deleteDailyFinished(id: string) {
  try {
    localStorage.removeItem(`${PREFIX}:attempt:${id}`)
  } catch {
    // ignore
  }
  write(DAILY_INDEX_KEY, readDailyIndex().filter((s) => s.id !== id))
}

/** Stores a submitted Daily Dose attempt. Returns false only if nothing could be persisted. */
export function saveFinishedDaily(attempt: Attempt): boolean {
  const summary = summarize(attempt)
  let index = [summary, ...readDailyIndex().filter((s) => s.id !== attempt.id)].sort((a, b) => b.finishedAt - a.finishedAt)
  while (index.length > MAX_DAILY) deleteDailyFinished((index.pop() as AttemptSummary).id)
  for (;;) {
    if (write(`${PREFIX}:attempt:${attempt.id}`, attempt)) break
    const oldest = index.filter((s) => s.id !== attempt.id).pop()
    if (!oldest) return false
    index = index.filter((s) => s.id !== oldest.id)
    deleteDailyFinished(oldest.id)
  }
  write(DAILY_INDEX_KEY, index)
  return true
}
