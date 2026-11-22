// Explanations for a solved family-tree puzzle: why each clue holds in the tree, how much it narrowed things down, and
// which clues clash when no family fits.

import { holds, famKey, siblingsOf, type World } from './model'
import { countOf, solveFamily, type Fact, type FamilyPuzzle } from './solve'
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
  /** when no family fits: single clues whose removal makes the puzzle solvable */
  culprits: number[]
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
  }
}

export function analyzeFamily(p: FamilyPuzzle): FamilyAnalysis {
  const found = solveFamily(p, { limit: 20 })
  const worlds = found.worlds
  const first = worlds[0]
  const nm = (i: number) => p.names[i]
  const clues: ClueNote[] = p.clues.map((c) => {
    const res = worlds.length ? solveFamily(p, { limit: 20, skip: new Set([c.id]), nodeCap: 1_500_000 }) : { worlds: [], complete: true }
    return {
      id: c.id,
      text: c.text,
      facts: c.facts.map((f) => ({ fact: describeFact(f, nm), because: first ? because(first, f) : '' })),
      without: res.worlds.length,
      more: !res.complete && res.worlds.length >= 20,
    }
  })
  const culprits: number[] = []
  if (!worlds.length && found.complete) {
    for (const c of p.clues) {
      const r = solveFamily(p, { limit: 1, skip: new Set([c.id]), nodeCap: 1_500_000 })
      if (r.worlds.length) culprits.push(c.id)
    }
  }
  return { status: worlds.length === 0 ? 'none' : worlds.length === 1 && found.complete ? 'unique' : 'several', worlds, partial: !found.complete, clues, culprits }
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
