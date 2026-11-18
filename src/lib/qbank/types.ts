import type { Difficulty } from '../types'
import { TOPICS } from '../mocks/topics'
import type { QuantTopicId } from '../mocks/types'

/**
 * The Quant question bank: one global list of multiple-choice questions, each tagged by topic, difficulty,
 * exam name, exam type and year. Data Interpretation is left out on purpose (it needs charts and tables).
 * Questions are plain text: screenshots are read into text and never stored.
 */

export type BankTopicId = Exclude<QuantTopicId, 'di-table' | 'di-bar' | 'di-pie' | 'di-line' | 'di-caselet'> | 'other'

export interface BankTopic {
  id: BankTopicId
  label: string
  blurb: string
}

/** Every Quant topic except Data Interpretation, plus a catch-all for questions that fit none of them. */
export const BANK_TOPICS: BankTopic[] = [
  ...TOPICS.filter((t) => t.section === 'quant' && !t.id.startsWith('di-')).map((t) => ({ id: t.id as BankTopicId, label: t.label, blurb: t.blurb })),
  { id: 'other', label: 'Other / Mixed', blurb: 'Anything that fits none of the topics above' },
]

export const BANK_TOPIC_IDS: BankTopicId[] = BANK_TOPICS.map((t) => t.id)

export function isBankTopic(value: unknown): value is BankTopicId {
  return typeof value === 'string' && (BANK_TOPIC_IDS as string[]).includes(value)
}

export function bankTopicLabel(id: BankTopicId): string {
  return BANK_TOPICS.find((t) => t.id === id)?.label ?? id
}

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

/** PO = probationary officer papers, Clerk = clerk / assistant papers, General = not tied to one exam type. */
export const EXAM_TYPES = ['PO', 'Clerk', 'General'] as const
export type ExamType = (typeof EXAM_TYPES)[number]

/** What the system fills in when the person adding a question leaves these tags blank. */
export const DEFAULT_EXAM_NAME = 'Unknown'
export const DEFAULT_EXAM_TYPE: ExamType = 'General'
/** A missing year is stored as null and shown as "Unknown". */
export const DEFAULT_YEAR = null

/** The exam name used for questions the app generated itself (they are practice questions, not past papers). */
export const GENERATED_EXAM_NAME = 'Practice (generated)'

/** Suggestions for the exam-name box; people may still type their own. */
export const EXAM_NAME_SUGGESTIONS = ['SBI PO', 'IBPS PO', 'RBI Assistant', 'SBI Clerk', 'IBPS Clerk', 'RRB Officer Scale-I', 'RRB Office Assistant']

export const MIN_EXAM_YEAR = 2000
export const MAX_EXAM_YEAR = 2100

/** 'generated' = built by the app's own Quant generators; 'user' = added by a signed-in person. */
export type QuestionSource = 'generated' | 'user'

/**
 * How far the answer key can be trusted:
 * - proven: produced by a generator that cross-checks its own key with a second method.
 * - ai-agreed: two different AI models solved it independently and agreed with each other (and with the key, if one was given).
 * - unverified: the models could not both be reached or did not agree; shown with a warning.
 */
export type QuestionTrust = 'proven' | 'ai-agreed' | 'unverified'

export interface QuantQuestion {
  /** `q-` plus a fingerprint of the normalised text, so the same question can never be stored twice. */
  id: string
  stem: string
  /** 4 or 5 options (A to D / A to E). */
  options: string[]
  /** 0-based index of the one correct option. */
  answer: number
  /** Step-by-step working, one step per line. Shown straight away after every answer, right or wrong. */
  solution: string
  /** A quick exam shortcut for this question; when null the topic's standard tips are shown instead. */
  shortcut: string | null
  topic: BankTopicId
  difficulty: Difficulty
  examName: string
  examType: ExamType
  year: number | null
  source: QuestionSource
  trust: QuestionTrust
  /** ISO timestamp. */
  createdAt: string
  /** Firebase user id of whoever added it; null for generated questions. */
  addedBy: string | null
}

/** Where the generated questions are served from (one file per topic, built by `npm run build:qbank`). */
export const SEED_BASE_URL = '/qbank/seed'
export const SEED_MANIFEST_URL = '/qbank/manifest.json'

export interface SeedManifest {
  version: number
  total: number
  topics: Partial<Record<BankTopicId, { count: number; byDifficulty: Record<Difficulty, number> }>>
}
