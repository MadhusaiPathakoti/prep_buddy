import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import GrammarScopePicker from '../../components/GrammarScopePicker'
import { emptyScopeMessage, pillClass } from '../../lib/grammarUi'
import RuleSortRunner from '../../components/RuleSortRunner'
import { buildSortRounds, isSpotScope, type SortRound, type SpotScope } from '../../lib/grammarRules'

const ROUND_COUNTS = [3, 5, 8, 10]

export default function RuleSort() {
  const [params] = useSearchParams()
  const initial = params.get('scope')
  const [scope, setScope] = useState<SpotScope>(isSpotScope(initial) ? initial : 'all')
  const [roundCount, setRoundCount] = useState(5)
  const [rounds, setRounds] = useState<SortRound[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)
  const [message, setMessage] = useState('')

  function start() {
    const built = buildSortRounds(scope, roundCount)
    if (built.length === 0) {
      setMessage(emptyScopeMessage(scope))
      return
    }
    setMessage('')
    setRounds(built)
    setSessionKey((k) => k + 1)
  }

  if (rounds) {
    return <RuleSortRunner key={sessionKey} rounds={rounds} onExit={() => setRounds(null)} onRestart={start} />
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/english/grammar-rules" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← Grammar Rules
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">Rule Sorting</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">
        Each round gives you one rule and a pile of sentences. Drag every sentence into the Correct or Incorrect bucket.
        Sorting a whole set against a single rule shows you exactly where the rule starts and stops applying.
      </p>

      <div className="mt-8 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
        <GrammarScopePicker scope={scope} onChange={setScope} />

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Number of rounds (one rule each)</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {ROUND_COUNTS.map((c) => (
            <button key={c} onClick={() => setRoundCount(c)} className={pillClass(roundCount === c)}>
              {c}
            </button>
          ))}
        </div>

        {message && <p className="mt-4 rounded-lg bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">{message}</p>}

        <button onClick={start} className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]">
          Start · {roundCount} rounds
        </button>
      </div>
    </div>
  )
}
