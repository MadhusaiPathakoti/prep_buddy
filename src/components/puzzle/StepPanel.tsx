import type { ReactNode } from 'react'
import type { Beat, CellRef, Step, Tone, Trace, WhyOption } from '../../lib/puzzleSolver/trace'
import { whyNotRows } from '../../lib/puzzleSolver/trace'

// ─── small pieces ────────────────────────────────────────────────────────────

/** Turns "Clue 3" / "Clues 4, 8 and 10" in narration into hoverable references that light up the clue list. */
export function Rich({ text, onClue }: { text: string; onClue?: (ids: number[] | null) => void }) {
  const parts = text.split(/(Clues? \d+(?:(?:, | and )\d+)*)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (!/^Clues? \d/.test(part)) return <span key={i}>{part}</span>
        const ids = (part.match(/\d+/g) ?? []).map(Number)
        return (
          <span
            key={i}
            onMouseEnter={() => onClue?.(ids)}
            onMouseLeave={() => onClue?.(null)}
            className="cursor-help rounded bg-indigo-50 px-1 font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
          >
            {part}
          </span>
        )
      })}
    </>
  )
}

const TONE: Record<Tone, { icon: string; ring: string }> = {
  given: { icon: '📌', ring: 'border-sky-300 dark:border-sky-500/50' },
  clue: { icon: '🔎', ring: 'border-indigo-300 dark:border-indigo-500/50' },
  deduce: { icon: '✅', ring: 'border-emerald-300 dark:border-emerald-500/50' },
  link: { icon: '🔗', ring: 'border-slate-300 dark:border-slate-600' },
  case: { icon: '🧪', ring: 'border-violet-300 dark:border-violet-500/50' },
  assume: { icon: '🤔', ring: 'border-amber-300 dark:border-amber-500/60' },
  clash: { icon: '💥', ring: 'border-rose-400 dark:border-rose-500/60' },
}

