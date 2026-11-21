import { CA_CHAPTERS, chapterMeta } from './meta'
import type { CaBankQuestion, CaChapter, CaQuestion } from './types'

/** Favourites (and the quiz history) for this book live under this key, so they sync across devices like the other banks. */
export const CA_BANK_KEY = 'computer-awareness'
export const CA_GAME_ID = 'computer-awareness'

// Each chapter's text and questions are separate files, loaded only when a page needs them.
const chapterFiles = import.meta.glob<CaChapter>('../../data/computerAwareness/chapters/*.json', { import: 'default' })
const questionFiles = import.meta.glob<CaQuestion[]>('../../data/computerAwareness/questions/*.json', { import: 'default' })

const chapterFile = (id: string) => chapterFiles[`../../data/computerAwareness/chapters/${id}.json`]
const questionFile = (id: string) => questionFiles[`../../data/computerAwareness/questions/${id}.json`]

const chapterCache = new Map<string, Promise<CaChapter>>()
const questionCache = new Map<string, Promise<CaBankQuestion[]>>()

/** The book text of one chapter. */
export function loadChapter(id: string): Promise<CaChapter> {
  let p = chapterCache.get(id)
  if (!p) {
    const load = chapterFile(id)
    p = load ? load() : Promise.reject(new Error(`No chapter "${id}"`))
    p.catch(() => chapterCache.delete(id))
    chapterCache.set(id, p)
  }
  return p
}

/** The questions of one chapter, each tagged with its chapter. */
export function loadChapterQuestions(id: string): Promise<CaBankQuestion[]> {
  let p = questionCache.get(id)
  if (!p) {
    const meta = chapterMeta(id)
    const load = questionFile(id)
    p =
      meta && load
        ? load().then((qs) => qs.map((q) => ({ ...q, chapterId: meta.id, chapterTitle: meta.title })))
        : Promise.reject(new Error(`No questions for "${id}"`))
    p.catch(() => questionCache.delete(id))
    questionCache.set(id, p)
  }
  return p
}

/** Every question in the book (chapters whose file is missing are skipped, so a half-written book still works). */
export async function loadAllQuestions(): Promise<CaBankQuestion[]> {
  const lists = await Promise.all(CA_CHAPTERS.map((c) => loadChapterQuestions(c.id).catch(() => [] as CaBankQuestion[])))
  return lists.flat()
}

/** Ids of the chapters that have book text on disk (so the index never links to a chapter that is not there). */
export function availableChapterIds(): Set<string> {
  return new Set(Object.keys(chapterFiles).map((p) => p.slice(p.lastIndexOf('/') + 1, -'.json'.length)))
}

/** Fisher–Yates shuffle into a new array. */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ── reading progress (which chapters the reader has marked as read) ─────────────────────────────────────────────────

const READ_KEY = 'prepbuddy:ca-book:read'

export function getReadChapters(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(READ_KEY) ?? '[]')
    return new Set(Array.isArray(parsed) ? parsed.map(String) : [])
  } catch {
    return new Set()
  }
}

/** Marks a chapter read (or unread) and returns the updated set. */
export function setChapterRead(id: string, read: boolean): Set<string> {
  const next = getReadChapters()
  if (read) next.add(id)
  else next.delete(id)
  try {
    localStorage.setItem(READ_KEY, JSON.stringify([...next]))
  } catch {
    // localStorage unavailable — the mark just won't persist
  }
  return next
}
