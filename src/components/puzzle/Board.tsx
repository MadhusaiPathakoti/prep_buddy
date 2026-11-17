import { bits, pop } from '../../lib/puzzleSolver/core'
import type { Ctx, Grid } from '../../lib/puzzleSolver/core'
import type { Beat } from '../../lib/puzzleSolver/trace'

export type BoardMode = 'real' | 'whatif'

interface BoardProps {
  ctx: Ctx
  grid: Grid
  /** the move that was just shown (its crossings flash and its placements pop) */
  beat: Beat | null
  /** changes whenever a new move is shown, so the animations replay */
  beatKey: string
  mode: BoardMode
  clash: boolean
}

type Tone = 'cand' | 'lock' | 'out' | 'suppose' | 'empty'

const CHIP: Record<Tone, string> = {
  cand: 'rounded px-1 py-0.5 text-[10px] font-semibold leading-none bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300',
  lock: 'rounded-md px-2 py-1 text-sm font-bold leading-none bg-emerald-500 text-white shadow-sm',
  suppose: 'rounded-md px-2 py-1 text-sm font-bold leading-none bg-amber-400 text-slate-900 shadow-sm',
  out: 'rounded px-1 py-0.5 text-[10px] font-semibold leading-none bg-rose-100 text-rose-600 line-through dark:bg-rose-500/20 dark:text-rose-300 animate-chip-out',
  empty: 'rounded px-1.5 py-0.5 text-xs font-bold leading-none bg-rose-500 text-white',
}

function Chip({ label, tone, pop: popIn, title }: { label: string; tone: Tone; pop?: 'lock' | 'suppose'; title?: string }) {
  const extra = popIn === 'lock' ? ' animate-chip-lock' : popIn === 'suppose' ? ' animate-chip-suppose' : ''
  return (
    <span title={title ?? label} className={`inline-block ${CHIP[tone]}${extra}`}>
      {label}
    </span>
  )
}

/** Cells crossed out / settled in the move on show, keyed "a.i.b.j" (normalised a < b). */
function beatCells(beat: Beat | null) {
  const out = new Set<string>()
  const fixed = new Set<string>()
  if (beat)
    for (const e of beat.evs) {
      const key = `${e.a}.${e.i}.${e.b}.${e.j}`
      if (e.op === 'x') out.add(key)
      else fixed.add(key)
    }
  return { out, fixed }
}

