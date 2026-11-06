import { Link } from 'react-router-dom'
import { RULES, loadProgress, summarize, STATUS_LABEL, type RuleStatus } from '../../lib/grammarRules'

const SEGMENTS: { status: RuleStatus; bar: string }[] = [
  { status: 'mastered', bar: 'bg-emerald-500' },
  { status: 'strong', bar: 'bg-sky-500' },
  { status: 'learning', bar: 'bg-amber-400' },
  { status: 'struggling', bar: 'bg-rose-500' },
]

export default function GrammarHub() {
  const summary = summarize(loadProgress())
  const started = summary.total - summary.byStatus.new

  const cards = [
    {
      to: '/english/grammar-rules/lab',
      icon: '📖',
      title: 'Rule Lab',
      description: `Read one rule at a time with Correct vs Incorrect examples, then pass a 3-question check to mark it learned.`,
      cta: 'Learn →',
    },
    {
      to: '/english/grammar-rules/spot',
      icon: '🎯',
      title: 'Spot the Rule',
      description: 'See a sentence and name the rule it breaks (or illustrates). Missed rules come back sooner.',
      cta: 'Play →',
    },
    {
      to: '/english/grammar-rules/map',
      icon: '🗺️',
      title: 'Mastery Map',
      description: `All ${RULES.length} rules as tiles that turn green as you master them, with spaced-repetition reviews.`,
      cta: 'Open map →',
    },
  ]

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/english" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← English
      </Link>
      <div className="mb-6 mt-2">
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">Grammar Rules</h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">
          Learn, recognise and remember all {RULES.length} rules: read the rule, name it in a sentence, and review it on a schedule.
        </p>
      </div>

      <div className="mb-8 rounded-3xl bg-white dark:bg-slate-800 p-5 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {started} of {summary.total} rules started
          </span>
          {summary.due > 0 ? (
            <Link to="/english/grammar-rules/spot?scope=due" className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
              {summary.due} due for review →
            </Link>
          ) : (
            <span className="text-slate-400 dark:text-slate-500">Nothing due right now</span>
          )}
        </div>
        <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
          {SEGMENTS.map((s) => (
            <div key={s.status} className={s.bar} style={{ width: `${(summary.byStatus[s.status] / summary.total) * 100}%` }} title={`${STATUS_LABEL[s.status]}: ${summary.byStatus[s.status]}`} />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          {SEGMENTS.map((s) => (
            <span key={s.status} className="flex items-center gap-1.5">
              <span className={`inline-block h-2 w-2 rounded-full ${s.bar}`} />
              {STATUS_LABEL[s.status]} {summary.byStatus[s.status]}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className="group rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-2xl">{c.icon}</div>
            <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">{c.title}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{c.description}</p>
            <div className="mt-4 text-sm font-semibold text-indigo-600 dark:text-indigo-400 transition group-hover:translate-x-0.5">{c.cta}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
