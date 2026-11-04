// Harness for the Mocks English pipeline (api/mockEnglish.js + src/lib/mocks/english/index.ts).
//
//   npx tsx scripts/verify-mocks-english.ts                 stubbed-Gemini suite (always runs); live smoke test if GEMINI_API_KEY is set
//   npx tsx scripts/verify-mocks-english.ts --only <name>   run only suites whose name contains <name>
//   npx tsx scripts/verify-mocks-english.ts --print-prompts print the schemas and two full generate prompts
//   npx tsx scripts/verify-mocks-english.ts --live-paper    needs GEMINI_API_KEY: times a real full PO English section, prints
//                                                           the diagnostics summary and per-call latency percentiles
//   npx tsx scripts/verify-mocks-english.ts --live [N]      needs GEMINI_API_KEY: N items per topic/difficulty, prints
//                                                           deterministic-drop and generator-vs-solver disagreement rates
//
// The suite stubs globalThis.fetch: "/api/mockEnglish" is routed into the real Vercel handler (fake req/res) and
// Gemini URLs are routed to an emulator whose behaviour each test configures. Exits non-zero on any failure.

import handler from '../api/mockEnglish.js'
import {
  ENGLISH_TUNING,
  EnglishPrepareError,
  checkEnglishGroup,
  clearEnglishBank,
  englishBankSize,
  fetchEnglishGroups,
  fetchEnglishPaper,
  formatEnglishRunStats,
  getLastEnglishRunStats,
  percentile,
} from '../src/lib/mocks/english/index'
import type { EnglishRequest } from '../src/lib/mocks/english/index'
import { BANK_CAP, BANK_KEY, bankAdd, bankRead, bankRemove } from '../src/lib/mocks/english/bank'
import { assertGroup } from '../src/lib/mocks/validate'
import { composePaper } from '../src/lib/mocks/compose'
import { EXAMS, entryTotal } from '../src/lib/mocks/blueprints'
import { writeFileSync } from 'node:fs'
import type { EnglishTopicId, Group, MockDifficulty } from '../src/lib/mocks/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

const TOPICS: EnglishTopicId[] = ['rc', 'cloze', 'error-detection', 'para-jumble', 'fillers', 'word-swap', 'phrase-replacement', 'match-column']
const DIFFS: MockDifficulty[] = ['medium', 'hard']

const argv = process.argv.slice(2)
const realKey = process.env.GEMINI_API_KEY
const realFetch = globalThis.fetch
const liveIdx = argv.indexOf('--live')

// ---------------------------------------------------------------------------------------------------
// Tiny test framework
// ---------------------------------------------------------------------------------------------------

let passed = 0
const failures: string[] = []
let currentSuite = ''
let suiteStart = Date.now()
function suite(name: string) {
  if (currentSuite && Date.now() - suiteStart > 3000) console.log(`   (previous suite took ${((Date.now() - suiteStart) / 1000).toFixed(1)} s)`)
  suiteStart = Date.now()
  currentSuite = name
  console.log(`\n== ${name}`)
}
function check(cond: unknown, msg: string) {
  if (cond) {
    passed++
  } else {
    failures.push(`[${currentSuite}] ${msg}`)
    console.log(`  FAIL: ${msg}`)
  }
}
async function expectThrows(fn: () => Promise<unknown>, msg: string, test?: (e: Error) => boolean): Promise<Error | null> {
  try {
    await fn()
  } catch (e) {
    const err = e as Error
    check(!test || test(err), `${msg} (threw "${err?.message}")`)
    return err
  }
  check(false, `${msg} (did not throw)`)
  return null
}

// ---------------------------------------------------------------------------------------------------
// Content makers: emit model-schema JSON with known keys (pseudo-words keep every item unique)
// ---------------------------------------------------------------------------------------------------

function mkRng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const SYL = ['ba', 'ko', 'ri', 'mu', 'te', 'sa', 'lo', 'ne', 'vi', 'du', 'pa', 'zo', 'fe', 'gi', 'ha', 'jo', 'ku', 'ma', 'no', 'ru']
let UID = 1000
let R = mkRng(1)
const ri = (min: number, max: number) => min + Math.floor(R() * (max - min + 1))
const pseudo = () => Array.from({ length: ri(2, 3) }, () => SYL[ri(0, SYL.length - 1)]).join('')
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const sentence = (n: number) => {
  const w = Array.from({ length: n }, pseudo)
  w[0] = cap(w[0])
  return w.join(' ') + '.'
}
const optionSet = (prefix = '') => Array.from({ length: 5 }, (_, i) => `${prefix}${pseudo()}${'abcde'[i]}`)
const expl = () => `The rule applies because ${pseudo()} governs ${pseudo()} here (ref ${++UID}).`

function makePassage(words: number, extra: string[]): string[] {
  const per = 13
  const n = Math.ceil(words / per)
  const sents = Array.from({ length: n }, () => sentence(per).split(' '))
  extra.forEach((w, i) => (sents[0][2 + i * 3] = w))
  const flat = sents.map((s) => s.join(' '))
  const mid = Math.ceil(flat.length / 2)
  return [flat.slice(0, mid).join(' '), flat.slice(mid).join(' ')]
}

const RC_KINDS = ['main-idea', 'inference', 'true', 'not-true', 'tone', 'vocab-synonym', 'vocab-antonym', 'may-be-true', 'inference', 'true', 'inference', 'not-true']
function mkRcQuestion(kind: string, i: number) {
  const vocab = kind.startsWith('vocab')
  return {
    kind,
    targetWord: vocab ? (kind === 'vocab-synonym' ? 'prudent' : 'volatile') : '',
    stem: vocab ? 'placeholder stem replaced by server' : `What does the passage say about ${pseudo()} ${pseudo()} and ${pseudo()} in relation to ${pseudo()} ${pseudo()}${kind === 'not-true' ? ' (which is NOT stated)' : ''}?`,
    options: vocab ? optionSet() : Array.from({ length: 5 }, () => `${cap(pseudo())} ${pseudo()} ${pseudo()} ${pseudo()} ${pseudo()}.`),
    correctIndex: i % 5,
    explanation: expl(),
  }
}
function mkRc(count: number, diff: MockDifficulty) {
  const kinds = Array.from({ length: count }, (_, i) => RC_KINDS[i % RC_KINDS.length])
  return { passages: [{ title: 'Working title', paragraphs: makePassage(diff === 'hard' ? 400 : 280, ['prudent', 'volatile']), questions: kinds.map((k, i) => mkRcQuestion(k, i)) }] }
}
function mkCloze(count: number) {
  const nSent = 11
  const sents = Array.from({ length: nSent }, () => sentence(15).split(' '))
  for (let j = 1; j <= count; j++) sents[Math.min(nSent - 1, Math.floor((j * nSent) / (count + 1)))][6] = `(${j}) ______`
  const text = sents.map((s) => s.join(' ')).join(' ')
  return { passages: [{ title: 'Working title', text, blanks: Array.from({ length: count }, (_, j) => ({ n: j + 1, options: optionSet(), correctIndex: j % 5, explanation: expl() })) }] }
}
function mkEdItem(i: number) {
  if (i % 5 === 3) return { variant: 'sentences', topic: 'agreement', sentences: Array.from({ length: 5 }, () => sentence(10)), correctIndex: i % 5, explanation: expl() }
  const parts = Array.from({ length: 4 }, () => Array.from({ length: ri(4, 5) }, pseudo).join(' '))
  return { variant: 'parts', topic: 'tense', parts, errorPartIndex: i % 5 === 1 ? null : i % 4, explanation: expl() }
}
function mkPjItem(i: number) {
  return { theme: 'banking', sentences: Array.from({ length: i % 2 ? 6 : 5 }, () => sentence(9)), explanation: expl() }
}
function mkFillerItem(i: number) {
  if (i % 2 === 0) {
    const w = Array.from({ length: 12 }, pseudo)
    w.splice(5, 0, '______')
    return { type: 'single', sentence: cap(w.join(' ')) + '.', options: optionSet(), correctIndex: i % 5, explanation: expl() }
  }
  const w = Array.from({ length: 14 }, pseudo)
  w.splice(3, 0, '(A) ______')
  w.splice(9, 0, '(B) ______')
  return {
    type: 'double',
    sentence: cap(w.join(' ')) + '.',
    options: Array.from({ length: 5 }, (_, k) => [`${pseudo()}${'abcde'[k]}`, `${pseudo()}${'vwxyz'[k]}`]),
    correctIndex: i % 5,
    explanation: expl(),
  }
}
function mkWsItem(i: number) {
  const tokens = Array.from({ length: 12 }, pseudo)
  tokens[0] = cap(tokens[0])
  const marked = [2, 4, 6, 8]
  marked.forEach((m, k) => (tokens[m] = tokens[m] + 'xyzw'[k]))
  tokens[11] += '.'
  const swaps = [[0, 2], [1, 3], [0, 1], [2, 3], [0, 3], null]
  return { tokens, marked, swap: swaps[i % 6], explanation: expl() }
}
function mkPrItem(i: number) {
  if (i % 5 === 3) {
    const w = Array.from({ length: 12 }, pseudo)
    w.splice(4, 0, '______')
    return { variant: 'usage', sentence: cap(w.join(' ')) + '.', options: optionSet(), correctIndex: i % 5, explanation: expl() }
  }
  return {
    variant: 'replace',
    before: Array.from({ length: 5 }, pseudo).join(' '),
    phrase: Array.from({ length: 3 }, pseudo).join(' '),
    after: Array.from({ length: 4 }, pseudo).join(' ') + '.',
    options: Array.from({ length: 4 }, (_, k) => `${pseudo()} ${pseudo()}${'abcd'[k]}`),
    correctIndex: i % 5 === 4 ? null : i % 4,
    explanation: expl(),
  }
}
function mkMcItem() {
  return {
    pairs: Array.from({ length: 4 }, (_, k) => ({
      begin: `${cap(pseudo())}${'abcd'[k]} ${Array.from({ length: 5 }, pseudo).join(' ')}`,
      end: `${Array.from({ length: 5 }, pseudo).join(' ')}.`,
    })),
    explanation: expl(),
  }
}

function makeGenerated(topic: EnglishTopicId, diff: MockDifficulty, count: number): any {
  switch (topic) {
    case 'rc':
      return mkRc(count, diff)
    case 'cloze':
      return mkCloze(count)
    case 'error-detection':
      return { items: Array.from({ length: count }, (_, i) => mkEdItem(i + ri(0, 4))) }
    case 'para-jumble':
      return { items: Array.from({ length: count }, (_, i) => mkPjItem(i + ri(0, 1))) }
    case 'fillers':
      return { items: Array.from({ length: count }, (_, i) => mkFillerItem(i + ri(0, 1))) }
    case 'word-swap':
      return { items: Array.from({ length: count }, (_, i) => mkWsItem(i + ri(0, 5))) }
    case 'phrase-replacement':
      return { items: Array.from({ length: count }, (_, i) => mkPrItem(i + ri(0, 4))) }
    case 'match-column':
      return { items: Array.from({ length: count }, () => mkMcItem()) }
  }
}

