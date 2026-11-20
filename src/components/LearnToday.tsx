import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { getFavorites, toggleFavorite, type FavoriteMap } from '../lib/favorites'
import { DAILY_SIZES, type LearnProgress, type LearnStore } from '../lib/dailyLearn'

export interface LearnItem {
  n: number
  id: string
  word: string
}

export interface FavoriteControl {
  isFavorite: boolean
  favoritedAt?: string | null
  onToggle: () => void
}

interface LearnTodayProps<T extends LearnItem> {
  /** The whole bank (alphabetical); today's words are picked from it at random. */
  items: T[]
  store: LearnStore
  /** Key the bank's favourites are saved under. */
  favoritesKey: string
  backTo: string
  backLabel: string
  /** Renders one full word card; the star is part of it. */
  renderCard: (item: T, favorite: FavoriteControl) => ReactNode
  /** Where to go after a set (first one is the primary button), e.g. the revision game and the library. */
  nextLinks: { to: string; label: string }[]
}

const chip = (on: boolean) =>
  [
    'rounded-lg px-3 py-1.5 text-sm font-semibold transition',
    on ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
  ].join(' ')

function Shell({ backTo, backLabel, children }: { backTo: string; backLabel: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to={backTo} className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← {backLabel}
      </Link>
      {children}
    </div>
  )
}

