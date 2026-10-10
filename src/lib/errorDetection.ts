import type { ErrorDetectionRawQuestion } from './errorDetectionApi'

export const NO_ERROR = 'no-error'
export type ErrorDetectionAnswer = 0 | 1 | 2 | 3 | typeof NO_ERROR

export interface ErrorDetectionQuestion {
  id: string
  topic: string
  parts: string[]
  correctAnswer: ErrorDetectionAnswer
  explanation: string
  timeLimitSec: number
}

function buildQuestion(raw: ErrorDetectionRawQuestion, timeLimitSec: number, index: number): ErrorDetectionQuestion {
  return {
    id: `error-detection-${index}-${Math.random().toString(36).slice(2, 8)}`,
    topic: raw.topic,
    parts: raw.parts,
    correctAnswer: raw.errorPartIndex === null ? NO_ERROR : (raw.errorPartIndex as ErrorDetectionAnswer),
    explanation: raw.explanation,
    timeLimitSec,
  }
}

export function buildErrorDetectionQuestions(raws: ErrorDetectionRawQuestion[], timeLimitSec: number): ErrorDetectionQuestion[] {
  return raws.map((raw, index) => buildQuestion(raw, timeLimitSec, index))
}
