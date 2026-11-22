// Family-tree (blood relation) puzzles: the model of one candidate family and the meaning of every relation word.
//
// A "world" is a complete family of n people: each has a gender, a generation (1 = oldest), at most one spouse and a set of
// parents. A person's parents are one of
//   - a married couple (father, mother) who are both among the people,
//   - a single parent among the people (the other parent is not in the family),
//   - nobody among the people ("external" parents): people with the same external group are brothers and sisters.
// The family is closed: "A has only one daughter" counts daughters among the n people, and a person whose parents are not
// among the people has parents outside the puzzle (they do not count as a generation of their own).

export type Gender = 'M' | 'F'

export interface World {
  n: number
  names: string[]
  gender: Gender[]
  /** 1 = the oldest generation */
  gen: number[]
  /** index of the spouse, or -1 */
  spouse: number[]
  /** index of the father / mother among the people, or -1 */
  father: number[]
  mother: number[]
  /** people whose parents are both outside the family share an ext group when they are brothers / sisters; -1 otherwise */
  ext: number[]
  /** also accept the wider meaning of brother / sister-in-law: the husband / wife of one's spouse's brother / sister */
  relaxed?: boolean
}

export const male = (w: World, i: number): boolean => w.gender[i] === 'M'
export const female = (w: World, i: number): boolean => w.gender[i] === 'F'

export const parentsOf = (w: World, i: number): number[] => [w.father[i], w.mother[i]].filter((p) => p >= 0)
export const isParent = (w: World, a: number, b: number): boolean => w.father[b] === a || w.mother[b] === a

/** the key two people share exactly when they are brothers / sisters */
export function famKey(w: World, i: number): string {
  const f = w.father[i]
  const m = w.mother[i]
  return f < 0 && m < 0 ? `e${w.ext[i]}` : `p${f}.${m}`
}
export const siblings = (w: World, a: number, b: number): boolean => a !== b && famKey(w, a) === famKey(w, b)

export const childrenOf = (w: World, a: number): number[] => {
  const out: number[] = []
  for (let i = 0; i < w.n; i++) if (isParent(w, a, i)) out.push(i)
  return out
}
export const siblingsOf = (w: World, a: number): number[] => {
  const out: number[] = []
  for (let i = 0; i < w.n; i++) if (siblings(w, a, i)) out.push(i)
  return out
}

/** "aunt or uncle of y" = a brother / sister of a parent of y, or the husband / wife of such a person */
function auntUncleVia(w: World, x: number, y: number): { via: number; spouseOf?: number } | null {
  for (const p of parentsOf(w, y)) {
    if (siblings(w, x, p)) return { via: p }
    const s = w.spouse[x]
    if (s >= 0 && siblings(w, s, p)) return { via: p, spouseOf: s }
  }
  return null
}

export interface RelationDef {
  /** gender a person must have to be called this ('M' / 'F'), or none */
  gender?: Gender
  /** generation of x minus generation of y */
  genDiff: number
  /**
   * Does x stand in this relation to y in the world? Returns the reason in words (names via `nm`), or null.
   * Several readings are tried (a brother-in-law is a spouse's brother or a sibling's husband), so the first that holds is the reason.
   */
  why: (w: World, x: number, y: number, nm: (i: number) => string) => string | null
  /** the relation is a direct one (parent / child / spouse): it can be checked while the tree is still being built */
  direct?: 'parent' | 'child' | 'spouse'
}

const gnd = (w: World, x: number, g: Gender) => w.gender[x] === g

function sibling(g?: Gender): RelationDef {
  return {
    gender: g,
    genDiff: 0,
    why: (w, x, y, nm) => (siblings(w, x, y) ? `${nm(x)} and ${nm(y)} have the same parents` : null),
  }
}

