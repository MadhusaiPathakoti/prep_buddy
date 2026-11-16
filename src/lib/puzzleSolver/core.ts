// Shared plumbing for the Puzzle Solver engine: the candidate grid, bit-mask helpers, and every piece of wording
// (labels, "A is on floor 3", clue descriptions) so the engine and the UI always phrase things the same way.
import type { Atom, Puzzle, Term } from './types'

// ─── bit helpers ─────────────────────────────────────────────────────────────

export const pop = (m: number): number => {
  let c = 0
  while (m) {
    m &= m - 1
    c++
  }
  return c
}
export const ctz = (m: number): number => 31 - Math.clz32(m & -m)
export function bits(m: number): number[] {
  const out: number[] = []
  while (m) {
    const low = m & -m
    out.push(31 - Math.clz32(low))
    m ^= low
  }
  return out
}

// ─── candidate grid ──────────────────────────────────────────────────────────

/**
 * For every ordered pair of categories (a, b) and every item i of a, a bit-mask of the items of b that i may still be
 * matched with. Both directions are stored, so clearing one cell clears its mirror too.
 */
export class Grid {
  readonly n: number
  readonly K: number
  m: Uint16Array

  constructor(n: number, K: number, m?: Uint16Array) {
    this.n = n
    this.K = K
    this.m = m ?? new Uint16Array(K * K * n).fill((1 << n) - 1)
  }

  row(a: number, i: number, b: number): number {
    return this.m[(a * this.K + b) * this.n + i]
  }
  has(a: number, i: number, b: number, j: number): boolean {
    return ((this.row(a, i, b) >> j) & 1) === 1
  }
  clear(a: number, i: number, b: number, j: number): void {
    this.m[(a * this.K + b) * this.n + i] &= ~(1 << j)
    this.m[(b * this.K + a) * this.n + j] &= ~(1 << i)
  }
  clone(): Grid {
    return new Grid(this.n, this.K, this.m.slice())
  }
  snapshot(): Uint16Array {
    return this.m.slice()
  }
  static from(snapshot: Uint16Array, n: number, K: number): Grid {
    return new Grid(n, K, snapshot.slice())
  }
}

export const cellKey = (a: number, i: number, b: number, j: number): string => (a < b ? `${a}.${i}.${b}.${j}` : `${b}.${j}.${a}.${i}`)

// ─── wording ─────────────────────────────────────────────────────────────────

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
export const numWord = (k: number): string => NUMBER_WORDS[k] ?? String(k)

export class Ctx {
  readonly p: Puzzle
  readonly n: number
  readonly K: number
  constructor(p: Puzzle) {
    this.p = p
    this.n = p.n
    this.K = 2 + p.cats.length
  }

  get unit(): string {
    return this.p.axis === 'floor' ? 'floor' : 'seat'
  }
  get onWord(): string {
    return this.p.axis === 'floor' ? 'on' : 'at'
  }
  /** the number printed for a 0-based height (may fall outside 1..n for positions that do not exist) */
  posNum(f: number): number {
    return this.p.topDown ? this.n - f : f + 1
  }
  posLab(f: number): string {
    return `${this.unit} ${this.posNum(f)}`
  }
  /** words for "higher / lower" along the axis */
  dirWord(hi: boolean): string {
    return this.p.axis === 'floor' ? (hi ? 'above' : 'below') : hi ? 'to the right of' : 'to the left of'
  }
  get topWord(): string {
    return this.p.axis === 'floor' ? 'topmost floor' : 'rightmost seat'
  }
  get bottomWord(): string {
    return this.p.axis === 'floor' ? 'lowest floor' : 'leftmost seat'
  }

  catName(a: number): string {
    return a === 0 ? 'person' : a === 1 ? this.unit : this.p.cats[a - 2].name
  }
  lab(a: number, i: number): string {
    return a === 0 ? this.p.people[i] : a === 1 ? this.posLab(i) : this.p.cats[a - 2].values[i]
  }
  /** short chip text: people and floors as they are, long values abbreviated */
  shortLab(a: number, i: number): string {
    if (a === 0) return this.p.people[i]
    if (a === 1) return String(this.posNum(i))
    const vals = this.p.cats[a - 2].values
    for (let len = 2; len <= 5; len++) {
      const mine = vals[i].slice(0, len).toLowerCase()
      if (vals.every((v, k) => k === i || v.slice(0, len).toLowerCase() !== mine)) return vals[i].slice(0, len)
    }
    return vals[i]
  }

  /** "A is on floor 3", "A's city is Kolkata", "the city on floor 3 is Kolkata" */
  pair(a: number, i: number, b: number, j: number): string {
    if (a > b) return this.pair(b, j, a, i)
    if (a === 0 && b === 1) return `${this.lab(0, i)} is ${this.onWord} ${this.lab(1, j)}`
    if (a === 0) return `${this.lab(0, i)}'s ${this.catName(b)} is ${this.lab(b, j)}`
    if (a === 1) return `the ${this.catName(b)} ${this.onWord} ${this.lab(1, i)} is ${this.lab(b, j)}`
    return `the ${this.lab(a, i)} person's ${this.catName(b)} is ${this.lab(b, j)}`
  }
  notPair(a: number, i: number, b: number, j: number): string {
    if (a > b) return this.notPair(b, j, a, i)
    if (a === 0 && b === 1) return `${this.lab(0, i)} is not ${this.onWord} ${this.lab(1, j)}`
    if (a === 0) return `${this.lab(0, i)}'s ${this.catName(b)} is not ${this.lab(b, j)}`
    if (a === 1) return `the ${this.catName(b)} ${this.onWord} ${this.lab(1, i)} is not ${this.lab(b, j)}`
    return `the ${this.lab(a, i)} person's ${this.catName(b)} is not ${this.lab(b, j)}`
  }

