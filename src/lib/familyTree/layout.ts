// Layout of one family for drawing: a row per generation, married couples side by side, brothers and sisters next to each
// other, children under their parents.

import { famKey, parentsOf, type World } from './model'

export interface TreeNode {
  i: number
  x: number
  y: number
}

export interface ChildGroup {
  parents: number[]
  children: number[]
}

export interface TreeLayout {
  nodes: TreeNode[]
  marriages: [number, number][]
  /** brothers and sisters whose parents are outside the family (drawn joined by a bracket) */
  sibGroups: number[][]
  /** children whose parents are among the people (drawn hanging from the parents) */
  childGroups: ChildGroup[]
  width: number
  height: number
  rows: number
}

export const SLOT = 96
export const ROW_H = 170
export const PAD_X = 90
export const PAD_TOP = 96

function permutations<T>(items: T[], cap: number): T[][] {
  const out: T[][] = []
  const rec = (rest: T[], acc: T[]) => {
    if (out.length >= cap) return
    if (!rest.length) {
      out.push(acc)
      return
    }
    for (let k = 0; k < rest.length; k++) rec([...rest.slice(0, k), ...rest.slice(k + 1)], [...acc, rest[k]])
  }
  rec(items, [])
  return out
}

export function layoutFamily(w: World): TreeLayout {
  const gens = [...new Set(w.gen)].sort((a, b) => a - b)
  const xOf = new Map<number, number>()
  const sibKey = (i: number) => famKey(w, i)

  gens.forEach((g) => {
    const members = Array.from({ length: w.n }, (_, i) => i).filter((i) => w.gen[i] === g)
    // units: a married couple (husband first) or a person alone
    const done = new Set<number>()
    const units: number[][] = []
    for (const i of members) {
      if (done.has(i)) continue
      const s = w.spouse[i]
      if (s >= 0 && w.gen[s] === g) {
        done.add(i)
        done.add(s)
        units.push(w.gender[i] === 'M' ? [i, s] : [s, i])
      } else {
        done.add(i)
        units.push([i])
      }
    }
    // try every order of the units and every way round of each couple; keep the one that puts brothers / sisters close and children under their parents
    const orders = permutations(units.map((_, k) => k), 4000)
    let best: number[][] = units
    let bestCost = Infinity
    const flipsFor = (u: number[][]) => {
      const couples = u.map((x, k) => (x.length === 2 ? k : -1)).filter((k) => k >= 0)
      return couples.length ? 1 << Math.min(couples.length, 8) : 1
    }
    for (const order of orders) {
      const base = order.map((k) => units[k])
      const flips = flipsFor(base)
      const couples = base.map((x, k) => (x.length === 2 ? k : -1)).filter((k) => k >= 0)
      for (let mask = 0; mask < flips; mask++) {
        const arranged = base.map((x, k) => {
          const pos = couples.indexOf(k)
          return pos >= 0 && pos < 8 && mask & (1 << pos) ? [x[1], x[0]] : x
        })
        const xs = new Map<number, number>()
        let slot = 0
        for (const u of arranged) {
          for (const p of u) xs.set(p, slot++)
          slot += 0.6
        }
        let cost = 0
        for (let a = 0; a < members.length; a++)
          for (let b = a + 1; b < members.length; b++) {
            const i = members[a]
            const j = members[b]
            if (sibKey(i) === sibKey(j)) cost += Math.abs((xs.get(i) as number) - (xs.get(j) as number)) * 3
          }
        for (const i of members) {
          const ps = parentsOf(w, i)
          if (!ps.length || !ps.every((p) => xOf.has(p))) continue
          const mid = ps.reduce((s, p) => s + (xOf.get(p) as number), 0) / ps.length
          cost += Math.abs((xs.get(i) as number) - mid)
        }
        if (cost < bestCost - 1e-9) {
          bestCost = cost
          best = arranged
        }
      }
    }
    let slot = 0
    for (const u of best) {
      for (const p of u) xOf.set(p, slot++)
      slot += 0.6
    }
  })

  // centre each row on the widest one
  const rowSpan = (g: number) => {
    const xs = [...xOf.entries()].filter(([i]) => w.gen[i] === g).map(([, x]) => x)
    return { min: Math.min(...xs), max: Math.max(...xs) }
  }
  const widest = Math.max(...gens.map((g) => rowSpan(g).max - rowSpan(g).min))
  for (const g of gens) {
    const { min, max } = rowSpan(g)
    const shift = (widest - (max - min)) / 2 - min
    for (const [i, x] of xOf) if (w.gen[i] === g) xOf.set(i, x + shift)
  }

  const nodes: TreeNode[] = Array.from({ length: w.n }, (_, i) => ({ i, x: PAD_X + (xOf.get(i) as number) * SLOT, y: PAD_TOP + gens.indexOf(w.gen[i]) * ROW_H }))
  const marriages: [number, number][] = []
  for (let i = 0; i < w.n; i++) if (w.spouse[i] > i) marriages.push([i, w.spouse[i]])
  const byKey = new Map<string, number[]>()
  for (let i = 0; i < w.n; i++) byKey.set(sibKey(i), [...(byKey.get(sibKey(i)) ?? []), i])
  const sibGroups: number[][] = []
  const childGroups: ChildGroup[] = []
  for (const [key, members] of byKey) {
    if (key.startsWith('e')) {
      if (members.length > 1) sibGroups.push(members)
    } else childGroups.push({ parents: parentsOf(w, members[0]), children: members })
  }
  return { nodes, marriages, sibGroups, childGroups, width: PAD_X * 2 + (widest + 1) * SLOT, height: PAD_TOP + (gens.length - 1) * ROW_H + 120, rows: gens.length }
}
