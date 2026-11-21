import { useMemo, useState } from 'react'
import { THEMES } from '../../lib/computerAwareness/theme'
import type { CaMindmap, CaTheme } from '../../lib/computerAwareness/types'

/** Branch colours: each branch of the map (and its leaves) gets one, cycling if there are more branches than colours. */
const BRANCH_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#0ea5e9', '#8b5cf6', '#f97316', '#14b8a6']

const LEAF_FS = 12
const BRANCH_FS = 13
const CHAR_W = 6.3

/** Greedy word wrap on a character budget. */
function wrap(text: string, max: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    if (line && (line + ' ' + word).length > max) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines
}

interface Box {
  x: number
  y: number
  w: number
  h: number
  lines: string[]
}

interface PlacedBranch {
  color: string
  side: 1 | -1
  node: Box
  leaves: Box[]
}

interface Layout {
  width: number
  height: number
  center: Box
  branches: PlacedBranch[]
}

const textWidth = (lines: string[], charW: number) => Math.max(...lines.map((l) => l.length)) * charW

/** Lays the map out in two columns of branches, one either side of the centre, each with its leaves fanned beside it. */
function layout(map: CaMindmap): Layout {
  const PAD = 16
  const GAP = 34
  const LEAF_GAP = 7
  const GROUP_GAP = 18

  const centerLines = wrap(map.center, 16)
  const centerW = Math.max(120, textWidth(centerLines, 8.2) + 36)
  const centerH = Math.max(56, centerLines.length * 20 + 24)

  const half = Math.ceil(map.branches.length / 2)
  const sides: { branch: CaMindmap['branches'][number]; index: number }[][] = [[], []]
  map.branches.forEach((branch, index) => sides[index < half ? 0 : 1].push({ branch, index }))

  // per side: measure every group, then stack them
  const sideLayouts = sides.map((group, sideIndex) => {
    const measured = group.map(({ branch, index }) => {
      const bl = wrap(branch.label, 16)
      const bw = Math.max(70, textWidth(bl, 7.2) + 26)
      const bh = bl.length * 17 + 16
      const leaves = branch.children.map((c) => {
        const ll = wrap(c, 24)
        return { lines: ll, w: Math.max(54, textWidth(ll, CHAR_W) + 22), h: ll.length * 15 + 12 }
      })
      const leafStack = leaves.reduce((s, l) => s + l.h, 0) + LEAF_GAP * (leaves.length - 1)
      return { index, bl, bw, bh, leaves, groupH: Math.max(leafStack, bh), leafStack }
    })
    const branchColW = Math.max(0, ...measured.map((m) => m.bw))
    const leafColW = Math.max(0, ...measured.map((m) => Math.max(0, ...m.leaves.map((l) => l.w))))
    const height = measured.reduce((s, m) => s + m.groupH, 0) + GROUP_GAP * Math.max(0, measured.length - 1)
    return { sideIndex, measured, branchColW, leafColW, height }
  })

  const [left, right] = sideLayouts
  const leftW = left.measured.length ? left.branchColW + GAP + left.leafColW : 0
  const rightW = right.measured.length ? right.branchColW + GAP + right.leafColW : 0
  const height = Math.max(left.height, right.height, centerH) + PAD * 2
  const width = PAD + leftW + GAP + centerW + GAP + rightW + PAD
  const cx = PAD + leftW + GAP + centerW / 2
  const cy = height / 2
  const center: Box = { x: cx - centerW / 2, y: cy - centerH / 2, w: centerW, h: centerH, lines: centerLines }

  const branches: PlacedBranch[] = []
  for (const sl of [left, right]) {
    const side: 1 | -1 = sl.sideIndex === 0 ? -1 : 1
    let y = cy - sl.height / 2
    for (const m of sl.measured) {
      const groupMid = y + m.groupH / 2
      // branch column sits next to the centre; leaves go further out
      const branchX = side === 1 ? center.x + centerW + GAP : center.x - GAP - sl.branchColW
      const bx = side === 1 ? branchX : branchX + sl.branchColW - m.bw
      const node: Box = { x: side === 1 ? branchX : bx, y: groupMid - m.bh / 2, w: m.bw, h: m.bh, lines: m.bl }
      const leafColX = side === 1 ? branchX + sl.branchColW + GAP : branchX - GAP - sl.leafColW
      let ly = groupMid - m.leafStack / 2
      const leaves: Box[] = m.leaves.map((l) => {
        const box: Box = { x: side === 1 ? leafColX : leafColX + sl.leafColW - l.w, y: ly, w: l.w, h: l.h, lines: l.lines }
        ly += l.h + LEAF_GAP
        return box
      })
      branches.push({ color: BRANCH_COLORS[m.index % BRANCH_COLORS.length], side, node, leaves })
      y += m.groupH + GROUP_GAP
    }
  }
  return { width, height, center, branches }
}

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const mx = (x1 + x2) / 2
  return `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`
}

