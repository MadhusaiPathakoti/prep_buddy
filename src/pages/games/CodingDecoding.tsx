import { useState } from 'react'
import { Link } from 'react-router-dom'
import MCQQuizRunner from '../../components/MCQQuizRunner'
import { generateCodingDecodingQuestions, type CodingDifficulty, type CodingDirection } from '../../lib/codingDecoding'
import type { MCQQuestion } from '../../lib/generators'

const QUESTION_COUNTS = [8, 12, 16, 20, 24]

const DIFFICULTIES: { id: CodingDifficulty; label: string; description: string }[] = [
  { id: 'easy', label: 'Easy', description: '3 statements of 3 words · 1-2 step deductions' },
  { id: 'medium', label: 'Medium', description: '4 statements of 4 words · 2-3 step deductions, like the exam' },
  { id: 'hard', label: 'Hard', description: '5 statements of 5 words · always includes a 3-step chain' },
  { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
]

const DIRECTIONS: { id: CodingDirection; label: string }[] = [
  { id: 'mixed', label: 'Both ways' },
  { id: 'word-to-code', label: "Code for a word" },
  { id: 'code-to-word', label: 'Word for a code' },
]

export default function CodingDecoding() {
  const [difficulty, setDifficulty] = useState<CodingDifficulty>('medium')
  const [direction, setDirection] = useState<CodingDirection>('mixed')
  const [count, setCount] = useState(12)
  const [questions, setQuestions] = useState<MCQQuestion[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  function generate() {
    return generateCodingDecodingQuestions(difficulty, direction, count)
  }

  function start() {
    setQuestions(generate())
    setSessionKey((k) => k + 1)
  }

  if (questions) {
    return (
      <MCQQuizRunner
        key={sessionKey}
        gameId="coding-decoding"
        questions={questions}
        showCorrectInReview
        onExit={() => setQuestions(null)}
        onRestart={() => {
          setQuestions(generate())
          setSessionKey((k) => k + 1)
        }}
      />
    )
  }

  const pill = (active: boolean) =>
    [
      'rounded-lg px-4 py-2 text-sm font-semibold transition',
      active ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
    ].join(' ')

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/reasoning" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← Reasoning
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">Coding–Decoding</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">
        A few statements are written in a made-up code, e.g. <span className="font-mono">He is having chess</span> is
        coded as <span className="font-mono">ent ire aid sil</span> — in scrambled order. A word that appears in two
        statements has its code in both, so the overlaps reveal which code is which. Each set of statements comes
        with several questions, and every answer is fully worked out in the review afterward.
      </p>

      <div className="mt-8 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
        <h2 className="font-semibold text-slate-800 dark:text-slate-200">Difficulty</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {DIFFICULTIES.map((d) => (
            <button key={d.id} onClick={() => setDifficulty(d.id)} className={pill(difficulty === d.id)}>
              {d.label}
              <span className={['ml-1.5 font-normal', difficulty === d.id ? 'text-indigo-100' : 'text-slate-400 dark:text-slate-500'].join(' ')}>
                ({d.description})
              </span>
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Question type</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {DIRECTIONS.map((d) => (
            <button key={d.id} onClick={() => setDirection(d.id)} className={pill(direction === d.id)}>
              {d.label}
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Number of questions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUESTION_COUNTS.map((c) => (
            <button key={c} onClick={() => setCount(c)} className={pill(count === c)}>
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
