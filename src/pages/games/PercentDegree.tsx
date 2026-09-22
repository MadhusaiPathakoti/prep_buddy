import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import QuizRunner from '../../components/QuizRunner'
import { generatePercentDegreeQuestions, type PercentDegreeDirection } from '../../lib/generators'
import { validateInteger } from '../../lib/validators'
import type { Question } from '../../lib/types'

const QUESTION_COUNTS = [10, 15, 20, 30]

const DIRECTIONS: { id: PercentDegreeDirection; label: string }[] = [
  { id: 'percent-to-degree', label: 'Percentage → Degree' },
  { id: 'degree-to-percent', label: 'Degree → Percentage' },
  { id: 'mixed', label: 'Mixed' },
]

/** Every 5%-step conversion the game can ask about — the same pool generatePercentDegreeQuestions draws from. */
const CONVERSIONS = Array.from({ length: 20 }, (_, i) => {
  const percent = (i + 1) * 5
  return { percent, degrees: percent * 3.6 }
})

export default function PercentDegree() {
  const [direction, setDirection] = useState<PercentDegreeDirection>('mixed')
  const [count, setCount] = useState(15)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)
  const [showLearn, setShowLearn] = useState(false)

  const poolSize = useMemo(() => generatePercentDegreeQuestions(direction, Number.MAX_SAFE_INTEGER).length, [direction])
  const canStart = poolSize > 0

  function generate() {
    return generatePercentDegreeQuestions(direction, count)
  }

  function start() {
    setQuestions(generate())
    setSessionKey((k) => k + 1)
  }

  if (questions) {
    return (
      <QuizRunner
        key={sessionKey}
        gameId="percent-degree"
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

  if (showLearn) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link to="/quant" className="text-sm text-slate-400 hover:text-slate-600">
          ← Quant
        </Link>
        <h1 className="mt-2 text-3xl font-extrabold text-slate-900">Percentage ↔ Degree</h1>
        <p className="mt-2 text-slate-500">Every 5%-step conversion the game can ask about. Learn these, then practice.</p>

        <div className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {CONVERSIONS.map((c) => (
              <div key={c.percent} className="rounded-xl bg-slate-50 px-3 py-2.5 text-center">
                <div className="font-mono text-sm font-bold text-slate-800">{c.percent}%</div>
                <div className="text-xs text-slate-300">=</div>
                <div className="font-mono text-sm font-bold text-indigo-600">{c.degrees}°</div>
              </div>
            ))}
          </div>

          <button
            onClick={() => setShowLearn(false)}
            className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]"
          >
            Done · Start practicing
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/quant" className="text-sm text-slate-400 hover:text-slate-600">
        ← Quant
      </Link>
      <div className="mt-2 flex items-start justify-between gap-3">
        <h1 className="text-3xl font-extrabold text-slate-900">Percentage ↔ Degree</h1>
        <button
          onClick={() => setShowLearn(true)}
          className="shrink-0 rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-100"
        >
          📖 Learn
        </button>
      </div>
      <p className="mt-2 text-slate-500">
        A full circle is 360° = 100%, so 1% = 3.6°. Convert between the two, e.g.{' '}
        <span className="font-mono">10% = 36°</span> or <span className="font-mono">108° = 30%</span> — handy for
        pie-chart data interpretation questions.
      </p>

      <div className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="font-semibold text-slate-800">Direction</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {DIRECTIONS.map((d) => (
            <button
              key={d.id}
              onClick={() => setDirection(d.id)}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition',
                direction === d.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {d.label}
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800">Number of questions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUESTION_COUNTS.map((c) => (
            <button
              key={c}
              onClick={() => setCount(c)}
              disabled={c > poolSize}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
                count === c ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {c}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">{poolSize} questions available for this direction.</p>

        <button
          onClick={start}
          disabled={!canStart}
          className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {canStart ? `Start · ${Math.min(count, poolSize)} questions` : 'No questions available'}
        </button>
      </div>
    </div>
  )
}
