// Solver for family-tree puzzles: every family (see model.ts) that satisfies all the clues, found by exhaustive search.
//
// The search builds a family in layers so that the clues prune early:
//   1. gender and generation of every person (clues that name a relation fix genders and the generation gap),
//   2. who is married to whom (same generation, opposite genders),
//   3. each person's parents (a couple of the people, a single parent, or nobody among the people — see model.ts).
// The finished family must also be connected (a family), and nobody is married to a brother or sister.

import { RELATIONS, holds, isParent, siblingsOf, childrenOf, parentsOf, siblings, type Gender, type World } from './model'

export type CountKind = 'son' | 'daughter' | 'child' | 'brother' | 'sister' | 'sibling'

export type Fact =
  | { t: 'rel'; rel: string; x: number; y: number; neg?: boolean } // x is the <rel> of y
  | { t: 'gender'; x: number; g: Gender }
  // x has exactly / at least n people of that kind ("A has only one daughter", "R has no siblings")
  | { t: 'count'; x: number; what: CountKind; n: number; atLeast?: boolean }
  // x and y are of opposite (or, with `same`, the same) gender
  | { t: 'opposite'; x: number; y: number; same?: boolean }
  // x is unmarried / married
  | { t: 'single'; x: number; married?: boolean }
  // x is married to the <rel> of y ("V, who is married to B's brother")
  | { t: 'marriedTo'; x: number; rel: string; y: number }

export interface FamilyClue {
  id: number
  text: string
  facts: Fact[]
}

/** statements about the whole family ("four married couples", "no single parents", "more females than males") */
export interface FamilyRules {
  /** exactly this many married couples */
  couples?: number
  /** a child's parents are both among the people (a married couple), never one parent alone */
  noSingleParents?: boolean
  /** every married couple of these generations has at least one child (the list is empty-free; undefined = no such rule) */
  couplesHaveChildren?: number[]
  genderBalance?: 'moreF' | 'moreM' | 'equal'
}

export interface FamilyPuzzle {
  names: string[]
  /** how many generations the people are spread across */
  gens: number
  clues: FamilyClue[]
  rules?: FamilyRules
}

export function describeRules(r: FamilyRules | undefined, gens: number): string[] {
  const out: string[] = []
  if (!r) return out
  if (r.couples !== undefined) out.push(`${r.couples} married couple${r.couples === 1 ? '' : 's'}`)
  if (r.noSingleParents) out.push('no single parents')
  if (r.couplesHaveChildren) out.push(r.couplesHaveChildren.length >= gens ? 'every couple has a child' : `every couple in generation${r.couplesHaveChildren.length > 1 ? 's' : ''} ${r.couplesHaveChildren.join(', ')} has a child`)
  if (r.genderBalance) out.push(r.genderBalance === 'moreF' ? 'more women than men' : r.genderBalance === 'moreM' ? 'more men than women' : 'as many men as women')
  return out
}


const COUNT_REL: Record<CountKind, string> = { son: 'son', daughter: 'daughter', child: 'child', brother: 'brother', sister: 'sister', sibling: 'sibling' }

export function countOf(w: World, x: number, what: CountKind): number {
  let c = 0
  for (let y = 0; y < w.n; y++) if (y !== x && holds(w, COUNT_REL[what], y, x)) c++ // y is a <what> of x
  return c
}

export function factHolds(w: World, f: Fact): boolean {
  switch (f.t) {
    case 'rel':
      return (holds(w, f.rel, f.x, f.y) !== null) !== !!f.neg
    case 'gender':
      return w.gender[f.x] === f.g
    case 'count': {
      const c = countOf(w, f.x, f.what)
      return f.atLeast ? c >= f.n : c === f.n
    }
    case 'opposite':
      return (w.gender[f.x] === w.gender[f.y]) === !!f.same
    case 'single':
      return (w.spouse[f.x] >= 0) === !!f.married
    case 'marriedTo': {
      const z = w.spouse[f.x]
      return z >= 0 && holds(w, f.rel, z, f.y) !== null
    }
  }
}

/** brothers and sisters, a parent's brother or sister and their children, first cousins: they are not married to each other */
export function bloodRelated(w: World, a: number, b: number): boolean {
  if (siblings(w, a, b)) return true
  for (const p of parentsOf(w, a)) {
    if (p === b || siblings(w, p, b)) return true
    for (const q of parentsOf(w, b)) if (siblings(w, p, q)) return true
  }
  for (const q of parentsOf(w, b)) if (q === a || siblings(w, q, a)) return true
  return false
}

export function clueHolds(w: World, c: FamilyClue): boolean {
  return c.facts.every((f) => factHolds(w, f))
}

export interface FamilySearch {
  worlds: World[]
  /** false when the search stopped at its limits, so there may be more families */
  complete: boolean
}

interface Options {
  limit?: number
  nodeCap?: number
  /** clue ids left out of the search ("what if this clue were missing") */
  skip?: Set<number>
  /** use the wider meaning of in-laws (see World.relaxed) */
  relaxed?: boolean
  /** stop searching after this many milliseconds (the result is then incomplete) */
  deadlineMs?: number
  /** families in which person x is in generation g are left out ("is x certainly not in generation g?" — used to find what the clues settle) */
  ban?: { x: number; g: number }[]
}

