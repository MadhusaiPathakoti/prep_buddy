import { shuffle } from './generators'
import type { SentenceImprovementRaw } from './sentenceImprovementApi'

export const NO_CORRECTION = 'No correction required'

export interface SentenceImprovementQuestion {
  id: string
  topic: string
  before: string
  target: string
  after: string
  /** The 4 replacements (shuffled) followed by the fixed "No correction required". */
  options: string[]
  correctOption: string
  /** True when the original underlined part really is wrong; false when "No correction required" is the answer. */
  hasError: boolean
  /** The full sentence as it should read. */
  correctedSentence: string
  explanation: string
  timeLimitSec: number
}

const STARTS_WITH_CLOSING_PUNCTUATION = /^[.,;:!?)\]”’]/
const ENDS_WITH_OPENING_PUNCTUATION = /[([“‘]$/

/**
 * The text to put before and after the underlined part, with spacing normalised: Gemini's own
 * spacing around the underlined part isn't reliable, and a replacement can change where spaces
 * belong. One space between words; none before closing punctuation or after an opening quote.
 */
export function sentenceFrame(before: string, after: string, middle = ''): { lead: string; trail: string } {
  const b = before.trim()
  const a = after.trim()
  const attachesToPrevious = STARTS_WITH_CLOSING_PUNCTUATION.test(middle.trim())
  return {
    lead: b === '' ? '' : attachesToPrevious || ENDS_WITH_OPENING_PUNCTUATION.test(b) ? b : `${b} `,
    trail: a === '' ? '' : STARTS_WITH_CLOSING_PUNCTUATION.test(a) ? a : ` ${a}`,
  }
}

/** The full sentence with `middle` in place of the underlined part. */
export function composeSentence(before: string, middle: string, after: string): string {
  const { lead, trail } = sentenceFrame(before, after, middle)
  return `${lead}${middle.trim()}${trail}`
}

function buildQuestion(raw: SentenceImprovementRaw, timeLimitSec: number, index: number): SentenceImprovementQuestion {
  const correctReplacement = raw.correctIndex === null ? null : raw.options[raw.correctIndex]
  return {
    id: `sentence-improvement-${index}-${Math.random().toString(36).slice(2, 8)}`,
    topic: raw.topic,
    before: raw.before,
    target: raw.target,
    after: raw.after,
    // Gemini's option order is arbitrary, so shuffle to keep the answer's position unpredictable;
    // "No correction required" stays last, as in the exam format.
    options: [...shuffle(raw.options), NO_CORRECTION],
    correctOption: correctReplacement ?? NO_CORRECTION,
    hasError: correctReplacement !== null,
    correctedSentence: composeSentence(raw.before, correctReplacement ?? raw.target, raw.after),
    explanation: raw.explanation,
    timeLimitSec,
  }
}

export function buildSentenceImprovementQuestions(raws: SentenceImprovementRaw[], timeLimitSec: number): SentenceImprovementQuestion[] {
  return raws.map((raw, index) => buildQuestion(raw, timeLimitSec, index))
}
