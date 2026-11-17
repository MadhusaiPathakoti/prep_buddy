import type { Attempt } from './attempts'
import { estimateCohort, type CohortEstimate } from './cohort'
import { evaluate, type Scorecard } from './scoring'

export interface Report {
  attempt: Attempt
  sc: Scorecard
  cohort: CohortEstimate
  /** Seconds actually spent answering. */
  usedSec: number
}

export function buildReport(attempt: Attempt): Report {
  const { paper } = attempt
  const sc = evaluate(paper, attempt.responses)
  const cohort = estimateCohort(paper.exam, paper.kind, sc.overall.score, sc.overall.maxScore, sc.overall.total, paper.negativeMarks, paper.totalDurationSec)
  return { attempt, sc, cohort, usedSec: Math.min(paper.totalDurationSec, Math.round(sc.overall.timeMs / 1000)) }
}

export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E']

export function pct(n: number, total: number): number {
  return total > 0 ? (n / total) * 100 : 0
}

/** Human label for the kind of mock, used in titles and file names. */
export function kindLabel(kind: Attempt['paper']['kind']): string {
  return kind === 'full' ? 'Full-length mock' : kind === 'sectional' ? 'Sectional mock' : kind === 'daily' ? 'Daily Dose' : 'Topic-wise mock'
}

export function pdfFileName(attempt: Attempt): string {
  const date = new Date(attempt.finishedAt ?? Date.now()).toISOString().slice(0, 10)
  const slug = attempt.paper.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `prepbuddy-${slug}-${date}.pdf`
}

export function questionPaperFileName(paper: Attempt['paper'], sectionIndex: number): string {
  const slug = (t: string) =>
    t
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  // Sectional and topic titles already name the section; only a full paper needs it added.
  const section = paper.kind === 'full' ? `-${slug(paper.sections[sectionIndex].name)}` : ''
  return `prepbuddy-${slug(paper.title)}${section}-question-paper.pdf`
}

/**
 * True for an attempt created before solutions were written step by step: its saved quant questions keep the
 * explanation text they were generated with, so some solutions are short. Newer papers always carry "Step 1".
 */
export function hasLegacySolutions(paper: Attempt['paper']): boolean {
  return paper.questions.some((q) => q.section === 'quant' && !/(^|\n)Step 1/.test(q.explanation))
}

export const LEGACY_SOLUTIONS_NOTE =
  'This attempt was created before step-by-step solutions were added, so some solutions here are short. Start a new mock (not Re-attempt, which reuses these same questions) to get the full step-by-step solutions and complete data tables.'
