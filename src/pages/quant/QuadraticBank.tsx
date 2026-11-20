import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { QuadraticError, solveQuadraticPair } from '../../../api/_lib/qbQuadratic.js'
import type { QuadraticSolved } from '../../../api/_lib/qbQuadratic.js'
import { DifficultyBadge, TagChip } from '../../components/qbank/QuestionBadges'
import { useAuth } from '../../lib/authContext'
import { loadIndex, rememberAddedQuestion } from '../../lib/qbank/store'
import { submitQuadratic } from '../../lib/qbank/quadraticApi'
import type { QuadraticResult } from '../../lib/qbank/quadraticApi'
import { parseSolution } from '../../lib/qbank/solution'
import { EXAM_NAME_SUGGESTIONS, EXAM_TYPES } from '../../lib/qbank/types'
import type { ExamType, QuestionIndexEntry } from '../../lib/qbank/types'

const AuthDialog = lazy(() => import('../../components/AuthDialog'))

const TOPIC = 'quadratic-equations'
const LETTERS = 'ABCDE'
const PAGE_SIZE = 15
const EXAMPLE = 'I. 6x² − 5√6x + 4 = 0\nII. 4y² − 11√7y + 42 = 0'
const playLink = (id: string) => `/quant/bank/q/${id}?topic=${TOPIC}`

const fieldClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-indigo-900'
const primaryButton = 'rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50'
const secondaryButton =
  'rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700'

function Card({ tone = 'plain', children }: { tone?: 'plain' | 'good' | 'warn' | 'bad'; children: ReactNode }) {
  const tones = {
    plain: 'bg-white ring-slate-200 dark:bg-slate-800 dark:ring-slate-700',
    good: 'bg-emerald-50 ring-emerald-200 text-emerald-900 dark:bg-emerald-500/10 dark:ring-emerald-500/30 dark:text-emerald-100',
    warn: 'bg-amber-50 ring-amber-200 text-amber-900 dark:bg-amber-500/10 dark:ring-amber-500/30 dark:text-amber-100',
    bad: 'bg-rose-50 ring-rose-200 text-rose-900 dark:bg-rose-500/10 dark:ring-rose-500/30 dark:text-rose-100',
  }
  return <div className={`rounded-2xl p-5 shadow-sm ring-1 ${tones[tone]}`}>{children}</div>
}

type Attempt = { kind: 'empty' } | { kind: 'error'; message: string } | { kind: 'ok'; solved: QuadraticSolved }

/** Solves what is typed, with the same exact solver the server uses, so the preview is what will be saved. */
function attempt(text: string): Attempt {
  if (!text.trim()) return { kind: 'empty' }
  try {
    return { kind: 'ok', solved: solveQuadraticPair(text) }
  } catch (err) {
    if (err instanceof QuadraticError) return { kind: 'error', message: err.message }
    return { kind: 'error', message: 'These equations could not be read.' }
  }
}

function SolutionView({ solution }: { solution: string }) {
  const parsed = useMemo(() => parseSolution(solution), [solution])
  return (
    <section aria-label="Step-by-step solution">
      <ol className="space-y-4">
        {parsed.steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            {step.label && <span className="mt-0.5 h-fit shrink-0 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">{step.label}</span>}
            <div className="min-w-0 flex-1 space-y-1 text-sm text-slate-800 dark:text-slate-200">
              {step.lines.map((line, j) => (
                <p key={j} className={`whitespace-pre-wrap ${j === 0 ? 'font-semibold' : ''}`}>
                  {line}
                </p>
              ))}
            </div>
          </li>
        ))}
      </ol>
      {parsed.tail.length > 0 && (
        <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-700/50 dark:text-slate-200">
          {parsed.tail.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}
    </section>
  )
}

