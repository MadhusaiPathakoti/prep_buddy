import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DifficultyBadge, TagChip } from '../../components/qbank/QuestionBadges'
import { useAuth } from '../../lib/authContext'
import { readScreenshot, submitQuestion, suggestOptions } from '../../lib/qbank/addApi'
import type { AddResult } from '../../lib/qbank/addApi'
import { loadIndex, rememberAddedQuestion } from '../../lib/qbank/store'
import { bankTopicLabel, EXAM_NAME_SUGGESTIONS, EXAM_TYPES } from '../../lib/qbank/types'
import type { ExamType, QuestionIndexEntry } from '../../lib/qbank/types'
import { ACCEPTED_TYPES } from '../../lib/puzzleSolver/ocrApi'

const AuthDialog = lazy(() => import('../../components/AuthDialog'))

const LETTERS = 'ABCDE'
const STEM_MIN = 15
const STEM_MAX = 1200
const OPTION_MAX = 200

const fieldClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-indigo-900'
const secondaryButton =
  'rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700'
const primaryButton = 'rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50'

function Card({ tone = 'plain', children }: { tone?: 'plain' | 'good' | 'warn' | 'bad'; children: ReactNode }) {
  const tones = {
    plain: 'bg-white ring-slate-200 dark:bg-slate-800 dark:ring-slate-700',
    good: 'bg-emerald-50 ring-emerald-200 text-emerald-900 dark:bg-emerald-500/10 dark:ring-emerald-500/30 dark:text-emerald-100',
    warn: 'bg-amber-50 ring-amber-200 text-amber-900 dark:bg-amber-500/10 dark:ring-amber-500/30 dark:text-amber-100',
    bad: 'bg-rose-50 ring-rose-200 text-rose-900 dark:bg-rose-500/10 dark:ring-rose-500/30 dark:text-rose-100',
  }
  return <div className={`rounded-2xl p-5 shadow-sm ring-1 ${tones[tone]}`}>{children}</div>
}

/** Why the form cannot be sent yet, in words, or null when it can. Mirrors what the server checks. */
function problemWith(stem: string, options: string[]): string | null {
  const s = stem.trim()
  if (s.length < STEM_MIN) return `Type the whole question (at least ${STEM_MIN} characters).`
  if (s.length > STEM_MAX) return `The question is too long (${STEM_MAX} characters at most).`
  const cleaned = options.map((o) => o.trim())
  if (cleaned.some((o) => !o)) return 'Fill in every option, or remove the empty one.'
  if (cleaned.some((o) => o.length > OPTION_MAX)) return `An option is too long (${OPTION_MAX} characters at most).`
  if (new Set(cleaned.map((o) => o.toLowerCase().replace(/\s+/g, ''))).size !== cleaned.length) return 'Two options are the same.'
  return null
}

