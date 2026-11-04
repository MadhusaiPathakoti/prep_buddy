import type { Stimulus, StimulusPart } from '../../lib/mocks/types'

const PALETTE = ['#4f46e5', '#f59e0b', '#10b981', '#ef4444', '#0ea5e9', '#8b5cf6', '#ec4899', '#14b8a6', '#84cc16', '#f97316']

const fmt = (n: number) => String(Number(n.toFixed(2)))

function niceMax(max: number): number {
  if (max <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(max))
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (max <= m * pow) return m * pow
  return 10 * pow
}

function Legend({ names }: { names: string[] }) {
  return (
    <div className="mb-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
      {names.map((n, i) => (
        <span key={n} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
          {n}
        </span>
      ))}
    </div>
  )
}

const W = 600
const H = 300
const M = { top: 16, right: 12, bottom: 44, left: 46 }
const PW = W - M.left - M.right
const PH = H - M.top - M.bottom

function Axes({ max, unit, categories }: { max: number; unit?: string; categories: string[] }) {
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max)
  const gw = PW / categories.length
  return (
    <g>
      {ticks.map((t) => {
        const y = M.top + PH - (t / max) * PH
        return (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y} y2={y} stroke="currentColor" strokeOpacity={0.15} />
            <text x={M.left - 6} y={y + 3} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.7}>
              {fmt(t)}
            </text>
          </g>
        )
      })}
      {unit && (
        <text x={10} y={M.top + PH / 2} fontSize={10} fill="currentColor" fillOpacity={0.7} transform={`rotate(-90 10 ${M.top + PH / 2})`} textAnchor="middle">
          {unit}
        </text>
      )}
      {categories.map((c, i) => (
        <text key={c + i} x={M.left + gw * i + gw / 2} y={H - M.bottom + 16} textAnchor="middle" fontSize={11} fill="currentColor">
          {c}
        </text>
      ))}
    </g>
  )
}

function BarChart({ part }: { part: Extract<StimulusPart, { kind: 'bar' }> }) {
  const { categories, series, stacked } = part
  const rawMax = stacked ? Math.max(...categories.map((_, i) => series.reduce((s, x) => s + x.values[i], 0))) : Math.max(...series.flatMap((s) => s.values))
  const max = niceMax(rawMax)
  const gw = PW / categories.length
  const barW = stacked ? gw * 0.55 : (gw * 0.75) / series.length
  const y = (v: number) => (v / max) * PH
  return (
    <div>
      {series.length > 1 && <Legend names={series.map((s) => s.name)} />}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={part.heading ?? 'Bar graph'}>
        <Axes max={max} unit={part.unit} categories={categories} />
        {categories.map((_, ci) => {
          let acc = 0
          return series.map((s, si) => {
            const v = s.values[ci]
            const x = stacked ? M.left + gw * ci + (gw - barW) / 2 : M.left + gw * ci + gw * 0.125 + barW * si
            const base = stacked ? acc : 0
            if (stacked) acc += v
            const top = M.top + PH - y(base + v)
            return (
              <g key={`${ci}-${si}`}>
                <rect x={x} y={top} width={barW - 1} height={y(v)} fill={PALETTE[si % PALETTE.length]} />
                <text
                  x={x + (barW - 1) / 2}
                  y={stacked ? top + y(v) / 2 + 3 : top - 3}
                  textAnchor="middle"
                  fontSize={series.length > 2 && !stacked ? 8 : 10}
                  fill={stacked ? '#fff' : 'currentColor'}
                >
                  {fmt(v)}
                </text>
              </g>
            )
          })
        })}
      </svg>
    </div>
  )
}