/** Mutators producing one malformed MODEL item per class (rc: a question; cloze: a passage; others: an item). */
const BAD_ITEM: Record<EnglishTopicId, [string, (x: any) => void][]> = {
  rc: [
    ['four options', (q) => q.options.pop()],
    ['duplicate options', (q) => (q.options[1] = q.options[0])],
    ['bad correctIndex', (q) => (q.correctIndex = 7)],
    ['vocab target absent from passage', (q) => ((q.kind = 'vocab-synonym'), (q.targetWord = 'zzqxj'))],
    ['not-true without NOT', (q) => ((q.kind = 'not-true'), (q.stem = 'What does the passage say about the economy and growth in detail?'))],
    ['backtick markdown', (q) => ((q.kind = 'inference'), (q.stem = 'What does `the passage` suggest about growth and its many effects?'))],
    ['TODO placeholder', (q) => (q.explanation = 'TODO write the explanation properly')],
    ['stem too short', (q) => ((q.kind = 'inference'), (q.stem = 'Why?'))],
  ],
  cloze: [
    ['skipped blank number', (p) => (p.text = p.text.replace('(2) ______', '(3) ______'))],
    ['blank text missing', (p) => (p.text = p.text.replace('(2) ______', 'word'))],
    ['option count', (p) => p.blanks[0].options.pop()],
    ['passage too short', (p) => (p.text = '(1) ______ (2) ______ short passage only.')],
    ['duplicate options', (p) => (p.blanks[1].options[1] = p.blanks[1].options[0])],
    ['blanks list mismatch', (p) => p.blanks.pop()],
  ],
  'error-detection': [
    ['three parts', (x) => ((x.variant = 'parts'), (x.parts = ['a b c d', 'e f g h', 'i j k l']))],
    ['bad errorPartIndex', (x) => ((x.variant = 'parts'), (x.parts = ['aa bb cc dd', 'ee ff gg hh', 'ii jj kk ll', 'mm nn oo pp']), (x.errorPartIndex = 9))],
    ['part contains label', (x) => ((x.variant = 'parts'), (x.parts = ['aa bb cc dd', 'ee (b) gg hh', 'ii jj kk ll', 'mm nn oo pp']), (x.errorPartIndex = 1))],
    ['four sentences', (x) => ((x.variant = 'sentences'), (x.sentences = x.sentences || Array.from({ length: 4 }, () => sentence(10))), x.sentences.length === 5 && x.sentences.pop())],
    ['as an AI text', (x) => ((x.variant = 'parts'), (x.parts = ['aa bb cc dd', 'ee ff gg hh', 'ii jj kk ll', 'As an AI I cannot do that']), (x.errorPartIndex = 0))],
    ['empty part', (x) => ((x.variant = 'parts'), (x.parts = ['aa bb cc dd', '', 'ii jj kk ll', 'mm nn oo pp']), (x.errorPartIndex = 0))],
  ],
  'para-jumble': [
    ['four sentences', (x) => (x.sentences = x.sentences.slice(0, 4))],
    ['duplicate sentences', (x) => (x.sentences[2] = x.sentences[1])],
    ['opener needs antecedent', (x) => (x.sentences[0] = 'This is the reason why the matter was settled quickly.')],
    ['unterminated sentence', (x) => (x.sentences[3] = x.sentences[3].replace(/\.$/, ''))],
    ['emoji', (x) => (x.sentences[1] = x.sentences[1].replace(/\.$/, ' \u{1F600}.'))],
  ],
  fillers: [
    ['blank count mismatch (single with two)', (x) => ((x.type = 'single'), (x.sentence = 'Aa bb ______ cc dd ee ff ______ gg hh.'))],
    ['no blank', (x) => ((x.type = 'single'), (x.sentence = 'Aa bb cc dd ee ff gg hh ii jj kk.'))],
    ['duplicate options', (x) => ((x.type = 'single'), (x.sentence = 'Aa bb cc dd ______ ee ff gg hh ii.'), (x.options = ['one', 'two', 'two', 'three', 'four']))],
    ['double with repeated word pair', (x) => ((x.type = 'double'), (x.sentence = 'Aa (A) ______ bb cc dd (B) ______ ee ff gg hh.'), (x.options = [['p', 'p'], ['q', 'r'], ['s', 't'], ['u', 'v'], ['w', 'x']]))],
    ['single option with comma', (x) => ((x.type = 'single'), (x.sentence = 'Aa bb cc dd ______ ee ff gg hh ii.'), (x.options = ['a,b', 'c', 'd', 'e', 'f']))],
  ],
  'word-swap': [
    ['three marked', (x) => (x.marked = [2, 4, 6])],
    ['marked not increasing', (x) => (x.marked = [4, 2, 6, 8])],
    ['marked token capitalised', (x) => ((x.tokens[2] = 'Capital'), (x.marked = [2, 4, 6, 8]))],
    ['swap same position', (x) => (x.swap = [1, 1])],
    ['too few tokens', (x) => ((x.tokens = ['A', 'short', 'one', 'only.']), (x.marked = [1, 2, 3, 4]))],
    ['duplicate marked words', (x) => ((x.tokens[4] = x.tokens[2]), (x.marked = [2, 4, 6, 8]))],
  ],
  'phrase-replacement': [
    ['option equals original', (x) => ((x.variant = 'replace'), (x.options[0] = x.phrase))],
    ['three options', (x) => ((x.variant = 'replace'), x.options.pop())],
    ['No correction required inside options', (x) => ((x.variant = 'replace'), (x.options[2] = 'No correction required'))],
    ['bad correctIndex', (x) => ((x.variant = 'replace'), (x.correctIndex = 9))],
    ['usage without blank', (x) => ((x.variant = 'usage'), (x.sentence = 'Aa bb cc dd ee ff gg hh ii jj.'), (x.options = optionSet()), (x.correctIndex = 0))],
  ],
  'match-column': [
    ['three pairs', (x) => x.pairs.pop()],
    ['duplicate endings', (x) => (x.pairs[1].end = x.pairs[0].end)],
    ['beginning too short', (x) => (x.pairs[2].begin = 'Too short')],
    ['duplicate beginnings', (x) => (x.pairs[3].begin = x.pairs[0].begin)],
  ],
}

// ---------------------------------------------------------------------------------------------------
// Gemini emulator + router
// ---------------------------------------------------------------------------------------------------

type HttpFault = { status: number; body?: string; delayMs?: number } | 'hang' | 'throw' | 'empty' | 'malformed' | { delayMs: number } | undefined
interface Behavior {
  badRate: number
  solverWrongRate: number
  solverAmbiguousRate: number
  /** Called per Gemini request; return a fault to inject. */
  fault?: (info: { kind: 'generate' | 'solve'; model: string; n: number; topic?: string }) => HttpFault
  /** Simulated Gemini latency (ms) per call kind. */
  latency?: { generate: number; solve: number }
  /** 429 when more than `max` calls land inside `windowMs`. */
  rateLimit?: { max: number; windowMs: number }
  /** Replace the generated JSON entirely (for deterministic-rejection tests). */
  generateOverride?: (topic: EnglishTopicId, diff: MockDifficulty, count: number) => any
}
const behavior: Behavior = { badRate: 0, solverWrongRate: 0, solverAmbiguousRate: 0 }
interface GeminiCall {
  kind: 'generate' | 'solve'
  model: string
  temperature: number
  prompt: string
  topic?: string
  at: number
}
let geminiCalls: GeminiCall[] = []
let rlTimes: number[] = []
let apiCalls = 0
const registry = new Map<string, number>()
const keyByOptions = new Map<string, string>()
const keyOf = (stem: string, options: string[]) => [stem.trim(), ...options].join('\u0000')
const hashStr = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % 1000
}
const isWrongKey = (k: string) => hashStr(`w${k}`) < behavior.solverWrongRate * 1000
const isAmbiguousKey = (k: string) => hashStr(`a${k}`) < behavior.solverAmbiguousRate * 1000

function resetBehavior(over: Partial<Behavior> = {}) {
  Object.assign(behavior, { badRate: 0, solverWrongRate: 0, solverAmbiguousRate: 0, fault: undefined, generateOverride: undefined, latency: undefined, rateLimit: undefined }, over)
  geminiCalls = []
  apiCalls = 0
  registry.clear()
  rlTimes = []
  keyByOptions.clear()
  R = mkRng(Math.floor(Math.random() * 1e9))
}

const geminiJson = (obj: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }] })
function abortable<T>(p: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return p
  return new Promise<T>((resolve, reject) => {
    const fail = () => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))
    if (signal.aborted) return fail()
    signal.addEventListener('abort', fail, { once: true })
    p.then(
      (v) => {
        signal.removeEventListener('abort', fail)
        resolve(v)
      },
      (e) => {
        signal.removeEventListener('abort', fail)
        reject(e)
      },
    )
  })
}
const wait = (ms: number, signal?: AbortSignal | null) => abortable(new Promise<void>((r) => setTimeout(r, ms)), signal)

function corruptGenerated(topic: EnglishTopicId, data: any) {
  const list = BAD_ITEM[topic]
  let k = Math.floor(R() * list.length)
  const bad = () => R() < behavior.badRate
  const mutate = (x: any) => list[k++ % list.length][1](x)
  if (topic === 'rc') {
    for (const q of data.passages[0].questions) if (bad()) mutate(q)
  } else if (topic === 'cloze') {
    for (const p of data.passages) if (bad()) mutate(p)
  } else data.items = data.items.map((it: any) => (bad() ? (mutate(it), it) : it))
}

async function geminiStub(url: string, init: RequestInit): Promise<Response> {
  const model = decodeURIComponent(/models\/([^:]+):/.exec(url)?.[1] || '')
  const body = JSON.parse(String(init.body))
  const prompt: string = body.contents[0].parts[0].text
  const temperature: number = body.generationConfig?.temperature
  const isSolve = /Task: mock-english \/ solve/.test(prompt)
  const task = /Task: mock-english \/ topic=([a-z-]+) \/ difficulty=(\w+) \/ items=(\d+)/.exec(prompt)
  const call: GeminiCall = { kind: isSolve ? 'solve' : 'generate', model, temperature, prompt, topic: task?.[1], at: Date.now() }
  geminiCalls.push(call)
  const n = isSolve ? Number(/items=(\d+)/.exec(prompt)?.[1] || 0) : Number(task?.[3] || 0)
  if (behavior.rateLimit) {
    const now = Date.now()
    rlTimes = rlTimes.filter((t) => now - t < behavior.rateLimit!.windowMs)
    const over = rlTimes.length >= behavior.rateLimit.max
    rlTimes.push(now)
    if (over) return new Response('{"error":{"code":429,"details":[{"retryDelay":"0.05s"}]}}', { status: 429 })
  }
  const fault = behavior.fault?.({ kind: call.kind, model, n, topic: call.topic })
  if (fault === 'throw') throw new TypeError('fetch failed')
  if (fault === 'hang') {
    await abortable(new Promise(() => undefined), init.signal)
  }
  if (fault && typeof fault === 'object' && 'delayMs' in fault) await wait(fault.delayMs, init.signal)
  if (behavior.latency && !fault) await wait(behavior.latency[call.kind], init.signal)
  if (fault === 'empty') return new Response(JSON.stringify({ candidates: [{ content: { parts: [] }, finishReason: 'STOP' }] }), { status: 200 })
  if (fault === 'malformed') return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"items":[{"broken":' }] }, finishReason: 'STOP' }] }), { status: 200 })
  if (fault && typeof fault === 'object' && 'status' in fault) return new Response(fault.body ?? 'upstream error', { status: fault.status })

  if (!isSolve) {
    const topic = task![1] as EnglishTopicId
    const diff = task![2] as MockDifficulty
    const data = behavior.generateOverride ? behavior.generateOverride(topic, diff, n) : makeGenerated(topic, diff, n)
    if (!behavior.generateOverride && behavior.badRate > 0) corruptGenerated(topic, data)
    return new Response(JSON.stringify(geminiJson(data)), { status: 200 })
  }
  // Solve: parse the server-built prompt, look up the key in the registry (the "model knows the answer").
  const itemsText = prompt.slice(prompt.indexOf('\nITEMS\n') + 7)
  const results = itemsText.split(/^### ITEM /m).filter(Boolean).map((blk) => {
    const m = /^(\S+)\nTopic: .*\nPassage: .*\nQuestion:\n([\s\S]*)\nOptions:\n([\s\S]*?)\s*$/.exec(blk)
    if (!m) return { id: blk.split('\n')[0], answer: 'A', ambiguous: true, note: 'unparsed' }
    const options = m[3].split('\n').map((l) => l.replace(/^[A-E]\) /, ''))
    const k = keyOf(m[2], options)
    const truth = registry.get(k)
    if (truth === undefined) return { id: m[1], answer: 'A', ambiguous: true, note: 'unknown item' }
    const answer = isWrongKey(k) ? (truth + 1) % 5 : truth
    return { id: m[1], answer: 'ABCDE'[answer], ambiguous: isAmbiguousKey(k), note: '' }
  })
  return new Response(JSON.stringify(geminiJson({ results })), { status: 200 })
}

async function callHandler(body: unknown, method = 'POST'): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  let status = 200
  let payload: any
  const headers: Record<string, string> = {}
  const res: any = {
    setHeader(k: string, v: string) {
      headers[k] = v
    },
    status(c: number) {
      status = c
      return res
    },
    json(o: unknown) {
      payload = o
      return res
    },
  }
  await handler({ method, body }, res)
  return { status, body: payload, headers }
}

function registerGroups(groups: Group[]) {
  for (const g of groups) {
    for (const q of g.questions) {
      registry.set(keyOf(q.stem, q.options), q.answer)
      keyByOptions.set(q.options.join('|'), keyOf(q.stem, q.options))
    }
  }
}

