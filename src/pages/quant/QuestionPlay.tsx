import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { DifficultyBadge, StarButton, TagChip } from '../../components/qbank/QuestionBadges'
import { applyFilters, filtersToParams, parseFilters } from '../../lib/qbank/filters'
import { parseSolution } from '../../lib/qbank/solution'
import { loadIndex, loadQuestion, preloadTopic } from '../../lib/qbank/store'
import { shortcutsFor } from '../../lib/qbank/topicTips'
import { bankTopicLabel, DEFAULT_EXAM_NAME } from '../../lib/qbank/types'
import type { QuantQuestion, QuestionIndexEntry } from '../../lib/qbank/types'
import { getFavouriteMap, getProgress, recordAnswer, toggleFavouriteQuestion, USER_DATA_EVENT } from '../../lib/qbank/userData'

const LETTERS = 'ABCDE'

interface CardProps {
  question: QuantQuestion
  number: number | undefined
  isFavourite: boolean
  onToggleFavourite: () => void
  onAnswered: (correct: boolean) => void
  position: string | null
  onPrev: (() => void) | null
  onNext: (() => void) | null
  backTo: string
}

/** One question: choose an option and the result, the step-by-step solution and the shortcut appear at once. */
function QuestionCard({ question, number, isFavourite, onToggleFavourite, onAnswered, position, onPrev, onNext, backTo }: CardProps) {
  const [chosen, setChosen] = useState<number | null>(null)
  const answered = chosen !== null
  const correct = chosen === question.answer
  const solution = useMemo(() => parseSolution(question.solution), [question.solution])
  const tips = useMemo(() => shortcutsFor(question), [question])

  function choose(index: number) {
    if (chosen !== null || index < 0 || index >= question.options.length) return
    setChosen(index)
    onAnswered(index === question.answer)
  }

  // Keyboard: A–E (or 1–5) to answer, Enter or → for the next question, ← for the previous one.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const key = event.key.toLowerCase()
      const letter = 'abcde'.indexOf(key)
      const digit = '12345'.indexOf(key)
      const pick = letter >= 0 ? letter : digit
      if (key.length === 1 && pick >= 0) {
        choose(pick)
      } else if ((key === 'enter' || key === 'arrowright') && answered && onNext) {
        onNext()
      } else if (key === 'arrowleft' && onPrev) {
        onPrev()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const optionClass = (i: number) => {
    const base = 'flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition sm:text-base '
    if (!answered) return base + 'border-slate-200 bg-white hover:border-indigo-400 hover:bg-indigo-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-indigo-400 dark:hover:bg-indigo-500/10'
    if (i === question.answer) return base + 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-100'
    if (i === chosen) return base + 'border-rose-500 bg-rose-50 text-rose-900 dark:bg-rose-500/15 dark:text-rose-100'
    return base + 'border-slate-200 bg-white opacity-60 dark:border-slate-700 dark:bg-slate-800'
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to={backTo} className="text-sm text-slate-400 hover:text-slate-600 dark:text-slate-500">
          ← Question list
        </Link>
        {position && <span className="text-sm text-slate-400 dark:text-slate-500">{position}</span>}
      </div>

      <div className="mt-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {number !== undefined && <span className="text-sm font-semibold text-slate-400 dark:text-slate-500">#{number}</span>}
            <DifficultyBadge difficulty={question.difficulty} />
            <TagChip>{bankTopicLabel(question.topic)}</TagChip>
            <TagChip>{question.examType}</TagChip>
            {question.examName !== DEFAULT_EXAM_NAME && <TagChip>{question.examName}</TagChip>}
            {question.year !== null && <TagChip>{question.year}</TagChip>}
          </div>
          <StarButton active={isFavourite} onToggle={onToggleFavourite} />
        </div>

        <p className="mt-4 whitespace-pre-wrap text-base font-medium leading-relaxed text-slate-900 dark:text-slate-100 sm:text-lg">{question.stem}</p>

        <div className="mt-5 grid gap-2.5" role="group" aria-label="Answer options">
          {question.options.map((option, i) => (
            <button key={i} type="button" disabled={answered} onClick={() => choose(i)} className={optionClass(i)}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">{LETTERS[i]}</span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap">{option}</span>
              {answered && i === question.answer && <span aria-label="Correct answer">✓</span>}
              {answered && i === chosen && i !== question.answer && <span aria-label="Your answer">✕</span>}
            </button>
          ))}
        </div>
        {!answered && <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">Tip: press A–E on your keyboard to answer.</p>}
      </div>

      {answered && (
        <div className="mt-5 space-y-4" aria-live="polite">
          <div
            className={`rounded-2xl px-5 py-4 text-sm font-semibold sm:text-base ${
              correct ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200' : 'bg-rose-50 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200'
            }`}
          >
            {correct ? 'Correct! Here is how it works:' : `Not quite. The answer is (${LETTERS[question.answer]}) ${question.options[question.answer]}. Here is how it works:`}
          </div>

          {question.trust === 'unverified' && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              This answer key could not be independently confirmed. If it looks wrong to you, trust your own working and report it.
            </p>
          )}

          <section aria-label="Step-by-step solution" className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700 sm:p-6">
            <h2 className="text-sm font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">Step-by-step solution</h2>
            <ol className="mt-3 space-y-3">
              {solution.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  {step.label && <span className="mt-0.5 h-fit shrink-0 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">{step.label}</span>}
                  <div className="min-w-0 flex-1 space-y-1 text-sm text-slate-800 dark:text-slate-200 sm:text-base">
                    {step.lines.map((line, j) => (
                      <p key={j} className="whitespace-pre-wrap">
                        {line}
                      </p>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
            {solution.tail.length > 0 && (
              <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-700/50 dark:text-slate-200">
                {solution.tail.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            )}
          </section>

          <section aria-label="Exam shortcut" className="rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/30 sm:p-6">
            <h2 className="text-sm font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">⚡ Exam shortcut</h2>
            <ul className="mt-3 space-y-2 text-sm text-amber-950 dark:text-amber-100 sm:text-base">
              {tips.map((tip, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden="true">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          disabled={!onPrev}
          onClick={() => onPrev?.()}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          ← Previous
        </button>
        <div className="flex gap-2">
          {answered && (
            <button type="button" onClick={() => setChosen(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
              Try again
            </button>
          )}
          {onNext ? (
            <button type="button" onClick={() => onNext()} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700">
              {answered ? 'Next question →' : 'Skip →'}
            </button>
          ) : (
            <Link to={backTo} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700">
              End of list · Back to questions
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

type Loaded = { id: string; question: QuantQuestion | null; failed?: boolean }

export default function QuestionPlay() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const filters = useMemo(() => parseFilters(params), [params])
  const suffix = useMemo(() => {
    const qs = filtersToParams(filters).toString()
    return qs ? `?${qs}` : ''
  }, [filters])

  const [index, setIndex] = useState<QuestionIndexEntry[] | null>(null)
  const [indexFailed, setIndexFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [favourites, setFavourites] = useState(getFavouriteMap)
  const [progress, setProgress] = useState(getProgress)
  // The list "Next" walks is frozen when this screen opens, so answering a question does not remove it
  // from "Not played yet" (or reorder "Recently played") under your feet.
  const [startView] = useState(() => ({ favourites: new Set(getFavouriteMap().keys()), progress: getProgress() }))

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
      () => !cancelled && setIndexFailed(true),
    )
    return () => {
      cancelled = true
    }
  }, [attempt])

  const entry = useMemo(() => index?.find((e) => e.id === id) ?? null, [index, id])
  const list = useMemo(() => (index ? applyFilters(index, filters, startView) : []), [index, filters, startView])
  const position = list.findIndex((e) => e.id === id)
  const prevEntry = position > 0 ? list[position - 1] : null
  const nextEntry = position >= 0 ? (list[position + 1] ?? null) : (list[0] ?? null)
  const numberOf = useMemo(() => (entry && index ? index.indexOf(entry) + 1 : undefined), [entry, index])

  useEffect(() => {
    if (!entry) return
    let cancelled = false
    loadQuestion(entry).then(
      (question) => !cancelled && setLoaded({ id: entry.id, question }),
      () => !cancelled && setLoaded({ id: entry.id, question: null, failed: true }),
    )
    return () => {
      cancelled = true
    }
  }, [entry, attempt])

  // Warm the next question's topic file so "Next" is instant even when the topic changes.
  useEffect(() => {
    if (nextEntry) preloadTopic(nextEntry.topic)
  }, [nextEntry])

  const backTo = `/quant/bank${suffix}`
  const go = (target: QuestionIndexEntry | null) => (target ? () => navigate(`/quant/bank/q/${target.id}${suffix}`) : null)
  const current = loaded?.id === id ? loaded : null

  let body
  if (indexFailed && !index) {
    body = (
      <div className="rounded-2xl bg-rose-50 p-6 text-center dark:bg-rose-500/10">
        <p className="text-rose-700 dark:text-rose-300">Could not load the question bank. Check your connection and try again.</p>
        <button
          type="button"
          onClick={() => {
            setIndexFailed(false)
            setAttempt((n) => n + 1)
          }}
          className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Try again
        </button>
      </div>
    )
  } else if (!index) {
    body = <p className="py-16 text-center text-slate-400 dark:text-slate-500">Loading question…</p>
  } else if (!entry) {
    body = (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
        <p className="text-slate-600 dark:text-slate-300">This question is not in the bank any more.</p>
        <Link to={backTo} className="mt-3 inline-block text-sm font-semibold text-indigo-600 dark:text-indigo-400">
          Back to the question list
        </Link>
      </div>
    )
  } else if (!current) {
    body = <p className="py-16 text-center text-slate-400 dark:text-slate-500">Loading question…</p>
  } else if (current.failed || !current.question) {
    body = (
      <div className="rounded-2xl bg-rose-50 p-6 text-center dark:bg-rose-500/10">
        <p className="text-rose-700 dark:text-rose-300">Could not load this question.</p>
        <button
          type="button"
          onClick={() => {
            setLoaded(null)
            setAttempt((n) => n + 1)
          }}
          className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Try again
        </button>
      </div>
    )
  } else {
    body = (
      <QuestionCard
        key={current.question.id}
        question={current.question}
        number={numberOf}
        isFavourite={favourites.has(current.question.id)}
        onToggleFavourite={() => setFavourites(toggleFavouriteQuestion(current.question!.id, favourites))}
        onAnswered={(correct) => setProgress(recordAnswer(current.question!.id, correct, progress))}
        position={position >= 0 ? `${position + 1} of ${list.length.toLocaleString()}` : null}
        onPrev={go(prevEntry)}
        onNext={go(nextEntry)}
        backTo={backTo}
      />
    )
  }

  return <div className="mx-auto max-w-3xl px-4 py-8">{body}</div>
}
