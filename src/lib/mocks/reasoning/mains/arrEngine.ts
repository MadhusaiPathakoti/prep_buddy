// Mains-level arrangement engine: geometry-aware atoms (clues / claims), exact evaluator, constraint compiler.
// Extends the prelims engine (../arrange.ts, whose generic CSP solver `solveCSP` is reused as is) with
//  - round tables where people face the centre AND outside (geometry 'mixed': pattern[seat] = 1 faces the centre),
//  - conditional / exclusive-or / neither-nor / equal-gap / property-set clues,
// so every clue type can still be proved unique by exhaustive search.
//
// Position conventions (shared by all geometries so "right" is +1 in index space for a person facing "forward"):
//  row     : index 0..n-1, persons face north, index increases to the persons' RIGHT. Floors/months/days reuse it
//            (index 0 = lowest floor / earliest month).
//  tworow  : two rows of m = n/2 persons facing each other. Indices 0..m-1 = row 1 (face south), m..n-1 = row 2 (face north).
//            Inside each row the index increases to the persons' own right. Row-1 index i faces row-2 index m-1-i.
//  circle  : every person faces the same way (in or out); index increases to the persons' right.
//  mixed   : index increases ANTICLOCKWISE. A person facing the centre has his right at index+1, a person facing outside at index-1.
//  stacks  : s stacks of h boxes; position = stack*h + level (level 0 = bottom).
import type { Constraint, SolveResult } from '../arrange'
import { solveStrong } from './arrSolver'

export type Item = readonly [number, number]

export type Geometry =
  | { kind: 'row'; n: number }
  | { kind: 'tworow'; n: number }
  | { kind: 'circle'; n: number; facing: 'in' | 'out' }
  | { kind: 'mixed'; n: number; pattern: number[]; square?: boolean }
  | { kind: 'stacks'; n: number; stacks: number }

export type Atom =
  | { t: 'pos'; x: Item; p: number }
  | { t: 'end'; x: Item }
  | { t: 'off'; x: Item; y: Item; d: number }
  | { t: 'lt'; x: Item; y: Item }
  | { t: 'btw'; x: Item; y: Item; k: number; side?: 1 | -1 }
  | { t: 'mid'; x: Item; y: Item; z: Item }
  | { t: 'adj'; x: Item; y: Item }
  | { t: 'face'; x: Item; y: Item }
  | { t: 'opp'; x: Item; y: Item }
  | { t: 'eq'; x: Item; y: Item }
  | { t: 'grp'; x: Item; g: number }
  | { t: 'same'; x: Item; y: Item }
  | { t: 'corner'; x: Item }
  | { t: 'par'; x: Item; odd: boolean }
  | { t: 'set'; x: Item; id: string; ps: number[] }
  | { t: 'fin'; x: Item }
  | { t: 'sface'; x: Item; y: Item }
  | { t: 'samegap'; x: Item; y: Item; z: Item; w: Item }
  | { t: 'imp'; a: Atom; b: Atom }
  | { t: 'xor'; a: Atom; b: Atom }
  | { t: 'nor'; cs: Atom[] }
  | { t: 'not'; c: Atom }
  | { t: 'and'; cs: Atom[] }
  | { t: 'or'; cs: Atom[] }

export const mod = (a: number, n: number): number => ((a % n) + n) % n

export function grpSize(g: Geometry): number {
  switch (g.kind) {
    case 'tworow':
      return g.n / 2
    case 'stacks':
      return g.n / g.stacks
    default:
      return g.n
  }
}
export function grpOf(g: Geometry, p: number): number {
  switch (g.kind) {
    case 'tworow':
      return p < g.n / 2 ? 0 : 1
    case 'stacks':
      return Math.floor(p / (g.n / g.stacks))
    default:
      return 0
  }
}
export function idxOf(g: Geometry, p: number): number {
  switch (g.kind) {
    case 'tworow':
      return p % (g.n / 2)
    case 'stacks':
      return p % (g.n / g.stacks)
    default:
      return p
  }
}

export const isRound = (g: Geometry): boolean => g.kind === 'circle' || g.kind === 'mixed'
/** +1 when the person at seat p has his right at index+1, otherwise -1 (mixed tables only). */
export const dirAt = (g: Geometry, p: number): number => (g.kind === 'mixed' ? (g.pattern[p] === 1 ? 1 : -1) : 1)

