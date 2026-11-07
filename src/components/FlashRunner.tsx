import { useEffect, useRef, useState } from 'react'
import type { FlashQuestion } from '../lib/flashGames'
import { addSession } from '../lib/storage'
import { formatTime } from '../lib/format'
import { validateInteger } from '../lib/validators'
import Stat from './Stat'
import ReviewList, { type ReviewItem } from './ReviewList'

interface FlashRunnerProps {
  gameId: string
  questions: FlashQuestion[]
  /** How long each frame stays on screen. */
  frameMs: number
  onExit: () => void
  onRestart: () => void
}

type Phase = 'ready' | 'flash' | 'answer' | 'reveal'
type Outcome = 'correct' | 'wrong' | 'skipped'

const READY_MS = 900
const GAP_MS = 160

/**
 * Plays "flash" questions: the frames appear one at a time and vanish, then you type the answer from memory.
 * A wrong answer is final (you cannot see the numbers again), so accuracy = correct / total.
 */
export default function FlashRunner({ gameId, questions, frameMs, onExit, onRestart }: FlashRunnerProps) {
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('ready')
  const [frameIdx, setFrameIdx] = useState(0)
  const [hidden, setHidden] = useState(false)
  const [input, setInput] = useState('')
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [correct, setCorrect] = useState(0)
  const [wrong, setWrong] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [finished, setFinished] = useState(false)
  const [startTime] = useState(() => Date.now())
  const [elapsedMs, setElapsedMs] = useState(0)
  const [review, setReview] = useState<ReviewItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const savedRef = useRef(false)

  const total = questions.length
  const current = questions[index]

  useEffect(() => {
    if (finished) return
    const id = setInterval(() => setElapsedMs(Date.now() - startTime), 250)
    return () => clearInterval(id)
  }, [finished, startTime])

  useEffect(() => {
    if (finished && !savedRef.current) {
      savedRef.current = true
      addSession(gameId, { date: new Date().toISOString(), correct, wrongAttempts: wrong, skipped, total, timeMs: elapsedMs })
    }
  }, [finished, gameId, correct, wrong, skipped, total, elapsedMs])

  // frame sequencer
  useEffect(() => {
    if (finished) return
    let timer: ReturnType<typeof setTimeout> | undefined
    if (phase === 'ready') {
      timer = setTimeout(() => {
        setFrameIdx(0)
        setHidden(false)
        setPhase('flash')
      }, READY_MS)
    } else if (phase === 'flash') {
      if (!hidden) {
        timer = setTimeout(() => setHidden(true), frameMs)
      } else {
        timer = setTimeout(() => {
          if (frameIdx + 1 < current.frames.length) {
            setFrameIdx((i) => i + 1)
            setHidden(false)
          } else {
            setPhase('answer')
          }
        }, GAP_MS)
      }
    }
    return () => clearTimeout(timer)
  }, [phase, hidden, frameIdx, index, finished, frameMs, current])

  // after the answer is shown, move on
  useEffect(() => {
    if (phase !== 'reveal' || finished) return
    const t = setTimeout(
      () => {
        if (index + 1 >= total) {
          setFinished(true)
          return
        }
        setIndex((i) => i + 1)
        setInput('')
        setOutcome(null)
        setPhase('ready')
      },
      outcome === 'correct' ? 350 : 1600,
    )
    return () => clearTimeout(t)
  }, [phase, index, total, outcome, finished])

  useEffect(() => {
    if (phase === 'answer') inputRef.current?.focus()
  }, [phase])

  function finish(kind: Outcome) {
    setOutcome(kind)
    setPhase('reveal')
    if (kind === 'correct') {
      setCorrect((c) => c + 1)
      return
    }
    if (kind === 'wrong') setWrong((w) => w + 1)
    else setSkipped((s) => s + 1)
    setReview((items) => [...items, { id: current.id, prompt: current.review, displayAnswer: current.displayAnswer, skipped: kind === 'skipped', note: current.note }])
  }

  function handleChange(raw: string) {
    if (phase !== 'answer') return
    const cleaned = raw.replace(/[^0-9]/g, '')
    setInput(cleaned)
    const result = validateInteger(cleaned, current.answer)
    if (result === 'correct') finish('correct')
    else if (result === 'wrong') finish('wrong')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || phase !== 'answer' || input.trim() === '') return
    e.preventDefault()
    finish(validateInteger(input, current.answer) === 'correct' ? 'correct' : 'wrong')
  }

  function handleSkip() {
    if (phase === 'reveal') return
    finish('skipped')
  }

  if (finished) {
    const accuracy = total > 0 ? Math.round((correct / total) * 1000) / 10 : 0
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="rounded-3xl bg-white dark:bg-slate-800 p-8 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Session complete</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Here's how you did.</p>
          <div className="mt-6 grid grid-cols-2 gap-4">
            <Stat label="Accuracy" value={`${accuracy}%`} accent="text-indigo-600 dark:text-indigo-400" />
            <Stat label="Time taken" value={formatTime(elapsedMs)} accent="text-slate-900 dark:text-slate-100" />
            <Stat label="Correct" value={String(correct)} accent="text-emerald-600 dark:text-emerald-400" />
            <Stat label="Skipped" value={String(skipped)} accent="text-amber-600 dark:text-amber-400" />
            <Stat label="Wrong" value={String(wrong)} accent="text-rose-600 dark:text-rose-400" />
            <Stat label="Frame time" value={`${(frameMs / 1000).toFixed(1)}s`} accent="text-slate-900 dark:text-slate-100" />
          </div>
          <ReviewList items={review} />
          <div className="mt-8 flex flex-col gap-3">
            <button onClick={onRestart} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]">
              Practice again
            </button>
            <button onClick={onExit} className="w-full rounded-xl bg-slate-100 dark:bg-slate-700 px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 active:scale-[0.99]">
              Change settings
            </button>
          </div>
        </div>
      </div>
    )
  }

  const frame = current.frames[frameIdx]
  const progressPct = total > 0 ? (index / total) * 100 : 0
  const ringClass = outcome === 'correct' ? 'ring-emerald-400 animate-pop' : outcome === 'wrong' ? 'ring-rose-400 animate-shake' : 'ring-slate-200 dark:ring-slate-700'

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

      <div className={['mt-8 flex min-h-[18rem] flex-col items-center justify-center rounded-3xl bg-white dark:bg-slate-800 p-10 text-center shadow-sm ring-1 transition-colors', ringClass].join(' ')}>
        {phase === 'ready' && <div className="text-xl font-semibold text-slate-400 dark:text-slate-500">Get ready…</div>}
        {phase === 'flash' && (
          <div className="font-mono text-5xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-6xl" aria-live="off">
            {hidden ? ' ' : frame}
          </div>
        )}
        {phase === 'answer' && (
          <>
            <div className="text-lg font-semibold text-slate-500 dark:text-slate-400">{current.prompt}</div>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={handleKeyDown}
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              placeholder="?"
              className="mt-5 w-44 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-center font-mono text-3xl font-bold text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400"
            />
          </>
        )}
        {phase === 'reveal' && (
          <>
            <div className="text-sm font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{outcome === 'correct' ? 'Correct' : 'Answer'}</div>
            <div className={['mt-2 font-mono text-5xl font-extrabold', outcome === 'correct' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'].join(' ')}>{current.displayAnswer}</div>
          </>
        )}
      </div>

      <div className="mt-6 flex justify-center">
        <button
          onClick={handleSkip}
          disabled={phase === 'reveal'}
          className="rounded-full bg-slate-100 dark:bg-slate-700 px-6 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-200 disabled:opacity-50"
        >
          Skip →
        </button>
      </div>
      <div className="mt-6 text-center">
        <button onClick={onExit} className="text-sm text-slate-400 dark:text-slate-500 underline-offset-2 hover:text-slate-600 hover:underline">
          End session
        </button>
      </div>
    </div>
  )
}
