// Deterministic English questions for the Daily Dose. Everything here is a pure function of the date key, so a
// given day always yields the same paper: no network, no Math.random.
//
// Layout follows the "English Daily Checklist (Prelims + Mains)" practice sheet: 10 error detection, 5 reading
// comprehension, 5 para jumble, 5 cloze, 5 sentence improvement (phrase replacement), 5 vocabulary, 3 idioms,
// 3 phrasal verbs and 4 one-word substitutions.

import { VOCAB_BANK } from '../../data/vocabulary'
import { IDIOMS_BANK } from '../../data/idioms'
import { PHRASAL_VERBS_BANK } from '../../data/phrasalVerbs'
import { ONE_WORD_BANK } from '../../data/oneWordSubstitutes'
import type { BankEntry } from '../types'
import { createRng, type Rng } from '../mocks/rng'
import { trimGroup } from '../mocks/english'
import { getSeedEntries } from '../mocks/english/seed'
import type { DailyEnglishTopicId, EnglishTopicId, Group, QuestionDraft } from '../mocks/types'

export interface EnglishSlot {
  topic: EnglishTopicId | DailyEnglishTopicId
  count: number
}

export const DAILY_ENGLISH_PLAN: EnglishSlot[] = [
  { topic: 'error-detection', count: 10 },
  { topic: 'rc', count: 5 },
  { topic: 'para-jumble', count: 5 },
  { topic: 'cloze', count: 5 },
  { topic: 'phrase-replacement', count: 5 },
  { topic: 'vocab-quiz', count: 5 },
  { topic: 'idioms', count: 3 },
  { topic: 'phrasal-verbs', count: 3 },
  { topic: 'one-word', count: 4 },
]

/** FNV-1a: a stable 32-bit hash of a string. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Whole days since 1970-01-01 for a `YYYY-MM-DD` key (time-zone independent). */
export function dayNumber(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
}

/**
 * Walks a pool in a fixed per-topic shuffled order, `step` items per day, so consecutive days never repeat an item
 * until the whole pool has been used once. Returns `need` distinct indexes (fewer only if the pool is smaller).
 */
function rotate(poolSize: number, take: number, topic: string, dateKey: string, step = take): number[] {
  const order = createRng(hashString(`order:${topic}:${poolSize}`)).shuffle(Array.from({ length: poolSize }, (_, i) => i))
  const start = (dayNumber(dateKey) * step) % poolSize
  const out: number[] = []
  for (let i = 0; i < Math.min(take, poolSize); i++) out.push(order[(start + i) % poolSize])
  return out
}

/** Whole-passage topics (rc, cloze): the first passage in the day's rotation that has at least `need` questions. */
function pickPassage(topic: 'rc' | 'cloze', need: number, dateKey: string): Group {
  const pool = getSeedEntries(topic)
    .filter((e) => e.group.questions.length >= need)
    .sort((a, b) => a.id.localeCompare(b.id))
  if (pool.length === 0) throw new Error(`No ${topic} passage with ${need}+ questions in the curated bank.`)
  const idx = rotate(pool.length, 1, topic, dateKey)[0]
  return trimGroup(topic, pool[idx].group, need)
}

/** Stand-alone items (one question each): `need` distinct entries from the day's rotation. */
function pickStandalone(topic: EnglishTopicId, need: number, dateKey: string): Group[] {
  const pool = getSeedEntries(topic)
    .filter((e) => e.group.questions.length === 1)
    .sort((a, b) => a.id.localeCompare(b.id))
  if (pool.length < need) throw new Error(`Only ${pool.length} ${topic} questions in the curated bank, need ${need}.`)
  return rotate(pool.length, need, topic, dateKey).map((i) => ({ questions: [pool[i].group.questions[0]] }))
}

/** Para jumble entries may hold more than one question; take whole entries until `need` questions are covered. */
function pickParaJumble(need: number, dateKey: string): Group[] {
  const pool = getSeedEntries('para-jumble').sort((a, b) => a.id.localeCompare(b.id))
  const order = rotate(pool.length, pool.length, 'para-jumble', dateKey, need)
  const out: Group[] = []
  let have = 0
  for (const i of order) {
    if (have >= need) break
    const g = pool[i].group
    const take = Math.min(g.questions.length, need - have)
    out.push({ stimulus: g.stimulus, questions: g.questions.slice(0, take) })
    have += take
  }
  if (have < need) throw new Error('Not enough para jumble questions in the curated bank.')
  return out
}

// ---------------------------------------------------------------------------------------------------
// Word-bank questions
// ---------------------------------------------------------------------------------------------------

