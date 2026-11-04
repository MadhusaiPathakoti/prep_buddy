// English question pipeline for the Mocks module.
//
// fetchEnglishPaper() prepares the whole English section at once. It never hands back a question that has not
// passed every gate:
//   1. server-side build/validation (api/mockEnglish.js builds options, keys, shuffles and labels in code)
//   2. client-side deterministic checks (checks.ts: per-topic stem/option formats, passage and cloze integrity,
//      character set, placeholder text, near-duplicates)
//   3. an independent BLIND SOLVE by a different model (no key or explanation sent). Strict gate: the solver's
//      answer equals the key AND it did not flag the item ambiguous. If a topic is still short after round 1 the
//      gate relaxes to "answer equals the key" (ambiguity flag ignored); a disagreement or a missing verdict is
//      NEVER accepted.
//
// Efficiency: all topics share rounds. Round 1 fires one generate call per topic at once (at most 4 in flight),
// then pools every candidate from every topic into as few blind-solve calls as possible (chunks of 20, at most 3 in
// flight). Only topics still short go to round 2, then a last round 3. Verified groups are kept in a persistent
// localStorage bank (bank.ts): later attempts and later mocks draw from it first, and a failed attempt keeps what
// it verified, so "Try again" resumes instead of restarting.
//
// It either returns exactly the requested number of verified questions per request, or throws EnglishPrepareError
// with a reason naming the real cause.

import type { EnglishTopicId, Group, MockDifficulty, QuestionDraft } from '../types'
import { validateDraft } from '../validate'
import { bankAdd, bankRead, bankRemove } from './bank'
import { SeenIndex, checkEnglishGroup, groupKey, passageText } from './checks'

export { checkEnglishGroup, passageText } from './checks'
export { clearEnglishBank, englishBankSize } from './bank'

export interface EnglishRequest {
  topic: EnglishTopicId
  count: number
}
export interface FetchEnglishPaperOptions {
  signal?: AbortSignal
  /** Verified questions ready so far, out of the paper total (never above the total). */
  onProgress?: (ready: number, total: number) => void
}
export interface FetchEnglishOptions {
  signal?: AbortSignal
  /** Called with the number of verified questions collected so far (never above `count`). */
  onProgress?: (questionsReady: number) => void
}

export type EnglishFailReason = 'rate-limit' | 'timeout' | 'unavailable' | 'quality' | 'network'

const MESSAGES: Record<EnglishFailReason, string> = {
  'rate-limit': 'Gemini is rate-limiting requests - wait about a minute and press Try again.',
  timeout: 'Gemini was too slow to respond - press Try again (questions already prepared are kept).',
  unavailable: "English questions aren't available right now (the question service isn't reachable or isn't set up).",
  quality: 'Too many generated questions failed the accuracy check - try again (questions already prepared are kept).',
  network: "Couldn't prepare enough English questions — check your connection and try again.",
}

