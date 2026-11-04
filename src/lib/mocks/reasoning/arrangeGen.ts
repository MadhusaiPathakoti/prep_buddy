// Hidden arrangement -> random TRUE clues -> exhaustive-solver-checked minimal unique clue set.
import type { Rng } from '../rng'
import type { MockDifficulty } from '../types'
import { evalAtom, grpOf, grpSize, idxOf, mod, shiftPos, uniqueStateCons, compileAtom, canonicalize, type Atom, type Geometry, type Item } from './arrange'

export interface GenCtx {
  rng: Rng
  g: Geometry
  n: number
  /** total attributes including persons (>=1). */
  nA: number
  hidden: number[][]
  inv: number[][]
  difficulty: MockDifficulty
  floors: boolean
}

export function makeCtx(rng: Rng, g: Geometry, nA: number, difficulty: MockDifficulty, floors: boolean, hidden?: number[][]): GenCtx {
  const n = g.n
  let h = hidden
  if (!h) {
    h = []
    for (let a = 0; a < nA; a++) h.push(rng.shuffle(Array.from({ length: n }, (_, i) => i)))
    h = canonicalize(g, h)
  }
  const inv = h.map((row) => {
    const r = new Array<number>(n)
    row.forEach((p, v) => {
      r[p] = v
    })
    return r
  })
  return { rng, g, n, nA, hidden: h, inv, difficulty, floors }
}

export const P = (c: GenCtx) => (it: Item): number => c.hidden[it[0]][it[1]]
export const truth = (c: GenCtx, a: Atom): boolean => evalAtom(c.g, a, P(c))
export const itemAt = (c: GenCtx, a: number, p: number): Item => [a, c.inv[a][p]]

function pickAttr(c: GenCtx): number {
  if (c.nA === 1) return 0
  return c.rng.chance(c.difficulty === 'hard' ? 0.5 : 0.75) ? 0 : c.rng.int(1, c.nA - 1)
}

type T = 'off' | 'btw' | 'adj' | 'lt' | 'mid' | 'end' | 'pos' | 'eq' | 'grp' | 'same' | 'face' | 'opp' | 'corner' | 'par' | 'not' | 'or' | 'cmp'

function weights(c: GenCtx): [T, number][] {
  const hard = c.difficulty === 'hard'
  const k = c.g.kind
  const w: [T, number][] = []
  const add = (t: T, m: number, h: number) => {
    const v = hard ? h : m
    if (v > 0) w.push([t, v])
  }
  if (k === 'row' || k === 'tworow' || k === 'stacks') {
    add('off', 40, 28)
    add('adj', 12, 8)
    add('btw', 8, 14)
    add('end', 4, 3)
    if (k !== 'tworow') add('lt', 6, 9)
    add('mid', 0, 10)
    if (k !== 'tworow') add('pos', 5, 3)
    if (k === 'tworow' || (k === 'stacks' && c.g.kind === 'stacks' && c.g.stacks > 1)) {
      add('grp', 10, 6)
      add('same', 5, 8)
    }
    if (k === 'tworow') add('face', 16, 14)
  } else if (k === 'circle') {
    add('off', 45, 30)
    add('adj', 12, 8)
    add('btw', 8, 14)
    add(c.g.kind === 'circle' && c.g.facing === 'in' ? 'face' : 'opp', 14, 12)
  } else {
    add('off', 40, 28)
    add('adj', 14, 10)
    add('face', 14, 12)
    add('opp', 6, 8)
    add('corner', 14, 10)
  }
  if (c.nA > 1) add('eq', 38, 24)
  if (c.nA > 1) add('cmp', 10, 18)
  add('not', 0, 14)
  add('or', 0, 8)
  if (c.floors) add('par', 4, 5)
  return w
}

function pickW<X>(rng: Rng, w: [X, number][]): X {
  const total = w.reduce((s, x) => s + x[1], 0)
  let r = rng.next() * total
  for (const [x, wt] of w) {
    r -= wt
    if (r < 0) return x
  }
  return w[w.length - 1][0]
}

