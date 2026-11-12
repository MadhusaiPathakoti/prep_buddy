import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import GrammarScopePicker from '../../components/GrammarScopePicker'
import SpotRuleRunner from '../../components/SpotRuleRunner'
import { buildFreshSlots, generateFreshQuestions } from '../../lib/freshSentencesApi'
import { RULES, isSpotScope, loadProgress, startedRules, type SpotQuestion, type SpotScope } from '../../lib/grammarRules'
import { emptyScopeMessage, pillClass } from '../../lib/grammarUi'

const COUNTS = [5, 10, 15, 20]

type Stage = 'setup' | 'loading' | 'error'

export default function FreshSentences() {
  const [params] = useSearchParams()
  const initial = params.get('scope')
  const startedCount = startedRules(loadProgress()).length

  const [scope, setScope] = useState<SpotScope>(isSpotScope(initial) ? initial : 'all')
  const [count, setCount] = useState(10)
  const [stage, setStage] = useState<Stage>('setup')
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [questions, setQuestions] = useState<SpotQuestion[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  async function start() {
    const slots = buildFreshSlots(scope, count)
    if (slots.length === 0) {
      setStage('error')
      setMessage(startedCount === 0 ? '' : emptyScopeMessage(scope))
      return
    }
    setStage('loading')
    setMessage('')
    setProgress({ done: 0, total: slots.length })
    try {
      const qs = await generateFreshQuestions(slots, (done, total) => setProgress({ done, total }))
      if (qs.length === 0) {
        setStage('error')
        setMessage("The AI couldn't write any sentences right now. Check your connection and try again in a moment.")
        return
      }
      setQuestions(qs)
      setSessionKey((k) => k + 1)
      setStage('setup')
    } catch {
      setStage('error')
      setMessage('Something went wrong writing your sentences. Please try again.')
    }
  }

  if (questions) {
    return (
      <SpotRuleRunner
        key={sessionKey}
        fresh
        questions={questions}
        onExit={() => setQuestions(null)}
        onRestart={() => {
          setQuestions(null)
          void start()
        }}
      />
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/english/grammar-rules" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← Grammar Rules
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">Fresh Sentences</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">
        An AI writes brand-new sentences, every single time, using only the rules you have already started, and never ones from the rulebook.
        Name the rule each sentence breaks (or shows). Rules you miss or that are due for review come first.
      </p>

      <div className="mt-6 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 px-5 py-3 text-sm text-indigo-900 dark:text-indigo-200 ring-1 ring-indigo-200 dark:ring-indigo-500/20">
        Drawing from <span className="font-bold">{startedCount}</span> of {RULES.length} rules you've started.
        {startedCount > 0 && startedCount < RULES.length && <> Start more rules in Rule Lab to widen the pool.</>}
      </div>

      {startedCount === 0 ? (
        <div className="mt-8 rounded-3xl bg-white dark:bg-slate-800 p-8 text-center shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
          <p className="text-4xl">🌱</p>
          <h2 className="mt-3 text-xl font-bold text-slate-900 dark:text-slate-100">No rules started yet</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            This game only quizzes rules you have begun. Learn a rule in Rule Lab (or answer a question about it in any game) and it joins the pool.
          </p>
          <Link to="/english/grammar-rules/lab" className="mt-5 inline-block rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white transition hover:bg-indigo-500">
            Open Rule Lab →
          </Link>
        </div>
      ) : (
        <div className="mt-6 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
          <GrammarScopePicker scope={scope} onChange={setScope} startedOnly />

          <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Number of questions</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {COUNTS.map((c) => (
              <button key={c} onClick={() => setCount(c)} className={pillClass(count === c)}>
                {c}
              </button>
            ))}
          </div>

          {stage === 'error' && message && <p className="mt-4 rounded-lg bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{message}</p>}

          <button
            onClick={start}
            disabled={stage === 'loading'}
            className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {stage === 'loading' ? `Writing your sentences… ${progress.done}/${progress.total}` : `Start · ${count} new sentences`}
          </button>
          {stage === 'loading' && <p className="mt-3 text-center text-xs text-slate-400 dark:text-slate-500">This usually takes 5 to 15 seconds.</p>}
        </div>
      )}
    </div>
  )
}
