export interface ReviewItem {
  id: string
  prompt: string
  displayAnswer: string
  skipped: boolean
  /** True for a correctly-answered entry, shown with its own badge. Optional — other callers never set it, so their items keep showing as Wrong/Skipped as before. */
  correct?: boolean
}

export default function ReviewList({ items }: { items: ReviewItem[] }) {
  if (items.length === 0) return null
  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Review these</h3>
      <div className="mt-2 max-h-56 divide-y divide-slate-100 dark:divide-slate-700 overflow-y-auto rounded-2xl bg-slate-50 dark:bg-slate-800">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {item.prompt} = {item.displayAnswer}
            </span>
            <span
              className={[
                'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
                item.correct ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : item.skipped ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300',
              ].join(' ')}
            >
              {item.correct ? 'Correct' : item.skipped ? 'Skipped' : 'Wrong'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
