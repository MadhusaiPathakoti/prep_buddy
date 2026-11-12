import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { VEDIC_IMPLS, type Problem, type VedicImpl } from '../../lib/vedic'
import { VEDIC_META, vedicMetaById, type VedicMeta } from '../../lib/vedicCatalog'

const card = 'rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700'

/** A fresh, easy example for "Show me another". */
function randomExample(impl: VedicImpl): Problem {
  const choice: Record<string, string> = { difficulty: 'easy' }
  for (const g of impl.groups) if (g.key !== 'difficulty') choice[g.key] = g.defaultId
  for (let i = 0; i < 100; i++) {
    const args = impl.random(choice, 0)
    if (args) return impl.solve(args)
  }
  return impl.solve(impl.demos[0])
}

/** One worked example: the learner can guess first, then reveal the working one step at a time. */
function Walkthrough({ problem }: { problem: Problem }) {
  const [shown, setShown] = useState(0)
  const [guess, setGuess] = useState('')
  const [checked, setChecked] = useState(false)
  const total = problem.steps.length
  const done = shown >= total
  const guessedRight = checked && Number(guess.replace(/[^0-9]/g, '')) === problem.answer

  return (
    <div>
      <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/40 px-4 py-6 text-center">
        <div className="font-mono text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
          {problem.prompt} <span className="text-slate-300 dark:text-slate-600">=</span> {done ? <span className="text-emerald-600 dark:text-emerald-400">{problem.answer}</span> : '?'}
        </div>
        {!done && (
          <form
            className="mt-4 flex flex-wrap items-center justify-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (guess.trim() !== '') setChecked(true)
            }}
          >
            <label className="text-sm text-slate-500 dark:text-slate-400" htmlFor="vedic-guess">
              Have a go first?
            </label>
            <input
              id="vedic-guess"
              value={guess}
              onChange={(e) => {
                setGuess(e.target.value)
                setChecked(false)
              }}
              inputMode="numeric"
              autoComplete="off"
              placeholder="your answer"
              className="w-32 rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-center font-mono text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400"
            />
            <button type="submit" className="rounded-lg bg-slate-200 dark:bg-slate-700 px-3 py-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600">
              Check
            </button>
          </form>
        )}
        {checked && !done && (
          <p className={['mt-3 text-sm font-medium', guessedRight ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'].join(' ')}>
            {guessedRight ? 'Spot on! Step through it to see the shortcut behind your answer.' : 'Not quite. Step through the working to see where the trick lands.'}
          </p>
        )}
      </div>

      {shown > 0 && (
        <ol className="mt-4 space-y-2">
          {problem.steps.slice(0, shown).map((s, i) => (
            <li key={i} className="flex gap-3 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 px-4 py-3 text-sm text-slate-800 dark:text-slate-200">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">{i + 1}</span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!done && (
          <>
            <button onClick={() => setShown((n) => n + 1)} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]">
              {shown === 0 ? 'Show step 1' : `Next step (${shown + 1}/${total})`}
            </button>
            <button onClick={() => setShown(total)} className="rounded-xl bg-slate-100 dark:bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600">
              Show all
            </button>
          </>
        )}
        {done && (
          <>
            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">✓ {problem.prompt} = {problem.answer}</span>
            <button onClick={() => setShown(0)} className="ml-auto rounded-xl bg-slate-100 dark:bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600">
              Replay
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Lesson({ meta, impl }: { meta: VedicMeta; impl: VedicImpl }) {
  const [examples, setExamples] = useState<Problem[]>(() => impl.demos.map((d) => impl.solve(d)))
  const [idx, setIdx] = useState(0)
  const order = VEDIC_META.findIndex((m) => m.id === meta.id)
  const prev = VEDIC_META[order - 1]
  const next = VEDIC_META[order + 1]
  const practiceTo = `/maths/vedic/${meta.id}/practice`

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/maths" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← Maths
      </Link>

      <div className="mt-2 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        <span className="text-indigo-600 dark:text-indigo-400">1 · Learn</span>
        <span>›</span>
        <span>2 · Watch it work</span>
        <span>›</span>
        <span>3 · Practise</span>
      </div>

      <h1 className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-slate-100">{meta.title}</h1>
      <p className="mt-1 text-sm italic text-slate-500 dark:text-slate-400">Sutra: {meta.sutra}</p>
      <p className="mt-3 rounded-2xl bg-amber-50 dark:bg-amber-500/10 px-4 py-3 font-mono text-sm text-amber-900 dark:text-amber-200 ring-1 ring-amber-200 dark:ring-amber-500/20">{meta.blurb}</p>

      <section className={`${card} mt-6`}>
        <h2 className="font-bold text-slate-900 dark:text-slate-100">Why it works</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{impl.idea}</p>
      </section>

      <section className={`${card} mt-5`}>
        <h2 className="font-bold text-slate-900 dark:text-slate-100">The recipe</h2>
        <ol className="mt-3 space-y-2">
          {impl.recipe.map((r, i) => (
            <li key={i} className="flex gap-3 text-sm text-slate-700 dark:text-slate-300">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-xs font-bold text-slate-600 dark:text-slate-200">{i + 1}</span>
              <span className="pt-0.5">{r}</span>
            </li>
          ))}
        </ol>
        {impl.tip && <p className="mt-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200">💡 {impl.tip}</p>}
      </section>

      <section className={`${card} mt-5`}>
        <h2 className="font-bold text-slate-900 dark:text-slate-100">Watch it work</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {examples.map((p, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={[
                'rounded-lg px-3 py-1.5 font-mono text-sm font-semibold transition',
                i === idx ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600',
              ].join(' ')}
            >
              {p.prompt}
            </button>
          ))}
          <button
            onClick={() => {
              setExamples((ex) => [...ex, randomExample(impl)])
              setIdx(examples.length)
            }}
            className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            + Another
          </button>
        </div>
        <div className="mt-4">
          <Walkthrough key={`${idx}-${examples[idx].prompt}`} problem={examples[idx]} />
        </div>
      </section>

      <Link
        to={practiceTo}
        className="mt-6 block w-full rounded-xl bg-indigo-600 px-4 py-3 text-center font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]"
      >
        Got it. Start the practice game →
      </Link>

      {impl.related && (
        <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
          Related: <Link to={impl.related.to} className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline">{impl.related.label}</Link>
        </p>
      )}

      <div className="mt-8 flex items-center justify-between gap-4 border-t border-slate-200 dark:border-slate-700 pt-4 text-sm">
        {prev ? (
          <Link to={`/maths/vedic/${prev.id}`} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            ← {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link to={`/maths/vedic/${next.id}`} className="text-right text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            {next.title} →
          </Link>
        )}
      </div>
    </div>
  )
}

export default function VedicLesson() {
  const { trick = '' } = useParams()
  const meta = vedicMetaById(trick)
  const impl = VEDIC_IMPLS[trick]
  if (!meta || !impl) return <Navigate to="/maths" replace />
  return <Lesson key={trick} meta={meta} impl={impl} />
}
