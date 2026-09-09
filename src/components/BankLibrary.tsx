import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { BankEntry, Difficulty } from '../lib/types'

const FILTERS: { id: Difficulty | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
]

function difficultyBadge(d: Difficulty) {
  if (d === 'easy') return 'bg-emerald-100 text-emerald-700'
  if (d === 'medium') return 'bg-amber-100 text-amber-700'
  return 'bg-rose-100 text-rose-700'
}

interface BankLibraryProps {
  bank: BankEntry[]
  backTo: string
  backLabel: string
  title: string
  nounPlural: string
}

export default function BankLibrary({ bank, backTo, backLabel, title, nounPlural }: BankLibraryProps) {
  const [filter, setFilter] = useState<Difficulty | 'all'>('all')
  const [query, setQuery] = useState('')

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase()
    return bank
      .filter((w) => filter === 'all' || w.difficulty === filter)
      .filter((w) => q === '' || w.term.toLowerCase().includes(q) || w.meaning.toLowerCase().includes(q))
      .sort((a, b) => a.term.localeCompare(b.term))
  }, [bank, filter, query])

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to={backTo} className="text-sm text-slate-400 hover:text-slate-600">
        ← {backLabel}
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900">{title}</h1>
      <p className="mt-2 text-slate-500">
        Browse and learn before you play. {bank.length} {nounPlural} across three difficulty levels.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={[
                'rounded-lg px-3 py-1.5 text-sm font-semibold transition',
                filter === f.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${nounPlural} or meanings…`}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-400"
        />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {entries.map((w) => (
          <div key={w.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-slate-900">{w.term}</h3>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${difficultyBadge(w.difficulty)}`}>
                {w.difficulty}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{w.meaning}</p>
            <p className="mt-2 text-xs italic text-slate-400">"{w.example}"</p>
          </div>
        ))}
        {entries.length === 0 && <p className="text-slate-400">No {nounPlural} match your search.</p>}
      </div>
    </div>
  )
}
