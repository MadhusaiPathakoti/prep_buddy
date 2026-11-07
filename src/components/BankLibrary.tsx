import { useMemo, useState } from 'react'
import DegradedNotice from './DegradedNotice'
import { Link } from 'react-router-dom'
import FavoriteRecencyChips from './FavoriteRecencyChips'
import { Phonetic, SpeakerButton } from './Pronounce'
import { formatFavoritedDate, getFavorites, isFavoritedWithin, toggleFavorite, type FavoriteMap } from '../lib/favorites'
import type { BankEntry, Difficulty } from '../lib/types'

type FilterId = Difficulty | 'all' | 'favorites' | 'yours'

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

const BASE_FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
  { id: 'favorites', label: '★ Favourites' },
]

type SortField = 'alphabetical' | 'added' | 'difficulty' | 'favorited'
type SortDirection = 'asc' | 'desc'

const SORT_FIELDS: { id: SortField; label: string }[] = [
  { id: 'alphabetical', label: 'Alphabetical' },
  { id: 'added', label: 'Added date' },
  { id: 'difficulty', label: 'Difficulty' },
]
/** Only offered while viewing favourites, since other entries have no favourited date. */
const FAVORITED_SORT_FIELD: { id: SortField; label: string } = { id: 'favorited', label: 'Favourited date' }

const DIFFICULTY_RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 }

function timeOf(iso: string | null | undefined): number {
  return iso ? new Date(iso).getTime() : 0
}

/** Entries without `createdAt` (or an unknown favourited date) sort as the oldest, in either direction. */
function compareEntries(a: BankEntry, b: BankEntry, field: SortField, favorites: FavoriteMap): number {
  if (field === 'alphabetical') return a.term.localeCompare(b.term)
  if (field === 'difficulty') return DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty]
  if (field === 'favorited') return timeOf(favorites.get(a.id)) - timeOf(favorites.get(b.id))
  return timeOf(a.createdAt) - timeOf(b.createdAt)
}

function difficultyBadge(d: Difficulty) {
  if (d === 'easy') return 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
  if (d === 'medium') return 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300'
  return 'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300'
}

interface BankLibraryProps {
  bank: BankEntry[]
  bankKey: string
  backTo: string
  backLabel: string
  title: string
  nounPlural: string
  addAction?: { to: string; label: string }
  onDelete?: (entry: BankEntry) => void
  /** When provided, each card's difficulty badge becomes a picker that calls this to save the new level. */
  onChangeDifficulty?: (entry: BankEntry, difficulty: Difficulty) => Promise<void>
  /** Label for the `meaning` field when an entry also has its own `definition` (e.g. "Opposite", "Synonym"). */
  answerLabel?: string
  /**
   * Adds a speaker button and IPA phonetics to each card. 'term' pronounces the entry's `term`
   * (vocabulary); 'meaning' pronounces its `meaning`, for banks where that holds the single
   * word (one word substitution). Leave unset for phrase banks (idioms, phrasal verbs).
   */
  pronounce?: 'term' | 'meaning'
}