/** Random TRUE atom of the given type, or null. */
function genTrue(c: GenCtx, t: T): Atom | null {
  const { rng, g, n } = c
  const hard = c.difficulty === 'hard'
  const item = (p: number): Item => itemAt(c, pickAttr(c), p)
  switch (t) {
    case 'off': {
      const py = rng.int(0, n - 1)
      const maxd = g.kind === 'square' ? 1 : hard ? 3 : 2
      const ds = [1, -1, 2, -2, 3, -3].filter((v) => Math.abs(v) <= maxd)
      const d = rng.pick(ds)
      const px = shiftPos(g, py, d)
      if (px < 0) return null
      return { t: 'off', x: item(px), y: item(py), d }
    }
    case 'btw': {
      const px = rng.int(0, n - 1)
      const kmax = hard ? 4 : 3
      const k = rng.int(1, kmax)
      if (g.kind === 'circle') {
        const side = rng.pick([1, -1] as const)
        const py = mod(px + side * (k + 1), n)
        return { t: 'btw', x: item(px), y: item(py), k, side }
      }
      const s = rng.pick([1, -1])
      const py = shiftPos(g, px, s * (k + 1))
      if (py < 0) return null
      return { t: 'btw', x: item(px), y: item(py), k }
    }
    case 'adj': {
      const px = rng.int(0, n - 1)
      const py = shiftPos(g, px, rng.pick([1, -1]))
      if (py < 0) return null
      return { t: 'adj', x: item(px), y: item(py) }
    }
    case 'lt': {
      const py = rng.int(0, n - 1)
      const gi = grpOf(g, py)
      const iy = idxOf(g, py)
      if (iy < 2) return null
      const ix = rng.int(0, iy - 2)
      return { t: 'lt', x: item(gi * grpSize(g) + ix), y: item(py) }
    }
    case 'mid': {
      const sz = grpSize(g)
      const gi = rng.int(0, (n / sz) - 1)
      const span = rng.int(2, Math.min(sz - 1, hard ? 5 : 4))
      if (span > sz - 1) return null
      const a = rng.int(0, sz - 1 - span)
      const b = a + rng.int(1, span - 1)
      const cc = a + span
      const base = gi * sz
      const swap = rng.chance(0.5)
      return { t: 'mid', x: item(base + (swap ? cc : a)), y: item(base + b), z: item(base + (swap ? a : cc)) }
    }
    case 'end': {
      const sz = grpSize(g)
      const gi = rng.int(0, n / sz - 1)
      const p = gi * sz + (rng.chance(0.5) ? 0 : sz - 1)
      return { t: 'end', x: item(p) }
    }
    case 'pos': {
      const p = rng.int(0, n - 1)
      return { t: 'pos', x: item(p), p: idxOf(g, p) }
    }
    case 'eq': {
      const p = rng.int(0, n - 1)
      const a = rng.int(1, c.nA - 1)
      if (c.nA >= 3 && hard && rng.chance(0.25)) {
        const b = a === 1 ? 2 : 1
        return { t: 'eq', x: itemAt(c, a, p), y: itemAt(c, b, p) }
      }
      return { t: 'eq', x: itemAt(c, 0, p), y: itemAt(c, a, p) }
    }
    case 'grp': {
      const p = rng.int(0, n - 1)
      return { t: 'grp', x: item(p), g: grpOf(g, p) }
    }
    case 'same': {
      const px = rng.int(0, n - 1)
      const sz = grpSize(g)
      const base = grpOf(g, px) * sz
      const py = base + rng.int(0, sz - 1)
      if (py === px) return null
      return { t: 'same', x: item(px), y: item(py) }
    }
    case 'face': {
      const px = rng.int(0, n - 1)
      let py: number
      if (g.kind === 'tworow') {
        const m = n / 2
        py = (grpOf(g, px) === 0 ? m : 0) + (m - 1 - idxOf(g, px))
      } else if (g.kind === 'square') {
        if (px % 2 === 0) return null
        py = mod(px + n / 2, n)
      } else py = mod(px + n / 2, n)
      return { t: 'face', x: item(px), y: item(py) }
    }
    case 'opp': {
      const px = rng.int(0, n - 1)
      if (g.kind === 'square' && px % 2 === 1) return null
      return { t: 'opp', x: item(px), y: item(mod(px + n / 2, n)) }
    }
    case 'corner': {
      const p = 2 * rng.int(0, n / 2 - 1)
      return { t: 'corner', x: item(p) }
    }
    case 'par': {
      const p = rng.int(0, n - 1)
      return { t: 'par', x: item(p), odd: (p + 1) % 2 === 1 }
    }
    default:
      return null
  }
}

