import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { GRAMMAR_CATEGORIES, RULES, STATUS_LABEL, STATUS_STYLE, getStatus, loadProgress } from '../../lib/grammarRules'

export default function RuleLab() {
  const [query, setQuery] = useState('')
  const progress = useMemo(() => loadProgress(), [])

  const q = query.trim().toLowerCase()
  const visible = RULES.filter((r) => !q || `${r.id} ${r.title} ${r.summary}`.toLowerCase().includes(q))
  const firstUnlearned = RULES.find((r) => getStatus(progress[r.id]) === 'new')

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/english/grammar-rules" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← Grammar Rules
      </Link>
      <div className="mb-6 mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">Rule Lab</h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400">Open a rule, read it, then pass the quick check to mark it learned.</p>
        </div>
        {firstUnlearned && (
          <Link
            to={`/english/grammar-rules/lab/${firstUnlearned.id}`}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
          >
            Continue with rule {firstUnlearned.id} →
          </Link>
        )}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search rules, e.g. whom, conditional, preposition…"
        className="mb-6 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400"
      />

      {GRAMMAR_CATEGORIES.map((cat) => {
        const rules = visible.filter((r) => r.category === cat)
        if (rules.length === 0) return null
        return (
          <section key={cat} className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {cat} <span className="font-normal">({rules.length})</span>
            </h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden rounded-2xl bg-white dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700">
              {rules.map((r) => {
                const status = getStatus(progress[r.id])
                return (
                  <Link
                    key={r.id}
                    to={`/english/grammar-rules/lab/${r.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  >
                    <span className="w-8 shrink-0 text-sm font-bold tabular-nums text-indigo-500">{r.id}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-200">{r.title}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{r.summary}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
                  </Link>
                )
              })}
            </div>
          </section>
        )
      })}

      {visible.length === 0 && <p className="text-center text-sm text-slate-400 dark:text-slate-500">No rules match “{query}”.</p>}
    </div>
  )
}
