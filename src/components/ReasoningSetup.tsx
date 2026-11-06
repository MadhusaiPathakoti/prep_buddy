import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import MCQQuizRunner from './MCQQuizRunner'
import type { MCQQuestion } from '../lib/generators'

export interface SetupOption {
  id: string
  label: string
  description?: string
}

export interface SetupGroup {
  key: string
  title: string
  options: SetupOption[]
  defaultId: string
}

interface ReasoningSetupProps {
  gameId: string
  title: string
  intro: ReactNode
  groups: SetupGroup[]
  counts?: number[]
  defaultCount?: number
  /** Builds a fresh set of questions from the chosen option ids (keyed by group key). */
  generate: (choice: Record<string, string>, count: number) => MCQQuestion[]
}

/** Shared setup screen for the deterministic Reasoning games: pick options, then hand the questions to MCQQuizRunner. */
export default function ReasoningSetup({ gameId, title, intro, groups, counts = [8, 12, 16, 20, 24], defaultCount = 12, generate }: ReasoningSetupProps) {
  const [choice, setChoice] = useState<Record<string, string>>(() => Object.fromEntries(groups.map((g) => [g.key, g.defaultId])))
  const [count, setCount] = useState(defaultCount)
  const [questions, setQuestions] = useState<MCQQuestion[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  function begin() {
    setQuestions(generate(choice, count))
    setSessionKey((k) => k + 1)
  }

  if (questions) {
    return (
      <MCQQuizRunner
        key={sessionKey}
        gameId={gameId}
        questions={questions}
        showCorrectInReview
        onExit={() => setQuestions(null)}
        onRestart={begin}
      />
    )
  }

  const pill = (active: boolean) =>
    [
      'rounded-lg px-4 py-2 text-sm font-semibold transition',
      active ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
    ].join(' ')

  const difficultyLabel = groups.find((g) => g.key === 'difficulty')?.options.find((o) => o.id === choice.difficulty)?.label.toLowerCase()

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/reasoning" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← Reasoning
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">{title}</h1>
      <div className="mt-2 text-slate-500 dark:text-slate-400">{intro}</div>

      <div className="mt-8 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
        {groups.map((g, gi) => (
          <div key={g.key}>
            <h2 className={['font-semibold text-slate-800 dark:text-slate-200', gi > 0 ? 'mt-6' : ''].join(' ')}>{g.title}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {g.options.map((o) => {
                const active = choice[g.key] === o.id
                return (
                  <button key={o.id} onClick={() => setChoice((c) => ({ ...c, [g.key]: o.id }))} className={pill(active)}>
                    {o.label}
                    {o.description && (
                      <span className={['ml-1.5 font-normal', active ? 'text-indigo-100' : 'text-slate-400 dark:text-slate-500'].join(' ')}>({o.description})</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Number of questions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {counts.map((c) => (
            <button key={c} onClick={() => setCount(c)} className={pill(count === c)}>
              {c}
            </button>
          ))}
        </div>

        <button
          onClick={begin}
          className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]"
        >
          Start{difficultyLabel ? ` · ${difficultyLabel}` : ''} · {count} questions
        </button>
      </div>
    </div>
  )
}
