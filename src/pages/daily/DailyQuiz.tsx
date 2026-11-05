import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import StimulusView from '../../components/mocks/StimulusView'
import { formatDateKey, isDateKey, isSectionId, sectionInfo, todayKey } from '../../lib/daily/compose'
import { clearProgress, dailyStatus, finishDaily, getDailyPaper, loadProgress, saveProgress, startProgress, type DailyProgress } from '../../lib/daily/store'
import { OPTION_LETTERS } from '../../lib/mocks/report'
import { emptyResponse, formatScore, statusOf, type QResponse, type QStatus } from '../../lib/mocks/scoring'
import { topicLabel } from '../../lib/mocks/topics'
import type { MockPaper, MockQuestion } from '../../lib/mocks/types'
import { downloadDailyPdf } from './downloadPdf'

/** A stint longer than this on one question is treated as the student stepping away, not working. */
const MAX_STINT_MS = 10 * 60 * 1000

const STATUS_STYLE: Record<QStatus, string> = {
  answered: 'bg-emerald-500 text-white',
  'answered-marked': 'bg-violet-600 text-white ring-2 ring-emerald-400',
  marked: 'bg-violet-600 text-white',
  'not-answered': 'bg-red-500 text-white',
  'not-visited': 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
}

const btnGhost = 'rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'

export default function DailyQuiz() {
  const { section } = useParams()
  const [params] = useSearchParams()
  if (!isSectionId(section)) return <Navigate to="/daily" replace />
  const requested = params.get('date')
  const dateKey = isDateKey(requested) ? requested : todayKey()
  // Re-mount per paper + retake request so state initialisers run afresh.
  return <DailyQuizInner key={`${section}:${dateKey}:${params.get('retake') ?? ''}`} section={section} dateKey={dateKey} retake={params.get('retake') === '1'} />
}

function DailyQuizInner({ section, dateKey, retake }: { section: 'quant' | 'reasoning' | 'english'; dateKey: string; retake: boolean }) {
  const navigate = useNavigate()
  const [, setParams] = useSearchParams()
  const info = sectionInfo(section)

  const built = useMemo(() => {
    try {
      return { paper: getDailyPaper(section, dateKey), error: null as string | null }
    } catch (e) {
      return { paper: null as MockPaper | null, error: e instanceof Error ? e.message : 'Could not prepare today’s paper.' }
    }
  }, [section, dateKey])

  if (built.error || !built.paper) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p role="alert" className="rounded-2xl bg-red-50 p-5 text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {built.error}
        </p>
        <button type="button" onClick={() => navigate(0)} className="mt-4 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          Try again
        </button>
      </div>
    )
  }
  return <QuizBody paper={built.paper} section={section} dateKey={dateKey} retake={retake} title={info.name} onRetakeStarted={() => setParams({ date: dateKey }, { replace: true })} />
}