export class EnglishPrepareError extends Error {
  reason: EnglishFailReason
  constructor(reason: EnglishFailReason, message?: string) {
    super(message ?? MESSAGES[reason])
    this.name = 'EnglishPrepareError'
    this.reason = reason
  }
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

/** Mutable so the harness can speed things up; production code leaves it alone. */
export const ENGLISH_TUNING = {
  maxRounds: 3,
  /** Generate calls in flight at once (free-tier friendly). */
  genConcurrency: 4,
  /** Blind-solve calls in flight at once. */
  solveConcurrency: 3,
  solveBatchSize: 20,
  /** Extra attempts per API call after the first, by failure class. */
  retries: 2,
  rateLimitRetries: 3,
  timeoutRetries: 1,
  /** Backoff base for 5xx/network (doubles, jittered). */
  retryDelayMs: 800,
  /** Backoff base for 429 when the server gives no Retry-After (doubles, jittered); also capped by maxRetryAfterMs. */
  rateLimitBaseMs: 5000,
  maxRetryAfterMs: 20000,
  /** Must stay above the server's request deadline (26 s) and below its maxDuration (30 s). */
  requestTimeoutMs: 28000,
  /** No new round starts after this long. */
  deadlineMs: 120000,
  /** After round 1, accept items the solver agreed with but flagged ambiguous. */
  lenientLadder: true,
  /** A cloze blank that fails verification is filled in with its keyed word instead of sinking the passage. */
  clozeFillFailedBlanks: true,
  clozeMinBlanks: 3,
  useBank: true,
  /** console.info one summary per run. */
  logSummary: true,
}

// ---------------------------------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------------------------------

export interface EnglishTopicStats {
  topic: EnglishTopicId
  asked: number
  received: number
  detDropped: number
  detReasons: Record<string, number>
  agree: number
  disagree: number
  ambiguous: number
  missing: number
  verified: number
  fromBank: number
  lenientUsed: number
}
export interface EnglishCallStat {
  kind: 'generate' | 'solve'
  status: number | string
  ms: number
  round: number
  t0: number
}
export interface EnglishRunStats {
  difficulty: MockDifficulty
  total: number
  outcome: 'running' | 'ok' | EnglishFailReason | 'aborted'
  rounds: number
  retries: number
  /** Per physical API attempt: '200', '429', '504', '5xx', '4xx', 'timeout', 'net'. */
  http: Record<string, number>
  /** Gemini-side statuses reported by the server for requests that fell back to the other model. */
  upstream: Record<string, number>
  calls: EnglishCallStat[]
  topics: Record<string, EnglishTopicStats>
  phaseMs: { generate: number; solve: number; total: number }
}

let lastStats: EnglishRunStats | null = null
/** Stats of the most recent fetchEnglishPaper run (also available after a failure). */
export const getLastEnglishRunStats = (): EnglishRunStats | null => lastStats

const statusKey = (s: number | string): string => (typeof s === 'string' ? s : s === 200 ? '200' : s === 429 ? '429' : s === 504 ? '504' : s >= 500 ? '5xx' : '4xx')
const normReason = (r: string) => r.replace(/\d+/g, 'N').slice(0, 90)

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0
  const v = values.slice().sort((a, b) => a - b)
  return v[Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1))]
}

function phaseWall(calls: EnglishCallStat[], kind: 'generate' | 'solve'): number {
  const byRound = new Map<number, { s: number; e: number }>()
  for (const c of calls) {
    if (c.kind !== kind) continue
    const cur = byRound.get(c.round) ?? { s: Infinity, e: 0 }
    cur.s = Math.min(cur.s, c.t0)
    cur.e = Math.max(cur.e, c.t0 + c.ms)
    byRound.set(c.round, cur)
  }
  let total = 0
  for (const { s, e } of byRound.values()) total += Math.max(0, e - s)
  return total
}

/** Compact multi-line summary (no keys, no prompts). */
export function formatEnglishRunStats(st: EnglishRunStats): string {
  const gen = st.calls.filter((c) => c.kind === 'generate').length
  const sol = st.calls.filter((c) => c.kind === 'solve').length
  const fmt = (o: Record<string, number>) =>
    Object.entries(o)
      .map(([k, v]) => `${k}x${v}`)
      .join(' ') || '-'
  const lines = [
    `[english] ${st.difficulty} ${st.outcome} | ${st.total} questions in ${(st.phaseMs.total / 1000).toFixed(1)}s | api calls ${gen} generate + ${sol} solve | http ${fmt(st.http)} | gemini-side ${fmt(st.upstream)} | retries ${st.retries} | rounds ${st.rounds}`,
    `  phases: generate ${(st.phaseMs.generate / 1000).toFixed(1)}s, solve ${(st.phaseMs.solve / 1000).toFixed(1)}s`,
    `  ${'topic'.padEnd(19)}${'ask'.padStart(4)}${'recv'.padStart(6)}${'detDrop'.padStart(8)}${'agree'.padStart(6)}${'disag'.padStart(6)}${'amb'.padStart(5)}${'miss'.padStart(5)}${'ok'.padStart(4)}${'bank'.padStart(5)}${'lenient'.padStart(8)}`,
  ]
  for (const t of Object.values(st.topics)) {
    lines.push(
      `  ${t.topic.padEnd(19)}${String(t.asked).padStart(4)}${String(t.received).padStart(6)}${String(t.detDropped).padStart(8)}${String(t.agree).padStart(6)}${String(t.disagree).padStart(6)}${String(t.ambiguous).padStart(5)}${String(t.missing).padStart(5)}${String(t.verified).padStart(4)}${String(t.fromBank).padStart(5)}${String(t.lenientUsed).padStart(8)}`,
    )
    const top = Object.entries(t.detReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([r, n]) => `"${r}" x${n}`)
    if (top.length) lines.push(`      drops: ${top.join('; ')}`)
  }
  return lines.join('\n')
}

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

