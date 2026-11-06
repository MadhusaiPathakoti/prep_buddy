import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { addSession } from '../lib/storage'
import { formatTime } from '../lib/format'
import { GRAMMAR_GAME_ID, getRule, recordAnswer, type DuelItem } from '../lib/grammarRules'
import Stat from './Stat'

export const MAX_STRIKES = 3
const TICK_MS = 100

interface Answered {
  item: DuelItem
  said: boolean
  correct: boolean
}

interface RuleDuelRunnerProps {
  items: DuelItem[]
  durationSec: number
  onExit: () => void
  onRestart: () => void
}

export default function RuleDuelRunner({ items, durationSec, onExit, onRestart }: RuleDuelRunnerProps) {
  const [index, setIndex] = useState(0)
  const [remainingMs, setRemainingMs] = useState(durationSec * 1000)
  const [answers, setAnswers] = useState<Answered[]>([])
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [score, setScore] = useState(0)
  const [flash, setFlash] = useState<'right' | 'wrong' | null>(null)
  const [lastMiss, setLastMiss] = useState<DuelItem | null>(null)
  const [finished, setFinished] = useState(false)
  const savedRef = useRef(false)

  const strikes = answers.filter((a) => !a.correct).length
  const item = items[index]

  useEffect(() => {
    if (finished) return
    const id = setInterval(() => {
      setRemainingMs((ms) => {
        const next = ms - TICK_MS
        if (next <= 0) {
          setFinished(true)
          return 0
        }
        return next
      })
    }, TICK_MS)
    return () => clearInterval(id)
  }, [finished])

  useEffect(() => {
    if (!flash) return
    const id = setTimeout(() => setFlash(null), 250)
    return () => clearTimeout(id)
  }, [flash, answers.length])

  function answer(said: boolean) {
    if (finished || !item) return
    const correct = said === item.isCorrect
    recordAnswer(item.ruleId, correct)
    setAnswers((prev) => [...prev, { item, said, correct }])
    setFlash(correct ? 'right' : 'wrong')
    if (correct) {
      const nextStreak = streak + 1
      setStreak(nextStreak)
      setBestStreak((b) => Math.max(b, nextStreak))
      setScore((s) => s + 10 + Math.min(nextStreak - 1, 5) * 2)
      setLastMiss(null)
    } else {
      setStreak(0)
      setLastMiss(item)
      if (strikes + 1 >= MAX_STRIKES) {
        setFinished(true)
        return
      }
    }
    if (index + 1 >= items.length) setFinished(true)
    else setIndex((i) => i + 1)
  }

  // Keyboard: ← = Incorrect, → = Correct.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') answer(true)
      else if (e.key === 'ArrowLeft') answer(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (!finished || savedRef.current) return
    savedRef.current = true
    const correctCount = answers.filter((a) => a.correct).length
    if (answers.length === 0) return
    addSession(GRAMMAR_GAME_ID, {
      date: new Date().toISOString(),
      correct: correctCount,
      wrongAttempts: answers.length - correctCount,
      skipped: 0,
      total: answers.length,
      timeMs: durationSec * 1000 - remainingMs,
    })
  }, [finished, answers, durationSec, remainingMs])

  if (finished) {
    const correctCount = answers.filter((a) => a.correct).length
    const accuracy = answers.length > 0 ? Math.round((correctCount / answers.length) * 1000) / 10 : 0
    const missed = answers.filter((a) => !a.correct)
    const reason = strikes >= MAX_STRIKES ? 'Out of lives' : remainingMs <= 0 ? "Time's up" : 'Deck cleared'
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-3xl bg-white dark:bg-slate-800 p-8 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{reason}!</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Points reward correct answers and unbroken streaks.</p>
          <div className="mt-6 grid grid-cols-2 gap-4">
            <Stat label="Score" value={String(score)} accent="text-indigo-600 dark:text-indigo-400" />
            <Stat label="Accuracy" value={`${accuracy}%`} accent="text-slate-900 dark:text-slate-100" />
            <Stat label="Answered" value={`${correctCount} / ${answers.length} right`} accent="text-emerald-600 dark:text-emerald-400" />
            <Stat label="Best streak" value={String(bestStreak)} accent="text-amber-600 dark:text-amber-400" />
          </div>

          {missed.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">What you missed</h3>
              <div className="mt-2 max-h-72 divide-y divide-slate-100 dark:divide-slate-700 overflow-y-auto rounded-2xl bg-slate-50 dark:bg-slate-800">
                {missed.map((a) => {
                  const rule = getRule(a.item.ruleId)
                  return (
                    <Link key={a.item.id} to={`/english/grammar-rules/lab/${a.item.ruleId}`} className="block px-4 py-3 transition hover:bg-slate-100 dark:hover:bg-slate-700/50">
                      <p className="text-sm text-slate-800 dark:text-slate-200">{a.item.sentence}</p>
                      <p className="mt-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                        {a.item.isCorrect ? 'This one was correct.' : `Incorrect — should be: ${a.item.fix ?? ''}`}
                      </p>
                      {rule && (
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          Rule {rule.id}: {rule.title}
                        </p>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3">
            <button onClick={onRestart} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]">
              Duel again
            </button>
            <button onClick={onExit} className="w-full rounded-xl bg-slate-100 dark:bg-slate-700 px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 active:scale-[0.99]">
              Change settings
            </button>
          </div>
        </div>
      </div>
    )
  }

  const fraction = remainingMs / (durationSec * 1000)
  const urgent = fraction <= 0.2
  const missRule = lastMiss ? getRule(lastMiss.ruleId) : null

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="text-slate-500 dark:text-slate-400">
          Score <span className="font-bold text-indigo-600 dark:text-indigo-400">{score}</span>
        </span>
        <span className="font-semibold text-slate-700 dark:text-slate-300">🔥 {streak}</span>
        <span aria-label={`${MAX_STRIKES - strikes} lives left`} className="tracking-widest">
          {Array.from({ length: MAX_STRIKES }, (_, i) => (i < MAX_STRIKES - strikes ? '❤️' : '🖤')).join('')}
        </span>
        <span className={['font-mono tabular-nums font-semibold', urgent ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'].join(' ')}>
          {Math.ceil(remainingMs / 1000)}s
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-600">
        <div className={['h-full rounded-full', urgent ? 'bg-rose-500' : 'bg-amber-400'].join(' ')} style={{ width: `${Math.max(0, fraction) * 100}%` }} />
      </div>

      <div
        className={[
          'mt-6 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-2 transition-colors',
          flash === 'right' ? 'ring-emerald-400' : flash === 'wrong' ? 'ring-rose-400 animate-shake' : 'ring-slate-200 dark:ring-slate-700',
        ].join(' ')}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Is this sentence correct?</span>
        <p className="mt-3 flex min-h-24 items-center rounded-2xl bg-slate-50 dark:bg-slate-900/40 px-4 py-4 text-lg leading-relaxed text-slate-900 dark:text-slate-100">{item.sentence}</p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button onClick={() => answer(false)} className="rounded-xl border-2 border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 px-4 py-4 text-base font-bold text-rose-700 dark:text-rose-300 transition hover:bg-rose-100 active:scale-[0.98]">
            ✗ Incorrect
            <span className="block text-xs font-normal opacity-70">← key</span>
          </button>
          <button onClick={() => answer(true)} className="rounded-xl border-2 border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-4 text-base font-bold text-emerald-700 dark:text-emerald-300 transition hover:bg-emerald-100 active:scale-[0.98]">
            ✓ Correct
            <span className="block text-xs font-normal opacity-70">→ key</span>
          </button>
        </div>
      </div>

      {lastMiss && (
        <p className="mt-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-xs leading-relaxed text-rose-800 dark:text-rose-300">
          <span className="font-semibold">Last miss:</span> {lastMiss.isCorrect ? `"${lastMiss.sentence}" was correct.` : `should be "${lastMiss.fix ?? ''}".`}
          {missRule && <span className="opacity-80"> Rule {missRule.id}: {missRule.title}.</span>}
        </p>
      )}

      <div className="mt-6 text-center">
        <button onClick={() => setFinished(true)} className="text-sm text-slate-400 dark:text-slate-500 underline-offset-2 hover:text-slate-600 hover:underline">
          End duel · {formatTime(durationSec * 1000 - remainingMs)}
        </button>
      </div>
    </div>
  )
}
