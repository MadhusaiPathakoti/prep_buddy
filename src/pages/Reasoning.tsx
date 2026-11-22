import { Link } from 'react-router-dom'
import { getSummary } from '../lib/storage'

export const REASONING_GAMES = [
  {
    id: 'alpha-numeric-test',
    title: 'Alpha Numeric Test',
    description: 'Convert letters to position numbers and back, e.g. C = 3 or Y = -2.',
    to: '/reasoning/alpha-numeric-test',
    icon: 'A1',
  },
  {
    id: 'alpha-num-series',
    title: 'Alphanumeric Series',
    description: 'A row of letters, numbers and symbols — e.g. which element is 12th to the left of the 15th from the right, or how many even numbers sit between a vowel and a consonant.',
    to: '/reasoning/alpha-num-series',
    icon: 'D2@',
  },
  {
    id: 'letter-pairs',
    title: 'Letter Pairs',
    description: 'In FINANCIAL, how many pairs of letters have the same gap as in the alphabet? Plus alphabetical-order word puzzles, with quick-solve tips.',
    to: '/reasoning/letter-pairs',
    icon: 'A·C',
  },
  {
    id: 'number-arrangement',
    title: 'Number Arrangement',
    description: 'Five three-digit numbers: the third lowest, the one beside it, digit tests, "if 3 is added to each…", swapped digits — with quick-solve tips.',
    to: '/reasoning/number-arrangement',
    icon: '123',
  },
  {
    id: 'statement-conclusions',
    title: 'Statement & Conclusions',
    description: 'Coded inequality chains, e.g. F > R ≥ T = E — decide which conclusions definitely follow.',
    to: '/reasoning/statement-conclusions',
    icon: '≥',
  },
  {
    id: 'number-letter-series',
    title: 'Number & Letter Series',
    description: 'Find the next term or spot the wrong one, e.g. 3, 6, 12, 24, ? or B, D, G, K, ?',
    to: '/reasoning/number-letter-series',
    icon: '→?',
  },
  {
    id: 'coding-decoding',
    title: 'Coding–Decoding',
    description: 'Coded statements share words and codes — work out which code is which, e.g. the code for \'having\'.',
    to: '/reasoning/coding-decoding',
    icon: '⌗',
  },
  {
    id: 'syllogism',
    title: 'Syllogism',
    description: 'Which conclusions follow from the statements? Venn-checked verdicts, possibilities and "Only a few" at SBI PO level.',
    to: '/reasoning/syllogism',
    icon: '◐',
  },
  {
    id: 'blood-relations',
    title: 'Blood Relations',
    description: 'Pointing statements, coded relation symbols and whole-family puzzles, with every chain of relations worked out.',
    to: '/reasoning/blood-relations',
    icon: '👪',
  },
  {
    id: 'direction-sense',
    title: 'Direction Sense',
    description: 'Follow turns and walks to find the final direction and distance — plus two-person and point puzzles.',
    to: '/reasoning/direction-sense',
    icon: '🧭',
  },
  {
    id: 'ranking-order',
    title: 'Ranking & Order',
    description: 'Positions in a row or class, plus ordering sets with comparisons — each puzzle has exactly one answer.',
    to: '/reasoning/ranking-order',
    icon: '🏅',
  },
  {
    id: 'input-output',
    title: 'Input–Output',
    description: 'Decode a machine from one worked example, then predict its steps for a new input.',
    to: '/reasoning/input-output',
    icon: '⚙️',
  },
  {
    id: 'puzzle-solver',
    title: 'Puzzle Solver',
    description: 'Paste a floor or seating puzzle (text or screenshot) and watch it solved step by step — why that clue first, why nobody fits elsewhere, and what breaks if a step is changed.',
    to: '/reasoning/puzzle-solver',
    icon: '🧩',
    tool: true,
  },
  {
    id: 'syllogism-solver',
    title: 'Syllogism Solver',
    description: 'Paste a syllogism (text or screenshot) and watch the Venn diagram build, check each conclusion with animated pictures, and see why any answer you pick is right or wrong.',
    to: '/reasoning/syllogism-solver',
    icon: '◎',
    tool: true,
  },
]

export default function Reasoning() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← All modules
      </Link>
      <div className="mb-8 mt-2">
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">Reasoning</h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">Choose a game to start practicing.</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {REASONING_GAMES.map((g) => {
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
              <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">{g.title}</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{g.description}</p>
              <div className="mt-4 flex items-center justify-between text-sm">
                {'tool' in g && g.tool ? (
                  <span className="font-medium text-indigo-500 dark:text-indigo-300">Solver · any puzzle</span>
                ) : summary.bestAccuracy !== null ? (
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
    </div>
  )
}
