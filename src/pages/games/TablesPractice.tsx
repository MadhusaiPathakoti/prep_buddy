import { useState } from 'react'
import { Link } from 'react-router-dom'
import QuizRunner from '../../components/QuizRunner'
import { generateTablesQuestions } from '../../lib/generators'
import { validateInteger } from '../../lib/validators'
import type { Question } from '../../lib/types'

const ALL_TABLES = Array.from({ length: 30 }, (_, i) => i + 1)
const QUESTION_COUNTS = [10, 20, 30, 50, 100]
const MAX_MULTIPLIER = 30
const MULTIPLIER_RANGES: [number, number][] = [
  [1, 10],
  [11, 20],
  [21, 30],
  [1, 20],
  [1, 30],
]

export default function TablesPractice() {
  const [selected, setSelected] = useState<Set<number>>(new Set([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]))
  const [multiplierMin, setMultiplierMin] = useState(1)
  const [multiplierMax, setMultiplierMax] = useState(30)
  const [count, setCount] = useState(20)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  function toggle(n: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  }

  function selectRange(from: number, to: number) {
    setSelected(new Set(ALL_TABLES.slice(from - 1, to)))
  }

  const rangeValid = multiplierMin >= 1 && multiplierMax <= MAX_MULTIPLIER && multiplierMin <= multiplierMax
  const canStart = selected.size > 0 && rangeValid

  function newQuestions() {
    return generateTablesQuestions([...selected].sort((a, b) => a - b), multiplierMin, multiplierMax, count)
  }

  function start() {
    if (!canStart) return
    setQuestions(newQuestions())
    setSessionKey((k) => k + 1)
  }

  if (questions) {
    return (
      <QuizRunner
        key={sessionKey}
        gameId="tables"
        questions={questions}
        validate={validateInteger}
        onExit={() => setQuestions(null)}
        onRestart={() => {
          setQuestions(newQuestions())
          setSessionKey((k) => k + 1)
        }}
      />
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/speed-math" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← Speed Math
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">Tables Practice</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">
        Pick which tables to practice (e.g. 28's table = 28 × 1, 28 × 2 … 28 × 30) and the multiplier range (e.g. 15 × 11 to 15 × 20). Don't know a table well? Just skip it during the round.
      </p>

      <div className="mt-8 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-800 dark:text-slate-200">Choose tables</h2>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <QuickButton onClick={() => selectRange(1, 10)}>1–10</QuickButton>
            <QuickButton onClick={() => selectRange(11, 20)}>11–20</QuickButton>
            <QuickButton onClick={() => selectRange(21, 30)}>21–30</QuickButton>
            <QuickButton onClick={() => setSelected(new Set(ALL_TABLES))}>All</QuickButton>
            <QuickButton onClick={() => setSelected(new Set())}>Clear</QuickButton>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-6 gap-2 sm:grid-cols-10">
          {ALL_TABLES.map((n) => (
            <button
              key={n}
              onClick={() => toggle(n)}
              className={[
                'rounded-lg py-2 text-sm font-semibold transition',
                selected.has(n) ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
              ].join(' ')}
            >
              {n}
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Multiply range</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          e.g. 11 to 20 practices 15 × 11 … 15 × 20
        </p>
        <div className="mt-3 flex items-center gap-2">
          <RangeInput label="From" value={multiplierMin} onChange={setMultiplierMin} />
          <span className="text-slate-500 dark:text-slate-400">to</span>
          <RangeInput label="To" value={multiplierMax} onChange={setMultiplierMax} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {MULTIPLIER_RANGES.map(([from, to]) => (
            <button
              key={`${from}-${to}`}
              onClick={() => {
                setMultiplierMin(from)
                setMultiplierMax(to)
              }}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition',
                multiplierMin === from && multiplierMax === to
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
              ].join(' ')}
            >
              × {from}–{to}
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Number of questions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUESTION_COUNTS.map((c) => (
            <button
              key={c}
              onClick={() => setCount(c)}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition',
                count === c ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
              ].join(' ')}
            >
              {c}
            </button>
          ))}
        </div>

        <button
          onClick={start}
          disabled={!canStart}
          className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {selected.size === 0
            ? 'Select at least one table'
            : !rangeValid
              ? `Pick a valid range (1–${MAX_MULTIPLIER}, start ≤ end)`
              : `Start · ${selected.size} table${selected.size > 1 ? 's' : ''} · ×${multiplierMin} to ×${multiplierMax} · ${count} questions`}
        </button>
      </div>
    </div>
  )
}

function RangeInput({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={1}
      max={MAX_MULTIPLIER}
      aria-label={label}
      value={Number.isNaN(value) ? '' : value}
      onChange={(e) => onChange(e.target.value === '' ? NaN : Math.floor(Number(e.target.value)))}
      className="w-20 rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-center text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none ring-1 ring-slate-200 dark:ring-slate-600 focus:ring-2 focus:ring-indigo-500"
    />
  )
}

function QuickButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-full bg-slate-100 dark:bg-slate-700 px-3 py-1 font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200">
      {children}
    </button>
  )
}
