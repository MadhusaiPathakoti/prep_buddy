// Hidden arrangement -> random TRUE mains-style clues (indirect / conditional / negative / chained across attributes)
// -> exhaustive-solver-checked minimal unique clue set.
import type { Rng } from '../../rng'
import type { Constraint } from '../arrange'
import { NODES } from './arrSolver'
import { collectItems, compileAtom, evalAtom, grpOf, grpSize, idxOf, isRound, keyOf, mod, shiftPos, solveCons, uniqueStateCons, canonicalize, type Atom, type Geometry, type Item } from './arrEngine'
import type { Theme } from './arrText'

export interface GenCtx {
  rng: Rng
  g: Geometry
  n: number
  /** total attributes including persons (>=1). */
  nA: number
  hidden: number[][]
  inv: number[][]
  th: Theme
}

export function makeCtx(rng: Rng, g: Geometry, nA: number, th: Theme, hidden?: number[][]): GenCtx {
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
  return { rng, g, n, nA, hidden: h, inv, th }
}

export const Pof = (c: GenCtx) => (it: Item): number => c.hidden[it[0]][it[1]]
export const truth = (c: GenCtx, a: Atom): boolean => evalAtom(c.g, a, Pof(c))
export const itemAt = (c: GenCtx, a: number, p: number): Item => [a, c.inv[a][p]]

function pickAttr(c: GenCtx): number {
  if (c.nA === 1) return 0
  return c.rng.chance(0.3) ? 0 : c.rng.int(1, c.nA - 1)
}

type T =
  | 'off' | 'btw' | 'adj' | 'lt' | 'mid' | 'end' | 'pos' | 'eq' | 'grp' | 'same' | 'face' | 'opp' | 'corner' | 'par' | 'set' | 'fin' | 'sface' | 'samegap'
  | 'not' | 'nor' | 'xor' | 'imp' | 'cmp'

const SIMPLE_TRUE: T[] = ['off', 'btw', 'adj', 'lt', 'mid', 'end', 'eq', 'same', 'face', 'opp', 'corner', 'fin', 'sface', 'par', 'set']