  termCat(t: Term): number {
    return t.k === 'p' ? 0 : t.k === 'f' ? 1 : 2 + t.c
  }
  termIdx(t: Term): number {
    return t.k === 'p' ? t.i : t.k === 'f' ? t.f : t.i
  }
  termLabel(t: Term): string {
    if (t.k === 'p') return this.p.people[t.i]
    if (t.k === 'f') return this.posLab(t.f)
    return `the ${this.p.cats[t.c].values[t.i]} person`
  }

  /** "floor 5", "floors 2–4", "floors 3, 5 and 8" for a mask of positions */
  fmtMask(mask: number): string {
    const nums = bits(mask)
      .map((f) => this.posNum(f))
      .sort((x, y) => x - y)
    return this.fmtNums(nums)
  }
  fmtNums(nums: number[]): string {
    if (nums.length === 0) return `no ${this.unit}`
    const parts: string[] = []
    let s = 0
    while (s < nums.length) {
      let e = s
      while (e + 1 < nums.length && nums[e + 1] === nums[e] + 1) e++
      if (e - s >= 2) parts.push(`${nums[s]}–${nums[e]}`)
      else for (let k = s; k <= e; k++) parts.push(String(nums[k]))
      s = e + 1
    }
    const body = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
    return nums.length === 1 ? `${this.unit} ${body}` : `${this.unit}s ${body}`
  }

  /** description of a set of positions: "the topmost floor", "either the topmost or the lowest floor", "an odd-numbered floor" … */
  setDesc(fs: number[]): string {
    const n = this.n
    const s = [...new Set(fs)].sort((x, y) => x - y)
    if (s.length === 1 && s[0] === n - 1) return `the ${this.topWord}`
    if (s.length === 1 && s[0] === 0) return `the ${this.bottomWord}`
    if (s.length === 2 && s[0] === 0 && s[1] === n - 1) {
      return this.p.axis === 'floor' ? 'either the topmost or the lowest floor' : 'either the leftmost or the rightmost seat'
    }
    const nums = s.map((f) => this.posNum(f)).sort((x, y) => x - y)
    const all = (par: number) => {
      const wanted: number[] = []
      for (let f = 0; f < n; f++) if (this.posNum(f) % 2 === par) wanted.push(f)
      return wanted.length === s.length && wanted.every((f) => s.includes(f))
    }
    if (s.length >= 2 && all(1)) return `an odd-numbered ${this.unit}`
    if (s.length >= 2 && all(0)) return `an even-numbered ${this.unit}`
    if (nums.length === 1) return `${this.unit} ${nums[0]}`
    return `${this.unit} ${nums.slice(0, -1).join(', ')} or ${nums[nums.length - 1]}`
  }

  /** The clue atom, in plain English. */
  describeAtom(a: Atom): string {
    const L = (t: Term) => this.termLabel(t)
    const not = a.neg ? ' not' : ''
    const dir = (hi: boolean) => this.dirWord(hi)
    switch (a.t) {
      case 'link': {
        const ca = this.termCat(a.x)
        const cb = this.termCat(a.y)
        const ia = this.termIdx(a.x)
        const ib = this.termIdx(a.y)
        return a.neg ? this.notPair(ca, ia, cb, ib) : this.pair(ca, ia, cb, ib)
      }
      case 'diff': {
        const k = Math.abs(a.d)
        const hi = a.d > 0
        const how = k === 1 ? 'immediately ' : `exactly ${k} ${this.unit}s `
        return `${L(a.x)} is${not} ${how}${dir(hi)} ${L(a.y)}`
      }
      case 'rank':
        return `${L(a.x)} is${not} somewhere ${dir(a.hi)} ${L(a.y)}`
      case 'adj':
        return `${L(a.x)} and ${L(a.y)} are${not} on neighbouring ${this.unit}s`
      case 'gap':
        return a.neg
          ? `there are not exactly ${a.k} ${this.unit}s between ${L(a.x)} and ${L(a.y)}`
          : `exactly ${a.k} ${a.k === 1 ? 'person' : 'people'} between ${L(a.x)} and ${L(a.y)}`
      case 'btw':
        return `${L(a.x)} is${not} between ${L(a.y)} and ${L(a.z)}`
      case 'set':
        return `${L(a.x)} is${not} ${this.onWord} ${this.setDesc(a.fs)}`
    }
  }
}

// ─── atoms as constraints over positions ─────────────────────────────────────

export function atomTerms(a: Atom): Term[] {
  switch (a.t) {
    case 'btw':
      return [a.x, a.y, a.z]
    case 'set':
      return [a.x]
    default:
      return [a.x, a.y]
  }
}

/** The atom as a test on the 0-based heights of its terms (link atoms are handled by the grid, not by a position test). */
export function atomTest(a: Atom): (v: number[]) => boolean {
  let f: (v: number[]) => boolean
  switch (a.t) {
    case 'diff':
      f = (v) => v[0] - v[1] === a.d
      break
    case 'rank':
      f = (v) => (a.hi ? v[0] > v[1] : v[0] < v[1])
      break
    case 'adj':
      f = (v) => Math.abs(v[0] - v[1]) === 1
      break
    case 'gap':
      f = (v) => Math.abs(v[0] - v[1]) === a.k + 1
      break
    case 'btw':
      f = (v) => (v[1] < v[0] && v[0] < v[2]) || (v[2] < v[0] && v[0] < v[1])
      break
    case 'set':
      f = (v) => a.fs.includes(v[0])
      break
    case 'link':
      f = () => true
      break
  }
  return a.neg && a.t !== 'link' ? (v) => !f(v) : f
}