/** Counting semaphore: run() waits until fewer than `limit` tasks are active (slots are handed over directly). */
class Gate {
  private active = 0
  private waiters: (() => void)[] = []
  private limit: number
  constructor(limit: number) {
    this.limit = limit
  }
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active < this.limit) this.active++
    else await new Promise<void>((resolve) => this.waiters.push(resolve))
    try {
      return await fn()
    } finally {
      const next = this.waiters.shift()
      if (next) next()
      else this.active--
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// API access
// ---------------------------------------------------------------------------------------------------

type FailClass = 'rate' | 'timeout' | 'network' | 'quality'

class ApiError extends Error {
  status: number
  fatal: boolean
  cls: FailClass
  retryable: boolean
  retryAfterMs: number
  constructor(message: string, status: number, cls: FailClass, opts: { fatal?: boolean; retryable?: boolean; retryAfterMs?: number } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.cls = cls
    this.fatal = !!opts.fatal
    this.retryable = opts.retryable ?? true
    this.retryAfterMs = opts.retryAfterMs ?? 0
  }
}

interface Env {
  signal: AbortSignal | undefined
  stats: EnglishRunStats
  /** Shared rate-limit cooldown: after a 429 every call waits, so topics do not retry in lockstep. */
  cooldownUntil: number
  round: number
}

interface GenerateResponse {
  groups: Group[]
  meta?: { model?: string; droppedCount?: number; dropped?: string[]; attempts?: { status: number }[] }
}
interface SolveResponse {
  results?: { id: string; answer: number | null; ambiguous: boolean }[]
  meta?: { attempts?: { status: number }[] }
}

function record(env: Env, kind: 'generate' | 'solve', status: number | string, t0: number) {
  env.stats.calls.push({ kind, status, ms: Date.now() - t0, round: env.round, t0 })
  const k = statusKey(status)
  env.stats.http[k] = (env.stats.http[k] ?? 0) + 1
}
function recordUpstream(env: Env, attempts: { status: number }[] | undefined) {
  for (const a of attempts ?? []) {
    if (a && a.status !== 200) {
      const k = statusKey(a.status)
      env.stats.upstream[k] = (env.stats.upstream[k] ?? 0) + 1
    }
  }
}

async function attemptOnce(env: Env, kind: 'generate' | 'solve', body: unknown): Promise<{ data: unknown } | { failure: ApiError }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ENGLISH_TUNING.requestTimeoutMs)
  const onAbort = () => controller.abort()
  env.signal?.addEventListener('abort', onAbort, { once: true })
  const t0 = Date.now()
  try {
    const res = await fetch('/api/mockEnglish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (res.ok) {
      const data = await res.json()
      record(env, kind, 200, t0)
      return { data }
    }
    const detail = (await res.json().catch(() => null)) as { error?: string; retryAfterMs?: number; attempts?: { status: number }[]; unusable?: boolean } | null
    record(env, kind, res.status, t0)
    recordUpstream(env, detail?.attempts)
    const msg = detail?.error || `Request failed (${res.status}).`
    const header = Number(res.headers?.get?.('retry-after'))
    const retryAfterMs = Math.max(Number(detail?.retryAfterMs) || 0, Number.isFinite(header) && header > 0 ? header * 1000 : 0)
    if (res.status === 404 || res.status === 405 || (res.status === 500 && /not configured/i.test(msg))) return { failure: new ApiError(msg, res.status, 'network', { fatal: true, retryable: false }) }
    if (res.status === 429) return { failure: new ApiError(msg, 429, 'rate', { retryAfterMs }) }
    if (detail?.unusable) return { failure: new ApiError(msg, res.status, 'quality') }
    if (res.status === 504) return { failure: new ApiError(msg, 504, 'timeout') }
    if (res.status === 408 || res.status === 425 || res.status >= 500) return { failure: new ApiError(msg, res.status, 'network') }
    return { failure: new ApiError(msg, res.status, 'network', { retryable: false }) }
  } catch (err) {
    if (env.signal?.aborted) throw abortError()
    const timedOut = controller.signal.aborted
    record(env, kind, timedOut ? 'timeout' : 'net', t0)
    return { failure: timedOut ? new ApiError('The question service timed out.', 504, 'timeout') : new ApiError(err instanceof Error ? err.message : 'network error', 0, 'network') }
  } finally {
    clearTimeout(timer)
    env.signal?.removeEventListener('abort', onAbort)
  }
}

