import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import SpotRuleRunner from '../../components/SpotRuleRunner'
import {
  GRAMMAR_CATEGORIES,
  RULES,
  buildSpotQuestions,
  getStatus,
  isDue,
  loadProgress,
  type SpotQuestion,
  type SpotScope,
} from '../../lib/grammarRules'

const COUNTS = [5, 10, 15, 20, 30]

function isScope(value: string | null): value is SpotScope {
  return value === 'all' || value === 'due' || value === 'weak' || (GRAMMAR_CATEGORIES as readonly string[]).includes(value ?? '')
}

export default function SpotTheRule() {
  const [params] = useSearchParams()
  const initial = params.get('scope')
  const progress = loadProgress()
  const dueCount = RULES.filter((r) => isDue(progress[r.id])).length
  const weakCount = RULES.filter((r) => getStatus(progress[r.id]) === 'struggling').length

  const [scope, setScope] = useState<SpotScope>(isScope(initial) ? initial : 'all')
  const [count, setCount] = useState(10)
  const [questions, setQuestions] = useState<SpotQuestion[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)
  const [message, setMessage] = useState('')

  function start() {
    const qs = buildSpotQuestions(scope, count)
    if (qs.length === 0) {
      setMessage(
        scope === 'due'
          ? 'Nothing is due for review yet — learn a few rules in Rule Lab first, or pick "All rules".'
          : scope === 'weak'
            ? 'No rules are marked "Needs work" right now. Nice!'
            : 'No questions available for that selection.',
      )
      return
    }
    setMessage('')
    setQuestions(qs)
    setSessionKey((k) => k + 1)
  }

  if (questions) {
    return (
      <SpotRuleRunner
        key={sessionKey}
        questions={questions}
        onExit={() => setQuestions(null)}
        onRestart={start}
      />
    )
  }

  const scopes: { id: SpotScope; label: string }[] = [
    { id: 'all', label: `All rules (${RULES.length})` },
    { id: 'due', label: `Due for review (${dueCount})` },
    { id: 'weak', label: `Needs work (${weakCount})` },
  ]

  const pill = (active: boolean) =>
    [
      'rounded-lg px-4 py-2 text-sm font-semibold transition',
      active ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
    ].join(' ')

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/english/grammar-rules" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← Grammar Rules
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">Spot the Rule</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">
        You'll see a sentence from the rulebook. Name the rule it breaks (or shows). Rules you miss or that are due for
        review are asked first, so the ones you're shaky on come back until they stick.
      </p>

      <div className="mt-8 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
        <h2 className="font-semibold text-slate-800 dark:text-slate-200">Practice</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {scopes.map((s) => (
            <button key={s.id} onClick={() => setScope(s.id)} className={pill(scope === s.id)}>
              {s.label}
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Or one topic</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {GRAMMAR_CATEGORIES.map((c) => (
            <button key={c} onClick={() => setScope(c)} className={pill(scope === c)}>
              {c}
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

        {message && <p className="mt-4 rounded-lg bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">{message}</p>}

        <button onClick={start} className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]">
          Start · {count} questions
        </button>
      </div>
    </div>
  )
}