/** Random atom of a simple type with random (not solution-derived) parameters. */
export function genRandom(c: GenCtx, types: T[]): Atom | null {
  const { rng, g, n } = c
  const t = rng.pick(types)
  const pick2 = (): [number, number] => {
    const a = rng.int(0, n - 1)
    let b = rng.int(0, n - 1)
    while (b === a) b = rng.int(0, n - 1)
    return [a, b]
  }
  const item = (p: number): Item => itemAt(c, pickAttr(c), p)
  const [pa, pb] = pick2()
  switch (t) {
    case 'off': {
      const maxd = g.kind === 'square' ? 1 : 3
      const d = rng.pick([1, -1, 2, -2, 3, -3].filter((v) => Math.abs(v) <= maxd))
      return { t: 'off', x: item(pa), y: item(pb), d }
    }
    case 'adj':
      return { t: 'adj', x: item(pa), y: item(pb) }
    case 'lt':
      return { t: 'lt', x: item(pa), y: item(pb) }
    case 'btw': {
      const k = rng.int(1, 4)
      return g.kind === 'circle' ? { t: 'btw', x: item(pa), y: item(pb), k, side: rng.pick([1, -1] as const) } : { t: 'btw', x: item(pa), y: item(pb), k }
    }
    case 'end':
      return { t: 'end', x: item(pa) }
    case 'pos':
      return { t: 'pos', x: item(pa), p: rng.int(0, grpSize(g) - 1) }
    case 'same':
      return { t: 'same', x: item(pa), y: item(pb) }
    case 'grp':
      return { t: 'grp', x: item(pa), g: rng.int(0, n / grpSize(g) - 1) }
    case 'face':
      return { t: 'face', x: item(pa), y: item(pb) }
    case 'opp':
      return { t: 'opp', x: item(pa), y: item(pb) }
    case 'corner':
      return { t: 'corner', x: item(pa) }
    case 'eq': {
      const a = rng.int(1, c.nA - 1)
      return { t: 'eq', x: itemAt(c, 0, pa), y: itemAt(c, a, rng.int(0, n - 1)) }
    }
    case 'par':
      return { t: 'par', x: item(pa), odd: rng.chance(0.5) }
    default:
      return null
  }
}

export function negatableTypes(c: GenCtx): T[] {
  const k = c.g.kind
  const base: T[] = k === 'circle' || k === 'square' ? ['adj', 'off'] : ['adj', 'off', 'end']
  if (k === 'tworow') base.push('grp', 'same', 'face')
  if (k === 'row' || k === 'stacks') base.push('lt', 'pos')
  if (k === 'stacks' && c.g.kind === 'stacks' && c.g.stacks > 1) base.push('grp', 'same')
  if (k === 'circle') base.push(c.g.kind === 'circle' && c.g.facing === 'in' ? 'face' : 'opp')
  if (k === 'square') base.push('face', 'corner')
  if (c.nA > 1) base.push('eq')
  return base
}

export function genClue(c: GenCtx): Atom | null {
  const t = pickW(c.rng, weights(c))
  if (t === 'not') {
    const types = negatableTypes(c)
    for (let i = 0; i < 40; i++) {
      const a = genRandom(c, types)
      if (a && !truth(c, a)) return { t: 'not', c: a }
    }
    return null
  }
  if (t === 'cmp') {
    const types = weights(c).map(([x]) => x).filter((x) => ['off', 'adj', 'lt', 'end', 'pos', 'face', 'corner', 'par'].includes(x))
    const tt = c.rng.pick(types)
    for (let i = 0; i < 12; i++) {
      const a = genTrue(c, tt)
      if (a && 'x' in a && a.x[0] === 0) {
        const ai = c.rng.int(1, c.nA - 1)
        return { t: 'and', cs: [{ t: 'eq', x: a.x, y: itemAt(c, ai, c.hidden[0][a.x[1]]) }, a] }
      }
    }
    return null
  }
  if (t === 'or') {
    const tt = pickW(c.rng, weights(c).filter(([x]) => x !== 'or' && x !== 'not' && x !== 'eq' && x !== 'mid' && x !== 'cmp'))
    const a = genTrue(c, tt)
    if (!a) return null
    for (let i = 0; i < 40; i++) {
      const b = genRandom(c, ['off', 'adj', 'end', 'pos', 'lt', 'same', 'face', 'opp', 'grp', 'corner', 'btw'].filter((x) => weights(c).some(([y]) => y === x)) as T[])
      if (b && !truth(c, b)) return { t: 'or', cs: c.rng.chance(0.5) ? [a, b] : [b, a] }
    }
    return null
  }
  return genTrue(c, t)
}

