// The Hindu Vocabulary: data loading and the practice game's question builder (pure functions, no storage).
import type { MCQQuestion } from './generators'

/** Favourites for this bank live under this key (see lib/favorites.ts); entry ids are `hv-<number>`. */
export const HINDU_BANK_KEY = 'hindu-vocab'
/** Game id used for the English hub's "Best %" and the session history. */
export const HINDU_GAME_ID = 'hindu-vocab'

export interface HinduWord {
  /** `hv-<n>` — the key used for favourites. */
  id: string
  /** The word's number in the source book (1–1787); words are in alphabetical order. */
  n: number
  word: string
  /** "Noun", "Verb", "Adjective", … */
  pos: string
  hindi: string
  /** English meaning, no trailing full stop. */
  meaning: string
  /** Five of each. */
  synonyms: string[]
  antonyms: string[]
  /** Two example sentences. */
  examples: string[]
}

let bankPromise: Promise<HinduWord[]> | null = null

/** Loads the whole bank on first use (a separate chunk, so the rest of the app never pays for it). */
export function loadHinduBank(): Promise<HinduWord[]> {
  bankPromise ??= import('../data/hinduVocab.json').then((m) => m.default as HinduWord[]).catch((err) => {
    bankPromise = null // let the next visit retry
    throw err
  })
  return bankPromise
}

/* ------------------------------------------------------------------ */
/* Practice game                                                       */
/* ------------------------------------------------------------------ */

export type HinduMode = 'meaning' | 'hindi' | 'synonym' | 'antonym' | 'fill' | 'mixed'
export type HinduKind = Exclude<HinduMode, 'mixed'>

export const HINDU_MODES: { id: HinduMode; label: string; hint: string }[] = [
  { id: 'meaning', label: 'Meaning', hint: 'See the word, pick its meaning.' },
  { id: 'hindi', label: 'Hindi → Word', hint: 'See the Hindi meaning, pick the English word.' },
  { id: 'synonym', label: 'Synonym', hint: 'Pick the word that means the same.' },
  { id: 'antonym', label: 'Antonym', hint: 'Pick the word that means the opposite.' },
  { id: 'fill', label: 'Fill the blank', hint: 'Pick the word that completes an example sentence.' },
  { id: 'mixed', label: 'Mixed', hint: 'A bit of everything.' },
]

const BLANK = '_____'

function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const norm = (s: string) => s.trim().toLowerCase()
const pickOne = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** True when two words share a word or a synonym, i.e. one could be a defensible answer for the other's question. */
export function areRelated(a: HinduWord, b: HinduWord): boolean {
  const ka = new Set([a.word, ...a.synonyms].map(norm))
  return [b.word, ...b.synonyms].some((x) => ka.has(norm(x)))
}

export interface FillSentence {
  /** The sentence with the word replaced by a blank. */
  text: string
  /** The word as it must be written in the blank (lower-case unless it opens the sentence). */
  answer: string
  atStart: boolean
}

/**
 * An example sentence in which the word appears exactly once, in its base form — so the blank can be filled by the
 * plain word and the other options need no inflecting. Null when neither sentence qualifies.
 */
export function fillSentence(w: HinduWord): FillSentence | null {
  const re = new RegExp(`(?<![\\p{L}])${escapeRegex(w.word)}(?![\\p{L}])`, 'giu')
  for (const s of shuffle(w.examples)) {
    const found = [...s.matchAll(re)]
    if (found.length !== 1) continue
    const m = found[0]
    const atStart = m.index === 0
    return {
      text: s.slice(0, m.index) + BLANK + s.slice(m.index + m[0].length),
      answer: atStart ? capitalise(w.word.toLowerCase()) : w.word.toLowerCase(),
      atStart,
    }
  }
  return null
}

/** Words whose example sentences can be turned into a fill-in-the-blank. */
export function isFillable(w: HinduWord): boolean {
  return fillSentence(w) !== null
}

/**
 * `count` wrong strings: candidates from words of the same part of speech first, one value per word, skipping
 * anything in `exclude` and any word that could also be a right answer (see areRelated).
 */
