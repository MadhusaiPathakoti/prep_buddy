import type { Attempt } from './attempts'
import { emptyResponse, statusOf, type QResponse, type QStatus } from './scoring'

// Pure state transitions for the test runner. Timers are derived from epoch timestamps (never ticking
// counters), so a refresh, a throttled background tab or a long GC pause cannot make the clock drift.

export type TickEvent = 'section-expired' | 'finished' | null

function withResponse(a: Attempt, qid: string, patch: Partial<QResponse>): Attempt {
  const current = a.responses[qid] ?? emptyResponse()
  return { ...a, responses: { ...a.responses, [qid]: { ...current, ...patch } } }
}

/** Adds the time since the candidate landed on the current question to that question's total. */
export function flush(a: Attempt, now: number): Attempt {
  if (a.enteredAt === null || a.phase !== 'running') return { ...a, enteredAt: a.phase === 'running' ? now : a.enteredAt }
  const delta = Math.max(0, now - a.enteredAt)
  const r = a.responses[a.currentQuestionId] ?? emptyResponse()
  return { ...withResponse(a, a.currentQuestionId, { timeMs: r.timeMs + delta, visited: true }), enteredAt: now }
}

export function begin(a: Attempt, now: number): Attempt {
  const starts = a.sectionStartedAt.map((_, i) => (i === 0 ? now : null))
  const started: Attempt = { ...a, phase: 'running', startedAt: now, sectionStartedAt: starts, enteredAt: now }
  return withResponse(started, started.currentQuestionId, { visited: true })
}

export function sectionQuestionIds(a: Attempt, sectionIndex = a.currentSection): string[] {
  return a.paper.sections[sectionIndex].questionIds
}

/** Jump to a question in the current section (locked papers never cross sections). */
export function visit(a: Attempt, qid: string, now: number): Attempt {
  if (!sectionQuestionIds(a).includes(qid)) return a
  const flushed = flush(a, now)
  return withResponse({ ...flushed, currentQuestionId: qid, enteredAt: now }, qid, { visited: true })
}

export function neighbour(a: Attempt, dir: 1 | -1): string | null {
  const ids = sectionQuestionIds(a)
  const i = ids.indexOf(a.currentQuestionId)
  const j = i + dir
  return j >= 0 && j < ids.length ? ids[j] : null
}

export function answer(a: Attempt, qid: string, option: number): Attempt {
  return withResponse(a, qid, { selected: option, visited: true })
}

export function clearAnswer(a: Attempt, qid: string): Attempt {
  return withResponse(a, qid, { selected: null })
}

export function setMarked(a: Attempt, qid: string, marked: boolean): Attempt {
  return withResponse(a, qid, { marked, visited: true })
}

/** Moves on to the next section. `startAt` lets an expiry transition start the next clock exactly at the boundary. */
export function advanceSection(a: Attempt, now: number, startAt: number = now): Attempt {
  const next = a.currentSection + 1
  if (next >= a.paper.sections.length) return a
  const flushed = flush(a, now)
  const firstId = a.paper.sections[next].questionIds[0]
  const starts = flushed.sectionStartedAt.slice()
  starts[next] = startAt
  const moved: Attempt = { ...flushed, currentSection: next, currentQuestionId: firstId, sectionStartedAt: starts, enteredAt: now }
  return withResponse(moved, firstId, { visited: true })
}

export function finish(a: Attempt, now: number): Attempt {
  const flushed = flush(a, now)
  const usedMs = Object.values(flushed.responses).reduce((n, r) => n + r.timeMs, 0)
  return { ...flushed, phase: 'finished', finishedAt: now, enteredAt: null, usedSec: Math.min(a.paper.totalDurationSec, Math.round(usedMs / 1000)) }
}

/** Milliseconds left on the clock that currently governs the candidate (section clock when locked, else overall). */
export function remainingMs(a: Attempt, now: number): number {
  const p = a.paper
  if (p.sectionLocked) {
    const start = a.sectionStartedAt[a.currentSection]
    const dur = p.sections[a.currentSection].durationSec * 1000
    return start === null ? dur : dur - (now - start)
  }
  return p.totalDurationSec * 1000 - (now - (a.startedAt ?? now))
}

/** Whole-test time left (current clock plus the full duration of every later section). */
export function totalRemainingMs(a: Attempt, now: number): number {
  const p = a.paper
  if (!p.sectionLocked) return remainingMs(a, now)
  const later = p.sections.slice(a.currentSection + 1).reduce((n, s) => n + s.durationSec * 1000, 0)
  return remainingMs(a, now) + later
}

/** Applies any clock expiry. Handles a candidate who returns after several sections' worth of time has lapsed. */
export function tick(a: Attempt, now: number): { attempt: Attempt; event: TickEvent } {
  if (a.phase !== 'running') return { attempt: a, event: null }
  let cur = a
  let event: TickEvent = null
  while (remainingMs(cur, now) <= 0) {
    const last = cur.currentSection >= cur.paper.sections.length - 1
    const boundary = cur.paper.sectionLocked
      ? (cur.sectionStartedAt[cur.currentSection] ?? now) + cur.paper.sections[cur.currentSection].durationSec * 1000
      : (cur.startedAt ?? now) + cur.paper.totalDurationSec * 1000
    // Finish at the deadline, not at `now`, so time the candidate was away isn't billed to a question.
    if (!cur.paper.sectionLocked || last) return { attempt: finish(cur, Math.min(now, boundary)), event: 'finished' }
    cur = advanceSection(cur, Math.min(now, boundary), boundary)
    event = 'section-expired'
  }
  return { attempt: cur, event }
}

export interface StatusCounts extends Record<QStatus, number> {
  total: number
}

export function countStatuses(a: Attempt, sectionIndex: number): StatusCounts {
  const counts: StatusCounts = { 'not-visited': 0, 'not-answered': 0, answered: 0, marked: 0, 'answered-marked': 0, total: 0 }
  for (const id of a.paper.sections[sectionIndex].questionIds) {
    counts[statusOf(a.responses[id])] += 1
    counts.total += 1
  }
  return counts
}
