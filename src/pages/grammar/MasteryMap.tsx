import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  GRAMMAR_CATEGORIES,
  RULES,
  STATUS_LABEL,
  STATUS_STYLE,
  getStatus,
  isDue,
  loadProgress,
  resetProgress,
  summarize,
  type RuleStatus,
} from '../../lib/grammarRules'

const LEGEND: RuleStatus[] = ['new', 'struggling', 'learning', 'strong', 'mastered']

export default function MasteryMap() {
  const [progress, setProgress] = useState(loadProgress)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [now] = useState(() => Date.now())

  const summary = summarize(progress)
  const selected = RULES.find((r) => r.id === selectedId)
  const selectedProgress = selected ? progress[selected.id] : undefined
  const selectedStatus = getStatus(selectedProgress)

  function reset() {
    if (!window.confirm('Reset all grammar progress? This cannot be undone.')) return
    resetProgress()
    setProgress({})
    setSelectedId(null)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/english/grammar-rules" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← Grammar Rules
      </Link>
      <div className="mb-6 mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">Mastery Map</h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400">Every rule is a tile. Tap one to see where you stand.</p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/english/grammar-rules/spot?scope=due"
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
          >
            Review due ({summary.due})
          </Link>
          <Link
            to="/english/grammar-rules/spot?scope=weak"
            className="rounded-xl bg-slate-100 dark:bg-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200"
          >
            Weak spots ({summary.byStatus.struggling})
          </Link>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600 dark:text-slate-300">
        {LEGEND.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`inline-block h-4 w-4 rounded ring-1 ${STATUS_STYLE[s]}`} />
            {STATUS_LABEL[s]} · {summary.byStatus[s]}
          </span>
        ))}
      </div>

      {selected && (
        <div className="mb-6 rounded-3xl bg-white dark:bg-slate-800 p-5 shadow-sm ring-1 ring-indigo-300 dark:ring-indigo-500/50">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                Rule {selected.id} · {selected.category}
              </span>
              <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">{selected.title}</h2>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${STATUS_STYLE[selectedStatus]}`}>{STATUS_LABEL[selectedStatus]}</span>
          </div>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{selected.summary}</p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {selectedProgress && selectedProgress.seen > 0
              ? `${selectedProgress.right} right · ${selectedProgress.wrong} wrong${
                  selectedProgress.due > now ? ` · next review ${new Date(selectedProgress.due).toLocaleDateString()}` : isDue(selectedProgress) ? ' · due now' : ''
                }`
              : selectedProgress?.learned
                ? 'Learned in Rule Lab · not drilled yet'
                : 'Not started yet'}
          </p>
          <Link
            to={`/english/grammar-rules/lab/${selected.id}`}
            className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            Open in Rule Lab →
          </Link>
        </div>
      )}

      {GRAMMAR_CATEGORIES.map((cat) => {
        const rules = RULES.filter((r) => r.category === cat)
        if (rules.length === 0) return null
        return (
          <section key={cat} className="mb-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{cat}</h2>
            <div className="flex flex-wrap gap-2">
              {rules.map((r) => {
                const status = getStatus(progress[r.id])
                const due = isDue(progress[r.id])
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    title={`Rule ${r.id}: ${r.title} — ${STATUS_LABEL[status]}`}
                    className={[
                      'relative h-10 w-10 rounded-lg text-sm font-bold tabular-nums ring-1 transition hover:scale-110',
                      STATUS_STYLE[status],
                      selectedId === r.id ? 'outline outline-2 outline-offset-2 outline-indigo-500' : '',
                    ].join(' ')}
                  >
                    {r.id}
                    {due && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-indigo-500 ring-2 ring-white dark:ring-slate-900" />}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}

      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">A purple dot means the rule is due for review.</p>

      <div className="mt-8 text-center">
        <button onClick={reset} className="text-xs text-slate-400 dark:text-slate-500 underline-offset-2 hover:text-rose-500 hover:underline">
          Reset grammar progress
        </button>
      </div>
    </div>
  )
}
