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
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-xl font-bold text-indigo-600 dark:text-indigo-400">
                    {g.icon}
                  </div>
                  <h3 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">{g.title}</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{g.description}</p>
                  <div className="mt-4 flex items-center justify-between text-sm">
                    {summary.bestAccuracy !== null ? (
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">Best {Math.round(summary.bestAccuracy)}%</span>
                    ) : (
                      <span className="font-medium text-slate-400 dark:text-slate-500">Not played yet</span>
                    )}
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition">Play →</span>
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
