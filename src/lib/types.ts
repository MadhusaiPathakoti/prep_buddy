export interface Question {
  id: string
  prompt: string
  answer: number
  /** How the correct answer should be displayed to the user (e.g. "11.11" instead of 11.109999) */
  displayAnswer: string
}

export type CheckResult = 'correct' | 'wrong' | 'incomplete'

export interface SessionRecord {
  date: string
  correct: number
  wrongAttempts: number
  skipped: number
  total: number
  timeMs: number
}