function LineChart({ part }: { part: Extract<StimulusPart, { kind: 'line' }> }) {
  const { categories, series } = part
  const max = niceMax(Math.max(...series.flatMap((s) => s.values)))
  const gw = PW / categories.length
  const px = (i: number) => M.left + gw * i + gw / 2
  const py = (v: number) => M.top + PH - (v / max) * PH
  return (
    <div>
      {series.length > 1 && <Legend names={series.map((s) => s.name)} />}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={part.heading ?? 'Line graph'}>
        <Axes max={max} unit={part.unit} categories={categories} />
        {series.map((s, si) => {
          const color = PALETTE[si % PALETTE.length]
          return (
            <g key={s.name}>
              <polyline fill="none" stroke={color} strokeWidth={2} points={s.values.map((v, i) => `${px(i)},${py(v)}`).join(' ')} />
              {s.values.map((v, i) => (
                <g key={i}>
                  <circle cx={px(i)} cy={py(v)} r={3.5} fill={color} />
                  <text x={px(i)} y={py(v) - 7} textAnchor="middle" fontSize={10} fill="currentColor">
                    {fmt(v)}
                  </text>
                </g>
              ))}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function PieChart({ part }: { part: Extract<StimulusPart, { kind: 'pie' }> }) {
  const total = part.slices.reduce((s, x) => s + x.value, 0)
  const R = 95
  const cx = 150
  const cy = 120
  const arcs = part.slices.map((s, i) => {
    const before = part.slices.slice(0, i).reduce((n, x) => n + x.value, 0)
    const a0 = -Math.PI / 2 + (before / total) * Math.PI * 2
    const a1 = a0 + (s.value / total) * Math.PI * 2
    const mid = (a0 + a1) / 2
    const large = a1 - a0 > Math.PI ? 1 : 0
    const p = (a: number, r = R) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`
    const d = part.slices.length === 1 ? '' : `M${cx},${cy} L${p(a0)} A${R},${R} 0 ${large} 1 ${p(a1)} Z`
    return { d, mid, color: PALETTE[i % PALETTE.length], s }
  })
  return (
    <svg viewBox="0 0 520 240" className="mx-auto w-full max-w-xl" role="img" aria-label={part.heading ?? 'Pie chart'}>
      {arcs.map((a) => (
        <g key={a.s.label}>
          <path d={a.d} fill={a.color} stroke="#fff" strokeWidth={1.5} />
          <text x={cx + R * 0.62 * Math.cos(a.mid)} y={cy + R * 0.62 * Math.sin(a.mid) + 3} textAnchor="middle" fontSize={10} fontWeight={600} fill="#fff">
            {fmt(a.s.value)}
          </text>
        </g>
      ))}
      <g transform="translate(290 28)">
        {part.slices.map((s, i) => (
          <g key={s.label} transform={`translate(0 ${i * 22})`}>
            <rect width={12} height={12} rx={2} fill={PALETTE[i % PALETTE.length]} />
            <text x={20} y={10} fontSize={12} fill="currentColor">
              {s.label} — {fmt(s.value)}
              {part.unit ? ` ${part.unit}` : ''}
            </text>
          </g>
        ))}
      </g>
    </svg>
  )
}

function Part({ part }: { part: StimulusPart }) {
  return (
    <div className="mb-4">
      {part.kind !== 'text' && part.heading && <h4 className="mb-2 text-center text-sm font-bold">{part.heading}</h4>}
      {part.kind === 'text' && (
        <div>
          {part.heading && <h4 className="mb-2 text-sm font-bold">{part.heading}</h4>}
          {part.paragraphs.map((p, i) => (
            <p key={i} className="mb-3 whitespace-pre-line leading-relaxed">
              {p}
            </p>
          ))}
        </div>
      )}
      {part.kind === 'table' && (
        <div className="overflow-x-auto">
          <table className="mx-auto min-w-[60%] border-collapse text-sm">
            <thead>
              <tr>
                {part.columns.map((c, i) => (
                  <th key={i} className="border border-slate-400 bg-slate-100 px-3 py-1.5 text-center font-semibold text-slate-800">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {part.rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((cell, ci) => (
                    <td key={ci} className={`border border-slate-300 px-3 py-1.5 text-center ${ci === 0 ? 'font-medium' : ''}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {part.note && <p className="mt-1 text-center text-xs opacity-70">{part.note}</p>}
        </div>
      )}
      {/* Charts keep a readable minimum width and scroll sideways in a narrow pane rather than shrinking their labels. */}
      {(part.kind === 'bar' || part.kind === 'line' || part.kind === 'pie') && (
        <div className="overflow-x-auto">
          <div className="min-w-[460px]">
            {part.kind === 'bar' && <BarChart part={part} />}
            {part.kind === 'line' && <LineChart part={part} />}
            {part.kind === 'pie' && <PieChart part={part} />}
          </div>
        </div>
      )}
    </div>
  )
}

export default function StimulusView({ stimulus }: { stimulus: Stimulus }) {
  return (
    <div>
      {stimulus.directions && <p className="mb-3 font-semibold italic">{stimulus.directions}</p>}
      {stimulus.parts.map((p, i) => (
        <Part key={i} part={p} />
      ))}
    </div>
  )
}
