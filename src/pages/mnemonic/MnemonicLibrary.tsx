import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import FavoriteRecencyChips from '../../components/FavoriteRecencyChips'
import MnemonicCard from '../../components/MnemonicCard'
import { getFavorites, isFavoritedWithin, toggleFavorite, type FavoriteMap } from '../../lib/favorites'
import { MNEMONIC_BANK_KEY, mnemonicLearn, type MnemonicWord } from '../../lib/mnemonicVocab'
import { useMnemonicBank } from '../../lib/useMnemonicBank'

type FilterId = 'all' | 'favorites' | 'new' | 'learned'
type SortField = 'alphabetical' | 'favorited'
type SortDirection = 'asc' | 'desc'

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'favorites', label: '★ Favourites' },
  { id: 'new', label: 'Not learned yet' },
  { id: 'learned', label: 'Learned' },
]

const PAGE_SIZE = 20
const chip = (on: boolean) =>
  [
    'rounded-lg px-3 py-1.5 text-sm font-semibold transition',
    on ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
  ].join(' ')

const timeOf = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0)

export default function MnemonicLibrary() {
  const { bank, error } = useMnemonicBank()
  const back = (
    <Link to="/english/mnemonic-vocab" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
      ← Mnemonic Vocabulary
    </Link>
  )
  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        {back}
        <p className="mt-6 rounded-lg bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">Could not load the word bank. Check your connection and try again.</p>
      </div>
    )
  }
  if (!bank) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        {back}
        <p className="mt-6 text-slate-400 dark:text-slate-500">Loading the words…</p>
      </div>
    )
  }
  return <Library bank={bank} back={back} />
}

function Library({ bank, back }: { bank: MnemonicWord[]; back: ReactNode }) {
  const [filter, setFilter] = useState<FilterId>('all')
  const [query, setQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('alphabetical')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [favorites, setFavorites] = useState<FavoriteMap>(() => getFavorites(MNEMONIC_BANK_KEY))
  const [favoriteRecency, setFavoriteRecency] = useState<number | null>(null)
  const [progress, setProgress] = useState(() => mnemonicLearn.getProgress())
  const learned = progress.learned

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

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase()
    return bank
      .filter((w) => {
        if (filter === 'favorites') return isFavoritedWithin(favorites, w.id, favoriteRecency)
        if (filter === 'new') return !learned[w.n]
        if (filter === 'learned') return !!learned[w.n]
        return true
      })
      .filter(
        (w) =>
          q === '' ||
          w.word.toLowerCase().includes(q) ||
          w.meaning.toLowerCase().includes(q) ||
          w.hindi.includes(q) ||
          w.trick.toLowerCase().includes(q) ||
          w.synonyms.some((s) => s.toLowerCase().includes(q)),
      )
      .sort((a, b) => {
        // bank order is the book's alphabetical order
        const cmp = sortField === 'favorited' ? timeOf(favorites.get(a.id)) - timeOf(favorites.get(b.id)) : a.n - b.n
        return sortDirection === 'asc' ? cmp : -cmp
      })
  }, [bank, filter, query, favorites, favoriteRecency, sortField, sortDirection, learned])

  // Cards carry a picture each, so show them a page at a time.
  const listKey = `${filter}|${query}|${sortField}|${sortDirection}|${favoriteRecency}`
  const [pageState, setPageState] = useState({ key: listKey, count: PAGE_SIZE })
  const shown = pageState.key === listKey ? pageState.count : PAGE_SIZE

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {back}
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">Word library</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">
        {bank.length} words with pictures and memory tricks. Star any word to save it for revision.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => selectFilter(f.id)} className={chip(filter === f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search word, meaning, trick…"
          aria-label="Search words"
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
        <button onClick={() => setSortField('alphabetical')} className={chip(sortField === 'alphabetical')}>
          Alphabetical
        </button>
        {filter === 'favorites' && (
          <button onClick={() => setSortField('favorited')} className={chip(sortField === 'favorited')}>
            Favourited date
          </button>
        )}
        <button
          onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
          aria-label={sortDirection === 'asc' ? 'Switch to descending order' : 'Switch to ascending order'}
          className="rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-200"
        >
          {sortDirection === 'asc' ? '↑ Ascending' : '↓ Descending'}
        </button>
      </div>

      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">{entries.length} words</p>

      <div className="mt-2 grid gap-5">
        {entries.slice(0, shown).map((w) => (
          <MnemonicCard
            key={w.id}
            word={w}
            isFavorite={favorites.has(w.id)}
            favoritedAt={favorites.get(w.id)}
            onToggleFavorite={() => setFavorites((prev) => toggleFavorite(MNEMONIC_BANK_KEY, w.id, prev))}
            learned={{ isLearned: !!learned[w.n], onToggle: () => setProgress(learned[w.n] ? mnemonicLearn.unmarkLearned(w.n) : mnemonicLearn.markLearned(w.n)) }}
          />
        ))}
        {entries.length > shown && (
          <button
            onClick={() => setPageState({ key: listKey, count: shown + PAGE_SIZE })}
            className="rounded-xl bg-slate-100 dark:bg-slate-700 px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-200"
          >
            Show {Math.min(PAGE_SIZE, entries.length - shown)} more ({entries.length - shown} not shown)
          </button>
        )}
        {entries.length === 0 && filter === 'favorites' && (
          <p className="text-slate-400 dark:text-slate-500">
            {favoriteRecency !== null && favorites.size > 0
              ? `Nothing favourited in the last ${favoriteRecency} ${favoriteRecency === 1 ? 'day' : 'days'} — try a longer window.`
              : 'No favourites yet — tap the ☆ on any card to save it here for revision.'}
          </p>
        )}
        {entries.length === 0 && filter !== 'favorites' && <p className="text-slate-400 dark:text-slate-500">No words match.</p>}
      </div>
    </div>
  )
}
