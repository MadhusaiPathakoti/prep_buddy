// Draws pictures. A picture ("world") is a set of circles whose zones are all occupied — the zones are measured from the
// actual geometry and then checked against the statements by `worldIsValid`, so what the learner sees is always a legal
// picture. Pictures are found by choosing a relation for every pair of circles (disjoint / overlapping / inside / …),
// keeping only combinations the statements allow, and laying them out.

import { consistent, literalConstraint, relConstraints, worldIsValid, type Constraint, type Literal, type Model, type Rel } from './engine'

export const W = 640
export const H = 400

export interface Circle {
  t: number // term index
  x: number
  y: number
  r: number
}
export interface Zone {
  mask: number // which terms' circles this region lies inside
  x: number // a good spot for its dot (far from every boundary)
  y: number
  samples: number
}
export interface World {
  focus: number[]
  circles: Circle[]
  zones: Zone[]
  rels: Rel[] // one per pair of `focus`, in pair order
  sig: string
}

function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- zones ----------

const STEP = 4
const MIN_SAMPLES = 10

/** The non-empty regions of a set of circles, found by sampling. `ok` is false when a sliver too thin to see exists. */
export function computeZones(circles: Circle[]): { zones: Zone[]; ok: boolean } {
  const count = new Map<number, number>()
  const best = new Map<number, { m: number; x: number; y: number }>()
  for (let gy = STEP / 2; gy < H; gy += STEP) {
    for (let gx = STEP / 2; gx < W; gx += STEP) {
      let mask = 0
      let edge = Infinity
      for (const c of circles) {
        const d = Math.hypot(gx - c.x, gy - c.y)
        if (d < c.r) mask |= 1 << c.t
        const b = Math.abs(d - c.r)
        if (b < edge) edge = b
      }
      if (!mask) continue
      count.set(mask, (count.get(mask) ?? 0) + 1)
      const cur = best.get(mask)
      if (!cur || edge > cur.m) best.set(mask, { m: edge, x: gx, y: gy })
    }
  }
  const zones: Zone[] = []
  let ok = true
  for (const [mask, n] of count) {
    if (n < MIN_SAMPLES) ok = false
    else {
      const b = best.get(mask)!
      zones.push({ mask, x: b.x, y: b.y, samples: n })
    }
  }
  zones.sort((a, b) => a.mask - b.mask)
  return { zones, ok }
}

// ---------- circle layout ----------

const G = 10 // breathing room between circles that must not touch / must stay inside

function relAt(rel: Rel[][], i: number, j: number): Rel {
  if (i < j) return rel[i][j]
  const r = rel[j][i]
  return r === 'IN' ? 'CT' : r === 'CT' ? 'IN' : r
}

