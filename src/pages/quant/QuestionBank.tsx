import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { DifficultyBadge, StarButton, StatusMark, TagChip } from '../../components/qbank/QuestionBadges'
import { activeFilterCount, applyFilters, facetsOf, filtersToParams, NO_FILTERS, parseFilters, SHOW_MODES } from '../../lib/qbank/filters'
import type { BankFilters } from '../../lib/qbank/filters'
import { loadIndex } from '../../lib/qbank/store'
import { BANK_TOPICS, bankTopicLabel, DEFAULT_EXAM_NAME, DIFFICULTIES, EXAM_TYPES } from '../../lib/qbank/types'
import type { QuestionIndexEntry } from '../../lib/qbank/types'
import { getFavouriteMap, getProgress, toggleFavouriteQuestion, USER_DATA_EVENT } from '../../lib/qbank/userData'

const PAGE_SIZE = 25

const selectClass =
  'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-indigo-900'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
      {label}
      <div className="mt-1 font-normal">{children}</div>
    </label>
  )
}

export default function QuestionBank() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const filters = useMemo(() => parseFilters(params), [params])
  const page = Math.max(1, Number(params.get('page')) || 1)

  const [index, setIndex] = useState<QuestionIndexEntry[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [favourites, setFavourites] = useState(getFavouriteMap)
  const [progress, setProgress] = useState(getProgress)

  // After signing in, the synced favourites and plays arrive a moment later: re-read them when they do.
  useEffect(() => {
    const reload = () => {
      setFavourites(getFavouriteMap())
      setProgress(getProgress())
    }
    window.addEventListener(USER_DATA_EVENT, reload)
    return () => window.removeEventListener(USER_DATA_EVENT, reload)
  }, [])

  useEffect(() => {
    let cancelled = false
    loadIndex().then(
      (list) => !cancelled && setIndex(list),
      () => !cancelled && setFailed(true),
    )
    return () => {
      cancelled = true
    }
  }, [attempt])

  const facets = useMemo(() => facetsOf(index ?? []), [index])
  const numberOf = useMemo(() => new Map((index ?? []).map((e, i) => [e.id, i + 1])), [index])
  const favouriteIds = useMemo(() => new Set(favourites.keys()), [favourites])
  const matches = useMemo(() => applyFilters(index ?? [], filters, { favourites: favouriteIds, progress }), [index, filters, favouriteIds, progress])

  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const rows = matches.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const activeCount = activeFilterCount(filters)

  /** Changes filters and goes back to the first page. */
  function setFilters(patch: Partial<BankFilters>) {
    setParams(filtersToParams({ ...filters, ...patch }), { replace: true })
  }

  function goToPage(next: number) {
    const nextParams = filtersToParams(filters)
    if (next > 1) nextParams.set('page', String(next))
    setParams(nextParams)
    window.scrollTo({ top: 0 })
  }

  const filterSuffix = (() => {
    const qs = filtersToParams(filters).toString()
    return qs ? `?${qs}` : ''
  })()
  const playLink = (id: string) => `/quant/bank/q/${id}${filterSuffix}`

  function start() {
    const first = matches.find((e) => !progress.has(e.id)) ?? matches[0]
    if (first) navigate(playLink(first.id))
  }

  function random() {
    if (matches.length) navigate(playLink(matches[Math.floor(Math.random() * matches.length)].id))
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link to="/maths" className="text-sm text-slate-400 hover:text-slate-600 dark:text-slate-500">
        ← Maths
      </Link>
      <div className="mb-6 mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">Quant Question Bank</h1>
          <p className="mt-2 max-w-xl text-slate-500 dark:text-slate-400">
            Pick a question, answer it, and see the step-by-step solution with the exam shortcut straight away, whether you got it right or not. Star questions to revise later.
          </p>
        </div>
      </div>

      {failed && !index ? (
        <div className="rounded-2xl bg-rose-50 p-6 text-center dark:bg-rose-500/10">
          <p className="text-rose-700 dark:text-rose-300">Could not load the question bank. Check your connection and try again.</p>
          <button
            type="button"
            onClick={() => {
              setFailed(false)
              setAttempt((n) => n + 1)
            }}
            className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Try again
          </button>
        </div>
      ) : !index ? (
        <p className="py-16 text-center text-slate-400 dark:text-slate-500">Loading questions…</p>
      ) : (
        <>
          <section aria-label="Filters" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
            <div className="flex flex-wrap gap-2">
              {SHOW_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={filters.show === mode.id}
                  onClick={() => setFilters({ show: mode.id })}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    filters.show === mode.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Field label="Topic">
                <select className={selectClass} value={filters.topic} onChange={(e) => setFilters({ topic: e.target.value as BankFilters['topic'] })}>
                  <option value="">All topics</option>
                  {BANK_TOPICS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Difficulty">
                <select className={selectClass} value={filters.difficulty} onChange={(e) => setFilters({ difficulty: e.target.value as BankFilters['difficulty'] })}>
                  <option value="">Any difficulty</option>
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {d[0].toUpperCase() + d.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Exam type">
                <select className={selectClass} value={filters.examType} onChange={(e) => setFilters({ examType: e.target.value as BankFilters['examType'] })}>
                  <option value="">Any type</option>
                  {EXAM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Exam name">
                <select className={selectClass} value={filters.examName} onChange={(e) => setFilters({ examName: e.target.value })}>
                  <option value="">Any exam</option>
                  {facets.examNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Exam year">
                <select className={selectClass} value={filters.year} onChange={(e) => setFilters({ year: e.target.value })}>
                  <option value="">Any year</option>
                  {facets.years.map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                  {facets.hasUnknownYear && <option value="unknown">Unknown</option>}
                </select>
              </Field>
              <Field label="Search the question">
                <input
                  type="search"
                  className={selectClass}
                  placeholder="e.g. train, 25%, ratio"
                  value={filters.q}
                  onChange={(e) => setFilters({ q: e.target.value })}
                />
              </Field>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-500 dark:text-slate-400" aria-live="polite">
                <strong className="text-slate-900 dark:text-slate-100">{matches.length.toLocaleString()}</strong> of {index.length.toLocaleString()} questions
              </p>
              <div className="flex flex-wrap gap-2">
                {activeCount > 0 && (
                  <button type="button" onClick={() => setParams(filtersToParams(NO_FILTERS), { replace: true })} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700">
                    Reset filters
                  </button>
                )}
                <button
                  type="button"
                  disabled={matches.length === 0}
                  onClick={random}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Random
                </button>
                <button type="button" disabled={matches.length === 0} onClick={start} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50">
                  Start practising →
                </button>
              </div>
            </div>
          </section>

          {matches.length === 0 ? (
            <div className="mt-6 rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
              {filters.show === 'favourites' && activeCount === 1
                ? 'You have no favourites yet. Tap the star on any question to save it here for revision.'
                : filters.show === 'recent' && activeCount === 1
                  ? 'Nothing played yet. Questions you answer will appear here.'
                  : 'No questions match these filters. Try removing one.'}
            </div>
          ) : (
            <>
              <ul className="mt-6 divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:divide-slate-700 dark:bg-slate-800 dark:ring-slate-700">
                {rows.map((e) => (
                  <li key={e.id} className="flex items-start gap-1 pr-2 transition hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <Link to={playLink(e.id)} className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3">
                      <span className="w-10 shrink-0 pt-0.5 text-right text-xs tabular-nums text-slate-400 dark:text-slate-500">{numberOf.get(e.id)}</span>
                      <StatusMark record={progress.get(e.id)} />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-medium text-slate-900 dark:text-slate-100">{e.preview}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <TagChip>{bankTopicLabel(e.topic)}</TagChip>
                          <TagChip>{e.examType}</TagChip>
                          {e.examName !== DEFAULT_EXAM_NAME && <TagChip>{e.examName}</TagChip>}
                          {e.year !== null && <TagChip>{e.year}</TagChip>}
                        </div>
                      </div>
                      <DifficultyBadge difficulty={e.difficulty} />
                    </Link>
                    <StarButton active={favouriteIds.has(e.id)} onToggle={() => setFavourites(toggleFavouriteQuestion(e.id, favourites))} />
                  </li>
                ))}
              </ul>

              {pageCount > 1 && (
                <nav aria-label="Pages" className="mt-5 flex items-center justify-between">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => goToPage(safePage - 1)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200"
                  >
                    ← Previous
                  </button>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    Page {safePage} of {pageCount}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= pageCount}
                    onClick={() => goToPage(safePage + 1)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200"
                  >
                    Next →
                  </button>
                </nav>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