function MapSvg({ map, theme }: { map: CaMindmap; theme: CaTheme }) {
  const L = useMemo(() => layout(map), [map])
  const [c0, c1] = THEMES[theme].hex
  const gid = `mm-${theme}`
  const cx = L.center.x + L.center.w / 2
  const cy = L.center.y + L.center.h / 2
  return (
    <svg viewBox={`0 0 ${L.width} ${L.height}`} width={L.width} height={L.height} className="h-auto w-full" role="img" aria-label={`Mind map: ${map.center}`}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={c0} />
          <stop offset="100%" stopColor={c1} />
        </linearGradient>
      </defs>

      {/* connectors first, so the boxes sit on top */}
      {L.branches.map((b, i) => {
        const bx = b.side === 1 ? b.node.x : b.node.x + b.node.w
        const by = b.node.y + b.node.h / 2
        return (
          <g key={`e${i}`} fill="none" stroke={b.color} strokeLinecap="round">
            <path d={curve(b.side === 1 ? L.center.x + L.center.w : L.center.x, cy, bx, by)} strokeWidth="3" strokeOpacity="0.85" />
            {b.leaves.map((leaf, j) => (
              <path
                key={j}
                d={curve(b.side === 1 ? b.node.x + b.node.w : b.node.x, by, b.side === 1 ? leaf.x : leaf.x + leaf.w, leaf.y + leaf.h / 2)}
                strokeWidth="1.6"
                strokeOpacity="0.6"
              />
            ))}
          </g>
        )
      })}

      <g>
        <rect x={L.center.x} y={L.center.y} width={L.center.w} height={L.center.h} rx={L.center.h / 2} fill={`url(#${gid})`} />
        {L.center.lines.map((line, i) => (
          <text key={i} x={cx} y={cy + (i - (L.center.lines.length - 1) / 2) * 20} textAnchor="middle" dominantBaseline="central" fontSize="16" fontWeight="800" fill="#fff">
            {line}
          </text>
        ))}
      </g>

      {L.branches.map((b, i) => (
        <g key={`b${i}`}>
          <rect x={b.node.x} y={b.node.y} width={b.node.w} height={b.node.h} rx="12" fill={b.color} />
          {b.node.lines.map((line, k) => (
            <text
              key={k}
              x={b.node.x + b.node.w / 2}
              y={b.node.y + b.node.h / 2 + (k - (b.node.lines.length - 1) / 2) * 17}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={BRANCH_FS}
              fontWeight="700"
              fill="#fff"
            >
              {line}
            </text>
          ))}
          {b.leaves.map((leaf, j) => (
            <g key={j}>
              <rect x={leaf.x} y={leaf.y} width={leaf.w} height={leaf.h} rx="9" fill={b.color} fillOpacity="0.13" stroke={b.color} strokeOpacity="0.7" strokeWidth="1.2" />
              {leaf.lines.map((line, k) => (
                <text
                  key={k}
                  x={leaf.x + leaf.w / 2}
                  y={leaf.y + leaf.h / 2 + (k - (leaf.lines.length - 1) / 2) * 15}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={LEAF_FS}
                  className="fill-slate-800 dark:fill-slate-100"
                >
                  {line}
                </text>
              ))}
            </g>
          ))}
        </g>
      ))}
    </svg>
  )
}

function Outline({ map }: { map: CaMindmap }) {
  return (
    <div className="space-y-3">
      <div className="text-center text-lg font-extrabold text-slate-900 dark:text-slate-100">{map.center}</div>
      {map.branches.map((b, i) => {
        const color = BRANCH_COLORS[i % BRANCH_COLORS.length]
        return (
          <div key={i} className="rounded-2xl border-l-4 bg-white p-3 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700" style={{ borderLeftColor: color }}>
            <div className="font-bold text-slate-900 dark:text-slate-100">{b.label}</div>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {b.children.map((c, j) => (
                <li key={j} className="rounded-full px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200" style={{ background: `${color}22` }}>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

/** A chapter's mind map: a colour-coded radial-style diagram (scrollable on phones) with a plain outline alternative. */
export default function MindMap({ map, theme }: { map: CaMindmap; theme: CaTheme }) {
  const [view, setView] = useState<'map' | 'outline'>(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 'outline' : 'map'))
  const tab = (on: boolean) =>
    ['rounded-full px-3 py-1 text-xs font-semibold transition', on ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'].join(' ')
  return (
    <div>
      <div className="mb-3 flex justify-end gap-2">
        <button onClick={() => setView('map')} aria-pressed={view === 'map'} className={tab(view === 'map')}>
          🗺️ Map
        </button>
        <button onClick={() => setView('outline')} aria-pressed={view === 'outline'} className={tab(view === 'outline')}>
          📋 Outline
        </button>
      </div>
      {view === 'map' ? (
        <div className="overflow-x-auto rounded-2xl bg-white p-2 ring-1 ring-slate-200 dark:bg-slate-800/80 dark:ring-slate-700">
          <div className="min-w-[640px]">
            <MapSvg map={map} theme={theme} />
          </div>
        </div>
      ) : (
        <Outline map={map} />
      )}
    </div>
  )
}
