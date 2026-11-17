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

export type Axis = 'floor' | 'row' | 'order' | 'circle'

export type Term =
  | { k: 'p'; i: number } // person i
  | { k: 'v'; c: number; i: number } // value i of extra category c ("the person from Bhopal")
  | { k: 'f'; f: number } // a fixed position, 0-based height (0 = lowest floor / leftmost seat)

export type Atom =
  | { t: 'link'; x: Term; y: Term; neg?: boolean } // x and y are the same person ("A is from Kolkata")
  | { t: 'diff'; x: Term; y: Term; d: number; neg?: boolean } // pos(x) - pos(y) = d   (immediately above: d = 1)
  | { t: 'rank'; x: Term; y: Term; hi: boolean; neg?: boolean } // pos(x) > pos(y) when hi, else <   (somewhere above / below)
  | { t: 'adj'; x: Term; y: Term; neg?: boolean } // neighbouring positions
  | { t: 'gap'; x: Term; y: Term; k: number; neg?: boolean } // exactly k positions strictly between x and y
  | { t: 'same'; x: Term; y: Term; z: Term; w: Term; neg?: boolean } // as many people between x and y as between z and w
  | { t: 'btw'; x: Term; y: Term; z: Term; neg?: boolean } // x strictly between y and z (either way round)
  | { t: 'set'; x: Term; fs: number[]; neg?: boolean } // pos(x) is one of fs (or none of them when neg)
  // compound clues: "if a then b", "either a or b but not both", "either a or b"
  | { t: 'logic'; op: 'imp' | 'xor' | 'or'; a: Atom; b: Atom; neg?: boolean }

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
  /** axis 'circle' only: everyone faces the same way, so "to the right of" is always the next seat along; this says which way that is drawn */
  facing?: 'in' | 'out'
}

/** One complete arrangement. pos[p] = 0-based height of person p; val[c][p] = value index of person p in extra category c. */
export interface Solution {
  pos: number[]
  val: number[][]
}

export const MAX_N = 10