function distractors(
  bank: HinduWord[],
  w: HinduWord,
  valueOf: (x: HinduWord) => string,
  exclude: string[],
  count = 3,
  lead: string[] = [],
): string[] {
  const banned = new Set([...exclude, ...lead].map(norm))
  const others = bank.filter((x) => x.n !== w.n && !areRelated(w, x))
  const ranked = [...shuffle(others.filter((x) => x.pos === w.pos)), ...shuffle(others.filter((x) => x.pos !== w.pos))]
  const out: string[] = []
  for (const l of lead) {
    if (out.length < count && !out.some((o) => norm(o) === norm(l))) out.push(l)
  }
  for (const x of ranked) {
    if (out.length >= count) break
    const v = valueOf(x)
    if (banned.has(norm(v)) || out.some((o) => norm(o) === norm(v))) continue
    out.push(v)
  }
  return out
}

function build(bank: HinduWord[], w: HinduWord, kind: HinduKind): MCQQuestion {
  const base = { id: w.id }
  if (kind === 'meaning') {
    const options = [w.meaning, ...distractors(bank, w, (x) => x.meaning, [w.meaning])]
    return {
      ...base,
      term: w.word,
      instruction: 'Choose the meaning',
      correctMeaning: w.meaning,
      options: shuffle(options),
      hint: `Hindi: ${w.hindi}`,
      explanation: `${w.hindi} · ${w.pos.toLowerCase()}`,
    }
  }
  if (kind === 'hindi') {
    const options = [w.word, ...distractors(bank, w, (x) => x.word, [w.word])]
    return {
      ...base,
      term: w.hindi,
      instruction: 'Which English word means this?',
      correctMeaning: w.word,
      options: shuffle(options),
      hint: `Meaning: ${w.meaning}`,
      explanation: w.meaning,
      noPronounce: true,
    }
  }
  if (kind === 'synonym') {
    const answer = pickOne(w.synonyms)
    // An antonym of the word is the classic trap, so one wrong option is always one of its opposites.
    const options = [answer, ...distractors(bank, w, (x) => pickOne([x.word, ...x.synonyms]), [w.word, ...w.synonyms, answer], 3, [pickOne(w.antonyms)])]
    return {
      ...base,
      term: w.word,
      instruction: 'Pick the synonym',
      correctMeaning: answer,
      options: shuffle(options),
      hint: `Meaning: ${w.meaning}`,
      explanation: `Synonyms: ${w.synonyms.join(', ')}`,
    }
  }
  if (kind === 'antonym') {
    const answer = pickOne(w.antonyms)
    const options = [answer, ...distractors(bank, w, (x) => pickOne(x.antonyms), [w.word, ...w.antonyms, answer], 3, [pickOne(w.synonyms)])]
    return {
      ...base,
      term: w.word,
      instruction: 'Pick the antonym',
      correctMeaning: answer,
      options: shuffle(options),
      hint: `Meaning: ${w.meaning}`,
      explanation: `Antonyms: ${w.antonyms.join(', ')}`,
    }
  }
  // fill the blank
  const fill = fillSentence(w) as FillSentence
  const form = (s: string) => (fill.atStart ? capitalise(s.toLowerCase()) : s.toLowerCase())
  const options = [fill.answer, ...distractors(bank, w, (x) => form(x.word), [fill.answer])]
  return {
    ...base,
    term: fill.text,
    termSmall: true,
    noPronounce: true,
    instruction: 'Fill in the blank',
    correctMeaning: fill.answer,
    options: shuffle(options),
    hint: `Meaning of the missing word: ${w.meaning}`,
    explanation: `${w.word} — ${w.meaning}`,
  }
}

/** One question per word (shuffled). Mixed mode picks a random type per word; fill-the-blank only for words that can have one. */
export function buildHinduQuestions(bank: HinduWord[], words: HinduWord[], mode: HinduMode): MCQQuestion[] {
  const kinds: HinduKind[] = ['meaning', 'hindi', 'synonym', 'antonym', 'fill']
  return shuffle(words).map((w) => {
    let kind: HinduKind = mode === 'mixed' ? pickOne(kinds) : mode
    if (kind === 'fill' && !isFillable(w)) kind = mode === 'mixed' ? pickOne(kinds.filter((k) => k !== 'fill')) : 'meaning'
    return build(bank, w, kind)
  })
}
