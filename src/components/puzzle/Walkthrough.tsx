import { useCallback, useEffect, useMemo, useState } from 'react'
import { failedClues } from '../../lib/puzzleSolver/engine'
import { applyEvents, flipClue, simulate, type Beat, type CellRef, type SimResult, type Step, type Trace } from '../../lib/puzzleSolver/trace'
import Board, { PeopleStrip } from './Board'
import CellInspector from './CellInspector'
import ClueList from './ClueList'
import StepPanel, { BeatRow } from './StepPanel'
import type { Puzzle, Solution } from '../../lib/puzzleSolver/types'

const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

const beatDelay = (b: Beat): number => (b.tone === 'link' ? 1000 : b.tone === 'given' ? 800 : 1700 + Math.min(b.details.length, 6) * 150)

// ─── outcome views ───────────────────────────────────────────────────────────

function solutionRows(trace: Trace, sol: Solution) {
  const { puzzle, ctx } = trace
  const rows = puzzle.people.map((name, p) => ({ f: sol.pos[p], name, vals: sol.val.map((v, c) => puzzle.cats[c].values[v[p]]) }))
  rows.sort((a, b) => (puzzle.axis === 'floor' ? b.f - a.f : puzzle.axis === 'grid' ? ctx.rowOf(b.f) - ctx.rowOf(a.f) || a.f - b.f : a.f - b.f))
  return rows.map((r) => ({ ...r, label: ctx.posName(r.f) }))
}

