import { Link } from 'react-router-dom'
import { getSummary } from '../lib/storage'

const games = [
  {
    id: 'vocabulary',
    title: 'Vocabulary',
    description: 'Learn words from the bank, then test yourself at easy, medium, or hard.',
    to: '/english/vocabulary',
    icon: '📚',
  },
  {
    id: 'idioms',
    title: 'Idioms',
    description: 'Learn common idioms and phrases, then test yourself at easy, medium, or hard.',
    to: '/english/idioms',
    icon: '💬',
  },
]

export default function English() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/" className="text-sm text-slate-400 hover:text-slate-600">
        ← All modules
      </Link>
      <div className="mb-8 mt-2">
        <h1 className="text-3xl font-extrabold text-slate-900">English</h1>
        <p className="mt-2 text-slate-500">Choose a game to start practicing.</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {games.map((g) => {
          const summary = getSummary(g.id)
          return (
            <Link
              key={g.id}
              to={g.to}
              className="group rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-xl font-bold text-indigo-600">
                {g.icon}
              </div>
              <h2 className="mt-4 text-xl font-bold text-slate-900">{g.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{g.description}</p>
              <div className="mt-4 flex items-center justify-between text-sm">
                {summary.bestAccuracy !== null ? (
                  <span className="font-medium text-emerald-600">Best {Math.round(summary.bestAccuracy)}%</span>
                ) : (
                  <span className="font-medium text-slate-400">Not played yet</span>
                )}
                <span className="font-semibold text-indigo-600 group-hover:translate-x-0.5 transition">Play →</span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
