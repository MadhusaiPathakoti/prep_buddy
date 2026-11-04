// Themes and natural-language rendering (IBPS-style phrasing) for arrangement atoms.
import { cap, NUMW, ORD, article } from './common'
import { grpSize, type Atom, type Geometry, type Item } from './arrange'

export interface AttrPool {
  key: string
  noun: string
  values: string[]
  yes: (v: string) => string
  no: (v: string) => string
  ref: (v: string) => string
  ask: (subj: string) => string
  intro: (vals: string[]) => string
}

const list = (vals: string[]) => vals.join(', ')

export const PERSON_POOLS: AttrPool[] = [
  {
    key: 'colour', noun: 'colour',
    values: ['Red', 'Blue', 'Green', 'Yellow', 'Pink', 'White', 'Black', 'Orange', 'Violet', 'Grey', 'Brown', 'Purple'],
    yes: (v) => `likes ${v}`, no: (v) => `does not like ${v}`, ref: (v) => `the person who likes ${v}`,
    ask: (s) => `Which colour does ${s} like?`,
    intro: (vals) => `Each of them likes a different colour - ${list(vals)} (not necessarily in the same order).`,
  },
  {
    key: 'city', noun: 'city',
    values: ['Delhi', 'Mumbai', 'Chennai', 'Kolkata', 'Pune', 'Jaipur', 'Lucknow', 'Bhopal', 'Patna', 'Surat', 'Indore', 'Nagpur'],
    yes: (v) => `is from ${v}`, no: (v) => `is not from ${v}`, ref: (v) => `the person from ${v}`,
    ask: (s) => `Which city is ${s} from?`,
    intro: (vals) => `Each of them is from a different city - ${list(vals)} (not necessarily in the same order).`,
  },
  {
    key: 'profession', noun: 'profession',
    values: ['Doctor', 'Engineer', 'Teacher', 'Lawyer', 'Pilot', 'Banker', 'Chef', 'Architect', 'Writer', 'Dancer', 'Designer', 'Pharmacist'],
    yes: (v) => `is ${article(v)} ${v}`, no: (v) => `is not ${article(v)} ${v}`, ref: (v) => `the ${v}`,
    ask: (s) => `What is the profession of ${s}?`,
    intro: (vals) => `Each of them has a different profession - ${list(vals)} (not necessarily in the same order).`,
  },
  {
    key: 'subject', noun: 'subject',
    values: ['Physics', 'Chemistry', 'Maths', 'Biology', 'History', 'Geography', 'Economics', 'Hindi', 'English', 'Sanskrit', 'Law', 'Commerce'],
    yes: (v) => `studies ${v}`, no: (v) => `does not study ${v}`, ref: (v) => `the person who studies ${v}`,
    ask: (s) => `Which subject does ${s} study?`,
    intro: (vals) => `Each of them studies a different subject - ${list(vals)} (not necessarily in the same order).`,
  },
  {
    key: 'sport', noun: 'game',
    values: ['Cricket', 'Football', 'Hockey', 'Tennis', 'Chess', 'Kabaddi', 'Badminton', 'Golf', 'Squash', 'Boxing', 'Archery', 'Polo'],
    yes: (v) => `plays ${v}`, no: (v) => `does not play ${v}`, ref: (v) => `the person who plays ${v}`,
    ask: (s) => `Which game does ${s} play?`,
    intro: (vals) => `Each of them plays a different game - ${list(vals)} (not necessarily in the same order).`,
  },
  {
    key: 'fruit', noun: 'fruit',
    values: ['Apple', 'Mango', 'Grapes', 'Banana', 'Papaya', 'Guava', 'Pear', 'Plum', 'Cherry', 'Melon', 'Lemon', 'Peach'],
    yes: (v) => `prefers ${v}`, no: (v) => `does not prefer ${v}`, ref: (v) => `the person who prefers ${v}`,
    ask: (s) => `Which fruit does ${s} prefer?`,
    intro: (vals) => `Each of them prefers a different fruit - ${list(vals)} (not necessarily in the same order).`,
  },
]

