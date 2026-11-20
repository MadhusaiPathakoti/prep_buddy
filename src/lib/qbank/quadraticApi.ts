import { postJson } from './addApi'
import type { ExamType, QuantQuestion, QuestionIndexEntry } from './types'

/** What the person pasted into the quadratic bank form: just the two equations, plus the optional tags. */
export interface QuadraticInput {
  /** "I. …\nII. …" */
  text: string
  /** Blank means "Unknown". */
  examName: string
  examType: ExamType
  year: number | null
}

export type QuadraticResult =
  | { kind: 'added'; id: string; entry: QuestionIndexEntry; question: QuantQuestion; listed: boolean }
  /** The same pair of equations (typed any way) is already in the bank; `id` is the question that has it. */
  | { kind: 'duplicate'; id: string }
  /** The server's exact solver could not read or solve the equations. */
  | { kind: 'unsolvable'; message: string }
  | { kind: 'auth'; code: 'sign-in' | 'verify-email'; message: string }
  | { kind: 'try-later'; message: string }
  | { kind: 'invalid'; message: string }

const text = (v: unknown, fallback: string) => (typeof v === 'string' && v ? v : fallback)

/** Sends two equations to be solved, checked for duplicates and saved. The server works the answer out itself. */
export async function submitQuadratic(input: QuadraticInput): Promise<QuadraticResult> {
  const out = await postJson('addquad', { text: input.text, examName: input.examName, examType: input.examType, year: input.year }, 25_000)
  if (out.status === 0) return { kind: 'try-later', message: 'Could not reach the server, or it took too long. Check your connection and try again.' }
  const data = out.data ?? {}
  switch (out.status) {
    case 201:
      return { kind: 'added', id: String(data.id), entry: data.entry as QuestionIndexEntry, question: data.question as QuantQuestion, listed: data.listed !== false }
    case 409:
      return { kind: 'duplicate', id: String(data.id) }
    case 400:
      return { kind: 'invalid', message: text(data.message, 'Please check the equations and try again.') }
    case 401:
      return { kind: 'auth', code: 'sign-in', message: text(data.message, 'Please sign in to add a question.') }
    case 403:
      return { kind: 'auth', code: 'verify-email', message: text(data.message, 'Verify your email address before adding questions.') }
    case 422:
      return { kind: 'unsolvable', message: text(data.message, 'These equations could not be solved.') }
    case 429:
      return { kind: 'try-later', message: 'You have added several questions in a short time. Please wait a while and try again.' }
    default:
      return { kind: 'try-later', message: text(data.message, 'Something went wrong. Please try again in a few minutes.') }
  }
}
