// Arrangement engine: geometry-aware atoms (clues / claims), exact evaluator and an exhaustive CSP solver.
// Positions of every item are one-to-one per attribute (attribute 0 = the persons / boxes themselves).
//
// Position conventions (shared by all geometries so "right" is always +1 in index space):
//  row     : index 0..n-1, persons face north, index increases to the persons' RIGHT. Floors/months/days reuse it
//            (index 0 = lowest floor / earliest month).
//  tworow  : two rows of m = n/2 persons facing each other. Indices 0..m-1 = row 1 (face south), m..n-1 = row 2 (face north).
//            Inside each row the index increases to the persons' own right. Row-1 index i faces row-2 index m-1-i.
//  circle  : index increases to the persons' right (anticlockwise when everybody faces inwards, clockwise when outwards).
//  square  : 8 persons, even index = corner (faces outside), odd index = middle of a side (faces the centre).
//            Index increases anticlockwise; the right of a middle person is index+1, the right of a corner person index-1.
//  stacks  : s stacks of h boxes; position = stack*h + level (level 0 = bottom).

export type Item = readonly [number, number]

export type Geometry =
  | { kind: 'row'; n: number }
  | { kind: 'tworow'; n: number }
  | { kind: 'circle'; n: number; facing: 'in' | 'out' }
  | { kind: 'square'; n: number }
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

/** Position reached from position `p` by moving `d` places to the right (d<0: left / d>0 up) or -1 if it does not exist. */
export function shiftPos(g: Geometry, p: number, d: number): number {
  switch (g.kind) {
    case 'circle':
      return mod(p + d, g.n)
    case 'square': {
      if (Math.abs(d) !== 1) return -1
      const s = p % 2 === 1 ? 1 : -1
      return mod(p + d * s, g.n)
    }
    default: {
      const sz = grpSize(g)
      const i = idxOf(g, p) + d
      if (i < 0 || i >= sz) return -1
      return grpOf(g, p) * sz + i
    }
  }
}

