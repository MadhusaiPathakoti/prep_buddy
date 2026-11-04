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
import { applyBudgetUpdates, applyHealthUpdates, budgetsForRequest, healthSkipList, healthState } from './health'
import type { BudgetUpdate, HealthUpdate } from './health'
import { getEnglishSource, getSeedEntries, saveSeedUsed, seedUsedIds, shuffleArray, shuffleGroupOptions } from './seed'
import type { SeedEntry } from './seed'

export { checkEnglishGroup, passageText } from './checks'
export { clearEnglishBank, englishBankSize } from './bank'
export { clearEnglishModelHealth, modelHealthSnapshot } from './health'
export { clearSeedUsed, getEnglishSource, seedPoolSize, setEnglishSeed, setEnglishSource } from './seed'
export type { EnglishSource, SeedEntry } from './seed'

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

export type EnglishFailReason = 'rate-limit' | 'timeout' | 'unavailable' | 'quality' | 'network' | 'quota'

const MESSAGES: Record<EnglishFailReason, string> = {
  'rate-limit': 'Gemini is rate-limiting requests - wait about a minute and press Try again.',
  timeout: 'Gemini was too slow to respond - press Try again (questions already prepared are kept).',
  unavailable: "English questions aren't available right now (the question service isn't reachable or isn't set up).",
  quality: 'Too many generated questions failed the accuracy check - try again (questions already prepared are kept).',
  network: "Couldn't prepare enough English questions — check your connection and try again.",
  quota: 'The free-tier daily limit for this key is used up. Questions already prepared are saved, so press Try again later to resume. Enabling billing on the key, or using a second key, removes the limit.',
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
  /** Generate calls in flight at once (free-tier friendly; bursts trigger 503s). */
  genConcurrency: 3,
  /** Each API call start is delayed so it begins at least staggerMinMs (up to staggerMaxMs) after the previous one. */
  staggerMinMs: 400,
  staggerMaxMs: 800,
  /** Multiplies model cooldowns remembered by the client (tests shrink it; production keeps 1). */
  healthScale: 1,
  /** When every usable model is cooling for a short reason, wait for the soonest one only if it is at most this far away. */
  maxCooldownWaitMs: 60000,
  /** How many such waits one call may do. */
  noModelWaits: 3,
  /** Blind-solve calls in flight at once. */
  solveConcurrency: 3,
  /** Items per blind-solve call: small, because 'thinking' solvers time out on big chunks. */
  solveBatchSize: 8,
  /** Where two healthy providers exist, an item must be confirmed by two solvers of different families. */
  consensus: true,
  /** If the second solver is unavailable (or fails), accept the first solver's strict verdict instead of failing. */
  consensusFallback: true,
  /** Extra attempts per API call after the first, by failure class (the server walks the model chain itself). */
  retries: 2,
  rateLimitRetries: 3,
  timeoutRetries: 1,
  /** Backoff base for 5xx/network (doubles, jittered). */
  retryDelayMs: 800,
  /** Backoff base for 429 when the server gives no Retry-After (doubles, jittered); also capped by maxRetryAfterMs. */
  rateLimitBaseMs: 5000,
  maxRetryAfterMs: 20000,
  /** Must stay above the server's request deadline (56 s) and below its maxDuration (60 s). */
  requestTimeoutMs: 58000,
  /** No new round starts after this long. */
  deadlineMs: 150000,
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
  /** Per model: attempt counts by outcome class ('ok', 'quota-day', 'overload', ...), as reported by the server. */
  models: Record<string, Record<string, number>>
  /** Tokens used per model id, as reported by the providers. */
  tokens: Record<string, number>
  /** How independent the blind check was, per solved item: another provider / another model / the same model. */
  independence: { provider: number; model: number; same: number; unknown: number }
  /** Second-solver consensus per question: confirmed by both, disputed by the second, or only one solver available. */
  consensus: { confirmed: number; disagreed: number; single: number }
  /** Where the returned questions came from: the curated seed, the persisted AI bank, live AI generation. */
  source: { seed: number; bank: number; ai: number }
  /** Questions that had already been used in an earlier paper (a topic's curated pool was exhausted). */
  repeats: number
  /** Set when live AI generation failed (or fell short) and the curated bank filled the gap instead. */
  aiError?: { reason: EnglishFailReason; message: string }
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
    '  models (provider/model):',
    ...(Object.keys(st.models).length
      ? Object.entries(st.models).map(
          ([m, c]) =>
            `    ${m}: calls ${Object.values(c).reduce((a, b) => a + b, 0)} ok ${c.ok ?? 0} | 429 per-minute ${c['rate-minute'] ?? 0} per-day ${c['quota-day'] ?? 0} | 5xx ${c.overload ?? 0} timeouts ${(c.timeout ?? 0) + (c.network ?? 0)} unavailable ${c.unavailable ?? 0} | tokens ${st.tokens[m] ?? 0}`,
        )
      : ['    -']),
    `  source: curated seed ${st.source.seed} | persisted AI bank ${st.source.bank} | live AI ${st.source.ai} | repeats ${st.repeats}${st.aiError ? ` | AI problem (${st.aiError.reason}): ${st.aiError.message}` : ''}`,
    `  consensus (two solvers of different families): confirmed ${st.consensus.confirmed} | disputed ${st.consensus.disagreed} | single-solver ${st.consensus.single}`,
    `  solver independence: cross-provider ${st.independence.provider} | cross-model ${st.independence.model} | same-model ${st.independence.same} | unknown ${st.independence.unknown}`,
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

type FailClass = 'rate' | 'timeout' | 'network' | 'quality' | 'quota' | 'models' | 'wait' | 'noalt'

class ApiError extends Error {
  status: number
  fatal: boolean
  cls: FailClass
  retryable: boolean
  retryAfterMs: number
  /** For cls 'wait': how long until the soonest short-cooldown model recovers. */
  waitMs: number
  /** What to tell the user if retrying gives up (set for 'wait' failures). */
  hint: EnglishFailReason | null
  constructor(message: string, status: number, cls: FailClass, opts: { fatal?: boolean; retryable?: boolean; retryAfterMs?: number; waitMs?: number; hint?: EnglishFailReason } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.cls = cls
    this.fatal = !!opts.fatal
    this.retryable = opts.retryable ?? true
    this.retryAfterMs = opts.retryAfterMs ?? 0
    this.waitMs = opts.waitMs ?? 0
    this.hint = opts.hint ?? null
  }
}

interface Env {
  signal: AbortSignal | undefined
  stats: EnglishRunStats
  /** Shared cooldown: while it is in the future every call waits, so topics do not retry in lockstep. */
  cooldownUntil: number
  round: number
  /** Earliest next start per call kind (staggering). */
  nextStart: { generate: number; solve: number }
  /** Requests currently in flight per kind (the server spreads simultaneous calls across providers). */
  inFlight: { generate: number; solve: number }
}

interface ReplyMeta {
  attempts?: { model: string; status: number; ms?: number; class?: string; tokens?: number }[]
  modelHealth?: HealthUpdate[]
  chain?: string[]
  budgets?: BudgetUpdate[]
  independence?: 'provider' | 'model' | 'same' | 'unknown'
}
interface GenerateResponse {
  groups: Group[]
  meta?: ReplyMeta & { model?: string; droppedCount?: number; dropped?: string[] }
}
interface SolveResponse {
  model?: string
  results?: { id: string; answer: number | null; acceptable?: number[] | null; ambiguous: boolean }[]
  meta?: ReplyMeta
}

function record(env: Env, kind: 'generate' | 'solve', status: number | string, t0: number) {
  env.stats.calls.push({ kind, status, ms: Date.now() - t0, round: env.round, t0 })
  const k = statusKey(status)
  env.stats.http[k] = (env.stats.http[k] ?? 0) + 1
}

/** Folds the server's per-attempt report into the stats and its model-health updates into the client registry. */
function recordMeta(env: Env, meta: ReplyMeta | undefined | null) {
  if (!meta) return
  for (const a of meta.attempts ?? []) {
    if (!a || typeof a.model !== 'string') continue
    if (typeof a.tokens === 'number' && a.tokens > 0) env.stats.tokens[a.model] = (env.stats.tokens[a.model] ?? 0) + a.tokens
    const k = a.class ?? statusKey(a.status)
    const m = (env.stats.models[a.model] ??= {})
    m[k] = (m[k] ?? 0) + 1
    if (a.status !== 200) {
      const sk = statusKey(a.status)
      env.stats.upstream[sk] = (env.stats.upstream[sk] ?? 0) + 1
    }
  }
  applyHealthUpdates(meta.modelHealth, ENGLISH_TUNING.healthScale)
  applyBudgetUpdates(meta.budgets, ENGLISH_TUNING.healthScale)
}

const HOUR_MS = 3600000

/** Plain-language explanation that every usable model's DAILY quota is spent. */
function quotaMessage(chain: string[]): string {
  const now = Date.now()
  const spent = chain.map((m) => ({ m, e: healthState(m, now) })).filter((x) => x.e?.cls === 'quota-day')
  const names = spent.map((x) => x.m).join(', ')
  const soonest = spent.length ? Math.min(...spent.map((x) => x.e!.until - now)) : HOUR_MS
  const hours = Math.max(1, Math.round(soonest / HOUR_MS))
  const limit = spent.find((x) => /PerDay/i.test(x.e!.quotaId ?? '') && x.e!.quotaValue)?.e?.quotaValue
  return `The free-tier daily limit for this key is used up on every available model (${names}${limit ? `; ${limit} requests per day per model` : ''}). It resets in about ${hours} hour${hours === 1 ? '' : 's'}. Questions already prepared are saved, so press Try again later to resume. Enabling billing on the key, or using a second key, removes the limit.`
}

const modelsMessage = (chain: string[]) =>
  `The configured Gemini models are unavailable to this key (${chain.join(', ') || 'none configured'}). Set MOCK_ENGLISH_GENERATE_MODELS and MOCK_ENGLISH_SOLVE_MODELS to models your key can use.`

/** The server tried (or skipped) every model in its chain and none answered. Decide from the health registry whether
 *  to give up for good (daily quota / unavailable), wait briefly for the soonest short cooldown, or give up with the
 *  right reason when the wait would be long. A daily-quota error never causes a sleep. */
function decideNoModel(chain: string[], msg: string, attempts: { class?: string }[] = []): ApiError {
  const now = Date.now()
  const states = chain.map((m) => ({ m, e: healthState(m, now) }))
  const usable = states.filter((x) => !(x.e && (x.e.cls === 'quota-day' || x.e.cls === 'unavailable')))
  if (chain.length === 0 || usable.length === 0) {
    const anyQuota = states.some((x) => x.e?.cls === 'quota-day')
    return anyQuota ? new ApiError(quotaMessage(chain), 429, 'quota', { fatal: true, retryable: false }) : new ApiError(modelsMessage(chain), 503, 'models', { fatal: true, retryable: false })
  }
  const waits = usable.map((x) => (x.e ? Math.max(0, x.e.until - now) : 0))
  const soonest = Math.min(...waits)
  const soonestEntry = usable[waits.indexOf(soonest)].e
  // A cooldown that has already expired by now no longer says why the chain failed: fall back to this reply's own attempts.
  const lastClass = [...attempts].reverse().find((a) => a?.class && a.class !== 'ok')?.class
  const hint: EnglishFailReason = !soonestEntry ? (lastClass === 'timeout' ? 'timeout' : lastClass === 'rate-minute' || lastClass === 'overload' ? 'rate-limit' : 'network') : soonestEntry.cls === 'timeout' ? 'timeout' : soonestEntry.cls === 'network' ? 'network' : 'rate-limit'
  const tooLong = soonest > ENGLISH_TUNING.maxCooldownWaitMs
  return new ApiError(msg, 503, 'wait', { waitMs: soonest, hint, retryable: !tooLong })
}

async function stagger(env: Env, kind: 'generate' | 'solve') {
  const T = ENGLISH_TUNING
  const now = Date.now()
  const start = Math.max(now, env.nextStart[kind])
  env.nextStart[kind] = start + T.staggerMinMs + Math.random() * Math.max(0, T.staggerMaxMs - T.staggerMinMs)
  if (start > now) await sleep(start - now, env.signal)
}

async function attemptOnce(env: Env, kind: 'generate' | 'solve', body: unknown): Promise<{ data: unknown } | { failure: ApiError }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ENGLISH_TUNING.requestTimeoutMs)
  const onAbort = () => controller.abort()
  env.signal?.addEventListener('abort', onAbort, { once: true })
  const t0 = Date.now()
  const spread = env.inFlight[kind]
  env.inFlight[kind]++
  try {
    const res = await fetch('/api/mockEnglish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(body as object), skipModels: healthSkipList(Date.now()), budgets: budgetsForRequest(Date.now()), spread: spread }),
      signal: controller.signal,
    })
    if (res.ok) {
      const data = await res.json()
      record(env, kind, 200, t0)
      recordMeta(env, (data as { meta?: ReplyMeta } | null)?.meta)
      return { data }
    }
    const detail = (await res.json().catch(() => null)) as (ReplyMeta & { error?: string; code?: string; retryAfterMs?: number; unusable?: boolean }) | null
    record(env, kind, res.status, t0)
    recordMeta(env, detail)
    const msg = detail?.error || `Request failed (${res.status}).`
    if (detail?.code === 'no-alternative') return { failure: new ApiError(msg, 503, 'noalt', { retryable: false }) }
    if (detail?.code === 'no-model') return { failure: decideNoModel(detail.chain ?? [], msg, detail.attempts) }
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
    env.inFlight[kind]--
    clearTimeout(timer)
    env.signal?.removeEventListener('abort', onAbort)
  }
}

