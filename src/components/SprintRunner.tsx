import { useEffect, useRef, useState } from 'react'
import { LEVEL_LABELS, MAX_LEVEL, sprintQuestion } from '../lib/sprint'
import type { Question } from '../lib/types'
import { addSession } from '../lib/storage'
import { validateInteger } from '../lib/validators'
import Stat from './Stat'
import ReviewList, { type ReviewItem } from './ReviewList'

interface SprintRunnerProps {
  gameId: string
  durationSec: number
  onExit: () => void
  onRestart: () => void
}

const BEST_KEY = (gameId: string, seconds: number) => `prepbuddy:${gameId}:best:${seconds}`
const readBest = (gameId: string, seconds: number): number => {
  try {
    return Number(localStorage.getItem(BEST_KEY(gameId, seconds))) || 0
  } catch {
    return 0
  }
}
const writeBest = (gameId: string, seconds: number, score: number) => {
  try {
    localStorage.setItem(BEST_KEY(gameId, seconds), String(score))
  } catch {
    /* storage unavailable: the best score just isn't remembered */
  }
}

/** Timed sprint: as many questions as you can before the clock runs out. Three right in a row moves you up a level; a miss drops you one. */
export default function SprintRunner({ gameId, durationSec, onExit, onRestart }: SprintRunnerProps) {
  const [level, setLevel] = useState(1)
  const [question, setQuestion] = useState<Question>(() => sprintQuestion(1))
  const [input, setInput] = useState('')
  const [feedback, setFeedback] = useState<'idle' | 'correct' | 'wrong'>('idle')
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [peakLevel, setPeakLevel] = useState(1)
  const [correct, setCorrect] = useState(0)
  const [wrong, setWrong] = useState(0)
  const [review, setReview] = useState<ReviewItem[]>([])
  const [startedAt] = useState(() => Date.now())
  const [remainingMs, setRemainingMs] = useState(durationSec * 1000)
  const [finished, setFinished] = useState(false)
  const [previousBest] = useState(() => readBest(gameId, durationSec))
  const inputRef = useRef<HTMLInputElement>(null)
  const savedRef = useRef(false)
  const busyRef = useRef(false)

  useEffect(() => {
    if (finished) return
    const id = setInterval(() => {
      const left = durationSec * 1000 - (Date.now() - startedAt)
      if (left <= 0) {
        setRemainingMs(0)
        setFinished(true)
      } else setRemainingMs(left)
    }, 100)
    return () => clearInterval(id)
  }, [finished, durationSec, startedAt])

  useEffect(() => {
    if (!finished || savedRef.current) return
    savedRef.current = true
    addSession(gameId, { date: new Date().toISOString(), correct, wrongAttempts: wrong, skipped: 0, total: correct + wrong, timeMs: durationSec * 1000 })
    if (correct > previousBest) writeBest(gameId, durationSec, correct)
  }, [finished, gameId, correct, wrong, durationSec, previousBest])

  useEffect(() => {
    if (!finished && feedback === 'idle') inputRef.current?.focus()
  }, [question, finished, feedback])

  function next(nextLevel: number) {
    setQuestion(sprintQuestion(nextLevel))
    setInput('')
    setFeedback('idle')
    busyRef.current = false
  }

  function settle(isCorrect: boolean) {
    if (busyRef.current) return
    busyRef.current = true
    if (isCorrect) {
      setFeedback('correct')
      setCorrect((c) => c + 1)
      const newStreak = streak + 1
      let newLevel = level
      let s = newStreak
      if (newStreak >= 3 && level < MAX_LEVEL) {
        newLevel = level + 1
        s = 0
        setLevel(newLevel)
        setPeakLevel((p) => Math.max(p, newLevel))
      }
      setStreak(s)
      setBestStreak((b) => Math.max(b, newStreak))
      setTimeout(() => next(newLevel), 140)
    } else {
      setFeedback('wrong')
      setWrong((w) => w + 1)
      setStreak(0)
      const newLevel = Math.max(1, level - 1)
      setLevel(newLevel)
      setReview((items) => [...items, { id: question.id, prompt: question.prompt, displayAnswer: question.displayAnswer, skipped: false }])
      setTimeout(() => next(newLevel), 800)
    }
  }

  function handleChange(raw: string) {
    if (feedback !== 'idle' || finished) return
    const cleaned = raw.replace(/[^0-9]/g, '')
    setInput(cleaned)
    const result = validateInteger(cleaned, question.answer)
    if (result === 'correct') settle(true)
    else if (result === 'wrong') settle(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || feedback !== 'idle' || input.trim() === '') return
    e.preventDefault()
    settle(validateInteger(input, question.answer) === 'correct')
  }

  if (finished) {
    const attempted = correct + wrong
    const accuracy = attempted > 0 ? Math.round((correct / attempted) * 1000) / 10 : 0
    const perMin = Math.round((attempted / durationSec) * 600) / 10
    const newBest = correct > previousBest
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="rounded-3xl bg-white dark:bg-slate-800 p-8 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Time's up!</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {newBest ? `New best for a ${durationSec}-second sprint!` : previousBest > 0 ? `Your best for ${durationSec} seconds is ${previousBest}.` : 'First sprint recorded.'}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4">
            <Stat label="Score" value={String(correct)} accent="text-indigo-600 dark:text-indigo-400" />
            <Stat label="Accuracy" value={`${accuracy}%`} accent="text-emerald-600 dark:text-emerald-400" />
            <Stat label="Best streak" value={String(bestStreak)} accent="text-slate-900 dark:text-slate-100" />
            <Stat label="Questions / min" value={String(perMin)} accent="text-slate-900 dark:text-slate-100" />
            <Stat label="Peak level" value={`${peakLevel}/${MAX_LEVEL}`} accent="text-amber-600 dark:text-amber-400" />
            <Stat label="Mistakes" value={String(wrong)} accent="text-rose-600 dark:text-rose-400" />
          </div>
          <p className="mt-3 text-center text-xs text-slate-400 dark:text-slate-500">Highest level reached: {LEVEL_LABELS[peakLevel]}</p>
          <ReviewList items={review} />
          <div className="mt-8 flex flex-col gap-3">
            <button onClick={onRestart} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]">
              Sprint again
            </button>
            <button onClick={onExit} className="w-full rounded-xl bg-slate-100 dark:bg-slate-700 px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 active:scale-[0.99]">
              Change settings
            </button>
          </div>
        </div>
      </div>
    )
  }

  const pct = (remainingMs / (durationSec * 1000)) * 100
  const seconds = Math.ceil(remainingMs / 1000)

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <div className="mb-3 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <span>
          Level <span className="font-semibold text-slate-700 dark:text-slate-300">{level}</span> / {MAX_LEVEL}
          <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">· {LEVEL_LABELS[level]}</span>
        </span>
        <span className={['font-mono text-lg font-bold tabular-nums', seconds <= 10 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'].join(' ')}>{seconds}s</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-600">
        <div className={['h-full rounded-full transition-[width] duration-100', seconds <= 10 ? 'bg-rose-500' : 'bg-indigo-500'].join(' ')} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-4 flex justify-center gap-5 text-xs font-medium">
        <span className="text-emerald-600 dark:text-emerald-400">✓ {correct}</span>
        <span className="text-rose-600 dark:text-rose-400">✕ {wrong}</span>
        <span className="text-slate-500 dark:text-slate-400">🔥 streak {streak}/3</span>
      </div>

      <div
        className={[
          'mt-8 rounded-3xl bg-white dark:bg-slate-800 p-10 text-center shadow-sm ring-1 transition-colors',
          feedback === 'correct' ? 'ring-emerald-400' : feedback === 'wrong' ? 'ring-rose-400 animate-shake' : 'ring-slate-200 dark:ring-slate-700',
        ].join(' ')}
      >
        <div className="font-mono text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-5xl">
          {question.prompt}
          <span className="text-slate-300 dark:text-slate-600"> = </span>
        </div>
        {feedback === 'wrong' ? (
          <div className="mt-6 text-2xl font-semibold text-amber-600 dark:text-amber-400">{question.displayAnswer}</div>
        ) : (
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            placeholder="?"
            className="mt-6 w-40 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-center font-mono text-3xl font-bold text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400"
          />
        )}
      </div>

      <div className="mt-6 text-center">
        <button onClick={onExit} className="text-sm text-slate-400 dark:text-slate-500 underline-offset-2 hover:text-slate-600 hover:underline">
          Quit sprint
        </button>
      </div>
    </div>
  )
}
