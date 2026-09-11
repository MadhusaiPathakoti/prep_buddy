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

export type Difficulty = 'easy' | 'medium' | 'hard'

/** A learnable entry for an MCQ "term -> meaning" game (vocabulary word, idiom, etc). */
export interface BankEntry {
  id: string
  term: string
  meaning: string
  difficulty: Difficulty
  hint: string
  example: string
  /** Abbreviated part of speech (e.g. "v", "n", "adj", "adv"), shown after the word. Vocabulary only. */
  partOfSpeech?: string
}
