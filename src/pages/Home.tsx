import { Link } from 'react-router-dom'
import { ALL_MATH_GAMES } from '../lib/mathGames'
import { ENGLISH_GAMES } from './English'
import { REASONING_GAMES } from './Reasoning'

const modules: { id: string; title: string; description: string; to: string; gameCount: number; icon: string; meta?: string }[] = [
  {
    id: 'daily',
    title: 'Daily dose of practice',
    description: 'One fresh SBI PO-level quiz each day for Quant, Reasoning and English. No time limit, a downloadable paper with full solutions, and re-attempts.',
    to: '/daily',
    gameCount: 0,
    meta: 'Quant · Reasoning · English',
    icon: '🔥',
  },
  {
    id: 'maths',
    title: 'Maths',
    description: 'Speed Math: mental-math shortcuts, pace and memory games, and the basic drills — tables, squares, percentages, series and more.',
    to: '/maths',
    gameCount: ALL_MATH_GAMES.length,
    icon: '⚡',
  },
  {
    id: 'english',
    title: 'English',
    description: 'Build your vocabulary with a browsable word bank and a hint-powered quiz across three difficulty levels.',
    to: '/english',
    gameCount: ENGLISH_GAMES.length,
    icon: '📚',
  },
  {
    id: 'reasoning',
    title: 'Reasoning',
    description: 'Alphanumeric and logic drills to sharpen your reasoning speed and accuracy.',
    to: '/reasoning',
    gameCount: REASONING_GAMES.length,
    icon: '🧩',
  },
  {
    id: 'mocks',
    title: 'Mocks',
    description: 'Full-length, sectional and topic-wise SBI/IBPS PO and Clerk mocks in the real test-software interface, with a downloadable PDF analysis.',
    to: '/mocks',
    gameCount: 0,
    meta: 'PO · Clerk',
    icon: '🎯',
  },
]

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 sm:text-4xl">Practice modules</h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">Pick a module and start drilling. A few minutes a day builds real speed.</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {modules.map((m) => (
          <Link
            key={m.id}
            to={m.to}
            className="group rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-2xl">{m.icon}</div>
            <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">{m.title}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{m.description}</p>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-400 dark:text-slate-500">{m.meta ?? `${m.gameCount} games`}</span>
              <span className="font-semibold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition">Start →</span>
            </div>
          </Link>
        ))}

        <div className="rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-6 text-slate-400 dark:text-slate-500">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-800 text-2xl">🚧</div>
          <h2 className="mt-4 text-xl font-bold text-slate-400 dark:text-slate-500">More modules</h2>
          <p className="mt-1 text-sm">General awareness modules are coming soon.</p>
        </div>
      </div>
    </div>
  )
}
