import { useState } from 'react'
import type { Trace } from '../../lib/puzzleSolver/trace'

interface ClueListProps {
  trace: Trace
  /** clue ids already used before the step on show */
  used: Set<number>
  /** clue ids the step on show is working with */
  now: number[]
  /** clue ids to light up (hovered in the narration, or named by the current move) */
  highlight: number[]
}

/** Every clue, with its state in the walkthrough and (on request) how the parser read it. */
export default function ClueList({ trace, used, now, highlight }: ClueListProps) {
  const [reading, setReading] = useState(false)
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">The clues</h3>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <input type="checkbox" checked={reading} onChange={(e) => setReading(e.target.checked)} className="accent-indigo-600" />
          show how I read them
        </label>
      </div>
      <ol className="mt-2 space-y-1.5">
        {trace.puzzle.clues.map((c) => {
          const isNow = now.includes(c.id)
          const isUsed = used.has(c.id) || c.atoms.length === 0 // a clue the engine applies throughout (no atom) counts as used
          const lit = highlight.includes(c.id)
          return (
            <li
              key={c.id}
              className={[
                'flex gap-2 rounded-lg px-2 py-1.5 text-sm transition',
                lit ? 'bg-amber-100 ring-2 ring-amber-300 dark:bg-amber-500/15 dark:ring-amber-500/50' : isNow ? 'bg-indigo-50 dark:bg-indigo-500/10' : '',
              ].join(' ')}
            >
              <span
                className={[
                  'mt-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] font-bold',
                  isNow ? 'bg-indigo-600 text-white' : isUsed ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
                ].join(' ')}
                title={isNow ? 'used in this step' : isUsed ? 'already used' : 'not used yet'}
              >
                {isUsed && !isNow ? '✓' : c.id}
              </span>
              <div className="min-w-0">
                <div className={isUsed || isNow ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}>{c.text}</div>
                {reading && <div className="mt-0.5 text-xs text-indigo-600 dark:text-indigo-300">→ {c.atoms.length ? c.atoms.map((a) => trace.ctx.describeAtom(a)).join(' · ') : trace.puzzle.maxNamedRun !== undefined ? `at most ${trace.puzzle.maxNamedRun} named people on neighbouring seats (applied in every step)` : 'applied in every step'}</div>}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
