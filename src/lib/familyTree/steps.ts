// Clue-by-clue build-up of a family tree: after each clue, what is now CERTAIN (true in every family that fits the clues so far)
// and how many families are still possible. The reference is the final family, so a fact is "certain" when no family that
// fits the clues so far differs from the final one on it.
//
// Two ways of finding what is certain, both sound (a fact is only reported when it was proved):
//   - small checks ("is there a family where G is the other sex / in another generation / married to someone else?"), which are quick
//     because the solver prunes on them early;
//   - when few enough families fit, listing all of them and keeping what they share (this also gives parents and brothers and sisters).
// A check that runs out of time simply reports nothing: what is certain only ever grows, so the picture never takes a step back.

import { siblings, type Gender, type World } from './model'
import { describeFact } from './parse'
import { solveFamily, type Fact, type FamilyClue, type FamilyPuzzle } from './solve'

export interface Known {
  gender: (Gender | null)[]
  /** generation, 1 = oldest */
  gen: (number | null)[]
  /** index of the husband / wife, -1 = not married, null = not certain yet */
  spouse: (number | null)[]
  /** the person's parents (or that they are outside the family) are certain */
  parents: boolean[]
  /** brothers and sisters that are certain: sibs[a][b] */
  sibs: boolean[][]
}

export interface FamilyStep {
  /** number of clues used (0 = none yet) */
  k: number
  known: Known
  /** how many families still fit; `many` when there are too many to list */
  trees: number
  many: boolean
  /** people named in the clues so far */
  named: boolean[]
  /** what became certain with this clue, in words */
  notes: string[]
}

const empty = (n: number): Known => ({
  gender: Array(n).fill(null),
  gen: Array(n).fill(null),
  spouse: Array(n).fill(null),
  parents: Array(n).fill(false),
  sibs: Array.from({ length: n }, () => Array(n).fill(false)),
})

const copy = (k: Known): Known => ({ gender: [...k.gender], gen: [...k.gen], spouse: [...k.spouse], parents: [...k.parents], sibs: k.sibs.map((r) => [...r]) })

export function factPeople(f: Fact): number[] {
  switch (f.t) {
    case 'rel':
    case 'opposite':
    case 'marriedTo':
      return [f.x, f.y]
    default:
      return [f.x]
  }
}

const flip = (g: Gender): Gender => (g === 'M' ? 'F' : 'M')

function describeNew(prev: Known, cur: Known, w: World): string[] {
  const nm = (i: number) => w.names[i]
  const out: string[] = []
  const men: number[] = []
  const women: number[] = []
  const byGen = new Map<number, number[]>()
  for (let i = 0; i < w.n; i++) {
    if (cur.gender[i] && !prev.gender[i]) (cur.gender[i] === 'M' ? men : women).push(i)
    if (cur.gen[i] !== null && prev.gen[i] === null) byGen.set(cur.gen[i] as number, [...(byGen.get(cur.gen[i] as number) ?? []), i])
  }
  const list = (xs: number[]) => xs.map(nm).join(', ')
  if (men.length) out.push(`${list(men)} ${men.length === 1 ? 'is a man' : 'are men'}`)
  if (women.length) out.push(`${list(women)} ${women.length === 1 ? 'is a woman' : 'are women'}`)
  for (const [g, xs] of [...byGen].sort((a, b) => a[0] - b[0])) out.push(`${list(xs)} ${xs.length === 1 ? 'is' : 'are'} in generation ${g}`)
  for (let i = 0; i < w.n; i++) {
    if (cur.spouse[i] === null || prev.spouse[i] !== null) continue
    const s = cur.spouse[i] as number
    if (s < 0) out.push(`${nm(i)} is not married`)
    // a couple is announced once: by the first of them, or by the second when the first is not certain yet
    else if (i < s || cur.spouse[s] === null) out.push(`${nm(i)} and ${nm(s)} are married`)
  }
  for (let i = 0; i < w.n; i++) {
    if (!cur.parents[i] || prev.parents[i]) continue
    const f = w.father[i]
    const m = w.mother[i]
    if (f < 0 && m < 0) out.push(`${nm(i)}'s parents are outside the family`)
    else if (f >= 0 && m >= 0) out.push(`${nm(i)} is the child of ${nm(f)} and ${nm(m)}`)
    else out.push(`${nm(i)} is the child of ${nm(f >= 0 ? f : m)}, a single parent`)
  }
  const seen = new Set<number>()
  for (let i = 0; i < w.n; i++) {
    if (seen.has(i)) continue
    const group = [i, ...Array.from({ length: w.n }, (_, j) => j).filter((j) => j > i && cur.sibs[i][j])]
    if (group.length < 2) continue
    const fresh = group.some((a) => group.some((b) => a < b && !prev.sibs[a][b]))
    group.forEach((g) => seen.add(g))
    if (fresh) out.push(`${list(group)} ${group.length === 2 ? 'are' : 'are all'} brothers and sisters`)
  }
  return out
}

