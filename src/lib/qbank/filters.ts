import { DIFFICULTIES, EXAM_TYPES, isBankTopic } from './types'
import type { BankTopicId, ExamType, QuestionIndexEntry, QuestionSource } from './types'
import type { ProgressMap } from './userData'
import type { Difficulty } from '../types'

/** The tag filters of the question table. They live in the page address, so a filtered list can be shared and "Next" keeps following it. */
export type ShowMode = 'all' | 'favourites' | 'recent' | 'unplayed'

export interface BankFilters {
  topic: BankTopicId | ''
  difficulty: Difficulty | ''
  examType: ExamType | ''
  /** An exam name from the bank, or '' for any. */
  examName: string
  /** '' for any, 'unknown' for questions with no year, or a four-digit year. */
  year: string
  source: QuestionSource | ''
  show: ShowMode
  /** Matches the question line shown in the table. */
  q: string
}

export const NO_FILTERS: BankFilters = { topic: '', difficulty: '', examType: '', examName: '', year: '', source: '', show: 'all', q: '' }

export const SHOW_MODES: { id: ShowMode; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'favourites', label: '★ Favourites' },
  { id: 'recent', label: 'Recently played' },
  { id: 'unplayed', label: 'Not played yet' },
]

/** How many recently played questions the "Recently played" view shows. */
export const RECENT_LIMIT = 100

export function parseFilters(params: URLSearchParams): BankFilters {
  const topic = params.get('topic') ?? ''
  const difficulty = params.get('difficulty') ?? ''
  const examType = params.get('type') ?? ''
  const source = params.get('source') ?? ''
  const show = params.get('show') ?? ''
  const year = params.get('year') ?? ''
  return {
    topic: isBankTopic(topic) ? topic : '',
    difficulty: (DIFFICULTIES as string[]).includes(difficulty) ? (difficulty as Difficulty) : '',
    examType: (EXAM_TYPES as readonly string[]).includes(examType) ? (examType as ExamType) : '',
    examName: params.get('exam') ?? '',
    year: year === 'unknown' || /^\d{4}$/.test(year) ? year : '',
    source: source === 'generated' || source === 'user' ? source : '',
    show: SHOW_MODES.some((m) => m.id === show) ? (show as ShowMode) : 'all',
    q: (params.get('q') ?? '').slice(0, 80),
  }
}

/** The filters as address parameters; anything left at its default is left out. */
export function filtersToParams(filters: BankFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.topic) params.set('topic', filters.topic)
  if (filters.difficulty) params.set('difficulty', filters.difficulty)
  if (filters.examType) params.set('type', filters.examType)
  if (filters.examName) params.set('exam', filters.examName)
  if (filters.year) params.set('year', filters.year)
  if (filters.source) params.set('source', filters.source)
  if (filters.show !== 'all') params.set('show', filters.show)
  if (filters.q.trim()) params.set('q', filters.q.trim())
  return params
}

/** How many filters are switched on (the "Show" views count as one). */
export function activeFilterCount(filters: BankFilters): number {
  return [filters.topic, filters.difficulty, filters.examType, filters.examName, filters.year, filters.source, filters.q.trim(), filters.show !== 'all' ? 'x' : ''].filter(Boolean).length
}

export interface UserView {
  favourites: ReadonlySet<string>
  progress: ProgressMap
}

/** The questions that match every filter, in bank order (most recent first for "Recently played"). */
export function applyFilters(index: QuestionIndexEntry[], filters: BankFilters, user: UserView): QuestionIndexEntry[] {
  const needle = filters.q.trim().toLowerCase()
  let list = index.filter((e) => {
    if (filters.topic && e.topic !== filters.topic) return false
    if (filters.difficulty && e.difficulty !== filters.difficulty) return false
    if (filters.examType && e.examType !== filters.examType) return false
    if (filters.examName && e.examName !== filters.examName) return false
    if (filters.year === 'unknown' ? e.year !== null : filters.year ? String(e.year) !== filters.year : false) return false
    if (filters.source && e.source !== filters.source) return false
    if (needle && !e.preview.toLowerCase().includes(needle)) return false
    if (filters.show === 'favourites') return user.favourites.has(e.id)
    if (filters.show === 'recent') return user.progress.has(e.id)
    if (filters.show === 'unplayed') return !user.progress.has(e.id)
    return true
  })
  if (filters.show === 'recent') {
    list = list.sort((a, b) => (user.progress.get(b.id)?.at ?? '').localeCompare(user.progress.get(a.id)?.at ?? '')).slice(0, RECENT_LIMIT)
  }
  return list
}

export interface Facets {
  examNames: string[]
  years: number[]
  hasUnknownYear: boolean
}

/** The exam names and years that actually occur in the bank, for the filter boxes. */
export function facetsOf(index: QuestionIndexEntry[]): Facets {
  const names = new Set<string>()
  const years = new Set<number>()
  let hasUnknownYear = false
  for (const e of index) {
    names.add(e.examName)
    if (e.year === null) hasUnknownYear = true
    else years.add(e.year)
  }
  return { examNames: [...names].sort(), years: [...years].sort((a, b) => b - a), hasUnknownYear }
}
