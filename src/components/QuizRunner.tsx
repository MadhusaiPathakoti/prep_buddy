import { useEffect, useRef, useState } from 'react'
import type { CheckResult, Question } from '../lib/types'
import { addSession } from '../lib/storage'

type Feedback = 'idle' | 'correct' | 'wrong'

interface ReviewItem {
  id: string
  prompt: string
  displayAnswer: string
  skipped: boolean
}

interface QuizRunnerProps {
  gameId: string
  questions: Question[]
  validate: (raw: string, answer: number) => CheckResult
  inputMode?: 'numeric' | 'decimal'
  answerHint?: string
  onExit: () => void
  onRestart: () => void
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const mm = Math.floor(totalSeconds / 60)
  const ss = totalSeconds % 60
  return `${mm}:${ss.toString().padStart(2, '0')}`
}

export default function QuizRunner({
  gameId,
  questions,
  validate,
  inputMode = 'numeric',
  answerHint,
  onExit,
  onRestart,
}: QuizRunnerProps) {
  const [index, setIndex] = useState(0)
  const [input, setInput] = useState('')
  const [correct, setCorrect] = useState(0)
  const [wrongAttempts, setWrongAttempts] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [feedback, setFeedback] = useState<Feedback>('idle')
  const [revealAnswer, setRevealAnswer] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)
  const [startTime] = useState(() => Date.now())
  const [elapsedMs, setElapsedMs] = useState(0)
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([])

  const inputRef = useRef<HTMLInputElement>(null)
  const savedRef = useRef(false)

  useEffect(() => {
    if (finished) return
    const id = setInterval(() => setElapsedMs(Date.now() - startTime), 250)
    return () => clearInterval(id)
  }, [finished, startTime])

  useEffect(() => {
    if (!finished && revealAnswer === null) {
      inputRef.current?.focus()
    }
  }, [index, finished, revealAnswer])

  useEffect(() => {
    if (finished && !savedRef.current) {
      savedRef.current = true
      addSession(gameId, {
        date: new Date().toISOString(),
        correct,
        wrongAttempts,
        skipped,
        total: questions.length,
        timeMs: elapsedMs,
      })
    }
  }, [finished, gameId, correct, wrongAttempts, skipped, questions.length, elapsedMs])

  const total = questions.length
  const current = questions[index]

  function recordMiss(skipped: boolean) {
    setReviewItems((items) =>
      items.some((i) => i.id === current.id)
        ? items
        : [...items, { id: current.id, prompt: current.prompt, displayAnswer: current.displayAnswer, skipped }],
    )
  }

  function advance() {
    setInput('')
    setFeedback('idle')
    setRevealAnswer(null)
    if (index + 1 >= total) {
      setFinished(true)
    } else {
      setIndex((i) => i + 1)
    }
  }

  function handleChange(raw: string) {
    if (feedback !== 'idle' || revealAnswer !== null) return
    // keep only digits and a single decimal point
    const cleaned = inputMode === 'decimal' ? raw.replace(/[^0-9.]/g, '') : raw.replace(/[^0-9]/g, '')
    setInput(cleaned)
    const result = validate(cleaned, current.answer)
    if (result === 'correct') {
      setFeedback('correct')
      setCorrect((c) => c + 1)
      setTimeout(advance, 260)
    } else if (result === 'wrong') {
      setFeedback('wrong')
      setWrongAttempts((w) => w + 1)
      recordMiss(false)
      setTimeout(() => {
        setInput('')
        setFeedback('idle')
      }, 380)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (feedback !== 'idle' || revealAnswer !== null || input.trim() === '') return
    const result = validate(input, current.answer)
    if (result === 'correct') {
      setFeedback('correct')
      setCorrect((c) => c + 1)
      setTimeout(advance, 260)
    } else {
      setFeedback('wrong')
      setWrongAttempts((w) => w + 1)
      recordMiss(false)
      setTimeout(() => {
        setInput('')
        setFeedback('idle')
      }, 380)
    }
  }

  function handleSkip() {
    if (revealAnswer !== null) return
    setSkipped((s) => s + 1)
    recordMiss(true)
    setRevealAnswer(current.displayAnswer)
    setTimeout(advance, 700)
  }

  if (finished) {
    const accuracy = total > 0 ? Math.round((correct / total) * 1000) / 10 : 0
    const avgMs = total > 0 ? elapsedMs / total : 0
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-2xl font-bold text-slate-900">Session complete</h2>
          <p className="mt-1 text-sm text-slate-500">Here's how you did.</p>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <Stat label="Accuracy" value={`${accuracy}%`} accent="text-indigo-600" />
            <Stat label="Time taken" value={formatTime(elapsedMs)} accent="text-slate-900" />
            <Stat label="Correct" value={String(correct)} accent="text-emerald-600" />
            <Stat label="Skipped" value={String(skipped)} accent="text-amber-600" />
            <Stat label="Mistakes" value={String(wrongAttempts)} accent="text-rose-600" />
            <Stat label="Avg / question" value={`${(avgMs / 1000).toFixed(1)}s`} accent="text-slate-900" />
          </div>

          {reviewItems.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-700">Review these</h3>
              <div className="mt-2 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-2xl bg-slate-50">
                {reviewItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="font-mono text-sm font-semibold text-slate-800">
                      {item.prompt} = {item.displayAnswer}
                    </span>
                    <span
                      className={[
                        'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
                        item.skipped ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700',
                      ].join(' ')}
                    >
                      {item.skipped ? 'Skipped' : 'Wrong'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3">
            <button
              onClick={onRestart}
              className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]"
            >
              Practice again
            </button>
            <button
              onClick={onExit}
              className="w-full rounded-xl bg-slate-100 px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-200 active:scale-[0.99]"
            >
              Change settings
            </button>
          </div>
        </div>
      </div>
    )
  }

  const progressPct = total > 0 ? (index / total) * 100 : 0

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <div className="mb-4 flex items-center justify-between text-sm text-slate-500">
        <span>
          Question <span className="font-semibold text-slate-700">{index + 1}</span> / {total}
        </span>
        <span className="font-mono tabular-nums">{formatTime(elapsedMs)}</span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="mt-4 flex justify-center gap-4 text-xs font-medium text-slate-500">
        <span className="text-emerald-600">✓ {correct}</span>
        <span className="text-amber-600">⏭ {skipped}</span>
        <span className="text-rose-600">✕ {wrongAttempts}</span>
      </div>

      <div
        className={[
          'mt-8 rounded-3xl bg-white p-10 text-center shadow-sm ring-1 transition-colors',
          feedback === 'correct' ? 'ring-emerald-400 animate-pop' : '',
          feedback === 'wrong' ? 'ring-rose-400 animate-shake' : '',
          feedback === 'idle' ? 'ring-slate-200' : '',
        ].join(' ')}
      >
        <div className="font-mono text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          {current.prompt}
          <span className="text-slate-300"> = </span>
        </div>

        {revealAnswer !== null ? (
          <div className="mt-6 text-2xl font-semibold text-amber-600">{revealAnswer}</div>
        ) : (
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            inputMode={inputMode === 'decimal' ? 'decimal' : 'numeric'}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={answerHint ?? '?'}
            className={[
              'mt-6 w-40 rounded-xl border-2 bg-slate-50 px-4 py-3 text-center font-mono text-3xl font-bold text-slate-900 outline-none transition-colors',
              feedback === 'correct' ? 'border-emerald-400 bg-emerald-50' : '',
              feedback === 'wrong' ? 'border-rose-400 bg-rose-50' : '',
              feedback === 'idle' ? 'border-slate-200 focus:border-indigo-400' : '',
            ].join(' ')}
          />
        )}
      </div>

      <div className="mt-6 flex justify-center">
        <button
          onClick={handleSkip}
          disabled={revealAnswer !== null}
          className="rounded-full bg-slate-100 px-6 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200 disabled:opacity-50"
        >
          Skip →
        </button>
      </div>

      <div className="mt-6 text-center">
        <button onClick={onExit} className="text-sm text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline">
          End session
        </button>
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className={`text-xl font-bold ${accent}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  )
}