export function evalAtom(g: Geometry, a: Atom, P: (i: Item) => number): boolean {
  switch (a.t) {
    case 'not':
      return !evalAtom(g, a.c, P)
    case 'and':
      return a.cs.every((c) => evalAtom(g, c, P))
    case 'or':
      return a.cs.some((c) => evalAtom(g, c, P))
    case 'eq':
      return P(a.x) === P(a.y)
    case 'par':
      return (((P(a.x) + 1) % 2) === 1) === a.odd
    case 'grp':
      return grpOf(g, P(a.x)) === a.g
    case 'same':
      return grpOf(g, P(a.x)) === grpOf(g, P(a.y))
    case 'corner':
      return P(a.x) % 2 === 0
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
      if (g.kind === 'square') return px % 2 === 1 && py % 2 === 1 && mod(py - px, g.n) === g.n / 2
      return false
    }
    case 'off': {
      const px = P(a.x)
      const py = P(a.y)
      if (g.kind === 'circle') return mod(px - py - a.d, g.n) === 0
      if (g.kind === 'square') {
        if (Math.abs(a.d) !== 1) return false
        const s = py % 2 === 1 ? 1 : -1
        return mod(px - py - a.d * s, g.n) === 0
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
      if (g.kind === 'circle') return mod(py - px - (a.side ?? 1) * (a.k + 1), g.n) === 0
      return grpOf(g, px) === grpOf(g, py) && Math.abs(idxOf(g, px) - idxOf(g, py)) === a.k + 1
    }
    case 'adj': {
      const px = P(a.x)
      const py = P(a.y)
      if (g.kind === 'circle' || g.kind === 'square') {
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
      a.cs.forEach((c) => collectItems(c, out))
      break
    case 'mid':
      add(a.x)
      add(a.y)
      add(a.z)
      break
    case 'pos':
    case 'end':
    case 'grp':
    case 'corner':
    case 'par':
      add(a.x)
      break
    default:
      add(a.x)
      add(a.y)
  }
}

// ---------------------------------------------------------------------------------------------
// CSP solver
// ---------------------------------------------------------------------------------------------

export interface Constraint {
  vars: number[]
  test: (vals: ArrayLike<number>) => boolean
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

const POP = new Uint8Array(1 << 11)
for (let i = 1; i < POP.length; i++) POP[i] = POP[i >> 1] + (i & 1)

/** Enumerates up to `limit` full assignments (var id = attr*n + value -> position). */
export interface SolveResult {
  sols: number[][]
  /** false when the node budget was exhausted before the search finished (result then inconclusive). */
  complete: boolean
}

export function solveCSP(nAttrs: number, n: number, cons: Constraint[], limit: number, anchor?: { v: number; mask: number }, maxNodes = Infinity): SolveResult {
  const nv = nAttrs * n
  const consOf: number[][] = Array.from({ length: nv }, () => [])
  cons.forEach((c, i) => c.vars.forEach((v) => consOf[v].push(i)))
  const sols: number[][] = []
  let nodes = 0
  let aborted = false
  const scratch = new Array<number>(8).fill(0)
  const full = (1 << n) - 1

  const fillVals = (c: Constraint, val: Int8Array, freeVar: number, freeVal: number): number[] => {
    for (let i = 0; i < c.vars.length; i++) {
      const w = c.vars[i]
      scratch[i] = w === freeVar ? freeVal : val[w]
    }
    return scratch
  }

  const propagate = (dom: Int32Array, val: Int8Array, queue: number[]): boolean => {
    const assign = (u: number): void => {
      val[u] = 31 - Math.clz32(dom[u])
      queue.push(u)
    }
    while (queue.length) {
      const v = queue.pop() as number
      const bit = 1 << val[v]
      const a = (v / n) | 0
      for (let u = a * n; u < a * n + n; u++) {
        if (u === v) continue
        if (val[u] >= 0) {
          if (val[u] === val[v]) return false
          continue
        }
        if (dom[u] & bit) {
          dom[u] &= ~bit
          if (dom[u] === 0) return false
          if (POP[dom[u]] === 1) assign(u)
        }
      }
      for (const ci of consOf[v]) {
        const c = cons[ci]
        let cnt = 0
        let free1 = -1
        let free2 = -1
        for (const w of c.vars) {
          if (val[w] < 0) {
            cnt++
            if (cnt === 1) free1 = w
            else if (cnt === 2) free2 = w
            else break
          }
        }
        if (cnt === 0) {
          const vals = fillVals(c, val, -1, 0)
          if (!c.test(vals)) return false
        } else if (cnt === 1) {
          let m = dom[free1]
          let nd = m
          while (m) {
            const low = m & -m
            m ^= low
            const vals = fillVals(c, val, free1, 31 - Math.clz32(low))
            if (!c.test(vals)) nd &= ~low
          }
          if (nd !== dom[free1]) {
            if (nd === 0) return false
            dom[free1] = nd
            if (POP[nd] === 1) assign(free1)
          }
        } else if (cnt === 2) {
          // generalised arc revise on both free variables (other variables are assigned)
          const i1 = c.vars.indexOf(free1)
          const i2 = c.vars.indexOf(free2)
          const base = fillVals(c, val, -1, 0)
          const buf = base.slice(0, c.vars.length)
          const sameAttr = ((free1 / n) | 0) === ((free2 / n) | 0)
          const revise = (fv: number, ov: number, fi: number, oi: number): boolean => {
            let m = dom[fv]
            let nd = m
            while (m) {
              const low = m & -m
              m ^= low
              buf[fi] = 31 - Math.clz32(low)
              let ok = false
              let om = dom[ov]
              if (sameAttr) om &= ~low
              while (om) {
                const ol = om & -om
                om ^= ol
                buf[oi] = 31 - Math.clz32(ol)
                if (c.test(buf)) {
                  ok = true
                  break
                }
              }
              if (!ok) nd &= ~low
            }
            if (nd !== dom[fv]) {
              if (nd === 0) return false
              dom[fv] = nd
              if (POP[nd] === 1) assign(fv)
            }
            return true
          }
          if (!revise(free1, free2, i1, i2)) return false
          if (val[free2] < 0 && !revise(free2, free1, i2, i1)) return false
        }
      }
    }
    return true
  }

  const dfs = (dom: Int32Array, val: Int8Array): void => {
    if (sols.length >= limit || aborted) return
    if (++nodes > maxNodes) {
      aborted = true
      return
    }
    let best = -1
    let bs = 99
    for (let v = 0; v < nv; v++) {
      if (val[v] < 0) {
        const s = POP[dom[v]]
        if (s < bs) {
          bs = s
          best = v
          if (s === 2) break
        }
      }
    }
    if (best < 0) {
      sols.push(Array.from(val))
      return
    }
    let m = dom[best]
    while (m) {
      const low = m & -m
      m ^= low
      const d2 = dom.slice()
      const v2 = val.slice()
      d2[best] = low
      v2[best] = 31 - Math.clz32(low)
      if (propagate(d2, v2, [best])) dfs(d2, v2)
      if (sols.length >= limit || aborted) return
    }
  }

  const dom0 = new Int32Array(nv).fill(full)
  const val0 = new Int8Array(nv).fill(-1)
  if (anchor) dom0[anchor.v] &= anchor.mask
  // single-variable constraints
  for (const c of cons) {
    if (c.vars.length === 1) {
      const v = c.vars[0]
      let m = dom0[v]
      let nd = m
      while (m) {
        const low = m & -m
        m ^= low
        if (!c.test([31 - Math.clz32(low)])) nd &= ~low
      }
      dom0[v] = nd
    }
  }
  if (dom0.some((d) => d === 0)) return { sols, complete: true }
  const q: number[] = []
  for (let v = 0; v < nv; v++) {
    if (POP[dom0[v]] === 1) {
      val0[v] = 31 - Math.clz32(dom0[v])
      q.push(v)
    }
  }
  if (!propagate(dom0, val0, q)) return { sols, complete: true }
  dfs(dom0, val0)
  return { sols, complete: !aborted }
}

/** Rotation anchor for symmetric geometries (circle: person 0 at 0; square: person 0 at 0 or 1). */
export function anchorFor(g: Geometry): { v: number; mask: number } | undefined {
  if (g.kind === 'circle') return { v: 0, mask: 1 }
  if (g.kind === 'square') return { v: 0, mask: 3 }
  return undefined
}

export function canonicalize(g: Geometry, hidden: number[][]): number[][] {
  if (g.kind !== 'circle' && g.kind !== 'square') return hidden
  const p0 = hidden[0][0]
  const shift = g.kind === 'circle' ? p0 : p0 - (p0 % 2)
  return hidden.map((row) => row.map((p) => mod(p - shift, g.n)))
}

export function solveAtoms(g: Geometry, nAttrs: number, atoms: Atom[], limit: number, maxNodes = Infinity): SolveResult {
  const cons = atoms.map((a) => compileAtom(g, g.n, a))
  return solveCSP(nAttrs, g.n, cons, limit, anchorFor(g), maxNodes)
}

/** 'unique' only when the search COMPLETED and found exactly one solution; 'unknown' when the node budget ran out. */
export function uniqueState(g: Geometry, nAttrs: number, atoms: Atom[], maxNodes = 8000): 'unique' | 'multiple' | 'none' | 'unknown' {
  const r = solveAtoms(g, nAttrs, atoms, 2, maxNodes)
  if (!r.complete && r.sols.length < 2) return 'unknown'
  return r.sols.length === 1 ? 'unique' : r.sols.length === 0 ? 'none' : 'multiple'
}

/** Same as uniqueState but with already-compiled constraints (compile once, test many subsets). */
export function uniqueStateCons(g: Geometry, nAttrs: number, cons: Constraint[], maxNodes = 8000): 'unique' | 'multiple' | 'none' | 'unknown' {
  const r = solveCSP(nAttrs, g.n, cons, 2, anchorFor(g), maxNodes)
  if (!r.complete && r.sols.length < 2) return 'unknown'
  return r.sols.length === 1 ? 'unique' : r.sols.length === 0 ? 'none' : 'multiple'
}