export const BOX_POOLS: AttrPool[] = [
  {
    key: 'colour', noun: 'colour',
    values: ['Red', 'Blue', 'Green', 'Yellow', 'Pink', 'White', 'Black', 'Orange', 'Violet', 'Grey', 'Brown', 'Purple'],
    yes: (v) => `is ${v}`, no: (v) => `is not ${v}`, ref: (v) => `the ${v} box`,
    ask: (s) => `What is the colour of ${s}?`,
    intro: (vals) => `Each box is of a different colour - ${list(vals)} (not necessarily in the same order).`,
  },
  {
    key: 'item', noun: 'item',
    values: ['Pen', 'Book', 'Ball', 'Comb', 'Key', 'Coin', 'Cup', 'Clip', 'Watch', 'Ring', 'Brush', 'Lamp'],
    yes: (v) => `contains ${v}`, no: (v) => `does not contain ${v}`, ref: (v) => `the box that contains ${v}`,
    ask: (s) => `What does ${s} contain?`,
    intro: (vals) => `Each box contains a different item - ${list(vals)} (not necessarily in the same order).`,
  },
]

export interface SchedTheme {
  unit: string
  units: string
  yes: string
  no: string
  plural: string
  at: (label: string) => string
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export const SCHED_MONTH: SchedTheme = { unit: 'month', units: 'months', yes: 'was born', no: 'was not born', plural: 'were born', at: (l) => `in ${l}` }
export const SCHED_DAY: SchedTheme = {
  unit: 'day', units: 'days', yes: 'has an appointment', no: 'does not have an appointment', plural: 'have appointments', at: (l) => `on ${l}`,
}

export type ThemeKind = 'row' | 'tworow' | 'circle' | 'square' | 'floor' | 'schedule' | 'stack'

export interface Theme {
  kind: ThemeKind
  g: Geometry
  names: string[]
  /** text placed before a person name inside sentences (boxes: "box "). */
  prefix: string
  /** Noun used in question stems for the "who" slot ("Who", "Which box"). */
  who: string
  attrs: { pool: AttrPool; values: string[] }[]
  labels: string[]
  sched?: SchedTheme
}

export function itemText(th: Theme, it: Item): string {
  if (it[0] === 0) return th.prefix + th.names[it[1]]
  const a = th.attrs[it[0] - 1]
  return a.pool.ref(a.values[it[1]])
}

/** Plain option text of an item (a person's bare name or an attribute value). */
export function itemOption(th: Theme, it: Item): string {
  return it[0] === 0 ? th.names[it[1]] : th.attrs[it[0] - 1].values[it[1]]
}

interface Parts {
  subj: Item | null
  yes: string
  no: string
  whole?: string
}

function verbs(th: Theme): { y: string; n: string } {
  switch (th.kind) {
    case 'floor':
      return { y: 'lives', n: 'does not live' }
    case 'schedule':
      return { y: (th.sched as SchedTheme).yes, n: (th.sched as SchedTheme).no }
    case 'stack':
      return { y: 'is kept', n: 'is not kept' }
    default:
      return { y: 'sits', n: 'does not sit' }
  }
}

function mk(th: Theme, tail: string): { yes: string; no: string } {
  const v = verbs(th)
  return { yes: `${v.y} ${tail}`, no: `${v.n} ${tail}` }
}

export function offTail(th: Theme, d: number, Y: string): string {
  const k = Math.abs(d)
  switch (th.kind) {
    case 'floor':
      return `${k === 1 ? 'immediately' : `${NUMW[k]} floors`} ${d > 0 ? 'above' : 'below'} ${Y}`
    case 'schedule':
      return `${k === 1 ? 'immediately' : `${NUMW[k]} ${(th.sched as SchedTheme).units}`} ${d > 0 ? 'after' : 'before'} ${Y}`
    case 'stack':
      return `${k === 1 ? 'immediately' : `${NUMW[k]} places`} ${d > 0 ? 'above' : 'below'} ${Y}`
    default:
      return `${k === 1 ? `at the immediate ${d > 0 ? 'right' : 'left'} of` : `${ORD[k]} to the ${d > 0 ? 'right' : 'left'} of`} ${Y}`
  }
}

export function btwWhole(th: Theme, a: { k: number; side?: 1 | -1 }, X: string, Y: string): string {
  const k = a.k
  const one = k === 1
  let base: string
  switch (th.kind) {
    case 'floor':
      base = `${cap(NUMW[k])} ${one ? 'person lives' : 'persons live'} between ${X} and ${Y}`
      break
    case 'schedule': {
      const s = th.sched as SchedTheme
      base = `${cap(NUMW[k])} ${one ? `person ${s.yes}` : `persons ${s.plural}`} between ${X} and ${Y}`
      break
    }
    case 'stack':
      base = `${cap(NUMW[k])} ${one ? 'box is' : 'boxes are'} kept between ${X} and ${Y}`
      break
    default:
      base = `${cap(NUMW[k])} ${one ? 'person sits' : 'persons sit'} between ${X} and ${Y}`
  }
  if (th.g.kind === 'circle') base += ` when counted from the ${a.side === -1 ? 'left' : 'right'} of ${X}`
  return base
}

function parts(th: Theme, a: Atom, yText?: string): Parts {
  const g = th.g
  switch (a.t) {
    case 'eq': {
      // attribute link
      const [x, y] = a.x[0] === 0 || a.y[0] !== 0 ? [a.x, a.y] : [a.y, a.x]
      const ya = y[0] - 1
      const pool = th.attrs[ya].pool
      const val = th.attrs[ya].values[y[1]]
      return { subj: x, yes: pool.yes(val), no: pool.no(val) }
    }
    case 'off': {
      const t = mk(th, offTail(th, a.d, yText ?? itemText(th, a.y)))
      return { subj: a.x, ...t }
    }
    case 'lt': {
      const Y = yText ?? itemText(th, a.y)
      let tail: string
      if (th.kind === 'floor') tail = `somewhere below ${Y}`
      else if (th.kind === 'schedule') tail = `some time before ${Y}`
      else if (th.kind === 'stack') tail = `somewhere below ${Y} in the same stack`
      else tail = `somewhere to the left of ${Y}`
      return { subj: a.x, ...mk(th, tail) }
    }
    case 'adj': {
      const Y = yText ?? itemText(th, a.y)
      if (th.kind === 'floor') return { subj: a.x, yes: `lives adjacent to ${Y}`, no: `does not live adjacent to ${Y}` }
      if (th.kind === 'schedule') {
        const s = th.sched as SchedTheme
        return { subj: a.x, yes: `${s.yes} immediately before or after ${Y}`, no: `${s.no} immediately before or after ${Y}` }
      }
      if (th.kind === 'stack') return { subj: a.x, yes: `is kept adjacent to ${Y}`, no: `is not kept adjacent to ${Y}` }
      return { subj: a.x, yes: `is an immediate neighbour of ${Y}`, no: `is not an immediate neighbour of ${Y}` }
    }
    case 'btw':
      return { subj: null, yes: '', no: '', whole: btwWhole(th, a, itemText(th, a.x), itemText(th, a.y)) + '.' }
    case 'mid': {
      const t = mk(th, `between ${itemText(th, a.x)} and ${itemText(th, a.z)}`)
      return { subj: a.y, ...t }
    }
    case 'end': {
      switch (th.kind) {
        case 'floor':
          return { subj: a.x, yes: 'lives on either the topmost or the lowest floor', no: 'lives neither on the topmost nor on the lowest floor' }
        case 'schedule': {
          const s = th.sched as SchedTheme
          return { subj: a.x, yes: `${s.yes} in either the first or the last ${s.unit} of the list`, no: `${s.no} in either the first or the last ${s.unit} of the list` }
        }
        case 'stack':
          return { subj: a.x, yes: 'is kept at either the top or the bottom of its stack', no: 'is kept neither at the top nor at the bottom of its stack' }
        default:
          return { subj: a.x, yes: 'sits at one of the extreme ends of the row', no: 'does not sit at any of the extreme ends of the row' }
      }
    }
    case 'pos': {
      const n = grpSize(g)
      switch (th.kind) {
        case 'floor': {
          const tail = a.p === n - 1 ? 'on the topmost floor' : `on floor ${a.p + 1}`
          return { subj: a.x, ...mk(th, tail) }
        }
        case 'schedule': {
          const s = th.sched as SchedTheme
          const tail = s.at(th.labels[a.p])
          return { subj: a.x, ...mk(th, tail) }
        }
        case 'stack': {
          const of = (g.kind === 'stacks' && g.stacks === 1) ? 'the stack' : 'its stack'
          const tail = a.p === 0 ? `at the bottom of ${of}` : a.p === n - 1 ? `at the top of ${of}` : `${ORD[a.p + 1]} from the bottom of ${of}`
          return { subj: a.x, ...mk(th, tail) }
        }
        default: {
          const tail = a.p === 0 ? 'at the extreme left end' : a.p === n - 1 ? 'at the extreme right end' : `${ORD[a.p + 1]} from the left end`
          return { subj: a.x, ...mk(th, tail) }
        }
      }
    }
    case 'par':
      return { subj: a.x, yes: `lives on ${a.odd ? 'an odd' : 'an even'}-numbered floor`, no: `does not live on ${a.odd ? 'an odd' : 'an even'}-numbered floor` }
    case 'grp': {
      if (th.kind === 'stack') return { subj: a.x, yes: `is kept in stack ${a.g + 1}`, no: `is not kept in stack ${a.g + 1}` }
      return { subj: a.x, yes: `sits in row ${a.g + 1}`, no: `does not sit in row ${a.g + 1}` }
    }
    case 'same': {
      const Y = yText ?? itemText(th, a.y)
      if (th.kind === 'stack') return { subj: a.x, yes: `is kept in the same stack as ${Y}`, no: `is not kept in the same stack as ${Y}` }
      return { subj: a.x, yes: `sits in the same row as ${Y}`, no: `does not sit in the same row as ${Y}` }
    }
    case 'face': {
      const Y = yText ?? itemText(th, a.y)
      return { subj: a.x, yes: `faces ${Y}`, no: `does not face ${Y}` }
    }
    case 'opp': {
      const Y = yText ?? itemText(th, a.y)
      if (th.kind === 'square') return { subj: a.x, yes: `sits diagonally opposite to ${Y}`, no: `does not sit diagonally opposite to ${Y}` }
      return { subj: a.x, yes: `sits exactly opposite to ${Y}`, no: `does not sit exactly opposite to ${Y}` }
    }
    case 'corner':
      return { subj: a.x, yes: 'sits at a corner of the table', no: 'sits at the middle of a side of the table' }
    default:
      throw new Error(`parts: unsupported atom ${a.t}`)
  }
}

/** Verb phrase (without subject) of a simple atom whose subject is a placeholder; used by question stems. */
export function vpOf(th: Theme, a: Atom, yText?: string): string {
  return parts(th, a, yText).yes
}

export function clause(th: Theme, a: Atom, neg = false, capFirst = true): string {
  if (a.t === 'not') return clause(th, a.c, !neg, capFirst)
  if (a.t === 'or') return `Either ${clause(th, a.cs[0], false, false)} or ${clause(th, a.cs[1], false, false)}`
  if (a.t === 'and' && a.cs.length === 2 && a.cs[0].t === 'eq' && a.cs[1].t !== 'btw' && a.cs[1].t !== 'mid') {
    const p1 = parts(th, a.cs[0])
    const p2 = parts(th, a.cs[1])
    if (p1.subj && p2.subj && p1.subj[0] === p2.subj[0] && p1.subj[1] === p2.subj[1]) {
      const s = itemText(th, p1.subj)
      return `${capFirst ? cap(s) : s}, ${th.kind === 'stack' ? 'which' : 'who'} ${p1.yes}, ${p2.yes}`
    }
  }
  if (a.t === 'and') return a.cs.map((c, i) => clause(th, c, false, capFirst && i === 0)).join(' and ')
  const p = parts(th, a)
  if (p.whole !== undefined) return capFirst ? cap(p.whole) : p.whole.replace(/\.$/, '')
  const s = itemText(th, p.subj as Item)
  return `${capFirst ? cap(s) : s} ${neg ? p.no : p.yes}`
}

export function sentence(th: Theme, a: Atom): string {
  const c = clause(th, a)
  return c.endsWith('.') ? c : `${c}.`
}

// ---------------------------------------------------------------------------------------------
// Intro and final arrangement text
// ---------------------------------------------------------------------------------------------

function namesLine(names: string[]): string {
  return names.join(', ')
}

export function introText(th: Theme): string[] {
  const n = th.g.n
  const nw = cap(NUMW[n])
  const out: string[] = []
  const nm = namesLine(th.names)
  switch (th.kind) {
    case 'row':
      out.push(`${nw} persons - ${nm} - are sitting in a straight row, all of them facing north. (Left and right are as seen by the persons sitting in the row.)`)
      break
    case 'tworow': {
      const m = n / 2
      out.push(`${nw} persons - ${nm} - are sitting in two parallel rows containing ${NUMW[m]} persons each, in such a way that each person of one row faces a person of the other row. The persons of row 1 face south and the persons of row 2 face north. (Left and right of a person are with respect to the direction that person is facing.)`)
      break
    }
    case 'circle': {
      const inward = th.g.kind === 'circle' && th.g.facing === 'in'
      out.push(`${nw} persons - ${nm} - are sitting around a circular table, all of them facing ${inward ? 'the centre of the table' : 'outside (away from the centre)'}. (Left and right of a person are with respect to the direction that person is facing.)`)
      break
    }
    case 'square':
      out.push(`${nw} persons - ${nm} - are sitting around a square table in such a way that four of them sit at the four corners and the other four sit at the middle of each of the four sides. The persons sitting at the corners face outside (away from the centre), while the persons sitting at the middle of the sides face the centre. (Left and right of a person are with respect to the direction that person is facing.)`)
      break
    case 'floor':
      out.push(`${nw} persons - ${nm} - live on ${NUMW[n]} different floors of a building, such that the lowermost floor is numbered 1, the floor above it is numbered 2 and so on up to the topmost floor, which is numbered ${n}.`)
      break
    case 'schedule': {
      const s = th.sched as SchedTheme
      if (s.unit === 'month') out.push(`${nw} persons - ${nm} - were born in ${NUMW[n]} different months of the same year, from ${th.labels[0]} to ${th.labels[n - 1]} (not necessarily in the same order). Each person was born in one month only.`)
      else out.push(`${nw} persons - ${nm} - have appointments with a consultant on ${NUMW[n]} different days of the same week, from ${th.labels[0]} to ${th.labels[n - 1]} (not necessarily in the same order). Each person has an appointment on one day only.`)
      break
    }
    case 'stack': {
      const st = th.g.kind === 'stacks' ? th.g.stacks : 1
      if (st === 1) out.push(`${nw} boxes - ${nm} - are kept one above the other in a single vertical stack. (Position 1 is the bottom of the stack.)`)
      else out.push(`${nw} boxes - ${nm} - are kept in ${NUMW[st]} stacks (stack 1, stack 2${st === 3 ? ' and stack 3' : ''}), each stack having ${NUMW[n / st]} boxes kept one above the other.`)
      break
    }
  }
  for (const a of th.attrs) out.push(a.pool.intro(a.values))
  return out
}

function personWithAttrs(th: Theme, hidden: number[][], v: number): string {
  if (!th.attrs.length) return th.names[v]
  const vals = th.attrs.map((a, i) => a.values[invAt(hidden, i + 1, hidden[0][v])])
  return `${th.names[v]} (${vals.join(', ')})`
}

function invAt(hidden: number[][], a: number, p: number): number {
  return hidden[a].indexOf(p)
}

/** Full final arrangement in words, for the explanation. */
export function arrangementText(th: Theme, hidden: number[][]): string {
  const g = th.g
  const n = g.n
  const at = (p: number): string => personWithAttrs(th, hidden, hidden[0].indexOf(p))
  switch (th.kind) {
    case 'row':
      return `Final arrangement (left to right): ${Array.from({ length: n }, (_, p) => at(p)).join(', ')}.`
    case 'tworow': {
      const m = n / 2
      const r1 = Array.from({ length: m }, (_, i) => at(i))
      const r2 = Array.from({ length: m }, (_, i) => at(m + i))
      return `Final arrangement - Row 1 (facing south, listed from the left of the persons): ${r1.join(', ')}. Row 2 (facing north, listed from the left of the persons): ${r2.join(', ')}.`
    }
    case 'circle': {
      const inward = g.kind === 'circle' && g.facing === 'in'
      const order = Array.from({ length: n }, (_, i) => (inward ? (n - i) % n : i))
      return `Final arrangement (${inward ? 'facing the centre' : 'facing outside'}), in clockwise order: ${order.map(at).join(', ')}.`
    }
    case 'square': {
      const order = Array.from({ length: n }, (_, i) => (n - i) % n)
      return `Final arrangement (clockwise): ${order.map((p) => `${at(p)} [${p % 2 === 0 ? 'corner' : 'middle of side'}]`).join(', ')}.`
    }
    case 'floor':
      return `Final arrangement: ${Array.from({ length: n }, (_, i) => `Floor ${n - i}: ${at(n - 1 - i)}`).join('; ')}.`
    case 'schedule':
      return `Final arrangement: ${Array.from({ length: n }, (_, p) => `${th.labels[p]}: ${at(p)}`).join('; ')}.`
    case 'stack': {
      const st = g.kind === 'stacks' ? g.stacks : 1
      const h = n / st
      return `Final arrangement (bottom to top): ${Array.from({ length: st }, (_, s) => `${st === 1 ? 'Stack' : `Stack ${s + 1}`}: ${Array.from({ length: h }, (_, l) => at(s * h + l)).join(', ')}`).join('; ')}.`
    }
  }
}
