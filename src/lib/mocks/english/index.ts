// English question pipeline for the Mocks module.
//
// fetchEnglishGroups() asks api/mockEnglish.js (Gemini) to WRITE questions, then refuses to hand back any
// question that has not passed every gate:
//   1. server-side build/validation (api/mockEnglish.js builds options, keys, shuffles, A-D labels in code)
//   2. client-side deterministic checks (checkEnglishGroup below: stem/option format per topic, passage and
//      cloze integrity, character set, placeholder text, near-duplicates)
//   3. an independent BLIND SOLVE by a different model (no key or explanation sent): the question survives only
//      if the solver's answer equals the key AND the solver did not flag it ambiguous.
// It keeps generating (up to ENGLISH_TUNING.maxRounds rounds) until exactly `count` verified questions exist,
// otherwise it throws. It never returns an unverified question and never silently returns fewer than `count`.

import type { EnglishTopicId, Group, MockDifficulty, QuestionDraft } from '../types'
import { validateDraft } from '../validate'

export interface FetchEnglishOptions {
  signal?: AbortSignal
  /** Called with the number of verified questions collected so far (never above `count`). */
  onProgress?: (questionsReady: number) => void
}

/** Short per-topic descriptions for UI use. */
export const ENGLISH_TOPIC_NOTES: Record<EnglishTopicId, string> = {
  rc: 'One passage with 5-10 questions: main idea, inference, true/not true, tone and vocabulary in context.',
  cloze: 'One passage with numbered blanks and five word options each.',
  'error-detection': 'Find the part of the sentence that has the grammatical error, or choose "No error".',
  'para-jumble': 'Rearrange shuffled sentences into a coherent paragraph (or find the first/last/nth sentence).',
  fillers: 'Single and double blank sentences with five word or word-pair options.',
  'word-swap': 'Interchange two marked words to repair the sentence, or choose "No interchange required".',
  'phrase-replacement': 'Replace the highlighted phrase, or fill in the right phrase; "No correction required" is an option.',
  'match-column': 'Match sentence beginnings with their endings.',
}

/** Mutable so the harness can speed up retries; production code leaves it alone. */
export const ENGLISH_TUNING = {
  maxRounds: 3,
  concurrency: 3,
  /** Extra attempts per API call after the first (network error, timeout, 429, 5xx). */
  retries: 2,
  retryDelayMs: 800,
  /** Must stay above the server's worst case (two sequential 12 s Gemini calls) but below maxDuration 30 s. */
  requestTimeoutMs: 28000,
  /** Stop starting new rounds after this long. */
  deadlineMs: 150000,
  solveBatchSize: 12,
  /** A cloze blank that fails verification is filled in with its keyed word (kept out of the questions) instead of
   *  sinking the whole passage; the passage still needs at least `clozeMinBlanks` verified blanks. */
  clozeFillFailedBlanks: true,
  clozeMinBlanks: 3,
}

const GENERIC_ERROR = "Couldn't prepare enough English questions — check your connection and try again."
const UNAVAILABLE_ERROR = "English questions aren't available right now (the question service isn't reachable or isn't set up)."

// ---------------------------------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------------------------------

function abortError(): Error {
  const e = new Error('Cancelled')
  e.name = 'AbortError'
  return e
}
function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError()
}
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

const normKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9À-ÿ]+/g, ' ')
    .trim()
function jaccard(a: string, b: string): number {
  const sa = new Set(normKey(a).split(' '))
  const sb = new Set(normKey(b).split(' '))
  let inter = 0
  for (const x of sa) if (sb.has(x)) inter++
  const union = sa.size + sb.size - inter
  return union === 0 ? 0 : inter / union
}
const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0)
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const countQuestions = (gs: Group[]) => gs.reduce((n, g) => n + g.questions.length, 0)