/**
 * The steps for a puzzle, one clue at a time. A generator, so the page can run it between repaints and show the steps as they are found:
 * every yield carries all the steps finished so far.
 */
export function* familySteps(p: FamilyPuzzle, target: World, relaxed = false): Generator<FamilyStep[]> {
  const n = p.names.length
  const steps: FamilyStep[] = []
  let known = empty(n)
  const named: boolean[] = Array(n).fill(false)
  steps.push({ k: 0, known: copy(known), trees: -1, many: true, named: [...named], notes: [] })
  yield steps

  for (let k = 1; k <= p.clues.length; k++) {
    const used = p.clues.slice(0, k)
    for (const f of used[k - 1].facts) for (const x of factPeople(f)) named[x] = true
    const prev = known
    known = copy(known)

    // 1. everything the families that fit have in common, when they can all be listed
    const all = solveFamily({ ...p, clues: used }, { limit: 300, nodeCap: 600_000, deadlineMs: 500, relaxed })
    const listed = all.complete && all.worlds.length > 0
    if (listed) {
      const ws = all.worlds
      const w0 = ws[0]
      for (let i = 0; i < n; i++) {
        if (ws.every((w) => w.gender[i] === w0.gender[i])) known.gender[i] = w0.gender[i]
        if (ws.every((w) => w.gen[i] === w0.gen[i])) known.gen[i] = w0.gen[i]
        if (ws.every((w) => w.spouse[i] === w0.spouse[i])) known.spouse[i] = w0.spouse[i]
        if (ws.every((w) => w.father[i] === w0.father[i] && w.mother[i] === w0.mother[i])) known.parents[i] = true
        for (let j = 0; j < n; j++) if (i !== j && ws.every((w) => siblings(w, i, j))) known.sibs[i][j] = true
      }
    } else {
      // 2. small checks against the final family, only for people the clues have named
      const extra = (facts: Fact[], ban?: { x: number; g: number }[]): boolean => {
        const clue: FamilyClue = { id: -1, text: '', facts }
        const r = solveFamily({ ...p, clues: [...used, clue] }, { limit: 1, nodeCap: 150_000, deadlineMs: 120, relaxed, ban })
        return r.complete && r.worlds.length === 0 // no family differs: certain
      }
      for (let i = 0; i < n; i++) {
        if (!named[i]) continue
        if (!known.gender[i] && extra([{ t: 'gender', x: i, g: flip(target.gender[i]) }])) known.gender[i] = target.gender[i]
        yield steps
        if (known.gen[i] === null && extra([], [{ x: i, g: target.gen[i] }])) known.gen[i] = target.gen[i]
        yield steps
        if (known.spouse[i] === null) {
          const s = target.spouse[i]
          const sure = s >= 0 ? extra([{ t: 'rel', rel: 'spouse', x: i, y: s, neg: true }]) : extra([{ t: 'single', x: i, married: true }])
          if (sure) known.spouse[i] = s
        }
        yield steps
      }
    }
    // never take back what an earlier step had proved
    for (let i = 0; i < n; i++) {
      known.gender[i] ??= prev.gender[i]
      known.gen[i] ??= prev.gen[i]
      known.spouse[i] ??= prev.spouse[i]
      known.parents[i] ||= prev.parents[i]
      for (let j = 0; j < n; j++) known.sibs[i][j] ||= prev.sibs[i][j]
    }
    steps.push({ k, known: copy(known), trees: listed ? all.worlds.length : all.worlds.length, many: !listed, named: [...named], notes: describeNew(prev, known, target) })
    yield steps
  }
}

/** how the clue was read, for the step's caption */
export const readFacts = (c: FamilyClue, names: string[]): string => c.facts.map((f) => describeFact(f, (i) => names[i])).join(' · ')
