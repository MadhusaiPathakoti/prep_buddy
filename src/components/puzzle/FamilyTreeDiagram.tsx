import { useMemo } from 'react'
import { layoutFamily, PAD_TOP, ROW_H } from '../../lib/familyTree/layout'
import type { World } from '../../lib/familyTree/model'

const HALF = 24 // half the size of a person's symbol

/** One family as a tree: squares are men, circles women, a double line is a marriage, a bracket joins brothers and sisters, lines go down to the children. */
export default function FamilyTreeDiagram({ world }: { world: World }) {
  const L = useMemo(() => layoutFamily(world), [world])
  const at = (i: number) => L.nodes[i]
  const gens = [...new Set(world.gen)].sort((a, b) => a - b)
  const line = 'stroke-slate-600 dark:stroke-slate-300'

  return (
    <svg viewBox={`0 0 ${L.width} ${L.height}`} role="img" aria-label="Family tree" className="mx-auto block h-auto w-full max-w-full" style={{ maxWidth: Math.max(L.width, 320) }}>
      {gens.map((g, k) => (
        <text key={g} x={8} y={PAD_TOP + k * ROW_H + 4} className="fill-slate-400 dark:fill-slate-500" fontSize="12" fontWeight="600">
          Gen {g}
        </text>
      ))}

      {/* children hang from their parents */}
      {L.childGroups.map((cg, k) => {
        const kids = cg.children.map(at)
        const ps = cg.parents.map(at)
        const startX = ps.reduce((s, p) => s + p.x, 0) / ps.length
        const startY = ps.length === 2 ? ps[0].y : ps[0].y + HALF
        const busY = kids[0].y - 56
        const xs = [startX, ...kids.map((c) => c.x)]
        return (
          <g key={k} className={line} strokeWidth="2.5" fill="none">
            <line x1={startX} y1={startY} x2={startX} y2={busY} />
            <line x1={Math.min(...xs)} y1={busY} x2={Math.max(...xs)} y2={busY} />
            {kids.map((c) => (
              <line key={c.i} x1={c.x} y1={busY} x2={c.x} y2={c.y - HALF} />
            ))}
          </g>
        )
      })}

      {/* brothers and sisters whose parents are outside the family */}
      {L.sibGroups.map((grp, k) => {
        const ns = grp.map(at)
        const top = ns[0].y - HALF - 34 - k * 0
        return (
          <g key={k} className={line} strokeWidth="2.5" fill="none">
            <line x1={Math.min(...ns.map((n) => n.x))} y1={top} x2={Math.max(...ns.map((n) => n.x))} y2={top} />
            {ns.map((n) => (
              <line key={n.i} x1={n.x} y1={top} x2={n.x} y2={n.y - HALF} />
            ))}
            <text x={(Math.min(...ns.map((n) => n.x)) + Math.max(...ns.map((n) => n.x))) / 2} y={top - 6} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400" stroke="none" fontSize="12">
              Siblings
            </text>
          </g>
        )
      })}

      {/* marriages: a double line between the two */}
      {L.marriages.map(([a, b], k) => {
        const [l, r] = at(a).x < at(b).x ? [at(a), at(b)] : [at(b), at(a)]
        return (
          <g key={k} className={line} strokeWidth="2.5">
            <line x1={l.x + HALF} y1={l.y - 4} x2={r.x - HALF} y2={r.y - 4} />
            <line x1={l.x + HALF} y1={l.y + 4} x2={r.x - HALF} y2={r.y + 4} />
          </g>
        )
      })}

      {L.nodes.map((n) => {
        const male = world.gender[n.i] === 'M'
        return (
          <g key={n.i}>
            {male ? <rect x={n.x - HALF} y={n.y - HALF} width={HALF * 2} height={HALF * 2} rx="3" fill="#60a5fa" stroke="#0f172a" strokeWidth="2.5" /> : <circle cx={n.x} cy={n.y} r={HALF} fill="#f472b6" stroke="#0f172a" strokeWidth="2.5" />}
            <text x={n.x} y={n.y + 6} textAnchor="middle" fontSize="18" fontWeight="800" fill="#0f172a">
              {world.names[n.i]}
            </text>
            <text x={n.x} y={n.y + HALF + 16} textAnchor="middle" fontSize="12" fontWeight="700" className="fill-slate-500 dark:fill-slate-400">
              {male ? '[+]' : '[–]'}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
