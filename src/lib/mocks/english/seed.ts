// The curated English bank: human-authored questions built by scripts/build-english-seed.ts into
// seed.generated.json. This module holds the seed in memory, the user's source setting ('curated' | 'ai') and the
// per-browser list of seed questions already used, and shuffles answer positions at draw time where that is safe.

import type { EnglishTopicId, Group, MockDifficulty, QuestionDraft } from '../types'
import seedFile from './seed.generated.json'

export interface SeedEntry {
  /** topic-difficulty-index, stable across builds as long as the content file order does not change */
  id: string
  topic: EnglishTopicId
  difficulty: MockDifficulty
  group: Group
}

export type EnglishSource = 'curated' | 'ai'

export const SOURCE_KEY = 'prepbuddy:mocks:englishSource:v1'
export const SEED_USED_KEY = 'prepbuddy:mocks:englishSeedUsed:v1'
const USED_VERSION = 1
/** Max remembered ids per topic (oldest dropped first). */
export const SEED_USED_CAP = 600

const defaultEntries = ((seedFile as { entries?: SeedEntry[] }).entries ?? []) as SeedEntry[]
let entries: SeedEntry[] = defaultEntries

/** Replaces the in-memory seed (tests); pass null to go back to the bundled seed.generated.json. */
export function setEnglishSeed(next: SeedEntry[] | null) {
  entries = next ?? defaultEntries
}
export const getSeedEntries = (topic?: EnglishTopicId): SeedEntry[] => (topic ? entries.filter((e) => e.topic === topic) : entries)

/** Number of curated QUESTIONS available for a topic and difficulty. */
export function seedPoolSize(topic: EnglishTopicId, difficulty: MockDifficulty): number {
  return entries.filter((e) => e.topic === topic && e.difficulty === difficulty).reduce((n, e) => n + e.group.questions.length, 0)
}

function storage(): Storage | null {
  try {
    return typeof globalThis !== 'undefined' && globalThis.localStorage ? globalThis.localStorage : null
  } catch {
    return null
  }
}

// ---- source setting ('curated' by default: no network at all)
let sourceMirror: EnglishSource = 'curated'
export function getEnglishSource(): EnglishSource {
  try {
    const raw = storage()?.getItem(SOURCE_KEY)
    if (raw) {
      const v = raw.replace(/^"|"$/g, '')
      if (v === 'curated' || v === 'ai') return v
    }
  } catch {
    /* fall back to the mirror */
  }
  return sourceMirror
}
export function setEnglishSource(source: EnglishSource) {
  sourceMirror = source === 'ai' ? 'ai' : 'curated'
  try {
    storage()?.setItem(SOURCE_KEY, sourceMirror)
  } catch {
    /* ignore */
  }
}

// ---- used ids
let usedMirror: Record<string, string[]> = {}
function readUsed(): Record<string, string[]> {
  try {
    const raw = storage()?.getItem(SEED_USED_KEY)
    if (raw) {
      const p = JSON.parse(raw) as { v?: number; used?: Record<string, string[]> } | null
      if (p && p.v === USED_VERSION && p.used && typeof p.used === 'object' && !Array.isArray(p.used)) {
        const out: Record<string, string[]> = {}
        for (const [k, list] of Object.entries(p.used)) if (Array.isArray(list)) out[k] = list.filter((x) => typeof x === 'string')
        return out
      }
    }
  } catch {
    /* corrupt: use the mirror */
  }
  return usedMirror
}
function writeUsed(used: Record<string, string[]>) {
  usedMirror = used
  try {
    storage()?.setItem(SEED_USED_KEY, JSON.stringify({ v: USED_VERSION, used }))
  } catch {
    /* ignore */
  }
}
export const seedUsedIds = (topic: EnglishTopicId): Set<string> => new Set(readUsed()[topic] ?? [])
/** Remembers ids as used. `reset` first forgets the topic's whole list (its pool was exhausted). */
export function saveSeedUsed(topic: EnglishTopicId, ids: string[], reset: boolean) {
  const used = { ...readUsed() }
  const base = reset ? [] : (used[topic] ?? [])
  used[topic] = [...new Set([...base, ...ids])].slice(-SEED_USED_CAP)
  writeUsed(used)
}
export function clearSeedUsed() {
  usedMirror = {}
  try {
    storage()?.removeItem(SEED_USED_KEY)
  } catch {
    /* ignore */
  }
}

// ---- answer-position shuffling at draw time
/** Options that point at each other must keep their order. */
const POSITIONAL_OPTION = /\b(?:above|below|none of (?:these|the)|all of (?:these|the)|both (?:the )?(?:statements|options)|previous option|(?:option|options)\s*[a-e1-5])\b/i

function shuffled<T>(arr: T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
export { shuffled as shuffleArray }

/** Same question with its options in a new order and `answer` remapped, or unchanged where reordering is unsafe
 *  (ED parts and word-swap have fixed option sets; options that refer to each other). The keyed option TEXT is preserved. */
export function shuffleQuestionOptions(topic: EnglishTopicId, q: QuestionDraft): QuestionDraft {
  const o = q.options
  let free: number[] // indexes that may move
  if (topic === 'error-detection') free = o[4] === 'No error' ? [] : [0, 1, 2, 3, 4]
  else if (topic === 'word-swap') free = []
  else if (topic === 'phrase-replacement') free = o[4] === 'No correction required' ? [0, 1, 2, 3] : [0, 1, 2, 3, 4]
  else if (topic === 'rc') free = o.some((x) => POSITIONAL_OPTION.test(x)) ? [] : [0, 1, 2, 3, 4]
  else free = [0, 1, 2, 3, 4]
  if (free.length < 2) return q
  const order = shuffled(free)
  const options = o.slice()
  free.forEach((slot, i) => (options[slot] = o[order[i]]))
  const answer = free.includes(q.answer) ? free[order.indexOf(q.answer)] : q.answer
  return { ...q, options, answer }
}

export function shuffleGroupOptions(topic: EnglishTopicId, g: Group): Group {
  return { stimulus: g.stimulus, questions: g.questions.map((q) => shuffleQuestionOptions(topic, q)) }
}
