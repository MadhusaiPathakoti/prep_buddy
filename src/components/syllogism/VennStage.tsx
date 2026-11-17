import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Circle } from '../../lib/syllogismSolver/layout'
import { computeZones, H, placeLabels, W } from '../../lib/syllogismSolver/layout'
import type { ParsedQuestion } from '../../lib/syllogismSolver/parse'
import { resolveHighlight, type Highlight, type ResolvedHighlight } from '../../lib/syllogismSolver/solve'

const HUES = [236, 199, 36, 282, 168, 14]
const hueOf = (t: number) => HUES[t % HUES.length]
const TONE = { ok: '#10b981', bad: '#f43f5e', info: '#6366f1' } as const
const bit = (m: number, t: number) => ((m >> t) & 1) === 1

interface CircleState {
  x: number
  y: number
  r: number
  lx: number
  ly: number
  rx: number
  ry: number
  o: number
}
interface DotState {
  x: number
  y: number
  o: number
}
interface Frame {
  circles: Map<number, CircleState>
  dots: Map<number, DotState>
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const mix = (a: number, b: number, e: number) => a + (b - a) * e

function lerpFrame(from: Frame, to: Frame, e: number): Frame {
  const circles = new Map<number, CircleState>()
  for (const [k, b] of to.circles) {
    const a = from.circles.get(k) ?? { ...b, r: b.r * 0.15, o: 0 }
    circles.set(k, { x: mix(a.x, b.x, e), y: mix(a.y, b.y, e), r: mix(a.r, b.r, e), lx: mix(a.lx, b.lx, e), ly: mix(a.ly, b.ly, e), rx: mix(a.rx, b.rx, e), ry: mix(a.ry, b.ry, e), o: mix(a.o, b.o, e) })
  }
  const dots = new Map<number, DotState>()
  for (const [k, b] of to.dots) {
    const a = from.dots.get(k) ?? { ...b, o: 0 }
    dots.set(k, { x: mix(a.x, b.x, e), y: mix(a.y, b.y, e), o: mix(a.o, b.o, e) })
  }
  return { circles, dots }
}

/** The state to animate towards: everything in `target`, plus whatever is on screen now but must fade away. */
function withLeavers(current: Frame, target: Frame): Frame {
  const circles = new Map(target.circles)
  for (const [k, c] of current.circles) if (!circles.has(k)) circles.set(k, { ...c, r: c.r * 0.6, o: 0 })
  const dots = new Map(target.dots)
  for (const [k, d] of current.dots) if (!dots.has(k)) dots.set(k, { ...d, o: 0 })
  return { circles, dots }
}

const EMPTY: Frame = { circles: new Map(), dots: new Map() }

const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

function useTween(target: Frame, ms: number): { frame: Frame; settled: boolean } {
  const [frame, setFrame] = useState<Frame>(EMPTY)
  // the target whose animation has finished — "settled" is derived from it, so no state is set synchronously in the effect
  const [doneFor, setDoneFor] = useState<Frame | null>(null)
  const shown = useRef<Frame>(EMPTY)
  const reduce = prefersReducedMotion()
  useEffect(() => {
    if (reduce) {
      shown.current = target
      return
    }
    const from = shown.current
    const to = withLeavers(from, target)
    const t0 = performance.now()
    let raf = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms)
      if (t < 1) {
        const f = lerpFrame(from, to, ease(t))
        shown.current = f
        setFrame(f)
        raf = requestAnimationFrame(step)
      } else {
        shown.current = target
        setFrame(target)
        setDoneFor(target)
      }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms, reduce])
  return reduce ? { frame: target, settled: true } : { frame, settled: doneFor === target }
}

// ---------- one coloured region (inside some circles, outside the others) ----------

function ZoneShape({ id, mask, circles, fill }: { id: string; mask: number; circles: Circle[]; fill: string }) {
  const inside = circles.filter((c) => bit(mask, c.t))
  const outside = circles.filter((c) => !bit(mask, c.t))
  const maskId = `${id}-x`
  let node = <rect x={0} y={0} width={W} height={H} fill={fill} mask={outside.length ? `url(#${maskId})` : undefined} />
  for (const c of inside) node = <g clipPath={`url(#${id}-c${c.t})`}>{node}</g>
  return (
    <g>
      <defs>
        {inside.map((c) => (
          <clipPath key={c.t} id={`${id}-c${c.t}`}>
            <circle cx={c.x} cy={c.y} r={c.r} />
          </clipPath>
        ))}
        {outside.length > 0 && (
          <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
            <rect x={0} y={0} width={W} height={H} fill="white" />
            {outside.map((c) => (
              <circle key={c.t} cx={c.x} cy={c.y} r={c.r} fill="black" />
            ))}
          </mask>
        )}
      </defs>
      {node}
    </g>
  )
}

// ---------- the stage ----------

export interface VennStageProps {
  q: ParsedQuestion
  circles: Circle[]
  highlights: Highlight[]
  /** Changes whenever a new scene starts, so highlight animations replay. */
  sceneKey: string
  emptyHint?: string
}