function SolutionTable({ trace, sol }: { trace: Trace; sol: Solution }) {
  const { puzzle, ctx } = trace
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
            <th className="py-1 pr-3 font-semibold">{ctx.unit}</th>
            <th className="py-1 pr-3 font-semibold">{ctx.noun.replace(/^./, (m) => m.toUpperCase())}</th>
            {puzzle.cats.map((c) => (
              <th key={c.name} className="py-1 pr-3 font-semibold">
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {solutionRows(trace, sol).map((r) => (
            <tr key={r.name} className="border-t border-slate-100 dark:border-slate-700">
              <td className="py-1.5 pr-3 font-bold text-slate-400 dark:text-slate-500">{r.label}</td>
              <td className="py-1.5 pr-3 font-bold text-emerald-600 dark:text-emerald-400">{r.name}</td>
              {r.vals.map((v, i) => (
                <td key={i} className="py-1.5 pr-3 text-slate-700 dark:text-slate-200">
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Outcome({ trace, step, onEdit, onResolve }: { trace: Trace; step: Step; onEdit: () => void; onResolve?: (p: Puzzle) => void }) {
  const { puzzle, ctx } = trace
  if (step.kind === 'done' && trace.final) {
    const bad = new Set(failedClues(puzzle, trace.final))
    return (
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white">Step {step.idx + 1}</span>
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">Solved — and every clue checks out</h2>
        </div>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          There is exactly one arrangement that fits all {puzzle.clues.length} clues (the solver also searched every possibility to make sure no second one exists).
        </p>
        <div className="mt-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-emerald-300 dark:bg-slate-800 dark:ring-emerald-500/40">
          <SolutionTable trace={trace} sol={trace.final} />
        </div>
        <ul className="mt-4 space-y-1 text-xs text-slate-600 dark:text-slate-300">
          {puzzle.clues.map((c) => (
            <li key={c.id} className="flex gap-2">
              <span className={bad.has(c.id) ? 'text-rose-500' : 'text-emerald-500'}>{bad.has(c.id) ? '✗' : '✓'}</span>
              <span>
                <span className="font-semibold">Clue {c.id}:</span> {c.atoms.map((a) => ctx.describeAtom(a)).join(' · ')}
                {trace.unusedClues.includes(c.id) && <span className="ml-1 text-slate-400">(not needed to find the answer, but it holds)</span>}
              </span>
            </li>
          ))}
        </ul>
        <button onClick={onEdit} className="mt-5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500">
          Solve another puzzle
        </button>
      </div>
    )
  }
  if (step.kind === 'stuck') {
    return (
      <div>
        <h2 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">More than one arrangement fits</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          After using every clue, the puzzle still allows {trace.solutions.length >= 12 ? 'at least 12' : trace.solutions.length} different arrangements, so the clues as I understood them are not enough to decide. Either a clue is missing, or one was read
          differently from how it was meant — check the clue readings below.
        </p>
        <div className="mt-3 space-y-3">
          {trace.solutions.slice(0, 3).map((s, i) => (
            <div key={i} className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Possibility {i + 1}</div>
              <SolutionTable trace={trace} sol={s} />
            </div>
          ))}
        </div>
        <button onClick={onEdit} className="mt-5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500">
          Edit the puzzle
        </button>
      </div>
    )
  }
  return (
    <div>
      <h2 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">The clues contradict each other</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">No arrangement satisfies every clue as I read it. That usually means a clue was misread or mistyped (for example by the screenshot reader).</p>
      {trace.flips.length > 0 && (
        <div className="mt-3 rounded-2xl border-2 border-indigo-300 bg-indigo-50 p-3 text-sm dark:border-indigo-500/50 dark:bg-indigo-500/10">
          <div className="font-semibold text-indigo-800 dark:text-indigo-200">A likely culprit: a clue that lost its “not”.</div>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Read as its own opposite, each clue below leaves exactly one arrangement. A “not” is easy to lose when a puzzle is copied or typed, so this is worth checking against the original.</p>
          <ul className="mt-2 space-y-2">
            {trace.flips.map((id) => {
              const c = puzzle.clues.find((x) => x.id === id)
              const flipped = flipClue(puzzle, id)
              return (
                <li key={id} className="rounded-xl bg-white p-2 dark:bg-slate-800">
                  <div className="text-slate-700 dark:text-slate-200">
                    <b>Clue {id}:</b> “{c?.text}”
                  </div>
                  <div className="text-xs text-indigo-600 dark:text-indigo-300">as the opposite → {flipped?.clues.find((x) => x.id === id)?.atoms.map((a) => ctx.describeAtom(a)).join(' · ')}</div>
                  {onResolve && flipped && (
                    <button onClick={() => onResolve(flipped)} className="mt-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500">
                      Solve with Clue {id} read as its opposite
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {trace.suspects.length > 0 && (
        <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm dark:bg-amber-500/10">
          <div className="font-semibold text-amber-800 dark:text-amber-300">Dropping any one of these clues makes the puzzle solvable — check how I read them:</div>
          <ul className="mt-1 space-y-1">
            {trace.suspects.map((id) => {
              const c = puzzle.clues.find((x) => x.id === id)
              return (
                <li key={id} className="text-slate-700 dark:text-slate-200">
                  <b>Clue {id}:</b> “{c?.text}” <span className="text-indigo-600 dark:text-indigo-300">→ {c?.atoms.map((a) => ctx.describeAtom(a)).join(' · ')}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      <button onClick={onEdit} className="mt-5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500">
        Edit the puzzle
      </button>
    </div>
  )
}

// ─── what-if panel ───────────────────────────────────────────────────────────

function WhatIfPanel({ trace, sim, k, onJump, onReplay, onClose }: { trace: Trace; sim: SimResult; k: number; onJump: (k: number) => void; onReplay: () => void; onClose: () => void }) {
  const { ctx } = trace
  const c = sim.cell
  const done = k >= sim.beats.length
  const last = sim.beats[sim.beats.length - 1]
  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-500/50 dark:bg-amber-500/10">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-bold text-slate-900">WHAT-IF</span>
        <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100">What if {ctx.pair(c.a, c.i, c.b, c.j)}?</h2>
      </div>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
        Replaying from step {sim.stepIdx + 1}. This is <b>not</b> the real arrangement — it only shows what would go wrong if we had chosen differently.
      </p>
      <ol className="mt-3 space-y-2" aria-live="polite">
        {sim.beats.slice(0, k).map((b, i) => (
          <BeatRow key={i} beat={b} current={i === k - 1} onSelect={() => onJump(i + 1)} />
        ))}
      </ol>
      {!done && (
        <div className="mt-2 flex gap-2">
          <button onClick={() => onJump(k + 1)} className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-amber-400">
            Next consequence
          </button>
          <button onClick={() => onJump(sim.beats.length)} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:bg-slate-700 dark:text-slate-300">
            Show all
          </button>
        </div>
      )}
      {done && last && sim.rotation && (
        <div className="mt-3 rounded-xl bg-violet-100 p-3 text-sm text-violet-900 dark:bg-violet-500/20 dark:text-violet-100">
          <b>Not an error.</b> Seat numbers on a round table are only labels, so this is the same arrangement turned round.
        </div>
      )}
      {done && last && !sim.rotation && (
        <div className={['mt-3 rounded-xl p-3 text-sm', sim.proven ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'].join(' ')}>
          {sim.proven ? <b>So {ctx.notPair(c.a, c.i, c.b, c.j)} — that placement is impossible.</b> : <b>No clash found.</b>}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button onClick={onReplay} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600">
          ↻ Replay
        </button>
        <button onClick={onClose} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500">
          Back to the real solution
        </button>
      </div>
    </div>
  )
}

// ─── the walkthrough ─────────────────────────────────────────────────────────

export default function Walkthrough({ trace, onEdit, onResolve }: { trace: Trace; onEdit: () => void; onResolve?: (p: Puzzle) => void }) {
  const { ctx, steps } = trace
  const reduce = useMemo(() => prefersReducedMotion(), [])
  const [stepIdx, setStepIdx] = useState(0)
  const [k, setK] = useState(reduce ? steps[0].beats.length : 0)
  const [auto, setAuto] = useState(!reduce)
  const [fast, setFast] = useState(false)
  const [sim, setSim] = useState<SimResult | null>(null)
  const [simK, setSimK] = useState(0)
  const [hover, setHover] = useState<number[] | null>(null)
  const [picked, setPicked] = useState<CellRef | null>(null)

  const step = steps[stepIdx]
  const outcome = step.kind === 'done' || step.kind === 'stuck' || step.kind === 'conflict'

  const goStep = useCallback(
    (i: number) => {
      const j = Math.max(0, Math.min(steps.length - 1, i))
      setSim(null)
      setStepIdx(j)
      setK(reduce ? steps[j].beats.length : 0)
    },
    [steps, reduce],
  )

  // arrow keys step through the walkthrough
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (e.key === 'ArrowRight') goStep(stepIdx + 1)
      if (e.key === 'ArrowLeft') goStep(stepIdx - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goStep, stepIdx])

  // the beats of the step (or what-if) on show appear one after another
  const beats = sim ? sim.beats : step.beats
  const shown = sim ? simK : k
  useEffect(() => {
    if (!auto || shown >= beats.length) return
    const delay = (shown === 0 ? 600 : beatDelay(beats[shown - 1])) / (fast ? 2 : 1)
    const id = setTimeout(() => (sim ? setSimK(shown + 1) : setK(shown + 1)), delay)
    return () => clearTimeout(id)
  }, [auto, fast, sim, shown, beats])

  const runWhatIf = useCallback(
    (cell: CellRef) => {
      const r = simulate(trace, cell)
      if (!r) return
      setSim(r)
      setSimK(reduce ? r.beats.length : 0)
      setAuto((a) => a || !reduce)
    },
    [trace, reduce],
  )

  // clicking the chip that is already open closes the inspector
  const pick = useCallback((cell: CellRef) => setPicked((cur) => (cur && cur.a === cell.a && cur.i === cell.i && cur.b === cell.b && cur.j === cell.j ? null : cell)), [])

  const grid = useMemo(() => {
    const base = sim ? sim.base : step.pre
    const evs = beats.slice(0, shown).flatMap((b) => b.evs)
    return applyEvents(base, ctx, evs)
  }, [sim, step, beats, shown, ctx])
  const current = shown > 0 ? beats[shown - 1] : null
  const beatKey = `${sim ? 'w' : 's'}${sim ? sim.stepIdx : stepIdx}.${shown}`
  const clash = !!current && current.tone === 'clash'

  const used = useMemo(() => new Set(steps.slice(0, stepIdx).flatMap((s) => s.clues)), [steps, stepIdx])
  const highlight = hover ?? (current?.clue ? [current.clue] : step.clues.length <= 3 ? step.clues : [])

  const navBtn = 'rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-40'
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onEdit} className="text-sm text-slate-400 hover:text-slate-600 dark:text-slate-500">
          ← Edit puzzle
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => goStep(stepIdx - 1)} disabled={stepIdx === 0} className={`${navBtn} bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200`}>
            ◀ Prev
          </button>
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            Step {stepIdx + 1} / {steps.length}
          </span>
          <button onClick={() => goStep(stepIdx + 1)} disabled={stepIdx === steps.length - 1} className={`${navBtn} bg-indigo-600 text-white hover:bg-indigo-500`}>
            Next ▶
          </button>
          <span className="mx-1 hidden h-5 w-px bg-slate-200 dark:bg-slate-700 sm:block" />
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-indigo-600" />
            animate
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <input type="checkbox" checked={fast} onChange={(e) => setFast(e.target.checked)} className="accent-indigo-600" />
            faster
          </label>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Steps">
        {steps.map((s, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={i === stepIdx}
            onClick={() => goStep(i)}
            title={`${i + 1}. ${s.title}`}
            className={['h-2.5 w-7 rounded-full transition', i === stepIdx ? 'bg-indigo-600' : i < stepIdx ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-700'].join(' ')}
          />
        ))}
      </div>

      {trace.status !== 'unique' && !outcome && (
        <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          {trace.status === 'multiple' ? 'Heads-up: these clues allow more than one arrangement, so the walkthrough will stop before everything is decided.' : 'Heads-up: these clues contradict each other — the walkthrough shows how far they get.'}
        </div>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className="space-y-4 self-start lg:sticky lg:top-4">
          <Board ctx={ctx} grid={grid} beat={current} beatKey={beatKey} mode={sim ? 'whatif' : 'real'} clash={clash} onPick={sim ? undefined : pick} picked={sim ? null : picked} />
          <PeopleStrip ctx={ctx} grid={grid} beat={current} beatKey={beatKey} onPick={sim ? undefined : pick} picked={sim ? null : picked} />
        </div>
        <div className="space-y-4">
          {picked && !sim && <CellInspector trace={trace} cell={picked} stepIdx={stepIdx} onWhatIf={runWhatIf} onGoStep={goStep} onClue={setHover} onClose={() => setPicked(null)} />}
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
            {sim ? (
              <WhatIfPanel trace={trace} sim={sim} k={simK} onJump={setSimK} onReplay={() => setSimK(0)} onClose={() => setSim(null)} />
            ) : outcome ? (
              <Outcome trace={trace} step={step} onEdit={onEdit} onResolve={onResolve} />
            ) : (
              <StepPanel trace={trace} step={step} k={k} onJump={setK} onWhatIf={runWhatIf} onClue={setHover} />
            )}
          </div>
          <ClueList trace={trace} used={used} now={step.clues} highlight={highlight} />
        </div>
      </div>
    </div>
  )
}
