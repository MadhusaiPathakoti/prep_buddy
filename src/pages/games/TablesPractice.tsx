import { useState } from 'react'
import { Link } from 'react-router-dom'
import QuizRunner from '../../components/QuizRunner'
import { generateTablesQuestions } from '../../lib/generators'
import { validateInteger } from '../../lib/validators'
import type { Question } from '../../lib/types'

const ALL_TABLES = Array.from({ length: 30 }, (_, i) => i + 1)
const QUESTION_COUNTS = [10, 20, 30, 50, 100]
const MULTIPLIER_MAXES = [10, 20, 30]

export default function TablesPractice() {
  const [selected, setSelected] = useState<Set<number>>(new Set([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]))
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

  function newQuestions() {
    return generateTablesQuestions([...selected].sort((a, b) => a - b), multiplierMax, count)
  }

  function start() {
    if (selected.size === 0) return
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
      <Link to="/speed-math" className="text-sm text-slate-400 hover:text-slate-600">
        ← Speed Math
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900">Tables Practice</h1>
      <p className="mt-2 text-slate-500">
        Pick which tables to practice (e.g. 28's table = 28 × 1, 28 × 2 … 28 × 30) and how far to multiply. Don't know a table well? Just skip it during the round.
      </p>

      <div className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Choose tables</h2>
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
                selected.has(n) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {n}
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800">Multiply up to</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {MULTIPLIER_MAXES.map((m) => (
            <button
              key={m}
              onClick={() => setMultiplierMax(m)}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition',
                multiplierMax === m ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              × {m}
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800">Number of questions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUESTION_COUNTS.map((c) => (
            <button
              key={c}
              onClick={() => setCount(c)}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition',
                count === c ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {c}
            </button>
          ))}
        </div>

        <button
          onClick={start}
          disabled={selected.size === 0}
          className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {selected.size === 0
            ? 'Select at least one table'
            : `Start · ${selected.size} table${selected.size > 1 ? 's' : ''} · up to ×${multiplierMax} · ${count} questions`}
        </button>
      </div>
    </div>
  )
}

function QuickButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600 hover:bg-slate-200">
      {children}
    </button>
  )
}
