// Deterministic English questions for the Daily Dose. Everything here is a pure function of the date key, so a
// given day always yields the same paper: no network, no Math.random.
//
// Layout is the "English Daily Checklist (Prelims + Mains)" sheet re-weighted towards Mains: an 8-question RC, more
// error detection / fillers / word swap, and fewer plain vocabulary items. Selection is mostly hard-tier (70 %) and
// the word banks are hard-tier only.

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
  { topic: 'error-detection', count: 8 },
  { topic: 'rc', count: 8 },
  { topic: 'para-jumble', count: 5 },
  { topic: 'cloze', count: 5 },
  { topic: 'fillers', count: 4 },
  { topic: 'word-swap', count: 3 },
  { topic: 'phrase-replacement', count: 4 },
  { topic: 'vocab-quiz', count: 3 },
  { topic: 'idioms', count: 2 },
  { topic: 'phrasal-verbs', count: 2 },
  { topic: 'one-word', count: 1 },
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

/** Share of each day's stand-alone items taken from the hard tier; the rest come from medium so the cycle stays long. */
const HARD_SHARE = 0.7

/** Whole-passage topics (rc, cloze): two hard passages for every medium one, rotated by day. */
function pickPassage(topic: 'rc' | 'cloze', need: number, dateKey: string): Group {
  const all = getSeedEntries(topic)
    .filter((e) => e.group.questions.length >= need)
    .sort((a, b) => a.id.localeCompare(b.id))
  const hard = all.filter((e) => e.difficulty === 'hard')
  const medium = all.filter((e) => e.difficulty !== 'hard')
  if (all.length === 0) throw new Error(`No ${topic} passage with ${need}+ questions in the curated bank.`)
  const hardOrder = createRng(hashString(`order:${topic}:hard`)).shuffle(hard)
  const mediumOrder = createRng(hashString(`order:${topic}:medium`)).shuffle(medium)
  const seq: typeof all = []
  for (let h = 0, m = 0; h < hardOrder.length; h += 2, m++) {
    seq.push(...hardOrder.slice(h, h + 2))
    if (mediumOrder.length) seq.push(mediumOrder[m % mediumOrder.length])
  }
  if (seq.length === 0) seq.push(...mediumOrder)
  return trimGroup(topic, seq[dayNumber(dateKey) % seq.length].group, need)
}

/** Stand-alone items (one question each): mostly hard-tier entries, each tier walked in its own fixed order. */
function pickStandalone(topic: EnglishTopicId, need: number, dateKey: string): Group[] {
  const all = getSeedEntries(topic)
    .filter((e) => e.group.questions.length === 1)
    .sort((a, b) => a.id.localeCompare(b.id))
  const hard = all.filter((e) => e.difficulty === 'hard')
  const medium = all.filter((e) => e.difficulty !== 'hard')
  const nHard = Math.min(hard.length, Math.ceil(need * HARD_SHARE))
  const nMedium = need - nHard
  if (medium.length < nMedium) throw new Error(`Only ${all.length} ${topic} questions in the curated bank, need ${need}.`)
  const chosen = [...rotate(hard.length, nHard, `${topic}:hard`, dateKey).map((i) => hard[i]), ...rotate(medium.length, nMedium, `${topic}:medium`, dateKey).map((i) => medium[i])]
  return createRng(hashString(`mix:${topic}:${dateKey}`))
    .shuffle(chosen)
    .map((e) => ({ questions: [e.group.questions[0]] }))
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
  // Mains level: hard-tier entries only (distractors come from the same tier, so they are plausible).
  const hard = spec.bank.filter((e) => e.difficulty === 'hard')
  const pool = (hard.length >= need * 8 ? hard : spec.bank).slice().sort((a, b) => a.id.localeCompare(b.id))
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
