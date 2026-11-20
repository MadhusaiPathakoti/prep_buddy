import { Link } from 'react-router-dom'
import { getSummary } from '../lib/storage'
import { MATH_SECTIONS } from '../lib/mathGames'

export default function Maths() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← All modules
      </Link>
      <div className="mb-8 mt-2">
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">Maths</h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">
          Speed Math: build calculation speed and accuracy, from basic drills to the shortcuts that let you work in your head.
        </p>
      </div>

      <Link
        to="/quant/bank"
        className="group mb-10 flex items-center gap-4 rounded-3xl bg-indigo-600 p-6 text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-md"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-2xl">📚</div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold">Quant Question Bank</h2>
          <p className="mt-1 text-sm text-indigo-100">
            Thousands of SBI/IBPS-style questions you can filter by topic, difficulty and exam. Every answer comes with a step-by-step solution and the exam shortcut.
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold transition group-hover:translate-x-0.5">Browse →</span>
      </Link>

      {MATH_SECTIONS.map((section) => (
        <section key={section.id} className="mb-10">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{section.title}</h2>
          <p className="mb-4 mt-1 text-sm text-slate-500 dark:text-slate-400">{section.blurb}</p>
          <div className="grid gap-5 sm:grid-cols-2">
            {section.games.map((g) => {
              const summary = getSummary(g.id)
              return (
                <Link
                  key={g.id}
                  to={g.to}
                  className="group rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-12 min-w-12 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 px-2 text-xl font-bold text-indigo-600 dark:text-indigo-400">
                      {g.icon}
                    </div>
                    {g.tag && (
                      <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:text-slate-300">{g.tag}</span>
                    )}
                  </div>
                  <h3 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">{g.title}</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{g.description}</p>
                  <div className="mt-4 flex items-center justify-between text-sm">
                    {g.stats === false ? (
                      <span />
                    ) : summary.bestAccuracy !== null ? (
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">Best {Math.round(summary.bestAccuracy)}%</span>
                    ) : (
                      <span className="font-medium text-slate-400 dark:text-slate-500">{g.cta ? 'Not practised yet' : 'Not played yet'}</span>
                    )}
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition">{g.cta ?? 'Play'} →</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
