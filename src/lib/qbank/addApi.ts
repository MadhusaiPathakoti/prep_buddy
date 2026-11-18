import { getIdToken } from '../auth'
import { ACCEPTED_TYPES, toJpegBase64 } from '../puzzleSolver/ocrApi'
import type { ExamType, QuantQuestion, QuestionIndexEntry } from './types'

/** What the person typed into the "add a question" form. */
export interface AddInput {
  stem: string
  options: string[]
  /** The option they say is correct (0-based), or null to let the AI work it out. */
  answer: number | null
  /** Blank means "Unknown". */
  examName: string
  examType: ExamType
  /** Blank means unknown. */
  year: number | null
  /** Set when they have seen the "similar question" warning and want to add it anyway. */
  allowSimilar?: boolean
}

export type AddResult =
  | { kind: 'added'; id: string; entry: QuestionIndexEntry; question: QuantQuestion; listed: boolean }
  /** The same question (any option order) is already in the bank. */
  | { kind: 'duplicate'; id: string }
  /** A question with the same numbers and mostly the same words is already in the bank. */
  | { kind: 'similar'; id: string }
  /** The AI solvers agree on a different answer from the one the person marked. */
  | { kind: 'key-mismatch'; aiAnswer: number; yourAnswer: number }
  /** The question cannot be added (not maths, needs a figure, answer could not be confirmed...). */
  | { kind: 'rejected'; message: string }
  /** Sign-in or email verification is needed. */
  | { kind: 'auth'; code: 'sign-in' | 'verify-email'; message: string }
  /** Temporary trouble: busy solvers, rate limit, network. Worth trying again later. */
  | { kind: 'try-later'; message: string }
  /** Something about the input is wrong. */
  | { kind: 'invalid'; message: string }

/** Adding a question runs two AI solvers, so it can take a while; the server gives up after about 50 seconds. */
const ADD_TIMEOUT_MS = 70_000
const OCR_TIMEOUT_MS = 50_000

/** Where the sign-in token comes from. A parameter only so tests can stand in for Firebase. */
let tokenProvider: () => Promise<string | null> = () => getIdToken()
export function setTokenProviderForTests(provider: () => Promise<string | null>) {
  tokenProvider = provider
}

async function authHeaders(): Promise<Record<string, string> | null> {
  const token = await tokenProvider()
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null
}

async function postJson(action: string, body: unknown, timeoutMs: number): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const headers = await authHeaders()
  if (!headers) return { status: 401, data: { code: 'sign-in', message: 'Please sign in to add a question.' } }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`/api/qb?action=${action}`, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal })
    return { status: res.status, data: (await res.json().catch(() => null)) as Record<string, unknown> | null }
  } catch {
    return { status: 0, data: null }
  } finally {
    clearTimeout(timer)
  }
}

const text = (v: unknown, fallback: string) => (typeof v === 'string' && v ? v : fallback)

/** Sends a question to be checked and published. */
export async function submitQuestion(input: AddInput): Promise<AddResult> {
  const out = await postJson(
    'add',
    {
      stem: input.stem,
      options: input.options,
      answer: input.answer,
      examName: input.examName,
      examType: input.examType,
      year: input.year,
      allowSimilar: input.allowSimilar === true,
    },
    ADD_TIMEOUT_MS,
  )
  if (out.status === 0) return { kind: 'try-later', message: 'Could not reach the server, or it took too long. Check your connection and try again.' }
  const data = out.data ?? {}
  switch (out.status) {
    case 201:
      return { kind: 'added', id: String(data.id), entry: data.entry as QuestionIndexEntry, question: data.question as QuantQuestion, listed: data.listed !== false }
    case 409:
      if (data.code === 'similar') return { kind: 'similar', id: String(data.id) }
      if (data.code === 'key-mismatch') return { kind: 'key-mismatch', aiAnswer: Number(data.aiAnswer), yourAnswer: Number(data.yourAnswer) }
      return { kind: 'duplicate', id: String(data.id) }
    case 400:
      return { kind: 'invalid', message: text(data.message, 'Please check the question and try again.') }
    case 401:
      return { kind: 'auth', code: 'sign-in', message: text(data.message, 'Please sign in to add a question.') }
    case 403:
      return { kind: 'auth', code: 'verify-email', message: text(data.message, 'Verify your email address before adding questions.') }
    case 422:
      return { kind: 'rejected', message: text(data.message, 'This question cannot be added.') }
    case 429:
      return { kind: 'try-later', message: 'You have added several questions in a short time. Please wait a while and try again.' }
    default:
      return { kind: 'try-later', message: text(data.message, 'Something went wrong. Please try again in a few minutes.') }
  }
}

export type ScreenshotResult =
  /** `generated` is true when the picture showed only the question and the options were suggested by AI. `note` explains why none were found. */
  | { ok: true; stem: string; options: string[]; generated: boolean; note: string | null }
  | { ok: false; error: string }

/** Reads a screenshot of a question into text for the person to check. The picture is not stored anywhere. */
export async function readScreenshot(file: Blob): Promise<ScreenshotResult> {
  if (!ACCEPTED_TYPES.includes(file.type)) return { ok: false, error: 'Please use a PNG, JPEG or WebP image.' }
  let image: string
  try {
    image = await toJpegBase64(file)
  } catch {
    return { ok: false, error: 'That image could not be opened.' }
  }
  const out = await postJson('ocr', { image, mime: 'image/jpeg' }, OCR_TIMEOUT_MS)
  if (out.status === 0) return { ok: false, error: 'Could not read the image in time. Try a tighter crop, or type the question.' }
  const data = out.data ?? {}
  if (out.status === 200 && typeof data.stem === 'string') {
    return {
      ok: true,
      stem: data.stem,
      options: Array.isArray(data.options) ? data.options.filter((o): o is string => typeof o === 'string') : [],
      generated: data.generated === true,
      note: typeof data.note === 'string' && data.note ? data.note : null,
    }
  }
  if (out.status === 401) return { ok: false, error: 'Please sign in to read a screenshot.' }
  if (out.status === 429) return { ok: false, error: 'Too many screenshots in a short time. Wait a minute, or type the question.' }
  return { ok: false, error: text(data.error, 'Could not read the image. Type the question instead.') }
}

export type OptionsResult = { ok: true; options: string[] } | { ok: false; error: string }

/** Asks the server to write five answer options (one right, four plausible wrong ones) for a question typed without any. */
export async function suggestOptions(stem: string): Promise<OptionsResult> {
  const out = await postJson('options', { stem }, 45_000)
  if (out.status === 0) return { ok: false, error: 'Could not reach the server in time. Try again, or type the options.' }
  const data = out.data ?? {}
  if (out.status === 200 && Array.isArray(data.options)) return { ok: true, options: data.options.filter((o): o is string => typeof o === 'string') }
  if (out.status === 401) return { ok: false, error: 'Please sign in to get option suggestions.' }
  if (out.status === 429) return { ok: false, error: 'Too many suggestions in a short time. Please wait a while, or type the options.' }
  return { ok: false, error: text(data.message, 'Could not suggest options. Type them yourself.') }
}
