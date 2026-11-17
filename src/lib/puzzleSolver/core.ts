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
    return this.p.axis === 'floor' ? 'floor' : this.p.axis === 'order' ? (this.p.unit ?? 'position') : 'seat'
  }
  /** positions wrap round (a circular table) */
  get circular(): boolean {
    return this.p.axis === 'circle'
  }
  get onWord(): string {
    return this.p.axis === 'floor' ? 'on' : this.p.axis === 'order' ? (this.p.on ?? 'in') : 'at'
  }
  get named(): boolean {
    return this.p.axis === 'order' && !!this.p.labels
  }
  /** the number printed for a 0-based height (may fall outside 1..n for positions that do not exist) */
  posNum(f: number): number {
    return this.p.topDown ? this.n - f : f + 1
  }
  /** the position's own name: "3" for floor 3, "July" for a named month; positions outside the range are described, not numbered */
  posName(f: number): string {
    if (!this.named) return String(this.posNum(f))
    const labels = this.p.labels as string[]
    if (f < 0) return `the ${this.unit} before ${labels[0]}`
    if (f >= this.n) return `the ${this.unit} after ${labels[this.n - 1]}`
    return labels[f]
  }
  posLab(f: number): string {
    return this.named ? this.posName(f) : `${this.unit} ${this.posNum(f)}`
  }
  /** short tag for a position on the board */
  posShort(f: number): string {
    return this.named ? (this.p.labels as string[])[f].slice(0, 3) : String(this.posNum(f))
  }
  /** words for "higher / lower" along the axis */
  dirWord(hi: boolean): string {
    if (this.p.axis === 'order') return hi ? 'after' : 'before'
    return this.p.axis === 'floor' ? (hi ? 'above' : 'below') : hi ? 'to the right of' : 'to the left of'
  }
  get topWord(): string {
    return this.p.axis === 'floor' ? 'topmost floor' : this.p.axis === 'row' ? 'rightmost seat' : `last ${this.unit}`
  }
  get bottomWord(): string {
    return this.p.axis === 'floor' ? 'lowest floor' : this.p.axis === 'row' ? 'leftmost seat' : `first ${this.unit}`
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
    if (a === 1) return this.posShort(i)
    const vals = this.p.cats[a - 2].values
    for (let len = 2; len <= 5; len++) {
      const mine = vals[i].slice(0, len).toLowerCase()
      if (vals.every((v, k) => k === i || v.slice(0, len).toLowerCase() !== mine)) return vals[i].slice(0, len)
    }
    return vals[i]
  }

  /** where a person is, in the words of the puzzle: "A is on floor 3", "V was born in July" */
  private whereIs(i: number, f: number, negate: boolean): string {
    const who = this.lab(0, i)
    if (this.p.axis === 'order' && this.p.verb) {
      const verb = negate ? this.p.verb.replace(/^(\w+)/, '$1 not') : this.p.verb
      return `${who} ${verb} ${this.onWord} ${this.posLab(f)}`
    }
    return `${who} is${negate ? ' not' : ''} ${this.onWord} ${this.posLab(f)}`
  }

  /** "A is on floor 3", "A's city is Kolkata", "the city on floor 3 is Kolkata" */
  pair(a: number, i: number, b: number, j: number): string {
    if (a > b) return this.pair(b, j, a, i)
    if (a === 0 && b === 1) return this.whereIs(i, j, false)
    if (a === 0) return `${this.lab(0, i)}'s ${this.catName(b)} is ${this.lab(b, j)}`
    if (a === 1) return `${this.ofPersonAt(b, i)} is ${this.lab(b, j)}`
    return `the ${this.lab(a, i)} person's ${this.catName(b)} is ${this.lab(b, j)}`
  }
  /** "the city on floor 3", "the city of the person born in May" */
  private ofPersonAt(cat: number, f: number): string {
    if (!this.named) return `the ${this.catName(cat)} ${this.onWord} ${this.posLab(f)}`
    const participle = this.p.verb ? this.p.verb.replace(/^\w+\s+/, '') : ''
    return participle ? `the ${this.catName(cat)} of the person ${participle} ${this.onWord} ${this.posLab(f)}` : `the ${this.catName(cat)} for ${this.posLab(f)}`
  }
  notPair(a: number, i: number, b: number, j: number): string {
    if (a > b) return this.notPair(b, j, a, i)
    if (a === 0 && b === 1) return this.whereIs(i, j, true)
    if (a === 0) return `${this.lab(0, i)}'s ${this.catName(b)} is not ${this.lab(b, j)}`
    if (a === 1) return `${this.ofPersonAt(b, i)} is not ${this.lab(b, j)}`
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

  /** "floor 5", "floors 2–4", "floors 3, 5 and 8" — or "July", "May–July", "May, June and August" — for a mask of positions */
  fmtMask(mask: number): string {
    return this.fmtPositions(bits(mask))
  }
  /** the same for a list of 0-based positions */
  fmtPositions(fs: number[]): string {
    const sorted = [...fs].sort((x, y) => this.posNum(x) - this.posNum(y))
    if (sorted.length === 0) return `no ${this.unit}`
    const names = sorted.map((f) => (this.named ? this.posName(f) : String(this.posNum(f))))
    const consecutive = (k: number) => this.posNum(sorted[k + 1]) === this.posNum(sorted[k]) + 1
    const parts: string[] = []
    let s = 0
    while (s < sorted.length) {
      let e = s
      while (e + 1 < sorted.length && consecutive(e)) e++
      if (e - s >= 2) parts.push(`${names[s]}–${names[e]}`)
      else for (let k = s; k <= e; k++) parts.push(names[k])
      s = e + 1
    }
    const body = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
    if (this.named) return body
    return sorted.length === 1 ? `${this.unit} ${body}` : `${this.unit}s ${body}`
  }
  /** "floor 3 or 5", "seats 2 or 4", "May or July" */
  fmtOr(fs: number[]): string {
    const sorted = [...fs].sort((x, y) => this.posNum(x) - this.posNum(y))
    if (this.named) {
      const names = sorted.map((f) => this.posName(f))
      return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
    }
    return `${this.unit}${sorted.length > 1 ? 's' : ''} ${sorted.map((f) => this.posNum(f)).join(' or ')}`
  }

  /** description of a set of positions: "the topmost floor", "either the topmost or the lowest floor", "an odd-numbered floor" … */
  setDesc(fs: number[]): string {
    const n = this.n
    const s = [...new Set(fs)].sort((x, y) => x - y)
    // named positions: say both the role and the name, so "the last month" and "December" read the same
    const tag = (words: string) => (this.named ? `${words} (${this.fmtOr(s)})` : words)
    if (s.length === 1 && s[0] === n - 1) return tag(`the ${this.topWord}`)
    if (s.length === 1 && s[0] === 0) return tag(`the ${this.bottomWord}`)
    if (s.length === 2 && s[0] === 0 && s[1] === n - 1) {
      if (this.p.axis === 'order') return tag(`either the first or the last ${this.unit}`)
      return this.p.axis === 'floor' ? 'either the topmost or the lowest floor' : 'either the leftmost or the rightmost seat'
    }
    if (this.p.axis !== 'order') {
      const all = (par: number) => {
        const wanted: number[] = []
        for (let f = 0; f < n; f++) if (this.posNum(f) % 2 === par) wanted.push(f)
        return wanted.length === s.length && wanted.every((f) => s.includes(f))
      }
      if (s.length >= 2 && all(1)) return `an odd-numbered ${this.unit}`
      if (s.length >= 2 && all(0)) return `an even-numbered ${this.unit}`
    }
    if (!this.named) {
      const nums = s.map((f) => this.posNum(f)).sort((x, y) => x - y)
      return nums.length === 1 ? `${this.unit} ${nums[0]}` : `${this.unit} ${nums.slice(0, -1).join(', ')} or ${nums[nums.length - 1]}`
    }
    return this.fmtOr(s)
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
        let d = a.d
        if (this.circular) {
          d = ((d % this.n) + this.n) % this.n
          if (d * 2 === this.n) return `${L(a.x)} ${a.neg ? 'does not sit' : 'sits'} exactly opposite ${L(a.y)}`
          if (d * 2 > this.n) d -= this.n
        }
        const k = Math.abs(d)
        const how = k === 1 ? 'immediately ' : `exactly ${k} ${this.unit}s `
        return `${L(a.x)} is${not} ${how}${dir(d > 0)} ${L(a.y)}`
      }
      case 'rank':
        return `${L(a.x)} is${not} somewhere ${dir(a.hi)} ${L(a.y)}`
      case 'adj':
        return `${L(a.x)} and ${L(a.y)} are${not} on neighbouring ${this.unit}s`
      case 'gap':
        return a.neg
          ? `there are not exactly ${a.k} ${this.unit}s between ${L(a.x)} and ${L(a.y)}`
          : `exactly ${a.k} ${a.k === 1 ? 'person' : 'people'} between ${L(a.x)} and ${L(a.y)}${this.circular ? ' (on one side or the other)' : ''}`
      case 'btw':
        return `${L(a.x)} is${not} between ${L(a.y)} and ${L(a.z)}`
      case 'same':
        return `${a.neg ? 'not ' : ''}the same number of people between ${L(a.x)} and ${L(a.y)} as between ${L(a.z)} and ${L(a.w)}`
      case 'set':
        return `${L(a.x)} is${not} ${this.onWord} ${this.setDesc(a.fs)}`
      case 'logic': {
        const x = this.describeAtom(a.a)
        const y = this.describeAtom(a.b)
        return a.op === 'imp' ? `if ${x}, then ${y}` : a.op === 'xor' ? `either ${x}, or ${y}, but not both` : `${x}, or ${y}, or both`
      }
    }
  }
}

