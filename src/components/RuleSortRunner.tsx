import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { addSession } from '../lib/storage'
import { formatTime } from '../lib/format'
import { GRAMMAR_GAME_ID, getRule, recordAnswer, type SortItem, type SortRound } from '../lib/grammarRules'
import Stat from './Stat'

type Bucket = 'correct' | 'incorrect'
type Placement = Record<string, Bucket | null>

interface RoundResult {
  round: SortRound
  right: number
  total: number
}

interface RuleSortRunnerProps {
  rounds: SortRound[]
  onExit: () => void
  onRestart: () => void
}

const BUCKETS: { id: Bucket; label: string; icon: string; tone: string }[] = [
  { id: 'correct', label: 'Correct', icon: '✓', tone: 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-500/5 text-emerald-700 dark:text-emerald-300' },
  { id: 'incorrect', label: 'Incorrect', icon: '✗', tone: 'border-rose-300 dark:border-rose-500/40 bg-rose-50/60 dark:bg-rose-500/5 text-rose-700 dark:text-rose-300' },
]

export default function RuleSortRunner({ rounds, onExit, onRestart }: RuleSortRunnerProps) {
  const [roundIndex, setRoundIndex] = useState(0)
  const [placement, setPlacement] = useState<Placement>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [showRule, setShowRule] = useState(false)
  const [results, setResults] = useState<RoundResult[]>([])
  const [finished, setFinished] = useState(false)
  const [startTime] = useState(() => Date.now())
  const [elapsedMs, setElapsedMs] = useState(0)
  const savedRef = useRef(false)

  const round = rounds[roundIndex]
  const rule = getRule(round.ruleId)
  const totalRounds = rounds.length

  useEffect(() => {
    if (finished) return
    const id = setInterval(() => setElapsedMs(Date.now() - startTime), 250)
    return () => clearInterval(id)
  }, [finished, startTime])

  useEffect(() => {
    if (!finished || savedRef.current) return
    savedRef.current = true
    const right = results.reduce((s, r) => s + r.right, 0)
    const total = results.reduce((s, r) => s + r.total, 0)
    addSession(GRAMMAR_GAME_ID, {
      date: new Date().toISOString(),
      correct: right,
      wrongAttempts: total - right,
      skipped: 0,
      total,
      timeMs: elapsedMs,
    })
  }, [finished, results, elapsedMs])

  const allPlaced = round.items.every((it) => placement[it.id])

  function place(itemId: string, bucket: Bucket | null) {
    if (checked) return
    setPlacement((p) => ({ ...p, [itemId]: bucket }))
    setSelected(null)
  }

  function onChipClick(item: SortItem) {
    if (checked) return
    // Tapping a sorted chip sends it back to the pile; tapping a pile chip selects it.
    if (placement[item.id]) place(item.id, null)
    else setSelected((s) => (s === item.id ? null : item.id))
  }

  function check() {
    const right = round.items.filter((it) => placement[it.id] === (it.isCorrect ? 'correct' : 'incorrect')).length
    recordAnswer(round.ruleId, right === round.items.length)
    setResults((prev) => [...prev, { round, right, total: round.items.length }])
    setChecked(true)
  }

  function next() {
    if (roundIndex + 1 >= totalRounds) {
      setFinished(true)
      return
    }
    setRoundIndex((i) => i + 1)
    setPlacement({})
    setSelected(null)
    setChecked(false)
    setShowRule(false)
  }

  if (finished) {
    const right = results.reduce((s, r) => s + r.right, 0)
    const total = results.reduce((s, r) => s + r.total, 0)
    const accuracy = total > 0 ? Math.round((right / total) * 1000) / 10 : 0
    const perfect = results.filter((r) => r.right === r.total).length
    const revisit = results.filter((r) => r.right < r.total)
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-3xl bg-white dark:bg-slate-800 p-8 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Session complete</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">A rule counts as nailed only when every sentence is sorted correctly.</p>
          <div className="mt-6 grid grid-cols-2 gap-4">
            <Stat label="Sentences sorted right" value={`${right} / ${total}`} accent="text-emerald-600 dark:text-emerald-400" />
            <Stat label="Accuracy" value={`${accuracy}%`} accent="text-slate-900 dark:text-slate-100" />
            <Stat label="Perfect rounds" value={`${perfect} / ${totalRounds}`} accent="text-indigo-600 dark:text-indigo-400" />
            <Stat label="Time" value={formatTime(elapsedMs)} accent="text-slate-900 dark:text-slate-100" />
          </div>

          {revisit.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Rules to revisit</h3>
              <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden rounded-2xl bg-slate-50 dark:bg-slate-800">
                {revisit.map((r) => {
                  const rl = getRule(r.round.ruleId)
                  if (!rl) return null
                  return (
                    <Link key={rl.id} to={`/english/grammar-rules/lab/${rl.id}`} className="block px-4 py-3 transition hover:bg-slate-100 dark:hover:bg-slate-700/50">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        Rule {rl.id}: {rl.title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {r.right} of {r.total} right · {rl.summary}
                      </p>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3">
            <button onClick={onRestart} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]">
              Sort again
            </button>
            <button onClick={onExit} className="w-full rounded-xl bg-slate-100 dark:bg-slate-700 px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 active:scale-[0.99]">
              Change settings
            </button>
          </div>
        </div>
      </div>
    )
  }

  const chip = (item: SortItem) => {
    const where = placement[item.id]
    const isSel = selected === item.id
    const verdict = checked ? where === (item.isCorrect ? 'correct' : 'incorrect') : null
    return (
      <div key={item.id}>
        <button
          draggable={!checked}
          onDragStart={(e) => e.dataTransfer.setData('text/plain', item.id)}
          onClick={() => onChipClick(item)}
          className={[
            'w-full rounded-xl border-2 px-3 py-2 text-left text-sm leading-snug transition',
            verdict === true ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-900 dark:text-emerald-200' : '',
            verdict === false ? 'border-rose-400 bg-rose-50 dark:bg-rose-500/10 text-rose-900 dark:text-rose-200' : '',
            verdict === null && isSel ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 text-slate-900 dark:text-slate-100' : '',
            verdict === null && !isSel ? 'cursor-grab border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:border-indigo-300' : '',
          ].join(' ')}
        >
          {item.sentence}
        </button>
        {checked && !item.isCorrect && item.fix && (
          <p className="mt-1 px-1 text-xs text-emerald-700 dark:text-emerald-400">✓ {item.fix}</p>
        )}
      </div>
    )
  }

  const pile = round.items.filter((it) => !placement[it.id])
  const lastResult = checked ? results[results.length - 1] : null

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <span>
          Round <span className="font-semibold text-slate-700 dark:text-slate-300">{roundIndex + 1}</span> / {totalRounds}
        </span>
        <span>{formatTime(elapsedMs)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-600">
        <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${(roundIndex / totalRounds) * 100}%` }} />
      </div>

      {rule && (
        <div className="mt-5 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Sort by this rule</p>
          <p className="mt-0.5 text-base font-bold text-indigo-900 dark:text-indigo-200">
            Rule {rule.id}: {rule.title}
          </p>
          {showRule || checked ? (
            <p className="mt-1 text-sm text-indigo-900 dark:text-indigo-200">{rule.summary}</p>
          ) : (
            <button onClick={() => setShowRule(true)} className="mt-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 underline-offset-2 hover:underline">
              Show the rule
            </button>
          )}
        </div>
      )}

      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">Drag each sentence into a bucket — or tap a sentence, then tap a bucket. Tap a sorted sentence to take it back.</p>

      <div
        className="mt-3 min-h-16 space-y-2 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-3"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => place(e.dataTransfer.getData('text/plain'), null)}
      >
        {pile.length === 0 ? <p className="py-2 text-center text-xs text-slate-400 dark:text-slate-500">All sentences sorted</p> : pile.map(chip)}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {BUCKETS.map((b) => (
          <div
            key={b.id}
            role="button"
            tabIndex={0}
            onClick={() => selected && place(selected, b.id)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && selected) place(selected, b.id)
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => place(e.dataTransfer.getData('text/plain'), b.id)}
            className={['min-h-32 space-y-2 rounded-2xl border-2 p-3', b.tone, selected && !checked ? 'cursor-pointer ring-2 ring-indigo-300' : ''].join(' ')}
          >
            <p className="text-sm font-bold">
              {b.icon} {b.label}
            </p>
            {round.items.filter((it) => placement[it.id] === b.id).map(chip)}
          </div>
        ))}
      </div>

      <div className="mt-5">
        {!checked ? (
          <button
            onClick={check}
            disabled={!allPlaced}
            className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {allPlaced ? 'Check my sorting' : `${pile.length} left to sort`}
          </button>
        ) : (
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 px-4 py-3 ring-1 ring-slate-200 dark:ring-slate-700">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {lastResult && lastResult.right === lastResult.total ? '🎉 Perfect round!' : `${lastResult?.right} of ${lastResult?.total} sorted correctly`}
            </p>
            <div className="mt-3 flex items-center gap-4">
              <button onClick={next} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500">
                {roundIndex + 1 >= totalRounds ? 'See results' : 'Next round'}
              </button>
              {rule && (
                <Link to={`/english/grammar-rules/lab/${rule.id}`} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 underline-offset-2 hover:underline">
                  Open full rule
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 text-center">
        <button onClick={onExit} className="text-sm text-slate-400 dark:text-slate-500 underline-offset-2 hover:text-slate-600 hover:underline">
          End session
        </button>
      </div>
    </div>
  )
}
