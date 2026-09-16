import { useState } from 'react'
import { Link } from 'react-router-dom'
import MCQQuizRunner from './MCQQuizRunner'
import { generateWordMCQQuestions, type MCQQuestion } from '../lib/generators'
import { getFavoriteIds } from '../lib/favorites'
import type { Difficulty, WordEntry } from '../lib/types'

const BANK_KEY = 'word-bank'

type Toughness = Difficulty | 'mixed'

const DIFFICULTIES: { id: Toughness; label: string }[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
  { id: 'mixed', label: 'Mixed' },
]
const QUESTION_COUNTS = [5, 10, 15, 20]

type FreshnessUnit = 'any' | 'days' | 'weeks' | 'months'

const FRESHNESS_UNITS: { id: FreshnessUnit; label: string }[] = [
  { id: 'any', label: 'Any time' },
  { id: 'days', label: 'Days' },
  { id: 'weeks', label: 'Weeks' },
  { id: 'months', label: 'Months' },
]
const FRESHNESS_AMOUNTS: Record<Exclude<FreshnessUnit, 'any'>, number[]> = {
  days: [1, 3, 7, 14, 30],
  weeks: [1, 2, 4, 8],
  months: [1, 3, 6, 12],
}
const DEFAULT_FRESHNESS_AMOUNT: Record<Exclude<FreshnessUnit, 'any'>, number> = { days: 7, weeks: 1, months: 1 }
const DAY_MS = 24 * 60 * 60 * 1000

function freshnessWindowMs(unit: Exclude<FreshnessUnit, 'any'>, amount: number): number {
  if (unit === 'days') return amount * DAY_MS
  if (unit === 'weeks') return amount * 7 * DAY_MS
  return amount * 30 * DAY_MS // months approximated as 30 days
}

interface WordBankQuizProps {
  gameId: string
  field: 'synonyms' | 'antonyms'
  bank: WordEntry[]
  backTo: string
  backLabel: string
  title: string
  description: string
  noun: string
}

export default function WordBankQuiz({ gameId, field, bank, backTo, backLabel, title, description, noun }: WordBankQuizProps) {
  const [difficulty, setDifficulty] = useState<Toughness>('easy')
  const [count, setCount] = useState(10)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [freshnessUnit, setFreshnessUnit] = useState<FreshnessUnit>('any')
  const [freshnessAmount, setFreshnessAmount] = useState(7)
  const [questions, setQuestions] = useState<MCQQuestion[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  const favoriteIds = getFavoriteIds(BANK_KEY)
  const hasFavorites = favoriteIds.size > 0
  const quizzable = bank.filter((w) => w[field].length > 0)
  const freshBank =
    freshnessUnit === 'any'
      ? quizzable
      : quizzable.filter((w) => Date.now() - new Date(w.createdAt).getTime() <= freshnessWindowMs(freshnessUnit, freshnessAmount))
  const activeBank = favoritesOnly ? freshBank.filter((w) => favoriteIds.has(w.id)) : freshBank
  const poolSize = difficulty === 'mixed' ? activeBank.length : activeBank.filter((w) => w.difficulty === difficulty).length
  const canStart = poolSize > 0
  const difficultyLabel = difficulty === 'mixed' ? 'all difficulties' : `${difficulty} difficulty`
  const freshnessLabel = freshnessUnit === 'any' ? '' : ` added in the last ${freshnessAmount} ${freshnessUnit}`

  function changeFreshnessUnit(unit: FreshnessUnit) {
    setFreshnessUnit(unit)
    if (unit !== 'any') setFreshnessAmount(DEFAULT_FRESHNESS_AMOUNT[unit])
  }

  function generate() {
    return generateWordMCQQuestions(activeBank, field, difficulty, count)
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
            You haven't added any words to favourites yet. Go to the library and tap ☆ on the ones you want to
            revise, then come back to quiz yourself on them.
          </p>
        )}

        <h2 className="mt-6 font-semibold text-slate-800">Freshness</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {FRESHNESS_UNITS.map((u) => (
            <button
              key={u.id}
              onClick={() => changeFreshnessUnit(u.id)}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition',
                freshnessUnit === u.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {u.label}
            </button>
          ))}
        </div>
        {freshnessUnit !== 'any' && (
          <div className="mt-3 flex flex-wrap gap-2">
            {FRESHNESS_AMOUNTS[freshnessUnit].map((a) => (
              <button
                key={a}
                onClick={() => setFreshnessAmount(a)}
                className={[
                  'rounded-lg px-4 py-2 text-sm font-semibold transition',
                  freshnessAmount === a ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                ].join(' ')}
              >
                Last {a} {a === 1 ? freshnessUnit.replace(/s$/, '') : freshnessUnit}
              </button>
            ))}
          </div>
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
          {noun} available at {difficultyLabel}
          {freshnessLabel}.
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
              : `No ${favoritesOnly ? 'favourite ' : ''}${noun} at ${difficultyLabel}${freshnessLabel}`}
        </button>
      </div>
    </div>
  )
}
