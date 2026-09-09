import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { VOCAB_BANK, type VocabDifficulty } from '../../data/vocabulary'

const FILTERS: { id: VocabDifficulty | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
]

function difficultyBadge(d: VocabDifficulty) {
  if (d === 'easy') return 'bg-emerald-100 text-emerald-700'
  if (d === 'medium') return 'bg-amber-100 text-amber-700'
  return 'bg-rose-100 text-rose-700'
}

export default function VocabLibrary() {
  const [filter, setFilter] = useState<VocabDifficulty | 'all'>('all')
  const [query, setQuery] = useState('')

  const words = useMemo(() => {
    const q = query.trim().toLowerCase()
    return VOCAB_BANK.filter((w) => filter === 'all' || w.difficulty === filter)
      .filter((w) => q === '' || w.word.toLowerCase().includes(q) || w.meaning.toLowerCase().includes(q))
      .sort((a, b) => a.word.localeCompare(b.word))
  }, [filter, query])

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/english/vocabulary" className="text-sm text-slate-400 hover:text-slate-600">
        ← Vocabulary
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900">Word Bank</h1>
      <p className="mt-2 text-slate-500">Browse and learn before you play. {VOCAB_BANK.length} words across three difficulty levels.</p>

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
          placeholder="Search words or meanings…"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-400"
        />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {words.map((w) => (
          <div key={w.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-slate-900">{w.word}</h3>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${difficultyBadge(w.difficulty)}`}>
                {w.difficulty}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{w.meaning}</p>
            <p className="mt-2 text-xs italic text-slate-400">"{w.example}"</p>
          </div>
        ))}
        {words.length === 0 && <p className="text-slate-400">No words match your search.</p>}
      </div>
    </div>
  )
}