function parentRel(g?: Gender, only?: 'father' | 'mother'): RelationDef {
  return {
    gender: g,
    genDiff: -1,
    direct: 'parent',
    why: (w, x, y, nm) => {
      if (only === 'father' ? w.father[y] !== x : only === 'mother' ? w.mother[y] !== x : !isParent(w, x, y)) return null
      return `${nm(x)} is a parent of ${nm(y)}`
    },
  }
}

function childRel(g?: Gender): RelationDef {
  return { gender: g, genDiff: 1, direct: 'child', why: (w, x, y, nm) => (isParent(w, y, x) ? `${nm(y)} is a parent of ${nm(x)}` : null) }
}

function grandparent(g?: Gender, side?: 'paternal' | 'maternal'): RelationDef {
  return {
    gender: g,
    genDiff: -2,
    why: (w, x, y, nm) => {
      for (const p of parentsOf(w, y)) {
        if (side === 'paternal' && w.father[y] !== p) continue
        if (side === 'maternal' && w.mother[y] !== p) continue
        if (isParent(w, x, p)) return `${nm(x)} is a parent of ${nm(p)}, who is a parent of ${nm(y)}`
      }
      return null
    },
  }
}

function grandchild(g?: Gender): RelationDef {
  return {
    gender: g,
    genDiff: 2,
    why: (w, x, y, nm) => {
      for (const p of parentsOf(w, x)) if (isParent(w, y, p)) return `${nm(y)} is a parent of ${nm(p)}, who is a parent of ${nm(x)}`
      return null
    },
  }
}

function auntUncle(g?: Gender, side?: 'paternal' | 'maternal'): RelationDef {
  return {
    gender: g,
    genDiff: -1,
    why: (w, x, y, nm) => {
      for (const p of parentsOf(w, y)) {
        if (side === 'paternal' && w.father[y] !== p) continue
        if (side === 'maternal' && w.mother[y] !== p) continue
        if (siblings(w, x, p)) return `${nm(x)} is a brother or sister of ${nm(p)}, who is a parent of ${nm(y)}`
        const s = w.spouse[x]
        if (s >= 0 && siblings(w, s, p)) return `${nm(x)} is married to ${nm(s)}, a brother or sister of ${nm(p)}, who is a parent of ${nm(y)}`
      }
      return null
    },
  }
}

function nephewNiece(g?: Gender): RelationDef {
  return {
    gender: g,
    genDiff: 1,
    why: (w, x, y, nm) => {
      const v = auntUncleVia(w, y, x)
      if (!v) return null
      return v.spouseOf !== undefined ? `${nm(y)} is married to ${nm(v.spouseOf)}, a brother or sister of ${nm(v.via)}, who is a parent of ${nm(x)}` : `${nm(y)} is a brother or sister of ${nm(v.via)}, who is a parent of ${nm(x)}`
    },
  }
}

function inLawSibling(g: Gender): RelationDef {
  return {
    gender: g,
    genDiff: 0,
    why: (w, x, y, nm) => {
      if (x === y) return null
      const sy = w.spouse[y]
      if (sy >= 0 && siblings(w, x, sy)) return `${nm(x)} is a brother or sister of ${nm(sy)}, who is married to ${nm(y)}`
      for (const s of siblingsOf(w, y)) if (w.spouse[s] === x) return `${nm(x)} is married to ${nm(s)}, a brother or sister of ${nm(y)}`
      if (w.relaxed && sy >= 0) for (const s of siblingsOf(w, sy)) if (w.spouse[s] === x) return `${nm(x)} is married to ${nm(s)}, a brother or sister of ${nm(sy)}, who is married to ${nm(y)}`
      return null
    },
  }
}

function parentInLaw(g: Gender): RelationDef {
  return {
    gender: g,
    genDiff: -1,
    why: (w, x, y, nm) => {
      const s = w.spouse[y]
      if (s >= 0 && isParent(w, x, s)) return `${nm(x)} is a parent of ${nm(s)}, who is married to ${nm(y)}`
      return null
    },
  }
}