export function solveFamily(p: FamilyPuzzle, opts: Options = {}): FamilySearch {
  const n = p.names.length
  const G = p.gens
  const limit = opts.limit ?? 50
  const nodeCap = opts.nodeCap ?? 4_000_000
  const t0 = Date.now()
  const deadline = opts.deadlineMs ?? Infinity
  const clues = p.clues.filter((c) => !opts.skip?.has(c.id))
  const facts = clues.flatMap((c) => c.facts)
  const relFacts = facts.filter((f): f is Extract<Fact, { t: 'rel' }> => f.t === 'rel' && !f.neg)
  const forced: (Gender | null)[] = Array(n).fill(null)
  let impossible = false
  const force = (i: number, g: Gender) => {
    if (forced[i] && forced[i] !== g) impossible = true
    forced[i] = g
  }
  for (const f of facts) {
    if (f.t === 'gender') force(f.x, f.g)
    else if (f.t === 'rel' && !f.neg) {
      const d = RELATIONS[f.rel]
      if (d.gender) force(f.x, d.gender)
      if (f.x === f.y) impossible = true
    }
  }
  if (impossible) return { worlds: [], complete: true }

  const gender: Gender[] = Array(n).fill('M')
  const gen: number[] = Array(n).fill(0)
  const spouse: number[] = Array(n).fill(-2)
  const father: number[] = Array(n).fill(-1)
  const mother: number[] = Array(n).fill(-1)
  const ext: number[] = Array(n).fill(-1)
  const w: World = { n, names: p.names, gender, gen, spouse, father, mother, ext, relaxed: opts.relaxed }
  const worlds: World[] = []
  let nodes = 0
  let complete = true
  const stop = () => worlds.length >= limit || !complete

  const rules = p.rules ?? {}
  const oppFacts = facts.filter((f): f is Extract<Fact, { t: 'opposite' }> => f.t === 'opposite')
  const singleFacts = facts.filter((f): f is Extract<Fact, { t: 'single' }> => f.t === 'single')
  const spouseFacts = relFacts.filter((f) => RELATIONS[f.rel].direct === 'spouse')
  // "x is not married to y" can be checked as soon as the marriages are fixed
  const notSpouse = facts.filter((f): f is Extract<Fact, { t: 'rel' }> => f.t === 'rel' && !!f.neg && RELATIONS[f.rel].direct === 'spouse')
  const banned = opts.ban ?? []
  const parentFacts = relFacts.filter((f) => RELATIONS[f.rel].direct === 'parent' || RELATIONS[f.rel].direct === 'child')

  // ── layer 3: parents ──
  let extNext = 0
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => gen[a] - gen[b] || a - b)
  const parentOk = (i: number): boolean => {
    for (const f of parentFacts) {
      const d = RELATIONS[f.rel]
      if (d.direct === 'parent' && f.y === i) {
        if (f.rel === 'father' ? father[i] !== f.x : f.rel === 'mother' ? mother[i] !== f.x : !isParent(w, f.x, i)) return false
      } else if (d.direct === 'child' && f.x === i) {
        if (!isParent(w, f.y, i)) return false
      }
    }
    return true
  }
  const leaf = () => {
    // nobody is married to a blood relative: a brother or sister, an aunt / uncle, a first cousin
    for (let i = 0; i < n; i++) if (spouse[i] > i && bloodRelated(w, i, spouse[i])) return
    // a family is connected
    const root = Array.from({ length: n }, (_, i) => i)
    const find = (a: number): number => (root[a] === a ? a : (root[a] = find(root[a])))
    const join = (a: number, b: number) => {
      root[find(a)] = find(b)
    }
    for (let i = 0; i < n; i++) {
      if (spouse[i] >= 0) join(i, spouse[i])
      if (father[i] >= 0) join(i, father[i])
      if (mother[i] >= 0) join(i, mother[i])
      for (const s of siblingsOf(w, i)) join(i, s)
    }
    for (let i = 1; i < n; i++) if (find(i) !== find(0)) return
    // every couple of the stated generations has a child
    if (rules.couplesHaveChildren) {
      for (let i = 0; i < n; i++) {
        if (gender[i] !== 'M' || spouse[i] < 0 || !rules.couplesHaveChildren.includes(gen[i])) continue
        if (!childrenOf(w, i).length) return
      }
    }
    for (const c of clues) if (!clueHolds(w, c)) return
    worlds.push({ ...w, gender: [...gender], gen: [...gen], spouse: spouse.map((s) => (s < 0 ? -1 : s)), father: [...father], mother: [...mother], ext: [...ext] })
  }
  const parentsDfs = (k: number): void => {
    if (stop()) return
    if (++nodes > nodeCap || ((nodes & 255) === 0 && Date.now() - t0 > deadline)) {
      complete = false
      return
    }
    if (k === n) {
      leaf()
      return
    }
    const i = order[k]
    const options: (() => void)[] = []
    // a couple of the people, or a single parent, one generation up
    if (gen[i] > 1) {
      for (let f = 0; f < n; f++) {
        if (gen[f] !== gen[i] - 1 || gender[f] !== 'M') continue
        const m = spouse[f]
        if (m >= 0) options.push(() => {
          father[i] = f
          mother[i] = m
        })
      }
      for (let x = 0; x < n && !rules.noSingleParents; x++) {
        if (gen[x] !== gen[i] - 1 || spouse[x] >= 0) continue
        options.push(() => {
          if (gender[x] === 'M') father[i] = x
          else mother[i] = x
        })
      }
    }
    for (const apply of options) {
      father[i] = -1
      mother[i] = -1
      ext[i] = -1
      apply()
      if (parentOk(i)) parentsDfs(k + 1)
      father[i] = -1
      mother[i] = -1
      if (stop()) return
    }
    // parents outside the family: brothers and sisters share a group (groups are numbered in order, so none is counted twice)
    const groups = new Set<number>()
    for (let q = 0; q < k; q++) {
      const j = order[q]
      if (father[j] < 0 && mother[j] < 0 && gen[j] === gen[i]) groups.add(ext[j])
    }
    for (const g of [...groups, extNext]) {
      father[i] = -1
      mother[i] = -1
      ext[i] = g
      const fresh = g === extNext
      if (fresh) extNext++
      if (parentOk(i)) parentsDfs(k + 1)
      if (fresh) extNext--
      ext[i] = -1
      if (stop()) return
    }
  }

  // ── layer 2: marriages ──
  let pairs = 0
  const spouseDfs = (i: number): void => {
    if (stop()) return
    if ((++nodes & 255) === 0 && Date.now() - t0 > deadline) {
      complete = false
      return
    }
    if (i === n) {
      for (const f of spouseFacts) if (spouse[f.x] !== f.y) return
      for (const f of notSpouse) if (spouse[f.x] === f.y || spouse[f.y] === f.x) return
      for (const f of singleFacts) if ((spouse[f.x] >= 0) !== !!f.married) return
      if (rules.couples !== undefined && pairs !== rules.couples) return
      order.sort((a, b) => gen[a] - gen[b] || a - b)
      extNext = 0
      parentsDfs(0)
      return
    }
    if (spouse[i] !== -2) return spouseDfs(i + 1)
    spouse[i] = -1
    spouseDfs(i + 1)
    for (let j = i + 1; j < n; j++) {
      if (spouse[j] !== -2 || gen[j] !== gen[i] || gender[j] === gender[i]) continue
      if (rules.couples !== undefined && pairs >= rules.couples) break
      spouse[i] = j
      spouse[j] = i
      pairs++
      spouseDfs(i + 1)
      pairs--
      spouse[j] = -2
      if (stop()) break
    }
    spouse[i] = -2
  }

  // ── layer 1: gender and generation ──
  const genDfs = (i: number): void => {
    if (stop()) return
    if (i === n) {
      for (let g = 1; g <= G; g++) if (!gen.includes(g)) return
      if (rules.genderBalance) {
        const f = gender.filter((x) => x === 'F').length
        const m = n - f
        if (rules.genderBalance === 'moreF' ? f <= m : rules.genderBalance === 'moreM' ? m <= f : f !== m) return
      }
      spouse.fill(-2)
      pairs = 0
      spouseDfs(0)
      return
    }
    for (const g of forced[i] ? [forced[i] as Gender] : (['M', 'F'] as Gender[])) {
      gender[i] = g
      for (let k = 1; k <= G; k++) {
        gen[i] = k
        if (banned.some((b) => b.x === i && b.g === k)) continue
        let ok = true
        for (const f of relFacts) {
          if (f.x > i || f.y > i || (f.x !== i && f.y !== i)) continue
          if (gen[f.x] - gen[f.y] !== RELATIONS[f.rel].genDiff) {
            ok = false
            break
          }
        }
        for (const f of oppFacts) {
          if (!ok || f.x > i || f.y > i || (f.x !== i && f.y !== i)) continue
          if ((gender[f.x] === gender[f.y]) !== !!f.same) ok = false
        }
        if (ok) genDfs(i + 1)
        if (stop()) return
      }
      gen[i] = 0
    }
  }
  genDfs(0)
  return { worlds, complete: complete && worlds.length < limit }
}

// ── what the clues settle ──

export interface Settled {
  /** per person: facts that hold in every family found */
  people: { gender: Gender | null; gen: number | null; spouse: number | null | undefined; father: number | null | undefined; mother: number | null | undefined }[]
}

/** facts true in all the families: gender, generation, spouse (-1 = none), parents (-1 = not among the people) */
export function settled(ws: World[]): Settled {
  const same = <T,>(f: (w: World) => T): T | undefined => (ws.every((w) => f(w) === f(ws[0])) ? f(ws[0]) : undefined)
  return {
    people: ws[0].names.map((_, i) => ({
      gender: same((w) => w.gender[i]) ?? null,
      gen: same((w) => w.gen[i]) ?? null,
      spouse: same((w) => w.spouse[i]),
      father: same((w) => w.father[i]),
      mother: same((w) => w.mother[i]),
    })),
  }
}

export { childrenOf }
