import { useEffect, useMemo, useRef, useState } from 'react'
import { CA_BANK_KEY, CA_GAME_ID, shuffle } from '../../lib/computerAwareness/data'
import type { CaBankQuestion } from '../../lib/computerAwareness/types'
import { formatTime } from '../../lib/format'
import { getFavorites, toggleFavorite } from '../../lib/favorites'
import { addSession } from '../../lib/storage'
import Stat from '../Stat'
import StarButton from './StarButton'

const LETTERS = ['A', 'B', 'C', 'D']

/** A question with its options in a fresh random order for this play. */
interface Round {
  q: CaBankQuestion
  options: string[]
  answer: number
}

interface Result {
  picked: number | null
}

interface Props {
  questions: CaBankQuestion[]
  onExit: () => void
  onRestart: () => void
}

export default function CaQuizRunner({ questions, onExit, onRestart }: Props) {
  const rounds = useMemo<Round[]>(
    () =>
      questions.map((q) => {
        const correct = q.options[q.answer]
        const options = shuffle(q.options)
        return { q, options, answer: options.indexOf(correct) }
      }),
    [questions],
  )
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const [finished, setFinished] = useState(false)
  const [favorites, setFavorites] = useState(() => getFavorites(CA_BANK_KEY))
  const [startTime] = useState(() => Date.now())
  const [elapsedMs, setElapsedMs] = useState(0)
  const savedRef = useRef(false)

  useEffect(() => {
    if (finished) return
    const id = setInterval(() => setElapsedMs(Date.now() - startTime), 500)
    return () => clearInterval(id)
  }, [finished, startTime])

  const total = rounds.length
  const round = rounds[index]
  const correctCount = results.filter((r, i) => r.picked === rounds[i].answer).length
  const answered = picked !== null

  useEffect(() => {
    if (finished && !savedRef.current) {
      savedRef.current = true
      addSession(CA_GAME_ID, { date: new Date().toISOString(), correct: correctCount, wrongAttempts: results.length - correctCount, skipped: 0, total, timeMs: Date.now() - startTime })
    }
  }, [finished, correctCount, results.length, total, startTime])

  function choose(i: number) {
    if (answered || finished) return
    setPicked(i)
  }

  function next() {
    if (picked === null) return
    setResults((r) => [...r, { picked }])
    if (index + 1 >= total) {
      setElapsedMs(Date.now() - startTime)
      setFinished(true)
      return
    }
    setIndex(index + 1)
    setPicked(null)
  }

  // keyboard: 1-4 / A-D answers, Enter or Space moves on
  useEffect(() => {
    if (finished) return
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return
      const k = e.key.toLowerCase()
      const idx = '1234'.includes(k) && k.length === 1 ? Number(k) - 1 : 'abcd'.includes(k) && k.length === 1 ? 'abcd'.indexOf(k) : -1
      if (idx >= 0) {
        choose(idx)
      } else if ((e.key === 'Enter' || e.key === ' ') && answered && target?.tagName !== 'BUTTON') {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const star = (id: string) => setFavorites(toggleFavorite(CA_BANK_KEY, id, favorites))

  if (finished) {
    const accuracy = total > 0 ? Math.round((correctCount / total) * 1000) / 10 : 0
    const wrong = results.length - correctCount
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
          <div className="text-center text-5xl" aria-hidden="true">
            {accuracy >= 80 ? '🏆' : accuracy >= 50 ? '👍' : '📚'}
          </div>
          <h2 className="mt-2 text-center text-2xl font-bold text-slate-900 dark:text-slate-100">Quiz complete</h2>
          <p className="mt-1 text-center text-sm text-slate-500 dark:text-slate-400">
            {accuracy >= 80 ? 'Excellent — you know this well.' : accuracy >= 50 ? 'Good going — review the misses below.' : 'Keep reading the book and try again.'}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Accuracy" value={`${accuracy}%`} accent="text-indigo-600 dark:text-indigo-400" />
            <Stat label="Correct" value={`${correctCount}/${total}`} accent="text-emerald-600 dark:text-emerald-400" />
            <Stat label="Wrong" value={String(wrong)} accent="text-rose-600 dark:text-rose-400" />
            <Stat label="Time" value={formatTime(elapsedMs)} accent="text-slate-900 dark:text-slate-100" />
          </div>

          <h3 className="mb-3 mt-8 text-sm font-semibold text-slate-700 dark:text-slate-300">Every question, with your answer</h3>
          <div className="space-y-3">
            {rounds.map((r, i) => {
              const res = results[i]
              const ok = res?.picked === r.answer
              return (
                <div key={r.q.id} className={['rounded-2xl p-4 ring-1', ok ? 'bg-emerald-50/60 ring-emerald-200 dark:bg-emerald-500/5 dark:ring-emerald-500/30' : 'bg-rose-50/60 ring-rose-200 dark:bg-rose-500/5 dark:ring-rose-500/30'].join(' ')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Q{i + 1} · {r.q.chapterTitle}
                    </div>
                    <StarButton on={favorites.has(r.q.id)} onToggle={() => star(r.q.id)} />
                  </div>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{r.q.q}</p>
                  <p className="mt-2 text-sm">
                    <span className="font-semibold text-slate-500 dark:text-slate-400">Your answer: </span>
                    <span className={ok ? 'font-semibold text-emerald-700 dark:text-emerald-300' : 'font-semibold text-rose-700 dark:text-rose-300'}>{res?.picked != null ? r.options[res.picked] : '—'}</span>
                  </p>
                  {!ok && (
                    <p className="text-sm">
                      <span className="font-semibold text-slate-500 dark:text-slate-400">Correct answer: </span>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-300">{r.options[r.answer]}</span>
                    </p>
                  )}
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{r.q.explain}</p>
                </div>
              )
            })}
          </div>

          <div className="mt-8 flex flex-col gap-3">
            <button onClick={onRestart} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]">
              Play again
            </button>
            <button onClick={onExit} className="w-full rounded-xl bg-slate-100 px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-200 active:scale-[0.99] dark:bg-slate-700 dark:text-slate-300">
              Change settings
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <div className="mb-3 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <span>
          Question <span className="font-semibold text-slate-700 dark:text-slate-300">{index + 1}</span> / {total}
        </span>
        <span className="font-mono tabular-nums">{formatTime(elapsedMs)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-600">
        <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${(index / total) * 100}%` }} />
      </div>
      <div className="mt-3 flex justify-center gap-4 text-xs font-medium">
        <span className="text-emerald-600 dark:text-emerald-400">✓ {correctCount}</span>
        <span className="text-rose-600 dark:text-rose-400">✕ {results.length - correctCount}</span>
      </div>

      <div className="mt-5 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
        <div className="flex items-start justify-between gap-3">
          <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">{round.q.chapterTitle}</span>
          <StarButton on={favorites.has(round.q.id)} onToggle={() => star(round.q.id)} />
        </div>
        <h2 className="mt-4 text-lg font-bold leading-snug text-slate-900 dark:text-slate-100 sm:text-xl">{round.q.q}</h2>

        <div className="mt-5 flex flex-col gap-2.5">
          {round.options.map((option, i) => {
            const isAnswer = i === round.answer
            const isPicked = i === picked
            let cls = 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            if (answered) {
              if (isAnswer) cls = 'border-emerald-400 bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200 animate-pop'
              else if (isPicked) cls = 'border-rose-400 bg-rose-50 text-rose-900 dark:bg-rose-500/10 dark:text-rose-200 animate-shake'
              else cls = 'border-slate-100 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-600'
            }
            return (
              <button key={i} onClick={() => choose(i)} disabled={answered} className={`flex items-start gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm font-medium transition-colors ${cls}`}>
                <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300">{LETTERS[i]}</span>
                <span className="flex-1">{option}</span>
                {answered && isAnswer && <span className="font-bold text-emerald-600 dark:text-emerald-400">✓</span>}
                {answered && isPicked && !isAnswer && <span className="font-bold text-rose-600 dark:text-rose-400">✕</span>}
              </button>
            )
          })}
        </div>

        {answered && (
          <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
            <div className={['font-bold', picked === round.answer ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'].join(' ')}>
              {picked === round.answer ? '✓ Correct!' : `✕ Not quite — the answer is ${LETTERS[round.answer]}.`}
            </div>
            <p className="mt-1">{round.q.explain}</p>
          </div>
        )}
      </div>

      <div className="mt-5 flex justify-center">
        <button
          onClick={next}
          disabled={!answered}
          className="rounded-xl bg-indigo-600 px-8 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {index + 1 >= total ? 'Finish' : 'Next →'}
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-slate-400 dark:text-slate-500">Tip: press A–D (or 1–4) to answer, Enter for next.</p>

      <div className="mt-4 text-center">
        <button onClick={onExit} className="text-sm text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline dark:text-slate-500">
          End session
        </button>
      </div>
    </div>
  )
}