export default function BankLibrary({ bank, bankKey, backTo, backLabel, title, nounPlural, addAction, onDelete, onChangeDifficulty, answerLabel, pronounce }: BankLibraryProps) {
  const [filter, setFilter] = useState<FilterId>('all')
  const [query, setQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('alphabetical')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<FavoriteMap>(() => getFavorites(bankKey))
  const [favoriteRecency, setFavoriteRecency] = useState<number | null>(null)
  const [savingDifficultyId, setSavingDifficultyId] = useState<string | null>(null)
  const [difficultyError, setDifficultyError] = useState('')
  // captured once when the library opens: set when only the built-in entries could be loaded
  const [degraded] = useState(() => !!(bank as { degraded?: boolean }).degraded)

  function handleToggleFavorite(id: string) {
    setFavorites((prev) => toggleFavorite(bankKey, id, prev))
  }

  async function handleChangeDifficulty(entry: BankEntry, difficulty: Difficulty) {
    if (!onChangeDifficulty || difficulty === entry.difficulty) return
    setSavingDifficultyId(entry.id)
    setDifficultyError('')
    try {
      await onChangeDifficulty(entry, difficulty)
    } catch {
      setDifficultyError(`Could not change the difficulty of "${entry.term}". Check your connection and try again.`)
    } finally {
      setSavingDifficultyId(null)
    }
  }

  /** Favourites open newest-first (that's what you'd revise); leaving them drops the favourites-only sort. */
  function selectFilter(next: FilterId) {
    setFilter(next)
    if (next === 'favorites') {
      setSortField('favorited')
      setSortDirection('desc')
    } else if (sortField === 'favorited') {
      setSortField('alphabetical')
      setSortDirection('asc')
    }
  }

  const sortFields = filter === 'favorites' ? [...SORT_FIELDS, FAVORITED_SORT_FIELD] : SORT_FIELDS
  const filters = addAction ? [...BASE_FILTERS, { id: 'yours' as const, label: 'Yours' }] : BASE_FILTERS

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase()
    return bank
      .filter((w) => {
        if (filter === 'all') return true
        if (filter === 'favorites') return isFavoritedWithin(favorites, w.id, favoriteRecency)
        if (filter === 'yours') return w.id.startsWith('custom-')
        return w.difficulty === filter
      })
      .filter((w) => q === '' || w.term.toLowerCase().includes(q) || w.meaning.toLowerCase().includes(q))
      .sort((a, b) => {
        const cmp = compareEntries(a, b, sortField, favorites)
        return sortDirection === 'asc' ? cmp : -cmp
      })
  }, [bank, filter, query, favorites, favoriteRecency, sortField, sortDirection])

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <Link to={backTo} className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
          ← {backLabel}
        </Link>
        {addAction && (
          <Link
            to={addAction.to}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            {addAction.label}
          </Link>
        )}
      </div>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">{title}</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">
        Browse and learn before you play. {bank.length} {nounPlural} across three difficulty levels. Star any {nounPlural.replace(/s$/, '')} to
        save it for daily revision.
      </p>
      {degraded && <DegradedNotice />}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => selectFilter(f.id)}
              className={[
                'rounded-lg px-3 py-1.5 text-sm font-semibold transition',
                filter === f.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
              ].join(' ')}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${nounPlural} or meanings…`}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 outline-none focus:border-indigo-400"
        />
      </div>

      {filter === 'favorites' && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Favourited</span>
          <FavoriteRecencyChips value={favoriteRecency} onChange={setFavoriteRecency} compact />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Sort by</span>
        {sortFields.map((s) => (
          <button
            key={s.id}
            onClick={() => setSortField(s.id)}
            className={[
              'rounded-lg px-3 py-1.5 text-sm font-semibold transition',
              sortField === s.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
            ].join(' ')}
          >
            {s.label}
          </button>
        ))}
        <button
          onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
          aria-label={sortDirection === 'asc' ? 'Switch to descending order' : 'Switch to ascending order'}
          className="rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-200"
        >
          {sortDirection === 'asc' ? '↑ Ascending' : '↓ Descending'}
        </button>
      </div>

      {difficultyError && (
        <p className="mt-4 rounded-lg bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{difficultyError}</p>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {entries.map((w) => {
          const isFavorite = favorites.has(w.id)
          const favoritedAt = favorites.get(w.id)
          return (
            <div key={w.id} className="rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {w.term}
                    {w.partOfSpeech && <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">({w.partOfSpeech})</span>}
                  </h3>
                  {pronounce === 'term' && <SpeakerButton word={w.term} />}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => handleToggleFavorite(w.id)}
                    aria-label={isFavorite ? 'Remove from favourites' : 'Add to favourites'}
                    className={[
                      'text-lg leading-none transition',
                      isFavorite ? 'text-amber-400 hover:text-amber-500' : 'text-slate-200 dark:text-slate-700 hover:text-amber-300',
                    ].join(' ')}
                  >
                    {isFavorite ? '★' : '☆'}
                  </button>
                  {w.id.startsWith('custom-') && (
                    <span className="rounded-full bg-indigo-100 dark:bg-indigo-500/15 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">Yours</span>
                  )}
                  {onChangeDifficulty ? (
                    <select
                      value={w.difficulty}
                      disabled={savingDifficultyId === w.id}
                      onChange={(e) => handleChangeDifficulty(w, e.target.value as Difficulty)}
                      aria-label={`Change difficulty of ${w.term}`}
                      className={`cursor-pointer rounded-full px-2 py-0.5 text-xs font-semibold capitalize outline-none disabled:cursor-wait disabled:opacity-60 ${difficultyBadge(w.difficulty)}`}
                    >
                      {DIFFICULTIES.map((d) => (
                        <option key={d} value={d} className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                          {d.charAt(0).toUpperCase() + d.slice(1)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${difficultyBadge(w.difficulty)}`}>
                      {w.difficulty}
                    </span>
                  )}
                </div>
              </div>
              {isFavorite && (
                <p className="mt-1 text-xs text-amber-500 dark:text-amber-400">
                  {favoritedAt ? `★ Favourited ${formatFavoritedDate(favoritedAt)}` : '★ Favourited earlier'}
                </p>
              )}
              {pronounce === 'term' && <Phonetic word={w.term} className="mt-0.5" />}
              {w.definition ? (
                <>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{w.definition}</p>
                  <p className="mt-1 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                    {answerLabel ?? 'Answer'}: {w.meaning}
                  </p>
                </>
              ) : pronounce === 'meaning' ? (
                <div className="mt-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{w.meaning}</p>
                    <SpeakerButton word={w.meaning} />
                  </div>
                  <Phonetic word={w.meaning} className="mt-0.5" />
                </div>
              ) : (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{w.meaning}</p>
              )}
              {w.example ? (
                <p className="mt-2 text-xs italic text-slate-400 dark:text-slate-500">"{w.example}"</p>
              ) : (
                <p className="mt-2 text-xs text-slate-300 dark:text-slate-600">No example sentence yet — try writing your own.</p>
              )}
              {onDelete && (
                <div className="mt-3 flex items-center justify-end gap-3">
                  {confirmingId === w.id ? (
                    <>
                      <span className="text-xs text-slate-400 dark:text-slate-500">Delete permanently?</span>
                      <button
                        onClick={() => setConfirmingId(null)}
                        className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 hover:underline"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          onDelete(w)
                          setConfirmingId(null)
                        }}
                        className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 hover:underline"
                      >
                        Yes, delete
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmingId(w.id)}
                      className="text-xs font-semibold text-rose-500 dark:text-rose-400 hover:text-rose-700 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {entries.length === 0 && filter === 'favorites' && (
          <p className="text-slate-400 dark:text-slate-500">
            {favoriteRecency !== null && favorites.size > 0
              ? `Nothing favourited in the last ${favoriteRecency} ${favoriteRecency === 1 ? 'day' : 'days'} — try a longer window.`
              : 'No favourites yet — tap the ☆ on any card to save it here for daily revision.'}
          </p>
        )}
        {entries.length === 0 && filter === 'yours' && (
          <p className="text-slate-400 dark:text-slate-500">You haven't added any {nounPlural} yet — use "+ Add" above to add one.</p>
        )}
        {entries.length === 0 && filter !== 'favorites' && filter !== 'yours' && (
          <p className="text-slate-400 dark:text-slate-500">No {nounPlural} match your search.</p>
        )}
      </div>
    </div>
  )
}
