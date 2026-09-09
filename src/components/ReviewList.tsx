export interface ReviewItem {
  id: string
  prompt: string
  displayAnswer: string
  skipped: boolean
}

export default function ReviewList({ items }: { items: ReviewItem[] }) {
  if (items.length === 0) return null
  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-slate-700">Review these</h3>
      <div className="mt-2 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-2xl bg-slate-50">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-800">
              {item.prompt} = {item.displayAnswer}
            </span>
            <span
              className={[
                'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
                item.skipped ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700',
              ].join(' ')}
            >
              {item.skipped ? 'Skipped' : 'Wrong'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
