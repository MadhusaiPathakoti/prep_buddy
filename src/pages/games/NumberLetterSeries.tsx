import { useState } from 'react'
import { Link } from 'react-router-dom'
import MCQQuizRunner from '../../components/MCQQuizRunner'
import type { MCQQuestion } from '../../lib/generators'
import { generateSeriesQuestions, type SeriesDifficulty, type SeriesKind, type SeriesTask } from '../../lib/series'

const QUESTION_COUNTS = [10, 15, 20, 30]

const KINDS: { id: SeriesKind; label: string }[] = [
  { id: 'mixed', label: 'Numbers & letters' },
  { id: 'number', label: 'Number series' },
  { id: 'letter', label: 'Letter series' },
]

const TASKS: { id: SeriesTask; label: string }[] = [
  { id: 'mixed', label: 'Next & wrong term' },
  { id: 'next', label: 'Find the next term' },
  { id: 'wrong', label: 'Find the wrong term' },
]

const DIFFICULTIES: { id: SeriesDifficulty; label: string; description: string }[] = [
  { id: 'easy', label: 'Easy', description: 'steady steps, squares, ×2/×3' },
  { id: 'medium', label: 'Medium', description: 'cubes, ×a+b, primes, interleaved' },
  { id: 'hard', label: 'Hard', description: 'n²±n, Fibonacci-like, growing ×+, letter pairs' },
  { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
]

export default function NumberLetterSeries() {
  const [kind, setKind] = useState<SeriesKind>('mixed')
  const [task, setTask] = useState<SeriesTask>('mixed')
  const [difficulty, setDifficulty] = useState<SeriesDifficulty>('medium')
  const [count, setCount] = useState(15)
  const [questions, setQuestions] = useState<MCQQuestion[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  function generate() {
    return generateSeriesQuestions(kind, task, difficulty, count)
  }

  function start() {
    setQuestions(generate())
    setSessionKey((k) => k + 1)
  }

  if (questions) {
    return (
      <MCQQuizRunner
        key={sessionKey}
        gameId="number-letter-series"
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
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">Number & Letter Series</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">
        A series follows a hidden rule. Either find the <span className="font-semibold">next term</span>, e.g.{' '}
        <span className="font-mono">3, 6, 12, 24, ?</span>, or spot the <span className="font-semibold">wrong term</span>{' '}
        that breaks the rule, e.g. <span className="font-mono">2, 5, 10, 17, 26, 36, 50</span>. After the round, every
        question comes back with the rule behind it.
      </p>

      <div className="mt-8 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
        <h2 className="font-semibold text-slate-800 dark:text-slate-200">Series type</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button key={k.id} onClick={() => setKind(k.id)} className={pill(kind === k.id)}>
              {k.label}
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Question type</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {TASKS.map((t) => (
            <button key={t.id} onClick={() => setTask(t.id)} className={pill(task === t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Difficulty</h2>
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
