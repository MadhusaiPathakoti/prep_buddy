import { useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteFinished, listFinished } from '../../lib/mocks/attempts'
import { kindLabel } from '../../lib/mocks/report'
import { formatScore } from '../../lib/mocks/scoring'

export default function MockHistory() {
  const [items, setItems] = useState(() => listFinished())

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/mocks" className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
        ← Mock Tests
      </Link>
      <h1 className="mb-6 mt-3 text-3xl font-extrabold text-slate-900 dark:text-slate-100">Your results</h1>

      {items.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">No mocks attempted yet. Finished tests are saved here on this device.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-slate-900 dark:text-slate-100">{s.title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {kindLabel(s.kind)} · {new Date(s.finishedAt).toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  ✓ {s.correct} · ✕ {s.incorrect} · – {s.unattempted} · accuracy {s.accuracy.toFixed(1)}%
                </p>
              </div>
              <div className="text-right">
                <p className="text-xl font-extrabold text-slate-900 dark:text-slate-100">
                  {formatScore(s.score)}
                  <span className="text-sm font-normal text-slate-400"> /{s.maxScore}</span>
                </p>
              </div>
              <div className="flex gap-2">
                <Link to={`/mocks/result/${s.id}`} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                  View
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm('Delete this result? This cannot be undone.')) return
                    deleteFinished(s.id)
                    setItems(listFinished())
                  }}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
