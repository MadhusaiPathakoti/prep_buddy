import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import GrammarScopePicker from '../../components/GrammarScopePicker'
import { emptyScopeMessage, pillClass } from '../../lib/grammarUi'
import RuleDuelRunner, { MAX_STRIKES } from '../../components/RuleDuelRunner'
import { buildDuelItems, isSpotScope, type DuelItem, type SpotScope } from '../../lib/grammarRules'

const DURATIONS = [30, 45, 60, 90]
const DECK_SIZE = 60

export default function RuleDuel() {
  const [params] = useSearchParams()
  const initial = params.get('scope')
  const [scope, setScope] = useState<SpotScope>(isSpotScope(initial) ? initial : 'all')
  const [duration, setDuration] = useState(60)
  const [items, setItems] = useState<DuelItem[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)
  const [message, setMessage] = useState('')

  function start() {
    const built = buildDuelItems(scope, DECK_SIZE)
    if (built.length === 0) {
      setMessage(emptyScopeMessage(scope))
      return
    }
    setMessage('')
    setItems(built)
    setSessionKey((k) => k + 1)
  }

  if (items) {
    return <RuleDuelRunner key={sessionKey} items={items} durationSec={duration} onExit={() => setItems(null)} onRestart={start} />
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/english/grammar-rules" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← Grammar Rules
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">Rule Duel</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">
        Sentences fly at you one at a time — judge each as Correct or Incorrect as fast as you can. Streaks multiply your
        points, and {MAX_STRIKES} wrong answers end the duel. Use the ← and → arrow keys to play faster.
      </p>

      <div className="mt-8 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
        <GrammarScopePicker scope={scope} onChange={setScope} />

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Time limit</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {DURATIONS.map((d) => (
            <button key={d} onClick={() => setDuration(d)} className={pillClass(duration === d)}>
              {d}s
            </button>
          ))}
        </div>

        {message && <p className="mt-4 rounded-lg bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">{message}</p>}

        <button onClick={start} className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]">
          Start duel · {duration}s
        </button>
      </div>
    </div>
  )
}
