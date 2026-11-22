// Explanations for a solved family-tree puzzle: why each clue holds in the tree, how much it narrowed things down, and
// which clues clash when no family fits.

import { holds, famKey, siblingsOf, type World } from './model'
import { countOf, solveFamily, type Fact, type FamilyClue, type FamilyPuzzle } from './solve'
import { describeFact } from './parse'

export interface FactNote {
  /** the statement as read */
  fact: string
  /** why it is true in the first tree (empty when the tree has nothing to add) */
  because: string
}

export interface ClueNote {
  id: number
  text: string
  facts: FactNote[]
  /** how many families fit all the other clues (without this one); `more` when the count was capped */
  without: number
  more: boolean
}

export interface FamilyAnalysis {
  status: 'unique' | 'several' | 'none'
  worlds: World[]
  /** the search stopped at its limits, so there may be further families */
  partial: boolean
  clues: ClueNote[]
  /** no family fits the usual meanings of brother / sister-in-law, so the wider ones (a spouse's sibling's husband / wife) were allowed */
  relaxed: boolean
  /** the search covered every family (false when it stopped at its time budget) */
  searchedAll: boolean
  /** the slower parts (clue importance, clashes) are still being worked out */
  pending: boolean
  /** when no family fits: single clues whose removal makes the puzzle solvable */
  culprits: number[]
  /** the statements inside those clues whose removal alone makes it solvable */
  culpritFacts: { clue: number; fact: string }[]
}

function because(w: World, f: Fact): string {
  const nm = (i: number) => w.names[i]
  switch (f.t) {
    case 'rel': {
      if (f.neg) return `${nm(f.x)} is not the ${f.rel} of ${nm(f.y)} in this tree`
      return holds(w, f.rel, f.x, f.y) ?? ''
    }
    case 'gender':
      return ''
    case 'count': {
      const who: string[] = []
      for (let y = 0; y < w.n; y++) if (y !== f.x && holds(w, f.what === 'child' ? 'child' : f.what, y, f.x)) who.push(nm(y))
      const c = countOf(w, f.x, f.what)
      return c === 0 ? `nobody in the tree is ${nm(f.x)}'s ${f.what}` : `${nm(f.x)}'s ${f.what}${c > 1 ? 's' : ''} in the tree: ${who.join(', ')}`
    }
    case 'opposite':
      return `${nm(f.x)} is ${w.gender[f.x] === 'M' ? 'male' : 'female'} and ${nm(f.y)} is ${w.gender[f.y] === 'M' ? 'male' : 'female'}`
    case 'single': {
      const z = w.spouse[f.x]
      return z >= 0 ? `${nm(f.x)} is married to ${nm(z)}` : `${nm(f.x)} has no husband / wife in the tree`
    }
    case 'marriedTo': {
      const z = w.spouse[f.x]
      return z >= 0 ? `${nm(f.x)} is married to ${nm(z)}, and ${holds(w, f.rel, z, f.y) ?? ''}` : ''
    }
  }
}

/** the tree(s) right away; the slower parts (how much each clue matters, which clues clash) are filled in by `refineAnalysis` */
export function analyzeFamily(p: FamilyPuzzle): FamilyAnalysis {
  let found = solveFamily(p, { limit: 20, deadlineMs: 6000 })
  let relaxed = false
  if (!found.worlds.length && found.complete) {
    const wider = solveFamily(p, { limit: 20, relaxed: true, deadlineMs: 6000 })
    if (wider.worlds.length) {
      found = wider
      relaxed = true
    }
  }
  const worlds = found.worlds
  const first = worlds[0]
  const nm = (i: number) => p.names[i]
  const clues: ClueNote[] = p.clues.map((c) => ({
    id: c.id,
    text: c.text,
    facts: c.facts.map((f) => ({ fact: describeFact(f, nm), because: first ? because(first, f) : '' })),
    without: -1,
    more: false,
  }))
  return {
    status: worlds.length === 0 ? 'none' : worlds.length === 1 && found.complete ? 'unique' : 'several',
    worlds,
    partial: !found.complete,
    relaxed,
    searchedAll: found.complete,
    pending: true,
    clues,
    culprits: [],
    culpritFacts: [],
  }
}

/**
 * The slower parts of the analysis, one small search at a time (the page runs them between repaints):
 * how many trees fit without each clue, or — when no tree fits — which clues and statements are in the way.
 * Each step yields the analysis so far.
 */
export function* refineAnalysis(p: FamilyPuzzle, start: FamilyAnalysis): Generator<FamilyAnalysis> {
  let cur = start
  const nm = (i: number) => p.names[i]
  if (start.worlds.length) {
    for (const c of p.clues) {
      const res = solveFamily(p, { limit: 20, skip: new Set([c.id]), nodeCap: 1_500_000, relaxed: start.relaxed, deadlineMs: 1500 })
      cur = { ...cur, clues: cur.clues.map((x) => (x.id === c.id ? { ...x, without: res.worlds.length, more: !res.complete && res.worlds.length >= 20 } : x)) }
      yield cur
    }
  } else if (start.searchedAll) {
    const solvable = (q: FamilyPuzzle) => solveFamily(q, { limit: 1, nodeCap: 1_500_000, relaxed: true, deadlineMs: 1200 }).worlds.length > 0
    const culprits: number[] = []
    for (const c of p.clues) {
      if (solvable({ ...p, clues: p.clues.filter((x) => x.id !== c.id) })) culprits.push(c.id)
      cur = { ...cur, culprits: [...culprits] }
      yield cur
    }
    const culpritFacts: { clue: number; fact: string }[] = []
    for (const id of culprits) {
      const c = p.clues.find((x) => x.id === id) as FamilyClue
      if (c.facts.length < 2) culpritFacts.push({ clue: id, fact: describeFact(c.facts[0], nm) })
      else
        for (const f of c.facts) {
          const rest = p.clues.map((x) => (x.id === id ? { ...x, facts: x.facts.filter((g) => g !== f) } : x))
          if (solvable({ ...p, clues: rest })) culpritFacts.push({ clue: id, fact: describeFact(f, nm) })
          cur = { ...cur, culpritFacts: [...culpritFacts] }
          yield cur
        }
    }
  }
  yield { ...cur, pending: false }
}

/** the pairs of brothers and sisters, for the "what the clues settle" list */
export function siblingGroups(w: World): number[][] {
  const seen = new Set<number>()
  const groups: number[][] = []
  for (let i = 0; i < w.n; i++) {
    if (seen.has(i)) continue
    const g = [i, ...siblingsOf(w, i)]
    if (g.length > 1) {
      g.forEach((x) => seen.add(x))
      groups.push(g)
    }
  }
  return groups
}

export { famKey }
