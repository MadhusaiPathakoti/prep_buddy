import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import FixItRunner from '../../components/FixItRunner'
import GrammarScopePicker from '../../components/GrammarScopePicker'
import { emptyScopeMessage, pillClass } from '../../lib/grammarUi'
import { buildFixCards, isSpotScope, type FixCard, type SpotScope } from '../../lib/grammarRules'

const COUNTS = [5, 10, 15, 20]

export default function FixIt() {
  const [params] = useSearchParams()
  const initial = params.get('scope')
  const [scope, setScope] = useState<SpotScope>(isSpotScope(initial) ? initial : 'all')
  const [count, setCount] = useState(10)
  const [cards, setCards] = useState<FixCard[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)
  const [message, setMessage] = useState('')

  function start() {
    const built = buildFixCards(scope, count)
    if (built.length === 0) {
      setMessage(emptyScopeMessage(scope))
      return
    }
    setMessage('')
    setCards(built)
    setSessionKey((k) => k + 1)
  }

  if (cards) {
    return <FixItRunner key={sessionKey} cards={cards} onExit={() => setCards(null)} onRestart={start} />
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/english/grammar-rules" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← Grammar Rules
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">Fix-It Flip Cards</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">
        Each card shows a sentence with a grammar mistake. Type the corrected sentence yourself, then flip the card to
        compare it with the book's answer and the rule behind it. Recalling the fix from scratch is what makes rules stick.
      </p>

      <div className="mt-8 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
        <GrammarScopePicker scope={scope} onChange={setScope} />

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Number of cards</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {COUNTS.map((c) => (
            <button key={c} onClick={() => setCount(c)} className={pillClass(count === c)}>
              {c}
            </button>
          ))}
        </div>

        {message && <p className="mt-4 rounded-lg bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">{message}</p>}

        <button onClick={start} className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]">
          Start · {count} cards
        </button>
      </div>
    </div>
  )
}
