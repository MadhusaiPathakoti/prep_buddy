import { useEffect, useRef, useState } from 'react'
import { addSession } from '../lib/storage'
import { formatTime } from '../lib/format'
import { NO_ERROR, type ErrorDetectionAnswer, type ErrorDetectionQuestion } from '../lib/errorDetection'
import Stat from './Stat'

interface ErrorDetectionResult {
  id: string
  topic: string
  parts: string[]
  correctAnswer: ErrorDetectionAnswer
  explanation: string
  selectedAnswer: ErrorDetectionAnswer | null
  correct: boolean
  timedOut: boolean
  points: number
}

interface ErrorDetectionRunnerProps {
  questions: ErrorDetectionQuestion[]
  onExit: () => void
  onRestart: () => void
}

const TICK_MS = 100
const CHOICES: { answer: ErrorDetectionAnswer; label: string }[] = [
  { answer: 0, label: '(a)' },
  { answer: 1, label: '(b)' },
  { answer: 2, label: '(c)' },
  { answer: 3, label: '(d)' },
  { answer: NO_ERROR, label: '(e) No error' },
]

function describeAnswer(answer: ErrorDetectionAnswer | null): string {
  if (answer === null) return 'No answer — time ran out'
  if (answer === NO_ERROR) return 'No error'
  return `Part (${'abcd'[answer]})`
}

