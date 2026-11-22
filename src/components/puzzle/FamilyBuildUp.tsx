import { useEffect, useMemo, useState } from 'react'
import { layoutFamily, PAD_TOP, ROW_H } from '../../lib/familyTree/layout'
import type { World } from '../../lib/familyTree/model'
import type { FamilyPuzzle } from '../../lib/familyTree/solve'
import { factPeople, familySteps, readFacts, type FamilyStep } from '../../lib/familyTree/steps'

const HALF = 24
const TRAY_H = 104
const STEP_MS = 4200

const numWord = (n: number) => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][n] ?? String(n)

/**
 * The family tree built one clue at a time. People wait in a tray at the top as the clues name them, slide into their generation
 * once it is certain, take their colour (blue square = man, pink circle = woman) once their sex is certain, and the marriage and
 * parent lines appear only when the clues so far prove them. Positions are those of the final tree, so nothing jumps.
 */
export default function FamilyBuildUp({ puzzle, world, relaxed }: { puzzle: FamilyPuzzle; world: World; relaxed: boolean }) {
  const L = useMemo(() => layoutFamily(world), [world])
  const [steps, setSteps] = useState<FamilyStep[]>([])
  const [finished, setFinished] = useState(false)
  const [cur, setCur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const total = puzzle.clues.length

  // work out the steps between repaints, so the page stays usable while the harder ones are being found
  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const gen = familySteps(puzzle, world, relaxed)
    const next = () => {
      if (!live) return
      const r = gen.next()
      if (r.done) {
        setFinished(true)
        return
      }
      setSteps([...r.value])
      timer = setTimeout(next, 0)
    }
    timer = setTimeout(next, 30)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [puzzle, world, relaxed])

  const ready = steps.length
  const step = steps[Math.min(cur, ready - 1)] as FamilyStep | undefined

  const running = playing && cur < total
  // autoplay: move on a few seconds after each step, as soon as the next one has been worked out
  useEffect(() => {
    if (!running || cur + 1 >= ready) return
    const id = setTimeout(() => setCur((c) => c + 1), STEP_MS)
    return () => clearTimeout(id)
  }, [running, cur, ready])

  const names = puzzle.names
  const n = names.length
  const width = L.width
  const height = L.height + TRAY_H
  const trayX = (i: number) => (width * (i + 1)) / (n + 1)
  const known = step?.known
  const placed = (i: number) => !!known && known.gen[i] !== null
  const clue = step && step.k > 0 ? puzzle.clues[step.k - 1] : null
  const inClue = new Set(clue ? clue.facts.flatMap(factPeople) : [])
  const at = (i: number) => L.nodes[i]
  const line = 'stroke-slate-600 dark:stroke-slate-300'
  const fade = 'transition-opacity duration-700 motion-reduce:transition-none'
  const gens = [...new Set(world.gen)].sort((a, b) => a - b)

  const btn = 'rounded-xl px-3 py-2 text-sm font-semibold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40'
  const primary = `${btn} bg-indigo-600 text-white shadow-sm hover:bg-indigo-500`
  const plain = `${btn} bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600`

  if (!step || !known) {
    return <p className="animate-pulse py-6 text-center text-sm font-semibold text-indigo-600 dark:text-indigo-300">Working out the steps…</p>
  }

  const atEnd = cur >= total

  return (
    <div>
      <div className="overflow-x-auto rounded-2xl bg-slate-50 p-3 dark:bg-slate-900/50">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Family tree being built clue by clue" className="mx-auto block h-auto w-full max-w-full" style={{ maxWidth: Math.max(width, 320) }}>
          <g transform={`translate(0 ${TRAY_H})`}>
            {/* the tray: people the clues have named whose generation is not certain yet */}
            <rect x={8} y={-TRAY_H + 6} width={width - 16} height={TRAY_H - 22} rx={12} className={`fill-none stroke-slate-300 dark:stroke-slate-600 ${fade}`} strokeDasharray="5 5" strokeWidth="1.5" />
            <text x={18} y={-TRAY_H + 24} fontSize="12" fontWeight="600" className="fill-slate-400 dark:fill-slate-500">
              Named in the clues — generation not certain yet
            </text>

            {gens.map((g, k) => (
              <text key={g} x={8} y={PAD_TOP + k * ROW_H + 4} className={`fill-slate-400 dark:fill-slate-500 ${fade}`} style={{ opacity: names.some((_, i) => known.gen[i] === g) ? 1 : 0.25 }} fontSize="12" fontWeight="600">
                Gen {g}
              </text>
            ))}

            {/* children hang from their parents once the clues prove who the parents are */}
            {L.childGroups.map((cg) =>
              cg.children.map((c) => {
                const ps = cg.parents.map(at)
                const kid = at(c)
                const sx = ps.reduce((s, p) => s + p.x, 0) / ps.length
                const sy = ps.length === 2 ? ps[0].y : ps[0].y + HALF
                const busY = at(cg.children[0]).y - 56
                const shown = known.parents[c] && placed(c) && cg.parents.every(placed)
                return <path key={c} d={`M ${sx} ${sy} V ${busY} H ${kid.x} V ${kid.y - HALF}`} className={`${line} ${fade}`} style={{ opacity: shown ? 1 : 0 }} strokeWidth="2.5" fill="none" />
              }),
            )}

            {/* brothers and sisters whose parents are outside the family */}
            {L.sibGroups.map((grp, k) => {
              const ns = grp.map(at)
              const top = ns[0].y - HALF - 34
              const xs = ns.map((q) => q.x)
              const shown = grp.every((a) => placed(a) && grp.every((b) => a === b || known.sibs[a][b]))
              return (
                <g key={k} className={`${line} ${fade}`} style={{ opacity: shown ? 1 : 0 }} strokeWidth="2.5" fill="none">
                  <line x1={Math.min(...xs)} y1={top} x2={Math.max(...xs)} y2={top} />
                  {ns.map((q) => (
                    <line key={q.i} x1={q.x} y1={top} x2={q.x} y2={q.y - HALF} />
                  ))}
                  <text x={(Math.min(...xs) + Math.max(...xs)) / 2} y={top - 6} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400" stroke="none" fontSize="12">
                    Siblings
                  </text>
                </g>
              )
            })}

            {/* marriages */}
            {L.marriages.map(([a, b]) => {
              const [l, r] = at(a).x < at(b).x ? [at(a), at(b)] : [at(b), at(a)]
              const shown = known.spouse[a] === b && placed(a) && placed(b)
              return (
                <g key={`${a}-${b}`} className={`${line} ${fade}`} style={{ opacity: shown ? 1 : 0 }} strokeWidth="2.5">
                  <line x1={l.x + HALF} y1={l.y - 4} x2={r.x - HALF} y2={r.y - 4} />
                  <line x1={l.x + HALF} y1={l.y + 4} x2={r.x - HALF} y2={r.y + 4} />
                </g>
              )
            })}

            {names.map((nm, i) => {
              const isNamed = step.named[i]
              const pos = placed(i) ? { x: at(i).x, y: at(i).y } : { x: trayX(i), y: -TRAY_H / 2 + 14 }
              const g = known.gender[i]
              return (
                <g key={nm} className="transition-all duration-700 ease-in-out motion-reduce:transition-none" style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, opacity: isNamed ? 1 : 0 }}>
                  {inClue.has(i) && <rect x={-HALF - 7} y={-HALF - 7} width={(HALF + 7) * 2} height={(HALF + 7) * 2} rx={g === 'F' ? HALF + 7 : 9} className="animate-pulse" fill="none" stroke="#f59e0b" strokeWidth="3" />}
                  <rect x={-HALF} y={-HALF} width={HALF * 2} height={HALF * 2} rx="3" fill="#60a5fa" stroke="#0f172a" strokeWidth="2.5" className={fade} style={{ opacity: g === 'M' ? 1 : 0 }} />
                  <circle r={HALF} fill="#f472b6" stroke="#0f172a" strokeWidth="2.5" className={fade} style={{ opacity: g === 'F' ? 1 : 0 }} />
                  <circle r={HALF} fill="#cbd5e1" stroke="#475569" strokeWidth="2.5" strokeDasharray="4 3" className={fade} style={{ opacity: g ? 0 : 1 }} />
                  <text y={6} textAnchor="middle" fontSize="18" fontWeight="800" fill="#0f172a">
                    {nm}
                  </text>
                  <text y={HALF + 16} textAnchor="middle" fontSize="12" fontWeight="700" className="fill-slate-500 dark:fill-slate-400">
                    {g === 'M' ? '[+]' : g === 'F' ? '[–]' : '?'}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span>
            <span className="mr-1 inline-block h-3 w-3 rounded-sm bg-blue-400 align-middle ring-1 ring-slate-800" />
            man
          </span>
          <span>
            <span className="mr-1 inline-block h-3 w-3 rounded-full bg-pink-400 align-middle ring-1 ring-slate-800" />
            woman
          </span>
          <span>
            <span className="mr-1 inline-block h-3 w-3 rounded-full bg-slate-300 align-middle ring-1 ring-slate-500" />? not certain yet
          </span>
          <span>
            <span className="mr-1 inline-block h-3 w-3 rounded-sm align-middle ring-2 ring-amber-500" />
            in this clue
          </span>
        </div>
      </div>

      {/* controls */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <button onClick={() => { setPlaying(false); setCur(0) }} disabled={cur === 0} className={plain}>
          ⏮ Start
        </button>
        <button onClick={() => { setPlaying(false); setCur((c) => Math.max(0, c - 1)) }} disabled={cur === 0} className={plain}>
          ◀ Back
        </button>
        {running ? (
          <button onClick={() => setPlaying(false)} className={primary}>
            ⏸ Pause
          </button>
        ) : (
          <button onClick={() => { if (atEnd) setCur(0); setPlaying(true) }} className={primary}>
            ▶ {atEnd ? 'Replay' : 'Play'}
          </button>
        )}
        <button onClick={() => { setPlaying(false); setCur((c) => Math.min(ready - 1, c + 1)) }} disabled={cur + 1 >= ready} className={plain}>
          Next clue ▶
        </button>
      </div>
      <div className="mt-3 flex items-center justify-center gap-1.5" aria-label="Clues">
        {Array.from({ length: total + 1 }, (_, k) => (
          <button
            key={k}
            onClick={() => { setPlaying(false); setCur(k) }}
            disabled={k >= ready}
            aria-label={k === 0 ? 'Before any clue' : `Clue ${k}`}
            className={['h-7 min-w-7 rounded-full px-2 text-xs font-bold transition disabled:opacity-30', k === cur ? 'bg-indigo-600 text-white' : k < ready ? 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'].join(' ')}
          >
            {k}
          </button>
        ))}
        {!finished && <span className="ml-1 animate-pulse text-xs text-indigo-600 dark:text-indigo-300">working out the next steps…</span>}
      </div>

      {/* what this step says */}
      <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700" aria-live="polite">
        {step.k === 0 ? (
          <>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Before any clue</div>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
              {n} people ({names.join(', ')}) in {numWord(puzzle.gens)} generation{puzzle.gens === 1 ? '' : 's'}. Press <b>Play</b> — the clues are added one at a time, and only what they prove is drawn.
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Clue {step.k} of {total}
              </div>
              <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">
                {step.many ? 'Many families still fit' : step.trees === 1 ? 'Exactly one family fits — the tree is fixed' : `${step.trees} families still fit`}
              </div>
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{clue?.text}</p>
            {clue && <p className="text-xs text-slate-500 dark:text-slate-400">Read as: {readFacts(clue, names)}</p>}
            {step.notes.length > 0 ? (
              <div className="mt-2">
                <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">Now certain</div>
                <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-sm text-slate-700 dark:text-slate-200">
                  {step.notes.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Nothing new is certain yet — this clue rules some families out but leaves the picture open. Later clues combine with it.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
