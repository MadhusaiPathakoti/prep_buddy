import type { ClozeRawBlank, ClozeRawPassage } from './clozeTestApi'

export interface ClozeQuestion {
  id: string
  topic: string
  /** Text chunks between blanks, in order — length is always blanks.length + 1. */
  textSegments: string[]
  blanks: ClozeRawBlank[]
  /** Which blank index (into `blanks`) this question is testing. */
  activeBlankIndex: number
  timeLimitSec: number
}

export type ClozeToken = { kind: 'text'; text: string } | { kind: 'blank'; text: string; state: 'active' | 'answered' | 'upcoming' }

function parseParagraph(paragraph: string, blankCount: number): string[] | null {
  const segments = paragraph.split(/\{\{\d+\}\}/)
  return segments.length === blankCount + 1 ? segments : null
}

function buildQuestionsForPassage(raw: ClozeRawPassage, timeLimitSec: number, passageIndex: number): ClozeQuestion[] {
  const textSegments = parseParagraph(raw.paragraph, raw.blanks.length)
  if (!textSegments) return []
  return raw.blanks.map((_, activeBlankIndex) => ({
    id: `cloze-${passageIndex}-${activeBlankIndex}-${Math.random().toString(36).slice(2, 8)}`,
    topic: raw.topic,
    textSegments,
    blanks: raw.blanks,
    activeBlankIndex,
    timeLimitSec,
  }))
}

export function buildClozeTestQuestions(passages: ClozeRawPassage[], timeLimitSec: number, totalCount: number): ClozeQuestion[] {
  const all = passages.flatMap((raw, i) => buildQuestionsForPassage(raw, timeLimitSec, i))
  return all.slice(0, totalCount)
}

/**
 * Breaks a question's passage into displayable tokens: plain text, and each blank. Only blanks
 * already passed (earlier than the active one) reveal their correct word — the active blank is
 * masked, and every blank still ahead stays masked too, so later answers are never spoiled.
 */
export function tokenizePassage(question: ClozeQuestion): ClozeToken[] {
  const tokens: ClozeToken[] = []
  question.blanks.forEach((blank, i) => {
    if (question.textSegments[i]) tokens.push({ kind: 'text', text: question.textSegments[i] })
    if (i < question.activeBlankIndex) {
      tokens.push({ kind: 'blank', text: blank.options[blank.correctIndex], state: 'answered' })
    } else if (i === question.activeBlankIndex) {
      tokens.push({ kind: 'blank', text: '_____', state: 'active' })
    } else {
      tokens.push({ kind: 'blank', text: '_____', state: 'upcoming' })
    }
  })
  const last = question.textSegments[question.textSegments.length - 1]
  if (last) tokens.push({ kind: 'text', text: last })
  return tokens
}

/** A short one-line window of text immediately around the active blank, for compact display in the review list. */
export function localBlankContext(question: ClozeQuestion, maxChars = 55): string {
  const before = question.textSegments[question.activeBlankIndex] ?? ''
  const after = question.textSegments[question.activeBlankIndex + 1] ?? ''
  const beforeTrimmed = before.length > maxChars ? `…${before.slice(-maxChars)}` : before
  const afterTrimmed = after.length > maxChars ? `${after.slice(0, maxChars)}…` : after
  return `${beforeTrimmed.trim()} _____ ${afterTrimmed.trim()}`
}