export function BeatRow({ beat, current, onClue, onSelect }: { beat: Beat; current: boolean; onClue?: (ids: number[] | null) => void; onSelect?: () => void }) {
  const t = TONE[beat.tone]
  const collapsible = beat.tone === 'link' || beat.details.length > 6
  return (
    <li onClick={onSelect} className={['animate-beat-in rounded-xl border-l-4 bg-white py-2 pl-3 pr-2 text-sm shadow-sm dark:bg-slate-800', t.ring, onSelect ? 'cursor-pointer' : '', current ? 'ring-2 ring-indigo-200 dark:ring-indigo-500/30' : 'opacity-90'].join(' ')}>
      <div className="flex gap-2">
        <span aria-hidden="true">{t.icon}</span>
        <div className="min-w-0 flex-1">
          <div className={['text-slate-800 dark:text-slate-100', beat.tone === 'clash' ? 'font-semibold text-rose-700 dark:text-rose-300' : ''].join(' ')}>
            <Rich text={beat.headline} onClue={onClue} />
            {beat.minor > 0 && <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">(+{beat.minor} follow-on crossings)</span>}
          </div>
          {beat.details.length > 0 &&
            (collapsible ? (
              <details className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                <summary className="cursor-pointer select-none text-indigo-600 dark:text-indigo-400">Show the reasoning ({beat.details.length})</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {beat.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </details>
            ) : (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-500 dark:text-slate-400">
                {beat.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            ))}
        </div>
      </div>
    </li>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {title}
        {hint && <span className="ml-2 font-medium normal-case tracking-normal text-slate-400 dark:text-slate-500">{hint}</span>}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  )
}

// ─── why this clue ───────────────────────────────────────────────────────────

const KIND_LABEL = { pin: 'pins one person', relation: 'links two people', floating: 'about an unknown person', fact: 'plain fact' } as const

function WhyThisClue({ trace, step, onClue }: { trace: Trace; step: Step; onClue: (ids: number[] | null) => void }) {
  const sel = step.selection
  if (!sel) return null
  const max = Math.max(1, ...sel.ranking.map((r) => r.gain))
  return (
    <Section title={step.kind === 'given' ? 'Why start here?' : 'Why this clue now?'}>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
        <Rich text={sel.headline} onClue={onClue} />
      </p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
        {sel.reasoning.map((r, i) => (
          <li key={i}>
            <Rich text={r} onClue={onClue} />
          </li>
        ))}
      </ul>
      {sel.basedOn.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-slate-500 dark:text-slate-400">Already known:</span>
          {sel.basedOn.map((b) => (
            <span key={b} className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              {b}
            </span>
          ))}
        </div>
      )}
      {sel.ranking.length > 1 && (
        <details className="mt-3 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-900/40" open>
          <summary className="cursor-pointer select-none font-semibold text-slate-600 dark:text-slate-300">How every unused clue scored (possibilities it removes right now)</summary>
          <ul className="mt-2 space-y-1.5">
            {sel.ranking.map((r) => {
              const chosen = sel.chosen.includes(r.clue)
              const clue = trace.puzzle.clues.find((c) => c.id === r.clue)
              return (
                <li key={r.clue} title={clue?.text} onMouseEnter={() => onClue([r.clue])} onMouseLeave={() => onClue(null)}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={chosen ? 'font-bold text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-300'}>
                      Clue {r.clue}
                      <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">· {KIND_LABEL[r.kind]}</span>
                      {chosen && <span className="ml-1 rounded bg-indigo-600 px-1 text-[10px] font-bold text-white">CHOSEN</span>}
                    </span>
                    <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">{r.gain}</span>
                  </div>
                  <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div className={['h-full rounded-full transition-all duration-700', chosen ? 'bg-indigo-500' : 'bg-slate-400 dark:bg-slate-500'].join(' ')} style={{ width: `${Math.max(2, (r.gain / max) * 100)}%` }} />
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{r.note}</div>
                </li>
              )
            })}
          </ul>
        </details>
      )}
    </Section>
  )
}

// ─── why not anywhere else ───────────────────────────────────────────────────

function WhyNot({ trace, step, onWhatIf }: { trace: Trace; step: Step; onWhatIf: (cell: CellRef) => void }) {
  const rows = whyNotRows(trace, step)
  if (rows.length === 0) return null
  return (
    <Section title="Why not anywhere else?" hint="click a crossed-out option to see what would go wrong">
      <div className="space-y-2">
        {rows.map((row, ri) => {
          const opts = row.target === 1 ? [...row.options].reverse() : row.options
          const groups = new Map<string, { opts: WhyOption[]; text: string; step: number; now: boolean; clue?: number }>()
          for (const o of row.options) {
            if (o.state !== 'out' || !o.why) continue
            const key = `${o.why.text}|${o.step}`
            const g = groups.get(key) ?? { opts: [], text: o.why.text, step: o.step ?? 0, now: o.now, clue: o.why.clue }
            g.opts.push(o)
            groups.set(key, g)
          }
          const lines = [...groups.values()].sort((a, b) => Number(b.now) - Number(a.now) || a.step - b.step)
          return (
            <details key={`${row.ea}.${row.ei}.${row.target}`} open={ri < 3} className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
              <summary className="flex cursor-pointer select-none flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{row.title}</span>
                {row.fixed ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">PLACED</span>
                ) : (
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">NARROWED</span>
                )}
                <span className="flex flex-wrap gap-[3px]">
                  {opts.map((o) => (
                    <PipButton key={o.j} o={o} onWhatIf={onWhatIf} />
                  ))}
                </span>
              </summary>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                {lines.map((g, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-1">
                    <span className="text-rose-500">✗</span>
                    {g.opts.map((o) => (
                      <button
                        key={o.j}
                        onClick={() => onWhatIf(o.cell)}
                        title="What if it were here?"
                        className="rounded bg-rose-50 px-1.5 py-0.5 font-semibold text-rose-700 hover:bg-rose-100 dark:bg-rose-500/15 dark:text-rose-300"
                      >
                        {o.label}
                      </button>
                    ))}
                    <span>
                      — {g.text}
                      <span className="ml-1 text-slate-400 dark:text-slate-500">
                        ({g.clue ? `Clue ${g.clue}, ` : ''}
                        {g.now ? 'this step' : `step ${g.step + 1}`})
                      </span>
                    </span>
                  </li>
                ))}
                {lines.length === 0 && <li className="text-slate-400">Nothing has been crossed out for this one yet.</li>}
              </ul>
            </details>
          )
        })}
      </div>
    </Section>
  )
}

function PipButton({ o, onWhatIf }: { o: WhyOption; onWhatIf: (cell: CellRef) => void }) {
  const base = 'flex h-6 min-w-[1.5rem] items-center justify-center rounded px-1 text-[10px] font-bold leading-none'
  if (o.state === 'chosen') return <span className={`${base} bg-emerald-500 text-white`}>{o.label}</span>
  if (o.state === 'open') return <span className={`${base} bg-indigo-100 text-indigo-700 dark:bg-indigo-500/25 dark:text-indigo-200`}>{o.label}</span>
  return (
    <button
      onClick={(e) => {
        e.preventDefault()
        onWhatIf(o.cell)
      }}
      title={`${o.label}: ${o.why?.text ?? 'ruled out'} — click to see what happens if it were here`}
      className={`${base} ${o.now ? 'bg-rose-100 text-rose-600 line-through hover:bg-rose-200 dark:bg-rose-500/20 dark:text-rose-300' : 'bg-slate-100 text-slate-400 line-through hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-500'}`}
    >
      {o.label}
    </button>
  )
}

// ─── case-analysis trials ────────────────────────────────────────────────────

function Trials({ trace, step, onWhatIf }: { trace: Trace; step: Step; onWhatIf: (cell: CellRef) => void }) {
  if (step.trials.length === 0) return null
  const { ctx } = trace
  return (
    <Section title="The tests" hint="each possibility was assumed true and the clues followed">
      <ul className="space-y-1.5">
        {step.trials.map((t, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-violet-50 p-2 text-sm dark:bg-violet-500/10">
            <span className="text-slate-700 dark:text-slate-200">
              If <b>{ctx.pair(t.cell.a, t.cell.i, t.cell.b, t.cell.j)}</b> → <span className="text-rose-600 dark:text-rose-300">{t.clash}</span>
            </span>
            <button onClick={() => onWhatIf(t.cell)} className="ml-auto rounded-lg bg-violet-600 px-2 py-1 text-xs font-semibold text-white hover:bg-violet-500">
              ▶ Watch it fail
            </button>
          </li>
        ))}
      </ul>
    </Section>
  )
}

// ─── the panel ───────────────────────────────────────────────────────────────

interface StepPanelProps {
  trace: Trace
  step: Step
  /** number of moves shown so far */
  k: number
  onJump: (k: number) => void
  onWhatIf: (cell: CellRef) => void
  onClue: (ids: number[] | null) => void
}

export default function StepPanel({ trace, step, k, onJump, onWhatIf, onClue }: StepPanelProps) {
  const done = k >= step.beats.length
  const shown = step.beats.slice(0, k)
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs font-bold text-white">Step {step.idx + 1}</span>
        <h2 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">{step.title}</h2>
      </div>
      {step.clues.length > 0 && step.kind !== 'given' && step.kind !== 'done' && step.kind !== 'stuck' && step.kind !== 'conflict' && (
        <ul className="mt-2 space-y-1">
          {step.clues.slice(0, 3).map((id) => {
            const clue = trace.puzzle.clues.find((c) => c.id === id)
            return (
              <li key={id} className="rounded-lg bg-indigo-50 px-3 py-1.5 text-sm italic text-indigo-900 dark:bg-indigo-500/10 dark:text-indigo-200" onMouseEnter={() => onClue([id])} onMouseLeave={() => onClue(null)}>
                “{clue?.text}”
              </li>
            )
          })}
          {step.clues.length > 3 && <li className="text-xs text-slate-400">…and {step.clues.length - 3} more clues</li>}
        </ul>
      )}
      {step.summary && <p className="mt-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">⇒ {step.summary}</p>}

      <WhyThisClue trace={trace} step={step} onClue={onClue} />

      {step.beats.length > 0 && (
        <Section title="What happens, move by move">
          <ol className="space-y-2" aria-live="polite">
            {shown.map((b, i) => (
              <BeatRow key={i} beat={b} current={i === k - 1} onClue={onClue} onSelect={() => onJump(i + 1)} />
            ))}
          </ol>
          {!done && (
            <div className="mt-2 flex gap-2">
              <button onClick={() => onJump(k + 1)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500">
                Show next move ({k}/{step.beats.length})
              </button>
              <button onClick={() => onJump(step.beats.length)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300">
                Show all
              </button>
            </div>
          )}
        </Section>
      )}

      {done && (
        <>
          <Trials trace={trace} step={step} onWhatIf={onWhatIf} />
          <WhyNot trace={trace} step={step} onWhatIf={onWhatIf} />
        </>
      )}
    </div>
  )
}