// ─── atoms as constraints over positions ─────────────────────────────────────

export function sameTerm(x: Term, y: Term): boolean {
  if (x.k !== y.k) return false
  if (x.k === 'p') return x.i === (y as typeof x).i
  if (x.k === 'f') return x.f === (y as typeof x).f
  const w = y as typeof x
  return x.c === w.c && x.i === w.i
}

/** The distinct terms an atom talks about, in a fixed order (the order its test reads its argument in). */
export function atomTerms(a: Atom): Term[] {
  switch (a.t) {
    case 'btw':
      return [a.x, a.y, a.z]
    case 'same':
      return [a.x, a.y, a.z, a.w]
    case 'set':
      return [a.x]
    case 'logic': {
      const out: Term[] = []
      for (const t of [...atomTerms(a.a), ...atomTerms(a.b)]) if (!out.some((u) => sameTerm(u, t))) out.push(t)
      return out
    }
    default:
      return [a.x, a.y]
  }
}

/**
 * The atom as a test on the 0-based positions of its terms (link atoms are handled by the grid, not by a position test).
 * On a circular table (`circ`) differences wrap round, so "opposite" is half-way and "neighbours" includes seat n next to seat 1.
 */
export function atomTest(a: Atom, n = 0, circ = false): (v: number[]) => boolean {
  const md = (x: number) => (circ ? ((x % n) + n) % n : x)
  let f: (v: number[]) => boolean
  switch (a.t) {
    case 'diff':
      f = (v) => md(v[0] - v[1]) === md(a.d)
      break
    case 'rank':
      f = (v) => (a.hi ? v[0] > v[1] : v[0] < v[1])
      break
    case 'adj':
      f = circ ? (v) => md(v[0] - v[1]) === 1 || md(v[0] - v[1]) === n - 1 : (v) => Math.abs(v[0] - v[1]) === 1
      break
    case 'gap':
      f = circ ? (v) => md(v[0] - v[1]) === a.k + 1 || md(v[0] - v[1]) === n - a.k - 1 : (v) => Math.abs(v[0] - v[1]) === a.k + 1
      break
    case 'btw':
      f = (v) => (v[1] < v[0] && v[0] < v[2]) || (v[2] < v[0] && v[0] < v[1])
      break
    case 'same':
      f = (v) => Math.abs(v[0] - v[1]) === Math.abs(v[2] - v[3]) && v[0] !== v[1] && v[2] !== v[3]
      break
    case 'set':
      f = (v) => a.fs.includes(v[0])
      break
    case 'logic': {
      const all = atomTerms(a)
      const at = atomTerms(a.a).map((t) => all.findIndex((u) => sameTerm(u, t)))
      const bt = atomTerms(a.b).map((t) => all.findIndex((u) => sameTerm(u, t)))
      const ta = atomTest(a.a, n, circ)
      const tb = atomTest(a.b, n, circ)
      f = (v) => {
        const x = ta(at.map((i) => v[i]))
        const y = tb(bt.map((i) => v[i]))
        return a.op === 'imp' ? !x || y : a.op === 'xor' ? x !== y : x || y
      }
      break
    }
    case 'link':
      // only reached inside a compound clue ("either Tina prefers Apple or …"): the same person ⇔ the same position
      f = (v) => v[0] === v[1]
      break
  }
  return a.neg ? (v) => !f(v) : f
}
