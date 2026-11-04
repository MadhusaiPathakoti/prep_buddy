import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EXAMS } from '../../lib/mocks/blueprints'
import { clearActive, listFinished, loadActive } from '../../lib/mocks/attempts'

export default function MocksHome() {
  const navigate = useNavigate()
  const [active, setActive] = useState(() => loadActive())
  const finished = listFinished()

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/" className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
        ← All modules
      </Link>
      <div className="mb-8 mt-3 text-center">
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 sm:text-4xl">Mock Tests</h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">Exam-pattern mocks with the real test-software interface. Every paper is freshly generated.</p>
      </div>

      {active && active.phase !== 'finished' && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
          <div>
            <p className="font-semibold text-amber-900 dark:text-amber-200">You have an unfinished test</p>
            <p className="text-sm text-amber-800 dark:text-amber-300">{active.paper.title}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => navigate(`/mocks/test/${active.id}`)} className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700">
              {active.phase === 'running' ? 'Resume' : 'Open'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Discard this unfinished test? Your answers will be lost.')) {
                  clearActive()
                  setActive(null)
                }
              }}
              className="rounded-xl border border-amber-400 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-500/20"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {(['po', 'clerk'] as const).map((id) => {
          const e = EXAMS[id]
          const hard = e.difficulty === 'hard'
          return (
            <Link
              key={id}
              to={`/mocks/${id}`}
              className="group rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-800 dark:ring-slate-700"
            >
              <div className="flex items-center justify-between">
                <span className="text-3xl">{hard ? '🎯' : '📝'}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${hard ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'}`}>
                  {hard ? 'Hard' : 'Medium'}
                </span>
              </div>
              <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">{e.name}</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{e.tagline}</p>
              <p className="mt-4 text-sm font-semibold text-indigo-600 transition group-hover:translate-x-0.5 dark:text-indigo-400">Choose a mock →</p>
            </Link>
          )
        })}
      </div>

      <div className="mt-8 flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
        <div>
          <p className="font-semibold text-slate-900 dark:text-slate-100">Your results</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{finished.length === 0 ? 'No mocks attempted yet.' : `${finished.length} attempt${finished.length === 1 ? '' : 's'} saved on this device.`}</p>
        </div>
        <Link to="/mocks/history" className="rounded-xl border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 dark:border-indigo-500/40 dark:text-indigo-300 dark:hover:bg-indigo-500/10">
          View history
        </Link>
      </div>
    </div>
  )
}
