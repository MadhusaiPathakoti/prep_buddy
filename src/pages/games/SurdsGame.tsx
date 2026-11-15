import { useState } from 'react'
import { Link } from 'react-router-dom'
import SurdsRunner from '../../components/SurdsRunner'
import SurdTable from '../../components/SurdTable'
import { ExprView } from '../../components/SurdText'
import { generateSurdQuestions, type SurdDifficulty, type SurdQuestion } from '../../lib/surds'

const GAME_ID = 'surds'

const DIFFICULTIES: { id: SurdDifficulty; label: string; description: string }[] = [
  { id: 'easy', label: 'Easy', description: 'a√b vs c√d, clear gaps' },
  { id: 'medium', label: 'Medium', description: 'closer values, plus equal pairs like √12 and 2√3' },
  { id: 'hard', label: 'Hard', description: 'very close values and sums like √2 + √3 vs √5 + 1' },
  { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
]
const COUNTS = [10, 20, 30, 50]

const pill = (active: boolean) =>
  [
    'rounded-lg px-4 py-2 text-sm font-semibold transition',
    active ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
  ].join(' ')

type Screen = 'setup' | 'table'

export default function SurdsGame() {
  const [screen, setScreen] = useState<Screen>('setup')
  const [difficulty, setDifficulty] = useState<SurdDifficulty>('medium')
  const [count, setCount] = useState(20)
  const [questions, setQuestions] = useState<SurdQuestion[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  function begin() {
    setQuestions(generateSurdQuestions(difficulty, count))
    setSessionKey((k) => k + 1)
  }

  if (questions) {
    return (
      <SurdsRunner
        key={sessionKey}
        gameId={GAME_ID}
        questions={questions}
        onExit={() => setQuestions(null)}
        onRestart={begin}
        onViewTable={() => {
          setQuestions(null)
          setScreen('table')
        }}
      />
    )
  }

  if (screen === 'table') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <button onClick={() => setScreen('setup')} className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
          ← Back to Surds
        </button>
        <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">Surds: √2 to √20</h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">The decimal values the game checks against. Know these and most comparisons settle themselves.</p>
        <div className="mt-6">
          <SurdTable />
        </div>
        <button
          onClick={() => setScreen('setup')}
          className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]"
        >
          Back to the game
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/maths" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← Maths
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">Surds</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">
        Compare two surd expressions, like{' '}
        <span className="font-semibold text-slate-700 dark:text-slate-200">
          <ExprView expr={[{ coef: 3, rad: 2 }]} /> ? <ExprView expr={[{ coef: 2, rad: 3 }]} />
        </span>
        , and pick the relation. After you submit you see both decimal values and the verdict.
      </p>

      <button
        onClick={() => setScreen('table')}
        className="mt-5 flex w-full items-center justify-between rounded-2xl bg-white dark:bg-slate-800 px-5 py-4 text-left shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 transition hover:-translate-y-0.5 hover:shadow-md"
      >
        <span>
          <span className="block font-bold text-slate-900 dark:text-slate-100">📋 View surds</span>
          <span className="block text-sm text-slate-500 dark:text-slate-400">The decimal value of √2 to √20, with simplified forms</span>
        </span>
        <span className="font-semibold text-indigo-600 dark:text-indigo-400">Open →</span>
      </button>

      <details className="group mt-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 px-5 py-3 ring-1 ring-amber-200 dark:ring-amber-500/20">
        <summary className="cursor-pointer text-sm font-semibold text-amber-800 dark:text-amber-300">💡 How to compare without a calculator</summary>
        <div className="mt-3 space-y-2 text-sm text-amber-900 dark:text-amber-100/90">
          <p>
            <strong>Bring the number under the root.</strong> 3√2 = √(3² × 2) = √18 and 2√3 = √(2² × 3) = √12. Now compare 18 and 12: 18 is bigger, so 3√2 &gt; 2√3.
          </p>
          <p>
            <strong>Against a whole number,</strong> square it: 5√2 vs 7 → √50 vs √49 → 5√2 is larger.
          </p>
          <p>
            <strong>Sums</strong> (hard): use the decimals from the table and add them up.
          </p>
          <p>
            <strong>About ≤ and ≥:</strong> they are on the keypad as traps. If 3√2 &gt; 2√3 then "≥" is also true, but you must give the exact relation: &lt;, &gt; or = only. The result screen tells you when a ≤ or ≥ was true but not exact.
          </p>
        </div>
      </details>

      <div className="mt-6 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
        <h2 className="font-semibold text-slate-800 dark:text-slate-200">Difficulty</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {DIFFICULTIES.map((d) => (
            <button key={d.id} onClick={() => setDifficulty(d.id)} className={pill(difficulty === d.id)}>
              {d.label}
              <span className={['ml-1.5 font-normal', difficulty === d.id ? 'text-indigo-100' : 'text-slate-400 dark:text-slate-500'].join(' ')}>({d.description})</span>
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Number of questions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {COUNTS.map((c) => (
            <button key={c} onClick={() => setCount(c)} className={pill(count === c)}>
              {c}
            </button>
          ))}
        </div>

        <button onClick={begin} className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]">
          Start · {difficulty} · {count} questions
        </button>
      </div>
    </div>
  )
}