function childInLaw(g: Gender): RelationDef {
  return {
    gender: g,
    genDiff: 1,
    why: (w, x, y, nm) => {
      const s = w.spouse[x]
      if (s >= 0 && isParent(w, y, s)) return `${nm(x)} is married to ${nm(s)}, a child of ${nm(y)}`
      return null
    },
  }
}

function spouseRel(g?: Gender): RelationDef {
  return { gender: g, genDiff: 0, direct: 'spouse', why: (w, x, y, nm) => (w.spouse[x] === y ? `${nm(x)} is married to ${nm(y)}` : null) }
}

export const RELATIONS: Record<string, RelationDef> = {
  father: parentRel('M', 'father'),
  mother: parentRel('F', 'mother'),
  parent: parentRel(),
  son: childRel('M'),
  daughter: childRel('F'),
  child: childRel(),
  brother: sibling('M'),
  sister: sibling('F'),
  sibling: sibling(),
  husband: spouseRel('M'),
  wife: spouseRel('F'),
  spouse: spouseRel(),
  grandfather: grandparent('M'),
  grandmother: grandparent('F'),
  grandparent: grandparent(),
  'paternal grandfather': grandparent('M', 'paternal'),
  'paternal grandmother': grandparent('F', 'paternal'),
  'maternal grandfather': grandparent('M', 'maternal'),
  'maternal grandmother': grandparent('F', 'maternal'),
  grandson: grandchild('M'),
  granddaughter: grandchild('F'),
  grandchild: grandchild(),
  uncle: auntUncle('M'),
  aunt: auntUncle('F'),
  'paternal uncle': auntUncle('M', 'paternal'),
  'maternal uncle': auntUncle('M', 'maternal'),
  'paternal aunt': auntUncle('F', 'paternal'),
  'maternal aunt': auntUncle('F', 'maternal'),
  nephew: nephewNiece('M'),
  niece: nephewNiece('F'),
  cousin: {
    genDiff: 0,
    why: (w, x, y, nm) => {
      if (x === y || siblings(w, x, y)) return null
      for (const px of parentsOf(w, x)) for (const py of parentsOf(w, y)) if (px !== py && siblings(w, px, py)) return `${nm(px)}, a parent of ${nm(x)}, and ${nm(py)}, a parent of ${nm(y)}, are brother and sister`
      return null
    },
  },
  'brother-in-law': inLawSibling('M'),
  'sister-in-law': inLawSibling('F'),
  'father-in-law': parentInLaw('M'),
  'mother-in-law': parentInLaw('F'),
  'son-in-law': childInLaw('M'),
  'daughter-in-law': childInLaw('F'),
}

/** words of the relation vocabulary (longest first) for the parser */
export const RELATION_WORDS = Object.keys(RELATIONS).sort((a, b) => b.length - a.length)

/** plural / alternative spellings → the relation name */
export const RELATION_ALIASES: Record<string, string> = {
  'mother in law': 'mother-in-law',
  'father in law': 'father-in-law',
  'brother in law': 'brother-in-law',
  'sister in law': 'sister-in-law',
  'son in law': 'son-in-law',
  'daughter in law': 'daughter-in-law',
  husbands: 'husband',
  mum: 'mother',
  mom: 'mother',
  dad: 'father',
  papa: 'father',
  grandpa: 'grandfather',
  grandma: 'grandmother',
  'grand father': 'grandfather',
  'grand mother': 'grandmother',
  'grand son': 'grandson',
  'grand daughter': 'granddaughter',
}

export const relationGen = (rel: string): number => RELATIONS[rel].genDiff

/** does `x` stand in `rel` to `y`? (true / false, with the reason) */
export function holds(w: World, rel: string, x: number, y: number, nm: (i: number) => string = (i) => w.names[i]): string | null {
  const d = RELATIONS[rel]
  if (!d || x === y) return null
  if (d.gender && !gnd(w, x, d.gender)) return null
  return d.why(w, x, y, nm)
}

export function describeWorldRelation(rel: string, x: string, y: string): string {
  return `${x} is the ${rel} of ${y}`
}
