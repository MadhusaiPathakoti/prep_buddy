interface StarButtonProps {
  on: boolean
  onToggle: () => void
  /** Adds the word "Favourite" next to the star. */
  label?: boolean
  className?: string
}

/** The ★ / ☆ favourite toggle used across the Computer Awareness question bank and quiz. */
export default function StarButton({ on, onToggle, label = false, className = '' }: StarButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={on ? 'Remove from favourites' : 'Add to favourites'}
      title={on ? 'Remove from favourites' : 'Add to favourites'}
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold transition active:scale-95',
        on
          ? 'bg-amber-100 text-amber-600 hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-300'
          : 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-amber-500 dark:bg-slate-700 dark:text-slate-500',
        className,
      ].join(' ')}
    >
      <span className="text-base leading-none">{on ? '★' : '☆'}</span>
      {label && <span className="text-xs">{on ? 'Favourite' : 'Add to favourites'}</span>}
    </button>
  )
}