function solveLayout(n: number, rel: Rel[][], rng: () => number, leaf = 44): { x: number; y: number; r: number }[] | null {
  const contained = new Array<number>(n).fill(0)
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && relAt(rel, i, j) === 'CT') contained[i]++
  // a circle that must hold others starts big enough to keep them apart
  const r = contained.map((c) => leaf * (1 + 0.9 * c))
  const x: number[] = []
  const y: number[] = []
  const a0 = rng() * Math.PI * 2
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2
    x.push(W / 2 + Math.cos(a) * 120 + (rng() - 0.5) * 30)
    y.push(H / 2 + Math.sin(a) * 70 + (rng() - 0.5) * 30)
  }
  const move = (i: number, j: number, ux: number, uy: number, amount: number) => {
    // amount > 0 pulls i and j together along u (u points from i to j); amount < 0 pushes them apart
    x[i] += ux * amount
    y[i] += uy * amount
    x[j] -= ux * amount
    y[j] -= uy * amount
  }
  for (let it = 0; it < 700; it++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = x[j] - x[i]
        let dy = y[j] - y[i]
        let d = Math.hypot(dx, dy)
        if (d < 1e-6) {
          dx = rng() - 0.5
          dy = rng() - 0.5
          d = Math.hypot(dx, dy)
        }
        const ux = dx / d
        const uy = dy / d
        switch (rel[i][j]) {
          case 'DJ': {
            const need = r[i] + r[j] + G
            if (d < need) move(i, j, ux, uy, -(need - d) * 0.5)
            break
          }
          case 'OV': {
            const hi = r[i] + r[j] - 18
            const lo = Math.abs(r[i] - r[j]) + 14
            if (d > hi) move(i, j, ux, uy, (d - hi) * 0.5)
            else if (d < lo) move(i, j, ux, uy, -(lo - d) * 0.5)
            break
          }
          case 'IN':
          case 'CT': {
            const [inner, outer] = rel[i][j] === 'IN' ? [i, j] : [j, i]
            const gap = r[outer] - r[inner]
            if (gap < 2 * G + 6) {
              const e = (2 * G + 6 - gap) * 0.5
              r[inner] -= e
              r[outer] += e
            }
            const lim = r[outer] - r[inner] - G
            if (d > lim) move(i, j, ux, uy, (d - lim) * 0.5)
            break
          }
          case 'EQ': {
            const mx = (x[i] + x[j]) / 2
            const my = (y[i] + y[j]) / 2
            const mr = (r[i] + r[j]) / 2
            x[i] = x[j] = mx
            y[i] = y[j] = my
            r[i] = r[j] = mr
            break
          }
        }
      }
    }
    for (let i = 0; i < n; i++) {
      r[i] = Math.min(260, Math.max(18, r[i]))
      x[i] += (W / 2 - x[i]) * 0.004
      y[i] += (H / 2 - y[i]) * 0.004
    }
  }
  // all relations satisfied?
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = Math.hypot(x[j] - x[i], y[j] - y[i])
      switch (rel[i][j]) {
        case 'DJ':
          if (d < r[i] + r[j] + G - 1) return null
          break
        case 'OV':
          if (d > r[i] + r[j] - 16 || d < Math.abs(r[i] - r[j]) + 12) return null
          break
        case 'IN':
          if (d > r[j] - r[i] - G + 1 || r[j] - r[i] < G) return null
          break
        case 'CT':
          if (d > r[i] - r[j] - G + 1 || r[i] - r[j] < G) return null
          break
        case 'EQ':
          if (d > 1 || Math.abs(r[i] - r[j]) > 1) return null
          break
      }
    }
  }
  // fit into the canvas (leaving room for the name tags)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, x[i] - r[i])
    maxX = Math.max(maxX, x[i] + r[i])
    minY = Math.min(minY, y[i] - r[i])
    maxY = Math.max(maxY, y[i] + r[i])
  }
  const s = Math.min((W - 90) / (maxX - minX), (H - 100) / (maxY - minY), 1.7)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  return x.map((_, i) => ({ x: W / 2 + (x[i] - cx) * s, y: H / 2 + (y[i] - cy) * s, r: r[i] * s }))
}

// ---------- name tags ----------

/** Where each circle's name tag goes: just outside its rim, clear of other circles' rims and of the other tags. */
export interface LabelSpot {
  x: number
  y: number
  /** where the leader line meets the circle's rim */
  rx: number
  ry: number
}

