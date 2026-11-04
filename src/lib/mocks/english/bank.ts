// Persistent bank of VERIFIED English groups (localStorage), per topic + difficulty. Verified-but-unused questions
// (over-requested leftovers, or everything verified before a failed attempt) live here so "Try again" resumes
// and the next mock is faster. Every access is wrapped: a missing, full, blocked or corrupt store just means an
// empty bank.

import type { EnglishTopicId, Group, MockDifficulty } from '../types'
import { checkEnglishGroup, groupKey } from './checks'

export const BANK_KEY = 'prepbuddy:mocks:englishBank:v1'
const BANK_VERSION = 1
/** Max groups kept per topic + difficulty (oldest dropped first). */
export const BANK_CAP = 150

export interface BankEntry {
  k: string
  g: Group
}
interface Stored extends BankEntry {
  t: number
}
interface Store {
  v: number
  banks: Record<string, Stored[]>
}

const slot = (topic: EnglishTopicId, difficulty: MockDifficulty) => `${topic}|${difficulty}`

function storage(): Storage | null {
  try {
    return typeof globalThis !== 'undefined' && globalThis.localStorage ? globalThis.localStorage : null
  } catch {
    return null
  }
}

function readStore(): Store {
  const empty: Store = { v: BANK_VERSION, banks: {} }
  try {
    const raw = storage()?.getItem(BANK_KEY)
    if (!raw) return empty
    const parsed = JSON.parse(raw) as Partial<Store> | null
    if (!parsed || parsed.v !== BANK_VERSION || !parsed.banks || typeof parsed.banks !== 'object' || Array.isArray(parsed.banks)) return empty
    const banks: Record<string, Stored[]> = {}
    for (const [k, list] of Object.entries(parsed.banks)) {
      if (Array.isArray(list)) banks[k] = list.filter((e) => e && typeof e.k === 'string' && e.g && Array.isArray(e.g.questions))
    }
    return { v: BANK_VERSION, banks }
  } catch {
    return empty
  }
}

function writeStore(store: Store): void {
  const s = storage()
  if (!s) return
  try {
    s.setItem(BANK_KEY, JSON.stringify(store))
  } catch {
    // Quota exceeded or storage blocked: shed the older half of every bank and try once more.
    try {
      for (const k of Object.keys(store.banks)) store.banks[k] = store.banks[k].slice(Math.ceil(store.banks[k].length / 2))
      s.setItem(BANK_KEY, JSON.stringify(store))
    } catch {
      /* give up silently: the bank is an optimisation */
    }
  }
}

/** The validated groups banked for a topic + difficulty (entries that no longer pass the checks are ignored). */
export function bankRead(topic: EnglishTopicId, difficulty: MockDifficulty): BankEntry[] {
  try {
    const list = readStore().banks[slot(topic, difficulty)] ?? []
    const out: BankEntry[] = []
    const seen = new Set<string>()
    for (const e of list) {
      if (seen.has(e.k)) continue
      const checked = checkEnglishGroup(topic, difficulty, e.g)
      if (!checked.group || checked.group.questions.length !== e.g.questions.length) continue
      seen.add(e.k)
      out.push({ k: e.k, g: e.g })
    }
    return out
  } catch {
    return []
  }
}

/** Adds groups (deduplicated by content key) and enforces the cap. */
export function bankAdd(topic: EnglishTopicId, difficulty: MockDifficulty, groups: Group[]): void {
  try {
    if (!storage() || groups.length === 0) return
    const store = readStore()
    const key = slot(topic, difficulty)
    const list = store.banks[key] ?? []
    const have = new Set(list.map((e) => e.k))
    const now = Date.now()
    for (const g of groups) {
      const k = groupKey(g)
      if (have.has(k)) continue
      have.add(k)
      list.push({ k, g, t: now })
    }
    store.banks[key] = list.slice(-BANK_CAP)
    writeStore(store)
  } catch {
    /* ignore */
  }
}

/** Removes consumed groups by content key. */
export function bankRemove(topic: EnglishTopicId, difficulty: MockDifficulty, keys: string[]): void {
  try {
    if (!storage() || keys.length === 0) return
    const store = readStore()
    const key = slot(topic, difficulty)
    const drop = new Set(keys)
    store.banks[key] = (store.banks[key] ?? []).filter((e) => !drop.has(e.k))
    writeStore(store)
  } catch {
    /* ignore */
  }
}

/** Number of verified QUESTIONS currently banked for a difficulty (all topics). */
export function englishBankSize(difficulty: MockDifficulty): number {
  try {
    let n = 0
    for (const [k, list] of Object.entries(readStore().banks)) {
      if (!k.endsWith(`|${difficulty}`)) continue
      for (const e of list) n += e.g.questions.length
    }
    return n
  } catch {
    return 0
  }
}

export function clearEnglishBank(): void {
  try {
    storage()?.removeItem(BANK_KEY)
  } catch {
    /* ignore */
  }
}
