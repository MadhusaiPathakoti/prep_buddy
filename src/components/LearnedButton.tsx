/** Compact "mark as learned" toggle for word cards in the libraries. */
export default function LearnedButton({ learned, onToggle, word }: { learned: boolean; onToggle: () => void; word: string }) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={learned}
      aria-label={learned ? `Un-mark ${word} as learned` : `Mark ${word} as learned`}
      className={[
        'mt-4 w-full rounded-xl border-2 px-3 py-2 text-sm font-semibold transition',
        learned
          ? 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600'
          : 'border-emerald-500/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10',
      ].join(' ')}
    >
      {learned ? '✓ Learned — tap to undo' : '✓ Mark as learned'}
    </button>
  )
}
