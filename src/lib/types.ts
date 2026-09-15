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
  /**
   * The word's own definition, shown alongside `meaning` when `meaning` itself holds a
   * related word rather than a definition (e.g. Synonyms/Antonyms, where `meaning` is the
   * matching synonym/antonym word).
   */
  definition?: string
}

/**
 * A single shared word bank backing both the Synonyms and Antonyms games — one entry per
 * word, carrying every synonym and antonym known for it, so the two games are just two
 * different ways of quizzing the same underlying data (unlike BankEntry's one-answer shape).
 */
export interface WordEntry {
  id: string
  word: string
  /** Abbreviated part of speech (e.g. "v", "n", "adj", "adv"). */
  partOfSpeech: string
  /** The word's own definition. */
  meaning: string
  example: string
  synonyms: string[]
  antonyms: string[]
  difficulty: Difficulty
  /** ISO timestamp of when this entry was added. */
  createdAt: string
}
