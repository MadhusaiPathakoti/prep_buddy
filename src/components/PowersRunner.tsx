import { useEffect, useRef, useState } from 'react'
import { formatAnswer, parseAnswer, powerText, type PowerQuestion } from '../lib/powers'
import { addSession } from '../lib/storage'
import { formatTime } from '../lib/format'
import Stat from './Stat'

export const POWERS_GAME_ID = 'powers'

type Outcome = 'correct' | 'wrong' | 'skipped'

interface Result {
  question: PowerQuestion
  /** What the player typed, or null when the question was skipped. */
  given: number | null
  outcome: Outcome
}

interface PowersRunnerProps {
  questions: PowerQuestion[]
  onExit: () => void
  onRestart: () => void
}

export default function PowersRunner({ questions, onExit, onRestart }: PowersRunnerProps) {
  const [index, setIndex] = useState(0)
  const [input, setInput] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  /** Set once the current question has been checked (or skipped); the answer is then shown until "Next". */
  const [checked, setChecked] = useState<Result | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const [finished, setFinished] = useState(false)
  const [startTime] = useState(() => Date.now())
  const [elapsedMs, setElapsedMs] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const savedRef = useRef(false)

  const total = questions.length
  const current = questions[index]
  const correct = results.filter((r) => r.outcome === 'correct').length
  const wrong = results.filter((r) => r.outcome === 'wrong').length
  const skipped = results.filter((r) => r.outcome === 'skipped').length

  useEffect(() => {
    if (finished) return
    const id = setInterval(() => setElapsedMs(Date.now() - startTime), 250)
    return () => clearInterval(id)
  }, [finished, startTime])

  useEffect(() => {
    if (!finished) inputRef.current?.focus()
  }, [index, finished])

  useEffect(() => {
    if (finished && !savedRef.current) {
      savedRef.current = true
      addSession(POWERS_GAME_ID, { date: new Date().toISOString(), correct, wrongAttempts: wrong, skipped, total, timeMs: elapsedMs })
    }
  }, [finished, correct, wrong, skipped, total, elapsedMs])

  function record(given: number | null, outcome: Outcome) {
    const result: Result = { question: current, given, outcome }
    setResults((list) => [...list, result])
    setChecked(result)
    setHint(null)
  }

  function check() {
    if (checked) return
    const given = parseAnswer(input)
    if (given === null) {
      setHint('Type your answer as a whole number.')
      return
    }
    record(given, given === current.answer ? 'correct' : 'wrong')
  }

  function skip() {
    if (checked) return
    record(null, 'skipped')
  }

  function next() {
    setChecked(null)
    setInput('')
    setHint(null)
    if (index + 1 >= total) setFinished(true)
    else setIndex((i) => i + 1)
  }

  /** Enter checks the answer, and once it is checked Enter moves on. A held key does not skip ahead. */
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || e.repeat) return
    e.preventDefault()
    if (checked) next()
    else check()
  }

  if (finished) {
    const accuracy = total > 0 ? Math.round((correct / total) * 1000) / 10 : 0
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 sm:p-8">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Session complete</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Every question, your answer and the correct one.</p>

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat label="Correct" value={`${correct} / ${total}`} accent="text-emerald-600 dark:text-emerald-400" />
            <Stat label="Accuracy" value={`${accuracy}%`} accent="text-indigo-600 dark:text-indigo-400" />
            <Stat label="Time taken" value={formatTime(elapsedMs)} accent="text-slate-900 dark:text-slate-100" />
            <Stat label="Wrong" value={String(wrong)} accent="text-rose-600 dark:text-rose-400" />
            <Stat label="Skipped" value={String(skipped)} accent="text-amber-600 dark:text-amber-400" />
            <Stat label="Avg / question" value={`${total > 0 ? (elapsedMs / total / 1000).toFixed(1) : '0.0'}s`} accent="text-slate-900 dark:text-slate-100" />
          </div>

          <h3 className="mt-8 text-sm font-semibold text-slate-700 dark:text-slate-300">All questions</h3>
          <div className="mt-2 overflow-hidden rounded-2xl ring-1 ring-slate-200 dark:ring-slate-700">
            <div className="grid grid-cols-[2rem_1fr_1fr_1fr_2rem] gap-2 bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-700 dark:text-slate-300 sm:grid-cols-[2.5rem_1fr_1fr_1fr_2.5rem]">
              <span>#</span>
              <span>Question</span>
              <span>Your answer</span>
              <span>Correct</span>
              <span />
            </div>
            <ol className="divide-y divide-slate-100 dark:divide-slate-700">
              {results.map((r, i) => (
                <li
                  key={r.question.id}
                  className={[
                    'grid grid-cols-[2rem_1fr_1fr_1fr_2rem] items-center gap-2 px-3 py-2 text-sm sm:grid-cols-[2.5rem_1fr_1fr_1fr_2.5rem]',
                    r.outcome === 'correct' ? 'bg-emerald-50/60 dark:bg-emerald-500/5' : r.outcome === 'wrong' ? 'bg-rose-50/60 dark:bg-rose-500/5' : 'bg-amber-50/60 dark:bg-amber-500/5',
                  ].join(' ')}
                >
                  <span className="text-slate-400 dark:text-slate-500">{i + 1}</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                    {powerText(r.question.base, r.question.exp)}
                  </span>
                  <span
                    className={[
                      'font-mono',
                      r.outcome === 'correct' ? 'text-emerald-700 dark:text-emerald-300' : r.outcome === 'wrong' ? 'text-rose-700 line-through dark:text-rose-300' : 'text-amber-700 dark:text-amber-300',
                    ].join(' ')}
                  >
                    {r.given === null ? 'skipped' : formatAnswer(r.given)}
                  </span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{formatAnswer(r.question.answer)}</span>
                  <span aria-label={r.outcome} className={r.outcome === 'correct' ? 'text-emerald-600 dark:text-emerald-400' : r.outcome === 'wrong' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}>
                    {r.outcome === 'correct' ? '✓' : r.outcome === 'wrong' ? '✕' : '⏭'}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-8 flex flex-col gap-3">
            <button
              onClick={onRestart}
              className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]"
            >
              Practice again
            </button>
            <button
              onClick={onExit}
              className="w-full rounded-xl bg-slate-100 dark:bg-slate-700 px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 active:scale-[0.99]"
            >
              Change settings
            </button>
          </div>
        </div>
      </div>
    )
  }

  const progressPct = total > 0 ? (index / total) * 100 : 0
  const feedback = checked?.outcome ?? 'idle'

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <div className="mb-4 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <span>
          Question <span className="font-semibold text-slate-700 dark:text-slate-300">{index + 1}</span> / {total}
        </span>
        <span className="font-mono tabular-nums">{formatTime(elapsedMs)}</span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-600">
        <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="mt-4 flex justify-center gap-4 text-xs font-medium">
        <span className="text-emerald-600 dark:text-emerald-400">✓ {correct}</span>
        <span className="text-amber-600 dark:text-amber-400">⏭ {skipped}</span>
        <span className="text-rose-600 dark:text-rose-400">✕ {wrong}</span>
      </div>

      <div
        className={[
          'mt-8 rounded-3xl bg-white p-8 text-center shadow-sm ring-1 transition-colors dark:bg-slate-800 sm:p-10',
          feedback === 'correct' ? 'ring-emerald-400 animate-pop' : '',
          feedback === 'wrong' ? 'ring-rose-400 animate-shake' : '',
          feedback === 'skipped' ? 'ring-amber-400' : '',
          feedback === 'idle' ? 'ring-slate-200 dark:ring-slate-700' : '',
        ].join(' ')}
      >
        <div className="font-mono text-5xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-6xl">
          {current.base}
          <sup className="ml-0.5 text-3xl text-indigo-500 dark:text-indigo-400 sm:text-4xl">{current.exp}</sup>
          <span className="text-slate-300 dark:text-slate-600"> = </span>
          <span className="text-indigo-500 dark:text-indigo-400">_</span>
        </div>
        <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">
          {current.base} to the power {current.exp}
        </p>

        <input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            if (checked) return
            setInput(e.target.value.replace(/[^\d,]/g, '').slice(0, 14))
            setHint(null)
          }}
          onKeyDown={onKeyDown}
          readOnly={checked !== null}
          inputMode="numeric"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Your answer"
          aria-label={`${current.base} to the power ${current.exp}`}
          className={[
            'mt-6 w-full max-w-[16rem] rounded-xl border-2 bg-slate-50 px-4 py-3 text-center font-mono text-3xl font-bold text-slate-900 outline-none transition-colors dark:bg-slate-800 dark:text-slate-100',
            feedback === 'correct' ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' : '',
            feedback === 'wrong' ? 'border-rose-400 bg-rose-50 dark:bg-rose-500/10' : '',
            feedback === 'skipped' ? 'border-amber-400 bg-amber-50 dark:bg-amber-500/10' : '',
            feedback === 'idle' ? 'border-slate-200 focus:border-indigo-400 dark:border-slate-700' : '',
          ].join(' ')}
        />

        <div className="mt-4 min-h-[3.5rem]" aria-live="polite">
          {hint && <p className="text-sm font-medium text-amber-600 dark:text-amber-400">{hint}</p>}
          {checked?.outcome === 'correct' && <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">✓ Correct!</p>}
          {checked?.outcome === 'wrong' && (
            <>
              <p className="text-lg font-bold text-rose-600 dark:text-rose-400">✕ Wrong</p>
              <p className="text-base text-slate-600 dark:text-slate-300">
                {powerText(current.base, current.exp)} = <span className="font-mono text-lg font-bold text-slate-900 dark:text-slate-100">{formatAnswer(current.answer)}</span>
              </p>
            </>
          )}
          {checked?.outcome === 'skipped' && (
            <>
              <p className="text-lg font-bold text-amber-600 dark:text-amber-400">Skipped</p>
              <p className="text-base text-slate-600 dark:text-slate-300">
                {powerText(current.base, current.exp)} = <span className="font-mono text-lg font-bold text-slate-900 dark:text-slate-100">{formatAnswer(current.answer)}</span>
              </p>
            </>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-center gap-3">
        {checked ? (
          <button
            onClick={next}
            className="rounded-full bg-indigo-600 px-8 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]"
          >
            {index + 1 >= total ? 'See results' : 'Next →'} <span className="text-indigo-200">(Enter)</span>
          </button>
        ) : (
          <>
            <button
              onClick={check}
              disabled={input.trim() === ''}
              className="rounded-full bg-indigo-600 px-8 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Check <span className="text-indigo-200">(Enter)</span>
            </button>
            <button
              onClick={skip}
              className="rounded-full bg-slate-100 px-6 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300"
            >
              Skip →
            </button>
          </>
        )}
      </div>

      <div className="mt-6 text-center">
        <button onClick={onExit} className="text-sm text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline dark:text-slate-500">
          End session
        </button>
      </div>
    </div>
  )
}
