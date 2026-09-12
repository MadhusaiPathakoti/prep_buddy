import { useState } from 'react'
import { Link } from 'react-router-dom'
import RatioQuizRunner from '../../components/RatioQuizRunner'
import { generatePercentToRatioQuestions, type RatioAnswerQuestion, type RatioDifficulty } from '../../lib/generators'

const QUESTION_COUNTS = [10, 15, 20, 30]
const MAX_DENOMINATORS = [10, 15, 20, 30]

export default function PercentToRatio() {
  const [difficulty, setDifficulty] = useState<RatioDifficulty>('basic')
  const [maxDenominator, setMaxDenominator] = useState(20)
  const [count, setCount] = useState(15)
  const [questions, setQuestions] = useState<RatioAnswerQuestion[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  function generate() {
    return generatePercentToRatioQuestions(maxDenominator, difficulty, count)
  }

  function start() {
    setQuestions(generate())
    setSessionKey((k) => k + 1)
  }

  if (questions) {
    return (
      <RatioQuizRunner
        key={sessionKey}
        gameId="percent-to-ratio"
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
      <Link to="/speed-math" className="text-sm text-slate-400 hover:text-slate-600">
        ← Speed Math
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900">Percentage to Ratio</h1>
      <p className="mt-2 text-slate-500">
        Convert a percentage to a fraction in lowest terms. e.g. 25% → <span className="font-mono">1/4</span>
      </p>

      <div className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="font-semibold text-slate-800">Difficulty</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => setDifficulty('basic')}
            className={[
              'rounded-lg px-4 py-2 text-sm font-semibold transition',
              difficulty === 'basic' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            ].join(' ')}
          >
            Basic (1/n)
          </button>
          <button
            onClick={() => setDifficulty('advanced')}
            className={[
              'rounded-lg px-4 py-2 text-sm font-semibold transition',
              difficulty === 'advanced' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            ].join(' ')}
          >
            Advanced (n/d)
          </button>
        </div>

        <h2 className="mt-6 font-semibold text-slate-800">Denominators up to</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {MAX_DENOMINATORS.map((d) => (
            <button
              key={d}
              onClick={() => setMaxDenominator(d)}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition',
                maxDenominator === d ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {d}
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
