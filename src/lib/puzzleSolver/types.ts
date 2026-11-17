// Data model for the Puzzle Solver: a "linear arrangement + attributes" puzzle (people on floors / seats in a row, each
// with one value from every extra category such as city, colour, profession).
//
// Internally every such puzzle is a logic grid over categories
//     0 = people, 1 = positions (floors / seats), 2.. = the extra categories,
// with a bijection between every pair of categories. A clue is a list of atoms over "terms": a person, a value of
// one category ("the person from Bhopal") or a fixed position.

export type Axis = 'floor' | 'row' | 'order'

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
  | { t: 'btw'; x: Term; y: Term; z: Term; neg?: boolean } // x strictly between y and z (either way round)
  | { t: 'set'; x: Term; fs: number[]; neg?: boolean } // pos(x) is one of fs (or none of them when neg)

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
}

/** One complete arrangement. pos[p] = 0-based height of person p; val[c][p] = value index of person p in extra category c. */
export interface Solution {
  pos: number[]
  val: number[][]
}

export const MAX_N = 10