/** POST with class-aware retries: 429 honours Retry-After (or backs off exponentially) through a cooldown shared by
 *  all calls, timeouts get one retry, 5xx/network get two; all backoffs are jittered. */
async function postJson(env: Env, kind: 'generate' | 'solve', body: unknown): Promise<unknown> {
  const used = { rate: 0, timeout: 0, network: 0, quality: 0 }
  for (;;) {
    throwIfAborted(env.signal)
    const wait = env.cooldownUntil - Date.now()
    if (wait > 0) await sleep(wait, env.signal)
    const out = await attemptOnce(env, kind, body)
    if ('data' in out) return out.data
    const f = out.failure
    if (f.fatal || !f.retryable) throw f
    const limit = f.cls === 'rate' ? ENGLISH_TUNING.rateLimitRetries : f.cls === 'timeout' ? ENGLISH_TUNING.timeoutRetries : ENGLISH_TUNING.retries
    used[f.cls]++
    if (used[f.cls] > limit) throw f
    env.stats.retries++
    if (f.cls === 'rate') {
      const base = f.retryAfterMs > 0 ? f.retryAfterMs : ENGLISH_TUNING.rateLimitBaseMs * 2 ** (used.rate - 1)
      const delay = Math.min(base, ENGLISH_TUNING.maxRetryAfterMs) * (0.8 + Math.random() * 0.4)
      env.cooldownUntil = Math.max(env.cooldownUntil, Date.now() + delay)
    } else {
      const base = ENGLISH_TUNING.retryDelayMs * 2 ** (f.cls === 'network' ? used.network - 1 : 0)
      await sleep(base * (0.5 + Math.random()), env.signal)
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// Verification, trimming and selection
// ---------------------------------------------------------------------------------------------------

type Verdict = { answer: number | null; ambiguous: boolean } | 'missing'

function passes(q: QuestionDraft, v: Verdict | undefined, mode: 'strict' | 'lenient'): boolean {
  return !!v && v !== 'missing' && v.answer === q.answer && (mode === 'lenient' || !v.ambiguous)
}

/** Fills the blanks listed in `fill` with their keyed words and renumbers the rest. */
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

/** Keeps the questions that pass the gate. `count` is the slot's size (decides the RC fragment threshold). */
function applyVerdicts(topic: EnglishTopicId, g: Group, verdicts: (Verdict | undefined)[], mode: 'strict' | 'lenient', count: number): Group | null {
  const ok = g.questions.map((q, i) => passes(q, verdicts[i], mode))
  if (topic === 'cloze') {
    const failed = ok.map((p, i) => (p ? 0 : i + 1)).filter(Boolean)
    if (failed.length === 0) return g
    if (!ENGLISH_TUNING.clozeFillFailedBlanks) return null
    const verified = g.questions.length - failed.length
    if (verified < Math.min(ENGLISH_TUNING.clozeMinBlanks, g.questions.length) || failed.length > 2) return null
    // Never fill in a blank the solver could not answer at all.
    const unanswered = failed.some((k) => {
      const v = verdicts[k - 1]
      return !v || v === 'missing' || v.answer === null
    })
    return unanswered ? null : fillClozeBlanks(g, new Set(failed))
  }
  const questions = g.questions.filter((_, i) => ok[i])
  if (questions.length === 0) return null
  if (topic === 'rc' && questions.length < Math.min(count >= 4 ? 3 : 1, g.questions.length)) return null
  return { stimulus: g.stimulus, questions }
}

function trimGroup(topic: EnglishTopicId, g: Group, keep: number): Group {
  if (g.questions.length <= keep) return g
  if (topic === 'cloze') {
    const fill = new Set<number>()
    for (let k = keep + 1; k <= g.questions.length; k++) fill.add(k)
    return fillClozeBlanks(g, fill)
  }
  return { stimulus: g.stimulus, questions: g.questions.slice(0, keep) }
}

interface PoolEntry {
  g: Group
  /** Content key of the group as pooled/banked (stable even when the group is later trimmed). */
  key: string
}

const isSetTopic = (t: EnglishTopicId) => t === 'rc' || t === 'cloze'
const size = (e: PoolEntry) => e.g.questions.length

/** Whole entries covering `need` questions: prefers the smallest single passage that covers it. */
function chooseEntries(topic: EnglishTopicId, entries: PoolEntry[], need: number): PoolEntry[] {
  if (!isSetTopic(topic)) return entries.slice(0, need)
  const covering = entries.filter((e) => size(e) >= need).sort((a, b) => size(a) - size(b))[0]
  if (covering) return [covering]
  const out: PoolEntry[] = []
  let have = 0
  for (const e of entries.slice().sort((a, b) => size(b) - size(a))) {
    if (have >= need) break
    out.push(e)
    have += size(e)
  }
  return out
}

/** Exactly `need` questions out of the pool (set topics: fewest passages, the last one trimmed). */
function pickGroups(topic: EnglishTopicId, entries: PoolEntry[], need: number): { g: Group; entry: PoolEntry }[] {
  if (!isSetTopic(topic)) return entries.slice(0, need).map((entry) => ({ g: entry.g, entry }))
  const covering = entries.filter((e) => size(e) >= need).sort((a, b) => size(a) - size(b))[0]
  if (covering) return [{ g: trimGroup(topic, covering.g, need), entry: covering }]
  const out: { g: Group; entry: PoolEntry }[] = []
  let remaining = need
  const sorted = entries.slice().sort((a, b) => size(b) - size(a))
  for (const e of sorted) {
    if (remaining <= 0) break
    if (size(e) <= remaining) {
      out.push({ g: e.g, entry: e })
      remaining -= size(e)
    }
  }
  if (remaining > 0) {
    const overflow = sorted.filter((e) => !out.some((o) => o.entry === e)).sort((a, b) => size(a) - size(b))[0]
    if (overflow) out.push({ g: trimGroup(topic, overflow.g, remaining), entry: overflow })
  }
  return out
}

// ---------------------------------------------------------------------------------------------------
// Batch planning
// ---------------------------------------------------------------------------------------------------

const MAX_PER_CALL: Record<EnglishTopicId, number> = { rc: 12, cloze: 8, 'error-detection': 10, 'para-jumble': 8, fillers: 10, 'word-swap': 8, 'phrase-replacement': 10, 'match-column': 6 }

function splitEvenly(total: number, maxPer: number): number[] {
  const k = Math.max(1, Math.ceil(total / maxPer))
  const base = Math.floor(total / k)
  const extra = total % k
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0))
}

/** Sizes (question/blank counts) of the generate calls for one slot in one round. `yieldEst` is the observed share
 *  of requested questions that survived verification (0.7 before any data). */
function planBatches(topic: EnglishTopicId, count: number, need: number, round: number, timeouts: number, yieldEst: number): number[] {
  // Later rounds are the last chances, so they over-request a further 25% on top of the observed yield.
  const y = Math.min(0.95, Math.max(0.2, round > 1 ? yieldEst * 0.8 : yieldEst))
  if (topic === 'rc') {
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
// Public entry points
// ---------------------------------------------------------------------------------------------------

interface Slot {
  topic: EnglishTopicId
  count: number
  pool: PoolEntry[]
  have: number
  /** Groups the solver agreed with but flagged ambiguous (only used by the lenient ladder; never banked). */
  reserve: Group[]
}
interface Cand {
  slot: Slot
  g: Group
  model: string
  verdicts: (Verdict | undefined)[]
  remaining: number
}
interface SolveItem {
  id: string
  cand: Cand
  qi: number
}

function newTopicStats(topic: EnglishTopicId): EnglishTopicStats {
  return { topic, asked: 0, received: 0, detDropped: 0, detReasons: {}, agree: 0, disagree: 0, ambiguous: 0, missing: 0, verified: 0, fromBank: 0, lenientUsed: 0 }
}

export async function fetchEnglishPaper(
  requests: EnglishRequest[],
  difficulty: MockDifficulty,
  opts: FetchEnglishPaperOptions = {},
): Promise<Group[][]> {
  const { signal, onProgress } = opts
  if (!Array.isArray(requests) || requests.length === 0) throw new Error('No English questions requested.')
  for (const r of requests) {
    if (!r || !Number.isInteger(r.count) || r.count < 1 || r.count > 200) throw new Error('Invalid number of English questions requested.')
  }
  throwIfAborted(signal)

  const T = ENGLISH_TUNING
  const startedAt = Date.now()
  const total = requests.reduce((n, r) => n + r.count, 0)
  const stats: EnglishRunStats = { difficulty, total, outcome: 'running', rounds: 0, retries: 0, http: {}, upstream: {}, calls: [], topics: {}, phaseMs: { generate: 0, solve: 0, total: 0 } }
  lastStats = stats
  const env: Env = { signal, stats, cooldownUntil: 0, round: 0 }
  const tstat = (t: EnglishTopicId) => (stats.topics[t] ??= newTopicStats(t))

  const slots: Slot[] = requests.map((r) => ({ topic: r.topic, count: r.count, pool: [], have: 0, reserve: [] }))
  const topics = [...new Set(requests.map((r) => r.topic))]
  const seen = new Map<EnglishTopicId, SeenIndex>()
  for (const t of topics) {
    seen.set(t, new SeenIndex())
    tstat(t)
  }
  const slotsOf = (t: EnglishTopicId) => slots.filter((s) => s.topic === t)
  const slotFor = (t: EnglishTopicId) => slotsOf(t).find((s) => s.have < s.count) ?? null

  const progress = () => onProgress?.(
    slots.reduce((n, s) => n + Math.min(s.have, s.count), 0),
    total,
  )

  // Draw from the persistent bank first (entries stay in the bank until the paper succeeds).
  if (T.useBank) {
    for (const t of topics) {
      let avail: PoolEntry[] = bankRead(t, difficulty).map((e) => ({ g: e.g, key: e.k }))
      for (const e of avail) seen.get(t)!.add(e.g)
      for (const s of slotsOf(t)) {
        if (!avail.length) break
        const chosen = chooseEntries(t, avail, s.count)
        for (const e of chosen) {
          s.pool.push(e)
          s.have += size(e)
          tstat(t).fromBank += size(e)
        }
        avail = avail.filter((e) => !chosen.includes(e))
      }
    }
    progress()
  }

  let fatal: ApiError | null = null
  let runError: unknown = null
  let roundFailures = { rate: 0, timeout: 0, network: 0, quality: 0 }
  let roundGain = 0
  const timeouts: Record<string, number> = {}
  const genGate = new Gate(T.genConcurrency)
  const solveGate = new Gate(T.solveConcurrency)

  const yieldFor = (t: EnglishTopicId): number => {
    const ts = tstat(t)
    if (ts.asked >= 5) return ts.verified / ts.asked
    let asked = 0
    let ok = 0
    for (const x of Object.values(stats.topics)) {
      asked += x.asked
      ok += x.verified
    }
    return asked >= 5 ? ok / asked : 0.7
  }

  const mergeStrict = (topic: EnglishTopicId, g: Group) => {
    const idx = seen.get(topic)!
    if (!idx.isNewGroup(g)) return
    idx.add(g)
    const n = g.questions.length
    const ts = tstat(topic)
    ts.verified += n
    roundGain += n
    if (T.useBank) bankAdd(topic, difficulty, [g])
    const slot = slotFor(topic)
    if (slot) {
      slot.pool.push({ g, key: groupKey(g) })
      slot.have += n
      progress()
    }
  }

  const promoteReserve = (slot: Slot) => {
    const idx = seen.get(slot.topic)!
    const groups = slot.reserve.slice().sort((a, b) => b.questions.length - a.questions.length)
    slot.reserve = []
    for (const g of groups) {
      if (slot.have >= slot.count) break
      if (!idx.isNewGroup(g)) continue
      idx.add(g)
      slot.pool.push({ g, key: groupKey(g) })
      slot.have += g.questions.length
      tstat(slot.topic).lenientUsed += g.questions.length
      progress()
    }
  }

  const finalize = (c: Cand) => {
    const topic = c.slot.topic
    const ts = tstat(topic)
    c.g.questions.forEach((q, i) => {
      const v = c.verdicts[i]
      if (!v || v === 'missing' || v.answer === null) ts.missing++
      else if (v.answer !== q.answer) ts.disagree++
      else if (v.ambiguous) ts.ambiguous++
      else ts.agree++
    })
    const strict = applyVerdicts(topic, c.g, c.verdicts, 'strict', c.slot.count)
    if (strict) {
      // Filling in a cloze blank rewrites the passage, so re-check the rewritten group.
      const final = topic === 'cloze' && strict !== c.g ? checkEnglishGroup(topic, difficulty, strict).group : strict
      if (final) mergeStrict(topic, final)
      return
    }
    const lenient = applyVerdicts(topic, c.g, c.verdicts, 'lenient', c.slot.count)
    if (lenient) {
      const final = topic === 'cloze' && lenient !== c.g ? checkEnglishGroup(topic, difficulty, lenient).group : lenient
      if (final) c.slot.reserve.push(final)
    }
  }

  // ---- blind solve queue: pooled across topics, dispatched in full chunks as candidates arrive
  let pending: SolveItem[] = []
  const inflight: Promise<void>[] = []
  const noteFailure = (err: unknown) => {
    if (err instanceof ApiError) {
      if (err.fatal) fatal = err
      else roundFailures[err.cls]++
    }
  }
  const dispatch = (chunk: SolveItem[]) => {
    const p = solveGate
      .run(async () => {
        throwIfAborted(signal)
        const counts = new Map<string, number>()
        for (const it of chunk) counts.set(it.cand.model, (counts.get(it.cand.model) ?? 0) + 1)
        const model = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
        let results = new Map<string, { answer: number | null; ambiguous: boolean }>()
        try {
          const data = (await postJson(env, 'solve', {
            action: 'solve',
            avoidModel: model || undefined,
            items: chunk.map((it) => {
              const q = it.cand.g.questions[it.qi]
              return { id: it.id, topic: it.cand.slot.topic, passage: passageText(it.cand.g) || undefined, stem: q.stem, options: q.options }
            }),
          })) as SolveResponse | null
          recordUpstream(env, data?.meta?.attempts)
          for (const r of data?.results ?? []) {
            if (r && typeof r.id === 'string') results.set(r.id, { answer: Number.isInteger(r.answer) ? (r.answer as number) : null, ambiguous: r.ambiguous !== false })
          }
        } catch (err) {
          if (signal?.aborted) throw abortError()
          noteFailure(err)
          results = new Map()
        }
        for (const it of chunk) {
          it.cand.verdicts[it.qi] = results.get(it.id) ?? 'missing'
          if (--it.cand.remaining === 0) finalize(it.cand)
        }
      })
      .catch((err) => {
        runError ??= err
      })
    inflight.push(p)
  }
  const pushItems = (items: SolveItem[]) => {
    pending.push(...items)
    while (pending.length >= T.solveBatchSize) dispatch(pending.splice(0, T.solveBatchSize))
  }
  const flushItems = async () => {
    if (pending.length) dispatch(pending.splice(0))
    await Promise.all(inflight)
    inflight.length = 0
  }

  let nextId = 0
  const generateTask = async (slot: Slot, ask: number) => {
    if (slot.have >= slot.count || fatal || runError) return
    throwIfAborted(signal)
    const topic = slot.topic
    const ts = tstat(topic)
    ts.asked += ask
    try {
      const data = (await postJson(env, 'generate', { action: 'generate', topic, difficulty, count: ask, seed: Math.floor(Math.random() * 0x7fffffff) })) as GenerateResponse | null
      if (!data || !Array.isArray(data.groups)) throw new ApiError('malformed generate response', 200, 'network')
      recordUpstream(env, data.meta?.attempts)
      const model = typeof data.meta?.model === 'string' ? data.meta.model : ''
      for (const g of data.groups) ts.received += Array.isArray(g?.questions) ? g.questions.length : 0
      const serverDropped = data.meta?.droppedCount ?? 0
      ts.detDropped += serverDropped
      for (const r of data.meta?.dropped ?? []) ts.detReasons[normReason(r)] = (ts.detReasons[normReason(r)] ?? 0) + 1
      const batchSeen = new SeenIndex()
      const idx = seen.get(topic)!
      const items: SolveItem[] = []
      for (const g of data.groups) {
        const checked = checkEnglishGroup(topic, difficulty, g)
        for (const why of checked.reasons) {
          ts.detDropped++
          ts.detReasons[normReason(why)] = (ts.detReasons[normReason(why)] ?? 0) + 1
        }
        if (!checked.group) continue
        if (!idx.isNewGroup(checked.group) || !batchSeen.isNewGroup(checked.group)) {
          ts.detDropped += checked.group.questions.length
          ts.detReasons['duplicate of earlier content'] = (ts.detReasons['duplicate of earlier content'] ?? 0) + 1
          continue
        }
        batchSeen.add(checked.group)
        const cand: Cand = { slot, g: checked.group, model, verdicts: [], remaining: checked.group.questions.length }
        const cid = nextId++
        checked.group.questions.forEach((_, qi) => items.push({ id: `${cid}.${qi}`, cand, qi }))
      }
      pushItems(items)
    } catch (err) {
      if (signal?.aborted) throw abortError()
      noteFailure(err)
      if (err instanceof ApiError && err.cls === 'timeout') timeouts[topic] = (timeouts[topic] ?? 0) + 1
      // Anything else: this batch yields nothing; the next round compensates.
    }
  }

  const finishRun = (outcome: EnglishRunStats['outcome']) => {
    stats.outcome = outcome
    stats.phaseMs = { generate: phaseWall(stats.calls, 'generate'), solve: phaseWall(stats.calls, 'solve'), total: Date.now() - startedAt }
    if (T.logSummary) console.info(formatEnglishRunStats(stats))
  }

  try {
    let deadlineHit = false
    for (let round = 1; round <= T.maxRounds; round++) {
      const short = slots.filter((s) => s.have < s.count)
      if (!short.length) break
      if (round > 1 && Date.now() - startedAt > T.deadlineMs) {
        deadlineHit = true
        break
      }
      env.round = round
      stats.rounds = round
      roundFailures = { rate: 0, timeout: 0, network: 0, quality: 0 }
      roundGain = 0

      const tasks: { slot: Slot; ask: number }[] = []
      for (const slot of short) {
        for (const ask of planBatches(slot.topic, slot.count, slot.count - slot.have, round, timeouts[slot.topic] ?? 0, yieldFor(slot.topic))) tasks.push({ slot, ask })
      }
      await Promise.all(tasks.map((t) => genGate.run(() => generateTask(t.slot, t.ask))))
      await flushItems()
      throwIfAborted(signal)
      if (runError) throw runError
      if (fatal) break
      // The ladder: still short after round 1 -> use the solver-agreed-but-flagged groups before spending more calls.
      if (T.lenientLadder) for (const s of short) if (s.have < s.count) promoteReserve(s)
    }

    throwIfAborted(signal)
    const stillShort = slots.some((s) => s.have < s.count)
    if (stillShort) {
      let reason: EnglishFailReason
      const f = roundFailures
      const failTotal = f.rate + f.timeout + f.network
      if (fatal) reason = 'unavailable'
      else if (failTotal > 0 && failTotal >= f.quality) reason = f.rate >= f.timeout && f.rate >= f.network ? 'rate-limit' : f.timeout >= f.network ? 'timeout' : 'network'
      else if (deadlineHit) reason = 'timeout'
      else if (stats.calls.length === 0) reason = 'network'
      else reason = 'quality'
      finishRun(reason)
      throw new EnglishPrepareError(reason)
    }

    const results: Group[][] = []
    const usedKeys = new Map<EnglishTopicId, string[]>()
    for (const s of slots) {
      const picked = pickGroups(s.topic, s.pool, s.count)
      results.push(picked.map((p) => p.g))
      const keys = usedKeys.get(s.topic) ?? []
      for (const p of picked) keys.push(p.entry.key)
      usedKeys.set(s.topic, keys)
    }
    // Last line of defence: exact counts and the structural contract.
    results.forEach((groups, i) => {
      const n = groups.reduce((a, g) => a + g.questions.length, 0)
      if (n !== slots[i].count || groups.some((g) => g.questions.some((q) => validateDraft(q)))) throw new EnglishPrepareError('quality')
    })
    if (T.useBank) for (const [t, keys] of usedKeys) bankRemove(t, difficulty, keys)
    finishRun('ok')
    return results
  } catch (err) {
    if (stats.outcome === 'running') finishRun(signal?.aborted ? 'aborted' : err instanceof EnglishPrepareError ? err.reason : 'network')
    if (signal?.aborted && !(err instanceof EnglishPrepareError)) throw abortError()
    if (err instanceof EnglishPrepareError || (err instanceof Error && err.name === 'AbortError')) throw err
    // Unexpected failure (a bug or a non-API error): never leak a raw error to the UI.
    throw new EnglishPrepareError(err instanceof ApiError ? (err.fatal ? 'unavailable' : err.cls === 'rate' ? 'rate-limit' : err.cls === 'timeout' ? 'timeout' : 'network') : 'network')
  }
}

/** One topic at a time: a thin wrapper over fetchEnglishPaper. */
export async function fetchEnglishGroups(topic: EnglishTopicId, difficulty: MockDifficulty, count: number, opts: FetchEnglishOptions = {}): Promise<Group[]> {
  const { signal, onProgress } = opts
  const [groups] = await fetchEnglishPaper([{ topic, count }], difficulty, { signal, onProgress: onProgress ? (ready) => onProgress(ready) : undefined })
  return groups
}
