import { useState } from 'react'
import { Link } from 'react-router-dom'
import QuizRunner from '../../components/QuizRunner'
import { generateSquaresCubesQuestions, type SquareCubeMode } from '../../lib/generators'
import { validateInteger } from '../../lib/validators'
import type { Question } from '../../lib/types'

const QUESTION_COUNTS = [10, 20, 30, 50, 60]
const NUMBERS = Array.from({ length: 150 }, (_, i) => i + 1)
const MODES: { id: SquareCubeMode; label: string }[] = [
  { id: 'square', label: 'Squares only' },
  { id: 'cube', label: 'Cubes only' },
  { id: 'mixed', label: 'Mixed' },
]

export default function SquaresCubes() {
  const [mode, setMode] = useState<SquareCubeMode>('mixed')
  const [rangeFrom, setRangeFrom] = useState(1)
  const [rangeTo, setRangeTo] = useState(30)
  const [count, setCount] = useState(20)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  function changeFrom(value: number) {
    setRangeFrom(value)
    if (value > rangeTo) setRangeTo(value)
  }

  function changeTo(value: number) {
    setRangeTo(value)
    if (value < rangeFrom) setRangeFrom(value)
  }

  function generate() {
    return generateSquaresCubesQuestions(rangeFrom, rangeTo, mode, count)
  }

  function start() {
    setQuestions(generate())
    setSessionKey((k) => k + 1)
  }

  if (questions) {
    return (
      <QuizRunner
        key={sessionKey}
        gameId="squares-cubes"
        questions={questions}
        validate={validateInteger}
        onExit={() => setQuestions(null)}
        onRestart={() => {
          setQuestions(generate())
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
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900">Squares & Cubes</h1>
      <p className="mt-2 text-slate-500">Squares and cubes of numbers from 1 to 150, e.g. 17² or 12³. Pick a range to focus on, like 5 to 15.</p>

      <div className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="font-semibold text-slate-800">Mode</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition',
                mode === m.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {m.label}
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800">Range</h2>
        <div className="mt-3 flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            From
            <select
              value={rangeFrom}
              onChange={(e) => changeFrom(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-800 outline-none focus:border-indigo-400"
            >
              {NUMBERS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            To
            <select
              value={rangeTo}
              onChange={(e) => changeTo(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-800 outline-none focus:border-indigo-400"
            >
              {NUMBERS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
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
          className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]"
        >
          Start · {rangeFrom}–{rangeTo} · {count} questions
        </button>
      </div>
    </div>
  )
}