export default function Board({ ctx, grid, beat, beatKey, mode, clash }: BoardProps) {
  const { n, p } = ctx
  const { out, fixed } = beatCells(beat)
  const suppose = mode === 'whatif'
  const order = Array.from({ length: n }, (_, f) => f)
  if (p.axis === 'floor') order.reverse()
  const cols = 1 + p.cats.length // person + one per extra category

  /** One cell of the building: everyone / every value still possible at position f. */
  function cell(f: number, cat: number) {
    // cat 0 = person, 2.. = extra categories; the table row is (position f) against that category
    const mask = grid.row(1, f, cat)
    const ghosts = [...Array(n).keys()].filter((j) => out.has(cat === 0 ? `0.${j}.1.${f}` : `1.${f}.${cat}.${j}`))
    if (mask === 0)
      return (
        <div className="flex min-h-[2.25rem] flex-wrap items-center gap-1">
          <Chip label="none left" tone="empty" />
        </div>
      )
    const single = pop(mask) === 1
    const j = single ? bits(mask)[0] : -1
    const justFixed = single && fixed.has(cat === 0 ? `0.${j}.1.${f}` : `1.${f}.${cat}.${j}`)
    return (
      <div className="flex min-h-[2.25rem] flex-wrap content-center items-center gap-1">
        {single ? (
          <Chip label={ctx.lab(cat, j)} tone={suppose && justFixed ? 'suppose' : 'lock'} pop={justFixed ? (suppose ? 'suppose' : 'lock') : undefined} />
        ) : (
          bits(mask).map((x) => <Chip key={x} label={ctx.shortLab(cat, x)} title={ctx.lab(cat, x)} tone="cand" />)
        )}
        {ghosts.map((x) => (
          <Chip key={`g${beatKey}.${x}`} label={ctx.shortLab(cat, x)} title={`${ctx.lab(cat, x)} crossed out`} tone="out" />
        ))}
      </div>
    )
  }

  const catHeads = ['Person', ...p.cats.map((c) => c.name.replace(/^./, (m) => m.toUpperCase()))]
  const vertical = p.axis !== 'row'
  const labelCol = ctx.named ? '3rem' : '2.25rem'
  const unitHead = ctx.unit.replace(/^./, (m) => m.toUpperCase())

  return (
    <div className={['rounded-3xl p-3 shadow-sm ring-2 transition', clash ? 'animate-clash bg-rose-50 ring-rose-400 dark:bg-rose-500/10' : suppose ? 'bg-amber-50 ring-amber-300 dark:bg-amber-500/10 dark:ring-amber-500/50' : 'bg-white ring-slate-200 dark:bg-slate-800 dark:ring-slate-700'].join(' ')}>
      <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        <span>{p.axis === 'floor' ? 'The building' : p.axis === 'row' ? 'The row, left → right' : `The ${ctx.unit}s, first → last`}</span>
        {suppose && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-slate-900">WHAT-IF · not the real answer</span>}
      </div>

      {vertical ? (
        <div role="table" aria-label={`Who could be at which ${ctx.unit}`} className="space-y-1">
          <div className="grid items-end gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500" style={{ gridTemplateColumns: `${labelCol} repeat(${cols}, minmax(0, 1fr))` }}>
            <span>{unitHead}</span>
            {catHeads.map((h) => (
              <span key={h}>{h}</span>
            ))}
          </div>
          {order.map((f) => (
            <div
              key={f}
              role="row"
              className="grid items-center gap-2 rounded-xl bg-slate-50 px-1 py-0.5 dark:bg-slate-900/40"
              style={{ gridTemplateColumns: `${labelCol} repeat(${cols}, minmax(0, 1fr))` }}
            >
              <span className={['text-center font-extrabold text-slate-400 dark:text-slate-500', ctx.named ? 'text-sm' : 'text-base'].join(' ')}>{ctx.posShort(f)}</span>
              {[0, ...p.cats.map((_, c) => c + 2)].map((cat) => (
                <div key={cat} role="cell">
                  {cell(f, cat)}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-1 overflow-x-auto pb-1">
          {order.map((f) => (
            <div key={f} className="min-w-[3.4rem] flex-1 rounded-xl bg-slate-50 p-1 dark:bg-slate-900/40">
              <div className="mb-1 text-center text-base font-extrabold text-slate-400 dark:text-slate-500">{ctx.posShort(f)}</div>
              <div className="space-y-2">
                {[0, ...p.cats.map((_, c) => c + 2)].map((cat) => (
                  <div key={cat}>
                    <div className="text-[9px] font-semibold uppercase text-slate-400 dark:text-slate-500">{catHeads[cat === 0 ? 0 : cat - 1]}</div>
                    {cell(f, cat)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Who's who: for every person, the floors still possible (pips) and what is known about their other attributes. */
export function PeopleStrip({ ctx, grid, beat, beatKey }: Pick<BoardProps, 'ctx' | 'grid' | 'beat' | 'beatKey'>) {
  const { n, p } = ctx
  const { out } = beatCells(beat)
  const floors = Array.from({ length: n }, (_, f) => f).sort((x, y) => ctx.posNum(x) - ctx.posNum(y))
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {p.people.map((name, i) => {
        const fm = grid.row(0, i, 1)
        const placed = pop(fm) === 1
        return (
          <div key={name} className={['rounded-2xl p-2 ring-1 transition', placed ? 'bg-emerald-50 ring-emerald-300 dark:bg-emerald-500/10 dark:ring-emerald-500/40' : 'bg-white ring-slate-200 dark:bg-slate-800 dark:ring-slate-700'].join(' ')}>
            <div className="flex items-baseline justify-between gap-1">
              <span className="text-base font-extrabold text-slate-800 dark:text-slate-100">{name}</span>
              <span className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {placed ? ctx.posLab(bits(fm)[0]) : `${pop(fm)} ${ctx.unit}s open`}
              </span>
            </div>
            <div className="mt-1 flex gap-[3px]" aria-label={`${name}: possible ${ctx.unit}s`}>
              {floors.map((f) => {
                const alive = ((fm >> f) & 1) === 1
                const justOut = out.has(`0.${i}.1.${f}`)
                return (
                  <span
                    key={`${f}${justOut ? beatKey : ''}`}
                    title={`${ctx.posLab(f)}${alive ? (placed ? ' — placed' : ' — still possible') : justOut ? ' — just crossed out' : ' — ruled out'}`}
                    className={[
                      'flex h-4 min-w-0 flex-1 items-center justify-center rounded-[3px] text-[8px] font-bold leading-none',
                      alive ? (placed ? 'bg-emerald-500 text-white' : 'bg-indigo-200 text-indigo-700 dark:bg-indigo-500/30 dark:text-indigo-200') : justOut ? 'bg-rose-400 text-white animate-pulse' : 'bg-slate-100 text-slate-300 dark:bg-slate-700/60 dark:text-slate-600',
                    ].join(' ')}
                  >
                    {ctx.posNum(f)}
                  </span>
                )
              })}
            </div>
            {p.cats.map((cat, c) => {
              const vm = grid.row(0, i, c + 2)
              const known = pop(vm) === 1
              return (
                <div key={cat.name} className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400" title={bits(vm).map((v) => cat.values[v]).join(', ')}>
                  <span className="text-slate-400 dark:text-slate-500">{cat.name}: </span>
                  {known ? <span className="font-semibold text-emerald-600 dark:text-emerald-400">{cat.values[bits(vm)[0]]}</span> : <span>{pop(vm)} possible</span>}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
