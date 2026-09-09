import { useEffect, useRef, useState } from 'react'
import type { MCQQuestion } from '../lib/generators'
import { addSession } from '../lib/storage'
import { formatTime } from '../lib/format'
import Stat from './Stat'
import ReviewList, { type ReviewItem } from './ReviewList'

interface MCQQuizRunnerProps {
  gameId: string
  questions: MCQQuestion[]
  onExit: () => void
  onRestart: () => void
}

export default function MCQQuizRunner({ gameId, questions, onExit, onRestart }: MCQQuizRunnerProps) {
  const [index, setIndex] = useState(0)
  const [eliminated, setEliminated] = useState<Set<string>>(new Set())
  const [justCorrect, setJustCorrect] = useState<string | null>(null)
  const [flashWrong, setFlashWrong] = useState<string | null>(null)
  const [hintShown, setHintShown] = useState(false)
  const [revealAnswer, setRevealAnswer] = useState(false)
  const [locked, setLocked] = useState(false)
  const [correct, setCorrect] = useState(0)
  const [wrongAttempts, setWrongAttempts] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [finished, setFinished] = useState(false)
  const [startTime] = useState(() => Date.now())
  const [elapsedMs, setElapsedMs] = useState(0)
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([])

  const savedRef = useRef(false)

  useEffect(() => {
    if (finished) return
    const id = setInterval(() => setElapsedMs(Date.now() - startTime), 250)
    return () => clearInterval(id)
  }, [finished, startTime])

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
        : [...items, { id: current.id, prompt: current.term, displayAnswer: current.correctMeaning, skipped }],
    )
  }

  function advance() {
    if (index + 1 >= total) {
      setFinished(true)
      return
    }
    setIndex((i) => i + 1)
    setEliminated(new Set())
    setJustCorrect(null)
    setFlashWrong(null)
    setHintShown(false)
    setRevealAnswer(false)
    setLocked(false)
  }

  function handleOptionClick(option: string) {
    if (locked || revealAnswer || eliminated.has(option)) return
    if (option === current.correctMeaning) {
      setLocked(true)
      setJustCorrect(option)
      setCorrect((c) => c + 1)
      setTimeout(advance, 500)
    } else {
      setEliminated((prev) => new Set(prev).add(option))
      setWrongAttempts((w) => w + 1)
      recordMiss(false)
      setFlashWrong(option)
      setTimeout(() => setFlashWrong(null), 300)
    }
  }

  function handleSkip() {
    if (locked || revealAnswer) return
    setLocked(true)
    setSkipped((s) => s + 1)
    recordMiss(true)
    setRevealAnswer(true)
    setTimeout(advance, 900)
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

          <ReviewList items={reviewItems} />

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
        <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="mt-4 flex justify-center gap-4 text-xs font-medium text-slate-500">
        <span className="text-emerald-600">✓ {correct}</span>
        <span className="text-amber-600">⏭ {skipped}</span>
        <span className="text-rose-600">✕ {wrongAttempts}</span>
      </div>

      <div className="mt-8 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <div className="text-center">
          <div className="text-2xl font-bold leading-snug tracking-tight text-slate-900 sm:text-3xl">{current.term}</div>

          {!hintShown && !revealAnswer && (
            <button
              onClick={() => setHintShown(true)}
              className="mt-3 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
            >
              💡 Show a hint
            </button>
          )}
          {hintShown && <p className="mt-3 text-sm italic text-amber-700">Hint: {current.hint}</p>}
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          {current.options.map((option) => {
            const isEliminated = eliminated.has(option)
            const isCorrectAnswer = option === current.correctMeaning
            const showAsCorrect = justCorrect === option || (revealAnswer && isCorrectAnswer)
            const showAsWrong = flashWrong === option
            return (
              <button
                key={option}
                onClick={() => handleOptionClick(option)}
                disabled={isEliminated || locked || revealAnswer}
                className={[
                  'rounded-xl border-2 px-4 py-3 text-left text-sm font-medium transition-colors',
                  showAsCorrect ? 'border-emerald-400 bg-emerald-50 text-emerald-800 animate-pop' : '',
                  showAsWrong ? 'border-rose-400 bg-rose-50 text-rose-800 animate-shake' : '',
                  !showAsCorrect && !showAsWrong && isEliminated ? 'border-slate-100 bg-slate-50 text-slate-300 line-through' : '',
                  !showAsCorrect && !showAsWrong && !isEliminated ? 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50' : '',
                ].join(' ')}
              >
                {option}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-6 flex justify-center">
        <button
          onClick={handleSkip}
          disabled={locked || revealAnswer}
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
