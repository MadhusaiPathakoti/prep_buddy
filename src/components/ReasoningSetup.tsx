import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import MCQQuizRunner, { type RunnerSnapshot } from './MCQQuizRunner'
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

/** Lets a game hand its current question to a solver page and later pick the quiz up again where it was left. */
export interface SolverLink {
  /** Route of the solver page. */
  path: string
  /** Button label on each question. */
  label: string
  /** The question as plain text the solver can read. */
  toText: (q: MCQQuestion) => string
}

interface SavedQuiz {
  questions: MCQQuestion[]
  snapshot: RunnerSnapshot
}

const resumeKey = (gameId: string) => `prepbuddy:resume:${gameId}`

interface ReasoningSetupProps {
  gameId: string
  title: string
  intro: ReactNode
  groups: SetupGroup[]
  counts?: number[]
  defaultCount?: number
  /** Builds a fresh set of questions from the chosen option ids (keyed by group key). */
  generate: (choice: Record<string, string>, count: number) => MCQQuestion[] | Promise<MCQQuestion[]>
  /** Adds a "check with solver" button to each question; the solver can send the player back to the quiz. */
  solver?: SolverLink
  /** Tips shown between the intro and the options, e.g. a <TipsCard />. */
  tips?: ReactNode
}

/** Shared setup screen for the deterministic Reasoning games: pick options, then hand the questions to MCQQuizRunner. */
export default function ReasoningSetup({ gameId, title, intro, groups, counts = [8, 12, 16, 20, 24], defaultCount = 12, generate, solver, tips }: ReasoningSetupProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [choice, setChoice] = useState<Record<string, string>>(() => Object.fromEntries(groups.map((g) => [g.key, g.defaultId])))
  const [count, setCount] = useState(defaultCount)
  // coming back from the solver (history state { resume: true }) the quiz is rebuilt from what was saved when the player left
  const [saved] = useState<SavedQuiz | null>(() => {
    if (!solver || !(location.state as { resume?: boolean } | null)?.resume) return null
    try {
      const raw = sessionStorage.getItem(resumeKey(gameId))
      const parsed = raw ? (JSON.parse(raw) as SavedQuiz) : null
      return parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0 && parsed.snapshot ? parsed : null
    } catch {
      return null
    }
  })
  useEffect(() => {
    if (saved) {
      try {
        sessionStorage.removeItem(resumeKey(gameId))
      } catch {
        // nothing to clean up
      }
    }
  }, [saved, gameId])
  const [questions, setQuestions] = useState<MCQQuestion[] | null>(saved?.questions ?? null)
  const [initial, setInitial] = useState<RunnerSnapshot | null>(saved?.snapshot ?? null)
  const [sessionKey, setSessionKey] = useState(0)

  const [preparing, setPreparing] = useState(false)

  function start(qs: MCQQuestion[]) {
    setQuestions(qs)
    setInitial(null)
    setSessionKey((k) => k + 1)
  }

  function begin() {
    if (preparing) return
    const made = generate(choice, count)
    if (Array.isArray(made)) {
      start(made)
      return
    }
    // a game that needs a moment to build its questions: show the setup screen with a waiting button meanwhile
    setQuestions(null)
    setPreparing(true)
    made
      .then(start)
      .catch(() => undefined)
      .finally(() => setPreparing(false))
  }

  function checkWithSolver(q: MCQQuestion, snapshot: RunnerSnapshot) {
    if (!solver || !questions) return
    try {
      sessionStorage.setItem(resumeKey(gameId), JSON.stringify({ questions, snapshot } satisfies SavedQuiz))
    } catch {
      // storage unavailable: the solver still opens, but the quiz cannot be picked up again
    }
    // mark this history entry as "resume me", so both the solver's back button and the browser's Back return to the quiz
    navigate(location.pathname, { replace: true, state: { resume: true } })
    navigate(solver.path, { state: { text: solver.toText(q), returnTo: location.pathname } })
  }

  if (questions) {
    return (
      <MCQQuizRunner
        key={sessionKey}
        gameId={gameId}
        questions={questions}
        showCorrectInReview
        initial={initial}
        onCheckWithSolver={solver ? checkWithSolver : undefined}
        solverLabel={solver?.label}
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
      {tips}

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
          disabled={preparing}
          className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
        >
          {preparing ? 'Preparing your questions…' : `Start${difficultyLabel ? ` · ${difficultyLabel}` : ''} · ${count} questions`}
        </button>
      </div>
    </div>
  )
}