export function placeLabels(circles: Circle[], labels: Map<number, string>): Map<number, LabelSpot> {
  const spots = new Map<number, LabelSpot & { w: number }>()
  const order = [...circles].sort((a, b) => b.r - a.r)
  for (const c of order) {
    const w = (labels.get(c.t) ?? '').length * 7.6 + 20
    let best: { x: number; y: number; rx: number; ry: number; score: number } | null = null
    for (let deg = 0; deg < 360; deg += 6) {
      const a = (deg * Math.PI) / 180
      // push the tag out far enough that its own box clears the rim, whatever direction it sits in
      const reach = c.r + Math.abs(Math.cos(a)) * (w / 2) + Math.abs(Math.sin(a)) * 11 + 4
      const px = c.x + Math.cos(a) * reach
      const py = c.y + Math.sin(a) * reach
      if (px < w / 2 + 4 || px > W - w / 2 - 4 || py < 16 || py > H - 14) continue
      let score = 0
      let insideOther = false
      for (const o of circles) {
        if (o === c) continue
        const d = Math.hypot(px - o.x, py - o.y)
        if (d < o.r) insideOther = true
        score += Math.min(26, Math.abs(d - o.r)) * 0.8
        // does another circle's rim cut through the tag? (sample the box: corners, edge middles, centre)
        let inside = 0
        let outside = 0
        for (const [sx, sy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
          if (Math.hypot(px + (sx * w) / 2 - o.x, py + sy * 11 - o.y) < o.r) inside++
          else outside++
        }
        if (inside && outside) score -= 70
      }
      if (!insideOther) score += 40
      for (const s of spots.values()) {
        if (Math.abs(px - s.x) < (w + s.w) / 2 + 6 && Math.abs(py - s.y) < 28) score -= 400
      }
      score += Math.sin(a) < 0 ? 6 : 0 // a slight liking for the top
      if (!best || score > best.score) best = { x: px, y: py, rx: c.x + Math.cos(a) * c.r, ry: c.y + Math.sin(a) * c.r, score }
    }
    if (!best) best = { x: Math.min(W - 40, Math.max(40, c.x)), y: Math.max(16, c.y - c.r - 15), rx: c.x, ry: c.y - c.r, score: 0 }
    spots.set(c.t, { x: best.x, y: best.y, rx: best.rx, ry: best.ry, w })
  }
  return new Map([...spots].map(([t, s]) => [t, { x: s.x, y: s.y, rx: s.rx, ry: s.ry }]))
}

// ---------- the world search ----------

const ALL_RELS: Rel[] = ['DJ', 'OV', 'IN', 'CT']

export interface SearchOptions {
  focus: number[]
  lits: Literal[]
  /** How many different pictures to return. */
  want: number
  /** Preferred order of relations for a pair of circles (statements about the pair shape this). */
  order?: (a: number, b: number) => Rel[]
  /** Give up after this many milliseconds (best effort). */
  budgetMs?: number
}

function layoutWorld(model: Model, focus: number[], pairs: [number, number][], rels: Rel[], lits: Literal[], seed: number): World | null {
  const n = focus.length
  const rel: Rel[][] = Array.from({ length: n }, () => new Array<Rel>(n).fill('DJ'))
  pairs.forEach(([i, j], p) => {
    rel[i][j] = rels[p]
  })
  for (let attempt = 0; attempt < 5; attempt++) {
    const rng = mulberry(seed * 31 + attempt * 977 + 7)
    const pos = solveLayout(n, rel, rng, [44, 36, 44, 28, 20][attempt])
    if (!pos) continue
    const circles: Circle[] = pos.map((p, i) => ({ t: focus[i], ...p }))
    const { zones, ok } = computeZones(circles)
    if (!ok) continue
    if (!worldIsValid(model, focus, zones.map((z) => z.mask), lits)) continue
    return { focus, circles, zones, rels: [...rels], sig: zones.map((z) => z.mask).join(',') }
  }
  return null
}

export function findWorlds(model: Model, opts: SearchOptions): World[] {
  const { focus, lits, want } = opts
  const t0 = performance.now()
  const budget = opts.budgetMs ?? 700
  const pairs: [number, number][] = []
  for (let i = 0; i < focus.length; i++) for (let j = i + 1; j < focus.length; j++) pairs.push([i, j])
  const litCons: Constraint[] = lits.map((l) => literalConstraint(model.k, l))
  const seen = new Set<string>()
  const pool: World[] = []
  const passes = want <= 1 ? 3 : 8

  const search = (pass: number): World | null => {
    let attempts = 0
    const chosen: Rel[] = new Array(pairs.length)
    const cons: Constraint[] = [...litCons]
    const rec = (pi: number): World | null => {
      if (performance.now() - t0 > budget) return null
      if (pi === pairs.length) {
        attempts++
        const w = layoutWorld(model, focus, pairs, chosen, lits, pass * 101 + attempts)
        return w && !seen.has(w.sig) ? w : null
      }
      const [i, j] = pairs[pi]
      let dom = (opts.order ? opts.order(focus[i], focus[j]) : ALL_RELS).filter((r) => r !== 'EQ')
      if (pass > 0 && dom.length > 1) {
        const s = (pass + pi) % dom.length
        dom = [...dom.slice(s), ...dom.slice(0, s)]
      }
      for (const rel of [...dom, 'EQ' as Rel]) {
        const rc = relConstraints(model.k, focus[i], focus[j], rel)
        if (!consistent(model, [...cons, ...rc])) continue
        cons.push(...rc)
        chosen[pi] = rel
        const w = rec(pi + 1)
        cons.length -= rc.length
        if (w) return w
        if (attempts >= 40 || performance.now() - t0 > budget) return null
      }
      return null
    }
    return rec(0)
  }

  for (let pass = 0; pass < passes && pool.length < want + 2; pass++) {
    const w = search(pass)
    if (w) {
      seen.add(w.sig)
      pool.push(w)
    }
    if (performance.now() - t0 > budget) break
  }
  if (pool.length <= want) return pool
  // keep the simplest picture, then add the ones that differ most from those already chosen
  const picked = [pool[0]]
  const dist = (a: World, b: World) => a.rels.reduce((s, r, i) => s + (r === b.rels[i] ? 0 : 1), 0)
  while (picked.length < want) {
    let bestW: World | null = null
    let bestD = -1
    for (const w of pool) {
      if (picked.includes(w)) continue
      const d = Math.min(...picked.map((p) => dist(p, w)))
      if (d > bestD) {
        bestD = d
        bestW = w
      }
    }
    if (!bestW) break
    picked.push(bestW)
  }
  return picked
}
