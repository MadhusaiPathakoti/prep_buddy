import { THEMES } from '../../lib/awareness/theme'
import type { CaTheme, FigureKind } from '../../lib/awareness/types'

interface FigureProps {
  kind: FigureKind
  title: string
  items: [string, string?][]
  theme: CaTheme
}

/** Mixes the theme's two colours: step 0 of n gets the first colour, the last step the second (as a CSS colour). */
function shade(theme: CaTheme, i: number, n: number): string {
  const [a, b] = THEMES[theme].hex
  const pct = n <= 1 ? 0 : Math.round((i / (n - 1)) * 100)
  return `color-mix(in srgb, ${a}, ${b} ${pct}%)`
}

/** A small drawn diagram (process, layers, pyramid or cycle) – built from HTML/SVG so it is crisp and themed. */
export default function FigureView({ kind, title, items, theme }: FigureProps) {
  const t = THEMES[theme]
  return (
    <figure className={`rounded-2xl p-4 ring-1 sm:p-5 ${t.soft} ${t.ring}`}>
      <figcaption className={`mb-4 flex items-center gap-2 text-sm font-bold ${t.text}`}>
        <span aria-hidden="true">🖼️</span>
        {title}
      </figcaption>
      {kind === 'flow' && <Flow items={items} theme={theme} />}
      {kind === 'layers' && <Layers items={items} theme={theme} />}
      {kind === 'pyramid' && <Pyramid items={items} theme={theme} />}
      {kind === 'cycle' && <Cycle items={items} theme={theme} />}
    </figure>
  )
}

function Flow({ items, theme }: { items: [string, string?][]; theme: CaTheme }) {
  return (
    <ol className="flex flex-col items-stretch gap-1 sm:flex-row sm:flex-wrap sm:items-stretch sm:justify-center">
      {items.map(([label, note], i) => (
        <li key={label + i} className="flex flex-col items-center gap-1 sm:flex-row">
          <div className="flex w-full min-w-[8rem] flex-1 flex-col items-center rounded-xl bg-white px-3 py-3 text-center shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700 sm:w-auto sm:max-w-[11rem]">
            <span className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: shade(theme, i, items.length) }}>
              {i + 1}
            </span>
            <span className="mt-1.5 text-sm font-bold leading-tight text-slate-800 dark:text-slate-100">{label}</span>
            {note && <span className="mt-0.5 text-xs leading-snug text-slate-500 dark:text-slate-400">{note}</span>}
          </div>
          {i < items.length - 1 && (
            <span aria-hidden="true" className="rotate-90 text-xl font-bold text-slate-400 dark:text-slate-500 sm:rotate-0">
              →
            </span>
          )}
        </li>
      ))}
    </ol>
  )
}

function Layers({ items, theme }: { items: [string, string?][]; theme: CaTheme }) {
  return (
    <ol className="flex flex-col gap-1.5">
      {items.map(([label, note], i) => (
        <li
          key={label + i}
          className="flex flex-col justify-between gap-0.5 rounded-xl px-4 py-2.5 text-white shadow-sm sm:flex-row sm:items-center sm:gap-4"
          style={{ background: shade(theme, i, items.length) }}
        >
          <span className="font-bold leading-tight">{label}</span>
          {note && <span className="text-xs leading-snug text-white/90 sm:text-right">{note}</span>}
        </li>
      ))}
    </ol>
  )
}

function Pyramid({ items, theme }: { items: [string, string?][]; theme: CaTheme }) {
  const n = items.length
  return (
    <ol className="flex flex-col items-center gap-1.5">
      {items.map(([label, note], i) => (
        <li
          key={label + i}
          className="rounded-xl px-3 py-2.5 text-center text-white shadow-sm"
          style={{ width: `${n === 1 ? 100 : 54 + (i / (n - 1)) * 46}%`, background: shade(theme, i, n) }}
        >
          <div className="text-sm font-bold leading-tight">{label}</div>
          {note && <div className="text-xs leading-snug text-white/90">{note}</div>}
        </li>
      ))}
    </ol>
  )
}

function Cycle({ items, theme }: { items: [string, string?][]; theme: CaTheme }) {
  const n = items.length
  const R = 37 // distance from the centre, % of the box
  return (
    <div className="relative mx-auto aspect-square w-full max-w-md">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <circle cx="50" cy="50" r={R} fill="none" stroke="currentColor" strokeWidth="0.7" strokeDasharray="2 2.2" className="text-slate-300 dark:text-slate-600" />
        {items.map((_, i) => {
          // a small arrowhead on the ring half-way between this node and the next
          const a = ((i + 0.5) / n) * 2 * Math.PI - Math.PI / 2
          const x = 50 + R * Math.cos(a)
          const y = 50 + R * Math.sin(a)
          const deg = (a * 180) / Math.PI + 90
          return <path key={i} d="M-1.6 1.2 L0 -1.6 L1.6 1.2 Z" transform={`translate(${x} ${y}) rotate(${deg})`} className="fill-slate-400 dark:fill-slate-500" />
        })}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-3xl opacity-60" aria-hidden="true">
        🔄
      </div>
      {items.map(([label, note], i) => {
        const a = (i / n) * 2 * Math.PI - Math.PI / 2
        return (
          <div
            key={label + i}
            className="absolute flex w-[31%] -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-xl bg-white px-1.5 py-1.5 text-center shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"
            style={{ left: `${50 + R * Math.cos(a)}%`, top: `${50 + R * Math.sin(a)}%` }}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: shade(theme, i, n) }}>
              {i + 1}
            </span>
            <span className="mt-0.5 text-[11px] font-bold leading-tight text-slate-800 dark:text-slate-100">{label}</span>
            {note && <span className="text-[10px] leading-tight text-slate-500 dark:text-slate-400">{note}</span>}
          </div>
        )
      })}
    </div>
  )
}
