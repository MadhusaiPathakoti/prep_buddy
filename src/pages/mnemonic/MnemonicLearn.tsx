import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import MnemonicCard from '../../components/MnemonicCard'
import { getFavorites, toggleFavorite, type FavoriteMap } from '../../lib/favorites'
import {
  buildTodaySet,
  DAILY_SIZES,
  getProgress,
  getTodaySet,
  learnedOn,
  markSeen,
  MNEMONIC_BANK_KEY,
  setDailySize,
  type MnemonicProgress,
  type MnemonicWord,
} from '../../lib/mnemonicVocab'
import { useMnemonicBank } from '../../lib/useMnemonicBank'

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/english/mnemonic-vocab" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← Mnemonic Vocabulary
      </Link>
      {children}
    </div>
  )
}

export default function MnemonicLearn() {
  const { bank, error } = useMnemonicBank()
  if (error) {
    return (
      <Shell>
        <p className="mt-6 rounded-lg bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          Could not load the word bank. Check your connection and try again.
        </p>
      </Shell>
    )
  }
  if (!bank) {
    return (
      <Shell>
        <p className="mt-6 text-slate-400 dark:text-slate-500">Loading the words…</p>
      </Shell>
    )
  }
  return <Learn bank={bank} />
}

function Learn({ bank }: { bank: MnemonicWord[] }) {
  const byNumber = useMemo(() => new Map(bank.map((w) => [w.n, w])), [bank])
  // Opening a card counts it as learned (so tomorrow's set carries on where today's ended) — the first card is opened on arrival.
  const [init] = useState(() => {
    const p = getProgress()
    const todays = getTodaySet(bank, p)
    return { ids: todays, progress: todays.length > 0 ? markSeen(todays[0]) : p }
  })
  const [progress, setProgress] = useState<MnemonicProgress>(init.progress)
  const [ids, setIds] = useState<number[]>(init.ids)
  const [index, setIndex] = useState(0)
  const [finished, setFinished] = useState(false)
  const [favorites, setFavorites] = useState<FavoriteMap>(() => getFavorites(MNEMONIC_BANK_KEY))

  const words = ids.map((n) => byNumber.get(n)).filter((w): w is MnemonicWord => !!w)
  const current = words[index]
  const allLearned = Object.keys(progress.seen).length >= bank.length

  function goTo(i: number) {
    const target = words[i]
    if (!target) return
    setProgress(markSeen(target.n))
    setIndex(i)
  }

  // Arrow keys move through the cards (unless the player is typing somewhere).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (finished || (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) return
      if (e.key === 'ArrowRight' && index < words.length - 1) goTo(index + 1)
      if (e.key === 'ArrowLeft' && index > 0) goTo(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, index, words.length])

  function toggleFav(id: string) {
    setFavorites((prev) => toggleFavorite(MNEMONIC_BANK_KEY, id, prev))
  }

  function startNewSet(size: number) {
    const next = buildTodaySet(bank, getProgress(), size)
    setIds(next)
    setIndex(0)
    setFinished(false)
    if (next.length > 0) setProgress(markSeen(next[0]))
  }

  function changeSize(size: number) {
    setProgress(setDailySize(size))
    startNewSet(size)
  }

  const learnedToday = learnedOn(progress)

  const header = (
    <>
      <div className="mt-2">
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">Learn today</h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">
          {learnedToday} learned today · {Object.keys(progress.seen).length} of {bank.length} in total
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Words per day</span>
        {DAILY_SIZES.map((s) => (
          <button
            key={s}
            onClick={() => changeSize(s)}
            className={[
              'rounded-lg px-3 py-1.5 text-sm font-semibold transition',
              progress.size === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
            ].join(' ')}
          >
            {s}
          </button>
        ))}
      </div>
    </>
  )

  if (words.length === 0) {
    return (
      <Shell>
        {header}
        <div className="mt-8 rounded-3xl bg-white dark:bg-slate-800 p-8 text-center shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
          <div className="text-4xl">🎓</div>
          <h2 className="mt-3 text-xl font-bold text-slate-900 dark:text-slate-100">{allLearned ? 'You have opened every word!' : 'No new words right now'}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Revise your favourites, or browse the library to look any word up again.</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link to="/english/mnemonic-vocab/revise" className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500">
              Revise favourites
            </Link>
            <Link to="/english/mnemonic-vocab/library" className="rounded-xl bg-slate-100 dark:bg-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200">
              Open the library
            </Link>
          </div>
        </div>
      </Shell>
    )
  }

  if (finished) {
    const starred = words.filter((w) => favorites.has(w.id)).length
    return (
      <Shell>
        {header}
        <div className="mt-8 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Set complete 🎉</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Tap a word to star it (or un-star it). Starred words come back in <strong>Revise favourites</strong>. {starred} of {words.length} starred.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {words.map((w) => {
              const on = favorites.has(w.id)
              return (
                <button
                  key={w.id}
                  onClick={() => toggleFav(w.id)}
                  aria-pressed={on}
                  className={[
                    'rounded-full px-3 py-1.5 text-sm font-semibold transition',
                    on ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
                  ].join(' ')}
                >
                  {on ? '★' : '☆'} {w.word}
                </button>
              )
            })}
          </div>
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => startNewSet(progress.size)}
              disabled={allLearned}
              className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {allLearned ? 'No new words left' : `Learn ${progress.size} more`}
            </button>
            <Link
              to="/english/mnemonic-vocab/revise"
              className="w-full rounded-xl bg-slate-100 dark:bg-slate-700 px-4 py-3 text-center font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200"
            >
              Revise favourites
            </Link>
            <button onClick={() => { setFinished(false); goTo(0) }} className="text-sm text-slate-400 dark:text-slate-500 underline-offset-2 hover:text-slate-600 hover:underline">
              Go through this set again
            </button>
          </div>
        </div>
      </Shell>
    )
  }

  const isLast = index === words.length - 1
  return (
    <Shell>
      {header}
      <div className="mt-6 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <span>
          Word <span className="font-semibold text-slate-700 dark:text-slate-300">{index + 1}</span> of {words.length}
        </span>
        <span>No. {current.n} in the book</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-600">
        <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${((index + 1) / words.length) * 100}%` }} />
      </div>

      <div className="mt-4">
        <MnemonicCard
          key={current.id}
          word={current}
          isFavorite={favorites.has(current.id)}
          favoritedAt={favorites.get(current.id)}
          onToggleFavorite={() => toggleFav(current.id)}
        />
      </div>

      <div className="mt-5 flex gap-3">
        <button
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          className="flex-1 rounded-xl bg-slate-100 dark:bg-slate-700 px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Previous
        </button>
        <button
          onClick={() => (isLast ? setFinished(true) : goTo(index + 1))}
          className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]"
        >
          {isLast ? 'Finish set ✓' : 'Next →'}
        </button>
      </div>
    </Shell>
  )
}
