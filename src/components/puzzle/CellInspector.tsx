import { useEffect, useRef } from 'react'
import { cellKey } from '../../lib/puzzleSolver/core'
import type { CellRef, Trace } from '../../lib/puzzleSolver/trace'
import { Rich } from './StepPanel'

interface CellInspectorProps {
  trace: Trace
  cell: CellRef
  /** the step on show, so the card can say whether this was already decided at that point */
  stepIdx: number
  onWhatIf: (cell: CellRef) => void
  onGoStep: (i: number) => void
  onClue: (ids: number[] | null) => void
  onClose: () => void
}

/** Opens when a name / city / pip on the board is clicked: why this pairing is impossible, or why it is the answer. */
export default function CellInspector({ trace, cell, stepIdx, onWhatIf, onGoStep, onClue, onClose }: CellInspectorProps) {
  const { ctx } = trace
  const key = cellKey(cell.a, cell.i, cell.b, cell.j)
  const out = trace.elim.get(key)
  const fix = trace.fixes.get(key)
  const pairText = ctx.pair(cell.a, cell.i, cell.b, cell.j)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [key])

  const label = (kind: string, clue?: number) => (kind === 'clue' && clue ? `Clue ${clue} rules it out` : kind === 'case' ? 'Found by testing the possibilities' : kind === 'taken' ? 'Because that place is already taken' : kind === 'trans' ? 'Because of what is already known about the other table' : 'Reason')

  return (
    <div ref={ref} className="rounded-3xl border-2 border-indigo-300 bg-indigo-50 p-4 shadow-sm dark:border-indigo-500/50 dark:bg-indigo-500/10">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-indigo-500 dark:text-indigo-300">You asked about</div>
          <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100">{pairText}</h2>
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/60 hover:text-slate-600 dark:hover:bg-slate-700">
          ✕
        </button>
      </div>

      {out && out.why.kind === 'sym' ? (
        <div className="mt-2 space-y-2 text-sm">
          <p className="font-semibold text-violet-700 dark:text-violet-300">That option was ruled out only by a fixed order — not by a clue.</p>
          <div className="rounded-xl bg-white p-3 text-slate-800 dark:bg-slate-800 dark:text-slate-100">{out.why.text}.</div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Swapping interchangeable people (the unnamed ones, or those without a value) gives the same arrangement, so they are simply taken in a fixed order.</p>
        </div>
      ) : out && out.why.kind === 'anchor' ? (
        <div className="mt-2 space-y-2 text-sm">
          <p className="font-semibold text-violet-700 dark:text-violet-300">That seat was ruled out only by the starting choice — not by a clue.</p>
          <div className="rounded-xl bg-white p-3 text-slate-800 dark:bg-slate-800 dark:text-slate-100">{out.why.text}.</div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Turning a round table changes nobody's neighbours, so the seat numbers are only labels: any one person can be put in seat 1 first.</p>
        </div>
      ) : out ? (
        <div className="mt-2 space-y-2 text-sm">
          <p className="font-semibold text-rose-700 dark:text-rose-300">This is not possible.</p>
          <div className="rounded-xl bg-white p-3 dark:bg-slate-800">
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400">{label(out.why.kind, out.why.clue)}</div>
            <div className="mt-0.5 text-slate-800 dark:text-slate-100">
              <Rich text={out.why.clue ? `Clue ${out.why.clue}: ${out.why.text}` : out.why.text} onClue={onClue} />
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {out.step > stepIdx ? `At this point in the walkthrough it is still on the board — it gets crossed out in step ${out.step + 1}.` : `Crossed out in step ${out.step + 1}.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => onWhatIf(cell)} className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-amber-300">
              ▶ Watch what goes wrong
            </button>
            {out.step !== stepIdx && (
              <button onClick={() => onGoStep(out.step)} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600">
                Go to step {out.step + 1}
              </button>
            )}
          </div>
        </div>
      ) : fix ? (
        <div className="mt-2 space-y-2 text-sm">
          <p className="font-semibold text-emerald-700 dark:text-emerald-300">Yes — this is right. It is part of the final answer.</p>
          <div className="rounded-xl bg-white p-3 dark:bg-slate-800">
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400">How it gets settled (step {fix.step + 1})</div>
            <div className="mt-0.5 text-slate-800 dark:text-slate-100">
              <Rich text={fix.why.kind === 'given' && fix.why.clue ? `Clue ${fix.why.clue} tells us: ${fix.why.text}.` : `${fix.why.text}.`} onClue={onClue} />
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {fix.step > stepIdx ? `At this point it is only one of the possibilities — it becomes certain in step ${fix.step + 1}.` : fix.step === stepIdx ? 'It becomes certain in this very step.' : `Already settled in step ${fix.step + 1}.`}
          </p>
          {fix.step !== stepIdx && (
            <button onClick={() => onGoStep(fix.step)} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600">
              Go to step {fix.step + 1}
            </button>
          )}
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">The clues do not decide this one: it is still possible, and it is also still possible that it is not.</p>
      )}
    </div>
  )
}