/** Weights of the clue types for this geometry (mains: few direct clues, many indirect / negative / conditional ones). */
function weights(c: GenCtx): [T, number][] {
  const k = c.g.kind
  const w: [T, number][] = []
  const add = (t: T, v: number) => {
    if (v > 0) w.push([t, v])
  }
  if (k === 'row' || k === 'tworow' || k === 'stacks') {
    add('off', 22)
    add('adj', 6)
    add('btw', 12)
    add('end', 2)
    if (k !== 'tworow') {
      add('lt', 8)
      add('pos', 1)
      add('samegap', 2)
      add('mid', 8)
    } else add('mid', 5)
    if (k === 'tworow' || (c.g.kind === 'stacks' && c.g.stacks > 1)) {
      add('grp', 3)
      add('same', 8)
    }
    if (k === 'tworow') add('face', 14)
  } else if (k === 'circle') {
    add('off', 26)
    add('adj', 6)
    add('btw', 14)
    add(c.g.kind === 'circle' && c.g.facing === 'in' ? 'face' : 'opp', 12)
  } else if (c.g.kind === 'mixed' && c.g.square) {
    add('off', 22)
    add('adj', 10)
    add('face', 12)
    add('opp', 8)
    add('corner', 10)
  } else {
    add('off', 24)
    add('adj', 6)
    add('btw', 10)
    add('opp', 8)
    add('face', 8)
    add('fin', 8)
    add('sface', 5)
  }
  if (c.nA > 1) {
    add('eq', 22)
    add('cmp', 18)
  }
  add('not', 9)
  add('nor', 5)
  add('xor', 8)
  add('imp', 9)
  if (c.th.kind === 'floor') add('par', 4)
  if (c.th.sets.length) add('set', 5)
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

function itemFor(c: GenCtx, p: number): Item {
  return itemAt(c, pickAttr(c), p)
}

/** Random TRUE atom of the given simple type, or null. */
function genTrue(c: GenCtx, t: T): Atom | null {
  const { rng, g, n } = c
  const item = (p: number): Item => itemFor(c, p)
  switch (t) {
    case 'off': {
      const py = rng.int(0, n - 1)
      const maxd = g.kind === 'mixed' && g.square ? 1 : 3
      const d = rng.pick([1, -1, 2, -2, 3, -3].filter((v) => Math.abs(v) <= maxd))
      const px = shiftPos(g, py, d)
      if (px < 0) return null
      return { t: 'off', x: item(px), y: item(py), d }
    }
    case 'btw': {
      const px = rng.int(0, n - 1)
      const kmax = isRound(g) ? 3 : Math.min(4, grpSize(g) - 2)
      const k = rng.int(1, kmax)
      if (isRound(g)) {
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
      const py = isRound(g) ? mod(px + rng.pick([1, -1]), n) : shiftPos(g, px, rng.pick([1, -1]))
      if (py < 0) return null
      return { t: 'adj', x: item(px), y: item(py) }
    }
    case 'lt': {
      if (isRound(g)) return null
      const py = rng.int(0, n - 1)
      const gi = grpOf(g, py)
      const iy = idxOf(g, py)
      if (iy < 2) return null
      const ix = rng.int(0, iy - 2)
      return { t: 'lt', x: item(gi * grpSize(g) + ix), y: item(py) }
    }
    case 'mid': {
      if (isRound(g)) return null
      const sz = grpSize(g)
      const gi = rng.int(0, n / sz - 1)
      const span = rng.int(2, Math.min(sz - 1, 5))
      const a = rng.int(0, sz - 1 - span)
      const b = a + rng.int(1, span - 1)
      const cc = a + span
      const base = gi * sz
      const swap = rng.chance(0.5)
      return { t: 'mid', x: item(base + (swap ? cc : a)), y: item(base + b), z: item(base + (swap ? a : cc)) }
    }
    case 'end': {
      if (isRound(g)) return null
      const sz = grpSize(g)
      const gi = rng.int(0, n / sz - 1)
      const p = gi * sz + (rng.chance(0.5) ? 0 : sz - 1)
      return { t: 'end', x: item(p) }
    }
    case 'pos': {
      if (isRound(g)) return null
      const p = rng.int(0, n - 1)
      return { t: 'pos', x: item(p), p: idxOf(g, p) }
    }
    case 'eq': {
      const p = rng.int(0, n - 1)
      const a = rng.int(1, c.nA - 1)
      if (c.nA >= 3 && rng.chance(0.4)) {
        const b = rng.pick(Array.from({ length: c.nA - 1 }, (_, i) => i + 1).filter((v) => v !== a))
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
      } else if (g.kind === 'mixed') {
        if (g.pattern[px] !== 1) return null
        py = mod(px + n / 2, n)
        if (g.pattern[py] !== 1) return null
      } else py = mod(px + n / 2, n)
      return { t: 'face', x: item(px), y: item(py) }
    }
    case 'opp': {
      const px = rng.int(0, n - 1)
      if (g.kind === 'mixed' && g.square && px % 2 === 1) return null
      return { t: 'opp', x: item(px), y: item(mod(px + n / 2, n)) }
    }
    case 'corner': {
      const p = rng.int(0, n - 1)
      const a: Atom = { t: 'corner', x: item(p) }
      return truth(c, a) ? a : { t: 'not', c: a }
    }
    case 'fin': {
      const p = rng.int(0, n - 1)
      const a: Atom = { t: 'fin', x: item(p) }
      return truth(c, a) ? a : { t: 'not', c: a }
    }
    case 'sface': {
      const px = rng.int(0, n - 1)
      let py = rng.int(0, n - 1)
      if (py === px) py = mod(px + 1, n)
      const a: Atom = { t: 'sface', x: item(px), y: item(py) }
      return truth(c, a) ? a : { t: 'not', c: a }
    }
    case 'par': {
      const p = rng.int(0, n - 1)
      return { t: 'par', x: item(p), odd: (p + 1) % 2 === 1 }
    }
    case 'set': {
      if (!c.th.sets.length) return null
      const s = rng.pick(c.th.sets)
      const p = rng.int(0, n - 1)
      const a: Atom = { t: 'set', x: item(p), id: s.id, ps: s.ps }
      return truth(c, a) ? a : { t: 'not', c: a }
    }
    case 'samegap': {
      if (isRound(g) || g.kind === 'tworow') return null
      const sz = grpSize(g)
      const gi = rng.int(0, n / sz - 1)
      const base = gi * sz
      const dist = rng.int(2, Math.min(4, sz - 1))
      const a = rng.int(0, sz - 1 - dist)
      const pairs: number[][] = []
      for (let i = 0; i + dist < sz; i++) pairs.push([base + i, base + i + dist])
      const first = [base + a, base + a + dist]
      const others = pairs.filter((pr) => pr[0] !== first[0] && pr[0] !== first[1] && pr[1] !== first[0] && pr[1] !== first[1])
      if (!others.length) return null
      const sec = rng.pick(others)
      const flip = (pr: number[]) => (rng.chance(0.5) ? pr : [pr[1], pr[0]])
      const p1 = flip(first)
      const p2 = flip(sec)
      return { t: 'samegap', x: item(p1[0]), y: item(p1[1]), z: item(p2[0]), w: item(p2[1]) }
    }
    default:
      return null
  }
}

/** Random atom of a simple type with random (not solution-derived) parameters; may be true or false. */
function genRandom(c: GenCtx, types: T[]): Atom | null {
  const { rng, g, n } = c
  const t = rng.pick(types)
  const pa = rng.int(0, n - 1)
  let pb = rng.int(0, n - 1)
  while (pb === pa) pb = rng.int(0, n - 1)
  const item = (p: number): Item => itemFor(c, p)
  switch (t) {
    case 'off': {
      const maxd = g.kind === 'mixed' && g.square ? 1 : 3
      return { t: 'off', x: item(pa), y: item(pb), d: rng.pick([1, -1, 2, -2, 3, -3].filter((v) => Math.abs(v) <= maxd)) }
    }
    case 'adj':
      return { t: 'adj', x: item(pa), y: item(pb) }
    case 'lt':
      return { t: 'lt', x: item(pa), y: item(pb) }
    case 'btw': {
      const k = rng.int(1, isRound(g) ? 3 : 4)
      return isRound(g) ? { t: 'btw', x: item(pa), y: item(pb), k, side: rng.pick([1, -1] as const) } : { t: 'btw', x: item(pa), y: item(pb), k }
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
    case 'fin':
      return { t: 'fin', x: item(pa) }
    case 'sface':
      return { t: 'sface', x: item(pa), y: item(pb) }
    case 'eq': {
      const a = rng.int(1, c.nA - 1)
      return { t: 'eq', x: itemAt(c, 0, pa), y: itemAt(c, a, rng.int(0, n - 1)) }
    }
    case 'par':
      return { t: 'par', x: item(pa), odd: rng.chance(0.5) }
    case 'set': {
      if (!c.th.sets.length) return null
      const s = rng.pick(c.th.sets)
      return { t: 'set', x: item(pa), id: s.id, ps: s.ps }
    }
    default:
      return null
  }
}

/** Simple types whose negation / random instance is a sensible clue for this geometry. */
function simpleTypes(c: GenCtx): T[] {
  const k = c.g.kind
  const base: T[] = k === 'circle' || k === 'mixed' ? ['adj', 'off'] : ['adj', 'off', 'end']
  if (k === 'tworow') base.push('same', 'face', 'btw')
  if (k === 'row' || k === 'stacks') base.push('lt', 'btw')
  if (k === 'stacks' && c.g.kind === 'stacks' && c.g.stacks > 1) base.push('same')
  if (k === 'circle') base.push(c.g.kind === 'circle' && c.g.facing === 'in' ? 'face' : 'opp', 'btw')
  if (k === 'mixed') base.push('opp', 'face', 'sface', 'btw')
  if (c.g.kind === 'mixed' && c.g.square) return ['adj', 'off', 'face', 'opp', 'corner']
  if (c.nA > 1) base.push('eq')
  if (c.th.kind === 'floor') base.push('par')
  if (c.th.sets.length) base.push('set')
  return base
}

function withSubject(a: Atom, x: Item): Atom | null {
  switch (a.t) {
    case 'off':
    case 'adj':
    case 'lt':
    case 'face':
    case 'opp':
    case 'same':
    case 'sface':
    case 'eq':
      return { ...a, x }
    case 'end':
    case 'corner':
    case 'fin':
    case 'set':
    case 'par':
    case 'grp':
    case 'pos':
      return { ...a, x }
    default:
      return null
  }
}

/** All items of a simple atom other than its subject x (used to keep nor-clues about different people). */
const posOfItem = (c: GenCtx, it: Item): number => c.hidden[it[0]][it[1]]

function simpleTrue(c: GenCtx, tries = 30): Atom | null {
  const w = weights(c).filter(([t]) => SIMPLE_TRUE.includes(t) || t === 'btw')
  for (let i = 0; i < tries; i++) {
    const a = genTrue(c, pickW(c.rng, w))
    if (a) return a
  }
  return null
}

/** Simple true / false atom that shares an item with `other` (keeps conditional clues at <= 3 distinct items). */
function sharing(c: GenCtx, other: Atom, wantTrue: boolean): Atom | null {
  const base: Item[] = []
  collectItems(other, base)
  for (let i = 0; i < 25; i++) {
    const a = wantTrue ? simpleTrue(c, 4) : simpleFalse(c, 6)
    if (!a) continue
    const its: Item[] = []
    collectItems(a, its)
    if (its.some((x) => base.some((y) => x[0] === y[0] && x[1] === y[1]))) return a
  }
  return null
}

function simpleFalse(c: GenCtx, tries = 40): Atom | null {
  const types = simpleTypes(c)
  for (let i = 0; i < tries; i++) {
    const a = genRandom(c, types)
    if (a && !truth(c, a)) return a
  }
  return null
}

const hasEqTop = (a: Atom): boolean => a.t === 'eq'

export function genClue(c: GenCtx): Atom | null {
  const { rng } = c
  const t = pickW(rng, weights(c))
  switch (t) {
    case 'not': {
      const a = simpleFalse(c)
      return a ? { t: 'not', c: a } : null
    }
    case 'cmp': {
      const types = weights(c).map(([x]) => x).filter((x) => ['off', 'adj', 'lt', 'end', 'face', 'opp', 'btw', 'mid', 'same'].includes(x))
      const tt = rng.pick(types)
      for (let i = 0; i < 12; i++) {
        const a = genTrue(c, tt)
        if (a && 'x' in a && a.x[0] === 0 && a.t !== 'btw' && a.t !== 'mid' && a.t !== 'samegap') {
          const ai = rng.int(1, c.nA - 1)
          return { t: 'and', cs: [{ t: 'eq', x: a.x, y: itemAt(c, ai, c.hidden[0][a.x[1]]) }, a] }
        }
      }
      return null
    }
    case 'nor': {
      const types = simpleTypes(c).filter((x) => x !== 'btw' && x !== 'par' && x !== 'set' && x !== 'eq')
      for (let i = 0; i < 40; i++) {
        const a = genRandom(c, types)
        if (!a || truth(c, a)) continue
        const need = rng.chance(0.1) ? 3 : 2
        const used = new Set<number>()
        const ax = 'x' in a ? a.x : null
        if (!ax) continue
        used.add(posOfItem(c, ax))
        const cs: Atom[] = [a]
        const yp = 'y' in a ? posOfItem(c, (a as { y: Item }).y) : -1
        for (let j = 0; j < 30 && cs.length < need; j++) {
          const p = rng.int(0, c.n - 1)
          if (used.has(p) || p === yp) continue
          const b = withSubject(a, itemFor(c, p))
          if (b && !truth(c, b)) {
            used.add(p)
            cs.push(b)
          }
        }
        if (cs.length >= 2) return { t: 'nor', cs }
      }
      return null
    }
    case 'xor': {
      const a = simpleTrue(c)
      const b = a ? sharing(c, a, false) : null
      if (!a || !b || keyOf(a) === keyOf(b)) return null
      const sw = rng.chance(0.5)
      return { t: 'xor', a: sw ? b : a, b: sw ? a : b }
    }
    case 'imp': {
      const a = rng.chance(0.2) ? simpleFalse(c) : simpleTrue(c)
      const b = a ? sharing(c, a, true) : null
      if (!a || !b || keyOf(a) === keyOf(b)) return null
      // the antecedent must be a TRUE statement in the hidden arrangement
      const ant = truth(c, a) ? a : ({ t: 'not', c: a } as Atom)
      if (hasEqTop(ant) && hasEqTop(b)) return null
      return { t: 'imp', a: ant, b }
    }
    default:
      return genTrue(c, t)
  }
}

export const clueKey = keyOf

/** A clue that states or almost states a position outright. */
export function isDirect(a: Atom): boolean {
  return a.t === 'pos' || a.t === 'end' || a.t === 'grp' || a.t === 'corner' || a.t === 'fin'
}
/** Indirect / conditional / negative clue families that make a puzzle mains-level. */
export function isHardClue(a: Atom): boolean {
  return a.t === 'not' || a.t === 'nor' || a.t === 'xor' || a.t === 'imp' || a.t === 'samegap' || a.t === 'set' || a.t === 'or'
}

export interface BuiltPuzzle {
  hidden: number[][]
  clues: Atom[]
  ctx: GenCtx
  /** true when root-level propagation alone cannot finish the puzzle (a case split / trial is needed). */
  needsSplit: boolean
}

export interface BuildOpts {
  minHard: number
  maxClues: number
  minClues: number
  splitProb: number
}

const NODE_BUDGET = 5000
export function buildPuzzle(rng: Rng, g: Geometry, nA: number, th: Theme, opts: BuildOpts): BuiltPuzzle {
  const n = g.n
  const BATCH = 6
  const cap = opts.maxClues + 40
  for (let attempt = 0; attempt < 80; attempt++) {
    const c = makeCtx(rng, g, nA, th)
    const startNodes = NODES.n
    const over = (): boolean => NODES.n - startNodes > NODE_BUDGET
    const arr: Atom[] = []
    const compiled: Constraint[] = []
    const seen = new Set<string>()
    const baseKeys = new Set<string>()
    const grow = (k: number): void => {
      let guard = 0
      let added = 0
      while (added < k && guard++ < 600) {
        const a = genClue(c)
        if (!a) continue
        const bk = a.t === 'and' ? keyOf(a.cs[1]) : keyOf(a)
        if (baseKeys.has(bk) || seen.has(keyOf(a))) continue
        baseKeys.add(bk)
        seen.add(keyOf(a))
        arr.push(a)
        compiled.push(compileAtom(g, n, a))
        added++
      }
    }
    // grow the pool until the clues pin the arrangement down uniquely, then find the smallest unique prefix
    grow(Math.max(8, n + (nA - 1) * 3))
    let found = false
    while (arr.length <= cap && !over()) {
      if (uniqueStateCons(g, nA, compiled, 2500) === 'unique') {
        found = true
        break
      }
      grow(BATCH)
    }
    if (!found || over()) continue
    let lo = Math.max(1, arr.length - BATCH)
    let hi = arr.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (uniqueStateCons(g, nA, compiled.slice(0, mid), 2500) === 'unique') hi = mid
      else lo = mid + 1
    }
    const cur = hi
    // minimise: drop simple clues first (chunks of three, then singly) so the survivors are rich in hard clues
    const idxs = Array.from({ length: cur }, (_, i) => i)
    const hard = rng.shuffle(idxs.filter((i) => isHardClue(arr[i])))
    const soft = rng.shuffle(idxs.filter((i) => !isHardClue(arr[i])))
    const order = [...soft, ...hard]
    const keep = new Set(order)
    let unknowns = 0
    const stateWithout = (drop: number[]) => uniqueStateCons(g, nA, [...keep].filter((i) => !drop.includes(i)).map((i) => compiled[i]), 2500)
    const tryDrop = (chunk: number[]): void => {
      const st = stateWithout(chunk)
      if (st === 'unique') chunk.forEach((i) => keep.delete(i))
      else {
        if (st === 'unknown') unknowns++
        if (chunk.length > 1) for (const i of chunk) tryDrop([i])
      }
    }
    for (let p = 0; p < order.length && !over(); p += 3) tryDrop(order.slice(p, p + 3))
    if (over()) continue
    if (unknowns > 3) continue
    const kept = [...keep].sort((x, y) => x - y)
    const curAtoms = kept.map((i) => arr[i])
    if (curAtoms.length > opts.maxClues) continue
    if (curAtoms.length < opts.minClues) continue
    if (curAtoms.filter(isHardClue).length < opts.minHard) continue
    if (curAtoms.filter((a) => a.t === 'pos').length > 1) continue
    if (curAtoms.filter(isDirect).length > 3) continue
    if (!curAtoms.every((a) => truth(c, a))) throw new Error('internal: false clue generated')
    // root propagation test: does the puzzle need a case split?
    const keptCons = kept.map((i) => compiled[i])
    const root = solveCons(g, nA, keptCons, 2, 1)
    const needsSplit = !(root.complete && root.sols.length === 1)
    if (rng.chance(opts.splitProb) && !needsSplit) continue
    // final independent confirmation: exactly one solution and it is the hidden arrangement
    const fin = solveCons(g, nA, keptCons, 2, 200000)
    if (!fin.complete || fin.sols.length !== 1) continue
    const sol = fin.sols[0]
    for (let a = 0; a < nA; a++) for (let v = 0; v < n; v++) if (sol[a * n + v] !== c.hidden[a][v]) throw new Error('internal: unique solution differs from hidden arrangement')
    return { hidden: c.hidden, clues: rng.shuffle(curAtoms), ctx: c, needsSplit }
  }
  throw new Error('buildPuzzle: could not build a unique mains puzzle')
}
