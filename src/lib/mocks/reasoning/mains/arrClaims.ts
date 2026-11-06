// Machine-checkable "claims": what an answer option asserts about the solved arrangement.
import { evalAtom, grpOf, idxOf, isRound, mod, type Atom, type Geometry, type Item } from './arrEngine'

export type Claim =
  | { k: 'atom'; a: Atom }
  /** exactly v persons between x and y (same row/stack; on round tables counted from x in direction `side`). */
  | { k: 'gap'; x: Item; y: Item; side?: 1 | -1; v: number }
  /** exactly v persons on the lower-index ('lo') / higher-index ('hi') side of x inside its row. */
  | { k: 'cnt'; x: Item; dir: 'lo' | 'hi'; v: number }
  /** after rearranging the persons by keys[person] (ascending, or descending when rev) exactly v persons keep their position. */
  | { k: 'fixed'; keys: string[]; rev: boolean; v: number }
  /** the persons u1,u2 (indices of attribute 0) interchange seats (with all their attributes); then claim c holds. */
  | { k: 'after'; sw: [number, number]; c: Claim }
  /** bit i of mask = statement i is true. */
  | { k: 'subset'; stmts: Atom[]; mask: number }

export type PosFn = (it: Item) => number

export function gapOf(g: Geometry, P: PosFn, x: Item, y: Item, side?: 1 | -1): number {
  const px = P(x)
  const py = P(y)
  if (isRound(g)) return mod((side ?? 1) * (py - px), g.n) - 1
  return grpOf(g, px) === grpOf(g, py) ? Math.abs(idxOf(g, px) - idxOf(g, py)) - 1 : -1
}

export function fixedCount(g: Geometry, P: PosFn, keys: string[], rev: boolean): number {
  const n = g.n
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => (keys[a] < keys[b] ? -1 : keys[a] > keys[b] ? 1 : 0) * (rev ? -1 : 1))
  let cnt = 0
  order.forEach((person, rank) => {
    if (P([0, person]) === rank) cnt++
  })
  return cnt
}

export function evalClaim(g: Geometry, cl: Claim, P: PosFn): boolean {
  switch (cl.k) {
    case 'atom':
      return evalAtom(g, cl.a, P)
    case 'gap':
      return gapOf(g, P, cl.x, cl.y, cl.side) === cl.v
    case 'cnt': {
      const i = idxOf(g, P(cl.x))
      const sz = g.kind === 'stacks' ? g.n / g.stacks : g.kind === 'tworow' ? g.n / 2 : g.n
      return (cl.dir === 'lo' ? i : sz - 1 - i) === cl.v
    }
    case 'fixed':
      return fixedCount(g, P, cl.keys, cl.rev) === cl.v
    case 'after': {
      const p = P([0, cl.sw[0]])
      const q = P([0, cl.sw[1]])
      const P2: PosFn = (it) => {
        const r = P(it)
        return r === p ? q : r === q ? p : r
      }
      return evalClaim(g, cl.c, P2)
    }
    case 'subset': {
      let m = 0
      cl.stmts.forEach((s, i) => {
        if (evalAtom(g, s, P)) m |= 1 << i
      })
      return m === cl.mask
    }
  }
}
