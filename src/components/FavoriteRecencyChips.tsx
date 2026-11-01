import { FAVORITE_RECENCY_DAYS } from '../lib/favorites'

interface FavoriteRecencyChipsProps {
  /** Selected window in days, or null for "any time". */
  value: number | null
  onChange: (days: number | null) => void
  /** Smaller chips, for the library toolbar (the quiz setup card uses the roomier size). */
  compact?: boolean
}

/** "Any time / Last 1 day / Last 2 days …" picker for filtering favourites by when they were starred. */
export default function FavoriteRecencyChips({ value, onChange, compact = false }: FavoriteRecencyChipsProps) {
  const options: { days: number | null; label: string }[] = [
    { days: null, label: 'Any time' },
    ...FAVORITE_RECENCY_DAYS.map((d) => ({ days: d, label: `Last ${d} ${d === 1 ? 'day' : 'days'}` })),
  ]
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.label}
          onClick={() => onChange(o.days)}
          className={[
            compact ? 'rounded-lg px-3 py-1.5 text-sm font-semibold transition' : 'rounded-lg px-4 py-2 text-sm font-semibold transition',
            value === o.days ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