export default function ErrorDetectionRunner({ questions, onExit, onRestart }: ErrorDetectionRunnerProps) {
  const [index, setIndex] = useState(0)
  const [remainingMs, setRemainingMs] = useState(() => questions[0].timeLimitSec * 1000)
  const [locked, setLocked] = useState(false)
  const [selected, setSelected] = useState<ErrorDetectionAnswer | null>(null)
  const [results, setResults] = useState<ErrorDetectionResult[]>([])
  const [finished, setFinished] = useState(false)
  const [startTime] = useState(() => Date.now())
  const [elapsedMs, setElapsedMs] = useState(0)

  const lockedRef = useRef(false)
  const savedRef = useRef(false)

  const total = questions.length
  const current = questions[index]

  useEffect(() => {
    if (finished) return
    const id = setInterval(() => setElapsedMs(Date.now() - startTime), 250)
    return () => clearInterval(id)
  }, [finished, startTime])

  useEffect(() => {
    if (finished) return
    setRemainingMs(current.timeLimitSec * 1000)
    setSelected(null)
    setLocked(false)
    lockedRef.current = false

    const id = setInterval(() => {
      setRemainingMs((ms) => {
        if (lockedRef.current) return ms
        const next = ms - TICK_MS
        if (next <= 0) {
          clearInterval(id)
          submit(null, 0)
          return 0
        }
        return next
      })
    }, TICK_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, finished])

  useEffect(() => {
    if (finished && !savedRef.current) {
      savedRef.current = true
      const correctCount = results.filter((r) => r.correct).length
      const timedOutCount = results.filter((r) => r.timedOut).length
      const wrongCount = results.length - correctCount - timedOutCount
      addSession('error-detection', {
        date: new Date().toISOString(),
        correct: correctCount,
        wrongAttempts: wrongCount,
        skipped: timedOutCount,
        total: questions.length,
        timeMs: elapsedMs,
      })
    }
  }, [finished, results, questions.length, elapsedMs])

  function submit(answer: ErrorDetectionAnswer | null, remainingAtSubmit: number) {
    if (lockedRef.current) return
    lockedRef.current = true
    setLocked(true)
    setSelected(answer)

    const timeLimitMs = current.timeLimitSec * 1000
    const correct = answer !== null && answer === current.correctAnswer
    const timedOut = answer === null
    const points = correct ? 50 + Math.round(50 * (Math.max(0, remainingAtSubmit) / timeLimitMs)) : 0

    setResults((prev) => [
      ...prev,
      {
        id: current.id,
        topic: current.topic,
        parts: current.parts,
        correctAnswer: current.correctAnswer,
        explanation: current.explanation,
        selectedAnswer: answer,
        correct,
        timedOut,
        points,
      },
    ])

    setTimeout(
      () => {
        if (index + 1 >= total) {
          setFinished(true)
        } else {
          setIndex((i) => i + 1)
        }
      },
      timedOut ? 1100 : 700,
    )
  }

  if (finished) {
    const correctCount = results.filter((r) => r.correct).length
    const timedOutCount = results.filter((r) => r.timedOut).length
    const wrongCount = results.length - correctCount - timedOutCount
    const accuracy = total > 0 ? Math.round((correctCount / total) * 1000) / 10 : 0
    const score = results.reduce((sum, r) => sum + r.points, 0)
    const avgMs = total > 0 ? elapsedMs / total : 0

    const toReview = results.filter((r) => !r.correct)
    const toCelebrate = results.filter((r) => r.correct)

    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-3xl bg-white dark:bg-slate-800 p-8 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Session complete</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Score rewards both getting it right and getting it right fast.</p>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <Stat label="Score" value={String(score)} accent="text-indigo-600 dark:text-indigo-400" />
            <Stat label="Accuracy" value={`${accuracy}%`} accent="text-slate-900 dark:text-slate-100" />
            <Stat label="Correct" value={String(correctCount)} accent="text-emerald-600 dark:text-emerald-400" />
            <Stat label="Wrong" value={String(wrongCount)} accent="text-rose-600 dark:text-rose-400" />
            <Stat label="Timed out" value={String(timedOutCount)} accent="text-amber-600 dark:text-amber-400" />
            <Stat label="Avg / question" value={`${(avgMs / 1000).toFixed(1)}s`} accent="text-slate-900 dark:text-slate-100" />
          </div>

          {(toReview.length > 0 || toCelebrate.length > 0) && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Review these — with explanations</h3>
              <div className="mt-2 max-h-96 divide-y divide-slate-100 dark:divide-slate-700 overflow-y-auto rounded-2xl bg-slate-50 dark:bg-slate-800">
                {[...toReview, ...toCelebrate].map((r) => (
                  <div key={r.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{r.topic}</span>
                      <span
                        className={[
                          'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
                          r.correct ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : r.timedOut ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300',
                        ].join(' ')}
                      >
                        {r.correct ? 'Correct' : r.timedOut ? 'Timed out' : 'Wrong'}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                      {r.parts.map((p, i) => (
                        <span key={i} className={i === r.correctAnswer ? 'font-semibold text-rose-600 dark:text-rose-400 underline decoration-rose-300' : ''}>
                          {p}{' '}
                        </span>
                      ))}
                    </p>
                    <p className="mt-1 text-xs italic text-slate-400 dark:text-slate-500">
                      Correct answer: {describeAnswer(r.correctAnswer)} · Your answer: {describeAnswer(r.selectedAnswer)}
                    </p>
                    <p className="mt-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 px-3 py-2 text-xs leading-relaxed text-indigo-800 dark:text-indigo-200">{r.explanation}</p>
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
  const timeLimitMs = current.timeLimitSec * 1000
  const timeFraction = remainingMs / timeLimitMs
  const urgent = timeFraction <= 0.2

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <span>
          Question <span className="font-semibold text-slate-700 dark:text-slate-300">{index + 1}</span> / {total}
        </span>
        <span className={['font-mono tabular-nums font-semibold', urgent ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'].join(' ')}>
          {Math.ceil(remainingMs / 1000)}s
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-600">
        <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div
          className={['h-full rounded-full transition-all duration-100 linear', urgent ? 'bg-rose-500' : 'bg-amber-400'].join(' ')}
          style={{ width: `${Math.max(0, timeFraction) * 100}%` }}
        />
      </div>

      <div className="mt-6 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
        <span className="text-xs font-semibold uppercase tracking-wide text-indigo-500">{current.topic}</span>
        <p className="mt-3 text-base leading-relaxed text-slate-900 dark:text-slate-100">
          {current.parts.map((p, i) => (
            <span key={i}>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">({'abcd'[i]})</span> {p}{' '}
            </span>
          ))}
        </p>
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">Which part has the grammatical error — or is the sentence correct as it stands?</p>

        <div className="mt-5 flex flex-col gap-2.5">
          {CHOICES.map((choice) => {
            const isSelected = selected === choice.answer
            const isCorrectAnswer = choice.answer === current.correctAnswer
            const showAsCorrect = locked && isCorrectAnswer
            const showAsWrong = locked && isSelected && !isCorrectAnswer
            return (
              <button
                key={choice.label}
                onClick={() => submit(choice.answer, remainingMs)}
                disabled={locked}
                className={[
                  'rounded-xl border-2 px-4 py-3 text-left text-sm font-semibold transition-colors',
                  showAsCorrect ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 animate-pop' : '',
                  showAsWrong ? 'border-rose-400 bg-rose-50 dark:bg-rose-500/10 text-rose-800 dark:text-rose-300 animate-shake' : '',
                  !showAsCorrect && !showAsWrong ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-300 hover:bg-indigo-50' : '',
                  locked && !showAsCorrect && !showAsWrong ? 'opacity-50' : '',
                ].join(' ')}
              >
                {choice.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-6 text-center">
        <button onClick={onExit} className="text-sm text-slate-400 dark:text-slate-500 underline-offset-2 hover:text-slate-600 hover:underline">
          End session
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">Elapsed {formatTime(elapsedMs)}</p>
    </div>
  )
}