export default function QuadraticBank() {
  const { user, loading } = useAuth()
  const [text, setText] = useState('')
  const deferred = useDeferredValue(text)
  const attempted = useMemo(() => attempt(deferred), [deferred])
  const [examName, setExamName] = useState('')
  const [examType, setExamType] = useState<ExamType>('General')
  const [year, setYear] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<QuadraticResult | null>(null)
  const [showAuth, setShowAuth] = useState(false)

  const [index, setIndex] = useState<QuestionIndexEntry[] | null>(null)
  const [shown, setShown] = useState(PAGE_SIZE)
  useEffect(() => {
    let cancelled = false
    loadIndex().then(
      (list) => !cancelled && setIndex(list),
      () => !cancelled && setIndex([]),
    )
    return () => {
      cancelled = true
    }
  }, [])

  const questions = useMemo(() => (index ?? []).filter((e) => e.topic === TOPIC), [index])
  const added = useMemo(() => questions.filter((e) => e.source === 'user').reverse(), [questions])
  const generated = useMemo(() => questions.filter((e) => e.source !== 'user'), [questions])
  const rows = useMemo(() => [...added, ...generated], [added, generated])
  const byId = useMemo(() => new Map(questions.map((e) => [e.id, e])), [questions])

  const needsVerification = !!user && user.usesPassword && !user.emailVerified
  const canSave = !!user && !needsVerification
  const ready = attempted.kind === 'ok' && text.trim() === deferred.trim()

  async function save() {
    if (attempted.kind !== 'ok' || busy) return
    setBusy(true)
    setResult(null)
    const yearNumber = year.trim() ? Number(year) : null
    const out = await submitQuadratic({ text: text.trim(), examName: examName.trim(), examType, year: yearNumber !== null && Number.isFinite(yearNumber) ? yearNumber : null })
    if (out.kind === 'added') {
      rememberAddedQuestion(out.entry, out.question)
      loadIndex().then(setIndex, () => {})
    }
    setBusy(false)
    setResult(out)
  }

  function reset() {
    setText('')
    setResult(null)
  }

  const existing = result?.kind === 'duplicate' ? byId.get(result.id) : undefined

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/maths" className="text-sm text-slate-400 hover:text-slate-600 dark:text-slate-500">
        ← Maths
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">Quadratic Equations · Question bank</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">
        Paste the two equations of a question. The answer and a full step-by-step solution are worked out exactly (no AI, so they are always right), the question is checked against every question already here, and it is saved for everyone to practise.
      </p>
      <p className="mt-2 text-sm">
        <Link to="/maths/quadratic-equations" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
          Practise with the Quadratic Equations game →
        </Link>
      </p>

      <div className="mt-6 space-y-5">
        <Card>
          <h2 className="text-sm font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">Add a question</h2>
          <label className="mt-3 block text-xs font-semibold text-slate-500 dark:text-slate-400">
            The two equations (one per line)
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setResult(null)
              }}
              rows={4}
              spellCheck={false}
              placeholder={EXAMPLE}
              className={`${fieldClass} mt-1 font-mono font-normal`}
            />
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="button" className={secondaryButton} onClick={() => setText(EXAMPLE)}>
              Use an example
            </button>
            <span className="text-xs text-slate-400 dark:text-slate-500">The instruction line and the five options (x &gt; y … x = y or relationship cannot be established) are added for you.</span>
          </div>
        </Card>

        {attempted.kind === 'error' && (
          <Card tone="warn">
            <p className="text-sm font-semibold">These equations cannot be solved yet</p>
            <p className="mt-1 text-sm">{attempted.message}</p>
          </Card>
        )}

        {attempted.kind === 'ok' && (
          <>
            <Card>
              <h2 className="text-sm font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">The question</h2>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{attempted.solved.stem.split('\n')[0]}</p>
              <div className="mt-2 space-y-1 font-mono text-base text-slate-900 dark:text-slate-100">
                <p>I. {attempted.solved.equations[0]}</p>
                <p>II. {attempted.solved.equations[1]}</p>
              </div>
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {attempted.solved.options.map((option, i) => (
                  <li
                    key={i}
                    className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${
                      i === attempted.solved.answerIndex ? 'bg-emerald-50 font-semibold text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/30' : 'bg-slate-50 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200'
                    }`}
                  >
                    <span className="font-bold">{LETTERS[i]}</span>
                    <span>{option}</span>
                    {i === attempted.solved.answerIndex && <span aria-label="Correct answer">✓</span>}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <DifficultyBadge difficulty={attempted.solved.difficulty} />
                <TagChip>Answer: {attempted.solved.options[attempted.solved.answerIndex]}</TagChip>
              </div>
            </Card>

            <Card>
              <h2 className="text-sm font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">Step-by-step solution</h2>
              <div className="mt-3">
                <SolutionView solution={attempted.solved.solution} />
              </div>
            </Card>

            <Card>
              <h2 className="text-sm font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">Tags (all optional)</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Exam name
                  <input value={examName} onChange={(e) => setExamName(e.target.value)} list="quad-exam-names" maxLength={60} placeholder="Unknown" className={`${fieldClass} mt-1 font-normal`} />
                  <datalist id="quad-exam-names">
                    {EXAM_NAME_SUGGESTIONS.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </label>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Exam type
                  <select value={examType} onChange={(e) => setExamType(e.target.value as ExamType)} className={`${fieldClass} mt-1 font-normal`}>
                    {EXAM_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t === 'General' ? 'Not sure / General' : t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Exam year
                  <input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="Unknown" className={`${fieldClass} mt-1 font-normal`} />
                </label>
              </div>
            </Card>

            {loading ? null : !user ? (
              <Card>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Sign in to save this question</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">You can check any equations without an account. An account is needed to save a question to the bank, so that it stays tidy.</p>
                <button type="button" onClick={() => setShowAuth(true)} className={`${primaryButton} mt-4`}>
                  Sign in or create an account
                </button>
              </Card>
            ) : needsVerification ? (
              <Card tone="warn">
                <p className="text-sm font-semibold">Verify your email address first</p>
                <p className="mt-1 text-sm">Open your account (top right) to resend the verification link, then come back to save this question.</p>
              </Card>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" disabled={busy || !ready || !canSave} onClick={() => void save()} className={primaryButton}>
                  {busy ? 'Saving…' : 'Save to the bank'}
                </button>
                <span className="text-sm text-slate-500 dark:text-slate-400">It is checked against every question already in the bank before it is saved.</span>
              </div>
            )}
          </>
        )}

        {result?.kind === 'added' && (
          <Card tone="good">
            <p className="font-semibold">Saved to the bank.</p>
            <p className="mt-1 text-sm">{result.listed ? 'It is in the list below and open for everyone to practise.' : 'It is saved. It may take a little while to show in the list.'}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to={playLink(result.id)} className={primaryButton}>
                Practise this question
              </Link>
              <button type="button" onClick={reset} className={secondaryButton}>
                Add another
              </button>
            </div>
          </Card>
        )}
        {result?.kind === 'duplicate' && (
          <Card tone="warn">
            <p className="font-semibold">This question is already in the bank.</p>
            <p className="mt-1 text-sm">These two equations (written any way, with the sides moved or scaled) match a question that is already saved, so nothing was added.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to={playLink(result.id)} className={primaryButton}>
                Open the existing question
              </Link>
              <button type="button" onClick={reset} className={secondaryButton}>
                Add a different one
              </button>
            </div>
            {existing && <p className="mt-3 truncate font-mono text-xs opacity-80">{existing.preview}</p>}
          </Card>
        )}
        {result && (result.kind === 'auth' || result.kind === 'try-later' || result.kind === 'invalid' || result.kind === 'unsolvable') && (
          <Card tone={result.kind === 'try-later' || result.kind === 'auth' ? 'warn' : 'bad'}>
            <p className="text-sm font-semibold">{result.message}</p>
            {result.kind === 'auth' && result.code === 'sign-in' && (
              <button type="button" onClick={() => setShowAuth(true)} className={`${primaryButton} mt-3`}>
                Sign in
              </button>
            )}
          </Card>
        )}

        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">Questions in the bank</h2>
            {index && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {questions.length} questions: {added.length} added by people, {generated.length} generated
              </span>
            )}
          </div>
          {index === null ? (
            <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">No quadratic questions yet.</p>
          ) : (
            <>
              <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-700">
                {rows.slice(0, shown).map((e) => (
                  <li key={e.id}>
                    <Link to={playLink(e.id)} className="flex items-start gap-3 rounded-lg px-1 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-700/40">
                      <span className="min-w-0 flex-1 truncate font-mono text-sm text-slate-800 dark:text-slate-200">{e.preview}</span>
                      {e.source === 'user' && <TagChip>Added</TagChip>}
                      <DifficultyBadge difficulty={e.difficulty} />
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {shown < rows.length && (
                  <button type="button" className={secondaryButton} onClick={() => setShown((n) => n + PAGE_SIZE)}>
                    Show more ({rows.length - shown} left)
                  </button>
                )}
                <Link to={`/quant/bank?topic=${TOPIC}`} className="text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
                  Filter, star and practise them in the Question Bank →
                </Link>
              </div>
            </>
          )}
        </Card>
      </div>

      {showAuth && (
        <Suspense fallback={null}>
          <AuthDialog onClose={() => setShowAuth(false)} />
        </Suspense>
      )}
    </div>
  )
}