let liveMode = false
function installFetch() {
  globalThis.fetch = (async (input: any, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input.url
    if (url.includes('/api/mockEnglish')) {
      apiCalls++
      const body = JSON.parse(String(init.body))
      const out = await abortable(callHandler(body), init.signal)
      if (body.action === 'generate' && out.body?.groups) registerGroups(out.body.groups)
      return new Response(JSON.stringify(out.body), { status: out.status, headers: { 'Content-Type': 'application/json' } })
    }
    if (url.includes('generativelanguage.googleapis.com')) {
      if (liveMode) return realFetch(input, init)
      return geminiStub(url, init)
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as typeof fetch
}

function fastTiming() {
  Object.assign(ENGLISH_TUNING, {
    retryDelayMs: 1,
    rateLimitBaseMs: 2,
    maxRetryAfterMs: 50,
    requestTimeoutMs: 28000,
    deadlineMs: 150000,
    maxRounds: 3,
    retries: 2,
    rateLimitRetries: 3,
    timeoutRetries: 1,
    lenientLadder: true,
    useBank: false,
    logSummary: false,
  })
  delete process.env.MOCK_ENGLISH_GEMINI_TIMEOUT_MS
  delete process.env.MOCK_ENGLISH_DEADLINE_MS
  delete process.env.MOCK_ENGLISH_HEDGE_MS
  delete process.env.GEMINI_MODEL
  removeStorage()
}

const countQ = (gs: Group[]) => gs.reduce((n, g) => n + g.questions.length, 0)
/** The stub's registry key of a question as first generated (cloze blanks may be renumbered after fill-in). */
const keyFor = (q: { topic: string; stem: string; options: string[] }) => (q.topic === 'cloze' ? keyByOptions.get(q.options.join('|')) || keyOf(q.stem, q.options) : keyOf(q.stem, q.options))

// ---------------------------------------------------------------------------------------------------
// Suites
// ---------------------------------------------------------------------------------------------------

async function suiteHandlerInput() {
  suite('handler: input validation and status codes')
  process.env.GEMINI_API_KEY = 'test-key'
  resetBehavior()
  const good = { action: 'generate', topic: 'error-detection', difficulty: 'medium', count: 3, seed: 7 }
  let r = await callHandler(good, 'GET')
  check(r.status === 405, 'GET -> 405')
  r = await callHandler(undefined)
  check(r.status === 400, 'missing body -> 400')
  r = await callHandler('not json')
  check(r.status === 400, 'non-JSON string body -> 400')
  r = await callHandler({ ...good, action: 'zap' })
  check(r.status === 400, 'bad action -> 400')
  r = await callHandler({ ...good, topic: 'quant' })
  check(r.status === 400, 'bad topic -> 400')
  r = await callHandler({ ...good, difficulty: 'easy' })
  check(r.status === 400, 'bad difficulty -> 400')
  for (const c of [0, -2, 1.5, 'x', null, undefined]) {
    r = await callHandler({ ...good, count: c })
    check(r.status === 400, `count ${String(c)} -> 400`)
  }
  r = await callHandler({ ...good, seed: { a: 1 } })
  check(r.status === 400, 'object seed -> 400')
  r = await callHandler({ ...good, seed: 'x'.repeat(65) })
  check(r.status === 400, 'overlong seed -> 400')
  check(geminiCalls.length === 0, 'no Gemini call was made for invalid input')

  r = await callHandler({ action: 'solve', items: [] })
  check(r.status === 400, 'solve with no items -> 400')
  const item = { id: 'a', topic: 'fillers', stem: 'Choose the word that fits the blank.', options: ['a', 'b', 'c', 'd', 'e'] }
  r = await callHandler({ action: 'solve', items: [{ ...item, options: ['a', 'b'] }] })
  check(r.status === 400, 'solve with 2 options -> 400')
  r = await callHandler({ action: 'solve', items: [item, item] })
  check(r.status === 400, 'solve with duplicate ids -> 400')
  r = await callHandler({ action: 'solve', items: [{ ...item, topic: 'nope' }] })
  check(r.status === 400, 'solve with bad topic -> 400')
  r = await callHandler({ action: 'solve', items: Array.from({ length: 25 }, (_, i) => ({ ...item, id: `i${i}` })) })
  check(r.status === 400, 'solve with 25 items -> 400 (cap 24)')
  r = await callHandler({ action: 'solve', items: [{ ...item, passage: 5 }] })
  check(r.status === 400, 'solve with non-string passage -> 400')

  delete process.env.GEMINI_API_KEY
  r = await callHandler(good)
  check(r.status === 500 && /GEMINI_API_KEY/.test(r.body.error), 'missing API key -> 500 with message')
  process.env.GEMINI_API_KEY = 'test-key'

  r = await callHandler({ ...good, topic: 'rc', count: 99 })
  check(r.status === 200, 'count above cap is clamped, not rejected')
  check(/items=12\b/.test(geminiCalls.at(-1)?.prompt || ''), 'rc count capped at 12 in the prompt')
  r = await callHandler({ ...good, topic: 'match-column', count: '9' })
  check(r.status === 200 && /items=6\b/.test(geminiCalls.at(-1)?.prompt || ''), 'numeric-string count accepted and capped (match-column 6)')
}

async function suiteHandlerGemini() {
  suite('handler: Gemini failure modes, hedging, model roles')
  process.env.GEMINI_API_KEY = 'test-key'
  const body = { action: 'generate', topic: 'fillers', difficulty: 'medium', count: 3, seed: 'abc' }
  process.env.MOCK_ENGLISH_HEDGE_MS = '5'
  const both = (f: HttpFault) => () => f

  resetBehavior({ fault: both('malformed') })
  let r = await callHandler(body)
  check(r.status === 502 && /malformed/i.test(r.body.error), 'malformed JSON from both models -> 502')
  check(geminiCalls.length === 2, 'malformed JSON from the first model triggers the other model')

  resetBehavior({ fault: both({ status: 429 }) })
  r = await callHandler(body)
  check(r.status === 429 && /rate limit/i.test(r.body.error), '429 from Gemini -> 429 rate-limit message')

  resetBehavior({ fault: both({ status: 503 }) })
  r = await callHandler(body)
  check(r.status === 502, '503 from Gemini -> 502')

  resetBehavior({ fault: both('empty') })
  r = await callHandler(body)
  check(r.status === 502 && /no content/i.test(r.body.error), 'empty content -> 502')

  resetBehavior({ fault: both('throw') })
  r = await callHandler(body)
  check(r.status === 502 && /reach/i.test(r.body.error), 'network failure -> 502')

  process.env.MOCK_ENGLISH_GEMINI_TIMEOUT_MS = '120'
  resetBehavior({ fault: both('hang') })
  const t0 = Date.now()
  r = await callHandler(body)
  check(r.status === 504 && Date.now() - t0 < 2000, `hung Gemini aborts and returns 504 quickly (${Date.now() - t0} ms)`)
  check(geminiCalls.length === 2, 'timeout of the first model hedges to the second')

  // Hedge: first model fails with 503, second succeeds.
  delete process.env.MOCK_ENGLISH_GEMINI_TIMEOUT_MS
  resetBehavior({ fault: ({ model }) => (model === 'gemini-3.5-flash' ? { status: 503 } : undefined) })
  r = await callHandler(body)
  check(r.status === 200 && r.body.meta.model === 'gemini-3.5-flash-lite', 'primary 503 -> fallback model answers')
  // Hedge: first model slow, second quick.
  resetBehavior({ fault: ({ model }) => (model === 'gemini-3.5-flash' ? { delayMs: 800 } : undefined) })
  const t1 = Date.now()
  r = await callHandler(body)
  check(r.status === 200 && r.body.meta.model === 'gemini-3.5-flash-lite' && Date.now() - t1 < 700, 'slow primary is beaten by the hedged fallback')

  // Roles and temperatures.
  delete process.env.MOCK_ENGLISH_HEDGE_MS
  resetBehavior()
  r = await callHandler(body)
  check(r.status === 200 && geminiCalls.length === 1 && geminiCalls[0].temperature >= 0.7, 'generate uses high temperature')
  check(r.body.meta.model === 'gemini-3.5-flash', 'generate prefers the stronger model')
  const q = r.body.groups[0].questions[0]
  registry.set(keyOf(q.stem, q.options), q.answer)
  const solveBody = { action: 'solve', avoidModel: 'gemini-3.5-flash', items: [{ id: 'x1', topic: 'fillers', stem: q.stem, options: q.options }] }
  const s1 = await callHandler(solveBody)
  const solveCall = geminiCalls.at(-1)!
  check(s1.status === 200 && solveCall.kind === 'solve' && solveCall.model === 'gemini-3.5-flash-lite', 'solve avoids the generating model')
  check(solveCall.temperature <= 0.2, 'solve uses low temperature')
  check(s1.body.results[0].answer === q.answer && s1.body.results[0].ambiguous === false, 'blind solve answers the registered key')
  check(!solveCall.prompt.includes(q.explanation) && !/\bkeyed?\b.*\bis\b/i.test(solveCall.prompt.slice(solveCall.prompt.indexOf('\nITEMS\n'))), 'solve prompt carries no explanation or key')
  await callHandler({ ...solveBody, avoidModel: 'gemini-3.5-flash-lite' })
  check(geminiCalls.at(-1)!.model === 'gemini-3.5-flash', 'solve avoids flash-lite when that generated')
  process.env.GEMINI_MODEL = 'only-model'
  await callHandler(body)
  await callHandler(solveBody)
  check(geminiCalls.slice(-2).every((c) => c.model === 'only-model'), 'GEMINI_MODEL forces one model for both roles')
  delete process.env.GEMINI_MODEL
  check(true, 'ok')

  // Solve: unusable answers do not count as success.
  resetBehavior({ fault: undefined })
  const unknown = await callHandler({ action: 'solve', items: [{ id: 'zz', topic: 'fillers', stem: 'Choose the word that fits.', options: ['a', 'b', 'c', 'd', 'e'] }] })
  check(unknown.status === 200 && unknown.body.results[0].ambiguous === true, 'unknown item comes back flagged ambiguous by the stub solver (path works)')
  fastTiming()
}

async function suiteServerRejections() {
  suite('server-side deterministic rejections (one malformed class at a time)')
  process.env.GEMINI_API_KEY = 'test-key'
  fastTiming()
  for (const topic of TOPICS) {
    for (const diff of DIFFS) {
      const classes = BAD_ITEM[topic]
      // Build a clean item, then verify each class rejects on its own.
      for (const [label, mutate] of classes) {
        let expectGood = 0
        resetBehavior({
          generateOverride: (t, d) => {
            if (topic === 'rc') {
              const data = makeGenerated('rc', d, 5)
              mutate(data.passages[0].questions[2])
              expectGood = 4
              return data
            }
            if (topic === 'cloze') {
              const data = makeGenerated('cloze', d, 5)
              const clean = makeGenerated('cloze', d, 5)
              mutate(data.passages[0])
              expectGood = 1
              return { passages: [data.passages[0], clean.passages[0]] }
            }
            const data = makeGenerated(t as EnglishTopicId, d, 3)
            mutate(data.items[1])
            expectGood = 2
            return data
          },
        })
        const r = await callHandler({ action: 'generate', topic, difficulty: diff, count: 3, seed: 1 })
        if (topic === 'rc') {
          check(r.status === 200 && countQ(r.body.groups) === expectGood, `rc/${diff}: "${label}" drops exactly that question (kept ${r.status === 200 ? countQ(r.body.groups) : r.status})`)
        } else {
          check(r.status === 200 && r.body.groups.length === expectGood, `${topic}/${diff}: "${label}" is rejected, the clean items survive (kept ${r.status === 200 ? r.body.groups.length : r.status})`)
        }
        check(r.status === 200 && r.body.meta.droppedCount >= 1, `${topic}/${diff}: "${label}" is reported in meta.droppedCount`)
      }
      // And everything survives when nothing is wrong.
      resetBehavior()
      const clean = await callHandler({ action: 'generate', topic, difficulty: diff, count: 5, seed: 2 })
      check(clean.status === 200 && countQ(clean.body.groups) >= 1 && clean.body.meta.droppedCount === 0, `${topic}/${diff}: clean model output is fully accepted`)
      if (clean.status === 200) {
        for (const g of clean.body.groups) {
          try {
            assertGroup(g, `${topic}/${diff}`)
            const c = checkEnglishGroup(topic, diff, g)
            check(c.group !== null && countQ([c.group]) === countQ([g]), `${topic}/${diff}: server output passes the client checks`)
          } catch (e) {
            check(false, `${topic}/${diff}: assertGroup failed: ${(e as Error).message}`)
          }
        }
      }
    }
  }
  // Characters outside the PDF writer's set are mapped or rejected.
  resetBehavior({
    generateOverride: () => {
      const a = mkEdItem(0)
      a.parts = a.parts!.map((p: string, i: number) => (i === 0 ? `${p}…` : p))
      const b = mkEdItem(0)
      b.parts![1] = `${b.parts![1]} नमस्ते`
      const c = mkEdItem(0)
      c.explanation = 'It is fine **bold** text for the rule here.'
      return { items: [{ ...a, variant: 'parts', errorPartIndex: 0 }, { ...b, variant: 'parts', errorPartIndex: 0 }, { ...c, variant: 'parts', errorPartIndex: 0 }] }
    },
  })
  const cs = await callHandler({ action: 'generate', topic: 'error-detection', difficulty: 'medium', count: 3, seed: 3 })
  check(cs.status === 200 && cs.body.groups.length === 2, 'ellipsis is normalised and bold markers stripped; Devanagari rejected')
  check(cs.status === 200 && /\.\.\./.test(cs.body.groups[0].questions[0].stem) && !/…/.test(cs.body.groups[0].questions[0].stem), 'ellipsis became three dots')
  fastTiming()
}

async function suiteBuilders() {
  suite('server builders: structure of each topic')
  process.env.GEMINI_API_KEY = 'test-key'
  fastTiming()
  const gen = async (topic: EnglishTopicId, diff: MockDifficulty, count: number, seed: number) => {
    resetBehavior()
    const r = await callHandler({ action: 'generate', topic, difficulty: diff, count, seed })
    if (r.status !== 200) throw new Error(`generate ${topic} failed: ${r.status} ${JSON.stringify(r.body)}`)
    return r.body.groups as Group[]
  }
  // Same seed -> same shuffles (reproducible), different seed -> usually different layout.
  const fixedItems = { items: [mkPjItem(0), mkPjItem(1)] }
  resetBehavior({ generateOverride: () => JSON.parse(JSON.stringify(fixedItems)) })
  const fixed = { action: 'generate', topic: 'para-jumble', difficulty: 'hard', count: 2, seed: 42 }
  const a = await callHandler(fixed)
  const again = await callHandler(fixed)
  check(JSON.stringify(a.body.groups) === JSON.stringify(again.body.groups), 'same seed and model output give identical groups')

  const pj = await gen('para-jumble', 'hard', 5, 5)
  for (const g of pj) {
    const q = g.questions[0]
    const rows = [...q.stem.matchAll(/^([A-F])\. (.+)$/gm)]
    check(rows.length >= 5 && q.options.length === 5, 'para-jumble has 5-6 lettered sentences and 5 options')
    if (q.options.every((o) => o.length > 1)) {
      const letters = rows.map((r) => r[1]).sort().join('')
      check(q.options.every((o) => o.split('').sort().join('') === letters), 'para-jumble options are permutations of the sentence letters')
      check(q.options[q.answer] !== rows.map((r) => r[1]).join(''), 'para-jumble correct order differs from the displayed order')
    }
  }
  const ws = await gen('word-swap', 'medium', 6, 6)
  check(ws.every((g) => g.questions[0].options[4] === 'No interchange required' && /\(1\)\w+ .*\(4\)\w+/.test(g.questions[0].stem)), 'word-swap markers (1)-(4) present and last option fixed')
  check(ws.every((g) => /Correct sentence|already correct/.test(g.questions[0].explanation)), 'word-swap explanation carries the corrected sentence')
  const mc = await gen('match-column', 'hard', 4, 7)
  check(mc.every((g) => g.questions[0].options.length === 5 && /Column I\n1\. /.test(g.questions[0].stem)), 'match-column renders both columns with 5 matchings')
  const rc = await gen('rc', 'hard', 9, 8)
  const vocab = rc[0].questions.filter((q) => /as used in the passage/.test(q.stem))
  check(vocab.length === 2 && vocab.every((q) => /“(prudent|volatile)”/.test(q.stem)), 'rc vocabulary stems are built by the server around the target word')
  const pr = await gen('phrase-replacement', 'medium', 5, 9)
  check(pr.every((g) => /[A-Z]{2,}/.test(g.questions[0].stem) || /______/.test(g.questions[0].stem)), 'phrase-replacement shows the phrase in capitals or a blank')
}

async function suiteClientChecks() {
  suite('client-side deterministic checks (mutating built groups)')
  process.env.GEMINI_API_KEY = 'test-key'
  fastTiming()
  type Mut = [string, (g: Group) => void]
  const common: Mut[] = [
    ['four options', (g) => g.questions[0].options.pop()],
    ['duplicate options', (g) => (g.questions[0].options[1] = g.questions[0].options[0])],
    ['answer out of range', (g) => (g.questions[0].answer = 5)],
    ['TODO in stem', (g) => (g.questions[0].stem += ' TODO')],
    ['emoji in explanation', (g) => (g.questions[0].explanation += ' \u{1F600}')],
    ['"as an AI" in option', (g) => (g.questions[0].options[2] = 'As an AI language model I cannot')],
    ['Devanagari in stem', (g) => (g.questions[0].stem += ' नमस्ते')],
    ['markdown fence in option', (g) => (g.questions[0].options[3] = '```json')],
    ['wrong topic tag', (g) => (g.questions[0].topic = (g.questions[0].topic === 'rc' ? 'cloze' : 'rc') as any)],
    ['empty explanation', (g) => (g.questions[0].explanation = '')],
  ]
  const specific: Partial<Record<EnglishTopicId, Mut[]>> = {
    'error-detection': [
      ['options out of order', (g) => g.questions[0].options.reverse()],
      ['part (c) missing', (g) => (g.questions[0].stem = g.questions[0].stem.replace('(c) ', ''))],
    ],
    'para-jumble': [
      ['sentence letter skipped', (g) => (g.questions[0].stem = g.questions[0].stem.replace(/^C\. /m, 'G. '))],
      ['option not a permutation', (g) => (g.questions[0].options[0] = 'AAAAA')],
      ['sentence repeated', (g) => (g.questions[0].stem = g.questions[0].stem.replace(/^(B\. )(.+)$/m, (_m, p) => `${p}${/^A\. (.+)$/m.exec(g.questions[0].stem)?.[1]}`))],
    ],
    fillers: [
      ['blank removed', (g) => (g.questions[0].stem = g.questions[0].stem.replace(/(?:\([AB]\) )?______/g, 'word'))],
      ['malformed blank', (g) => (g.questions[0].stem = g.questions[0].stem.replace('______', '_______'))],
    ],
    'word-swap': [
      ['marker (3) removed', (g) => (g.questions[0].stem = g.questions[0].stem.replace(/\(3\)(?=[A-Za-z])/, ''))],
      ['last option changed', (g) => (g.questions[0].options[4] = 'No change')],
      ['pair with i >= j', (g) => (g.questions[0].options[0] = '(3) and (1)')],
    ],
    'phrase-replacement': [
      ['last option changed', (g) => g.questions[0].stem.includes('______') || (g.questions[0].options[4] = 'Nothing to fix')],
    ],
    'match-column': [
      ['matching reuses a letter', (g) => (g.questions[0].options[0] = '1-A, 2-A, 3-B, 4-C')],
      ['column II lost', (g) => (g.questions[0].stem = g.questions[0].stem.replace('\nColumn II\n', '\nOther\n'))],
    ],
    cloze: [
      ['blank number skipped', (g) => (g.stimulus!.parts[0] = { kind: 'text', paragraphs: (g.stimulus!.parts[0] as any).paragraphs.map((p: string) => p.replace('(2) ______', '(5) ______')) })],
      ['blank missing from passage', (g) => (g.stimulus!.parts[0] = { kind: 'text', paragraphs: (g.stimulus!.parts[0] as any).paragraphs.map((p: string) => p.replace('(3) ______', 'word')) })],
      ['question stem names wrong blank', (g) => (g.questions[1].stem = 'Select the most appropriate word to fill blank (4).')],
      ['passage truncated', (g) => (g.stimulus!.parts[0] = { kind: 'text', paragraphs: ['(1) ______ (2) ______ (3) ______ (4) ______ (5) ______ only.'] })],
    ],
    rc: [
      ['vocab target absent', (g) => (g.questions[5].stem = g.questions[5].stem.replace(/“\w+”/, '“zzqxj”'))],
      ['passage too short', (g) => (g.stimulus!.parts[0] = { kind: 'text', paragraphs: ['Short passage of just a few words here.'] })],
      ['stimulus missing', (g) => delete g.stimulus],
    ],
  }
  const clone = (g: Group): Group => JSON.parse(JSON.stringify(g))
  for (const topic of TOPICS) {
    resetBehavior()
    const r = await callHandler({ action: 'generate', topic, difficulty: 'hard', count: topic === 'rc' ? 9 : 5, seed: 11 })
    const base = (r.body.groups as Group[]).find((g) => (topic === 'error-detection' ? g.questions[0].stem.includes('(a) ') : true) && (topic === 'word-swap' ? /\(3\)/.test(g.questions[0].stem) : true) && (topic === 'phrase-replacement' ? !g.questions[0].stem.includes('______') : true) && (topic === 'fillers' ? g.questions[0].stem.includes('(A)') || true : true))!
    check(checkEnglishGroup(topic, 'hard', clone(base)).group !== null, `${topic}: unmutated built group passes`)
    for (const [label, mut] of [...common, ...(specific[topic] ?? [])]) {
      const g = clone(base)
      mut(g)
      const out = checkEnglishGroup(topic, 'hard', g)
      // RC rejects per question: a mutation of question 0 must remove exactly that question; others reject the group.
      const rejected = topic === 'rc' && g.stimulus && label !== 'stimulus missing' && !['passage too short'].includes(label) && !/vocab target/.test(label) ? out.group === null || out.group.questions.length < g.questions.length : out.group === null || (topic === 'rc' && out.group.questions.length < g.questions.length)
      check(rejected, `${topic}: "${label}" is rejected`)
    }
  }
  // Group-shape rules.
  resetBehavior()
  const ed = (await callHandler({ action: 'generate', topic: 'error-detection', difficulty: 'medium', count: 2, seed: 12 })).body.groups as Group[]
  check(checkEnglishGroup('error-detection', 'medium', { questions: [ed[0].questions[0], ed[1].questions[0]] }).group === null, 'standalone group with two questions is rejected')
  check(checkEnglishGroup('error-detection', 'medium', { stimulus: { parts: [{ kind: 'text', paragraphs: ['x y z'] }] }, questions: ed[0].questions }).group === null, 'standalone group with a stimulus is rejected')
  check(checkEnglishGroup('rc', 'medium', { questions: [] }).group === null, 'empty group is rejected')
  // Difficulty bands (hard 250-560, medium 170-420 words): a ~200-word passage is fine for medium but too short for hard.
  const rcMedium = (await callHandler({ action: 'generate', topic: 'rc', difficulty: 'medium', count: 5, seed: 13 })).body.groups[0] as Group
  check(checkEnglishGroup('rc', 'medium', rcMedium).group !== null && checkEnglishGroup('rc', 'hard', rcMedium).group !== null, 'a ~280-word passage passes both bands')
  const shortRc = clone(rcMedium)
  shortRc.stimulus!.parts[0] = { kind: 'text', paragraphs: makePassage(200, ['prudent', 'volatile']) }
  check(checkEnglishGroup('rc', 'medium', shortRc).group !== null && checkEnglishGroup('rc', 'hard', shortRc).group === null, 'rc passage length is checked against the difficulty band')
}

async function suiteHappyPath() {
  suite('fetchEnglishGroups: happy path for every topic and difficulty')
  process.env.GEMINI_API_KEY = 'test-key'
  fastTiming()
  for (const topic of TOPICS) {
    for (const diff of DIFFS) {
      resetBehavior()
      const want = topic === 'rc' ? 9 : 6
      const progress: number[] = []
      const groups = await fetchEnglishGroups(topic, diff, want, { onProgress: (n) => progress.push(n) })
      check(countQ(groups) === want, `${topic}/${diff}: exactly ${want} questions (got ${countQ(groups)})`)
      let structural = true
      for (const g of groups) {
        try {
          assertGroup(g, `${topic}/${diff}`)
          if (checkEnglishGroup(topic, diff, g).group === null) structural = false
        } catch {
          structural = false
        }
      }
      check(structural, `${topic}/${diff}: every group passes assertGroup and the checks`)
      check(progress.length > 0 && progress.at(-1) === want && progress.every((v, i) => i === 0 || v >= progress[i - 1]), `${topic}/${diff}: onProgress is monotonic and ends at ${want}`)
      const gen = geminiCalls.filter((c) => c.kind === 'generate')
      const sol = geminiCalls.filter((c) => c.kind === 'solve')
      check(sol.length >= 1 && true, `${topic}/${diff}: blind solve ran (${sol.length} solve call(s))`)
      const solveModels = new Set(sol.map((s) => s.model))
      check(!solveModels.has(gen[0].model) || solveModels.size > 1 || false, `${topic}/${diff}: solver used a different model from the generator`)
    }
  }
  // Cloze shape.
  resetBehavior()
  const cz = await fetchEnglishGroups('cloze', 'medium', 5)
  check(cz.length === 1 && cz[0].questions.length === 5 && (cz[0].stimulus!.parts[0] as any).paragraphs.join(' ').match(/\(\d\) ______/g)!.length === 5, 'cloze 5 -> one passage with 5 blanks')
  // No duplicate content across a bigger fetch.
  resetBehavior()
  const many = await fetchEnglishGroups('error-detection', 'hard', 30)
  const stems = many.flatMap((g) => g.questions.map((q) => q.stem + q.options.join('|')))
  check(new Set(stems).size === 30, 'ED x30: all questions distinct')
  check(many.length === 30, 'ED x30: groups are single questions')
}

async function suiteSolverDisagreement() {
  suite('solver disagreement and ambiguity are dropped and replaced')
  process.env.GEMINI_API_KEY = 'test-key'
  fastTiming()
  for (const topic of TOPICS) {
    resetBehavior({ solverWrongRate: 0.2, solverAmbiguousRate: 0.1 })
    const want = topic === 'rc' ? 8 : 6
    const groups = await fetchEnglishGroups(topic, 'medium', want)
    check(countQ(groups) === want, `${topic}: still exactly ${want} questions after dropping disagreements`)
    let tainted = 0
    for (const g of groups) {
      for (const q of g.questions) {
        // Cloze blanks may be renumbered after fill-in, so look the original key up by options.
        const k = topic === 'cloze' ? keyByOptions.get(q.options.join('|')) || keyOf(q.stem, q.options) : keyOf(q.stem, q.options)
        if (isWrongKey(k)) tainted++
      }
    }
    // Cloze may fill in (not return) failed blanks; every RETURNED question must still be verified.
    check(tainted === 0, `${topic}: no returned question was one the solver disagreed with (${tainted} slipped through)`)
    check(geminiCalls.filter((c) => c.kind === 'solve').length >= 1, `${topic}: blind solver was consulted`)
  }
  // Solver that always disagrees -> throws.
  resetBehavior({ solverWrongRate: 1 })
  await expectThrows(() => fetchEnglishGroups('fillers', 'medium', 5), 'a solver that disagrees with everything makes the fetch throw', (e) => e instanceof EnglishPrepareError && e.reason === 'quality')
  resetBehavior({ solverAmbiguousRate: 1 })
  const lenientOut = await fetchEnglishGroups('error-detection', 'medium', 5)
  check(countQ(lenientOut) === 5, 'everything flagged ambiguous: the lenient ladder still delivers exactly 5 solver-agreed questions')
  ENGLISH_TUNING.lenientLadder = false
  resetBehavior({ solverAmbiguousRate: 1 })
  await expectThrows(() => fetchEnglishGroups('error-detection', 'medium', 5), 'strict-only gate: everything flagged ambiguous throws (quality)', (e) => e instanceof EnglishPrepareError && e.reason === 'quality')
  ENGLISH_TUNING.lenientLadder = true
  // Solve outage: unverified questions are never returned.
  resetBehavior({ fault: ({ kind }) => (kind === 'solve' ? { status: 503 } : undefined) })
  await expectThrows(() => fetchEnglishGroups('word-swap', 'medium', 4), 'solver outage -> throws rather than returning unverified questions')
}

async function suiteExactCount() {
  suite('exact-count guarantee (bad items and disagreeing solver mixed in)')
  process.env.GEMINI_API_KEY = 'test-key'
  fastTiming()
  const counts = [1, 5, 8, 9, 10, 30]
  let ran = 0
  for (const topic of TOPICS) {
    for (const count of counts) {
      resetBehavior({ badRate: 0.3, solverWrongRate: 0.15, solverAmbiguousRate: 0.1 })
      const diff = DIFFS[(ran++ + count) % 2]
      let result: Group[] | null = null
      let error: Error | null = null
      try {
        result = await fetchEnglishGroups(topic, diff, count)
      } catch (e) {
        error = e as Error
      }
      if (result) {
        check(countQ(result) === count, `${topic} x${count}: exactly ${count} (got ${countQ(result)})`)
        const ok = result.every((g) => {
          try {
            assertGroup(g, 'x')
            return checkEnglishGroup(topic, diff, g).group !== null
          } catch {
            return false
          }
        })
        check(ok, `${topic} x${count}: all groups valid`)
      } else {
        // Allowed only as a clean, user-readable failure.
        check(error instanceof EnglishPrepareError && error.message.length > 20, `${topic} x${count}: failure is an EnglishPrepareError with a readable message ("${error!.message}")`)
        console.log(`  note: ${topic} x${count} threw under heavy corruption (acceptable, never silently short; generate asks ${geminiCalls.filter((c) => c.kind === 'generate').map((c) => /items=(\d+)/.exec(c.prompt)![1]).join(',')}; ${geminiCalls.filter((c) => c.kind === 'solve').length} solve calls)`)
      }
    }
  }
  // Light corruption must always succeed for all counts (regression guard on yield).
  for (const topic of TOPICS) {
    resetBehavior({ badRate: 0.15, solverWrongRate: 0.05 })
    let n = 0
    try {
      n = countQ(await fetchEnglishGroups(topic, 'hard', 10))
    } catch {
      n = -1
    }
    check(n === 10, `${topic}: light corruption still yields exactly 10 (got ${n})`)
  }
  // Total corruption always throws, never returns short.
  for (const topic of TOPICS) {
    resetBehavior({ badRate: 1 })
    await expectThrows(() => fetchEnglishGroups(topic, 'medium', 5), `${topic}: every item malformed -> throws quality`, (e) => e instanceof EnglishPrepareError && e.reason === 'quality')
  }
  // Deterministic regeneration: round 1 delivers only 2 usable items, so a second round must top it up.
  resetBehavior()
  let genCall = 0
  behavior.generateOverride = (t, d, n) => {
    const data = makeGenerated(t, d, n)
    if (genCall++ === 0) data.items = data.items.map((it: any, i: number) => (i < 2 ? it : (BAD_ITEM.fillers[0][1](it), it)))
    return data
  }
  const topped = await fetchEnglishGroups('fillers', 'medium', 6)
  check(countQ(topped) === 6 && geminiCalls.filter((c) => c.kind === 'generate').length >= 2, 'items dropped in round 1 are replaced by regeneration in round 2')
  // Argument validation.
  await expectThrows(() => fetchEnglishGroups('rc', 'hard', 0), 'count 0 -> throws')
  await expectThrows(() => fetchEnglishGroups('rc', 'hard', 2.5), 'fractional count -> throws')
  // Trimming: a passage returning more verified blanks/questions than needed is cut to the exact count.
  resetBehavior()
  const rc = await fetchEnglishGroups('rc', 'hard', 5)
  check(countQ(rc) === 5, 'rc x5: trimmed to exactly 5 from an over-requested passage')
  resetBehavior()
  const cz = await fetchEnglishGroups('cloze', 'hard', 3)
  const czText = (cz[0].stimulus!.parts[0] as any).paragraphs.join(' ')
  check(countQ(cz) === 3 && (czText.match(/\(\d\) ______/g) || []).length === 3 && !/\(4\)/.test(czText), 'cloze x3: extra blanks are filled in and numbering stays contiguous')
}

async function suiteClientFaults() {
  suite('client retry / failure behaviour')
  process.env.GEMINI_API_KEY = 'test-key'
  fastTiming()
  // Transient 503s from the API are retried.
  resetBehavior()
  let failuresLeft = 2
  const routed = globalThis.fetch
  globalThis.fetch = (async (input: any, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input.url
    if (url.includes('/api/mockEnglish') && failuresLeft > 0) {
      failuresLeft--
      apiCalls++
      return new Response(JSON.stringify({ error: 'busy' }), { status: 503 })
    }
    return routed(input, init)
  }) as typeof fetch
  const g1 = await fetchEnglishGroups('fillers', 'medium', 3)
  check(countQ(g1) === 3 && apiCalls > 2, 'two 503s then success -> retried and succeeds')
  globalThis.fetch = routed

  // Persistent 429 -> throws friendly error.
  resetBehavior({ fault: () => ({ status: 429 }) })
  await expectThrows(() => fetchEnglishGroups('fillers', 'medium', 3), '429 forever -> rate-limit reason', (e) => e instanceof EnglishPrepareError && e.reason === 'rate-limit' && /rate-limiting/.test(e.message))
  // Persistent upstream timeout (504 from handler).
  process.env.MOCK_ENGLISH_GEMINI_TIMEOUT_MS = '60'
  delete process.env.MOCK_ENGLISH_HEDGE_MS
  resetBehavior({ fault: () => 'hang' })
  await expectThrows(() => fetchEnglishGroups('rc', 'hard', 8), '504 forever -> timeout reason', (e) => e instanceof EnglishPrepareError && e.reason === 'timeout' && /too slow/.test(e.message))
  const rcAsks = geminiCalls.filter((c) => c.kind === 'generate' && c.topic === 'rc').map((c) => Number(/items=(\d+)/.exec(c.prompt)![1]))
  check(rcAsks.length >= 3 && rcAsks[rcAsks.length - 1] < rcAsks[0], `rc asks for fewer questions per passage after timeouts (${rcAsks.join(',')})`)
  fastTiming()
  // Malformed Gemini output.
  resetBehavior({ fault: () => 'malformed' })
  await expectThrows(() => fetchEnglishGroups('error-detection', 'medium', 3), 'malformed Gemini JSON forever -> throws')
  resetBehavior({ fault: () => 'empty' })
  await expectThrows(() => fetchEnglishGroups('error-detection', 'medium', 3), 'empty Gemini content forever -> throws')
  resetBehavior({ fault: () => 'throw' })
  await expectThrows(() => fetchEnglishGroups('error-detection', 'medium', 3), 'network errors forever -> throws')
  // Malformed server body.
  const saved = globalThis.fetch
  globalThis.fetch = (async () => new Response('<html>oops</html>', { status: 200 })) as typeof fetch
  await expectThrows(() => fetchEnglishGroups('fillers', 'medium', 3), 'non-JSON API body -> network reason', (e) => e instanceof EnglishPrepareError && e.reason === 'network' && /check your connection/.test(e.message))
  globalThis.fetch = (async () => new Response(JSON.stringify({ groups: 'nope' }), { status: 200 })) as typeof fetch
  await expectThrows(() => fetchEnglishGroups('fillers', 'medium', 3), 'API body without groups -> throws')
  globalThis.fetch = (async () => new Response(JSON.stringify({ groups: [], meta: {} }), { status: 200 })) as typeof fetch
  await expectThrows(() => fetchEnglishGroups('fillers', 'medium', 3), 'API returning no groups -> throws')
  globalThis.fetch = saved

  // Server not configured: fatal, not retried.
  resetBehavior()
  delete process.env.GEMINI_API_KEY
  await expectThrows(() => fetchEnglishGroups('fillers', 'medium', 3), 'unconfigured server -> unavailable reason', (e) => e instanceof EnglishPrepareError && e.reason === 'unavailable' && /aren't available/.test(e.message))
  check(apiCalls === 1, `unconfigured server is not retried (${apiCalls} API call)`)
  process.env.GEMINI_API_KEY = 'test-key'
  // Missing route (plain vite dev server).
  resetBehavior()
  globalThis.fetch = (async () => new Response('Not found', { status: 404 })) as typeof fetch
  await expectThrows(() => fetchEnglishGroups('fillers', 'medium', 3), '404 from /api -> unavailable reason', (e) => e instanceof EnglishPrepareError && e.reason === 'unavailable')
  globalThis.fetch = saved

  // Client stub returning malformed groups (server bypass): the client checks reject them and the fetch throws.
  resetBehavior()
  globalThis.fetch = (async (input: any, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input.url
    const body = JSON.parse(String(init.body))
    if (!url.includes('/api/mockEnglish')) throw new Error('unexpected')
    if (body.action === 'generate') {
      const bad: Group = { questions: [{ topic: 'error-detection', stem: 'Read each sentence. (a) one (b) two (c) three (d) four', options: ['(a)', '(b)', '(c)', '(d)', '(d)'], answer: 0, explanation: 'dup option here' }] }
      return new Response(JSON.stringify({ groups: [bad], meta: { model: 'm' } }), { status: 200 })
    }
    throw new Error('solve must not be called for rejected items')
  }) as typeof fetch
  await expectThrows(() => fetchEnglishGroups('error-detection', 'medium', 2), 'client rejects malformed groups returned by the API (and never solves them)')
  globalThis.fetch = saved
}

async function suiteAbort() {
  suite('abort handling')
  process.env.GEMINI_API_KEY = 'test-key'
  fastTiming()
  resetBehavior()
  const pre = new AbortController()
  pre.abort()
  const e1 = await expectThrows(() => fetchEnglishGroups('rc', 'hard', 8, { signal: pre.signal }), 'pre-aborted signal rejects', (e) => e.name === 'AbortError')
  check(!!e1 && apiCalls === 0, 'pre-aborted signal makes no API call')

  resetBehavior({ fault: () => ({ delayMs: 400 }) })
  const ac = new AbortController()
  const t0 = Date.now()
  setTimeout(() => ac.abort(), 30)
  await expectThrows(() => fetchEnglishGroups('error-detection', 'medium', 10, { signal: ac.signal }), 'abort mid-flight rejects with AbortError', (e) => e.name === 'AbortError')
  check(Date.now() - t0 < 300, `abort returns promptly (${Date.now() - t0} ms)`)
  const after = apiCalls
  await wait(600)
  check(apiCalls === after, 'no new API calls are started after abort')

  // Abort during retry backoff.
  ENGLISH_TUNING.retryDelayMs = 5000
  resetBehavior({ fault: () => ({ status: 503 }) })
  const ac2 = new AbortController()
  const t1 = Date.now()
  setTimeout(() => ac2.abort(), 100)
  await expectThrows(() => fetchEnglishGroups('fillers', 'medium', 3, { signal: ac2.signal }), 'abort during backoff rejects', (e) => e.name === 'AbortError')
  check(Date.now() - t1 < 1000, `abort interrupts retry backoff (${Date.now() - t1} ms)`)
  fastTiming()
  // Handler-level: a client abort while the handler waits does not leave the fetch hanging (router abortable).
  resetBehavior()
}

// ---------------------------------------------------------------------------------------------------
// Paper-level suites: fetchEnglishPaper, rate limits, the bank, the quality ladder
// ---------------------------------------------------------------------------------------------------

const PO_REQUESTS: EnglishRequest[] = [
  { topic: 'rc', count: 8 },
  { topic: 'cloze', count: 5 },
  { topic: 'error-detection', count: 4 },
  { topic: 'para-jumble', count: 3 },
  { topic: 'fillers', count: 4 },
  { topic: 'word-swap', count: 3 },
  { topic: 'phrase-replacement', count: 3 },
]
const CLERK_REQUESTS: EnglishRequest[] = [
  { topic: 'rc', count: 8 },
  { topic: 'cloze', count: 5 },
  { topic: 'error-detection', count: 5 },
  { topic: 'para-jumble', count: 4 },
  { topic: 'fillers', count: 4 },
  { topic: 'phrase-replacement', count: 4 },
]
const sumCounts = (r: EnglishRequest[]) => r.reduce((n, x) => n + x.count, 0)
const genCalls = () => geminiCalls.filter((c) => c.kind === 'generate').length

function removeStorage() {
  try {
    delete (globalThis as any).localStorage
  } catch {
    /* ignore */
  }
}
function installStorage(opts: { failGet?: boolean; failSet?: boolean; maxChars?: number } = {}): Map<string, string> {
  const m = new Map<string, string>()
  const ls = {
    getItem: (k: string) => {
      if (opts.failGet) throw new Error('storage blocked')
      return m.has(k) ? m.get(k)! : null
    },
    setItem: (k: string, v: string) => {
      if (opts.failSet || (opts.maxChars !== undefined && String(v).length > opts.maxChars)) throw new Error('QuotaExceededError')
      m.set(k, String(v))
    },
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true })
  return m
}

function validatePaper(label: string, reqs: EnglishRequest[], diff: MockDifficulty, out: Group[][]): Set<string> {
  check(out.length === reqs.length, `${label}: one result per request`)
  const keys = new Set<string>()
  let dup = 0
  out.forEach((groups, i) => {
    check(countQ(groups) === reqs[i].count, `${label}: ${reqs[i].topic} has exactly ${reqs[i].count} (got ${countQ(groups)})`)
    let ok = true
    for (const g of groups) {
      try {
        assertGroup(g, label)
        if (checkEnglishGroup(reqs[i].topic, diff, g).group === null) ok = false
      } catch {
        ok = false
      }
      for (const q of g.questions) {
        const k = `${q.stem}|${q.options.join('|')}`
        if (keys.has(k)) dup++
        keys.add(k)
      }
    }
    check(ok, `${label}: ${reqs[i].topic} groups are structurally valid`)
  })
  check(dup === 0, `${label}: no duplicate questions inside the paper`)
  return keys
}

async function suiteSequential() {
  suite('handler: sequential fallback by default, Retry-After, request deadline')
  process.env.GEMINI_API_KEY = 'test-key'
  fastTiming()
  const body = { action: 'generate', topic: 'fillers', difficulty: 'medium', count: 3, seed: 's' }
  resetBehavior({ fault: ({ model }) => (model === 'gemini-3.5-flash' ? { status: 503, delayMs: 150 } : undefined) })
  let r = await callHandler(body)
  check(r.status === 200 && r.body.meta.model === 'gemini-3.5-flash-lite', 'primary fails -> fallback model answers')
  check(geminiCalls.length === 2 && geminiCalls[1].at - geminiCalls[0].at >= 140, 'fallback starts only after the first model failed (no parallel hedge)')
  check(r.body.meta.attempts.map((a: any) => a.status).join(',') === '502,200', 'meta.attempts reports the failed and the successful attempt')
  resetBehavior()
  r = await callHandler(body)
  check(r.status === 200 && geminiCalls.length === 1, 'a healthy primary means exactly one Gemini call')
  resetBehavior({ fault: () => ({ status: 429, body: '{"error":{"details":[{"retryDelay":"7s"}]}}' }) })
  r = await callHandler(body)
  check(r.status === 429 && r.body.retryAfterMs === 7000 && r.headers['Retry-After'] === '7', '429 from both models surfaces retryAfterMs and a Retry-After header')
  process.env.MOCK_ENGLISH_DEADLINE_MS = '1500'
  process.env.MOCK_ENGLISH_GEMINI_TIMEOUT_MS = '800'
  resetBehavior({ fault: () => 'hang' })
  const t0 = Date.now()
  r = await callHandler(body)
  check(r.status === 504 && geminiCalls.length === 1 && Date.now() - t0 < 1400, `with too little deadline left the fallback is skipped (504 after ${Date.now() - t0} ms, ${geminiCalls.length} call)`)
  fastTiming()
}

async function suiteRelaxed() {
  suite('server: relaxed cosmetic gates (what real Gemini plausibly does)')
  process.env.GEMINI_API_KEY = 'test-key'
  fastTiming()
  const gen = (topic: EnglishTopicId, diff: MockDifficulty, count: number, data: any) => {
    resetBehavior({ generateOverride: () => data })
    return callHandler({ action: 'generate', topic, difficulty: diff, count, seed: 5 })
  }
  const rcWith = (words: number, diff: MockDifficulty) => {
    const d = makeGenerated('rc', diff, 4)
    d.passages[0].paragraphs = makePassage(words, ['prudent', 'volatile'])
    return d
  }
  let r = await gen('rc', 'hard', 4, rcWith(260, 'hard'))
  check(r.status === 200 && countQ(r.body.groups) === 4, 'hard RC passage of ~260 words is accepted')
  r = await gen('rc', 'medium', 4, rcWith(175, 'medium'))
  check(r.status === 200 && countQ(r.body.groups) === 4, 'medium RC passage of ~175 words is accepted')
  r = await gen('rc', 'hard', 4, rcWith(620, 'hard'))
  check(r.status === 502, 'hard RC passage of ~620 words is still rejected')
  r = await gen('rc', 'hard', 4, rcWith(120, 'hard'))
  check(r.status === 502, 'a 120-word RC passage is still rejected')

  const ws = mkWsItem(0)
  ws.marked = ws.marked.map((i: number) => ws.tokens[i])
  r = await gen('word-swap', 'medium', 1, { items: [ws] })
  check(r.status === 200 && r.body.groups.length === 1 && /\(1\)\w+/.test(r.body.groups[0].questions[0].stem), 'word-swap accepts "marked" given as words')
  const ws2 = mkWsItem(0)
  ws2.marked = ['notinsentence', ws2.tokens[4], ws2.tokens[6], ws2.tokens[8]]
  r = await gen('word-swap', 'medium', 1, { items: [ws2] })
  check(r.status === 502, 'word-swap with a marked word that is not in the sentence is rejected')

  const ed = mkEdItem(0)
  ed.explanation = ''
  r = await gen('error-detection', 'medium', 1, { items: [{ ...ed, variant: 'parts', errorPartIndex: 1 }] })
  check(r.status === 200 && /The correct answer is/.test(r.body.groups[0].questions[0].explanation), 'a missing explanation is replaced by a plain one, not fatal')
  for (const nul of [-1, 'none', 'null']) {
    r = await gen('error-detection', 'medium', 1, { items: [{ ...mkEdItem(0), variant: 'parts', errorPartIndex: nul }] })
    check(r.status === 200 && r.body.groups[0].questions[0].answer === 4, `errorPartIndex ${JSON.stringify(nul)} means "No error"`)
  }
  const pr = mkPrItem(0)
  r = await gen('phrase-replacement', 'medium', 1, { items: [{ ...pr, variant: 'replace', correctIndex: -1 }] })
  check(r.status === 200 && r.body.groups[0].questions[0].answer === 4, 'phrase correctIndex -1 means "No correction required"')

  const cz = makeGenerated('cloze', 'medium', 5)
  for (const b of cz.passages[0].blanks) delete b.n
  r = await gen('cloze', 'medium', 5, cz)
  check(r.status === 200 && countQ(r.body.groups) === 5, 'cloze blanks without "n" are numbered by position')
  const rc = makeGenerated('rc', 'hard', 4)
  rc.passages[0].questions[0].explanation = 'Option C is right because the passage says so in its second paragraph.'
  r = await gen('rc', 'hard', 4, rc)
  check(r.status === 200 && !/Option C/i.test(r.body.groups[0].questions[0].explanation), 'an explanation citing "Option C" is neutralised, not dropped')
  const nt = makeGenerated('rc', 'hard', 9)
  const ntq = nt.passages[0].questions.find((q: any) => q.kind === 'not-true')
  ntq.stem = 'Which of these is not something the passage claims about borrowing and growth?'
  r = await gen('rc', 'hard', 9, nt)
  check(r.status === 200 && countQ(r.body.groups) === 9, 'a lowercase "not" satisfies a NOT-true stem')
  fastTiming()
}

async function suitePaperHappy() {
  suite('fetchEnglishPaper: full 30-question sections, simulated latency (generate 80 ms ~ 8 s, solve 40 ms ~ 4 s)')
  process.env.GEMINI_API_KEY = 'test-key'
  fastTiming()
  for (const [label, reqs, diff] of [
    ['PO', PO_REQUESTS, 'hard'],
    ['Clerk', CLERK_REQUESTS, 'medium'],
  ] as [string, EnglishRequest[], MockDifficulty][]) {
    resetBehavior({ latency: { generate: 80, solve: 40 }, rateLimit: { max: 15, windowMs: 600 } })
    const progress: [number, number][] = []
    const t0 = Date.now()
    const out = await fetchEnglishPaper(reqs, diff, { onProgress: (a, b) => progress.push([a, b]) })
    const ms = Date.now() - t0
    validatePaper(label, reqs, diff, out)
    const st = getLastEnglishRunStats()!
    check(sumCounts(reqs) === 30, `${label}: 30 questions requested`)
    check(apiCalls <= 16, `${label}: <= 16 API calls in the happy path (used ${apiCalls}: ${genCalls()} generate + ${geminiCalls.length - genCalls()} solve)`)
    check(st.rounds === 1, `${label}: finished in one round`)
    check(ms < 2000, `${label}: simulated latency ${ms} ms (a serial design needs several times that)`)
    check(progress.length > 0 && progress.every((p, i) => p[1] === 30 && (i === 0 || p[0] >= progress[i - 1][0])) && progress.at(-1)![0] === 30, `${label}: onProgress(ready, 30) is monotonic and ends at 30`)
    const solveCalls = geminiCalls.filter((c) => c.kind === 'solve')
    check(solveCalls.every((c) => c.model !== 'gemini-3.5-flash'), `${label}: the solver never reuses the generating model`)
    check(new Set(solveCalls.flatMap((c) => [...c.prompt.matchAll(/^Topic: (.+)$/gm)].map((m) => m[1]))).size > 1, `${label}: one solve call pools items from several topics`)
    console.log(`   ${label}: ${apiCalls} API calls (${genCalls()} generate + ${solveCalls.length} solve), ${ms} ms simulated, rounds ${st.rounds}`)
  }
}

async function suitePaperNoisy() {
  suite('fetchEnglishPaper: 25% bad items + noisy solver still completes within 3 rounds')
  process.env.GEMINI_API_KEY = 'test-key'
  fastTiming()
  for (let trial = 0; trial < 4; trial++) {
    for (const [label, reqs, diff] of [
      ['PO', PO_REQUESTS, 'hard'],
      ['Clerk', CLERK_REQUESTS, 'medium'],
    ] as [string, EnglishRequest[], MockDifficulty][]) {
      resetBehavior({ latency: { generate: 20, solve: 10 }, badRate: 0.25, solverWrongRate: 0.1, solverAmbiguousRate: 0.1 })
      try {
        const out = await fetchEnglishPaper(reqs, diff)
        validatePaper(`${label} noisy #${trial}`, reqs, diff, out)
        const st = getLastEnglishRunStats()!
        check(st.rounds <= 3, `${label} noisy #${trial}: rounds ${st.rounds} <= 3`)
        let wrong = 0
        for (const groups of out) for (const g of groups) for (const q of g.questions) if (isWrongKey(keyFor(q))) wrong++
        check(wrong === 0, `${label} noisy #${trial}: no solver-disagreed question returned`)
      } catch (e) {
        check(false, `${label} noisy #${trial}: threw ${(e as Error).message}`)
      }
    }
  }
}

async function suitePaperFaults() {
  suite('fetchEnglishPaper: 429 / 503 / timeouts give the right EnglishPrepareError reason')
  process.env.GEMINI_API_KEY = 'test-key'
  fastTiming()
  process.env.MOCK_ENGLISH_GEMINI_TIMEOUT_MS = '60'
  const reasons = ['rate-limit', 'timeout', 'network', 'quality', 'unavailable']
  let completed = 0
  for (let trial = 0; trial < 5; trial++) {
    resetBehavior({
      latency: { generate: 10, solve: 5 },
      fault: () => {
        const r = Math.random()
        return r < 0.06 ? { status: 429 } : r < 0.11 ? { status: 503 } : r < 0.14 ? 'hang' : undefined
      },
    })
    try {
      const out = await fetchEnglishPaper(PO_REQUESTS, 'hard')
      validatePaper(`sporadic #${trial}`, PO_REQUESTS, 'hard', out)
      completed++
    } catch (e) {
      check(e instanceof EnglishPrepareError && reasons.includes(e.reason), `sporadic #${trial}: failure is an EnglishPrepareError with a reason (${(e as Error).message})`)
    }
  }
  check(completed >= 3, `sporadic faults: most runs complete (${completed}/6)`)

  const persistent: [string, Partial<Behavior>, string, RegExp][] = [
    ['429 everywhere', { fault: () => ({ status: 429 }) }, 'rate-limit', /rate-limiting/],
    ['upstream hangs', { fault: () => 'hang' }, 'timeout', /too slow/],
    ['503 everywhere', { fault: () => ({ status: 503 }) }, 'network', /check your connection/],
    ['solver always disagrees', { solverWrongRate: 1 }, 'quality', /accuracy check/],
  ]
  for (const [label, over, reason, msg] of persistent) {
    resetBehavior({ latency: { generate: 5, solve: 5 }, ...over })
    await expectThrows(() => fetchEnglishPaper(PO_REQUESTS, 'hard'), `${label} -> reason ${reason}`, (e) => e instanceof EnglishPrepareError && e.reason === reason && msg.test(e.message))
  }
  resetBehavior()
  delete process.env.GEMINI_API_KEY
  await expectThrows(() => fetchEnglishPaper(PO_REQUESTS, 'hard'), 'server without a key -> reason unavailable', (e) => e instanceof EnglishPrepareError && e.reason === 'unavailable')
  check(apiCalls <= PO_REQUESTS.length, `an unconfigured server is not hammered (${apiCalls} API calls)`)
  process.env.GEMINI_API_KEY = 'test-key'
  fastTiming()

  // Rate limiter stub: more than 8 calls per 100 ms window -> 429; backoff + shared cooldown let the paper finish.
  resetBehavior({ latency: { generate: 20, solve: 10 }, rateLimit: { max: 8, windowMs: 100 } })
  ENGLISH_TUNING.rateLimitRetries = 5
  try {
    const out = await fetchEnglishPaper(PO_REQUESTS, 'hard')
    validatePaper('rate-limited', PO_REQUESTS, 'hard', out)
    const st = getLastEnglishRunStats()!
    check((st.http['429'] ?? 0) > 0 && st.retries > 0, `rate limiter fired (${st.http['429'] ?? 0}x 429) and was retried (${st.retries} retries)`)
  } catch (e) {
    check(e instanceof EnglishPrepareError && e.reason === 'rate-limit', `rate-limited paper completes or fails with reason rate-limit (${(e as Error).message})`)
  }
  fastTiming()
}

async function suiteResume() {
  suite('bank: "Try again" resumes from the bank instead of restarting')
  process.env.GEMINI_API_KEY = 'test-key'
  fastTiming()
  installStorage()
  ENGLISH_TUNING.useBank = true
  clearEnglishBank()
  resetBehavior({ latency: { generate: 10, solve: 5 }, fault: ({ kind, topic }) => (kind === 'generate' && topic === 'phrase-replacement' ? { status: 503 } : undefined) })
  await expectThrows(() => fetchEnglishPaper(PO_REQUESTS, 'hard'), 'first attempt fails while one topic is down', (e) => e instanceof EnglishPrepareError && e.reason === 'network')
  const g1 = genCalls()
  const size1 = englishBankSize('hard')
  check(size1 >= 20, `everything verified before the failure is banked (${size1} questions)`)
  check(englishBankSize('medium') === 0, 'the bank is per difficulty')

  resetBehavior({ latency: { generate: 10, solve: 5 } })
  const out = await fetchEnglishPaper(PO_REQUESTS, 'hard')
  const keys2 = validatePaper('resume', PO_REQUESTS, 'hard', out)
  const g2 = genCalls()
  const topics2 = new Set(geminiCalls.filter((c) => c.kind === 'generate').map((c) => c.topic))
  check(g2 >= 1 && g2 < g1, `second attempt makes strictly fewer generate calls (${g2} vs ${g1})`)
  check([...topics2].every((t) => t === 'phrase-replacement'), `second attempt only generates the missing topic (${[...topics2].join(',')})`)
  const st = getLastEnglishRunStats()!
  check(Object.values(st.topics).reduce((n, t) => n + t.fromBank, 0) >= 20, 'second attempt reports questions drawn from the bank')

  // Used groups are consumed: a third paper shares no question with the second.
  resetBehavior({ latency: { generate: 10, solve: 5 } })
  const out3 = await fetchEnglishPaper(PO_REQUESTS, 'hard')
  const keys3 = validatePaper('third paper', PO_REQUESTS, 'hard', out3)
  check([...keys3].every((k) => !keys2.has(k)), 'a consumed question never reappears in the next paper')

  // Leftovers: asking for 10 over-requests; the extras stay banked and serve the next small request with zero calls.
  clearEnglishBank()
  resetBehavior()
  const a = await fetchEnglishPaper([{ topic: 'error-detection', count: 10 }], 'medium')
  check(countQ(a[0]) === 10, 'ED x10 delivered')
  const left = englishBankSize('medium')
  check(left >= 3, `over-requested verified leftovers are banked (${left} questions)`)
  resetBehavior()
  const b = await fetchEnglishPaper([{ topic: 'error-detection', count: Math.min(5, left) }], 'medium')
  check(countQ(b[0]) === Math.min(5, left) && apiCalls === 0, `a request the bank can cover makes ZERO API calls (${apiCalls})`)
  check(englishBankSize('medium') === left - Math.min(5, left), 'consumed groups are removed from the bank')
  ENGLISH_TUNING.useBank = false
  removeStorage()
}

async function suiteBank() {
  suite('bank: persistence, dedupe, cap, versioning and corrupt-storage tolerance')
  fastTiming()
  const mkEd = (i: number): Group => ({
    questions: [{ topic: 'error-detection', stem: `Read each sentence carefully.\n\n(a) alpha${i} beta (b) gamma delta (c) epsilon${i} zeta (d) eta theta`, options: ['(a)', '(b)', '(c)', '(d)', 'No error'], answer: i % 5, explanation: `Rule ${i} applies here.` }],
  })
  const store = installStorage()
  clearEnglishBank()
  bankAdd('error-detection', 'medium', [mkEd(1), mkEd(2)])
  check(bankRead('error-detection', 'medium').length === 2 && englishBankSize('medium') === 2, 'groups persist in storage')
  check(typeof store.get(BANK_KEY) === 'string' && JSON.parse(store.get(BANK_KEY)!).v === 1, 'stored under the versioned key')
  bankAdd('error-detection', 'medium', [mkEd(1), mkEd(2), mkEd(1)])
  check(bankRead('error-detection', 'medium').length === 2, 'adding the same group again is deduplicated')
  check(bankRead('error-detection', 'hard').length === 0 && bankRead('fillers', 'medium').length === 0, 'banks are per topic and per difficulty')
  const k = bankRead('error-detection', 'medium')[0].k
  bankRemove('error-detection', 'medium', [k])
  check(bankRead('error-detection', 'medium').length === 1, 'bankRemove consumes by content key')
  bankAdd('error-detection', 'medium', Array.from({ length: BANK_CAP + 50 }, (_, i) => mkEd(100 + i)))
  const capped = bankRead('error-detection', 'medium')
  check(capped.length === BANK_CAP && englishBankSize('medium') === BANK_CAP, `bank is capped at ${BANK_CAP} groups per topic+difficulty (got ${capped.length})`)
  check(capped.some((e) => /epsilon249/.test(JSON.stringify(e.g))) && !capped.some((e) => /epsilon100\b/.test(JSON.stringify(e.g))), 'the oldest groups are dropped first')
  clearEnglishBank()
  check(englishBankSize('medium') === 0 && store.get(BANK_KEY) === undefined, 'clearEnglishBank empties the store')

  store.set(BANK_KEY, '{{{ not json')
  check(bankRead('error-detection', 'medium').length === 0 && englishBankSize('medium') === 0, 'corrupt JSON reads as an empty bank')
  bankAdd('error-detection', 'medium', [mkEd(7)])
  check(bankRead('error-detection', 'medium').length === 1, 'a write after corrupt JSON repairs the store')
  store.set(BANK_KEY, JSON.stringify({ v: 2, banks: { 'error-detection|medium': [{ k: 'x', g: mkEd(1), t: 1 }] } }))
  check(bankRead('error-detection', 'medium').length === 0, 'another version is ignored')
  store.set(BANK_KEY, JSON.stringify({ v: 1, banks: [1, 2, 3] }))
  check(englishBankSize('medium') === 0, 'wrong shape is ignored')
  const bad = mkEd(9)
  bad.questions[0].options[4] = 'Nothing wrong'
  store.set(BANK_KEY, JSON.stringify({ v: 1, banks: { 'error-detection|medium': [{ k: 'a', g: bad, t: 1 }, { k: 'b', g: mkEd(10), t: 1 }, { k: 'c', g: null, t: 1 }, 'junk'] } }))
  check(bankRead('error-detection', 'medium').length === 1, 'entries that fail the checks (or are malformed) are ignored, valid ones kept')

  removeStorage()
  let threw = false
  try {
    bankAdd('error-detection', 'medium', [mkEd(1)])
    bankRead('error-detection', 'medium')
    bankRemove('error-detection', 'medium', ['x'])
    englishBankSize('medium')
    clearEnglishBank()
  } catch {
    threw = true
  }
  check(!threw, 'no localStorage at all: every call is a harmless no-op')
  installStorage({ failGet: true })
  try {
    check(bankRead('error-detection', 'medium').length === 0 && englishBankSize('medium') === 0, 'storage that throws on read behaves as empty')
    bankAdd('error-detection', 'medium', [mkEd(1)])
  } catch {
    threw = true
  }
  installStorage({ failSet: true })
  try {
    bankAdd('error-detection', 'medium', [mkEd(1)])
    bankRemove('error-detection', 'medium', ['x'])
  } catch {
    threw = true
  }
  const q = installStorage({ maxChars: 6000 })
  try {
    bankAdd('error-detection', 'medium', Array.from({ length: 60 }, (_, i) => mkEd(i)))
  } catch {
    threw = true
  }
  check(!threw, 'blocked / quota-exceeded storage never throws')
  check((q.get(BANK_KEY)?.length ?? 0) <= 6000, 'quota pressure sheds old groups instead of failing')

  // A paper still runs when the stored bank is corrupt.
  process.env.GEMINI_API_KEY = 'test-key'
  const s2 = installStorage()
  s2.set(BANK_KEY, 'garbage{')
  ENGLISH_TUNING.useBank = true
  resetBehavior()
  const out = await fetchEnglishPaper([{ topic: 'fillers', count: 4 }], 'medium')
  check(countQ(out[0]) === 4 && bankRead('fillers', 'medium').length > 0, 'a paper runs and re-seeds the bank when the stored bank was corrupt')
  ENGLISH_TUNING.useBank = false
  removeStorage()
}

async function suiteLadder() {
  suite('quality ladder: strict first, then solver-agreed-but-ambiguous; never a disagreement')
  process.env.GEMINI_API_KEY = 'test-key'
  fastTiming()
  resetBehavior({ latency: { generate: 10, solve: 5 }, solverAmbiguousRate: 1 })
  const out = await fetchEnglishPaper(PO_REQUESTS, 'hard')
  validatePaper('ladder (all flagged ambiguous)', PO_REQUESTS, 'hard', out)
  const st = getLastEnglishRunStats()!
  const lenient = Object.values(st.topics).reduce((n, t) => n + t.lenientUsed, 0)
  check(lenient >= 20 && st.rounds === 1, `with every item flagged ambiguous the reserve fills the paper after round 1 (${lenient} lenient questions, ${st.rounds} round)`)
  check(Object.values(st.topics).every((t) => t.disagree === 0), 'no disagreement was recorded in this scenario')

  resetBehavior({ latency: { generate: 10, solve: 5 }, solverWrongRate: 0.3, solverAmbiguousRate: 0.5 })
  try {
    const out2 = await fetchEnglishPaper(PO_REQUESTS, 'hard')
    validatePaper('ladder (30% wrong, 50% ambiguous)', PO_REQUESTS, 'hard', out2)
    let wrong = 0
    for (const groups of out2) for (const g of groups) for (const q of g.questions) if (isWrongKey(keyFor(q))) wrong++
    check(wrong === 0, 'a solver DISAGREEMENT is never accepted, even by the lenient ladder')
  } catch (e) {
    check(e instanceof EnglishPrepareError && e.reason === 'quality', `if the ladder cannot fill the paper it fails with reason quality (${(e as Error).message})`)
  }

  resetBehavior({ latency: { generate: 5, solve: 5 }, solverWrongRate: 1, solverAmbiguousRate: 1 })
  await expectThrows(() => fetchEnglishPaper(PO_REQUESTS, 'hard'), 'every answer disagreeing -> quality, nothing accepted', (e) => e instanceof EnglishPrepareError && e.reason === 'quality')

  ENGLISH_TUNING.lenientLadder = false
  resetBehavior({ latency: { generate: 5, solve: 5 }, solverAmbiguousRate: 1 })
  await expectThrows(() => fetchEnglishPaper(PO_REQUESTS, 'hard'), 'strict-only mode never relaxes', (e) => e instanceof EnglishPrepareError && e.reason === 'quality')
  ENGLISH_TUNING.lenientLadder = true

  // Strict items are preferred: with mild ambiguity the paper is built from agreed, unambiguous items.
  resetBehavior({ latency: { generate: 5, solve: 5 }, solverAmbiguousRate: 0.2 })
  const out3 = await fetchEnglishPaper(PO_REQUESTS, 'hard')
  validatePaper('ladder (mild ambiguity)', PO_REQUESTS, 'hard', out3)
  let amb = 0
  for (const groups of out3) for (const g of groups) for (const q of g.questions) if (isAmbiguousKey(keyFor(q))) amb++
  check(amb <= 8, `strict items dominate when ambiguity is mild (${amb} of 30 flagged items used)`)
}

async function suiteAbortPaper() {
  suite('fetchEnglishPaper: abort handling')
  process.env.GEMINI_API_KEY = 'test-key'
  fastTiming()
  resetBehavior()
  const pre = new AbortController()
  pre.abort()
  await expectThrows(() => fetchEnglishPaper(PO_REQUESTS, 'hard', { signal: pre.signal }), 'pre-aborted paper rejects', (e) => e.name === 'AbortError')
  check(apiCalls === 0, 'pre-aborted paper makes no API call')
  resetBehavior({ latency: { generate: 300, solve: 100 } })
  const ac = new AbortController()
  const t0 = Date.now()
  setTimeout(() => ac.abort(), 40)
  await expectThrows(() => fetchEnglishPaper(PO_REQUESTS, 'hard', { signal: ac.signal }), 'abort mid-flight rejects with AbortError', (e) => e.name === 'AbortError')
  check(Date.now() - t0 < 250, `abort is prompt (${Date.now() - t0} ms)`)
  check(getLastEnglishRunStats()?.outcome === 'aborted', 'stats record the abort')
  const after = apiCalls
  await wait(700)
  check(apiCalls === after, 'no API call starts after the abort')
  resetBehavior({ fault: () => ({ status: 429 }) })
  const ac2 = new AbortController()
  ENGLISH_TUNING.rateLimitBaseMs = 5000
  ENGLISH_TUNING.maxRetryAfterMs = 20000
  setTimeout(() => ac2.abort(), 120)
  const t1 = Date.now()
  await expectThrows(() => fetchEnglishPaper(PO_REQUESTS, 'hard', { signal: ac2.signal }), 'abort during a rate-limit cooldown rejects', (e) => e.name === 'AbortError')
  check(Date.now() - t1 < 600, `abort interrupts the cooldown (${Date.now() - t1} ms)`)
  fastTiming()
}

async function suiteDiagnostics() {
  suite('diagnostics: one compact summary per run, no secrets')
  process.env.GEMINI_API_KEY = 'test-key'
  fastTiming()
  ENGLISH_TUNING.logSummary = true
  const lines: string[] = []
  const orig = console.info
  console.info = (...a: unknown[]) => void lines.push(a.map(String).join(' '))
  try {
    resetBehavior({ latency: { generate: 10, solve: 5 }, badRate: 0.2 })
    await fetchEnglishPaper(PO_REQUESTS, 'hard')
    resetBehavior({ solverWrongRate: 1 })
    await fetchEnglishPaper([{ topic: 'fillers', count: 4 }], 'hard').catch(() => undefined)
  } finally {
    console.info = orig
    ENGLISH_TUNING.logSummary = false
  }
  check(lines.length === 2, `exactly one console.info per run, success and failure (${lines.length})`)
  const first = lines[0] ?? ''
  check(/\[english\] hard ok/.test(first) && /api calls \d+ generate \+ \d+ solve/.test(first) && /http 200x\d+/.test(first), 'header line names outcome, call counts and HTTP status counts')
  check(/rc\s+\d+\s+\d+/.test(first) && /error-detection/.test(first) && /agree/.test(first) && /phases:/.test(first), 'per-topic table and phase timings are present')
  check(/drops: "/.test(first), 'top deterministic drop reasons are listed')
  check(/\[english\] hard quality/.test(lines[1] ?? ''), 'a failed run is summarised too, with its reason')
  check(!/test-key/.test(lines.join('\n')) && !/Task: mock-english/.test(lines.join('\n')) && !/Global rules/.test(lines.join('\n')), 'the summary contains no key and no prompt text')
  const st = getLastEnglishRunStats()!
  check(st.calls.length > 0 && percentile([1, 2, 3, 4, 5], 50) === 3 && percentile([1, 2, 3, 4, 5], 90) === 5 && percentile([], 50) === 0, 'per-call stats and percentile helper work')
  check(formatEnglishRunStats(st).includes('quality'), 'formatEnglishRunStats is exported and reusable')
}

// ---------------------------------------------------------------------------------------------------
// Prompt printing and live mode
// ---------------------------------------------------------------------------------------------------

async function printPrompts() {
  process.env.GEMINI_API_KEY = 'test-key'
  fastTiming()
  const capture = async (topic: EnglishTopicId, diff: MockDifficulty, count: number) => {
    resetBehavior()
    await callHandler({ action: 'generate', topic, difficulty: diff, count, seed: 2025 })
    return geminiCalls[0].prompt
  }
  for (const t of TOPICS) {
    const p = await capture(t, 'hard', 4)
    console.log(`\n--- schema: ${t}\n${p.slice(p.lastIndexOf('exactly this shape:') + 20)}`)
  }
  console.log('\n\n========== PROMPT: rc / hard / 9 questions ==========\n' + (await capture('rc', 'hard', 9)))
  console.log('\n\n========== PROMPT: error-detection / medium / 5 items ==========\n' + (await capture('error-detection', 'medium', 5)))
  resetBehavior({})
  const q = { id: 'g0.0', topic: 'error-detection', stem: 'Read each sentence...\n\n(a) x (b) y (c) z (d) w', options: ['(a)', '(b)', '(c)', '(d)', 'No error'] }
  await callHandler({ action: 'solve', items: [q] })
  console.log('\n\n========== PROMPT: solve (1 item) ==========\n' + geminiCalls.at(-1)!.prompt)
}

async function liveRun(n: number) {
  liveMode = true
  process.env.GEMINI_API_KEY = realKey
  delete process.env.GEMINI_MODEL
  liveTiming()
  console.log(`\n== LIVE: ${n} items per topic/difficulty (generator vs blind solver)`)
  console.log('topic/difficulty            requested  built  dropped(det)  solver-agree  ambiguous  gen-model -> solve-model')
  for (const topic of TOPICS) {
    for (const diff of DIFFS) {
      const count = Math.min(n, topic === 'cloze' ? 5 : 10)
      const t0 = Date.now()
      const gen = await callHandler({ action: 'generate', topic, difficulty: diff, count, seed: `live-${Date.now()}` })
      if (gen.status !== 200) {
        console.log(`${(topic + '/' + diff).padEnd(27)} generate failed: ${gen.status} ${gen.body?.error}`)
        continue
      }
      const groups = gen.body.groups as Group[]
      const items = groups.flatMap((g, gi) => g.questions.map((q, qi) => ({ id: `${gi}.${qi}`, topic, passage: g.stimulus ? (g.stimulus.parts[0] as any).paragraphs.join('\n\n') : undefined, stem: q.stem, options: q.options, answer: q.answer })))
      let agree = 0
      let ambiguous = 0
      let solved = 0
      let solveModel = '?'
      for (let i = 0; i < items.length; i += 12) {
        const chunk = items.slice(i, i + 12)
        const s = await callHandler({ action: 'solve', avoidModel: gen.body.meta.model, items: chunk.map(({ answer: _a, ...rest }) => rest) })
        if (s.status !== 200) continue
        solveModel = s.body.model
        for (const r of s.body.results) {
          solved++
          const it = chunk.find((c) => c.id === r.id)!
          if (r.answer === it.answer) agree++
          if (r.ambiguous) ambiguous++
        }
      }
      const pct = (x: number, d: number) => (d ? `${Math.round((100 * x) / d)}%` : '-')
      console.log(
        `${(topic + '/' + diff).padEnd(27)} ${String(count).padStart(9)}  ${String(items.length).padStart(5)}  ${String(gen.body.meta.droppedCount).padStart(12)}  ${pct(agree, solved).padStart(12)}  ${pct(ambiguous, solved).padStart(9)}  ${gen.body.meta.model} -> ${solveModel} (${Math.round((Date.now() - t0) / 1000)}s)`,
      )
    }
  }
}


function liveTiming() {
  Object.assign(ENGLISH_TUNING, { retryDelayMs: 800, rateLimitBaseMs: 5000, maxRetryAfterMs: 20000, requestTimeoutMs: 28000, deadlineMs: 120000, maxRounds: 3, lenientLadder: true })
  delete process.env.MOCK_ENGLISH_GEMINI_TIMEOUT_MS
  delete process.env.MOCK_ENGLISH_DEADLINE_MS
  delete process.env.MOCK_ENGLISH_HEDGE_MS
  delete process.env.GEMINI_MODEL
}

/** Times a real full PO English section end to end (no key is ever printed). */
async function livePaper() {
  liveMode = true
  process.env.GEMINI_API_KEY = realKey
  liveTiming()
  ENGLISH_TUNING.useBank = false
  ENGLISH_TUNING.logSummary = true
  removeStorage()
  console.log('\n== LIVE PAPER: PO (hard) English section, ' + sumCounts(PO_REQUESTS) + ' questions, real Gemini, bank off')
  const t0 = Date.now()
  let lastReady = 0
  try {
    const out = await fetchEnglishPaper(PO_REQUESTS, 'hard', {
      onProgress: (ready, total) => {
        if (ready !== lastReady) console.log('  progress ' + ready + '/' + total + ' at ' + ((Date.now() - t0) / 1000).toFixed(1) + 's')
        lastReady = ready
      },
    })
    console.log('  RESULT: ok, ' + out.map((g, i) => PO_REQUESTS[i].topic + '=' + countQ(g)).join(' ') + ' in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's')
  } catch (e) {
    const err = e as Error & { reason?: string }
    console.log('  RESULT: FAILED reason=' + (err.reason ?? 'n/a') + ' after ' + ((Date.now() - t0) / 1000).toFixed(1) + 's: ' + err.message)
  }
  const st = getLastEnglishRunStats()
  if (st) {
    console.log('  per-call latency (client-observed, ms):')
    for (const kind of ['generate', 'solve'] as const) {
      const ok = st.calls.filter((c) => c.kind === kind && c.status === 200).map((c) => c.ms)
      const all = st.calls.filter((c) => c.kind === kind)
      console.log('    ' + kind.padEnd(8) + ' calls ' + String(all.length).padStart(2) + ' (ok ' + ok.length + ')  p50 ' + percentile(ok, 50) + '  p90 ' + percentile(ok, 90) + '  max ' + (ok.length ? Math.max(...ok) : 0))
    }
    const failed = st.calls.filter((c) => c.status !== 200).map((c) => c.kind + ':' + c.status + ':' + c.ms + 'ms')
    if (failed.length) console.log('  non-200 attempts: ' + failed.join(', '))
  }
  console.log('  Paste everything above back; no API key is printed.')
}

async function liveSmoke() {
  suite('live smoke test (GEMINI_API_KEY is set)')
  liveMode = true
  process.env.GEMINI_API_KEY = realKey
  delete process.env.GEMINI_MODEL
  liveTiming()
  for (const [topic, count] of [['error-detection', 3], ['fillers', 3]] as [EnglishTopicId, number][]) {
    try {
      const gs = await fetchEnglishGroups(topic, 'medium', count)
      check(countQ(gs) === count, `live ${topic}: ${count} verified questions`)
      console.log(JSON.stringify(gs[0].questions[0], null, 2))
    } catch (e) {
      check(false, `live ${topic}: ${(e as Error).message}`)
    }
  }
  liveMode = false
}

// ---------------------------------------------------------------------------------------------------


// Integration: the real paper composer (Quant/Reasoning generators + this English pipeline against the stub)
// builds complete full-length papers that match the exam blueprints. Set MOCK_PAPER_DIR to also write them as JSON.
async function suiteComposeFull() {
  suite('composePaper: full-length PO and Clerk papers')
  process.env.GEMINI_API_KEY = 'test-key'
  fastTiming()
  for (const examId of ['po', 'clerk'] as const) {
    resetBehavior()
    const exam = EXAMS[examId]
    const paper = await composePaper({ exam: examId, kind: 'full' })
    const wantTotal = exam.sections.reduce((n, s) => n + entryTotal(s.entries), 0)
    check(paper.questions.length === 100 && wantTotal === 100, `${examId}: 100 questions`)
    check(paper.totalDurationSec === 3600 && paper.sectionLocked, `${examId}: 60 minutes, sections locked`)
    check(paper.sections.map((s) => s.questionIds.length).join('/') === '30/35/35', `${examId}: sections 30/35/35 (got ${paper.sections.map((s) => s.questionIds.length).join('/')})`)
    check(paper.sections.every((s) => s.durationSec === 1200), `${examId}: 20 minutes per section`)
    check(new Set(paper.questions.map((q) => q.id)).size === 100, `${examId}: unique ids`)
    check(paper.sections.every((s, i) => s.questionIds.every((id) => paper.questions.find((q) => q.id === id)?.section === exam.sections[i].id)), `${examId}: questions sit in the right sections`)
    check(paper.questions.every((q) => q.options.length === 5 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 5), `${examId}: every question has 5 options and a valid key`)
    check(paper.questions.every((q) => !q.setId || paper.sets[q.setId]), `${examId}: every set reference resolves`)
    const keys = new Set(paper.questions.map((q) => `${q.stem}|${q.options.join('|')}`.toLowerCase()))
    check(keys.size === 100, `${examId}: no duplicate questions (${keys.size} distinct)`)
    const qMix = paper.questions.reduce<Record<string, number>>((m, q) => ((m[q.topic] = (m[q.topic] ?? 0) + 1), m), {})
    console.log(`   ${examId} topic mix:`, JSON.stringify(qMix))
    if (process.env.MOCK_PAPER_DIR) writeFileSync(`${process.env.MOCK_PAPER_DIR}/paper-${examId}.json`, JSON.stringify(paper))
  }
  // Sectional and topic kinds.
  resetBehavior()
  const sec = await composePaper({ exam: 'clerk', kind: 'sectional', section: 'quant' })
  check(sec.questions.length === 35 && sec.totalDurationSec === 1200 && !sec.sectionLocked, 'clerk sectional quant: 35 questions / 20 minutes')
  const topic = await composePaper({ exam: 'po', kind: 'topic', section: 'reasoning', topic: 'syllogism', questionCount: 12, secPerQuestion: 40 })
  check(topic.questions.length === 12 && topic.totalDurationSec === 480, 'topic test: 12 questions x 40 s = 480 s')
  const dTopic = await composePaper({ exam: 'po', kind: 'topic', section: 'quant', topic: 'di-pie', questionCount: 7, secPerQuestion: 60 })
  check(dTopic.questions.length === 7 && Object.keys(dTopic.sets).length === 2, 'topic test: di-pie 7 questions -> 2 sets (5 + 2)')
}

async function main() {
  installFetch()
  if (argv.includes('--print-prompts')) {
    await printPrompts()
    return
  }
  if (argv.includes('--live-paper')) {
    if (!realKey) {
      console.error('--live-paper needs GEMINI_API_KEY in the environment.')
      process.exit(2)
    }
    await livePaper()
    return
  }
  if (liveIdx >= 0) {
    if (!realKey) {
      console.error('--live needs GEMINI_API_KEY in the environment.')
      process.exit(2)
    }
    await liveRun(Number(argv[liveIdx + 1]) || 5)
    return
  }
  const t0 = Date.now()
  // `--only <name>` runs just the suites whose name contains it (e.g. --only Paper).
  const onlyIdx = argv.indexOf('--only')
  const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : ''
  const suites: [string, () => Promise<void>][] = [
    ['HandlerInput', suiteHandlerInput],
    ['HandlerGemini', suiteHandlerGemini],
    ['ServerRejections', suiteServerRejections],
    ['Builders', suiteBuilders],
    ['ClientChecks', suiteClientChecks],
    ['HappyPath', suiteHappyPath],
    ['SolverDisagreement', suiteSolverDisagreement],
    ['ExactCount', suiteExactCount],
    ['ClientFaults', suiteClientFaults],
    ['Abort', suiteAbort],
    ['Sequential', suiteSequential],
    ['Relaxed', suiteRelaxed],
    ['PaperHappy', suitePaperHappy],
    ['PaperNoisy', suitePaperNoisy],
    ['PaperFaults', suitePaperFaults],
    ['Resume', suiteResume],
    ['Bank', suiteBank],
    ['Ladder', suiteLadder],
    ['AbortPaper', suiteAbortPaper],
    ['Diagnostics', suiteDiagnostics],
    ['ComposeFull', suiteComposeFull],
  ]
  for (const [name, fn] of suites) if (!only || name.toLowerCase().includes(only.toLowerCase())) await fn()
  if (realKey) await liveSmoke()
  else console.log('\n(no GEMINI_API_KEY in the environment: live smoke test skipped; run with --live N once a key is available)')

  globalThis.fetch = realFetch
  console.log(`\n${passed} checks passed, ${failures.length} failed in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  if (failures.length) {
    console.log('\nFailures:')
    for (const f of failures) console.log(' - ' + f)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('Harness crashed:', e)
  process.exit(1)
})