export const key = (a: Atom): string => JSON.stringify(a)

export interface BuiltPuzzle {
  hidden: number[][]
  clues: Atom[]
  ctx: GenCtx
}

export function buildPuzzle(rng: Rng, g: Geometry, nA: number, difficulty: MockDifficulty, opts: { floors?: boolean; maxClues?: number } = {}): BuiltPuzzle {
  const n = g.n
  const maxClues = opts.maxClues ?? (nA === 1 ? 13 : nA === 2 ? 18 : 22)
  for (let attempt = 0; attempt < 400; attempt++) {
    const c = makeCtx(rng, g, nA, difficulty, !!opts.floors)
    const pool = new Map<string, Atom>()
    const baseKeys = new Set<string>()
    const target = nA === 1 ? 34 : 46
    let guard = 0
    while (pool.size < target && guard++ < 900) {
      const a = genClue(c)
      if (!a) continue
      // a compound clue (eq + relation) must not repeat the relation of another clue
      const bk = a.t === 'and' ? key(a.cs[1]) : key(a)
      if (baseKeys.has(bk) || pool.has(key(a))) continue
      baseKeys.add(bk)
      pool.set(key(a), a)
    }
    const arr = [...pool.values()]
    const start = Math.max(4, n - 3 + (nA - 1) * 3)
    const compiled = arr.map((at) => compileAtom(g, n, at))
    let cur = 0 // number of leading pool atoms in use
    let unique = false
    let unknowns = 0
    for (let i = 0; i < arr.length && unknowns <= 3; i++) {
      cur = i + 1
      if ((cur >= start && (cur - start) % 2 === 0) || i === arr.length - 1) {
        const st = uniqueStateCons(g, nA, compiled.slice(0, cur))
        if (st === 'unique') {
          unique = true
          break
        }
        if (st === 'unknown') unknowns++
      }
    }
    if (!unique) continue
    // minimise (an inconclusive search keeps the clue, which is always safe); remove in chunks first, then one by one
    const order = rng.shuffle(Array.from({ length: cur }, (_, i) => i))
    const keep = new Set(order)
    const stateWithout = (drop: number[]) => {
      const rest = [...keep].filter((i) => !drop.includes(i))
      return uniqueStateCons(g, nA, rest.map((i) => compiled[i]))
    }
    let chunking = true
    for (let p = 0; p < order.length; ) {
      const size = chunking ? Math.min(3, order.length - p) : 1
      const chunk = order.slice(p, p + size)
      p += size
      const st = stateWithout(chunk)
      if (st === 'unique') chunk.forEach((i) => keep.delete(i))
      else {
        if (st === 'unknown') unknowns++
        if (size > 1) {
          chunking = false
          for (const i of chunk) {
            const st1 = stateWithout([i])
            if (st1 === 'unique') keep.delete(i)
            else if (st1 === 'unknown') unknowns++
          }
        }
      }
    }
    if (unknowns > 3) continue
    const kept = [...keep].sort((x, y) => x - y)
    const curAtoms = kept.map((i) => arr[i])
    const symmetric = g.kind === 'circle' || g.kind === 'square'
    const minClues = nA === 1 ? (symmetric ? n - 2 : n - 1) : nA === 2 ? n : n + 4
    if (curAtoms.length > maxClues || curAtoms.length < minClues) continue
    // sanity: all clues true in hidden solution
    if (!curAtoms.every((a) => truth(c, a))) throw new Error('internal: false clue generated')
    return { hidden: c.hidden, clues: rng.shuffle(curAtoms), ctx: c }
  }
  throw new Error('buildPuzzle: could not build a unique puzzle')
}

