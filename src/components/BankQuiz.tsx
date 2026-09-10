import { useState } from 'react'
import { Link } from 'react-router-dom'
import MCQQuizRunner from './MCQQuizRunner'
import { generateMCQQuestions, type MCQQuestion } from '../lib/generators'
import { getFavoriteIds } from '../lib/favorites'
import type { BankEntry, Difficulty } from '../lib/types'

const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
]
const QUESTION_COUNTS = [5, 10, 15, 20]

interface BankQuizProps {
  gameId: string
  bankKey: string
  bank: BankEntry[]
  backTo: string
  backLabel: string
  title: string
  description: string
  noun: string
}

export default function BankQuiz({ gameId, bankKey, bank, backTo, backLabel, title, description, noun }: BankQuizProps) {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [count, setCount] = useState(10)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [questions, setQuestions] = useState<MCQQuestion[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  const favoriteIds = getFavoriteIds(bankKey)
  const hasFavorites = favoriteIds.size > 0
  const activeBank = favoritesOnly ? bank.filter((w) => favoriteIds.has(w.id)) : bank
  const poolSize = activeBank.filter((w) => w.difficulty === difficulty).length
  const canStart = poolSize > 0

  function generate() {
    return generateMCQQuestions(activeBank, difficulty, count)
  }

  function start() {
    setQuestions(generate())
    setSessionKey((k) => k + 1)
  }

  if (questions) {
    return (
      <MCQQuizRunner
        key={sessionKey}
        gameId={gameId}
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
      <Link to={backTo} className="text-sm text-slate-400 hover:text-slate-600">
        ← {backLabel}
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900">{title}</h1>
      <p className="mt-2 text-slate-500">{description}</p>

      <div className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="font-semibold text-slate-800">Toughness</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              onClick={() => setDifficulty(d.id)}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition',
                difficulty === d.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {d.label}
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800">Source</h2>
        <button
          onClick={() => setFavoritesOnly((v) => !v)}
          className={[
            'mt-3 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition',
            favoritesOnly ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
          ].join(' ')}
        >
          <span>★</span> Quiz only from favourites
        </button>
        {favoritesOnly && !hasFavorites && (
          <p className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
            You haven't added any {noun} to favourites yet. Go to the library and tap ☆ on the ones you want to
            revise, then come back to quiz yourself on them.
          </p>
        )}

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
        <p className="mt-2 text-xs text-slate-400">
          {poolSize} {favoritesOnly ? 'favourite ' : ''}
          {noun} available at {difficulty} difficulty.
        </p>

        <button
          onClick={start}
          disabled={!canStart}
          className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {canStart
            ? `Start · ${difficulty} · ${Math.min(count, poolSize)} questions`
            : favoritesOnly && !hasFavorites
              ? 'Add favourites first'
              : `No ${favoritesOnly ? 'favourite ' : ''}${noun} at ${difficulty} difficulty`}
        </button>
      </div>
    </div>
  )
}
