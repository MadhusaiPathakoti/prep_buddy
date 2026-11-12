import { normalizeSentence, pickOptionsPreferStarted, rankStartedRules, shuffle, type GrammarRule, type SpotQuestion, type SpotScope } from './grammarRules'
import { pickMany, randomSeed } from './freshSentenceSeeds'

/**
 * "Fresh Sentences": every question is a sentence an AI writes on the spot for a rule the learner has already started,
 * never one from the rulebook. Randomness comes from three layers: a random theme / register / length / prompt words / name
 * chosen here for every single question, a random seed on the server call, and a per-rule memory of recent sentences
 * (kept in this browser) that is sent back as "do not repeat" and also used to reject repeats.
 */

export interface FreshSlot {
  rule: GrammarRule
  kind: 'broken' | 'illustrates'
}

interface ApiResult {
  n: number
  sentence: string
  fix?: string
  note: string
}

const BATCH_SIZE = 4
const MAX_CONCURRENT = 3
const BATCH_TIMEOUT_MS = 14000
const RETRY_DELAY_MS = 800
const SHARE_BROKEN = 0.65

// ─── Recent-sentence memory ──────────────────────────────────────────────────

// NB: not "prepbuddy:grammar-fresh:history", which is where the game's session stats (addSession) already live.
const HISTORY_KEY = 'prepbuddy:grammar-fresh:sentences'
const HISTORY_PER_RULE = 12

type History = Record<number, string[]>

function loadHistory(): History {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function saveHistory(h: History) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h))
  } catch {
    // storage unavailable: repeats are then only avoided within a session
  }
}

// ─── Slots ───────────────────────────────────────────────────────────────────

/** One slot per question: rules are visited in priority order (struggling / due first) and revisited, with the opposite kind, if the count outruns the pool. */
export function buildFreshSlots(scope: SpotScope, count: number): FreshSlot[] {
  const ranked = rankStartedRules(scope)
  if (ranked.length === 0) return []
  const slots: FreshSlot[] = []
  const last = new Map<number, FreshSlot['kind']>()
  while (slots.length < count) {
    for (const rule of ranked) {
      if (slots.length >= count) break
      const canBreak = rule.pairs.length > 0
      const prev = last.get(rule.id)
      const kind: FreshSlot['kind'] = !canBreak ? 'illustrates' : prev ? (prev === 'broken' ? 'illustrates' : 'broken') : Math.random() < SHARE_BROKEN ? 'broken' : 'illustrates'
      last.set(rule.id, kind)
      slots.push({ rule, kind })
    }
  }
  return shuffle(slots)
}

// ─── Requests ────────────────────────────────────────────────────────────────

function toItem(slot: FreshSlot, history: History) {
  const r = slot.rule
  const examples = [
    ...pickMany(r.pairs, 3).map((p) => `✗ ${p.wrong} → ✓ ${p.right}`),
    ...pickMany(r.correct, 2).map((c) => `✓ ${c}`),
  ]
  return {
    kind: slot.kind === 'broken' ? 'broken' : 'correct',
    title: r.title,
    summary: r.summary,
    explanation: r.explanation.slice(0, 1200),
    examples,
    ...randomSeed(),
    avoid: (history[r.id] ?? []).slice(-5),
  }
}

/** `timedOut` is set when the request hung rather than failed: retrying a hang would only double the wait. */
async function postBatch(items: ReturnType<typeof toItem>[]): Promise<{ results: ApiResult[]; timedOut: boolean }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BATCH_TIMEOUT_MS)
  try {
    const res = await fetch('/api/freshSentences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
      signal: controller.signal,
    })
    if (!res.ok) return { results: [], timedOut: false }
    const data = await res.json()
    return { results: Array.isArray(data.results) ? data.results : [], timedOut: false }
  } catch (err) {
    return { results: [], timedOut: err instanceof DOMException && err.name === 'AbortError' }
  } finally {
    clearTimeout(timer)
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const wordCount = (s: string) => s.trim().split(/\s+/).length

function bookSentences(rule: GrammarRule): Set<string> {
  return new Set([...rule.pairs.flatMap((p) => [p.wrong, p.right]), ...rule.correct].map(normalizeSentence))
}

/** A result is only accepted if it is really new (not in the book, not seen recently, not already used this session) and, for errors, a believable one-fix edit. */
function accept(slot: FreshSlot, r: ApiResult, history: History, used: Set<string>): boolean {
  if (!r || typeof r.sentence !== 'string' || typeof r.note !== 'string') return false
  const norm = normalizeSentence(r.sentence)
  if (norm.length < 8 || used.has(norm) || bookSentences(slot.rule).has(norm)) return false
  if ((history[slot.rule.id] ?? []).some((h) => normalizeSentence(h) === norm)) return false
  if (slot.kind === 'broken') {
    if (typeof r.fix !== 'string') return false
    const fix = normalizeSentence(r.fix)
    if (!fix || fix === norm || bookSentences(slot.rule).has(fix)) return false
    // one mistake means one small edit: a wholesale rewrite is the model drifting off the brief
    if (Math.abs(wordCount(r.sentence) - wordCount(r.fix)) > 4) return false
  }
  return true
}

/**
 * Generates one question per slot: small batches at capped concurrency, then one top-up pass (with fresh random ingredients)
 * for any slot that failed. May return fewer questions than slots; returns [] when the AI is unreachable.
 */
export async function generateFreshQuestions(slots: FreshSlot[], onProgress?: (done: number, total: number) => void): Promise<SpotQuestion[]> {
  const history = loadHistory()
  const used = new Set<string>()
  const out = new Map<number, SpotQuestion>() // slot index -> question

  async function runBatch(indices: number[]) {
    const batchSlots = indices.map((i) => slots[i])
    const items = batchSlots.map((s) => toItem(s, history))
    const first = await postBatch(items)
    let results = first.results
    if (results.length === 0 && !first.timedOut) {
      await sleep(RETRY_DELAY_MS)
      results = (await postBatch(items)).results
    }
    for (const r of results) {
      const at = Number(r?.n) - 1
      const slot = batchSlots[at]
      if (!slot || out.has(indices[at]) || !accept(slot, r, history, used)) continue
      used.add(normalizeSentence(r.sentence))
      out.set(indices[at], {
        id: `fresh-${slot.rule.id}-${Math.random().toString(36).slice(2, 8)}`,
        ruleId: slot.rule.id,
        kind: slot.kind,
        sentence: r.sentence,
        fix: slot.kind === 'broken' ? r.fix : undefined,
        note: r.note,
        options: pickOptionsPreferStarted(slot.rule),
      })
    }
    onProgress?.(out.size, slots.length)
  }

  async function runAll(indices: number[]) {
    const batches: number[][] = []
    for (let i = 0; i < indices.length; i += BATCH_SIZE) batches.push(indices.slice(i, i + BATCH_SIZE))
    let next = 0
    const worker = async () => {
      while (next < batches.length) await runBatch(batches[next++])
    }
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, batches.length) }, worker))
  }

  await runAll(slots.map((_, i) => i))
  const missing = slots.map((_, i) => i).filter((i) => !out.has(i))
  if (missing.length > 0 && out.size > 0) await runAll(missing) // only worth a second pass if the AI is answering at all

  // remember what was written so the next session steers away from it
  for (const [i, q] of out) {
    const id = slots[i].rule.id
    history[id] = [...(history[id] ?? []), q.sentence].slice(-HISTORY_PER_RULE)
  }
  if (out.size > 0) saveHistory(history)

  return shuffle([...out.values()])
}
