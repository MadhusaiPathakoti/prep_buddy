import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import GrammarScopePicker from '../../components/GrammarScopePicker'
import { emptyScopeMessage, pillClass } from '../../lib/grammarUi'
import SpotRuleRunner from '../../components/SpotRuleRunner'
import { buildSpotQuestions, isSpotScope, type SpotQuestion, type SpotScope } from '../../lib/grammarRules'

const COUNTS = [5, 10, 15, 20, 30]

export default function SpotTheRule() {
  const [params] = useSearchParams()
  const initial = params.get('scope')

  const [scope, setScope] = useState<SpotScope>(isSpotScope(initial) ? initial : 'all')
  const [count, setCount] = useState(10)
  const [questions, setQuestions] = useState<SpotQuestion[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)
  const [message, setMessage] = useState('')

  function start() {
    const qs = buildSpotQuestions(scope, count)
    if (qs.length === 0) {
      setMessage(emptyScopeMessage(scope))
      return
    }
    setMessage('')
    setQuestions(qs)
    setSessionKey((k) => k + 1)
  }

  if (questions) {
    return <SpotRuleRunner key={sessionKey} questions={questions} onExit={() => setQuestions(null)} onRestart={start} />
  }

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
        <GrammarScopePicker scope={scope} onChange={setScope} />

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Number of questions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {COUNTS.map((c) => (
            <button key={c} onClick={() => setCount(c)} className={pillClass(count === c)}>
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
