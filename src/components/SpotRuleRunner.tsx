import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { addSession } from '../lib/storage'
import { formatTime } from '../lib/format'
import { GRAMMAR_GAME_ID, getRule, recordAnswer, type SpotQuestion } from '../lib/grammarRules'
import Stat from './Stat'

interface Result {
  question: SpotQuestion
  chosenRuleId: number
  correct: boolean
}

interface SpotRuleRunnerProps {
  questions: SpotQuestion[]
  onExit: () => void
  onRestart: () => void
}

export default function SpotRuleRunner({ questions, onExit, onRestart }: SpotRuleRunnerProps) {
  const [index, setIndex] = useState(0)
  const [chosen, setChosen] = useState<number | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [finished, setFinished] = useState(false)
  const [startTime] = useState(() => Date.now())
  const [elapsedMs, setElapsedMs] = useState(0)
  const savedRef = useRef(false)

  const total = questions.length
  const current = questions[index]

  useEffect(() => {
    if (finished) return
    const id = setInterval(() => setElapsedMs(Date.now() - startTime), 250)
    return () => clearInterval(id)
  }, [finished, startTime])

  useEffect(() => {
    if (!finished || savedRef.current) return
    savedRef.current = true
    const correctCount = results.filter((r) => r.correct).length
    addSession(GRAMMAR_GAME_ID, {
      date: new Date().toISOString(),
      correct: correctCount,
      wrongAttempts: results.length - correctCount,
      skipped: 0,
      total,
      timeMs: elapsedMs,
    })
  }, [finished, results, total, elapsedMs])

  function choose(ruleId: number) {
    if (chosen !== null) return
    const correct = ruleId === current.ruleId
    setChosen(ruleId)
    recordAnswer(current.ruleId, correct)
    setResults((prev) => [...prev, { question: current, chosenRuleId: ruleId, correct }])
    if (correct) {
      setStreak((s) => {
        const next = s + 1
        setBestStreak((b) => Math.max(b, next))
        return next
      })
    } else {
      setStreak(0)
    }
  }

  function next() {
    if (index + 1 >= total) {
      setFinished(true)
    } else {
      setIndex((i) => i + 1)
      setChosen(null)
    }
  }

  if (finished) {
    const correctCount = results.filter((r) => r.correct).length
    const accuracy = total > 0 ? Math.round((correctCount / total) * 1000) / 10 : 0
    const missed = results.filter((r) => !r.correct)

    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-3xl bg-white dark:bg-slate-800 p-8 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Session complete</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Rules you missed will come back sooner in your next review.</p>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <Stat label="Accuracy" value={`${accuracy}%`} accent="text-slate-900 dark:text-slate-100" />
            <Stat label="Correct" value={`${correctCount} / ${total}`} accent="text-emerald-600 dark:text-emerald-400" />
            <Stat label="Best streak" value={String(bestStreak)} accent="text-indigo-600 dark:text-indigo-400" />
            <Stat label="Time" value={formatTime(elapsedMs)} accent="text-slate-900 dark:text-slate-100" />
          </div>

          {missed.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Rules to revisit</h3>
              <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden rounded-2xl bg-slate-50 dark:bg-slate-800">
                {missed.map((r) => {
                  const rule = getRule(r.question.ruleId)
                  if (!rule) return null
                  return (
                    <Link key={r.question.id} to={`/english/grammar-rules/lab/${rule.id}`} className="block px-4 py-3 transition hover:bg-slate-100 dark:hover:bg-slate-700/50">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        Rule {rule.id}: {rule.title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{rule.summary}</p>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

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

  const rule = getRule(current.ruleId)
  const answeredRight = chosen === current.ruleId
  const progressPct = total > 0 ? (index / total) * 100 : 0

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <span>
          Question <span className="font-semibold text-slate-700 dark:text-slate-300">{index + 1}</span> / {total}
        </span>
        <span className="font-semibold text-slate-700 dark:text-slate-300">🔥 {streak}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-600">
        <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="mt-6 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
        <span className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
          {current.kind === 'broken' ? 'This sentence has an error' : 'This sentence is correct'}
        </span>
        <p className="mt-3 rounded-2xl bg-slate-50 dark:bg-slate-900/40 px-4 py-4 text-base leading-relaxed text-slate-900 dark:text-slate-100">{current.sentence}</p>
        <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
          {current.kind === 'broken' ? 'Which rule does it break?' : 'Which rule does it show?'}
        </p>

        <div className="mt-3 flex flex-col gap-2.5">
          {current.options.map((o) => {
            const locked = chosen !== null
            const isRight = o.ruleId === current.ruleId
            const isChosen = chosen === o.ruleId
            const showRight = locked && isRight
            const showWrong = locked && isChosen && !isRight
            return (
              <button
                key={o.ruleId}
                onClick={() => choose(o.ruleId)}
                disabled={locked}
                className={[
                  'rounded-xl border-2 px-4 py-3 text-left text-sm font-semibold transition-colors',
                  showRight ? 'animate-pop border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : '',
                  showWrong ? 'animate-shake border-rose-400 bg-rose-50 dark:bg-rose-500/10 text-rose-800 dark:text-rose-300' : '',
                  !showRight && !showWrong ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10' : '',
                  locked && !showRight && !showWrong ? 'opacity-50' : '',
                ].join(' ')}
              >
                {o.title}
              </button>
            )
          })}
        </div>

        {chosen !== null && rule && (
          <div className={['mt-5 rounded-2xl px-4 py-3 text-sm leading-relaxed', answeredRight ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-900 dark:text-emerald-200' : 'bg-rose-50 dark:bg-rose-500/10 text-rose-900 dark:text-rose-200'].join(' ')}>
            <p className="font-semibold">
              {answeredRight ? 'Correct!' : 'Not quite.'} Rule {rule.id}: {rule.title}
            </p>
            {current.fix && (
              <p className="mt-1">
                <span className="font-semibold">Fix:</span> {current.fix}
              </p>
            )}
            <p className="mt-1">{rule.summary}</p>
            <div className="mt-3 flex items-center gap-4">
              <button onClick={next} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500">
                {index + 1 >= total ? 'See results' : 'Next'}
              </button>
              <Link to={`/english/grammar-rules/lab/${rule.id}`} className="text-xs font-semibold underline-offset-2 hover:underline">
                Open full rule
              </Link>
            </div>
          </div>
        )}
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