/** Position reached from position `p` by moving `d` places to the right of the person at p (d<0 left; stacks: d>0 up), or -1. */
export function shiftPos(g: Geometry, p: number, d: number): number {
  switch (g.kind) {
    case 'circle':
      return mod(p + d, g.n)
    case 'mixed': {
      if (g.square && Math.abs(d) !== 1) return -1
      return mod(p + d * dirAt(g, p), g.n)
    }
    default: {
      const sz = grpSize(g)
      const i = idxOf(g, p) + d
      if (i < 0 || i >= sz) return -1
      return grpOf(g, p) * sz + i
    }
  }
}

function gapPos(g: Geometry, pu: number, pv: number): number {
  return grpOf(g, pu) === grpOf(g, pv) ? Math.abs(idxOf(g, pu) - idxOf(g, pv)) : -1
}

export function evalAtom(g: Geometry, a: Atom, P: (i: Item) => number): boolean {
  switch (a.t) {
    case 'not':
      return !evalAtom(g, a.c, P)
    case 'and':
      return a.cs.every((c) => evalAtom(g, c, P))
    case 'or':
      return a.cs.some((c) => evalAtom(g, c, P))
    case 'imp':
      return !evalAtom(g, a.a, P) || evalAtom(g, a.b, P)
    case 'xor':
      return evalAtom(g, a.a, P) !== evalAtom(g, a.b, P)
    case 'nor':
      return a.cs.every((c) => !evalAtom(g, c, P))
    case 'eq':
      return P(a.x) === P(a.y)
    case 'par':
      return ((P(a.x) + 1) % 2 === 1) === a.odd
    case 'set':
      return a.ps.includes(idxOf(g, P(a.x)))
    case 'grp':
      return grpOf(g, P(a.x)) === a.g
    case 'same':
      return grpOf(g, P(a.x)) === grpOf(g, P(a.y))
    case 'corner':
      return g.kind === 'mixed' ? g.pattern[P(a.x)] === 0 : P(a.x) % 2 === 0
    case 'fin':
      return g.kind === 'mixed' ? g.pattern[P(a.x)] === 1 : g.kind === 'circle' ? g.facing === 'in' : false
    case 'sface':
      return g.kind === 'mixed' ? g.pattern[P(a.x)] === g.pattern[P(a.y)] : true
    case 'pos':
      return idxOf(g, P(a.x)) === a.p
    case 'end': {
      const i = idxOf(g, P(a.x))
      return i === 0 || i === grpSize(g) - 1
    }
    case 'opp':
      return mod(P(a.y) - P(a.x), g.n) === g.n / 2
    case 'face': {
      const px = P(a.x)
      const py = P(a.y)
      if (g.kind === 'tworow') return grpOf(g, px) !== grpOf(g, py) && idxOf(g, px) + idxOf(g, py) === g.n / 2 - 1
      if (g.kind === 'circle') return mod(py - px, g.n) === g.n / 2
      if (g.kind === 'mixed') return g.pattern[px] === 1 && g.pattern[py] === 1 && mod(py - px, g.n) === g.n / 2
      return false
    }
    case 'off': {
      const px = P(a.x)
      const py = P(a.y)
      if (g.kind === 'circle') return mod(px - py - a.d, g.n) === 0
      if (g.kind === 'mixed') {
        if (g.square && Math.abs(a.d) !== 1) return false
        return mod(px - py - a.d * dirAt(g, py), g.n) === 0
      }
      return grpOf(g, px) === grpOf(g, py) && idxOf(g, px) - idxOf(g, py) === a.d
    }
    case 'lt': {
      const px = P(a.x)
      const py = P(a.y)
      return grpOf(g, px) === grpOf(g, py) && idxOf(g, px) < idxOf(g, py)
    }
    case 'btw': {
      const px = P(a.x)
      const py = P(a.y)
      if (isRound(g)) return mod(py - px - (a.side ?? 1) * (a.k + 1), g.n) === 0
      return grpOf(g, px) === grpOf(g, py) && Math.abs(idxOf(g, px) - idxOf(g, py)) === a.k + 1
    }
    case 'samegap': {
      const g1 = gapPos(g, P(a.x), P(a.y))
      return g1 >= 0 && g1 === gapPos(g, P(a.z), P(a.w))
    }
    case 'adj': {
      const px = P(a.x)
      const py = P(a.y)
      if (isRound(g)) {
        const d = mod(px - py, g.n)
        return d === 1 || d === g.n - 1
      }
      return grpOf(g, px) === grpOf(g, py) && Math.abs(idxOf(g, px) - idxOf(g, py)) === 1
    }
    case 'mid': {
      const px = P(a.x)
      const py = P(a.y)
      const pz = P(a.z)
      if (grpOf(g, px) !== grpOf(g, py) || grpOf(g, py) !== grpOf(g, pz)) return false
      const ix = idxOf(g, px)
      const iy = idxOf(g, py)
      const iz = idxOf(g, pz)
      return (ix < iy && iy < iz) || (iz < iy && iy < ix)
    }
  }
}

