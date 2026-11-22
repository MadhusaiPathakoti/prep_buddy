import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import FavoriteRecencyChips from '../../components/FavoriteRecencyChips'
import StarButton from '../../components/awareness/StarButton'
import { basePath } from '../../lib/awareness/books'
import { useBook } from '../../lib/awareness/bookContext'
import { loadAllQuestions } from '../../lib/awareness/data'
import { THEMES } from '../../lib/awareness/theme'
import type { CaBankQuestion } from '../../lib/awareness/types'
import { formatFavoritedDate, getFavorites, isFavoritedWithin, toggleFavorite } from '../../lib/favorites'

const PAGE = 25
const LETTERS = ['A', 'B', 'C', 'D']

export default function QuestionBankPage() {
  const book = useBook()
  const base = basePath(book)
  const [params, setParams] = useSearchParams()
  const [all, setAll] = useState<CaBankQuestion[] | null>(null)
  const [error, setError] = useState(false)
  const [favorites, setFavorites] = useState(() => getFavorites(book.bankKey))
  const [search, setSearch] = useState('')
  const [recency, setRecency] = useState<number | null>(null)
  const [showAnswers, setShowAnswers] = useState(false)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [limit, setLimit] = useState(PAGE)

  const chapterId = params.get('chapter') ?? ''
  const favOnly = params.get('fav') === '1'

  useEffect(() => {
    let cancelled = false
    loadAllQuestions(book)
      .then((qs) => {
        if (!cancelled) setAll(qs)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [book])

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
    setLimit(PAGE)
  }

  const filtered = useMemo(() => {
    if (!all) return []
    const needle = search.trim().toLowerCase()
    return all.filter(
      (q) =>
        (!chapterId || q.chapterId === chapterId) &&
        (!favOnly || isFavoritedWithin(favorites, q.id, recency)) &&
        (!needle || q.q.toLowerCase().includes(needle) || q.options.some((o) => o.toLowerCase().includes(needle)) || q.explain.toLowerCase().includes(needle)),
    )
  }, [all, chapterId, favOnly, favorites, recency, search])

  const back = (
    <Link to={`${base}`} className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
      ← {book.name}
    </Link>
  )

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        {back}
        <p className="mt-6 rounded-lg bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">Could not load the questions. Try again.</p>
      </div>
    )
  }

  const chip = (on: boolean) =>
    ['rounded-lg px-3 py-1.5 text-sm font-semibold transition', on ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'].join(' ')

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {back}
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">Question bank</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">
        {all ? `${all.length} questions` : 'Loading…'} from every chapter. Star the ones you want to revise.
      </p>

      <div className="mt-6 space-y-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setLimit(PAGE)
          }}
          placeholder="Search questions, options or explanations…"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={chapterId}
            onChange={(e) => setParam('chapter', e.target.value || null)}
            aria-label="Chapter"
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">All chapters</option>
            {book.chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.number}. {c.title}
              </option>
            ))}
          </select>
          <button onClick={() => setParam('fav', favOnly ? null : '1')} aria-pressed={favOnly} className={`flex items-center gap-1.5 ${chip(favOnly)}`}>
            <span>★</span> Favourites only ({favorites.size})
          </button>
          <button onClick={() => setShowAnswers((v) => !v)} aria-pressed={showAnswers} className={chip(showAnswers)}>
            {showAnswers ? 'Hide answers' : 'Show all answers'}
          </button>
        </div>
        {favOnly && favorites.size > 0 && (
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Favourited within</div>
            <FavoriteRecencyChips value={recency} onChange={(d) => { setRecency(d); setLimit(PAGE) }} compact />
          </div>
        )}
      </div>

      <div className="mt-4 text-sm text-slate-500 dark:text-slate-400">
        {all ? `${filtered.length} ${filtered.length === 1 ? 'question' : 'questions'}` : ''}
        {filtered.length > 0 && (
          <>
            {' · '}
            <Link to={`${base}/quiz?${new URLSearchParams({ ...(chapterId ? { chapter: chapterId } : {}), ...(favOnly ? { fav: '1' } : {}), ...(favOnly && recency ? { days: String(recency) } : {}) })}`} className="font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400">
              Play these →
            </Link>
          </>
        )}
      </div>

      {favOnly && favorites.size === 0 && (
        <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">You haven't starred any questions yet. Tap ☆ on a question to add it.</p>
      )}

      <div className="mt-4 space-y-4">
        {filtered.slice(0, limit).map((q) => {
          const starred = favorites.has(q.id)
          const open = showAnswers || revealed.has(q.id)
          const when = favorites.get(q.id)
          const t = THEMES[book.chapters.find((c) => c.id === q.chapterId)?.theme ?? 'indigo']
          return (
            <article key={q.id} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${t.soft} ${t.text}`}>{q.chapterTitle}</span>
                  {q.exam && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">📝 {q.exam}</span>}
                </div>
                <StarButton on={starred} onToggle={() => setFavorites(toggleFavorite(book.bankKey, q.id, favorites))} />
              </div>
              <h2 className="mt-3 font-semibold leading-snug text-slate-900 dark:text-slate-100">{q.q}</h2>
              <ol className="mt-3 space-y-1.5">
                {q.options.map((o, i) => (
                  <li
                    key={i}
                    className={[
                      'flex gap-3 rounded-xl border px-3 py-2 text-sm',
                      open && i === q.answer ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-200' : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-300',
                    ].join(' ')}
                  >
                    <span className="font-bold text-slate-400 dark:text-slate-500">{LETTERS[i]}</span>
                    <span>{o}</span>
                    {open && i === q.answer && <span className="ml-auto font-bold text-emerald-600 dark:text-emerald-400">✓</span>}
                  </li>
                ))}
              </ol>
              {open ? (
                <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">Why: </span>
                  {q.explain}
                </p>
              ) : (
                <button onClick={() => setRevealed((r) => new Set(r).add(q.id))} className="mt-3 text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
                  Show answer
                </button>
              )}
              {starred && when && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">★ Favourited {formatFavoritedDate(when)}</p>}
            </article>
          )
        })}
      </div>

      {all && filtered.length === 0 && !(favOnly && favorites.size === 0) && <p className="mt-8 text-center text-slate-400 dark:text-slate-500">No questions match these filters.</p>}

      {filtered.length > limit && (
        <button onClick={() => setLimit((l) => l + PAGE)} className="mt-6 w-full rounded-xl bg-slate-100 px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300">
          Show more ({filtered.length - limit} left)
        </button>
      )}
    </div>
  )
}
