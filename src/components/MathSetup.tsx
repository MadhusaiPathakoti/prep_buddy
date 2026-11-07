import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import QuizRunner from './QuizRunner'
import MCQQuizRunner from './MCQQuizRunner'
import FlashRunner from './FlashRunner'
import SprintRunner from './SprintRunner'
import type { FlashQuestion } from '../lib/flashGames'
import type { SetupGroup } from './ReasoningSetup'
import type { MCQQuestion } from '../lib/generators'
import type { CheckResult, Question } from '../lib/types'

interface BaseProps {
  gameId: string
  title: string
  intro: ReactNode
  /** Optional "how the shortcut works" card, collapsed by default. */
  learn?: ReactNode
  groups: SetupGroup[]
  counts?: number[]
  defaultCount?: number
}

type TypedProps = BaseProps & {
  kind: 'typed'
  generate: (choice: Record<string, string>, count: number) => Question[]
  validate: (raw: string, answer: number) => CheckResult
  inputMode?: 'numeric' | 'decimal'
  answerHint?: string
  promptSuffix?: string
}

type McqProps = BaseProps & {
  kind: 'mcq'
  generate: (choice: Record<string, string>, count: number) => MCQQuestion[]
}

type FlashProps = BaseProps & {
  kind: 'flash'
  generate: (choice: Record<string, string>, count: number) => FlashQuestion[]
  /** Milliseconds each frame stays on screen, from the chosen options. */
  frameMs: (choice: Record<string, string>) => number
}

type SprintProps = BaseProps & {
  kind: 'sprint'
  /** Length of the sprint in seconds, from the chosen options. */
  durationSec: (choice: Record<string, string>) => number
}

/** Shared setup screen for the mental-math games: pick options, then run a typed-answer or multiple-choice session. */
export default function MathSetup(props: TypedProps | McqProps | FlashProps | SprintProps) {
  const { gameId, title, intro, learn, groups, counts = [10, 20, 30, 50], defaultCount = 20 } = props
  const [choice, setChoice] = useState<Record<string, string>>(() => Object.fromEntries(groups.map((g) => [g.key, g.defaultId])))
  const [count, setCount] = useState(defaultCount)
  const [typedQs, setTypedQs] = useState<Question[] | null>(null)
  const [mcqQs, setMcqQs] = useState<MCQQuestion[] | null>(null)
  const [flashQs, setFlashQs] = useState<FlashQuestion[] | null>(null)
  const [sprinting, setSprinting] = useState(false)
  const [sessionKey, setSessionKey] = useState(0)

  function begin() {
    if (props.kind === 'typed') setTypedQs(props.generate(choice, count))
    else if (props.kind === 'mcq') setMcqQs(props.generate(choice, count))
    else if (props.kind === 'flash') setFlashQs(props.generate(choice, count))
    else setSprinting(true)
    setSessionKey((k) => k + 1)
  }
  function exit() {
    setTypedQs(null)
    setMcqQs(null)
    setFlashQs(null)
    setSprinting(false)
  }

  if (props.kind === 'typed' && typedQs) {
    return (
      <QuizRunner
        key={sessionKey}
        gameId={gameId}
        questions={typedQs}
        validate={props.validate}
        inputMode={props.inputMode}
        answerHint={props.answerHint}
        promptSuffix={props.promptSuffix}
        onExit={exit}
        onRestart={begin}
      />
    )
  }
  if (props.kind === 'mcq' && mcqQs) {
    return <MCQQuizRunner key={sessionKey} gameId={gameId} questions={mcqQs} showCorrectInReview onExit={exit} onRestart={begin} />
  }

  if (props.kind === 'flash' && flashQs) {
    return <FlashRunner key={sessionKey} gameId={gameId} questions={flashQs} frameMs={props.frameMs(choice)} onExit={exit} onRestart={begin} />
  }
  if (props.kind === 'sprint' && sprinting) {
    return <SprintRunner key={sessionKey} gameId={gameId} durationSec={props.durationSec(choice)} onExit={exit} onRestart={begin} />
  }

  const pill = (active: boolean) =>
    [
      'rounded-lg px-4 py-2 text-sm font-semibold transition',
      active ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
    ].join(' ')
  const difficultyLabel = groups.find((g) => g.key === 'difficulty')?.options.find((o) => o.id === choice.difficulty)?.label.toLowerCase()

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/maths" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← Maths
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">{title}</h1>
      <div className="mt-2 text-slate-500 dark:text-slate-400">{intro}</div>

      {learn && (
        <details className="group mt-5 rounded-2xl bg-amber-50 dark:bg-amber-500/10 px-5 py-3 ring-1 ring-amber-200 dark:ring-amber-500/20">
          <summary className="cursor-pointer text-sm font-semibold text-amber-800 dark:text-amber-300">💡 How the shortcut works</summary>
          <div className="mt-3 space-y-2 text-sm text-amber-900 dark:text-amber-100/90">{learn}</div>
        </details>
      )}

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

        {props.kind !== 'sprint' && (
          <>
            <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Number of questions</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {counts.map((c) => (
                <button key={c} onClick={() => setCount(c)} className={pill(count === c)}>
                  {c}
                </button>
              ))}
            </div>
          </>
        )}

        <button
          onClick={begin}
          className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]"
        >
          {props.kind === 'sprint'
            ? `Start sprint · ${props.durationSec(choice)} seconds`
            : `Start${difficultyLabel ? ` · ${difficultyLabel}` : ''} · ${count} questions`}
        </button>
      </div>
    </div>
  )
}
