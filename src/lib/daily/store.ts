import { getCandidateName, listDailyFinished, saveFinishedDaily, type Attempt, type AttemptSummary } from '../mocks/attempts'
import type { QResponse } from '../mocks/scoring'
import type { MockPaper, MockSectionId } from '../mocks/types'
import { buildDailyPaper, DAILY_VERSION } from './compose'

// Persistence for the Daily Dose. The day's paper is cached the first time it is opened so the same paper comes
// back however many times (or from whichever screen) the student returns; an in-progress quiz is autosaved so a
// refresh resumes where they were. Finished attempts live in the shared attempt store (see attempts.ts).

const PAPER_KEY = (dateKey: string, section: MockSectionId) => `prepbuddy:daily:paper:${dateKey}:${section}`
const PROGRESS_KEY = (dateKey: string, section: MockSectionId) => `prepbuddy:daily:progress:${dateKey}:${section}`
const KEY_PREFIXES = ['prepbuddy:daily:paper:', 'prepbuddy:daily:progress:']
const KEEP_DAYS = 7

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

function remove(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

/** Drops cached papers and unfinished quizzes for days older than a week. */
function pruneOld(dateKey: string) {
  try {
    const cutoff = new Date(`${dateKey}T00:00:00Z`)
    cutoff.setUTCDate(cutoff.getUTCDate() - KEEP_DAYS)
    const min = cutoff.toISOString().slice(0, 10)
    const stale: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      const prefix = key && KEY_PREFIXES.find((p) => key.startsWith(p))
      if (key && prefix && key.slice(prefix.length, prefix.length + 10) < min) stale.push(key)
    }
    stale.forEach(remove)
  } catch {
    // ignore
  }
}

function looksLikePaper(p: MockPaper | null, section: MockSectionId, dateKey: string): p is MockPaper {
  return !!p && p.daily?.dateKey === dateKey && p.daily.section === section && p.daily.version === DAILY_VERSION && Array.isArray(p.questions) && p.questions.length > 0 && Array.isArray(p.sections) && p.sections.length === 1
}

/** The one paper for this section and day: cached after the first build, so it never changes under the student. */
export function getDailyPaper(section: MockSectionId, dateKey: string): MockPaper {
  const cached = read<MockPaper>(PAPER_KEY(dateKey, section))
  if (looksLikePaper(cached, section, dateKey)) return cached
  const paper = buildDailyPaper(section, dateKey)
  write(PAPER_KEY(dateKey, section), paper)
  pruneOld(dateKey)
  return paper
}

// ---- In-progress quiz

export interface DailyProgress {
  v: 1
  /** Version of the paper this quiz belongs to; a quiz on a rebuilt paper is discarded. */
  paperVersion?: number
  dateKey: string
  section: MockSectionId
  attemptNo: number
  startedAt: number
  currentId: string
  responses: Record<string, QResponse>
  /** Stopwatch reading (ms) when the quiz was last saved. */
  elapsedMs?: number
}

export function loadProgress(section: MockSectionId, dateKey: string): DailyProgress | null {
  const p = read<DailyProgress>(PROGRESS_KEY(dateKey, section))
  return p && p.v === 1 && p.paperVersion === DAILY_VERSION && p.dateKey === dateKey && p.section === section && p.responses && typeof p.currentId === 'string' ? p : null
}

export function saveProgress(p: DailyProgress) {
  write(PROGRESS_KEY(p.dateKey, p.section), p)
}

export function clearProgress(section: MockSectionId, dateKey: string) {
  remove(PROGRESS_KEY(dateKey, section))
}

// ---- Status

export function attemptsFor(section: MockSectionId, dateKey: string): AttemptSummary[] {
  return listDailyFinished().filter((a) => a.section === section && a.dateKey === dateKey)
}

export interface DailyStatus {
  /** Newest first. */
  attempts: AttemptSummary[]
  last: AttemptSummary | null
  best: AttemptSummary | null
  inProgress: boolean
}

export function dailyStatus(section: MockSectionId, dateKey: string): DailyStatus {
  const attempts = attemptsFor(section, dateKey)
  const best = attempts.reduce<AttemptSummary | null>((b, a) => (!b || a.score > b.score ? a : b), null)
  return { attempts, last: attempts[0] ?? null, best, inProgress: loadProgress(section, dateKey) !== null }
}

export function nextAttemptNo(section: MockSectionId, dateKey: string): number {
  return attemptsFor(section, dateKey).reduce((n, a) => Math.max(n, a.attemptNo ?? 0), 0) + 1
}

export function startProgress(paper: MockPaper, section: MockSectionId, dateKey: string): DailyProgress {
  const p: DailyProgress = {
    v: 1,
    paperVersion: DAILY_VERSION,
    dateKey,
    section,
    attemptNo: nextAttemptNo(section, dateKey),
    startedAt: Date.now(),
    currentId: paper.sections[0].questionIds[0],
    responses: {},
  }
  saveProgress(p)
  return p
}

/** Turns a quiz into a finished attempt (readable by the mock result page), stores it and clears the progress. */
export function finishDaily(paper: MockPaper, p: DailyProgress): Attempt | null {
  const now = Date.now()
  const attempt: Attempt = {
    id: `att-${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    paper,
    phase: 'finished',
    candidate: getCandidateName(),
    responses: p.responses,
    currentSection: 0,
    currentQuestionId: p.currentId,
    startedAt: p.startedAt,
    enteredAt: null,
    sectionStartedAt: [null],
    finishedAt: now,
    usedSec: Math.round(Object.values(p.responses).reduce((n, r) => n + r.timeMs, 0) / 1000),
    attemptNo: p.attemptNo,
  }
  if (!saveFinishedDaily(attempt)) return null
  clearProgress(p.section, p.dateKey)
  return attempt
}
