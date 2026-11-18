import type { ReactNode } from 'react'
import type { PlayRecord } from '../../lib/qbank/userData'
import type { Difficulty } from '../../lib/types'

const DIFFICULTY_STYLE: Record<Difficulty, string> = {
  easy: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  medium: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
  hard: 'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300',
}

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${DIFFICULTY_STYLE[difficulty]}`}>{difficulty}</span>
}

export function TagChip({ children }: { children: ReactNode }) {
  return <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">{children}</span>
}

/** Left-hand marker in the table: empty circle = not played, tick = last answer right, cross = last answer wrong. */
export function StatusMark({ record }: { record: PlayRecord | undefined }) {
  if (!record) return <span role="img" aria-label="Not played yet" title="Not played yet" className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-slate-300 dark:border-slate-600" />
  return record.correct ? (
    <span role="img" aria-label="Last answer correct" title="Last answer correct" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
      ✓
    </span>
  ) : (
    <span role="img" aria-label="Last answer wrong" title="Last answer wrong" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white">
      ✕
    </span>
  )
}

export function StarButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={active ? 'Remove from favourites' : 'Add to favourites'}
      title={active ? 'Remove from favourites' : 'Add to favourites'}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xl transition hover:bg-slate-100 dark:hover:bg-slate-700 ${active ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}`}
    >
      {active ? '★' : '☆'}
    </button>
  )
}
