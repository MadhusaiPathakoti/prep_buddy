import { useState } from 'react'
import { Link } from 'react-router-dom'
import QuizRunner from '../../components/QuizRunner'
import {
  generateLcmHcfSimplificationQuestions,
  type LcmHcfSimpDifficulty,
  type LcmHcfSimpMode,
} from '../../lib/lcmHcfSimplification'
import { validateInteger } from '../../lib/validators'
import type { Question } from '../../lib/types'

const QUESTION_COUNTS = [10, 20, 30, 50]

const MODES: { id: LcmHcfSimpMode; label: string }[] = [
  { id: 'mixed', label: 'Mixed' },
  { id: 'lcm', label: 'LCM only' },
  { id: 'hcf', label: 'HCF only' },
  { id: 'simplification', label: 'Simplification only' },
]

const DIFFICULTIES: { id: LcmHcfSimpDifficulty; label: string; description: string }[] = [
  { id: 'easy', label: 'Easy', description: '2 numbers up to ~36 · 2-step expressions' },
  { id: 'medium', label: 'Medium', description: '2 numbers up to ~108 · 3-step expressions' },
  { id: 'hard', label: 'Hard', description: '3 numbers up to ~72 · brackets & 3-step expressions' },
]

export default function LcmHcfSimplification() {
  const [mode, setMode] = useState<LcmHcfSimpMode>('mixed')
  const [difficulty, setDifficulty] = useState<LcmHcfSimpDifficulty>('medium')
  const [count, setCount] = useState(20)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  function generate() {
    return generateLcmHcfSimplificationQuestions(mode, difficulty, count)
  }

  function start() {
    setQuestions(generate())
    setSessionKey((k) => k + 1)
  }

  if (questions) {
    return (
      <QuizRunner
        key={sessionKey}
        gameId="lcm-hcf-simplification"
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
      <Link to="/maths" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← Maths
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">LCM, HCF & Simplification</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">
        Find the LCM or HCF of two or three numbers, e.g. <span className="font-mono">LCM(12, 18)</span>, or simplify
        a BODMAS expression, e.g. <span className="font-mono">48 ÷ 6 + 7 × 3</span>. Every answer is a whole number.
      </p>

      <div className="mt-8 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
        <h2 className="font-semibold text-slate-800 dark:text-slate-200">Mode</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition',
                mode === m.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
              ].join(' ')}
            >
              {m.label}
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Difficulty</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              onClick={() => setDifficulty(d.id)}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition',
                difficulty === d.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
              ].join(' ')}
            >
              {d.label}
              <span className={['ml-1.5 font-normal', difficulty === d.id ? 'text-indigo-100' : 'text-slate-400 dark:text-slate-500'].join(' ')}>
                ({d.description})
              </span>
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
          className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]"
        >
          Start · {difficulty} · {count} questions
        </button>
      </div>
    </div>
  )
}
