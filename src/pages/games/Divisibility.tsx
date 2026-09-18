import { useState } from 'react'
import { Link } from 'react-router-dom'
import MCQQuizRunner from '../../components/MCQQuizRunner'
import { generateDivisibilityQuestions, type MCQQuestion, type DivisibilityDifficulty } from '../../lib/generators'

const QUESTION_COUNTS = [10, 15, 20, 30]

const DIFFICULTIES: { id: DivisibilityDifficulty; label: string; description: string }[] = [
  { id: 'easy', label: 'Easy', description: '4-digit numbers · divisors 3, 4, 6, 9, 11' },
  { id: 'medium', label: 'Medium', description: '5-digit numbers · divisors 7, 8, 12, 13, 16' },
  { id: 'hard', label: 'Hard', description: '6-digit numbers, close-set options · divisors 7, 11, 13, 17, 19, 23' },
  { id: 'mixed', label: 'Mixed', description: 'A blend of all three' },
]

export default function Divisibility() {
  const [difficulty, setDifficulty] = useState<DivisibilityDifficulty>('medium')
  const [count, setCount] = useState(15)
  const [questions, setQuestions] = useState<MCQQuestion[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  function generate() {
    return generateDivisibilityQuestions(difficulty, count)
  }

  function start() {
    setQuestions(generate())
    setSessionKey((k) => k + 1)
  }

  if (questions) {
    return (
      <MCQQuizRunner
        key={sessionKey}
        gameId="divisibility"
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
      <Link to="/quant" className="text-sm text-slate-400 hover:text-slate-600">
        ← Quant
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900">Divisibility</h1>
      <p className="mt-2 text-slate-500">
        Pick the one number, out of four, that's exactly divisible by the given number. Calibrated to SBI PO Mains
        pace — options sit close together, so shortcuts like "it's even" won't cut it. Use the divisibility rules.
      </p>

      <div className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="font-semibold text-slate-800">Difficulty</h2>
        <div className="mt-3 grid gap-2">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              onClick={() => setDifficulty(d.id)}
              className={[
                'rounded-lg px-4 py-2.5 text-left transition',
                difficulty === d.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              <div className="text-sm font-semibold">{d.label}</div>
              <div className={['text-xs', difficulty === d.id ? 'text-indigo-100' : 'text-slate-400'].join(' ')}>{d.description}</div>
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
          Start · {difficulty} · {count} questions
        </button>
      </div>
    </div>
  )
}
