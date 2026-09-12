import { Link } from 'react-router-dom'
import { getSummary } from '../lib/storage'

const games = [
  {
    id: 'additions',
    title: 'Additions',
    description: 'Pick a digit length for each side, e.g. double + single digit gives 23 + 9.',
    to: '/speed-math/additions',
    icon: '➕',
  },
  {
    id: 'subtraction',
    title: 'Subtraction',
    description: 'Pick a digit length for each side, e.g. double − single digit gives 45 − 7.',
    to: '/speed-math/subtraction',
    icon: '➖',
  },
  {
    id: 'division',
    title: 'Division',
    description: 'Pick a digit length for dividend and divisor, e.g. double ÷ single digit gives 84 ÷ 7.',
    to: '/speed-math/division',
    icon: '➗',
  },
  {
    id: 'tables',
    title: 'Tables Practice',
    description: 'Multiplication tables from 1× up to 30×, e.g. 28 × 17.',
    to: '/speed-math/tables',
    icon: '✖️',
  },
  {
    id: 'squares-cubes',
    title: 'Squares & Cubes',
    description: 'Squares and cubes of numbers from 1 to 150.',
    to: '/speed-math/squares-cubes',
    icon: '²³',
  },
  {
    id: 'ratios',
    title: 'Ratios to Percentage',
    description: 'Convert fractions to percentages, e.g. 1/9 = 11.11%.',
    to: '/speed-math/ratios',
    icon: '%',
  },
  {
    id: 'percent-to-ratio',
    title: 'Percentage to Ratio',
    description: 'Convert percentages to fractions in lowest terms, e.g. 25% = 1/4.',
    to: '/speed-math/percent-to-ratio',
    icon: '⅟',
  },
  {
    id: 'pythagorean-triplets',
    title: 'Pythagorean Triplets',
    description: 'Fill in the missing number in a triplet, e.g. (3, 4, _) or (_, 4, 5).',
    to: '/speed-math/pythagorean-triplets',
    icon: '△',
  },
]

export default function SpeedMath() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/" className="text-sm text-slate-400 hover:text-slate-600">
        ← All modules
      </Link>
      <div className="mb-8 mt-2">
        <h1 className="text-3xl font-extrabold text-slate-900">Speed Math</h1>
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