function QuizBody({ paper, section, dateKey, retake, title, onRetakeStarted }: { paper: MockPaper; section: 'quant' | 'reasoning' | 'english'; dateKey: string; retake: boolean; title: string; onRetakeStarted: () => void }) {
  const navigate = useNavigate()
  const questions = useMemo(() => {
    const byId = new Map(paper.questions.map((q) => [q.id, q]))
    return paper.sections[0].questionIds.map((id) => byId.get(id) as MockQuestion)
  }, [paper])

  // Quiz state. `progress === null` shows the "already completed" summary instead of the quiz.
  const [progress, setProgress] = useState<DailyProgress | null>(() => {
    if (retake) {
      clearProgress(section, dateKey)
      return startProgress(paper, section, dateKey)
    }
    const saved = loadProgress(section, dateKey)
    if (saved && paper.questions.some((q) => q.id === saved.currentId)) return saved
    if (saved) clearProgress(section, dateKey)
    return dailyStatus(section, dateKey).last ? null : startProgress(paper, section, dateKey)
  })

  useEffect(() => {
    if (retake) onRetakeStarted()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!progress) {
    return (
      <Completed
        paper={paper}
        section={section}
        dateKey={dateKey}
        title={title}
        onRetake={() => {
          clearProgress(section, dateKey)
          setProgress(startProgress(paper, section, dateKey))
        }}
      />
    )
  }
  return <Quiz paper={paper} questions={questions} initial={progress} title={title} onSubmitted={(id) => navigate(`/mocks/result/${id}`, { replace: true })} />
}

function Completed({ paper, section, dateKey, title, onRetake }: { paper: MockPaper; section: 'quant' | 'reasoning' | 'english'; dateKey: string; title: string; onRetake: () => void }) {
  const status = dailyStatus(section, dateKey)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const last = status.last
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/daily" className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
        ← Daily Dose
      </Link>
      <div className="mt-4 rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
        <p className="text-4xl">✅</p>
        <h1 className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-slate-100">{title}: done for {dateKey === todayKey() ? 'today' : formatDateKey(dateKey)}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">This is the day&rsquo;s paper, and it stays the same however often you open it. Re-attempt it for practice, or review your solutions.</p>
        {last && (
          <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/50">
              <p className="text-slate-500">Last score</p>
              <p className="text-xl font-extrabold text-slate-900 dark:text-slate-100">
                {formatScore(last.score)}
                <span className="text-xs font-normal text-slate-400"> /{last.maxScore}</span>
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/50">
              <p className="text-slate-500">Best score</p>
              <p className="text-xl font-extrabold text-emerald-600">{formatScore(status.best?.score ?? 0)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/50">
              <p className="text-slate-500">Attempts</p>
              <p className="text-xl font-extrabold text-slate-900 dark:text-slate-100">{status.attempts.length}</p>
            </div>
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {last && (
            <Link to={`/mocks/result/${last.id}`} className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-700">
              View result &amp; solutions
            </Link>
          )}
          <button type="button" onClick={onRetake} className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            ↻ Re-attempt
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setErr(null)
              try {
                await downloadDailyPdf(paper)
              } catch (e) {
                setErr(e instanceof Error ? e.message : 'Could not build the PDF.')
              } finally {
                setBusy(false)
              }
            }}
            className={btnGhost}
          >
            {busy ? 'Building PDF…' : '⬇ Download paper (PDF)'}
          </button>
        </div>
        {err && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {err}
          </p>
        )}
      </div>

      {status.attempts.length > 0 && (
        <ul className="mt-6 space-y-2">
          {status.attempts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-2xl bg-white p-3 pl-4 text-sm shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
              <span className="font-semibold text-slate-900 dark:text-slate-100">Attempt {a.attemptNo ?? 1}</span>
              <span className="flex-1 text-xs text-slate-500 dark:text-slate-400">
                {new Date(a.finishedAt).toLocaleString()} · ✓ {a.correct} · ✕ {a.incorrect} · accuracy {a.accuracy.toFixed(1)}%
              </span>
              <b className="text-slate-900 dark:text-slate-100">{formatScore(a.score)}</b>
              <Link to={`/mocks/result/${a.id}`} className="font-semibold text-indigo-600 dark:text-indigo-400">
                View
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Quiz({ paper, questions, initial, title, onSubmitted }: { paper: MockPaper; questions: MockQuestion[]; initial: DailyProgress; title: string; onSubmitted: (attemptId: string) => void }) {
  // The question on screen counts as visited from the start.
  const [progress, setProgress] = useState<DailyProgress>(() => ({ ...initial, responses: { ...initial.responses, [initial.currentId]: { ...(initial.responses[initial.currentId] ?? emptyResponse()), visited: true } } }))
  const [confirming, setConfirming] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const progressRef = useRef(progress)
  const enteredAt = useRef<number | null>(null)

  const index = Math.max(0, questions.findIndex((q) => q.id === progress.currentId))
  const q = questions[index]
  const stimulus = q.setId ? paper.sets[q.setId] : undefined

  /** Adds the time since the student landed on the current question to its total, then restarts the stint. */
  const commitTime = useCallback((from: DailyProgress): DailyProgress => {
    const now = Date.now()
    const since = enteredAt.current
    enteredAt.current = now
    if (since === null) return from
    const cur = from.responses[from.currentId] ?? emptyResponse()
    const stint = Math.min(MAX_STINT_MS, Math.max(0, now - since))
    return { ...from, responses: { ...from.responses, [from.currentId]: { ...cur, visited: true, timeMs: cur.timeMs + stint } } }
  }, [])

  // Autosave on every change so a refresh or closed tab resumes the quiz.
  useEffect(() => {
    progressRef.current = progress
    saveProgress(progress)
  }, [progress])

  // Time on a question is counted from when it is shown, and stops while the tab is hidden.
  useEffect(() => {
    enteredAt.current = Date.now()
    const onVisibility = () => {
      if (document.hidden) {
        setProgress(commitTime(progressRef.current))
        enteredAt.current = null
      } else enteredAt.current = Date.now()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [commitTime])

  const update = (fn: (r: QResponse) => QResponse) =>
    setProgress((p) => {
      const cur = p.responses[p.currentId] ?? emptyResponse()
      return { ...p, responses: { ...p.responses, [p.currentId]: fn({ ...cur, visited: true }) } }
    })

  const goTo = (i: number) => {
    const target = questions[Math.min(questions.length - 1, Math.max(0, i))]
    if (target.id === progressRef.current.currentId) return
    // commitTime reads and restarts the stint clock, so it runs here rather than inside a state updater.
    const timed = commitTime(progressRef.current)
    const next = timed.responses[target.id] ?? emptyResponse()
    setProgress({ ...timed, currentId: target.id, responses: { ...timed.responses, [target.id]: { ...next, visited: true } } })
    setPaletteOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const tally = useMemo(() => {
    let answered = 0
    let marked = 0
    for (const x of questions) {
      const r = progress.responses[x.id]
      if (r?.selected !== null && r?.selected !== undefined) answered++
      if (r?.marked) marked++
    }
    return { answered, marked, unanswered: questions.length - answered }
  }, [progress.responses, questions])

  const submit = () => {
    setBusy(true)
    setError(null)
    const attempt = finishDaily(paper, commitTime(progressRef.current))
    if (!attempt) {
      setBusy(false)
      setError('Could not save your result: this browser’s storage is full. Free some space and submit again — your answers are still here.')
      return
    }
    onSubmitted(attempt.id)
  }

  const [pdfBusy, setPdfBusy] = useState(false)
  const response = progress.responses[q.id] ?? emptyResponse()
  const dateLabel = paper.daily ? formatDateKey(paper.daily.dateKey) : ''

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link to="/daily" className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
            ← Daily Dose
          </Link>
          <h1 className="mt-1 truncate text-xl font-extrabold text-slate-900 dark:text-slate-100 sm:text-2xl">
            {title} <span className="text-base font-semibold text-slate-400">· {dateLabel}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Attempt {progress.attemptNo} · no time limit · your answers are saved automatically
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pdfBusy}
            onClick={async () => {
              setPdfBusy(true)
              setError(null)
              try {
                await downloadDailyPdf(paper)
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not build the PDF.')
              } finally {
                setPdfBusy(false)
              }
            }}
            className={btnGhost}
          >
            {pdfBusy ? 'Building PDF…' : '⬇ Download paper (PDF)'}
          </button>
          <button type="button" onClick={() => setConfirming(true)} className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            Submit quiz
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
            <header className="mb-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-indigo-600 px-3 py-1 font-bold text-white">
                Q{index + 1} <span className="font-normal opacity-80">of {questions.length}</span>
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">{topicLabel(q.topic)}</span>
              <span className="ml-auto text-slate-400">+{paper.marksPerQuestion} / −{paper.negativeMarks}</span>
            </header>

            {stimulus && (
              <div className="mb-4 max-h-[26rem] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
                <StimulusView stimulus={stimulus} />
              </div>
            )}

            <p className="whitespace-pre-line text-[15px] font-medium leading-relaxed text-slate-900 dark:text-slate-100">{q.stem}</p>

            <div role="radiogroup" aria-label="Options" className="mt-4 space-y-2">
              {q.options.map((o, i) => {
                const chosen = response.selected === i
                return (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={chosen}
                    onClick={() => update((r) => ({ ...r, selected: chosen ? null : i }))}
                    className={`flex w-full items-start gap-3 rounded-xl border px-4 py-2.5 text-left text-sm transition ${
                      chosen
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-900 dark:border-indigo-400 dark:bg-indigo-500/15 dark:text-indigo-100'
                        : 'border-slate-200 text-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${chosen ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>{OPTION_LETTERS[i]}</span>
                    <span className="flex-1 whitespace-pre-line pt-0.5">{o}</span>
                  </button>
                )
              })}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => update((r) => ({ ...r, marked: !r.marked }))} className={btnGhost}>
                {response.marked ? '★ Marked for review' : '☆ Mark for review'}
              </button>
              <button type="button" disabled={response.selected === null} onClick={() => update((r) => ({ ...r, selected: null }))} className={btnGhost}>
                Clear response
              </button>
              <div className="ml-auto flex gap-2">
                <button type="button" disabled={index === 0} onClick={() => goTo(index - 1)} className={btnGhost}>
                  ← Previous
                </button>
                {index < questions.length - 1 ? (
                  <button type="button" onClick={() => goTo(index + 1)} className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                    Next →
                  </button>
                ) : (
                  <button type="button" onClick={() => setConfirming(true)} className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                    Finish &amp; submit
                  </button>
                )}
              </div>
            </div>
          </article>
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
            <button type="button" onClick={() => setPaletteOpen((v) => !v)} className="flex w-full items-center justify-between text-left lg:pointer-events-none">
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">Question palette</span>
              <span className="text-xs text-slate-500 lg:hidden">{paletteOpen ? 'Hide ▲' : `${tally.answered}/${questions.length} answered ▼`}</span>
            </button>
            <div className={`${paletteOpen ? 'block' : 'hidden'} lg:block`}>
              <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-9 lg:grid-cols-5">
                {questions.map((x, i) => {
                  const st = statusOf(progress.responses[x.id])
                  return (
                    <button
                      key={x.id}
                      type="button"
                      onClick={() => goTo(i)}
                      aria-label={`Question ${i + 1}, ${st.replace('-', ' ')}`}
                      aria-current={i === index ? 'true' : undefined}
                      className={`h-9 rounded-lg text-xs font-bold ${STATUS_STYLE[st]} ${i === index ? 'outline outline-2 outline-offset-2 outline-indigo-500' : ''}`}
                    >
                      {i + 1}
                    </button>
                  )
                })}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded bg-emerald-500" /> Answered <b className="ml-auto">{tally.answered}</b>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded bg-violet-600" /> Marked <b className="ml-auto">{tally.marked}</b>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded bg-red-500" /> Not answered
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded bg-slate-300 dark:bg-slate-600" /> Not visited
                </div>
              </dl>
            </div>
          </div>
        </aside>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true" aria-labelledby="submit-title">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl dark:bg-slate-800">
            <h2 id="submit-title" className="text-xl font-extrabold text-slate-900 dark:text-slate-100">
              Submit this quiz?
            </h2>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-500/10">
                <p className="text-2xl font-extrabold text-emerald-600">{tally.answered}</p>
                <p className="text-xs text-slate-500">Answered</p>
              </div>
              <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-700/60">
                <p className="text-2xl font-extrabold text-slate-700 dark:text-slate-200">{tally.unanswered}</p>
                <p className="text-xs text-slate-500">Unanswered</p>
              </div>
              <div className="rounded-xl bg-violet-50 p-3 dark:bg-violet-500/10">
                <p className="text-2xl font-extrabold text-violet-600">{tally.marked}</p>
                <p className="text-xs text-slate-500">Marked</p>
              </div>
            </div>
            {tally.unanswered > 0 && <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">{tally.unanswered} question{tally.unanswered === 1 ? ' is' : 's are'} still unanswered. There is no time limit, so you can go back and attempt {tally.unanswered === 1 ? 'it' : 'them'} first.</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={btnGhost}>
                Keep working
              </button>
              <button type="button" onClick={submit} disabled={busy} className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                {busy ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
