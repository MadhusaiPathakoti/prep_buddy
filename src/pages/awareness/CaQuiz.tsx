import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import FavoriteRecencyChips from '../../components/FavoriteRecencyChips'
import CaQuizRunner from '../../components/awareness/CaQuizRunner'
import { CA_BANK_KEY, loadAllQuestions, shuffle } from '../../lib/computerAwareness/data'
import { CA_CHAPTERS } from '../../lib/computerAwareness/meta'
import type { CaBankQuestion } from '../../lib/computerAwareness/types'
import { FAVORITE_RECENCY_DAYS, getFavorites, isFavoritedWithin } from '../../lib/favorites'

const COUNTS = [10, 20, 30, 50, 0] // 0 = every matching question
const chip = (on: boolean) =>
  ['rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40', on ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'].join(' ')

export default function CaQuiz() {
  const [params] = useSearchParams()
  const [all, setAll] = useState<CaBankQuestion[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadAllQuestions()
      .then((qs) => {
        if (!cancelled) setAll(qs)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const back = (
    <Link to="/general-awareness/computer" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
      ← Computer Awareness
    </Link>
  )
  if (error || (all && all.length === 0)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        {back}
        <p className="mt-6 rounded-lg bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">Could not load the questions. Try again.</p>
      </div>
    )
  }
  if (!all) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        {back}
        <p className="mt-6 text-slate-400 dark:text-slate-500">Loading the questions…</p>
      </div>
    )
  }
  // keyed by the link's query so arriving from another link (e.g. "Quiz this chapter") starts from that link's settings
  return <Setup key={params.toString()} all={all} back={back} initial={params} />
}

function Setup({ all, back, initial }: { all: CaBankQuestion[]; back: React.ReactNode; initial: URLSearchParams }) {
  const withQuestions = useMemo(() => new Set(all.map((q) => q.chapterId)), [all])
  const chaptersAvailable = CA_CHAPTERS.filter((c) => withQuestions.has(c.id))
  const startChapter = initial.get('chapter')
  const startDays = Number(initial.get('days'))

  const [selected, setSelected] = useState<Set<string>>(() => new Set(startChapter && withQuestions.has(startChapter) ? [startChapter] : chaptersAvailable.map((c) => c.id)))
  const [count, setCount] = useState(20)
  const [favoritesOnly, setFavoritesOnly] = useState(initial.get('fav') === '1')
  const [recency, setRecency] = useState<number | null>(FAVORITE_RECENCY_DAYS.includes(startDays) ? startDays : null)
  const [questions, setQuestions] = useState<CaBankQuestion[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  const favorites = getFavorites(CA_BANK_KEY)
  const hasFavorites = favorites.size > 0
  const pool = all.filter((q) => selected.has(q.chapterId) && (!favoritesOnly || isFavoritedWithin(favorites, q.id, recency)))
  const asked = count === 0 ? pool.length : Math.min(count, pool.length)
  const canStart = pool.length > 0
  const allSelected = selected.size === chaptersAvailable.length

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function generate() {
    const picked = shuffle(pool)
    return count === 0 ? picked : picked.slice(0, count)
  }

  if (questions) {
    return (
      <CaQuizRunner
        key={sessionKey}
        questions={questions}
        onExit={() => setQuestions(null)}
        onRestart={() => {
          setQuestions(generate())
          setSessionKey((k) => k + 1)
        }}
      />
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      {back}
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">Play quiz</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">Every answer comes with a short explanation. Star questions as you play to revise them later.</p>

      <div className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-800 dark:text-slate-200">Chapters</h2>
          <button onClick={() => setSelected(new Set(allSelected ? [] : chaptersAvailable.map((c) => c.id)))} className="text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
            {allSelected ? 'Clear all' : 'Select all'}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {chaptersAvailable.map((c) => (
            <button key={c.id} onClick={() => toggle(c.id)} aria-pressed={selected.has(c.id)} className={`${chip(selected.has(c.id))} px-3`}>
              <span aria-hidden="true">{c.icon}</span> {c.title}
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Source</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => setFavoritesOnly(false)} aria-pressed={!favoritesOnly} className={chip(!favoritesOnly)}>
            All questions
          </button>
          <button onClick={() => setFavoritesOnly(true)} aria-pressed={favoritesOnly} className={`flex items-center gap-2 ${chip(favoritesOnly)}`}>
            <span>★</span> Only favourites
          </button>
        </div>
        {favoritesOnly && !hasFavorites && (
          <p className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            You haven't starred any questions yet. Open the <Link to="/general-awareness/computer/questions" className="font-semibold underline">question bank</Link> (or star them while you play) and tap ☆.
          </p>
        )}
        {favoritesOnly && hasFavorites && (
          <>
            <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Favourited within</h2>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Only questions you starred in this many days. Older stars (or stars from before dates were tracked) are left out.</p>
            <div className="mt-3">
              <FavoriteRecencyChips value={recency} onChange={setRecency} />
            </div>
          </>
        )}

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Number of questions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {COUNTS.map((c) => (
            <button key={c} onClick={() => setCount(c)} className={chip(count === c)}>
              {c === 0 ? 'All' : c}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          {pool.length} {favoritesOnly ? 'favourite ' : ''}
          {pool.length === 1 ? 'question' : 'questions'} available
          {favoritesOnly && recency !== null ? `, favourited in the last ${recency} ${recency === 1 ? 'day' : 'days'}` : ''}.
        </p>

        <button
          onClick={() => {
            setQuestions(generate())
            setSessionKey((k) => k + 1)
          }}
          disabled={!canStart}
          className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {canStart ? `Start · ${asked} ${asked === 1 ? 'question' : 'questions'}` : favoritesOnly && !hasFavorites ? 'Add favourites first' : selected.size === 0 ? 'Pick at least one chapter' : 'No questions match these settings'}
        </button>
      </div>
    </div>
  )
}