/** One cell per starting letter: how much of that letter's words are learned. */
function AlphabetCoverage({ items, learned }: { items: LearnItem[]; learned: Record<string, string> }) {
  const rows = useMemo(() => {
    const byLetter = new Map<string, { total: number; done: number }>()
    for (const w of items) {
      const l = w.word.charAt(0).toUpperCase()
      const row = byLetter.get(l) ?? { total: 0, done: 0 }
      row.total++
      if (learned[w.n]) row.done++
      byLetter.set(l, row)
    }
    return [...byLetter.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [items, learned])

  return (
    <div className="mt-4" aria-label="Words learned per starting letter">
      <div className="flex flex-wrap gap-1.5">
        {rows.map(([letter, { total, done }]) => (
          <div key={letter} title={`${letter}: ${done} of ${total} learned`} className="w-8 text-center">
            <div className="text-xs font-bold text-slate-600 dark:text-slate-300">{letter}</div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-600">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(done / total) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">Each letter fills up as you learn its words — today's picks come from all of them.</p>
    </div>
  )
}

/**
 * "Learn today": a few random not-yet-learned words from across the whole alphabet, one card at a time. The player marks each
 * word learned once they know it; unmarked words stay in the pool and may be picked again on another day.
 */
export default function LearnToday<T extends LearnItem>({ items, store, favoritesKey, backTo, backLabel, renderCard, nextLinks }: LearnTodayProps<T>) {
  const byNumber = useMemo(() => new Map(items.map((w) => [w.n, w])), [items])
  const allIds = useMemo(() => items.map((w) => w.n), [items])

  const [init] = useState(() => {
    const progress = store.getProgress()
    const ids = store.getTodaySet(allIds, progress)
    return { progress, ids }
  })
  const [progress, setProgress] = useState<LearnProgress>(init.progress)
  const [ids, setIds] = useState<number[]>(init.ids)
  const words = ids.map((n) => byNumber.get(n)).filter((w): w is T => !!w)
  const setDone = (p: LearnProgress) => words.length > 0 && words.every((w) => p.learned[w.n])
  // Pick up where the player left off: the first word of the set not learned yet.
  const [index, setIndex] = useState(() => Math.max(0, words.findIndex((w) => !init.progress.learned[w.n])))
  const [finished, setFinished] = useState(() => setDone(init.progress))
  const [favorites, setFavorites] = useState<FavoriteMap>(() => getFavorites(favoritesKey))

  const current = words[index]
  const learnedTotal = Object.keys(progress.learned).length
  const allLearned = learnedTotal >= items.length
  const learnedInSet = words.filter((w) => progress.learned[w.n]).length

  function toggleFav(id: string) {
    setFavorites((prev) => toggleFavorite(favoritesKey, id, prev))
  }

  function toggleLearned(n: number) {
    setProgress(progress.learned[n] ? store.unmarkLearned(n) : store.markLearned(n))
  }

  function startNewSet(size: number) {
    const fresh = store.getProgress()
    setIds(store.buildTodaySet(allIds, fresh, size))
    setProgress(fresh)
    setIndex(0)
    setFinished(false)
  }

  function changeSize(size: number) {
    setProgress(store.setDailySize(size))
    startNewSet(size)
  }

  // Arrow keys move through the cards (unless the player is typing somewhere).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (finished || (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) return
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, words.length - 1))
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finished, words.length])

  const header = (
    <>
      <div className="mt-2">
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">Learn today</h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">
          {store.learnedOn(progress)} learned today · {learnedTotal} of {items.length} learned in total
        </p>
      </div>
      <AlphabetCoverage items={items} learned={progress.learned} />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">New words per day</span>
        {DAILY_SIZES.map((s) => (
          <button key={s} onClick={() => changeSize(s)} className={chip(progress.size === s)}>
            {s}
          </button>
        ))}
      </div>
    </>
  )

  if (words.length === 0) {
    return (
      <Shell backTo={backTo} backLabel={backLabel}>
        {header}
        <div className="mt-8 rounded-3xl bg-white dark:bg-slate-800 p-8 text-center shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
          <div className="text-4xl">🎓</div>
          <h2 className="mt-3 text-xl font-bold text-slate-900 dark:text-slate-100">{allLearned ? 'You have learned every word!' : 'No new words right now'}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Keep them fresh with a revision game, or browse the library to look any word up again.</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {nextLinks.map((l, i) => (
              <Link
                key={l.to}
                to={l.to}
                className={['rounded-xl px-5 py-2.5 text-sm font-semibold', i === 0 ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200'].join(' ')}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </Shell>
    )
  }

  if (finished) {
    const left = words.length - learnedInSet
    return (
      <Shell backTo={backTo} backLabel={backLabel}>
        {header}
        <div className="mt-8 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{left === 0 ? 'Set complete 🎉' : 'End of today\'s set'}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {learnedInSet} of {words.length} marked learned.{' '}
            {left > 0 && 'Words you did not mark stay in the pool and may come back on another day. '}
            Tap ✓ to mark (or un-mark) a word and ★ to save it for revision.
          </p>
          <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-900/40">
            {words.map((w) => {
              const isLearned = !!progress.learned[w.n]
              const isFav = favorites.has(w.id)
              return (
                <div key={w.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0 truncate font-semibold text-slate-800 dark:text-slate-200">{w.word}</span>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => toggleFav(w.id)}
                      aria-pressed={isFav}
                      aria-label={isFav ? `Remove ${w.word} from favourites` : `Add ${w.word} to favourites`}
                      className={['rounded-full px-3 py-1 text-sm font-semibold transition', isFav ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300' : 'bg-slate-200/60 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-200'].join(' ')}
                    >
                      {isFav ? '★' : '☆'}
                    </button>
                    <button
                      onClick={() => toggleLearned(w.n)}
                      aria-pressed={isLearned}
                      aria-label={isLearned ? `Un-mark ${w.word} as learned` : `Mark ${w.word} as learned`}
                      className={['rounded-full px-3 py-1 text-sm font-semibold transition', isLearned ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200/60 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-200'].join(' ')}
                    >
                      ✓ {isLearned ? 'Learned' : 'Learn'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => startNewSet(progress.size)}
              disabled={allLearned}
              className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {allLearned ? 'No new words left' : `Get ${progress.size} more random words`}
            </button>
            {nextLinks.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="w-full rounded-xl bg-slate-100 dark:bg-slate-700 px-4 py-3 text-center font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200"
              >
                {l.label}
              </Link>
            ))}
            <button
              onClick={() => {
                setIndex(0)
                setFinished(false)
              }}
              className="text-sm text-slate-400 dark:text-slate-500 underline-offset-2 hover:text-slate-600 hover:underline"
            >
              Go through this set again
            </button>
          </div>
        </div>
      </Shell>
    )
  }

  const isLast = index === words.length - 1
  const isLearned = !!progress.learned[current.n]
  return (
    <Shell backTo={backTo} backLabel={backLabel}>
      {header}
      <div className="mt-6 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <span>
          Word <span className="font-semibold text-slate-700 dark:text-slate-300">{index + 1}</span> of {words.length}
        </span>
        <span className="text-emerald-600 dark:text-emerald-400">✓ {learnedInSet} learned in this set</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-600">
        <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${((index + 1) / words.length) * 100}%` }} />
      </div>

      <div className="mt-4" key={current.id}>
        {renderCard(current, { isFavorite: favorites.has(current.id), favoritedAt: favorites.get(current.id), onToggle: () => toggleFav(current.id) })}
      </div>

      <button
        onClick={() => toggleLearned(current.n)}
        aria-pressed={isLearned}
        className={[
          'mt-4 w-full rounded-xl border-2 px-4 py-3 font-semibold transition active:scale-[0.99]',
          isLearned
            ? 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600'
            : 'border-emerald-500 bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10',
        ].join(' ')}
      >
        {isLearned ? '✓ Learned — tap to undo' : '✓ I have learned this word'}
      </button>

      <div className="mt-3 flex gap-3">
        <button
          onClick={() => setIndex((i) => i - 1)}
          disabled={index === 0}
          className="flex-1 rounded-xl bg-slate-100 dark:bg-slate-700 px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Previous
        </button>
        <button
          onClick={() => (isLast ? setFinished(true) : setIndex((i) => i + 1))}
          className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]"
        >
          {isLast ? 'Finish set ✓' : 'Next →'}
        </button>
      </div>
    </Shell>
  )
}
