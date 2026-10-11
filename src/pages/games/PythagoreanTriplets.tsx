import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import QuizRunner from '../../components/QuizRunner'
import { generatePythagoreanQuestions } from '../../lib/generators'
import { validateInteger } from '../../lib/validators'
import type { Question } from '../../lib/types'

const QUESTION_COUNTS = [10, 15, 20, 30]
const NUMBERS = Array.from({ length: 50 }, (_, i) => i + 1)

export default function PythagoreanTriplets() {
  const [rangeFrom, setRangeFrom] = useState(1)
  const [rangeTo, setRangeTo] = useState(50)
  const [count, setCount] = useState(15)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  const poolSize = useMemo(
    () => generatePythagoreanQuestions(rangeFrom, rangeTo, Number.MAX_SAFE_INTEGER).length,
    [rangeFrom, rangeTo],
  )
  const canStart = poolSize > 0

  function changeFrom(value: number) {
    setRangeFrom(value)
    if (value > rangeTo) setRangeTo(value)
  }

  function changeTo(value: number) {
    setRangeTo(value)
    if (value < rangeFrom) setRangeFrom(value)
  }

  function generate() {
    return generatePythagoreanQuestions(rangeFrom, rangeTo, count)
  }

  function start() {
    setQuestions(generate())
    setSessionKey((k) => k + 1)
  }

  if (questions) {
    return (
      <QuizRunner
        key={sessionKey}
        gameId="pythagorean-triplets"
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
      <Link to="/speed-math" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← Speed Math
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">Pythagorean Triplets</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">
        One number in a triplet is missing, e.g. <span className="font-mono">(3, 4, _)</span> or{' '}
        <span className="font-mono">(_, 4, 5)</span> — figure out which position and fill in the blank. Pick a range
        for the smallest number in the triplet.
      </p>

      <div className="mt-8 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
        <h2 className="font-semibold text-slate-800 dark:text-slate-200">Smallest number in the triplet</h2>
        <div className="mt-3 flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            From
            <select
              value={rangeFrom}
              onChange={(e) => changeFrom(Number(e.target.value))}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 font-semibold text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-400"
            >
              {NUMBERS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            To
            <select
              value={rangeTo}
              onChange={(e) => changeTo(Number(e.target.value))}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 font-semibold text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-400"
            >
              {NUMBERS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Number of questions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUESTION_COUNTS.map((c) => (
            <button
              key={c}
              onClick={() => setCount(c)}
              disabled={c > poolSize}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
                count === c ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
              ].join(' ')}
            >
              {c}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          {poolSize} triplet{poolSize === 1 ? '' : 's'} available with smallest number {rangeFrom}–{rangeTo}.
        </p>

        <button
          onClick={start}
          disabled={!canStart}
          className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {canStart ? `Start · ${rangeFrom}–${rangeTo} · ${Math.min(count, poolSize)} questions` : 'No triplets in this range'}
        </button>
      </div>
    </div>
  )
}