export default function AddQuestion() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)

  const [stem, setStem] = useState('')
  const [options, setOptions] = useState(['', '', '', ''])
  const [answer, setAnswer] = useState<number | null>(null)
  const [examName, setExamName] = useState('')
  const [examType, setExamType] = useState<ExamType>('General')
  const [year, setYear] = useState('')
  const [busy, setBusy] = useState<null | 'reading' | 'adding' | 'suggesting'>(null)
  const [result, setResult] = useState<AddResult | null>(null)
  const [existing, setExisting] = useState<QuestionIndexEntry | null>(null)
  const [shotNote, setShotNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [optionsNote, setOptionsNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [dragging, setDragging] = useState(false)

  const needsVerification = !!user && user.usesPassword && !user.emailVerified
  const canUseForm = !!user && !needsVerification

  async function readFile(file: File) {
    setBusy('reading')
    setShotNote(null)
    setResult(null)
    const out = await readScreenshot(file)
    setBusy(null)
    if (!out.ok) {
      setShotNote({ ok: false, text: out.error })
      return
    }
    setStem(out.stem)
    const read = out.options.slice(0, 5)
    while (read.length < 4) read.push('')
    setOptions(read)
    setAnswer(null)
    setOptionsNote(null)
    setShotNote({ ok: true, text: 'Read from your picture (the picture itself is not kept). Check every number, fraction and power carefully before adding.' })
    if (out.generated) {
      setOptionsNote({ ok: true, text: 'The picture showed only the question, so five options were suggested. None is marked as correct: check them. The two solvers still work out the answer on their own, and a question whose options lack the right answer is refused.' })
    } else if (out.note) {
      setOptionsNote({ ok: false, text: out.note })
    } else if (out.options.length > 0 && out.options.length < 4) {
      setOptionsNote({ ok: false, text: `Only ${out.options.length} option${out.options.length === 1 ? ' was' : 's were'} found in the picture. Fill in the rest, or clear them and use "Suggest options".` })
    }
  }

  /** Asks for five suggested options for the question typed so far. */
  async function suggest() {
    if (busy) return
    if (options.some((o) => o.trim()) && !window.confirm('Replace the options you have typed with suggested ones?')) return
    setBusy('suggesting')
    setOptionsNote(null)
    setResult(null)
    const out = await suggestOptions(stem.trim())
    setBusy(null)
    if (!out.ok) {
      setOptionsNote({ ok: false, text: out.error })
      return
    }
    setOptions(out.options.slice(0, 5))
    setAnswer(null)
    setOptionsNote({ ok: true, text: 'Five options were suggested. None is marked as correct: check them. The two solvers still work out the answer on their own.' })
  }

  /** The solvers' answer was not among the options: put it in place of the last option so the person can add the question. */
  function putComputedInOptions(value: string) {
    setOptions((list) => list.map((o, k) => (k === list.length - 1 ? value : o)))
    setAnswer((a) => (a === options.length - 1 ? null : a))
    setOptionsNote({ ok: true, text: `Option ${letter(options.length - 1)} was replaced with the solvers' answer. Check the other options, then press Add question again.` })
    setResult(null)
  }

  // Ctrl+V with an image on the clipboard reads it, like choosing a file.
  useEffect(() => {
    if (!canUseForm) return
    function onPaste(event: ClipboardEvent) {
      const file = [...(event.clipboardData?.files ?? [])].find((f) => ACCEPTED_TYPES.includes(f.type))
      if (!file || busy) return
      event.preventDefault()
      void readFile(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  async function submit(extra: { allowSimilar?: boolean; answerOverride?: number } = {}) {
    const problem = problemWith(stem, options)
    if (problem) {
      setResult({ kind: 'invalid', message: problem })
      return
    }
    const marked = extra.answerOverride ?? answer
    if (extra.answerOverride !== undefined) setAnswer(extra.answerOverride)
    setBusy('adding')
    setResult(null)
    setExisting(null)
    const yearNumber = year.trim() ? Number(year) : null
    const out = await submitQuestion({
      stem: stem.trim(),
      options: options.map((o) => o.trim()),
      answer: marked,
      examName: examName.trim(),
      examType,
      year: yearNumber !== null && Number.isFinite(yearNumber) ? yearNumber : null,
      allowSimilar: extra.allowSimilar,
    })
    if (out.kind === 'added') rememberAddedQuestion(out.entry, out.question)
    if (out.kind === 'duplicate' || out.kind === 'similar') {
      const list = await loadIndex().catch(() => [])
      setExisting(list.find((e) => e.id === out.id) ?? null)
    }
    setBusy(null)
    setResult(out)
  }

  function reset() {
    setStem('')
    setOptions(['', '', '', ''])
    setAnswer(null)
    setExamName('')
    setExamType('General')
    setYear('')
    setResult(null)
    setExisting(null)
    setShotNote(null)
    setOptionsNote(null)
  }

  const setOption = (i: number, value: string) => setOptions((list) => list.map((o, k) => (k === i ? value : o)))
  const letter = (i: number) => LETTERS[i] ?? '?'

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/quant/bank" className="text-sm text-slate-400 hover:text-slate-600 dark:text-slate-500">
        ← Question bank
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">Add a question</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">
        Add a Quant multiple-choice question for everyone to practise. It is checked for duplicates, solved and cross-checked by two AI solvers, and published straight away. You do not need to know the answer.
      </p>

      {loading ? (
        <p className="py-16 text-center text-slate-400 dark:text-slate-500">Loading…</p>
      ) : !user ? (
        <div className="mt-6">
          <Card>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Sign in to add questions</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Anyone can browse and play without an account. An account is needed to add questions, so that the bank stays tidy.</p>
            <button type="button" onClick={() => setShowAuth(true)} className={`${primaryButton} mt-4`}>
              Sign in or create an account
            </button>
          </Card>
        </div>
      ) : needsVerification ? (
        <div className="mt-6">
          <Card tone="warn">
            <h2 className="text-lg font-bold">Verify your email first</h2>
            <p className="mt-1 text-sm">We sent a link to {user.email}. Open it, then come back. Open your account to resend the link or to refresh after verifying.</p>
            <button type="button" onClick={() => setShowAuth(true)} className={`${secondaryButton} mt-4`}>
              Open my account
            </button>
          </Card>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          <Card>
            <h2 className="text-sm font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">Have a screenshot?</h2>
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                const file = e.dataTransfer.files[0]
                if (file && !busy) void readFile(file)
              }}
              className={`mt-3 rounded-xl border-2 border-dashed px-4 py-5 text-center text-sm transition ${dragging ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' : 'border-slate-300 dark:border-slate-600'}`}
            >
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPTED_TYPES.join(',')}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file && !busy) void readFile(file)
                }}
              />
              <button type="button" disabled={busy !== null} onClick={() => fileInput.current?.click()} className={secondaryButton}>
                {busy === 'reading' ? 'Reading the picture…' : 'Choose a screenshot'}
              </button>
              <p className="mt-2 text-slate-500 dark:text-slate-400">or paste an image (Ctrl+V) or drop it here. The text is read for you to check; the picture is never stored.</p>
            </div>
            {shotNote && <p className={`mt-3 text-sm ${shotNote.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>{shotNote.text}</p>}
          </Card>

          <Card>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Question
              <textarea
                value={stem}
                onChange={(e) => setStem(e.target.value)}
                rows={5}
                maxLength={STEM_MAX + 200}
                placeholder="Type or paste the whole question. Write fractions as 3/4, powers like 5² or 5^2, roots as √81."
                className={`${fieldClass} mt-1 font-normal`}
              />
            </label>
            <p className="mt-1 text-right text-xs text-slate-400 dark:text-slate-500">
              {stem.trim().length} / {STEM_MAX}
            </p>

            <div className="mt-3 space-y-2" role="group" aria-label="Answer options">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Options</p>
              {options.map((option, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">{letter(i)}</span>
                  <input value={option} onChange={(e) => setOption(i, e.target.value)} maxLength={OPTION_MAX + 50} aria-label={`Option ${letter(i)}`} className={fieldClass} />
                  <button
                    type="button"
                    aria-pressed={answer === i}
                    title="Mark this as the correct answer"
                    onClick={() => setAnswer(answer === i ? null : i)}
                    className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                      answer === i ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'border-slate-300 text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700'
                    }`}
                  >
                    {answer === i ? '✓ Correct' : 'Correct?'}
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" disabled={busy !== null || stem.trim().length < 15} onClick={() => void suggest()} className={secondaryButton} title={stem.trim().length < 15 ? 'Type the question first' : 'Let AI write five options for this question'}>
                  {busy === 'suggesting' ? 'Suggesting options…' : '✨ Suggest options'}
                </button>
                {options.length < 5 && (
                  <button type="button" onClick={() => setOptions((list) => [...list, ''])} className={secondaryButton}>
                    + Add option E
                  </button>
                )}
                {options.length > 4 && (
                  <button
                    type="button"
                    onClick={() => {
                      setOptions((list) => list.slice(0, 4))
                      if (answer === 4) setAnswer(null)
                    }}
                    className={secondaryButton}
                  >
                    Remove option E
                  </button>
                )}
              </div>
              {optionsNote && <p className={`text-sm ${optionsNote.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>{optionsNote.text}</p>}
              <p className="text-xs text-slate-400 dark:text-slate-500">Marking the correct option is optional. If you do, the AI solvers must agree with you before the question is published.</p>
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">Tags (all optional)</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                Exam name
                <input value={examName} onChange={(e) => setExamName(e.target.value)} list="exam-names" maxLength={60} placeholder="Unknown" className={`${fieldClass} mt-1 font-normal`} />
                <datalist id="exam-names">
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
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">The topic and difficulty are set automatically. Anything you leave blank is filed as Unknown.</p>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={busy !== null} onClick={() => void submit()} className={primaryButton}>
              {busy === 'adding' ? 'Checking…' : 'Add question'}
            </button>
            {busy === 'adding' && <span className="text-sm text-slate-500 dark:text-slate-400">Checking for duplicates, solving and cross-checking. This can take up to a minute.</span>}
          </div>

          {result && <ResultPanel result={result} existing={existing} onPlay={(id) => navigate(`/quant/bank/q/${id}`)} onAddAnother={reset} onAddAnyway={() => void submit({ allowSimilar: true })} onUseAnswer={(index) => void submit({ answerOverride: index })} lastLetter={letter(options.length - 1)} onUseComputed={putComputedInOptions} onSuggest={() => void suggest()} onDismiss={() => setResult(null)} onSignIn={() => setShowAuth(true)} busy={busy !== null} />}
        </div>
      )}

      {showAuth && (
        <Suspense fallback={null}>
          <AuthDialog onClose={() => setShowAuth(false)} />
        </Suspense>
      )}
    </div>
  )
}

interface ResultPanelProps {
  result: AddResult
  existing: QuestionIndexEntry | null
  busy: boolean
  onPlay: (id: string) => void
  onAddAnother: () => void
  onAddAnyway: () => void
  onUseAnswer: (index: number) => void
  lastLetter: string
  onUseComputed: (value: string) => void
  onSuggest: () => void
  onDismiss: () => void
  onSignIn: () => void
}

function ResultPanel({ result, existing, busy, onPlay, onAddAnother, onAddAnyway, onUseAnswer, lastLetter, onUseComputed, onSuggest, onDismiss, onSignIn }: ResultPanelProps) {
  const existingCard = existing && (
    <div className="mt-3 rounded-xl bg-white/70 p-3 text-sm text-slate-800 dark:bg-slate-900/40 dark:text-slate-100">
      <p className="line-clamp-3 font-medium">{existing.preview}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <DifficultyBadge difficulty={existing.difficulty} />
        <TagChip>{bankTopicLabel(existing.topic)}</TagChip>
      </div>
    </div>
  )

  switch (result.kind) {
    case 'added':
      return (
        <Card tone="good">
          <h2 className="text-lg font-bold">Added. Thank you!</h2>
          <p className="mt-1 text-sm">
            Filed under {bankTopicLabel(result.entry.topic)} · {result.entry.difficulty}. Both AI solvers agreed on the answer, and the step-by-step solution is saved with it.
            {!result.listed && ' It may take a little while to show up in the list.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => onPlay(result.id)} className={primaryButton}>
              Play it now
            </button>
            <button type="button" onClick={onAddAnother} className={secondaryButton}>
              Add another
            </button>
          </div>
        </Card>
      )
    case 'duplicate':
      return (
        <Card tone="warn">
          <h2 className="text-lg font-bold">This question is already in the bank</h2>
          <p className="mt-1 text-sm">The same question (with the same options) has already been added, so nothing was saved.</p>
          {existingCard}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => onPlay(result.id)} className={primaryButton}>
              Open the existing question
            </button>
            <button type="button" onClick={onAddAnother} className={secondaryButton}>
              Add a different one
            </button>
          </div>
        </Card>
      )
    case 'similar':
      return (
        <Card tone="warn">
          <h2 className="text-lg font-bold">A very similar question is already in the bank</h2>
          <p className="mt-1 text-sm">It uses the same numbers and almost the same words. If yours asks something different, you can still add it.</p>
          {existingCard}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => onPlay(result.id)} className={secondaryButton}>
              Open the existing question
            </button>
            <button type="button" disabled={busy} onClick={onAddAnyway} className={primaryButton}>
              It is different, add it anyway
            </button>
          </div>
        </Card>
      )
    case 'key-mismatch':
      return (
        <Card tone="warn">
          <h2 className="text-lg font-bold">The solvers got a different answer</h2>
          <p className="mt-1 text-sm">
            You marked option {letterOf(result.yourAnswer)}, but both AI solvers worked out option {letterOf(result.aiAnswer)}. Please re-check the question and the options for typing mistakes (a misread number is the usual cause).
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={onDismiss} className={primaryButton}>
              I will check it
            </button>
            <button type="button" disabled={busy} onClick={() => onUseAnswer(result.aiAnswer)} className={secondaryButton}>
              The solvers are right: use option {letterOf(result.aiAnswer)}
            </button>
          </div>
        </Card>
      )
    case 'auth':
      return (
        <Card tone="warn">
          <p className="text-sm font-medium">{result.message}</p>
          <button type="button" onClick={onSignIn} className={`${secondaryButton} mt-3`}>
            {result.code === 'sign-in' ? 'Sign in' : 'Open my account'}
          </button>
        </Card>
      )
    case 'rejected':
      return (
        <Card tone="bad">
          <h2 className="text-lg font-bold">This question could not be added</h2>
          <p className="mt-1 text-sm">{result.message}</p>
        </Card>
      )
    case 'no-matching-option':
      return (
        <Card tone="warn">
          <h2 className="text-lg font-bold">None of your options is the answer</h2>
          <p className="mt-1 text-sm">
            {result.computed ? (
              <>
                The AI solvers worked the question out and got <strong>{result.computed}</strong>, which is not one of your options.
              </>
            ) : (
              'The AI solvers worked the question out, but their answer is not one of your options.'
            )}{' '}
            Fix the options (a typing mistake is the usual cause), or let the AI write a correct set.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {result.computed && (
              <button type="button" disabled={busy} onClick={() => onUseComputed(result.computed)} className={primaryButton}>
                Replace option {lastLetter} with “{result.computed}”
              </button>
            )}
            <button type="button" disabled={busy} onClick={onSuggest} className={secondaryButton}>
              ✨ Write new options
            </button>
            <button type="button" onClick={onDismiss} className={secondaryButton}>
              I will fix them
            </button>
          </div>
        </Card>
      )
    case 'try-later':
      return (
        <Card tone="warn">
          <h2 className="text-lg font-bold">Please try again later</h2>
          <p className="mt-1 text-sm">{result.message} Your text is still here.</p>
        </Card>
      )
    case 'invalid':
      return (
        <Card tone="bad">
          <p className="text-sm font-medium">{result.message}</p>
        </Card>
      )
  }
}

const letterOf = (i: number) => LETTERS[i] ?? '?'