export function collectItems(a: Atom, out: Item[]): void {
  const add = (it: Item) => {
    if (!out.some((o) => o[0] === it[0] && o[1] === it[1])) out.push(it)
  }
  switch (a.t) {
    case 'not':
      collectItems(a.c, out)
      break
    case 'and':
    case 'or':
    case 'nor':
      a.cs.forEach((c) => collectItems(c, out))
      break
    case 'imp':
    case 'xor':
      collectItems(a.a, out)
      collectItems(a.b, out)
      break
    case 'mid':
      add(a.x)
      add(a.y)
      add(a.z)
      break
    case 'samegap':
      add(a.x)
      add(a.y)
      add(a.z)
      add(a.w)
      break
    case 'pos':
    case 'end':
    case 'grp':
    case 'corner':
    case 'par':
    case 'set':
    case 'fin':
      add(a.x)
      break
    default:
      add(a.x)
      add(a.y)
  }
}

export function compileAtom(g: Geometry, n: number, atom: Atom): Constraint {
  const items: Item[] = []
  collectItems(atom, items)
  const slot = new Int8Array(16 * 16).fill(-1)
  items.forEach((it, i) => {
    slot[it[0] * 16 + it[1]] = i
  })
  let cur: ArrayLike<number> = []
  const P = (it: Item) => cur[slot[it[0] * 16 + it[1]]]
  return {
    vars: items.map((it) => it[0] * n + it[1]),
    test: (vals) => {
      cur = vals
      return evalAtom(g, atom, P)
    },
  }
}

/** Smallest rotation (in seats) that maps a mixed table's facing pattern onto itself. */
export function patternPeriod(pattern: number[]): number {
  const n = pattern.length
  for (let r = 1; r < n; r++) {
    if (n % r === 0 && pattern.every((v, s) => v === pattern[(s + r) % n])) return r
  }
  return n
}

/** Rotation anchor for symmetric geometries (person 0 may be fixed anywhere in one pattern period). */
export function anchorFor(g: Geometry): { v: number; mask: number } | undefined {
  if (g.kind === 'circle') return { v: 0, mask: 1 }
  if (g.kind === 'mixed') return { v: 0, mask: (1 << patternPeriod(g.pattern)) - 1 }
  return undefined
}

export function canonicalize(g: Geometry, hidden: number[][]): number[][] {
  if (g.kind !== 'circle' && g.kind !== 'mixed') return hidden
  const p0 = hidden[0][0]
  const shift = g.kind === 'circle' ? p0 : p0 - (p0 % patternPeriod(g.pattern))
  return hidden.map((row) => row.map((p) => mod(p - shift, g.n)))
}

export function solveCons(g: Geometry, nAttrs: number, cons: Constraint[], limit: number, maxNodes = Infinity): SolveResult {
  return solveStrong(nAttrs, g.n, cons, limit, anchorFor(g), maxNodes)
}

export type UState = 'unique' | 'multiple' | 'none' | 'unknown'

/** 'unique' only when the search COMPLETED and found exactly one solution; 'unknown' when the node budget ran out. */
export function uniqueStateCons(g: Geometry, nAttrs: number, cons: Constraint[], maxNodes = 8000): UState {
  const r = solveCons(g, nAttrs, cons, 2, maxNodes)
  if (!r.complete && r.sols.length < 2) return 'unknown'
  return r.sols.length === 1 ? 'unique' : r.sols.length === 0 ? 'none' : 'multiple'
}

export const keyOf = (a: Atom): string => JSON.stringify(a)
