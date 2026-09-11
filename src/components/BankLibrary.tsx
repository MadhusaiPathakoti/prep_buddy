import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getFavoriteIds, toggleFavorite } from '../lib/favorites'
import type { BankEntry, Difficulty } from '../lib/types'

type FilterId = Difficulty | 'all' | 'favorites'

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
  { id: 'favorites', label: '★ Favourites' },
]

function difficultyBadge(d: Difficulty) {
  if (d === 'easy') return 'bg-emerald-100 text-emerald-700'
  if (d === 'medium') return 'bg-amber-100 text-amber-700'
  return 'bg-rose-100 text-rose-700'
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
}

export default function BankLibrary({ bank, bankKey, backTo, backLabel, title, nounPlural, addAction, onDelete }: BankLibraryProps) {
  const [filter, setFilter] = useState<FilterId>('all')
  const [query, setQuery] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<Set<string>>(() => getFavoriteIds(bankKey))

  function handleToggleFavorite(id: string) {
    setFavorites((prev) => toggleFavorite(bankKey, id, prev))
  }

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase()
    return bank
      .filter((w) => {
        if (filter === 'all') return true
        if (filter === 'favorites') return favorites.has(w.id)
        return w.difficulty === filter
      })
      .filter((w) => q === '' || w.term.toLowerCase().includes(q) || w.meaning.toLowerCase().includes(q))
      .sort((a, b) => a.term.localeCompare(b.term))
  }, [bank, filter, query, favorites])

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <Link to={backTo} className="text-sm text-slate-400 hover:text-slate-600">
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
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900">{title}</h1>
      <p className="mt-2 text-slate-500">
        Browse and learn before you play. {bank.length} {nounPlural} across three difficulty levels. Star any {nounPlural.replace(/s$/, '')} to
        save it for daily revision.
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
          placeholder={`Search ${nounPlural} or meanings…`}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-400"
        />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {entries.map((w) => {
          const isFavorite = favorites.has(w.id)
          return (
            <div key={w.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-bold text-slate-900">
                  {w.term}
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
              {w.example ? (
                <p className="mt-2 text-xs italic text-slate-400">"{w.example}"</p>
              ) : (
                <p className="mt-2 text-xs text-slate-300">No example sentence yet — try writing your own.</p>
              )}
              {onDelete && (
                <div className="mt-3 flex items-center justify-end gap-3">
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
                          onDelete(w)
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
              )}
            </div>
          )
        })}
        {entries.length === 0 && filter === 'favorites' && (
          <p className="text-slate-400">No favourites yet — tap the ☆ on any card to save it here for daily revision.</p>
        )}
        {entries.length === 0 && filter !== 'favorites' && <p className="text-slate-400">No {nounPlural} match your search.</p>}
      </div>
    </div>
  )
}
