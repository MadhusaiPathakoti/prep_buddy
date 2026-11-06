import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { addSession } from '../lib/storage'
import { formatTime } from '../lib/format'
import { GRAMMAR_GAME_ID, getRule, normalizeSentence, recordAnswer, type FixCard } from '../lib/grammarRules'
import Stat from './Stat'

interface Result {
  card: FixCard
  correct: boolean
}

interface FixItRunnerProps {
  cards: FixCard[]
  onExit: () => void
  onRestart: () => void
}

export default function FixItRunner({ cards, onExit, onRestart }: FixItRunnerProps) {
  const [index, setIndex] = useState(0)
  const [typed, setTyped] = useState('')
  const [hintShown, setHintShown] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [autoMatched, setAutoMatched] = useState(false)
  const [graded, setGraded] = useState<boolean | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const [finished, setFinished] = useState(false)
  const [startTime] = useState(() => Date.now())
  const [elapsedMs, setElapsedMs] = useState(0)
  const savedRef = useRef(false)

  const total = cards.length
  const card = cards[index]

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

  function record(correct: boolean) {
    recordAnswer(card.ruleId, correct)
    setGraded(correct)
    setResults((prev) => [...prev, { card, correct }])
  }

  function reveal() {
    if (revealed) return
    setRevealed(true)
    if (typed.trim() && normalizeSentence(typed) === normalizeSentence(card.right)) {
      setAutoMatched(true)
      record(true)
    }
  }

  function next() {
    if (index + 1 >= total) {
      setFinished(true)
      return
    }
    setIndex((i) => i + 1)
    setTyped('')
    setHintShown(false)
    setRevealed(false)
    setAutoMatched(false)
    setGraded(null)
  }

  if (finished) {
    const correctCount = results.filter((r) => r.correct).length
    const accuracy = total > 0 ? Math.round((correctCount / total) * 1000) / 10 : 0
    const missed = results.filter((r) => !r.correct)
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-3xl bg-white dark:bg-slate-800 p-8 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Session complete</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Cards you missed will come back sooner in your next review.</p>
          <div className="mt-6 grid grid-cols-3 gap-4">
            <Stat label="Fixed" value={`${correctCount} / ${total}`} accent="text-emerald-600 dark:text-emerald-400" />
            <Stat label="Accuracy" value={`${accuracy}%`} accent="text-slate-900 dark:text-slate-100" />
            <Stat label="Time" value={formatTime(elapsedMs)} accent="text-slate-900 dark:text-slate-100" />
          </div>

          {missed.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Rules to revisit</h3>
              <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden rounded-2xl bg-slate-50 dark:bg-slate-800">
                {missed.map((r) => {
                  const rule = getRule(r.card.ruleId)
                  if (!rule) return null
                  return (
                    <Link key={r.card.id} to={`/english/grammar-rules/lab/${rule.id}`} className="block px-4 py-3 transition hover:bg-slate-100 dark:hover:bg-slate-700/50">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        Rule {rule.id}: {rule.title}
                      </p>
                      <p className="mt-0.5 text-xs text-rose-600 dark:text-rose-400 line-through">{r.card.wrong}</p>
                      <p className="text-xs text-emerald-700 dark:text-emerald-400">{r.card.right}</p>
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

  const rule = getRule(card.ruleId)

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <span>
          Card <span className="font-semibold text-slate-700 dark:text-slate-300">{index + 1}</span> / {total}
        </span>
        <span>{results.filter((r) => r.correct).length} fixed</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-600">
        <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${(index / total) * 100}%` }} />
      </div>

      <div className="mt-6 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
        <span className="text-xs font-semibold uppercase tracking-wide text-rose-500">Fix this sentence</span>
        <p className="mt-3 rounded-2xl bg-rose-50 dark:bg-rose-500/10 px-4 py-4 text-base leading-relaxed text-rose-900 dark:text-rose-200">{card.wrong}</p>

        <label className="mt-4 block text-sm font-semibold text-slate-700 dark:text-slate-300" htmlFor="fix-input">
          Type the corrected sentence
        </label>
        <textarea
          id="fix-input"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={revealed}
          rows={2}
          placeholder="Rewrite it correctly…"
          className="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400 disabled:opacity-70"
        />

        {!revealed && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button onClick={reveal} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500">
              Flip the card
            </button>
            {!hintShown && rule && (
              <button onClick={() => setHintShown(true)} className="text-sm text-slate-500 dark:text-slate-400 underline-offset-2 hover:underline">
                Hint: which rule?
              </button>
            )}
          </div>
        )}
        {hintShown && !revealed && rule && (
          <p className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            Rule {rule.id}: {rule.title}
          </p>
        )}

        {revealed && rule && (
          <div className="mt-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 text-sm leading-relaxed text-emerald-900 dark:text-emerald-200">
            <p className="text-xs font-semibold uppercase tracking-wide">Correct sentence</p>
            <p className="mt-1 text-base font-semibold">{card.right}</p>
            <p className="mt-2 font-semibold">
              Rule {rule.id}: {rule.title}
            </p>
            <p className="mt-0.5">{rule.summary}</p>

            {autoMatched ? (
              <p className="mt-3 font-semibold">✓ Your fix matches!</p>
            ) : graded === null ? (
              <div className="mt-3">
                <p className="text-xs">Did your fix say the same thing?</p>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => record(true)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
                    ✓ Got it
                  </button>
                  <button onClick={() => record(false)} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500">
                    ✗ Missed it
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-3 font-semibold">{graded ? '✓ Marked as got it' : "✗ Marked as missed — it'll come back soon"}</p>
            )}

            {graded !== null && (
              <div className="mt-3 flex items-center gap-4">
                <button onClick={next} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500">
                  {index + 1 >= total ? 'See results' : 'Next card'}
                </button>
                <Link to={`/english/grammar-rules/lab/${rule.id}`} className="text-xs font-semibold underline-offset-2 hover:underline">
                  Open full rule
                </Link>
              </div>
            )}
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