interface BankSpec {
  topic: DailyEnglishTopicId
  bank: BankEntry[]
  /** The entry's tested side and its answer side. */
  stem: (e: BankEntry) => string
  correct: (e: BankEntry) => string
  explain: (e: BankEntry) => string
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
const sentenceCase = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

const SPECS: Record<'vocab-quiz' | 'idioms' | 'phrasal-verbs' | 'one-word', BankSpec> = {
  'vocab-quiz': {
    topic: 'vocab-quiz',
    bank: VOCAB_BANK,
    stem: (e) => `Choose the option that best gives the meaning of the word “${e.term}”.`,
    correct: (e) => sentenceCase(clean(e.meaning)),
    explain: (e) => `“${e.term}”${e.partOfSpeech ? ` (${e.partOfSpeech})` : ''} means: ${clean(e.meaning)}.\nExample: ${clean(e.example)}\nMemory hook: ${clean(e.hint)}.`,
  },
  idioms: {
    topic: 'idioms',
    bank: IDIOMS_BANK,
    stem: (e) => `Choose the option that best explains the idiom “${e.term}”.`,
    correct: (e) => sentenceCase(clean(e.meaning)),
    explain: (e) => `The idiom “${e.term}” means: ${clean(e.meaning)}.\nExample: ${clean(e.example)}\nMemory hook: ${clean(e.hint)}.`,
  },
  'phrasal-verbs': {
    topic: 'phrasal-verbs',
    bank: PHRASAL_VERBS_BANK,
    stem: (e) => `Choose the option that best gives the meaning of the phrasal verb “${e.term}”.`,
    correct: (e) => sentenceCase(clean(e.meaning)),
    explain: (e) => `The phrasal verb “${e.term}” means: ${clean(e.meaning)}.\nExample: ${clean(e.example)}\nMemory hook: ${clean(e.hint)}.`,
  },
  'one-word': {
    topic: 'one-word',
    bank: ONE_WORD_BANK,
    stem: (e) => `Choose the one word that can be substituted for the phrase: “${clean(e.term)}”.`,
    correct: (e) => clean(e.meaning),
    explain: (e) => `“${clean(e.term)}” is expressed by the single word “${clean(e.meaning)}”.\nExample: ${clean(e.example)}\nMemory hook: ${clean(e.hint)}.`,
  },
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

function bankQuestion(spec: BankSpec, e: BankEntry, pool: BankEntry[], rng: Rng): QuestionDraft {
  const answerText = spec.correct(e)
  const taken = new Set([norm(answerText)])
  const sameClass = (x: BankEntry) => x.id !== e.id && x.difficulty === e.difficulty && (!e.partOfSpeech || x.partOfSpeech === e.partOfSpeech)
  const candidates = [...rng.shuffle(pool.filter(sameClass)), ...rng.shuffle(pool.filter((x) => x.id !== e.id && !sameClass(x)))]
  const wrong: string[] = []
  for (const c of candidates) {
    const text = spec.correct(c)
    const key = norm(text)
    if (taken.has(key)) continue
    taken.add(key)
    wrong.push(text)
    if (wrong.length === 4) break
  }
  if (wrong.length < 4) throw new Error(`Not enough distinct options for ${spec.topic}: ${e.id}`)
  const options = rng.shuffle([answerText, ...wrong])
  return { topic: spec.topic, stem: spec.stem(e), options, answer: options.indexOf(answerText), explanation: spec.explain(e) }
}

function pickBank(topic: keyof typeof SPECS, need: number, dateKey: string): Group[] {
  const spec = SPECS[topic]
  // Exam-level words only: skip the "easy" tier when the bank has enough harder entries.
  const harder = spec.bank.filter((e) => e.difficulty !== 'easy')
  const pool = (harder.length >= need * 8 ? harder : spec.bank).slice().sort((a, b) => a.id.localeCompare(b.id))
  const rng = createRng(hashString(`bank:${topic}:${dateKey}`))
  return rotate(pool.length, need, topic, dateKey).map((i) => ({ questions: [bankQuestion(spec, pool[i], pool, rng)] }))
}

/** The day's English groups, in exam order, as one array per plan slot. */
export function buildDailyEnglishGroups(dateKey: string): { slot: EnglishSlot; groups: Group[] }[] {
  return DAILY_ENGLISH_PLAN.map((slot) => {
    switch (slot.topic) {
      case 'rc':
      case 'cloze':
        return { slot, groups: [pickPassage(slot.topic, slot.count, dateKey)] }
      case 'para-jumble':
        return { slot, groups: pickParaJumble(slot.count, dateKey) }
      case 'vocab-quiz':
      case 'idioms':
      case 'phrasal-verbs':
      case 'one-word':
        return { slot, groups: pickBank(slot.topic, slot.count, dateKey) }
      default:
        return { slot, groups: pickStandalone(slot.topic, slot.count, dateKey) }
    }
  })
}