/** POST with class-aware handling. The server walks the model chain itself (skipping models the client knows are
 *  cooling), so a failed reply means the whole chain failed: daily quota / unavailable models give up at once; a short
 *  cooldown is waited out (through a cooldown shared by all calls) only if the soonest recovery is near; timeouts get
 *  one retry and plain 5xx/network two. Starts are staggered; all backoffs are jittered. */
async function postJson(env: Env, kind: 'generate' | 'solve', body: unknown): Promise<unknown> {
  const used = { rate: 0, timeout: 0, network: 0, quality: 0, wait: 0 }
  for (;;) {
    throwIfAborted(env.signal)
    const wait = env.cooldownUntil - Date.now()
    if (wait > 0) await sleep(wait, env.signal)
    await stagger(env, kind)
    const out = await attemptOnce(env, kind, body)
    if ('data' in out) return out.data
    const f = out.failure
    if (f.fatal || !f.retryable) throw f
    if (f.cls === 'wait') {
      if (++used.wait > ENGLISH_TUNING.noModelWaits) throw f
      env.stats.retries++
      env.cooldownUntil = Math.max(env.cooldownUntil, Date.now() + f.waitMs * (1 + Math.random() * 0.15))
      continue
    }
    const key = f.cls as 'rate' | 'timeout' | 'network' | 'quality'
    const limit = key === 'rate' ? ENGLISH_TUNING.rateLimitRetries : key === 'timeout' ? ENGLISH_TUNING.timeoutRetries : ENGLISH_TUNING.retries
    used[key]++
    if (used[key] > limit) throw f
    env.stats.retries++
    if (key === 'rate') {
      const base = f.retryAfterMs > 0 ? f.retryAfterMs : ENGLISH_TUNING.rateLimitBaseMs * 2 ** (used.rate - 1)
      const delay = Math.min(base, ENGLISH_TUNING.maxRetryAfterMs) * (0.8 + Math.random() * 0.4)
      env.cooldownUntil = Math.max(env.cooldownUntil, Date.now() + delay)
    } else {
      const base = ENGLISH_TUNING.retryDelayMs * 2 ** (key === 'network' ? used.network - 1 : 0)
      await sleep(base * (0.5 + Math.random()), env.signal)
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// Verification, trimming and selection
// ---------------------------------------------------------------------------------------------------

/** One solver's verdict on one question: its pick, and which options it judged fully acceptable. */
export interface SolverVerdict {
  /** provider/model that answered */
  model: string
  independence: 'provider' | 'model' | 'same' | 'unknown'
  answer: number | null
  /** Option indexes the solver judged fully correct (null if it did not say). */
  acceptable: number[] | null
  /** The solver found the ITEM faulty. */
  ambiguous: boolean
}
type Verdict = SolverVerdict | 'missing'
interface QState {
  v1?: Verdict
  v2?: Verdict
  /** A second-family solver was asked. */
  pass2: boolean
}

const onlyKey = (a: number[] | null | undefined, key: number) => !!a && a.length === 1 && a[0] === key

/** strict: the pick is the key AND the acceptable set is exactly {key} AND the item was not flagged faulty.
 *  lenient: the same, ignoring the item-level "ambiguous" flag only. */
function solverOk(v: Verdict | undefined, key: number, mode: 'strict' | 'lenient'): boolean {
  if (!v || v === 'missing' || v.answer !== key || !onlyKey(v.acceptable, key)) return false
  return mode === 'lenient' || !v.ambiguous
}

/** Judges one question from its one or two solver verdicts. With two solvers both must agree on the key; in lenient
 *  mode an extra acceptable option is tolerated only when just ONE of the two solvers flags it. */
function questionOk(st: QState | undefined, key: number, mode: 'strict' | 'lenient'): boolean {
  if (!st) return false
  const a = st.v1
  const b = st.v2
  if (b && b !== 'missing') {
    if (mode === 'strict') return solverOk(a, key, 'strict') && solverOk(b, key, 'strict')
    if (!a || a === 'missing' || a.answer !== key || b.answer !== key || !a.acceptable?.includes(key) || !b.acceptable?.includes(key)) return false
    const extraA = a.acceptable.filter((x) => x !== key)
    return !extraA.some((x) => b.acceptable!.includes(x))
  }
  if (st.pass2 && !ENGLISH_TUNING.consensusFallback) return false
  return solverOk(a, key, mode)
}

/** Answers that mean "nothing is wrong": the easy items a solver confirms readily (selection bias). */
const NO_ERROR_TOPICS = new Set<EnglishTopicId>(['error-detection', 'phrase-replacement', 'word-swap'])
export function isNoErrorQuestion(topic: EnglishTopicId, q: QuestionDraft): boolean {
  if (q.answer !== 4) return false
  return (topic === 'error-detection' && q.options[4] === 'No error') || (topic === 'phrase-replacement' && q.options[4] === 'No correction required') || (topic === 'word-swap' && q.options[4] === 'No interchange required')
}
/** At most 20% (rounded up) of a topic's questions in a paper may be no-error answers. */
const noErrCap = (topic: EnglishTopicId, count: number) => (NO_ERROR_TOPICS.has(topic) ? Math.ceil(0.2 * count) : Infinity)
const isNotTrueQuestion = (q: QuestionDraft) => /\b(?:NOT|EXCEPT|FALSE|INCORRECT|CANNOT)\b|not true|cannot be inferred/.test(q.stem)

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
function applyVerdicts(topic: EnglishTopicId, g: Group, states: (QState | undefined)[], mode: 'strict' | 'lenient', count: number): Group | null {
  const ok = g.questions.map((q, i) => questionOk(states[i], q.answer, mode))
  if (topic === 'cloze') {
    const failed = ok.map((p, i) => (p ? 0 : i + 1)).filter(Boolean)
    if (failed.length === 0) return g
    if (!ENGLISH_TUNING.clozeFillFailedBlanks) return null
    const verified = g.questions.length - failed.length
    if (verified < Math.min(ENGLISH_TUNING.clozeMinBlanks, g.questions.length) || failed.length > 2) return null
    // Never fill in a blank the solver could not answer at all.
    const unanswered = failed.some((k) => {
      const v = states[k - 1]?.v1
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
  if (topic === 'rc') {
    // Keep ordinary questions before "NOT true" ones, then restore the original order.
    const idx = g.questions.map((_, i) => i)
    const order = [...idx.filter((i) => !isNotTrueQuestion(g.questions[i])), ...idx.filter((i) => isNotTrueQuestion(g.questions[i]))].slice(0, keep).sort((x, y) => x - y)
    return { stimulus: g.stimulus, questions: order.map((i) => g.questions[i]) }
  }
  return { stimulus: g.stimulus, questions: g.questions.slice(0, keep) }
}

interface PoolEntry {
  g: Group
  /** Content key of the group as pooled/banked (stable even when the group is later trimmed). */
  key: string
  /** A standalone no-error-type question (see isNoErrorQuestion). */
  noErr: boolean
  origin: 'seed' | 'bank' | 'ai'
  /** curated entries: the seed id, and whether it had been used before (a repeat) */
  seedId?: string
  repeat?: boolean
}
const makeEntry = (topic: EnglishTopicId, g: Group, key: string, origin: PoolEntry['origin'] = 'ai'): PoolEntry => ({ g, key, noErr: !isSetTopic(topic) && isNoErrorQuestion(topic, g.questions[0]), origin })

/** Standalone selection: real-error items first, then no-error items up to the cap; original order kept. */
function pickStandalone(entries: PoolEntry[], need: number, cap: number): PoolEntry[] {
  const real = entries.filter((e) => !e.noErr)
  const ne = entries.filter((e) => e.noErr)
  const chosen = new Set([...real.slice(0, need), ...ne.slice(0, Math.min(cap, Math.max(0, need - real.length)))])
  return entries.filter((e) => chosen.has(e))
}

const isSetTopic = (t: EnglishTopicId) => t === 'rc' || t === 'cloze'
const size = (e: PoolEntry) => e.g.questions.length

/** Whole entries covering `need` questions: prefers the smallest single passage that covers it. */
function chooseEntries(topic: EnglishTopicId, entries: PoolEntry[], need: number): PoolEntry[] {
  if (!isSetTopic(topic)) return pickStandalone(entries, need, noErrCap(topic, need))
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
  if (!isSetTopic(topic)) return pickStandalone(entries, need, noErrCap(topic, need)).map((entry) => ({ g: entry.g, entry }))
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

/** Whole passages (rc/cloze) in random order covering `need` questions: one random covering passage, else a random greedy set. */
function chooseSeedEntries(topic: EnglishTopicId, entries: PoolEntry[], need: number, relax: boolean): PoolEntry[] {
  if (!isSetTopic(topic)) {
    const picked = pickStandalone(entries, need, noErrCap(topic, need))
    if (picked.length >= need || !relax) return picked
    // Last resort (the pool is exhausted): curated shortage must not fail a paper, so top up with the remaining
    // no-error items beyond the quota and count them as ordinary questions.
    return [...picked, ...entries.filter((e) => !picked.includes(e)).slice(0, need - picked.length).map((e) => ({ ...e, noErr: false }))]
  }
  const covering = entries.find((e) => size(e) >= need)
  if (covering) return [covering]
  const out: PoolEntry[] = []
  let have = 0
  for (const e of entries) {
    if (have >= need) break
    out.push(e)
    have += size(e)
  }
  return out
}

/** Draws `need` curated questions for one topic: the requested difficulty first, then the other one; never a question
 *  already in this paper (`taken`); unseen questions first (`used` = ids of earlier papers). When the unseen pool runs out
 *  the topic's used list is reset and the rest are repeats (better than failing). Answer positions are re-shuffled. */
function drawSeed(topic: EnglishTopicId, difficulty: MockDifficulty, need: number, taken: Set<string>, used: Set<string>): { entries: PoolEntry[]; repeats: number; reset: boolean } {
  const all = getSeedEntries(topic)
  const make = (e: SeedEntry, repeat: boolean): PoolEntry => ({ ...makeEntry(topic, shuffleGroupOptions(topic, e.group), `seed:${e.id}`, 'seed'), seedId: e.id, repeat })
  const pick = (cands: SeedEntry[], n: number, repeat: boolean): PoolEntry[] => {
    const ordered = [...shuffleArray(cands.filter((e) => e.difficulty === difficulty)), ...shuffleArray(cands.filter((e) => e.difficulty !== difficulty))]
    return chooseSeedEntries(topic, ordered.map((e) => make(e, repeat)), n, repeat)
  }
  let chosen = pick(all.filter((e) => !taken.has(e.id) && !used.has(e.id)), need, false)
  let got = chosen.reduce((n, e) => n + size(e), 0)
  let repeats = 0
  let reset = false
  if (got < need) {
    reset = true
    const ids = new Set(chosen.map((e) => e.seedId))
    const more = pick(all.filter((e) => !taken.has(e.id) && !ids.has(e.id)), need - got, true)
    repeats = more.reduce((n, e) => n + size(e), 0)
    chosen = [...chosen, ...more]
    got += repeats
  }
  for (const e of chosen) taken.add(e.seedId!)
  return { entries: chosen, repeats, reset }
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
  /** provider/model that generated the group */
  model: string
  states: QState[]
  /** Questions whose verification is not finished yet. */
  remaining: number
}
interface SolveItem {
  id: string
  cand: Cand
  qi: number
  pass: 1 | 2
  /** pass 2: the provider of the first solver, which the second must not be */
  exclude: string
}

/** How a verified question was produced and checked (for the review dump). */
export interface EnglishProvenance {
  generatedBy: string
  solvers: SolverVerdict[]
  consensus: 'confirmed' | 'single' | 'not-required'
  /** Accepted only through the lenient ladder (the item-level ambiguity flag was ignored). */
  lenient: boolean
}
let provenance = new Map<string, EnglishProvenance>()
const provKey = (q: QuestionDraft) => (q.topic === 'cloze' ? `cloze|${q.options.join('|')}` : `${q.stem}|${q.options.join('|')}`)
/** Provenance of a question returned by the most recent fetchEnglishPaper run (undefined for bank-drawn questions). */
export const getEnglishProvenance = (q: QuestionDraft): EnglishProvenance | undefined => provenance.get(provKey(q))
const providerOfId = (id: string) => id.split('/')[0]

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
  const stats: EnglishRunStats = { difficulty, total, outcome: 'running', rounds: 0, retries: 0, http: {}, upstream: {}, calls: [], topics: {}, models: {}, tokens: {}, independence: { provider: 0, model: 0, same: 0, unknown: 0 }, consensus: { confirmed: 0, disagreed: 0, single: 0 }, source: { seed: 0, bank: 0, ai: 0 }, repeats: 0, phaseMs: { generate: 0, solve: 0, total: 0 } }
  lastStats = stats
  provenance = new Map()
  const env: Env = { signal, stats, cooldownUntil: 0, round: 0, nextStart: { generate: 0, solve: 0 }, inFlight: { generate: 0, solve: 0 } }
  const tstat = (t: EnglishTopicId) => (stats.topics[t] ??= newTopicStats(t))

  const slots: Slot[] = requests.map((r) => ({ topic: r.topic, count: r.count, pool: [], have: 0, reserve: [] }))
  const topics = [...new Set(requests.map((r) => r.topic))]
  const seen = new Map<EnglishTopicId, SeenIndex>()
  for (const t of topics) {
    seen.set(t, new SeenIndex())
    tstat(t)
  }
  const slotsOf = (t: EnglishTopicId) => slots.filter((s) => s.topic === t)
  /** 'curated' (default): the curated seed only, no network at all. 'ai': persisted AI bank, then live generation, with the
   *  curated seed filling whatever the AI could not. */
  const curated = getEnglishSource() === 'curated'
  const seedTaken = new Map<EnglishTopicId, Set<string>>()
  const seedUsedBefore = new Map<EnglishTopicId, Set<string>>()
  const seedReset = new Set<EnglishTopicId>()
  const slotFor = (t: EnglishTopicId) => slotsOf(t).find((s) => s.have < s.count) ?? null
  /** "have" counts usable questions: real-error items plus no-error items up to the composition cap. */
  const recount = (slot: Slot) => {
    const cap = noErrCap(slot.topic, slot.count)
    if (cap === Infinity) {
      slot.have = slot.pool.reduce((n, e) => n + size(e), 0)
      return
    }
    const ne = slot.pool.filter((e) => e.noErr).length
    slot.have = slot.pool.length - ne + Math.min(ne, cap)
  }

  const progress = () => onProgress?.(
    slots.reduce((n, s) => n + Math.min(s.have, s.count), 0),
    total,
  )

  // Draw from the persistent bank first (entries stay in the bank until the paper succeeds).
  if (T.useBank && !curated) {
    for (const t of topics) {
      let avail: PoolEntry[] = bankRead(t, difficulty).map((e) => makeEntry(t, e.g, e.k, 'bank'))
      for (const e of avail) seen.get(t)!.add(e.g)
      for (const s of slotsOf(t)) {
        if (!avail.length) break
        const chosen = chooseEntries(t, avail, s.count)
        for (const e of chosen) {
          s.pool.push(e)
          tstat(t).fromBank += size(e)
        }
        recount(s)
        avail = avail.filter((e) => !chosen.includes(e))
      }
    }
    progress()
  }

  let fatal = null as ApiError | null
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

  const takeFromSeed = (slot: Slot, need: number) => {
    if (need <= 0) return
    const t = slot.topic
    if (!seedTaken.has(t)) seedTaken.set(t, new Set())
    if (!seedUsedBefore.has(t)) seedUsedBefore.set(t, seedUsedIds(t))
    const d = drawSeed(t, difficulty, need, seedTaken.get(t)!, seedUsedBefore.get(t)!)
    for (const e of d.entries) slot.pool.push(e)
    if (d.reset) seedReset.add(t)
    stats.repeats += d.repeats
    recount(slot)
    progress()
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
      slot.pool.push(makeEntry(topic, g, groupKey(g)))
      recount(slot)
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
      slot.pool.push(makeEntry(slot.topic, g, groupKey(g)))
      recount(slot)
      tstat(slot.topic).lenientUsed += g.questions.length
      progress()
    }
  }

  /** The solve chain spans more than one provider, so a second-family check was possible in principle. */
  const multiFamily = () => new Set(solveChain.map(providerOfId)).size >= 2
  const recordProvenance = (c: Cand, g: Group, lenient: boolean) => {
    for (const q of g.questions) {
      const i = c.g.questions.findIndex((x) => x.options.join('|') === q.options.join('|') && (q.topic === 'cloze' || x.stem === q.stem))
      const st = c.states[i < 0 ? 0 : i]
      const solvers = [st?.v1, st?.v2].filter((v): v is SolverVerdict => !!v && v !== 'missing')
      const second = st?.v2 && st.v2 !== 'missing'
      provenance.set(provKey(q), { generatedBy: c.model, solvers, consensus: second ? 'confirmed' : st?.pass2 || multiFamily() ? 'single' : 'not-required', lenient })
    }
  }

  const finalize = (c: Cand) => {
    const topic = c.slot.topic
    const ts = tstat(topic)
    c.g.questions.forEach((q, i) => {
      const st = c.states[i]
      const v1 = st?.v1
      const v2 = st?.v2
      if (!v1 || v1 === 'missing' || v1.answer === null) ts.missing++
      else if (v1.answer !== q.answer || (v2 && v2 !== 'missing' && v2.answer !== q.answer)) ts.disagree++
      else if (questionOk(st, q.answer, 'strict')) ts.agree++
      else ts.ambiguous++
      if (st?.pass2) {
        if (v2 && v2 !== 'missing') {
          if (questionOk(st, q.answer, 'strict')) stats.consensus.confirmed++
          else stats.consensus.disagreed++
        } else stats.consensus.single++
      } else if (multiFamily() && v1 && v1 !== 'missing' && v1.answer === q.answer) stats.consensus.single++
    })
    const strict = applyVerdicts(topic, c.g, c.states, 'strict', c.slot.count)
    if (strict) {
      // Filling in a cloze blank rewrites the passage, so re-check the rewritten group.
      const final = topic === 'cloze' && strict !== c.g ? checkEnglishGroup(topic, difficulty, strict).group : strict
      if (final) {
        recordProvenance(c, final, false)
        mergeStrict(topic, final)
      }
      return
    }
    const lenient = applyVerdicts(topic, c.g, c.states, 'lenient', c.slot.count)
    if (lenient) {
      const final = topic === 'cloze' && lenient !== c.g ? checkEnglishGroup(topic, difficulty, lenient).group : lenient
      if (final) {
        recordProvenance(c, final, true)
        c.slot.reserve.push(final)
      }
    }
  }

  // ---- blind solve queues: pooled across topics, dispatched in full chunks as candidates arrive. Pass 1 is the
  // normal blind solve; pass 2 (consensus) asks a solver of ANOTHER family to confirm what pass 1 accepted.
  const queues = new Map<string, SolveItem[]>()
  const inflight: Promise<void>[] = []
  let solveChain: string[] = []
  const noteFailure = (err: unknown) => {
    if (err instanceof ApiError) {
      if (err.fatal) fatal = err
      else if (err.cls === 'wait') roundFailures[err.hint === 'timeout' ? 'timeout' : err.hint === 'network' ? 'network' : 'rate']++
      else if (err.cls === 'quota' || err.cls === 'models') fatal = err
      else if (err.cls !== 'noalt') roundFailures[err.cls]++
    }
  }
  const completeQuestion = (c: Cand) => {
    if (--c.remaining === 0) finalize(c)
  }
  const consensusPossible = (v1: SolverVerdict) => {
    if (!T.consensus) return false
    const healthy = [...new Set(solveChain.filter((m) => !healthState(m)).map(providerOfId))]
    return healthy.length >= 2 && healthy.some((p) => p !== providerOfId(v1.model))
  }
  const onVerdict = (it: SolveItem, v: Verdict) => {
    const st = it.cand.states[it.qi]
    if (it.pass === 2) {
      st.v2 = v
      completeQuestion(it.cand)
      return
    }
    st.v1 = v
    const q = it.cand.g.questions[it.qi]
    if (v !== 'missing' && v.answer === q.answer && v.acceptable?.includes(q.answer) && v.model && consensusPossible(v)) {
      st.pass2 = true
      enqueue({ id: `${it.id}b`, cand: it.cand, qi: it.qi, pass: 2, exclude: providerOfId(v.model) })
      return
    }
    completeQuestion(it.cand)
  }
  const dispatch = (chunk: SolveItem[]) => {
    const pass = chunk[0].pass
    const exclude = chunk[0].exclude
    const p = solveGate
      .run(async () => {
        throwIfAborted(signal)
        const counts = new Map<string, number>()
        for (const it of chunk) counts.set(it.cand.model, (counts.get(it.cand.model) ?? 0) + 1)
        const model = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
        const results = new Map<string, { answer: number | null; acceptable: number[] | null; ambiguous: boolean }>()
        let solver = ''
        let independence: SolverVerdict['independence'] = 'unknown'
        try {
          const data = (await postJson(env, 'solve', {
            action: 'solve',
            avoidModel: model || undefined,
            excludeProviders: pass === 2 ? [exclude] : undefined,
            items: chunk.map((it) => {
              const q = it.cand.g.questions[it.qi]
              return { id: it.id, topic: it.cand.slot.topic, passage: passageText(it.cand.g) || undefined, stem: q.stem, options: q.options }
            }),
          })) as SolveResponse | null
          solver = typeof data?.model === 'string' ? data.model : ''
          independence = data?.meta?.independence ?? 'unknown'
          env.stats.independence[independence] += chunk.length
          if (data?.meta?.chain?.length) solveChain = data.meta.chain
          for (const r of data?.results ?? []) {
            if (r && typeof r.id === 'string') results.set(r.id, { answer: Number.isInteger(r.answer) ? (r.answer as number) : null, acceptable: Array.isArray(r.acceptable) ? r.acceptable.filter((x) => Number.isInteger(x)) : null, ambiguous: r.ambiguous !== false })
          }
        } catch (err) {
          if (signal?.aborted) throw abortError()
          noteFailure(err)
          results.clear()
        }
        for (const it of chunk) {
          const r = results.get(it.id)
          onVerdict(it, r ? { model: solver, independence, answer: r.answer, acceptable: r.acceptable, ambiguous: r.ambiguous } : 'missing')
        }
      })
      .catch((err) => {
        runError ??= err
      })
    inflight.push(p)
  }
  const enqueue = (it: SolveItem) => {
    const key = it.pass === 1 ? 'p1' : `p2|${it.exclude}`
    const q = queues.get(key) ?? []
    queues.set(key, q)
    q.push(it)
    if (q.length >= T.solveBatchSize) dispatch(q.splice(0, T.solveBatchSize))
  }
  const flushItems = async () => {
    for (;;) {
      for (const q of queues.values()) if (q.length) dispatch(q.splice(0))
      if (inflight.length === 0) break
      await Promise.all(inflight.splice(0))
    }
  }

  let nextId = 0
  const generateTask = async (slot: Slot, ask: number) => {
    if (slot.have >= slot.count || fatal || runError) return
    throwIfAborted(signal)
    const topic = slot.topic
    const ts = tstat(topic)
    ts.asked += ask
    // Once the no-error quota of a topic is filled, every further item MUST contain a real error.
    const cap = noErrCap(topic, slot.count)
    const noError = cap === Infinity || slot.pool.filter((e) => e.noErr).length < cap
    try {
      const data = (await postJson(env, 'generate', { action: 'generate', topic, difficulty, count: ask, noError, seed: Math.floor(Math.random() * 0x7fffffff) })) as GenerateResponse | null
      if (!data || !Array.isArray(data.groups)) throw new ApiError('malformed generate response', 200, 'network')
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
        const cand: Cand = { slot, g: checked.group, model, states: checked.group.questions.map(() => ({ pass2: false })), remaining: checked.group.questions.length }
        const cid = nextId++
        checked.group.questions.forEach((_, qi) => items.push({ id: `${cid}.${qi}`, cand, qi, pass: 1, exclude: '' }))
      }
      items.forEach(enqueue)
    } catch (err) {
      if (signal?.aborted) throw abortError()
      noteFailure(err)
      if (err instanceof ApiError && (err.cls === 'timeout' || (err.cls === 'wait' && err.hint === 'timeout'))) timeouts[topic] = (timeouts[topic] ?? 0) + 1
      // Anything else: this batch yields nothing; the next round compensates.
    }
  }

  const finishRun = (outcome: EnglishRunStats['outcome']) => {
    stats.outcome = outcome
    stats.phaseMs = { generate: phaseWall(stats.calls, 'generate'), solve: phaseWall(stats.calls, 'solve'), total: Date.now() - startedAt }
    // Curated runs make no API calls, so there is nothing worth printing; the table is for diagnosing AI runs.
    if (T.logSummary && stats.calls.length > 0) console.info(formatEnglishRunStats(stats))
  }

  try {
    let deadlineHit = false
    if (curated) {
      for (const s of slots) takeFromSeed(s, s.count)
      const empty = slots.find((s) => s.have < s.count)
      if (empty) {
        finishRun('unavailable')
        throw new EnglishPrepareError('unavailable', `The curated English question bank has no questions for ${empty.topic} yet. Add content/english/${empty.topic}-*.json and run scripts/build-english-seed.ts, or switch the English source to AI.`)
      }
    }
    for (let round = 1; round <= (curated ? 0 : T.maxRounds); round++) {
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
    let stillShort = slots.some((s) => s.have < s.count)
    if (stillShort) {
      let reason: EnglishFailReason
      const f = roundFailures
      const failTotal = f.rate + f.timeout + f.network
      let message: string | undefined
      if (fatal) {
        reason = fatal.cls === 'quota' ? 'quota' : 'unavailable'
        if (fatal.cls === 'quota' || fatal.cls === 'models') message = fatal.message
      } else if (failTotal > 0 && failTotal >= f.quality) reason = f.rate >= f.timeout && f.rate >= f.network ? 'rate-limit' : f.timeout >= f.network ? 'timeout' : 'network'
      else if (deadlineHit) reason = 'timeout'
      else if (stats.calls.length === 0) reason = 'network'
      else reason = 'quality'
      const failure = new EnglishPrepareError(reason, message)
      // Degrade to the curated bank instead of failing the paper.
      for (let attempt = 0; attempt < 2; attempt++) for (const s of slots) if (s.have < s.count) takeFromSeed(s, s.count - s.have)
      stillShort = slots.some((s) => s.have < s.count)
      if (stillShort) {
        finishRun(reason)
        throw failure
      }
      stats.aiError = { reason, message: failure.message }
    }

    const results: Group[][] = []
    const seedIdsUsed = new Map<EnglishTopicId, { all: string[]; repeats: string[] }>()
    const usedKeys = new Map<EnglishTopicId, string[]>()
    for (const s of slots) {
      const picked = pickGroups(s.topic, s.pool, s.count)
      results.push(picked.map((p) => p.g))
      for (const p of picked) {
        stats.source[p.entry.origin] += p.g.questions.length
        if (p.entry.seedId) {
          const rec = seedIdsUsed.get(s.topic) ?? { all: [], repeats: [] }
          rec.all.push(p.entry.seedId)
          if (p.entry.repeat) rec.repeats.push(p.entry.seedId)
          seedIdsUsed.set(s.topic, rec)
        }
      }
      const keys = usedKeys.get(s.topic) ?? []
      for (const p of picked) keys.push(p.entry.key)
      usedKeys.set(s.topic, keys)
    }
    // Last line of defence: exact counts and the structural contract.
    results.forEach((groups, i) => {
      const n = groups.reduce((a, g) => a + g.questions.length, 0)
      if (n !== slots[i].count || groups.some((g) => g.questions.some((q) => validateDraft(q)))) throw new EnglishPrepareError('quality')
    })
    for (const [t, rec] of seedIdsUsed) saveSeedUsed(t, seedReset.has(t) && rec.repeats.length ? rec.repeats : rec.all, seedReset.has(t))
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
