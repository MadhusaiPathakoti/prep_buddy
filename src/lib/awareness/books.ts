import { BANKING_CHAPTERS, COMPUTER_CHAPTERS } from './meta'
import type { CaChapterMeta } from './types'

/** A General Awareness book: its chapters plus the names, keys and URLs its pages use. */
export interface BookConfig {
  /** URL segment: /general-awareness/<id>/… */
  id: string
  /** "Computer Awareness" */
  name: string
  icon: string
  /** One-liner for the General Awareness hub card. */
  blurb: string
  /** Tagline in the hub banner. */
  tagline: string
  /** Favourites and quiz history are stored under these (and synced across devices like other banks). */
  bankKey: string
  gameId: string
  chapters: CaChapterMeta[]
  /** Gradient classes for the hub banner and the book cover. */
  heroGradient: string
  coverGradient: string
  /** Emoji on the cover spine. */
  coverIcon: string
}

export const BOOKS: BookConfig[] = [
  {
    id: 'computer',
    name: 'Computer Awareness',
    icon: '💻',
    blurb: 'An illustrated book — hardware to AI — with a mind map at the end of every chapter, a big MCQ question bank, a play-quiz and starred favourites.',
    tagline: 'From the abacus to AI — read it, map it, then quiz yourself until it sticks.',
    bankKey: 'computer-awareness',
    gameId: 'computer-awareness',
    chapters: COMPUTER_CHAPTERS,
    heroGradient: 'from-indigo-500 via-violet-600 to-fuchsia-600',
    coverGradient: 'from-slate-900 via-indigo-900 to-violet-800',
    coverIcon: '💻',
  },
  {
    id: 'banking',
    name: 'Banking Awareness',
    icon: '🏦',
    blurb: 'RBI, banks, monetary policy, schemes and digital banking as an illustrated book with mnemonics, chapter mind maps, a big MCQ bank (with past-year questions), a play-quiz and favourites.',
    tagline: 'RBI to UPI — memory tricks, mind maps and past-year questions for banking exams.',
    bankKey: 'banking-awareness',
    gameId: 'banking-awareness',
    chapters: BANKING_CHAPTERS,
    heroGradient: 'from-emerald-600 via-teal-600 to-sky-700',
    coverGradient: 'from-slate-900 via-emerald-900 to-teal-800',
    coverIcon: '🏦',
  },
]

export function getBook(id: string | undefined): BookConfig | undefined {
  return BOOKS.find((b) => b.id === id)
}

export function basePath(book: BookConfig): string {
  return `/general-awareness/${book.id}`
}

export function chapterOf(book: BookConfig, chapterId: string): CaChapterMeta | undefined {
  return book.chapters.find((c) => c.id === chapterId)
}