export default function VennStage({ q, circles, highlights, sceneKey, emptyHint }: VennStageProps) {
  const uid = useId().replace(/:/g, '')
  const circlesKey = circles.map((c) => `${c.t}:${c.x.toFixed(1)},${c.y.toFixed(1)},${c.r.toFixed(1)}`).join('|')

  const scene = useMemo(() => {
    const { zones } = computeZones(circles)
    const labels = placeLabels(circles, new Map(q.terms.map((t, i) => [i, t.label])))
    const target: Frame = { circles: new Map(), dots: new Map() }
    for (const c of circles) {
      const l = labels.get(c.t) ?? { x: c.x, y: c.y - c.r - 15, rx: c.x, ry: c.y - c.r }
      target.circles.set(c.t, { x: c.x, y: c.y, r: c.r, lx: l.x, ly: l.y, rx: l.rx, ry: l.ry, o: 1 })
    }
    for (const z of zones) target.dots.set(z.mask, { x: z.x, y: z.y, o: 1 })
    return { zones, target }
    // circlesKey stands in for `circles`, which is a fresh array on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circlesKey, q])

  const { frame, settled } = useTween(scene.target, 800)

  const masks = scene.zones.map((z) => z.mask)
  const resolved: ResolvedHighlight[] = highlights.map((h) => resolveHighlight(masks, h))
  const lit = new Set(resolved.flatMap((r) => r.zones))
  const ordered = [...frame.circles].sort((a, b) => b[1].r - a[1].r)

  return (
    <div className="relative overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-700">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none" role="img" aria-label={`Venn diagram of ${circles.map((c) => q.terms[c.t].plural).join(', ') || 'no groups yet'}`}>
        {/* the circles */}
        {ordered.map(([t, c]) => (
          <circle
            key={`c${t}`}
            cx={c.x}
            cy={c.y}
            r={Math.max(0.1, c.r)}
            opacity={c.o}
            style={{ ['--h' as string]: hueOf(t) }}
            fill="hsl(var(--h) 85% 58% / 0.2)"
            stroke="hsl(var(--h) 75% 50%)"
            strokeWidth={2.5}
          />
        ))}

        {/* highlighted regions */}
        {settled &&
          resolved.map((r, i) =>
            r.zones.map((mask) => (
              <g key={`${sceneKey}-h${i}-${mask}`} className="zone-pulse" pointerEvents="none">
                <ZoneShape id={`${uid}${i}m${mask}`} mask={mask} circles={circles} fill={TONE[r.tone]} />
              </g>
            )),
          )}

        {/* "these two do not meet" marker */}
        {settled &&
          resolved.map((r, i) => {
            if (!r.gap) return null
            const a = circles.find((c) => c.t === r.gap![0])
            const b = circles.find((c) => c.t === r.gap![1])
            if (!a || !b) return null
            const d = Math.hypot(b.x - a.x, b.y - a.y) || 1
            const ux = (b.x - a.x) / d
            const uy = (b.y - a.y) / d
            const p1 = { x: a.x + ux * a.r, y: a.y + uy * a.r }
            const p2 = { x: b.x - ux * b.r, y: b.y - uy * b.r }
            const mx = (p1.x + p2.x) / 2
            const my = (p1.y + p2.y) / 2
            const color = TONE[r.tone]
            return (
              <g key={`${sceneKey}-gap${i}`} className="zone-pulse" pointerEvents="none">
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={color} strokeWidth={3} strokeLinecap="round" className="gap-dash" />
                <circle cx={mx} cy={my} r={11} fill={color} />
                <text x={mx} y={my + 4.5} textAnchor="middle" fontSize={14} fontWeight={800} fill="white">
                  ✕
                </text>
              </g>
            )
          })}

        {/* people: one dot per region that has someone in it */}
        {[...frame.dots].map(([mask, d]) => (
          <g key={`d${mask}`} opacity={d.o} transform={`translate(${d.x} ${d.y}) scale(${0.4 + 0.6 * d.o})`}>
            <circle r={lit.has(mask) ? 8.5 : 6.5} className="fill-slate-800 stroke-white dark:fill-slate-100 dark:stroke-slate-900" strokeWidth={2} />
            {lit.has(mask) && settled && <circle r={8.5} fill="none" stroke={TONE[resolved.find((r) => r.zones.includes(mask))?.tone ?? 'info']} strokeWidth={2} className="dot-ring" />}
          </g>
        ))}

        {/* name tags */}
        {ordered.map(([t, c]) => {
          const text = q.terms[t].label
          const w = text.length * 7.6 + 20
          return (
            <g key={`l${t}`} opacity={c.o} style={{ ['--h' as string]: hueOf(t) }}>
              <line x1={c.rx} y1={c.ry} x2={c.lx} y2={c.ly} stroke="hsl(var(--h) 75% 50%)" strokeWidth={1.5} />
              <circle cx={c.rx} cy={c.ry} r={2.6} fill="hsl(var(--h) 75% 50%)" />
              <g transform={`translate(${c.lx} ${c.ly})`}>
                <rect x={-w / 2} y={-11} width={w} height={22} rx={11} className="fill-white dark:fill-slate-800" stroke="hsl(var(--h) 75% 50%)" strokeWidth={1.5} />
                <text y={4.6} textAnchor="middle" fontSize={13} fontWeight={700} className="venn-ink" fill="currentColor">
                  {text}
                </text>
              </g>
            </g>
          )
        })}

        {circles.length === 0 && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={16} className="fill-slate-400 dark:fill-slate-500">
            {emptyHint ?? 'Nothing drawn yet'}
          </text>
        )}
      </svg>
    </div>
  )
}
