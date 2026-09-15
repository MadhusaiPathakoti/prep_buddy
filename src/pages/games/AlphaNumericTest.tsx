import { useState } from 'react'
import { Link } from 'react-router-dom'
import AlphaNumQuizRunner from '../../components/AlphaNumQuizRunner'
import { generateAlphaNumericQuestions, type AlphaNumQuestion, type AlphaNumSystem, type AlphaNumDirection } from '../../lib/generators'

const QUESTION_COUNTS = [10, 15, 20, 26]

const SYSTEMS: { id: AlphaNumSystem; label: string }[] = [
  { id: 'forward', label: 'Forward (A=1 … Z=26)' },
  { id: 'reverse', label: 'Reverse (Z=-1 … A=-26)' },
  { id: 'mixed', label: 'Mixed' },
]

const DIRECTIONS: { id: AlphaNumDirection; label: string }[] = [
  { id: 'alpha-to-num', label: 'Alphabet → Number' },
  { id: 'num-to-alpha', label: 'Number → Alphabet' },
  { id: 'mixed', label: 'Mixed' },
]

export default function AlphaNumericTest() {
  const [system, setSystem] = useState<AlphaNumSystem>('forward')
  const [direction, setDirection] = useState<AlphaNumDirection>('alpha-to-num')
  const [count, setCount] = useState(15)
  const [questions, setQuestions] = useState<AlphaNumQuestion[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  function generate() {
    return generateAlphaNumericQuestions(system, direction, count)
  }

  function start() {
    setQuestions(generate())
    setSessionKey((k) => k + 1)
  }

  if (questions) {
    return (
      <AlphaNumQuizRunner
        key={sessionKey}
        gameId="alpha-numeric-test"
        questions={questions}
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
      <Link to="/reasoning" className="text-sm text-slate-400 hover:text-slate-600">
        ← Reasoning
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900">Alpha Numeric Test</h1>
      <p className="mt-2 text-slate-500">
        Convert between letters and their position numbers. Forward: A=1 … Z=26. Reverse: Z=-1 … A=-26.
      </p>

      <div className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="font-semibold text-slate-800">System</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {SYSTEMS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSystem(s.id)}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition',
                system === s.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {s.label}
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800">Direction</h2>
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
          Start · {count} questions
        </button>
      </div>
    </div>
  )
}
