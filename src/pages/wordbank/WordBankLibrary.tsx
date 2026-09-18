import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteWordEntry, getFullWordBank } from '../../lib/wordBankStore'
import { getFavoriteIds, toggleFavorite } from '../../lib/favorites'
import type { Difficulty, WordEntry } from '../../lib/types'

const BANK_KEY = 'word-bank'

type FilterId = Difficulty | 'all' | 'favorites' | 'yours'

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
  { id: 'favorites', label: '★ Favourites' },
  { id: 'yours', label: 'Yours' },
]

function difficultyBadge(d: Difficulty) {
  if (d === 'easy') return 'bg-emerald-100 text-emerald-700'
  if (d === 'medium') return 'bg-amber-100 text-amber-700'
  return 'bg-rose-100 text-rose-700'
}

type SortField = 'alphabetical' | 'added' | 'difficulty'
type SortDirection = 'asc' | 'desc'

const SORT_FIELDS: { id: SortField; label: string }[] = [
  { id: 'alphabetical', label: 'Alphabetical' },
  { id: 'added', label: 'Added date' },
  { id: 'difficulty', label: 'Difficulty' },
]

const DIFFICULTY_RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 }

function compareEntries(a: WordEntry, b: WordEntry, field: SortField): number {
  if (field === 'alphabetical') return a.word.localeCompare(b.word)
  if (field === 'difficulty') return DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty]
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export default function WordBankLibrary() {
  const [bank, setBank] = useState<WordEntry[] | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<FilterId>('all')
  const [query, setQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('alphabetical')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<Set<string>>(() => getFavoriteIds(BANK_KEY))

  useEffect(() => {
    let cancelled = false
    getFullWordBank()
      .then((full) => {
        if (!cancelled) setBank(full)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the shared word bank. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  function handleToggleFavorite(id: string) {
    setFavorites((prev) => toggleFavorite(BANK_KEY, id, prev))
  }

  async function handleDelete(entry: WordEntry) {
    await deleteWordEntry(entry.id)
    setBank((prev) => (prev ? prev.filter((w) => w.id !== entry.id) : prev))
  }

  const entries = useMemo(() => {
    if (!bank) return []
    const q = query.trim().toLowerCase()
    return bank
      .filter((w) => {
        if (filter === 'all') return true
        if (filter === 'favorites') return favorites.has(w.id)
        if (filter === 'yours') return w.id.startsWith('custom-')
        return w.difficulty === filter
      })
      .filter(
        (w) =>
          q === '' ||
          w.word.toLowerCase().includes(q) ||
          w.synonyms.some((s) => s.toLowerCase().includes(q)) ||
          w.antonyms.some((a) => a.toLowerCase().includes(q)),
      )
      .sort((a, b) => {
        const cmp = compareEntries(a, b, sortField)
        return sortDirection === 'asc' ? cmp : -cmp
      })
  }, [bank, filter, query, favorites, sortField, sortDirection])

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link to="/english" className="text-sm text-slate-400 hover:text-slate-600">
          ← English
        </Link>
        <p className="mt-6 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      </div>
    )
  }

  if (!bank) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link to="/english" className="text-sm text-slate-400 hover:text-slate-600">
          ← English
        </Link>
        <p className="mt-6 text-slate-400">Loading the shared word bank…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <Link to="/english" className="text-sm text-slate-400 hover:text-slate-600">
          ← English
        </Link>
        <Link
          to="/english/word-bank/add"
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          + Add a word
        </Link>
      </div>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900">Word Bank</h1>
      <p className="mt-2 text-slate-500">
        Shared by both the Synonyms and Antonyms games. {bank.length} words across three difficulty levels. Star any
        word to save it for daily revision.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={[
                'rounded-lg px-3 py-1.5 text-sm font-semibold transition',
                filter === f.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search words, synonyms, or antonyms…"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-400"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-800">Sort by</span>
        {SORT_FIELDS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSortField(s.id)}
            className={[
              'rounded-lg px-3 py-1.5 text-sm font-semibold transition',
              sortField === s.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            ].join(' ')}
          >
            {s.label}
          </button>
        ))}
        <button
          onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
          aria-label={sortDirection === 'asc' ? 'Switch to descending order' : 'Switch to ascending order'}
          className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
        >
          {sortDirection === 'asc' ? '↑ Ascending' : '↓ Descending'}
        </button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {entries.map((w) => {
          const isFavorite = favorites.has(w.id)
          return (
            <div key={w.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-bold text-slate-900">
                  {w.word}
                  {w.partOfSpeech && <span className="ml-1 font-normal text-slate-400">({w.partOfSpeech})</span>}
                </h3>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => handleToggleFavorite(w.id)}
                    aria-label={isFavorite ? 'Remove from favourites' : 'Add to favourites'}
                    className={[
                      'text-lg leading-none transition',
                      isFavorite ? 'text-amber-400 hover:text-amber-500' : 'text-slate-200 hover:text-amber-300',
                    ].join(' ')}
                  >
                    {isFavorite ? '★' : '☆'}
                  </button>
                  {w.id.startsWith('custom-') && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">Yours</span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${difficultyBadge(w.difficulty)}`}>
                    {w.difficulty}
                  </span>
                </div>
              </div>
              <p className="mt-1 text-sm text-slate-600">{w.meaning}</p>
              {w.example && <p className="mt-2 text-xs italic text-slate-400">"{w.example}"</p>}

              <div className="mt-3 flex flex-col gap-1.5 text-sm">
                <p>
                  <span className="font-semibold text-indigo-600">Synonyms: </span>
                  <span className="text-slate-600">{w.synonyms.length ? w.synonyms.join(', ') : '—'}</span>
                </p>
                <p>
                  <span className="font-semibold text-rose-600">Antonyms: </span>
                  <span className="text-slate-600">{w.antonyms.length ? w.antonyms.join(', ') : '—'}</span>
                </p>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-slate-300">Added {formatDate(w.createdAt)}</span>
                <div className="flex items-center gap-3">
                  {confirmingId === w.id ? (
                    <>
                      <span className="text-xs text-slate-400">Delete permanently?</span>
                      <button
                        onClick={() => setConfirmingId(null)}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-700 hover:underline"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          handleDelete(w)
                          setConfirmingId(null)
                        }}
                        className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline"
                      >
                        Yes, delete
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmingId(w.id)}
                      className="text-xs font-semibold text-rose-500 hover:text-rose-700 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {entries.length === 0 && filter === 'favorites' && (
          <p className="text-slate-400">No favourites yet — tap the ☆ on any card to save it here for daily revision.</p>
        )}
        {entries.length === 0 && filter === 'yours' && (
          <p className="text-slate-400">You haven't added any words yet — use "+ Add a word" above to add one.</p>
        )}
        {entries.length === 0 && filter !== 'favorites' && filter !== 'yours' && (
          <p className="text-slate-400">No words match your search.</p>
        )}
      </div>
    </div>
  )
}
