// Mnemonic Vocabulary: data loading, the "learn a few words a day" progress, per-word revision stats, and the pure
// logic behind the revision game (which favourites to ask, and how to build the questions).
import { createLearnStore } from './dailyLearn'
import { isFavoritedWithin, type FavoriteMap } from './favorites'

/** Favourites for this bank live under this key (see lib/favorites.ts); entry ids are `mn-<number>`. */
export const MNEMONIC_BANK_KEY = 'mnemonic-vocab'
/** Game id used for the English hub's "Best %" and the session history. */
export const MNEMONIC_GAME_ID = 'mnemonic-vocab'

/** "Learn today" progress for this bank: random unlearned words each day, marked learned by the player. */
export const mnemonicLearn = createLearnStore('mnemonic')

export interface MnemonicWord {
  /** `mn-<n>` — the key used for favourites. */
  id: string
  /** The word's number in the source book (1–1018); words are in alphabetical order. */
  n: number
  word: string
  /** Respelling such as "uh-BASH" (capitals mark the stressed syllable). */
  pronunciation: string
  /** As written in the book, e.g. "Verb" or "Noun/Adjective". */
  pos: string
  hindi: string
  meaning: string
  /** The memory trick (Hindi/English wordplay) that makes the word stick. */
  trick: string
  synonyms: string[]
  antonyms: string[]
  /** Two example sentences. */
  examples: string[]
}

let bankPromise: Promise<MnemonicWord[]> | null = null

/** Loads the whole bank on first use (a separate chunk, so the rest of the app never pays for it). */
export function loadMnemonicBank(): Promise<MnemonicWord[]> {
  bankPromise ??= import('../data/mnemonicVocab.json').then((m) => m.default as MnemonicWord[]).catch((err) => {
    bankPromise = null // let the next visit retry
    throw err
  })
  return bankPromise
}

/** URL of the cartoon for a word. */
export function mnemonicImageUrl(n: number): string {
  return `${import.meta.env?.BASE_URL ?? '/'}mnemonic/img/${n}.webp`
}

/** First segment of the part of speech ("Noun/Adjective" -> "noun"), used to pick look-alike distractors. */
function primaryPos(w: MnemonicWord): string {
  return w.pos.split('/')[0].trim().toLowerCase()
}

/* ------------------------------------------------------------------ */
/* Local storage                                                       */
/* ------------------------------------------------------------------ */

const STATS_KEY = 'prepbuddy:mnemonic:stats'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — silently skip persistence
  }
}

export interface WordStat {
  right: number
  wrong: number
  last: 'right' | 'wrong'
  /** ISO time of the most recent answer. */
  at: string
}

export function getStats(): Record<string, WordStat> {
  return readJson<Record<string, WordStat>>(STATS_KEY, {})
}

/** Logs one revision answer for a word (`right` = correct on the first try). */
export function recordAnswer(n: number, right: boolean) {
  const stats = getStats()
  const prev = stats[n]
  stats[n] = {
    right: (prev?.right ?? 0) + (right ? 1 : 0),
    wrong: (prev?.wrong ?? 0) + (right ? 0 : 1),
    last: right ? 'right' : 'wrong',
    at: new Date().toISOString(),
  }
  writeJson(STATS_KEY, stats)
}

/* ------------------------------------------------------------------ */
/* Revision game                                                       */
/* ------------------------------------------------------------------ */

export type ReviseMode = 'picture' | 'meaning' | 'mixed'
/** Which favourites to ask first when there are more than fit in the session. */
export type ReviseOrder = 'fresh' | 'weak' | 'random'
export type QuestionKind = 'picture' | 'meaning'

export interface ReviseQuestion {
  word: MnemonicWord
  kind: QuestionKind
  /** Words for a picture question, meanings for a meaning question. */
  options: string[]
  answer: string
}

function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const norm = (s: string) => s.trim().toLowerCase()

/** True when two words share a word or a synonym, i.e. one could be a defensible answer for the other's question. */
export function areRelated(a: MnemonicWord, b: MnemonicWord): boolean {
  const ka = new Set([a.word, ...a.synonyms].map(norm))
  return [b.word, ...b.synonyms].some((x) => ka.has(norm(x)))
}

function timeOf(iso: string | null | undefined): number {
  return iso ? new Date(iso).getTime() : 0
}

/** Favourites inside the freshness window, ordered by what the player asked to see first, then cut to `count`. */
export function pickRevisionWords(
  bank: MnemonicWord[],
  favorites: FavoriteMap,
  windowDays: number | null,
  order: ReviseOrder,
  count: number,
  stats: Record<string, WordStat> = getStats(),
): MnemonicWord[] {
  const pool = bank.filter((w) => isFavoritedWithin(favorites, w.id, windowDays))
  const favouritedAt = (w: MnemonicWord) => timeOf(favorites.get(w.id))
  let ordered: MnemonicWord[]
  if (order === 'fresh') {
    ordered = [...pool].sort((a, b) => favouritedAt(b) - favouritedAt(a))
  } else if (order === 'weak') {
    // missed last time -> never asked -> asked longest ago; ties go to the freshest favourite
    const tier = (w: MnemonicWord) => {
      const s = stats[w.n]
      return !s ? 1 : s.last === 'wrong' ? 0 : 2
    }
    ordered = [...pool].sort((a, b) => {
      const t = tier(a) - tier(b)
      if (t !== 0) return t
      if (tier(a) === 2) {
        const age = timeOf(stats[a.n]?.at) - timeOf(stats[b.n]?.at)
        if (age !== 0) return age
      }
      return favouritedAt(b) - favouritedAt(a)
    })
  } else {
    ordered = shuffle(pool)
  }
  return ordered.slice(0, Math.max(0, count))
}

/** Three wrong options for `w`: other words of the same part of speech first, never one that could also be right. */
function distractorsFor(bank: MnemonicWord[], w: MnemonicWord, kind: QuestionKind): string[] {
  const optionOf = (x: MnemonicWord) => (kind === 'picture' ? x.word : x.meaning)
  const correct = norm(optionOf(w))
  const candidates = bank.filter((x) => x.n !== w.n && !areRelated(w, x) && norm(optionOf(x)) !== correct)
  const pos = primaryPos(w)
  const ranked = [...shuffle(candidates.filter((x) => primaryPos(x) === pos)), ...shuffle(candidates.filter((x) => primaryPos(x) !== pos))]
  const out: string[] = []
  const seen = new Set([correct])
  for (const x of ranked) {
    const o = optionOf(x)
    if (seen.has(norm(o))) continue
    seen.add(norm(o))
    out.push(o)
    if (out.length === 3) break
  }
  return out
}

/** One question per word (shuffled). Mixed mode flips a coin per word between the picture and the meaning question. */
export function buildQuestions(bank: MnemonicWord[], words: MnemonicWord[], mode: ReviseMode): ReviseQuestion[] {
  return shuffle(words).map((word) => {
    const kind: QuestionKind = mode === 'mixed' ? (Math.random() < 0.5 ? 'picture' : 'meaning') : mode
    const answer = kind === 'picture' ? word.word : word.meaning
    return { word, kind, answer, options: shuffle([answer, ...distractorsFor(bank, word, kind)]) }
  })
}