const ALLOWED_TEXT = /^[\n\x20-\x7e\xa1-\xff−√≤≥≠₹→∴‘’“”–—•]*$/
const HYGIENE =
  /```|`|\*|<\/?[a-z][^>]*>|as an ai\b|language model|\bTODO\b|\bTBD\b|lorem ipsum|\[\s*(?:insert|blank|placeholder|option|passage|your)|\{\{|\}\}|\bundefined\b|\bNaN\b|\[object/i

function textProblem(s: unknown, allowBlank = false): string | null {
  if (typeof s !== 'string' || !s.trim()) return 'empty text'
  if (!ALLOWED_TEXT.test(s)) return 'unsupported character'
  if (HYGIENE.test(s)) return 'placeholder or markdown text'
  if (!allowBlank && /_{2,}/.test(s)) return 'stray blank marker'
  return null
}

// ---------------------------------------------------------------------------------------------------
// Deterministic checks
// ---------------------------------------------------------------------------------------------------

const ED_OPTIONS = ['(a)', '(b)', '(c)', '(d)', 'No error']
const NO_INTERCHANGE = 'No interchange required'
const NO_CORRECTION = 'No correction required'
const VOCAB_STEM = /^Which of the following words is most (?:similar|opposite) in meaning to the word “([^”]+)” as used in the passage\?$/
const RC_RANGE: Record<MockDifficulty, [number, number]> = { hard: [300, 520], medium: [200, 380] }

export const passageText = (g: Group): string =>
  (g.stimulus?.parts ?? [])
    .map((p) => (p.kind === 'text' ? p.paragraphs.join('\n\n') : ''))
    .filter(Boolean)
    .join('\n\n')

const contentOf = (stem: string): string => {
  const i = stem.indexOf('\n\n')
  return i >= 0 ? stem.slice(i + 2) : stem
}

function checkErrorDetection(q: QuestionDraft): string | null {
  if (q.options[4] === 'No error') {
    if (q.options.some((o, i) => o !== ED_OPTIONS[i])) return 'error-detection options must be (a)(b)(c)(d) and No error in order'
    const pos = ['(a) ', '(b) ', '(c) ', '(d) '].map((m) => q.stem.indexOf(m))
    if (pos.some((p, i) => p < 0 || (i > 0 && p <= pos[i - 1]))) return 'error-detection stem must show parts (a)-(d) in order'
    const body = q.stem.slice(pos[0])
    if (body.split(/\([a-d]\) /).slice(1).some((p) => wordCount(p) < 1)) return 'error-detection has an empty part'
    return null
  }
  if (!/^Which of the following sentences/.test(q.stem)) return 'error-detection sentence variant must ask which sentence is correct'
  if (q.options.some((o) => wordCount(o) < 6)) return 'error-detection sentence options too short'
  return null
}

function checkParaJumble(q: QuestionDraft): string | null {
  const rows = [...q.stem.matchAll(/^([A-F])\. (.+)$/gm)]
  const n = rows.length
  if (n < 5 || n > 6) return 'para-jumble needs 5 or 6 labelled sentences'
  const letters = rows.map((r) => r[1]).join('')
  if (letters !== 'ABCDEF'.slice(0, n)) return 'para-jumble sentence letters must be contiguous from A'
  if (new Set(rows.map((r) => normKey(r[2]))).size !== n) return 'para-jumble repeats a sentence'
  if (q.options.every((o) => /^[A-F]{5,6}$/.test(o))) {
    const sorted = letters.split('').sort().join('')
    if (q.options.some((o) => o.length !== n || o.split('').sort().join('') !== sorted)) return 'para-jumble options must be permutations of the same letters'
    return null
  }
  if (q.options.every((o) => o.length === 1 && letters.includes(o))) {
    if (!/\b(?:FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH)\b/.test(q.stem)) return 'para-jumble position question does not name a position'
    return null
  }
  return 'para-jumble options are neither orders nor sentence letters'
}

function checkFillers(q: QuestionDraft): string | null {
  const body = contentOf(q.stem)
  const blanks = body.match(/______/g)?.length ?? 0
  if (/_{7,}/.test(body) || /_(?!_)/.test(body.replace(/______/g, ''))) return 'fillers has a malformed blank'
  if (blanks === 1) {
    if (/\([AB]\)/.test(body)) return 'single filler must not label its blank'
    if (q.options.some((o) => o.includes(',') || wordCount(o) > 3)) return 'single filler options must be short single words'
    return null
  }
  if (blanks === 2) {
    if (body.indexOf('(A) ______') < 0 || body.indexOf('(B) ______') < body.indexOf('(A) ______')) return 'double filler blanks must be (A) then (B)'
    if (!q.options.every((o) => /^[^,]+, [^,]+$/.test(o))) return 'double filler options must be word pairs'
    return null
  }
  return 'fillers needs one or two blanks'
}

function checkWordSwap(q: QuestionDraft): string | null {
  const body = contentOf(q.stem)
  let last = -1
  for (const k of [1, 2, 3, 4]) {
    const matches = body.match(new RegExp(`\\(${k}\\)[A-Za-z]`, 'g'))
    const at = body.search(new RegExp(`\\(${k}\\)[A-Za-z]`))
    if (!matches || matches.length !== 1 || at <= last) return 'word-swap markers (1)-(4) must each appear once, in order'
    last = at
  }
  if (q.options[4] !== NO_INTERCHANGE) return 'word-swap last option must be "No interchange required"'
  const seen = new Set<string>()
  for (const o of q.options.slice(0, 4)) {
    const m = /^\(([1-4])\) and \(([1-4])\)$/.exec(o)
    if (!m || Number(m[1]) >= Number(m[2])) return 'word-swap options must be "(i) and (j)" with i < j'
    seen.add(o)
  }
  return seen.size === 4 ? null : 'word-swap pair options repeat'
}

function checkPhrase(q: QuestionDraft): string | null {
  const body = contentOf(q.stem)
  if (body.includes('______')) {
    if ((body.match(/______/g) ?? []).length !== 1) return 'phrase usage needs exactly one blank'
    if (q.options.some((o) => o === NO_CORRECTION)) return 'phrase usage must not offer "No correction required"'
    return null
  }
  if (q.options[4] !== NO_CORRECTION) return 'phrase-replacement last option must be "No correction required"'
  if (!/\b[A-Z][A-Z'-]+\b/.test(body)) return 'phrase-replacement stem has no capitalised phrase'
  if (q.options.slice(0, 4).some((o) => normKey(o) === normKey(NO_CORRECTION))) return 'phrase-replacement repeats "No correction required"'
  return null
}

function checkMatchColumn(q: QuestionDraft): string | null {
  const i1 = q.stem.indexOf('Column I\n')
  const i2 = q.stem.indexOf('Column II\n')
  if (i1 < 0 || i2 < i1) return 'match-column stem needs Column I and Column II'
  const col1 = [...q.stem.slice(i1, i2).matchAll(/^([1-4])\. (.+)$/gm)].map((m) => m[1]).join('')
  const col2 = [...q.stem.slice(i2).matchAll(/^([A-D])\. (.+)$/gm)].map((m) => m[1]).join('')
  if (col1 !== '1234' || col2 !== 'ABCD') return 'match-column columns must list 1-4 and A-D'
  for (const o of q.options) {
    const m = /^1-([A-D]), 2-([A-D]), 3-([A-D]), 4-([A-D])$/.exec(o)
    if (!m || new Set(m.slice(1)).size !== 4) return 'match-column options must be one-to-one matchings'
  }
  return null
}

function checkRcQuestion(q: QuestionDraft, passage: string): string | null {
  const v = VOCAB_STEM.exec(q.stem)
  if (v) {
    const target = v[1]
    if (!new RegExp(`(?<![A-Za-z'-])${escRe(target)}(?![A-Za-z'-])`, 'i').test(passage)) return 'vocabulary target word is not in the passage'
    if (q.options.some((o) => wordCount(o) > 3 || normKey(o) === normKey(target))) return 'vocabulary options must be short and exclude the target'
    return null
  }
  if (/as used in the passage/i.test(q.stem)) return 'vocabulary-style stem is malformed'
  if (q.stem.length < 20) return 'rc stem too short'
  if (/\b(?:all|none) of the above\b/i.test(q.options.join(' | '))) return 'rc option refers to other options'
  return null
}

/** Returns the questions of `g` that pass the topic's deterministic checks, plus reasons for rejections. A group
 *  whose stimulus is unusable (or, for cloze, any unusable blank) is rejected whole. */
export function checkEnglishGroup(topic: EnglishTopicId, difficulty: MockDifficulty, g: Group): { group: Group | null; reasons: string[] } {
  const reasons: string[] = []
  const fail = (why: string) => {
    reasons.push(why)
    return { group: null, reasons }
  }
  if (!g || !Array.isArray(g.questions) || g.questions.length === 0) return fail('empty group')
  const isSet = topic === 'rc' || topic === 'cloze'

  if (!isSet) {
    if (g.stimulus) return fail('standalone topic must not have a stimulus')
    if (g.questions.length !== 1) return fail('standalone topic group must hold one question')
  } else {
    const st = g.stimulus
    if (!st || !Array.isArray(st.parts) || st.parts.length !== 1 || st.parts[0].kind !== 'text') return fail('passage topic needs one text stimulus part')
    if (st.directions !== undefined && textProblem(st.directions)) return fail('bad directions text')
    const paras = st.parts[0].paragraphs
    const bad = paras.map((p) => textProblem(p, topic === 'cloze')).find(Boolean)
    if (bad) return fail(`passage: ${bad}`)
  }

  const qBad = (q: QuestionDraft): string | null => {
    const base = validateDraft(q)
    if (base) return base
    if (q.topic !== topic) return 'question topic does not match'
    const parts = [q.stem, q.explanation, ...q.options]
    for (const p of parts) {
      const t = textProblem(p, true)
      if (t) return t
    }
    if (/_{2,}/.test(q.explanation) || q.options.some((o) => /_{2,}/.test(o))) return 'blank marker in options or explanation'
    return null
  }

  if (topic === 'cloze') {
    const text = passageText(g)
    const wc = wordCount(text.replace(/\(\d{1,2}\) ______/g, 'x'))
    if (wc < 100 || wc > 260) return fail(`cloze passage length ${wc}`)
    const nums = [...text.matchAll(/\((\d{1,2})\) ______/g)].map((m) => Number(m[1]))
    if (nums.length !== g.questions.length || nums.some((n, i) => n !== i + 1)) return fail('cloze blank numbers must be contiguous 1..N and match the questions')
    if (text.replace(/\(\d{1,2}\) ______/g, '').includes('__')) return fail('cloze has a malformed blank')
    for (let i = 0; i < g.questions.length; i++) {
      const q = g.questions[i]
      const why = qBad(q)
      if (why) return fail(`cloze blank ${i + 1}: ${why}`)
      if (q.stem !== `Select the most appropriate word to fill blank (${i + 1}).`) return fail(`cloze blank ${i + 1}: stem does not name its blank`)
      if (q.options.some((o) => wordCount(o) > 3)) return fail(`cloze blank ${i + 1}: option too long`)
    }
    return { group: g, reasons }
  }

  if (topic === 'rc') {
    const text = passageText(g)
    const [lo, hi] = RC_RANGE[difficulty]
    const wc = wordCount(text)
    if (wc < lo || wc > hi) return fail(`rc passage length ${wc} outside ${lo}-${hi}`)
    if (g.questions.length > 12) return fail('rc passage has too many questions')
    const kept: QuestionDraft[] = []
    const stems: string[] = []
    const targets = new Set<string>()
    for (const q of g.questions) {
      const why = qBad(q) || checkRcQuestion(q, text)
      if (why) {
        reasons.push(`rc q: ${why}`)
        continue
      }
      const v = VOCAB_STEM.exec(q.stem)
      if (v) {
        const t = v[1].toLowerCase()
        if (targets.has(t)) {
          reasons.push('rc q: repeated vocabulary word')
          continue
        }
        targets.add(t)
      } else {
        if (stems.some((s) => jaccard(s, q.stem) >= 0.8)) {
          reasons.push('rc q: near-duplicate stem')
          continue
        }
        stems.push(q.stem)
      }
      kept.push(q)
    }
    return kept.length ? { group: { stimulus: g.stimulus, questions: kept }, reasons } : fail('rc: no question passed')
  }

  const q = g.questions[0]
  const why =
    qBad(q) ||
    (topic === 'error-detection'
      ? checkErrorDetection(q)
      : topic === 'para-jumble'
        ? checkParaJumble(q)
        : topic === 'fillers'
          ? checkFillers(q)
          : topic === 'word-swap'
            ? checkWordSwap(q)
            : topic === 'phrase-replacement'
              ? checkPhrase(q)
              : checkMatchColumn(q))
  return why ? fail(why) : { group: g, reasons }
}

// ---------------------------------------------------------------------------------------------------
// Duplicate tracking
// ---------------------------------------------------------------------------------------------------

/** Text that identifies a question's content (directions stripped, options included for sentence-type questions). */
function dedupeText(q: QuestionDraft): string | null {
  if (q.topic === 'cloze') return null
  const v = VOCAB_STEM.exec(q.stem)
  if (v) return `vocab ${v[1].toLowerCase()}`
  return `${contentOf(q.stem)} ${q.options.join(' ')}`
}

class SeenIndex {
  private passages: string[] = []
  private texts: string[] = []
  private keys = new Set<string>()

  /** true when the group (or, for set topics, its passage) is new. */
  isNewGroup(g: Group): boolean {
    const p = passageText(g)
    if (p) {
      const key = normKey(p).slice(0, 220)
      if (this.keys.has(`p:${key}`)) return false
      return !this.passages.some((x) => jaccard(x, p) >= 0.6)
    }
    return g.questions.every((q) => this.isNewQuestion(q))
  }
  private isNewQuestion(q: QuestionDraft): boolean {
    const t = dedupeText(q)
    if (!t) return true
    if (this.keys.has(`q:${normKey(t)}`)) return false
    return normKey(t).split(' ').length < 8 || !this.texts.some((x) => jaccard(x, t) >= 0.85)
  }
  add(g: Group) {
    const p = passageText(g)
    if (p) {
      this.keys.add(`p:${normKey(p).slice(0, 220)}`)
      this.passages.push(p)
      // Remember RC vocabulary/stems so a regenerated passage reusing a question is still caught.
    }
    for (const q of g.questions) {
      const t = dedupeText(q)
      if (!t) continue
      this.keys.add(`q:${normKey(t)}`)
      this.texts.push(t)
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// API access (generate / blind solve)
// ---------------------------------------------------------------------------------------------------

class ApiError extends Error {
  status: number
  fatal: boolean
  constructor(message: string, status: number, fatal: boolean) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fatal = fatal
  }
}

interface GenerateResponse {
  groups: Group[]
  meta?: { model?: string }
}
interface SolveResult {
  id: string
  answer: number | null
  ambiguous: boolean
}

const isRetryableStatus = (s: number) => s === 408 || s === 425 || s === 429 || s >= 500

async function postJson(body: unknown, signal: AbortSignal | undefined): Promise<unknown> {
  let lastError: unknown = new Error('request failed')
  for (let attempt = 0; attempt <= ENGLISH_TUNING.retries; attempt++) {
    throwIfAborted(signal)
    if (attempt > 0) {
      const base = ENGLISH_TUNING.retryDelayMs * 2 ** (attempt - 1)
      await sleep(base * (0.75 + Math.random() * 0.5), signal)
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ENGLISH_TUNING.requestTimeoutMs)
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const res = await fetch('/api/mockEnglish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (res.ok) return await res.json()
      const detail = (await res.json().catch(() => null)) as { error?: string } | null
      const msg = detail?.error || `Request failed (${res.status}).`
      if (res.status === 404 || res.status === 405 || (res.status === 500 && /not configured/i.test(msg))) throw new ApiError(msg, res.status, true)
      if (!isRetryableStatus(res.status)) throw new ApiError(msg, res.status, false)
      lastError = new ApiError(msg, res.status, false)
    } catch (err) {
      if (signal?.aborted) throw abortError()
      if (err instanceof ApiError && (err.fatal || !isRetryableStatus(err.status))) throw err
      // Our own request timeout surfaces as an abort: remember it as a 504 so callers can ask for less next time.
      lastError = controller.signal.aborted ? new ApiError('The question service timed out.', 504, false) : err
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('request failed')
}

async function generateBatch(topic: EnglishTopicId, difficulty: MockDifficulty, count: number, signal?: AbortSignal): Promise<{ groups: Group[]; model: string }> {
  const seed = Math.floor(Math.random() * 0x7fffffff)
  const data = (await postJson({ action: 'generate', topic, difficulty, count, seed }, signal)) as Partial<GenerateResponse> | null
  if (!data || !Array.isArray(data.groups)) throw new Error('malformed generate response')
  return { groups: data.groups, model: typeof data.meta?.model === 'string' ? data.meta.model : '' }
}

async function solveItems(
  topic: EnglishTopicId,
  entries: { id: string; passage: string; q: QuestionDraft }[],
  model: string,
  signal?: AbortSignal,
): Promise<Map<string, SolveResult>> {
  const out = new Map<string, SolveResult>()
  const chunks: (typeof entries)[] = []
  for (let i = 0; i < entries.length; i += ENGLISH_TUNING.solveBatchSize) chunks.push(entries.slice(i, i + ENGLISH_TUNING.solveBatchSize))
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const data = (await postJson(
          {
            action: 'solve',
            avoidModel: model || undefined,
            items: chunk.map((e) => ({ id: e.id, topic, passage: e.passage || undefined, stem: e.q.stem, options: e.q.options })),
          },
          signal,
        )) as { results?: SolveResult[] } | null
        for (const r of data?.results ?? []) {
          if (r && typeof r.id === 'string') out.set(r.id, { id: r.id, answer: Number.isInteger(r.answer) ? (r.answer as number) : null, ambiguous: r.ambiguous !== false })
        }
      } catch (err) {
        if (signal?.aborted || (err instanceof ApiError && err.fatal)) throw err
        // The chunk stays unverified, so its questions are dropped.
      }
    }),
  )
  return out
}

// ---------------------------------------------------------------------------------------------------
// Verification, trimming and selection
// ---------------------------------------------------------------------------------------------------

/** Fills blank numbers above `keep` with their keyed word and returns the passage with blanks 1..keep intact. */
function fillClozeBlanks(g: Group, fill: Set<number>): Group {
  const text = g.stimulus!.parts[0]
  if (text.kind !== 'text') return g
  const keyed = g.questions.map((q) => q.options[q.answer])
  const remaining = g.questions.map((_, i) => i + 1).filter((k) => !fill.has(k))
  const renumber = new Map(remaining.map((k, i) => [k, i + 1]))
  const paragraphs = text.paragraphs.map((p) =>
    p.replace(/\((\d{1,2})\) ______/g, (_m, n: string) => {
      const k = Number(n)
      return fill.has(k) ? keyed[k - 1] : `(${renumber.get(k)}) ______`
    }),
  )
  const questions = remaining.map((k, i) => ({ ...g.questions[k - 1], stem: `Select the most appropriate word to fill blank (${i + 1}).` }))
  return { stimulus: { ...g.stimulus!, parts: [{ ...text, paragraphs }] }, questions }
}

/** Keeps the questions whose blind answer matches the key and that were not flagged ambiguous. */
function applyVerdicts(topic: EnglishTopicId, g: Group, gi: number, verdicts: Map<string, SolveResult>, count: number): Group | null {
  const pass = g.questions.map((q, qi) => {
    const v = verdicts.get(`${gi}.${qi}`)
    return !!v && v.answer === q.answer && !v.ambiguous
  })
  if (topic === 'cloze') {
    const failed = pass.map((p, i) => (p ? 0 : i + 1)).filter(Boolean)
    if (failed.length === 0) return g
    if (!ENGLISH_TUNING.clozeFillFailedBlanks) return null
    const verified = g.questions.length - failed.length
    if (verified < Math.min(ENGLISH_TUNING.clozeMinBlanks, g.questions.length) || failed.length > 2) return null
    // Only fill in blanks whose key is itself plausible: never fill a blank the solver could not answer at all.
    const unanswered = failed.some((k) => verdicts.get(`${gi}.${k - 1}`)?.answer == null)
    if (unanswered) return null
    return fillClozeBlanks(g, new Set(failed))
  }
  const questions = g.questions.filter((_, i) => pass[i])
  if (questions.length === 0) return null
  if (topic === 'rc' && questions.length < Math.min(count >= 4 ? 3 : 1, g.questions.length)) return null
  return { stimulus: g.stimulus, questions }
}

/** Trims `g` to exactly `keep` questions (rc: drops the last ones; cloze: fills the last blanks in with their keys). */
function trimGroup(topic: EnglishTopicId, g: Group, keep: number): Group {
  if (g.questions.length <= keep) return g
  if (topic === 'cloze') {
    const fill = new Set<number>()
    for (let k = keep + 1; k <= g.questions.length; k++) fill.add(k)
    return fillClozeBlanks(g, fill)
  }
  return { stimulus: g.stimulus, questions: g.questions.slice(0, keep) }
}

/** Largest groups first (fewest passages), trimming the last one so the total is exactly `count`. */
function selectExactly(topic: EnglishTopicId, pool: Group[], count: number): Group[] {
  const ordered = topic === 'rc' || topic === 'cloze' ? pool.slice().sort((a, b) => b.questions.length - a.questions.length) : pool
  const out: Group[] = []
  let have = 0
  for (const g of ordered) {
    if (have >= count) break
    const g2 = trimGroup(topic, g, count - have)
    out.push(g2)
    have += g2.questions.length
  }
  return out
}

// ---------------------------------------------------------------------------------------------------
// Batch planning
// ---------------------------------------------------------------------------------------------------

const MAX_PER_CALL: Record<EnglishTopicId, number> = { rc: 12, cloze: 8, 'error-detection': 6, 'para-jumble': 4, fillers: 6, 'word-swap': 5, 'phrase-replacement': 6, 'match-column': 4 }

function splitEvenly(total: number, maxPer: number): number[] {
  const k = Math.max(1, Math.ceil(total / maxPer))
  const base = Math.floor(total / k)
  const extra = total % k
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0))
}

/** Sizes (question/blank counts) of the generate calls for one round. `yieldEst` is the observed share of requested
 *  questions that survived verification so far (0.7 before any data), used to over-request just enough. */
function planBatches(topic: EnglishTopicId, count: number, need: number, round: number, timeouts: number, yieldEst: number): number[] {
  // Later rounds are the last chances, so they over-request a further 25% on top of the observed yield.
  const y = Math.min(0.95, Math.max(0.2, round > 1 ? yieldEst * 0.8 : yieldEst))
  if (topic === 'rc') {
    // One passage per call. After a timeout, ask for less per passage.
    const shrink = Math.min(timeouts * 2, 5)
    const wantFull = count <= 10 && need <= 3 // a fresh full passage beats a 1-3 question fragment
    const target = wantFull ? count : need
    return splitEvenly(target, 10).map((s) => Math.max(1, Math.min(12, Math.ceil(s / y) + 1) - shrink))
  }
  if (topic === 'cloze') {
    const total = round === 1 ? need : Math.ceil(need / y)
    return splitEvenly(total, 5).map((s) => Math.min(MAX_PER_CALL.cloze, s + 2))
  }
  return splitEvenly(Math.ceil(need / y) + (round > 1 ? 2 : need > 2 ? 1 : 0), MAX_PER_CALL[topic])
}

// ---------------------------------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------------------------------

export async function fetchEnglishGroups(topic: EnglishTopicId, difficulty: MockDifficulty, count: number, opts: FetchEnglishOptions = {}): Promise<Group[]> {
  const { signal, onProgress } = opts
  if (!Number.isInteger(count) || count < 1 || count > 200) throw new Error('Invalid number of English questions requested.')
  throwIfAborted(signal)

  const startedAt = Date.now()
  const seen = new SeenIndex()
  const pool: Group[] = []
  let have = 0
  let fatal: Error | null = null
  let timeouts = 0
  let asked = 0
  let gained = 0

  const merge = (groups: Group[]) => {
    for (const g of groups) {
      if (!seen.isNewGroup(g)) continue
      seen.add(g)
      pool.push(g)
      have += g.questions.length
    }
    onProgress?.(Math.min(have, count))
  }

  const runBatch = async (ask: number) => {
    if (have >= count || fatal) return
    throwIfAborted(signal)
    const haveBefore = have
    try {
      const { groups: raw, model } = await generateBatch(topic, difficulty, ask, signal)
      // Gate 2: deterministic checks, then drop what we already hold (before spending a solve call on it).
      const candidates: Group[] = []
      const batchSeen = new SeenIndex()
      for (const g of raw) {
        const checked = checkEnglishGroup(topic, difficulty, g).group
        if (!checked || !seen.isNewGroup(checked) || !batchSeen.isNewGroup(checked)) continue
        batchSeen.add(checked)
        candidates.push(checked)
      }
      if (candidates.length === 0) return
      // Gate 3: independent blind solve.
      const entries = candidates.flatMap((g, gi) => {
        const passage = passageText(g)
        return g.questions.map((q, qi) => ({ id: `${gi}.${qi}`, passage, q }))
      })
      const verdicts = await solveItems(topic, entries, model, signal)
      const verified: Group[] = []
      candidates.forEach((g, gi) => {
        const kept = applyVerdicts(topic, g, gi, verdicts, count)
        if (!kept) return
        // Filling in a cloze blank changes the passage, so re-check the rewritten group.
        const again = topic === 'cloze' && kept !== g ? checkEnglishGroup(topic, difficulty, kept).group : kept
        if (again) verified.push(again)
      })
      merge(verified)
    } catch (err) {
      if (signal?.aborted) throw abortError()
      if (err instanceof ApiError) {
        if (err.fatal) fatal = err
        if (err.status === 504) timeouts++
      }
      // Anything else (network, malformed reply after retries): this batch yields nothing; the next round compensates.
    } finally {
      asked += ask
      gained += have - haveBefore
    }
  }

  for (let round = 1; round <= ENGLISH_TUNING.maxRounds && have < count; round++) {
    throwIfAborted(signal)
    if (round > 1 && Date.now() - startedAt > ENGLISH_TUNING.deadlineMs) break
    const sizes = planBatches(topic, count, count - have, round, timeouts, asked > 0 ? gained / asked : 0.7)
    let next = 0
    const worker = async () => {
      while (next < sizes.length && have < count && !fatal) {
        throwIfAborted(signal)
        const ask = sizes[next++]
        await runBatch(ask)
      }
    }
    await Promise.all(Array.from({ length: Math.min(ENGLISH_TUNING.concurrency, sizes.length) }, worker))
    if (fatal) break
  }

  throwIfAborted(signal)
  if (fatal) throw new Error(UNAVAILABLE_ERROR)
  if (have < count) throw new Error(GENERIC_ERROR)

  const result = selectExactly(topic, pool, count)
  const finalCount = countQuestions(result)
  // Last line of defence: the exact-count contract and the structural contract.
  if (finalCount !== count || result.some((g) => g.questions.some((q) => validateDraft(q)))) throw new Error(GENERIC_ERROR)
  return result
}
