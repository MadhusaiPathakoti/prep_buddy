// Shared plumbing for the Puzzle Solver engine: the candidate grid, bit-mask helpers, and every piece of wording
// (labels, "A is on floor 3", clue descriptions) so the engine and the UI always phrase things the same way.
import type { Atom, GridRel, Puzzle, Term, VarTerm, DirTerm } from './types'

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
  /** rows stored per table: the size of the largest category (n unless a category has more values than there are people) */
  readonly rows: number
  m: Uint16Array

  /** `sizes[c]`: how many values category c has (n unless it is a two-valued direction category) */
  constructor(n: number, K: number, m?: Uint16Array, sizes?: number[]) {
    this.n = n
    this.K = K
    this.rows = m ? m.length / (K * K) : Math.max(n, ...(sizes ?? []))
    if (m) this.m = m
    else {
      this.m = new Uint16Array(K * K * this.rows)
      for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) for (let i = 0; i < this.rows; i++) this.m[(a * K + b) * this.rows + i] = (1 << (sizes?.[b] ?? n)) - 1
    }
  }

  row(a: number, i: number, b: number): number {
    return this.m[(a * this.K + b) * this.rows + i]
  }
  has(a: number, i: number, b: number, j: number): boolean {
    return ((this.row(a, i, b) >> j) & 1) === 1
  }
  clear(a: number, i: number, b: number, j: number): void {
    this.m[(a * this.K + b) * this.rows + i] &= ~(1 << j)
    this.m[(b * this.K + a) * this.rows + j] &= ~(1 << i)
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

  /** a table with corners and sides: +1 when the people at the corners face the centre, -1 when they face outside, 0 otherwise */
  get cornerRight(): number {
    return this.p.square ? (this.p.cornersIn ? 1 : -1) : 0
  }
  get tableName(): string {
    return `${this.p.shape ?? 'square'} table`
  }
  /** category index of the facing direction (north / south) of a line of people who face either way, or -1 */
  get dirK(): number {
    return this.p.dirCat === undefined ? -1 : 2 + this.p.dirCat
  }
  isDir(c: number): boolean {
    return c === this.dirK
  }
  /** category index of the dates when some dates stay vacant (more dates than people), or -1 */
  get slotK(): number {
    return this.p.slotCat === undefined ? -1 : 2 + this.p.slotCat
  }
  isSlot(c: number): boolean {
    return c === this.slotK
  }
  get slotMode(): boolean {
    return this.p.slotCat !== undefined
  }
  /** a category that is not one-to-one with the people: a direction (shared) or a date (some stay unused) */
  isLoose(c: number): boolean {
    return this.isDir(c) || this.isSlot(c)
  }
  /** number of values of every category (a direction has two, the dates are as many as there are slots; everything else one per person) */
  get sizes(): number[] {
    return Array.from({ length: this.K }, (_, c) => (c === this.dirK ? 2 : c === this.slotK ? this.p.cats[c - 2].values.length : this.n))
  }

  /** what the people are: "person" or, say, "box" */
  get noun(): string {
    return this.p.noun ?? 'person'
  }
  get nouns(): string {
    const n = this.noun
    return n === 'person' ? 'people' : /(?:s|x|ch|sh)$/.test(n) ? `${n}es` : `${n}s`
  }
  get unit(): string {
    return this.p.axis === 'floor' ? (this.p.place ?? 'floor') : this.p.axis === 'order' ? (this.p.unit ?? 'position') : this.p.axis === 'grid' ? 'flat' : 'seat'
  }
  /** two parallel rows facing each other: positions 0..m-1 are row 1, m..2m-1 are row 2 (each counted from that row's own left) */
  get tworow(): boolean {
    return this.p.axis === 'tworow'
  }
  get rowLen(): number {
    return this.p.rowLen ?? this.n
  }
  /** which row (0 / 1) and which seat in the row (0 = the person's own left end) */
  rowIdx(f: number): number {
    return this.tworow ? Math.floor(f / this.rowLen) : 0
  }
  seatIdx(f: number): number {
    return this.tworow ? f % this.rowLen : f
  }
  /** the position `d` seats along from f within its row (to the right of the people for d > 0), or -1 when that is off the end */
  shiftPos(f: number, d: number): number {
    if (this.circular) return (((f + d) % this.n) + this.n) % this.n
    const j = this.seatIdx(f) + d
    return j < 0 || j >= this.rowLen ? -1 : this.rowIdx(f) * this.rowLen + j
  }
  /** a building with several flats per floor: position = floor * cols + flat (floor 0 = ground floor, flat 0 = westmost) */
  get grid(): boolean {
    return this.p.axis === 'grid'
  }
  get cols(): number {
    return this.p.cols ?? 1
  }
  rowOf(f: number): number {
    return Math.floor(f / this.cols)
  }
  flatLetter(f: number): string {
    const c = f % this.cols
    return this.p.flats?.[c] ?? String.fromCharCode(65 + c)
  }
  private cellName(f: number): string {
    return `flat ${this.flatLetter(f)} on floor ${this.rowOf(f) + 1}`
  }
  /** positions wrap round (a circular table) */
  get circular(): boolean {
    return this.p.axis === 'circle'
  }
  get onWord(): string {
    return this.p.axis === 'floor' ? (this.p.place ? 'in' : 'on') : this.p.axis === 'order' ? (this.p.on ?? 'in') : this.p.axis === 'grid' || this.p.axis === 'tworow' ? 'in' : 'at'
  }
  /** ordered slots that are (month, date) pairs: "April 11", "April 16", …; `cols` dates per month */
  get dated(): boolean {
    return this.p.axis === 'order' && !!this.p.cols && !!this.p.labels
  }
  /** a set of such slots described as whole months or a whole date: "in April or May", "on the 16th" (null when it is neither) */
  datedSet(fs: number[], slotLabels?: string[]): string | null {
    const cols = this.cols
    const labels = slotLabels ?? (this.p.labels as string[])
    const has = new Set(fs)
    const rows = Math.floor(labels.length / cols)
    const monthName = (r: number) => labels[r * cols].split(' ')[0]
    const full = Array.from({ length: rows }, (_, r) => r).filter((r) => Array.from({ length: cols }, (_, c) => r * cols + c).every((f) => has.has(f)))
    if (full.length && full.length * cols === has.size) return `in ${full.map(monthName).join(' or ')}`
    const dates = Array.from({ length: cols }, (_, c) => c).filter((c) => Array.from({ length: rows }, (_, r) => r * cols + c).every((f) => has.has(f)))
    const nth = (d: string) => {
      const k = Number(d)
      return `${k}${k % 100 >= 11 && k % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][k % 10 < 4 ? k % 10 : 0]}`
    }
    if (dates.length && dates.length * rows === has.size) return `on the ${dates.map((c) => nth(labels[c].split(' ')[1])).join(' or ')}`
    return null
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
    if (this.grid) return this.cellName(f)
    if (this.tworow) return `seat ${this.seatIdx(f) + 1} of row ${this.rowIdx(f) + 1}`
    if (!this.named) return String(this.posNum(f))
    const labels = this.p.labels as string[]
    if (f < 0) return `the ${this.unit} before ${labels[0]}`
    if (f >= this.n) return `the ${this.unit} after ${labels[this.n - 1]}`
    return labels[f]
  }
  posLab(f: number): string {
    if (this.p.square) return `seat ${f + 1} (${f % 2 === 0 ? 'a corner' : 'a side'})`
    if (this.grid) return this.cellName(f)
    if (this.tworow) return `seat ${this.seatIdx(f) + 1} of row ${this.rowIdx(f) + 1}`
    return this.named ? this.posName(f) : `${this.unit} ${this.posNum(f)}`
  }
  /** short tag for a position on the board */
  posShort(f: number): string {
    if (this.grid) return `${this.rowOf(f) + 1}${this.flatLetter(f)}`
    if (this.tworow) return `${this.rowIdx(f) + 1}.${this.seatIdx(f) + 1}`
    if (this.p.unordered) return (this.p.labels as string[])[f]
    if (this.dated) return (this.p.labels as string[])[f].replace(/^(\w{3})\w*/, '$1')
    return this.named ? (this.p.labels as string[])[f].slice(0, 3) : String(this.posNum(f))
  }
  /** words for "higher / lower" along the axis */
  dirWord(hi: boolean): string {
    if (this.p.axis === 'order') return hi ? 'after' : 'before'
    return this.p.axis === 'floor' ? (hi ? 'above' : 'below') : hi !== !!this.p.mirror ? 'to the right of' : 'to the left of'
  }
  get topWord(): string {
    return this.p.axis === 'floor' ? `topmost ${this.unit}` : this.p.axis === 'row' ? (this.p.mirror ? 'leftmost seat' : 'rightmost seat') : `last ${this.unit}`
  }
  get bottomWord(): string {
    return this.p.axis === 'floor' ? `lowest ${this.unit}` : this.p.axis === 'row' ? (this.p.mirror ? 'rightmost seat' : 'leftmost seat') : `first ${this.unit}`
  }

  catName(a: number): string {
    return a === 0 ? this.noun : a === 1 ? this.unit : this.p.cats[a - 2].name
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
    if (this.grid) return `${who} ${negate ? 'does not live' : 'lives'} in ${this.cellName(f)}`
    if (this.p.axis === 'order' && this.p.verb) {
      const base: Record<string, string> = { lives: 'live', stays: 'stay', works: 'work', studies: 'study', resides: 'reside' }
      const verb = negate ? (base[this.p.verb] ? `does not ${base[this.p.verb]}` : this.p.verb.replace(/^(\w+)/, '$1 not')) : this.p.verb
      return `${who} ${verb} ${this.onWord} ${this.posLab(f)}`
    }
    return `${who} is${negate ? ' not' : ''} ${this.onWord} ${this.posLab(f)}`
  }

  /** "A is on floor 3", "A's city is Kolkata", "the city on floor 3 is Kolkata" */
  pair(a: number, i: number, b: number, j: number): string {
    if (a > b) return this.pair(b, j, a, i)
    if (a === 0 && b === 1) return this.whereIs(i, j, false)
    if (a === 0 && this.isDir(b)) return `${this.lab(0, i)} faces ${this.lab(b, j)}`
    if (a === 1 && this.isDir(b)) return `the person in ${this.posLab(i)} faces ${this.lab(b, j)}`
    if (a === 0) return `${this.lab(0, i)}'s ${this.catName(b)} is ${this.lab(b, j)}`
    if (a === 1) return `${this.ofPersonAt(b, i)} is ${this.lab(b, j)}`
    return `the ${this.lab(a, i)} ${this.noun}'s ${this.catName(b)} is ${this.lab(b, j)}`
  }
  /** "the city on floor 3", "the city of the person born in May" */
  private ofPersonAt(cat: number, f: number): string {
    if (!this.named) return `the ${this.catName(cat)} ${this.onWord} ${this.posLab(f)}`
    const verb = this.p.verb ?? ''
    const participle = verb.includes(' ') ? verb.replace(/^\w+\s+/, '') : verb ? `who ${verb}` : ''
    return participle ? `the ${this.catName(cat)} of the person ${participle} ${this.onWord} ${this.posLab(f)}` : `the ${this.catName(cat)} for ${this.posLab(f)}`
  }
  notPair(a: number, i: number, b: number, j: number): string {
    if (a > b) return this.notPair(b, j, a, i)
    if (a === 0 && b === 1) return this.whereIs(i, j, true)
    if (a === 0 && this.isDir(b)) return `${this.lab(0, i)} does not face ${this.lab(b, j)}`
    if (a === 1 && this.isDir(b)) return `the person in ${this.posLab(i)} does not face ${this.lab(b, j)}`
    if (a === 0) return `${this.lab(0, i)}'s ${this.catName(b)} is not ${this.lab(b, j)}`
    if (a === 1) return `${this.ofPersonAt(b, i)} is not ${this.lab(b, j)}`
    return `the ${this.lab(a, i)} ${this.noun}'s ${this.catName(b)} is not ${this.lab(b, j)}`
  }

  termCat(t: VarTerm): number {
    return t.k === 'p' ? 0 : t.k === 'f' ? 1 : 2 + t.c
  }
  termIdx(t: VarTerm): number {
    return t.k === 'p' ? t.i : t.k === 'f' ? t.f : t.i
  }
  termLabel(t: Term): string {
    if (t.k === 'r') {
      const b = this.termLabel(t.base)
      if (t.op === 'opp') return `the one opposite ${b}`
      const k = Math.abs(t.d)
      return `the one ${k === 1 ? 'immediately ' : `${k} ${this.unit}s `}${this.dirWord(t.d > 0)} ${b}`
    }
    if (t.k === 'p') return this.p.people[t.i]
    if (t.k === 'f') return this.posLab(t.f)
    const cat = this.p.cats[t.c]
    if (cat.aliases) return `the person with ${cat.name} ${cat.values[t.i]}` // ranks and the like: "the person with rank III"
    // a profession is a person already: "the Fireman", not "the Fireman person"
    return /profession|occupation|designation|job/i.test(cat.name) ? `the ${cat.values[t.i]}` : `the ${cat.values[t.i]} ${this.noun}`
  }

  /** "floor 5", "floors 2–4", "floors 3, 5 and 8" — or "July", "May–July", "May, June and August" — for a mask of positions */
  fmtMask(mask: number): string {
    return this.fmtPositions(bits(mask))
  }
  /** the same for a list of 0-based positions */
  fmtPositions(fs: number[]): string {
    if (this.grid) return this.gridSetParts(fs).text
    if (this.tworow) return this.rowSetText(fs)
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
  /**
   * A set of cells of a building described the way a person would: whole floors ("floors 2 and 4", "an even-numbered floor"),
   * a whole flat letter ("flat A"), a single cell, or a list of cells — with the preposition that goes in front of it.
   */
  gridSetParts(fs: number[]): { prep: string; text: string } {
    const rows = this.n / this.cols
    const cells = [...new Set(fs)].sort((x, y) => x - y)
    const has = new Set(cells)
    const fullRows: number[] = []
    for (let r = 0; r < rows; r++) if (Array.from({ length: this.cols }, (_, c) => r * this.cols + c).every((f) => has.has(f))) fullRows.push(r)
    if (fullRows.length && fullRows.length * this.cols === cells.length) {
      const labels = fullRows.map((r) => r + 1)
      const all = Array.from({ length: rows }, (_, r) => r + 1)
      const same = (x: number[], y: number[]) => x.length === y.length && x.every((v) => y.includes(v))
      if (labels.length >= 2 && same(labels, all.filter((l) => l % 2 === 0))) return { prep: 'on', text: 'an even-numbered floor' }
      if (labels.length >= 2 && same(labels, all.filter((l) => l % 2 === 1))) return { prep: 'on', text: 'an odd-numbered floor' }
      if (labels.length === 1 && labels[0] === rows) return { prep: 'on', text: 'the top floor' }
      if (labels.length === 1 && labels[0] === 1) return { prep: 'on', text: 'the ground floor' }
      const list = labels.length === 1 ? `${labels[0]}` : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
      return { prep: 'on', text: `${labels.length === 1 ? 'floor' : 'floors'} ${list}` }
    }
    const fullCols: number[] = []
    for (let c = 0; c < this.cols; c++) if (Array.from({ length: rows }, (_, r) => r * this.cols + c).every((f) => has.has(f))) fullCols.push(c)
    if (fullCols.length && fullCols.length * rows === cells.length) {
      const names = fullCols.map((c) => this.p.flats?.[c] ?? String.fromCharCode(65 + c))
      return { prep: 'in', text: names.length === 1 ? `flat ${names[0]}` : `flats ${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` }
    }
    // several floors of one flat letter: "flat B on floors 1–3"
    if (cells.length > 1 && new Set(cells.map((f) => f % this.cols)).size === 1) {
      const floors = cells.map((f) => this.rowOf(f) + 1)
      const parts: string[] = []
      for (let i = 0; i < floors.length; ) {
        let e = i
        while (e + 1 < floors.length && floors[e + 1] === floors[e] + 1) e++
        if (e - i >= 2) parts.push(`${floors[i]}–${floors[e]}`)
        else for (let k = i; k <= e; k++) parts.push(String(floors[k]))
        i = e + 1
      }
      const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
      return { prep: 'in', text: `flat ${this.flatLetter(cells[0])} on floor${floors.length > 1 ? 's' : ''} ${list}` }
    }
    const names = cells.map((f) => this.cellName(f))
    return { prep: 'in', text: names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` }
  }

  /** the places a candidate mask still allows, with the right preposition: "on floors 2–4", "in flat B on floor 3", "in July" */
  maskPhrase(mask: number): string {
    return this.positionsPhrase(bits(mask))
  }
  /** the same for a list of positions */
  positionsPhrase(fs: number[]): string {
    if (this.grid) return this.setPhrase(fs)
    if (this.dated) return this.datedSet(fs) ?? `${this.onWord} ${this.fmtPositions(fs)}`
    return `${this.onWord} ${this.fmtPositions(fs)}`
  }

  /** "on floor 3", "in flat A", "on the topmost floor", "in May or July": a set of positions with the right preposition */
  setPhrase(fs: number[]): string {
    if (this.grid) {
      const p = this.gridSetParts(fs)
      return `${p.prep} ${p.text}`
    }
    if (this.dated) return this.datedSet(fs) ?? `${this.onWord} ${this.setDesc(fs)}`
    return `${this.onWord} ${this.setDesc(fs)}`
  }

  /** "floor 3 or 5", "seats 2 or 4", "May or July" */
  fmtOr(fs: number[]): string {
    if (this.grid) return this.gridSetParts(fs).text
    const sorted = [...fs].sort((x, y) => this.posNum(x) - this.posNum(y))
    if (this.named) {
      const names = sorted.map((f) => this.posName(f))
      return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
    }
    return `${this.unit}${sorted.length > 1 ? 's' : ''} ${sorted.map((f) => this.posNum(f)).join(' or ')}`
  }

  /** description of a set of positions: "the topmost floor", "either the topmost or the lowest floor", "an odd-numbered floor" … */
  /** a set of seats in a two-row layout: a whole row, "an end seat of its row", or the individual seats */
  rowSetText(fs: number[]): string {
    const m = this.rowLen
    const cells = [...new Set(fs)].sort((x, y) => x - y)
    const idx = (f: number) => this.seatIdx(f)
    const names = (list: number[]) => (list.length === 1 ? this.posLab(list[0]) : `${list.slice(0, -1).map((f) => this.posLab(f)).join(', ')} or ${this.posLab(list[list.length - 1])}`)
    if (cells.length === m && cells.every((f) => this.rowIdx(f) === this.rowIdx(cells[0]))) return `row ${this.rowIdx(cells[0]) + 1}`
    if (cells.length === 4 && cells.every((f) => idx(f) === 0 || idx(f) === m - 1)) return 'an end seat of a row'
    if (cells.length === 2 && cells.every((f) => idx(f) === 0)) return 'a left-end seat'
    if (cells.length === 2 && cells.every((f) => idx(f) === m - 1)) return 'a right-end seat'
    return names(cells)
  }

  setDesc(fs: number[]): string {
    if (this.grid) return this.gridSetParts(fs).text
    if (this.p.square) {
      const evens = fs.length > 0 && fs.every((f) => f % 2 === 0) && new Set(fs).size === this.n / 2
      const odds = fs.length > 0 && fs.every((f) => f % 2 === 1) && new Set(fs).size === this.n / 2
      if (evens) return 'a corner seat'
      if (odds) return 'a side seat (the middle of a side)'
    }
    if (this.tworow) return this.rowSetText(fs)
    const n = this.n
    const s = [...new Set(fs)].sort((x, y) => x - y)
    // named positions: say both the role and the name, so "the last month" and "December" read the same
    const tag = (words: string) => (this.named ? `${words} (${this.fmtOr(s)})` : words)
    if (s.length === 1 && s[0] === n - 1) return tag(`the ${this.topWord}`)
    if (s.length === 1 && s[0] === 0) return tag(`the ${this.bottomWord}`)
    if (s.length === 2 && s[0] === 0 && s[1] === n - 1) {
      if (this.p.axis === 'order') return tag(`either the first or the last ${this.unit}`)
      return this.p.axis === 'floor' ? `either the topmost or the lowest ${this.unit}` : 'either the leftmost or the rightmost seat'
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
        return `${L(a.x)} is${not} ${how}${dir(d > 0)} ${L(a.y)}${a.ref || this.p.square ? `, as seen by ${L(a.y)}` : ''}`
      }
      case 'rank':
        return `${L(a.x)} is${not} somewhere ${dir(a.hi)} ${L(a.y)}${a.ref ? `, as seen by ${L(a.y)}` : ''}`
      case 'sdir':
        return `${L(a.x)} and ${L(a.y)} ${a.neg ? 'face different directions' : 'face the same direction'}`
      case 'adj':
        return `${L(a.x)} and ${L(a.y)} are${not} on neighbouring ${this.unit}s`
      case 'gap':
        if (a.hi !== undefined && a.hi !== a.k) {
          const range = a.hi >= this.n - 2 ? `at least ${a.k}` : a.k === 0 ? `at most ${a.hi}` : `between ${a.k} and ${a.hi}`
          return `${a.neg ? 'not ' : ''}${range} ${this.nouns} between ${L(a.x)} and ${L(a.y)}`
        }
        return a.neg
          ? `there are not exactly ${a.k} ${this.unit}s between ${L(a.x)} and ${L(a.y)}`
          : `exactly ${a.k} ${a.k === 1 ? this.noun : this.nouns} between ${L(a.x)} and ${L(a.y)}${this.circular ? ' (on one side or the other)' : ''}`
      case 'btw':
        return `${L(a.x)} is${not} between ${L(a.y)} and ${L(a.z)}`
      case 'same':
        return `${a.neg ? 'not ' : ''}the same number of ${this.nouns} between ${L(a.x)} and ${L(a.y)} as between ${L(a.z)} and ${L(a.w)}`
      case 'set':
        if (a.on === 'slot') {
          const labels = this.p.cats[this.p.slotCat as number].values
          return `${L(a.x)} is${not} ${this.datedSet(a.fs, labels) ?? `on ${a.fs.length === 1 ? labels[a.fs[0]] : `${a.fs.slice(0, -1).map((f) => labels[f]).join(', ')} or ${labels[a.fs[a.fs.length - 1]]}`}`}`
        }
        return `${L(a.x)} is${not} ${this.setPhrase(a.fs)}`
      case 'opp':
        return a.neg ? `${L(a.x)} does not face ${L(a.y)}` : `${L(a.x)} faces ${L(a.y)}`
      case 'samerow':
        return `${L(a.x)} and ${L(a.y)} are${not} in the same row`
      case 'cnt': {
        const side = (s: 'l' | 'r') => this.dirWord(s === 'r')
        return `${a.neg ? 'not ' : ''}as many ${this.nouns} ${side(a.xs)} ${L(a.x)} as ${side(a.ys)} ${L(a.y)}`
      }
      case 'grid': {
        if (this.dated || this.slotMode) {
          const mo = a.row === 'eq' ? 'in the same month' : a.row === 'ne' ? 'in a different month' : ''
          const da = a.col === 'eq' ? 'on the same date' : a.col === 'ne' ? 'on a different date' : ''
          const both = da && mo ? `${da} as ${L(a.y)}, but ${mo}` : da ? `${da} as ${L(a.y)}` : `${mo} from ${L(a.y)}`.replace('same month from', 'same month as')
          return `${L(a.x)} is${not} ${both}`
        }
        const up = a.row === 'gt'
        const down = a.row === 'lt'
        const east = a.col === 'gt'
        const west = a.col === 'lt'
        let how: string
        if ((up || down) && (east || west)) how = `to the ${up ? 'north' : 'south'}-${east ? 'east' : 'west'} of`
        else if (up || down) {
          const step = a.rowDiff !== undefined ? (Math.abs(a.rowDiff) === 1 ? 'immediately ' : `exactly ${Math.abs(a.rowDiff)} floors `) : ''
          how = `${step}${up ? 'above' : 'below'}`
          if (a.col === 'eq') how += ', in the same lettered flat as'
          else if (a.col === 'ne') how += ', in a different lettered flat from'
        } else if (east || west) how = `${east ? 'east' : 'west'} of`
        else if (a.row === 'eq') how = a.col === 'eq' ? 'in the very same flat as' : 'on the same floor as'
        else if (a.row === 'ne') how = 'on a different floor from'
        else if (a.col === 'eq') how = 'in the same lettered flat as'
        else how = 'in a different lettered flat from'
        return `${L(a.x)} is${not} ${how} ${L(a.y)}`
      }
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
  if (x.k === 'r') {
    const w = y as typeof x
    return x.op === w.op && x.d === w.d && sameTerm(x.base, w.base)
  }
  const w = y as typeof x
  return x.c === w.c && x.i === w.i
}

/** the unknowns a (possibly derived) term depends on */
function termVars(t: Term): VarTerm[] {
  return t.k === 'r' ? termVars(t.base) : [t]
}

/** every term as written in the clue, derived ones included */
function writtenTerms(a: Atom): Term[] {
  switch (a.t) {
    case 'btw':
      return [a.x, a.y, a.z]
    case 'same':
      return [a.x, a.y, a.z, a.w]
    case 'set':
      return [a.x]
    case 'logic':
      return [...writtenTerms(a.a), ...writtenTerms(a.b)]
    default:
      return [a.x, a.y]
  }
}

/** The distinct unknowns an atom talks about, in a fixed order (the order its test reads its argument in). */
export function atomTerms(a: Atom): VarTerm[] {
  const out: VarTerm[] = []
  for (const t of writtenTerms(a)) for (const u of termVars(t)) if (!out.some((v) => sameTerm(v, u))) out.push(u)
  return out
}

/** the unknowns an atom's test reads: positions (atomTerms) plus, for clues about facing, the direction of a person */
export function atomVars(a: Atom): (VarTerm | DirTerm)[] {
  if (a.t === 'sdir') return [{ k: 'd', of: a.x }, { k: 'd', of: a.y }]
  // clues about dates: the unknown is the date slot of the person, not their place in the order
  if ((a.t === 'set' || a.t === 'grid') && a.on === 'slot') {
    const ts = a.t === 'set' ? [a.x] : [a.x, a.y]
    return ts.flatMap((t) => termVars(t)).map((u) => ({ k: 'd', of: u, slot: true }) as DirTerm)
  }
  const out: (VarTerm | DirTerm)[] = [...atomTerms(a)]
  const extra: DirTerm[] = []
  if ((a.t === 'diff' || a.t === 'rank') && a.ref) extra.push({ k: 'd', of: termVars(a.y)[0] })
  if (a.t === 'logic') for (const u of [...atomVars(a.a), ...atomVars(a.b)]) if (u.k === 'd') extra.push(u)
  for (const u of extra) if (!out.some((v) => sameVar(v, u))) out.push(u)
  return out
}

export function sameVar(u: VarTerm | DirTerm, t: Term | DirTerm): boolean {
  if (u.k === 'd' || t.k === 'd') return u.k === 'd' && t.k === 'd' && !!u.slot === !!t.slot && sameTerm(u.of, t.of)
  return sameTerm(u, t)
}

/** does the clue involve a derived person ("the one who faces E")? */
export function hasDerived(a: Atom): boolean {
  return writtenTerms(a).some((t) => t.k === 'r')
}

/**
 * The atom as a test on the 0-based positions of its unknowns (link atoms are handled by the grid, not by a position test).
 * `circ`: a round table (differences wrap); `cols`: flats per floor; `m`: people per row of a two-row layout (0 otherwise).
 */
/**
 * `sq`: a table with corners and sides — +1 when the people at the corners face the centre (their right is the next seat, anticlockwise),
 * -1 when they face outside; the people on the sides face the other way. 0 = no such table.
 */
export function atomTest(a: Atom, n = 0, circ = false, cols = 1, m = 0, sq = 0): (v: number[]) => boolean {
  const md = (x: number) => (circ ? ((x % n) + n) % n : x)
  // square table: a corner (even seat) faces outside, so its right is the previous seat; a side (odd seat) faces the centre
  const right = (seat: number) => (sq === 0 ? 1 : seat % 2 === 0 ? sq : -sq)
  const rowLen = m || n
  const rel = (r: GridRel | undefined, x: number, y: number) => r === undefined || (r === 'gt' ? x > y : r === 'lt' ? x < y : r === 'eq' ? x === y : x !== y)
  const vars = atomVars(a)
  const grp = (p: number) => (m ? Math.floor(p / m) : 0)
  const idx = (p: number) => (m ? p % m : p)
  /** position of a term (-1 when it describes someone who does not exist, e.g. "the one 3 seats right of" the last seat) */
  const getter = (t: Term | DirTerm): ((v: number[]) => number) => {
    if (t.k === 'r') {
      const b = getter(t.base)
      if (t.op === 'opp') return (v) => (b(v) < 0 || !m ? -1 : (1 - grp(b(v))) * m + (m - 1 - idx(b(v))))
      return (v) => {
        const p = b(v)
        if (p < 0) return -1
        if (circ) return (((p + t.d) % n) + n) % n
        const j = idx(p) + t.d
        return j < 0 || j >= rowLen ? -1 : grp(p) * rowLen + j
      }
    }
    if (t.k === 'f') {
      const f = t.f
      return () => f
    }
    const k = vars.findIndex((u) => sameVar(u, t))
    return (v) => v[k]
  }
  /** which way the person a term stands for faces (0 north, 1 south) */
  const dirOf = (t: Term): ((v: number[]) => number) => getter({ k: 'd', of: t as VarTerm })
  /** the date slot of the person a term stands for */
  const slotOf = (t: Term): ((v: number[]) => number) => getter({ k: 'd', of: t as VarTerm, slot: true })
  const onSlot = (a.t === 'set' || a.t === 'grid') && a.on === 'slot'
  const gx = a.t === 'logic' ? null : a.t === 'sdir' ? dirOf(a.x) : onSlot ? slotOf(a.x) : getter(a.x)
  const gy = a.t === 'logic' || a.t === 'set' ? null : a.t === 'sdir' ? dirOf(a.y) : onSlot ? slotOf(a.y) : getter(a.y)
  const gz = a.t === 'btw' ? getter(a.z) : null
  const gz2 = a.t === 'same' ? getter(a.z) : null
  const gw = a.t === 'same' ? getter(a.w) : null
  let f: (v: number[]) => boolean
  switch (a.t) {
    case 'diff':
      f = (v) => {
        const x = (gx as (v: number[]) => number)(v)
        const y = (gy as (v: number[]) => number)(v)
        if (x < 0 || y < 0) return false
        // facing south, a person's left is to the east: the same words mean the opposite way round
        const flip = a.ref && (dirOf(a.y) as (v: number[]) => number)(v) === 1 ? -1 : 1
        return circ ? md(x - y) === md(a.d * right(y)) : grp(x) === grp(y) && idx(x) - idx(y) === a.d * flip
      }
      break
    case 'rank':
      f = (v) => {
        const x = (gx as (v: number[]) => number)(v)
        const y = (gy as (v: number[]) => number)(v)
        if (x < 0 || y < 0 || grp(x) !== grp(y)) return false
        const flip = a.ref && (dirOf(a.y) as (v: number[]) => number)(v) === 1 ? -1 : 1
        return (a.hi ? 1 : -1) * flip * (idx(x) - idx(y)) > 0
      }
      break
    case 'adj':
      f = (v) => {
        const x = (gx as (v: number[]) => number)(v)
        const y = (gy as (v: number[]) => number)(v)
        if (x < 0 || y < 0) return false
        return circ ? md(x - y) === 1 || md(x - y) === n - 1 : grp(x) === grp(y) && Math.abs(idx(x) - idx(y)) === 1
      }
      break
    case 'gap':
      f = (v) => {
        const x = (gx as (v: number[]) => number)(v)
        const y = (gy as (v: number[]) => number)(v)
        if (x < 0 || y < 0) return false
        const hi = a.hi ?? a.k
        if (circ) return [...Array(hi - a.k + 1).keys()].some((q) => md(x - y) === a.k + q + 1 || md(x - y) === n - (a.k + q) - 1)
        const between = Math.abs(idx(x) - idx(y)) - 1
        return grp(x) === grp(y) && between >= a.k && between <= hi
      }
      break
    case 'btw':
      f = (v) => {
        const x = (gx as (v: number[]) => number)(v)
        const y = (gy as (v: number[]) => number)(v)
        const z = (gz as (v: number[]) => number)(v)
        if (x < 0 || y < 0 || z < 0 || grp(x) !== grp(y) || grp(x) !== grp(z)) return false
        return (idx(y) < idx(x) && idx(x) < idx(z)) || (idx(z) < idx(x) && idx(x) < idx(y))
      }
      break
    case 'same':
      f = (v) => {
        const x = (gx as (v: number[]) => number)(v)
        const y = (gy as (v: number[]) => number)(v)
        const z = (gz2 as (v: number[]) => number)(v)
        const w = (gw as (v: number[]) => number)(v)
        if (x < 0 || y < 0 || z < 0 || w < 0 || grp(x) !== grp(y) || grp(z) !== grp(w) || x === y || z === w) return false
        return Math.abs(idx(x) - idx(y)) === Math.abs(idx(z) - idx(w))
      }
      break
    case 'set':
      f = (v) => a.fs.includes((gx as (v: number[]) => number)(v))
      break
    case 'grid':
      f = (v) => {
        const x = (gx as (v: number[]) => number)(v)
        const y = (gy as (v: number[]) => number)(v)
        const rx = Math.floor(x / cols)
        const ry = Math.floor(y / cols)
        return rel(a.row, rx, ry) && rel(a.col, x % cols, y % cols) && (a.rowDiff === undefined || rx - ry === a.rowDiff)
      }
      break
    case 'sdir':
      f = (v) => (gx as (v: number[]) => number)(v) === (gy as (v: number[]) => number)(v)
      break
    case 'opp':
      f = (v) => {
        const x = (gx as (v: number[]) => number)(v)
        const y = (gy as (v: number[]) => number)(v)
        // square table: faces = across the table, and on a side (corners face outside, so they face nobody at the table)
        if (sq !== 0) return x >= 0 && y >= 0 && md(x - y) === n / 2 && x % 2 === (sq > 0 ? 0 : 1)
        return x >= 0 && y >= 0 && m > 0 && grp(x) !== grp(y) && idx(x) + idx(y) === m - 1
      }
      break
    case 'samerow':
      f = (v) => {
        const x = (gx as (v: number[]) => number)(v)
        const y = (gy as (v: number[]) => number)(v)
        return x >= 0 && y >= 0 && grp(x) === grp(y)
      }
      break
    case 'cnt':
      f = (v) => {
        const x = (gx as (v: number[]) => number)(v)
        const y = (gy as (v: number[]) => number)(v)
        if (x < 0 || y < 0) return false
        const side = (p: number, s: 'l' | 'r') => (s === 'l' ? idx(p) : rowLen - 1 - idx(p))
        return side(x, a.xs) === side(y, a.ys)
      }
      break
    case 'logic': {
      const all = vars
      const at = atomVars(a.a).map((t) => all.findIndex((u) => sameVar(u, t)))
      const bt = atomVars(a.b).map((t) => all.findIndex((u) => sameVar(u, t)))
      const ta = atomTest(a.a, n, circ, cols, m, sq)
      const tb = atomTest(a.b, n, circ, cols, m, sq)
      f = (v) => {
        const x = ta(at.map((i) => v[i]))
        const y = tb(bt.map((i) => v[i]))
        return a.op === 'imp' ? !x || y : a.op === 'xor' ? x !== y : x || y
      }
      break
    }
    case 'link':
      // only reached inside a compound clue ("either Tina prefers Apple or …"): the same person ⇔ the same position
      f = (v) => (gx as (v: number[]) => number)(v) === (gy as (v: number[]) => number)(v)
      break
  }
  return a.neg ? (v) => !f(v) : f
}
