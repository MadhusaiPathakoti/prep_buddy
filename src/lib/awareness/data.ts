import type { BookConfig } from './books'
import type { CaBankQuestion, CaChapter, CaQuestion } from './types'

// Each chapter's text and questions are separate files, loaded only when a page needs them.
const chapterFiles = import.meta.glob<CaChapter>('../../data/awareness/*/chapters/*.json', { import: 'default' })
const questionFiles = import.meta.glob<CaQuestion[]>('../../data/awareness/*/questions/*.json', { import: 'default' })

const chapterFile = (book: BookConfig, id: string) => chapterFiles[`../../data/awareness/${book.id}/chapters/${id}.json`]
const questionFile = (book: BookConfig, id: string) => questionFiles[`../../data/awareness/${book.id}/questions/${id}.json`]

const chapterCache = new Map<string, Promise<CaChapter>>()
const questionCache = new Map<string, Promise<CaBankQuestion[]>>()

/** The book text of one chapter. */
export function loadChapter(book: BookConfig, id: string): Promise<CaChapter> {
  const key = `${book.id}/${id}`
  let p = chapterCache.get(key)
  if (!p) {
    const load = chapterFile(book, id)
    p = load ? load() : Promise.reject(new Error(`No chapter "${id}"`))
    p.catch(() => chapterCache.delete(key))
    chapterCache.set(key, p)
  }
  return p
}

/** The questions of one chapter, each tagged with its chapter. */
export function loadChapterQuestions(book: BookConfig, id: string): Promise<CaBankQuestion[]> {
  const key = `${book.id}/${id}`
  let p = questionCache.get(key)
  if (!p) {
    const meta = book.chapters.find((c) => c.id === id)
    const load = questionFile(book, id)
    p =
      meta && load
        ? load().then((qs) => qs.map((q) => ({ ...q, chapterId: meta.id, chapterTitle: meta.title })))
        : Promise.reject(new Error(`No questions for "${id}"`))
    p.catch(() => questionCache.delete(key))
    questionCache.set(key, p)
  }
  return p
}

/** Every question in a book (chapters whose file is missing are skipped, so a half-written book still works). */
export async function loadAllQuestions(book: BookConfig): Promise<CaBankQuestion[]> {
  const lists = await Promise.all(book.chapters.map((c) => loadChapterQuestions(book, c.id).catch(() => [] as CaBankQuestion[])))
  return lists.flat()
}

/** Ids of the chapters that have book text on disk (so the index never links to a chapter that is not there). */
export function availableChapterIds(book: BookConfig): Set<string> {
  const marker = `/data/awareness/${book.id}/chapters/`
  return new Set(
    Object.keys(chapterFiles)
      .filter((p) => p.includes(marker))
      .map((p) => p.slice(p.lastIndexOf('/') + 1, -'.json'.length)),
  )
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

// Computer Awareness predates the other books and keeps its original key.
const readKey = (book: BookConfig) => (book.id === 'computer' ? 'prepbuddy:ca-book:read' : `prepbuddy:${book.id}-book:read`)

export function getReadChapters(book: BookConfig): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(readKey(book)) ?? '[]')
    return new Set(Array.isArray(parsed) ? parsed.map(String) : [])
  } catch {
    return new Set()
  }
}

/** Marks a chapter read (or unread) and returns the updated set. */
export function setChapterRead(book: BookConfig, id: string, read: boolean): Set<string> {
  const next = getReadChapters(book)
  if (read) next.add(id)
  else next.delete(id)
  try {
    localStorage.setItem(readKey(book), JSON.stringify([...next]))
  } catch {
    // localStorage unavailable — the mark just won't persist
  }
  return next
}
