import { Link } from 'react-router-dom'
import { SPEED_MATH_GAMES } from './SpeedMath'
import { ENGLISH_GAMES } from './English'

const modules = [
  {
    id: 'speed-math',
    title: 'Speed Math',
    description: 'Tables, squares, cubes and fraction-to-percentage drills to sharpen your calculation speed and accuracy.',
    to: '/speed-math',
    gameCount: SPEED_MATH_GAMES.length,
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
]

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-extrabold text-slate-900 sm:text-4xl">Practice modules</h1>
        <p className="mt-2 text-slate-500">Pick a module and start drilling. A few minutes a day builds real speed.</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {modules.map((m) => (
          <Link
            key={m.id}
            to={m.to}
            className="group rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-2xl">{m.icon}</div>
            <h2 className="mt-4 text-xl font-bold text-slate-900">{m.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{m.description}</p>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-400">{m.gameCount} games</span>
              <span className="font-semibold text-indigo-600 group-hover:translate-x-0.5 transition">Start →</span>
            </div>
          </Link>
        ))}

        <div className="rounded-3xl border-2 border-dashed border-slate-200 p-6 text-slate-400">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-2xl">🚧</div>
          <h2 className="mt-4 text-xl font-bold text-slate-400">More modules</h2>
          <p className="mt-1 text-sm">Reasoning and general awareness modules are coming soon.</p>
        </div>
      </div>
    </div>
  )
}
