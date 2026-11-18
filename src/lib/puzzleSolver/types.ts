// Data model for the Puzzle Solver: a "linear arrangement + attributes" puzzle (people on floors / seats in a row, each
// with one value from every extra category such as city, colour, profession).
//
// Positions are floors (bottom to top), seats in a row, named ordered slots (months, days) or the seats of a circular table
// (axis 'circle': positions wrap round, and index + 1 is always the seat on a person's right).
//
// Internally every such puzzle is a logic grid over categories
//     0 = people, 1 = positions (floors / seats), 2.. = the extra categories,
// with a bijection between every pair of categories. A clue is a list of atoms over "terms": a person, a value of
// one category ("the person from Bhopal") or a fixed position.

export type Axis = 'floor' | 'row' | 'order' | 'circle' | 'grid' | 'tworow'

export type Term =
  | { k: 'p'; i: number } // person i
  | { k: 'v'; c: number; i: number } // value i of extra category c ("the person from Bhopal")
  | { k: 'f'; f: number } // a fixed position, 0-based height (0 = lowest floor / leftmost seat)
  // a person described by where they stand relative to someone: "the one who stands third to the right of A" (shift d, within the
  // row) or "the one who faces E" (op 'opp', the seat across). Its position is computed from the base term's position.
  | { k: 'r'; base: Term; op: 'shift' | 'opp'; d: number }

/** a term that is a real unknown (a person, a value, a fixed seat) — as opposed to a derived one */
export type VarTerm = Exclude<Term, { k: 'r' }>

/** the way a person faces (0 = north, 1 = south): an extra unknown of clues that depend on facing */
export type DirTerm = { k: 'd'; of: VarTerm }

export type Atom =
  | { t: 'link'; x: VarTerm; y: VarTerm; neg?: boolean } // x and y are the same person ("A is from Kolkata")
  // `ref`: people face north or south, and left / right are as seen by y (a south-facing y has its left to the east)
  | { t: 'diff'; x: Term; y: Term; d: number; ref?: boolean; neg?: boolean } // pos(x) - pos(y) = d   (immediately above: d = 1)
  | { t: 'rank'; x: Term; y: Term; hi: boolean; ref?: boolean; neg?: boolean } // pos(x) > pos(y) when hi, else <   (somewhere above / below)
  | { t: 'adj'; x: Term; y: Term; neg?: boolean } // neighbouring positions
  | { t: 'gap'; x: Term; y: Term; k: number; neg?: boolean } // exactly k positions strictly between x and y
  | { t: 'same'; x: Term; y: Term; z: Term; w: Term; neg?: boolean } // as many people between x and y as between z and w
  // a building with several flats per floor: how x's flat compares with y's, floor-wise and flat-wise (gt = above / further east)
  | { t: 'grid'; x: Term; y: Term; row?: GridRel; col?: GridRel; rowDiff?: number; neg?: boolean }
  | { t: 'btw'; x: Term; y: Term; z: Term; neg?: boolean } // x strictly between y and z (either way round)
  | { t: 'set'; x: Term; fs: number[]; neg?: boolean } // pos(x) is one of fs (or none of them when neg)
  // compound clues: "if a then b", "either a or b but not both", "either a or b"
  | { t: 'logic'; op: 'imp' | 'xor' | 'or'; a: Atom; b: Atom; neg?: boolean }
  // two parallel rows facing each other: x faces y (the seat across the gap); x and y are in the same row
  | { t: 'opp'; x: Term; y: Term; neg?: boolean }
  | { t: 'samerow'; x: Term; y: Term; neg?: boolean }
  // "the number of persons to the left of x is the same as the number to the right of y" (side 'l' = left of, 'r' = right of)
  | { t: 'cnt'; x: Term; xs: 'l' | 'r'; y: Term; ys: 'l' | 'r'; neg?: boolean }
  // x and y face the same direction (north / south)
  | { t: 'sdir'; x: VarTerm; y: VarTerm; neg?: boolean }

export type GridRel = 'gt' | 'lt' | 'eq' | 'ne'

export interface Clue {
  id: number // 1-based, in reading order
  text: string // the sentence as the user wrote it
  atoms: Atom[] // what the parser understood it to say (all must hold)
}

export interface Category {
  name: string // "city"
  values: string[]
}

export interface Puzzle {
  n: number
  axis: Axis
  /** floors are numbered from the top (1 = topmost) instead of from the bottom */
  topDown: boolean
  people: string[]
  cats: Category[]
  clues: Clue[]
  /** axis 'order' only: the named positions from first to last (months, weekdays ...) */
  labels?: string[]
  /** axis 'order' only: the noun for one position ("month") and the word used with it ("in July" / "on Monday") */
  unit?: string
  on?: string
  /** axis 'order' only: how the text says it, singular ("was born") */
  verb?: string
  /** what the people are ("box"; default "person") and, for a vertical stack, what a position is called ("place"; default "floor") */
  noun?: string
  place?: string
  /** axis 'grid' only: flats per floor, and their letters from west to east (positions are floor-major: index = floor * cols + flat) */
  cols?: number
  flats?: string[]
  /** axis 'tworow' only: people per row; positions 0..m-1 are row 1, m..2m-1 row 2, each counted from that row's own left */
  rowLen?: number
  /** a line of people some of whom face north and some south: index (within `cats`) of the category 'direction' (values north, south) */
  dirCat?: number
  /**
   * axis 'circle' only: a square table with 8 seats — corners (even seats 0, 2, 4, 6) face outside, the middles of the sides
   * (odd seats) face the centre — so "to the right of" depends on where the person it is said of sits.
   */
  square?: boolean
  /** such a table with corners and sides (square, pentagon-shaped …): its name, and whether the people at the corners face the centre (the people on the sides face the other way) */
  shape?: string
  cornersIn?: boolean
  /** axis 'circle' only: everyone faces the same way, so "to the right of" is always the next seat along; this says which way that is drawn */
  facing?: 'in' | 'out'
}

/** One complete arrangement. pos[p] = 0-based height of person p; val[c][p] = value index of person p in extra category c. */
export interface Solution {
  pos: number[]
  val: number[][]
}

export const MAX_N = 12
