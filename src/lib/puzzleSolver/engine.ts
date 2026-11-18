// Constraint-propagation engine for the Puzzle Solver. It reasons the way a person does at a desk: a candidate table
// (who could still be where), clues that cross candidates out, and the "one person per floor" bookkeeping that follows.
// Every candidate that is removed is logged with a plain-English reason, which is what the walkthrough narrates.
//
// Inference rules, applied until nothing changes:
//   clue     each active clue removes positions that no placement of the other people could support
//   unique   a person with one candidate left is placed; a floor with one candidate left is filled; the rest of that row/column goes
//   link     tables must agree: if A is on floor 1 and floor 1 can't be Delhi, A can't be from Delhi
import { atomTerms, atomVars, atomTest, bits, hasDerived, cellKey, Ctx, ctz, Grid, pop } from './core'
import type { Atom, DirTerm, Puzzle, Solution, VarTerm } from './types'

export type WhyKind = 'given' | 'clue' | 'taken' | 'single' | 'trans' | 'case' | 'assume' | 'anchor'

export interface Why {
  kind: WhyKind
  text: string
  clue?: number
}

/** op 'x' = a candidate was crossed out; op 'fix' = a pairing became certain. Cells are normalised so that a < b. */
export interface Ev {
  op: 'x' | 'fix'
  a: number
  i: number
  b: number
  j: number
  why: Why
  gid: number // events produced by the same inference share a gid
}

export interface Contra {
  text: string
  clue?: number
}

export interface EngineInit {
  grid: Grid
  active: Set<number>
  fixed: Set<string>
  linked: Set<number>
}

const testCache = new WeakMap<Atom, (v: number[]) => boolean>()
const testOf = (a: Atom, ctx: Ctx) => {
  let t = testCache.get(a)
  if (!t) {
    t = atomTest(a, ctx.n, ctx.circular, ctx.cols, ctx.tworow ? ctx.rowLen : 0, !!ctx.p.square)
    testCache.set(a, t)
  }
  return t
}

/** How many times each person is named in the clues (a person inside an "if … then …" counts once per mention). */
export function personMentions(puzzle: Puzzle): number[] {
  const count = new Array<number>(puzzle.n).fill(0)
  const walk = (a: Atom): void => {
    if (a.t === 'logic') {
      walk(a.a)
      walk(a.b)
      return
    }
    for (const t of atomTerms(a)) if (t.k === 'p') count[t.i]++
  }
  for (const c of puzzle.clues) for (const a of c.atoms) walk(a)
  return count
}

/** Clues are about who sits where, so the person named in the most clues is the best one to start a round table with. */
export function anchorPerson(puzzle: Puzzle): number {
  const count = personMentions(puzzle)
  let best = 0
  count.forEach((v, i) => {
    if (v > count[best]) best = i
  })
  return best
}

export class Engine {
  readonly ctx: Ctx
  grid: Grid
  active: Set<number>
  events: Ev[] = []
  contra: Contra | null = null
  /** skip building explanation strings (exhaustive search does not need them) */
  quiet = false
  private fixed: Set<string>
  private linked: Set<number> // clues whose "is from" facts have already been written on the table
  private gid = 0
  private curGid = 0
  private changed = false
  private clueById: Map<number, Puzzle['clues'][number]>

  constructor(puzzle: Puzzle, init?: EngineInit) {
    this.ctx = new Ctx(puzzle)
    this.clueById = new Map(puzzle.clues.map((c) => [c.id, c]))
    if (init) {
      this.grid = init.grid
      this.active = init.active
      this.fixed = init.fixed
      this.linked = init.linked
    } else {
      this.grid = new Grid(this.ctx.n, this.ctx.K, undefined, this.ctx.sizes)
      this.active = new Set()
      this.fixed = new Set()
      this.linked = new Set()
    }
  }

  clone(): Engine {
    const e = new Engine(this.ctx.p, { grid: this.grid.clone(), active: new Set(this.active), fixed: new Set(this.fixed), linked: new Set(this.linked) })
    e.quiet = this.quiet
    return e
  }

  /** Rebuilds an engine from a saved candidate table; every pairing that is already certain counts as already announced. */
  static fromSnapshot(puzzle: Puzzle, snapshot: Uint16Array, active: Iterable<number>, linked: Iterable<number> = []): Engine {
    const ctx = new Ctx(puzzle)
    const grid = Grid.from(snapshot, ctx.n, ctx.K)
    const fixed = new Set<string>()
    for (let a = 0; a < ctx.K; a++)
      for (let b = a + 1; b < ctx.K; b++)
        for (let i = 0; i < ctx.n; i++) {
          const r = grid.row(a, i, b)
          if (pop(r) === 1) fixed.add(cellKey(a, i, b, ctz(r)))
        }
    return new Engine(puzzle, { grid, active: new Set(active), fixed, linked: new Set(linked) })
  }

  // ─── primitive moves ───────────────────────────────────────────────────────

  private newGroup(): void {
    this.curGid = ++this.gid
  }

  private setContra(text: string, clue?: number): void {
    if (!this.contra) this.contra = { text, clue }
  }

  private clear(a: number, i: number, b: number, j: number, why: Why): void {
    if (!this.grid.has(a, i, b, j)) return
    this.grid.clear(a, i, b, j)
    this.changed = true
    const [A, I, B, J] = a < b ? [a, i, b, j] : [b, j, a, i]
    this.events.push({ op: 'x', a: A, i: I, b: B, j: J, why, gid: this.curGid })
    if (this.contra) return
    const c = this.ctx
    if (this.grid.row(a, i, b) === 0) this.setContra(b === 0 ? `Nobody is left for ${c.lab(a, i)}` : `${c.lab(a, i)} has no ${c.catName(b)} left`, why.clue)
    else if (this.grid.row(b, j, a) === 0 && !c.isDir(b)) this.setContra(a === 0 ? `Nobody is left for ${c.lab(b, j)}` : `${c.lab(b, j)} has no ${c.catName(a)} left`, why.clue)
  }

  /** Records that (a,i) and (b,j) belong together and crosses out every competing candidate in both directions. */
  private fix(a: number, i: number, b: number, j: number, why: Why, takenWhy?: Why): void {
    if (!this.grid.has(a, i, b, j)) {
      this.setContra(`${this.ctx.pair(a, i, b, j)} is already ruled out`, why.clue)
      return
    }
    const key = cellKey(a, i, b, j)
    if (!this.fixed.has(key)) {
      this.fixed.add(key)
      this.changed = true
      const [A, I, B, J] = a < b ? [a, i, b, j] : [b, j, a, i]
      this.events.push({ op: 'fix', a: A, i: I, b: B, j: J, why, gid: this.curGid })
    }
    const taken: Why = takenWhy ?? { kind: 'taken', text: this.ctx.pair(a, i, b, j), clue: undefined }
    for (let j2 = 0; j2 < this.ctx.sizes[b]; j2++) if (j2 !== j) this.clear(a, i, b, j2, taken)
    if (!this.ctx.isDir(b)) for (let i2 = 0; i2 < this.ctx.n; i2++) if (i2 !== i) this.clear(a, i2, b, j, taken)
  }

  /** Crosses one candidate out for a stated reason (used by case analysis: "if it were here, the puzzle would break"). */
  eliminate(a: number, i: number, b: number, j: number, why: Why): void {
    this.newGroup()
    this.clear(a, i, b, j, why)
  }

  /** Sets a whole arrangement (last resort when deduction alone cannot finish but exhaustive search found the unique answer). */
  reveal(sol: Solution): void {
    const why: Why = { kind: 'case', text: 'Checking every way to finish the arrangement leaves only this one' }
    sol.pos.forEach((f, p) => {
      this.newGroup()
      this.fix(0, p, 1, f, why)
    })
    sol.val.forEach((row, c) =>
      row.forEach((v, p) => {
        this.newGroup()
        this.fix(0, p, 2 + c, v, why)
      }),
    )
  }

  /**
   * A round table can be turned without changing who sits next to whom, so any one person may be put in the first seat
   * without losing a single answer. This is the free first move of every circular puzzle.
   */
  anchor(person: number): void {
    const c = this.ctx
    if (c.p.square) {
      // turning a square table by two seats keeps corners as corners and sides as sides, so one person may be assumed in seat 1 or 2
      this.newGroup()
      const why: Why = { kind: 'anchor', text: `A square table can be turned by two seats without changing who is next to whom or who faces which way, so I can start by assuming ${c.lab(0, person)} is in seat 1 (a corner) or seat 2 (a side)` }
      for (let j = 2; j < c.n; j++) this.clear(0, person, 1, j, why)
      return
    }
    this.newGroup()
    this.fix(
      0,
      person,
      1,
      0,
      { kind: 'anchor', text: `The table is round, so turning it changes nothing — I can start by putting ${c.lab(0, person)} in ${c.posLab(0)}` },
      { kind: 'anchor', text: `${c.lab(0, person)} was fixed in ${c.posLab(0)}: a round table can be turned freely, so any one person can start there` },
    )
  }

  /** Suppose a pairing is true (a what-if or a trial in a case analysis). */
  assume(a: number, i: number, b: number, j: number): void {
    this.newGroup()
    this.fix(a, i, b, j, { kind: 'assume', text: `Suppose ${this.ctx.pair(a, i, b, j)}` })
  }

  // ─── clues ─────────────────────────────────────────────────────────────────

  /**
   * Brings a clue into play. Link atoms ("A is from Kolkata") act on the table at once; position atoms are enforced by propagate().
   * With linksOnly, just the link atoms are written down and the clue itself stays unused (a mixed clue such as
   * "A, who is from Kolkata, lives on the top floor" gives its free fact first and its position part later).
   */
  activate(clueId: number, linksOnly = false): void {
    if (!linksOnly) {
      if (this.active.has(clueId)) return
      this.active.add(clueId)
    }
    if (this.linked.has(clueId)) return
    this.linked.add(clueId)
    const clue = this.clueById.get(clueId)
    if (!clue) return
    const c = this.ctx
    for (const atom of clue.atoms) {
      if (atom.t !== 'link') continue
      const ca = c.termCat(atom.x)
      const cb = c.termCat(atom.y)
      const ia = c.termIdx(atom.x)
      const ib = c.termIdx(atom.y)
      if (ca === cb) {
        this.setContra(`Clue ${clueId} pairs two things of the same kind`, clueId)
        continue
      }
      this.newGroup()
      if (atom.neg) this.clear(ca, ia, cb, ib, { kind: 'clue', clue: clueId, text: c.notPair(ca, ia, cb, ib) })
      else this.fix(ca, ia, cb, ib, { kind: 'given', clue: clueId, text: c.pair(ca, ia, cb, ib) })
    }
  }

  private dom(t: VarTerm | DirTerm): number {
    if (t.k === 'd') return this.grid.row(this.ctx.termCat(t.of), this.ctx.termIdx(t.of), this.ctx.dirK)
    if (t.k === 'f') return 1 << t.f
    return this.grid.row(this.ctx.termCat(t), this.ctx.termIdx(t), 1)
  }

  private revise(atom: Atom, clue: number): void {
    if (atom.t === 'link') return
    const c = this.ctx
    const terms = atomVars(atom)
    const k = terms.length
    const doms = terms.map((t) => this.dom(t))
    const test = testOf(atom, c)
    const sup = new Array<number>(k).fill(0)
    const v = new Array<number>(k).fill(0)
    // four-term clues are only worth checking once the people involved are fairly pinned down
    if (k >= 3 && doms.reduce((m, d) => m * pop(d), 1) > 4096) return
    const rec = (t: number): void => {
      if (t === k) {
        if (test(v)) for (let q = 0; q < k; q++) sup[q] |= 1 << v[q]
        return
      }
      for (const f of bits(doms[t])) {
        v[t] = f
        rec(t + 1)
      }
    }
    rec(0)
    let grouped = false // one narrated move per clue application, even when it narrows two people
    for (let ti = 0; ti < k; ti++) {
      const rem = doms[ti] & ~sup[ti]
      if (!rem) continue
      const t = terms[ti]
      if (t.k === 'f') {
        this.setContra(`Clue ${clue} cannot hold: ${c.describeAtom(atom)}`, clue)
        continue
      }
      if (!grouped) {
        this.newGroup()
        grouped = true
      }
      for (const f of bits(rem)) {
        const [ca, ia, cb] = t.k === 'd' ? [c.termCat(t.of), c.termIdx(t.of), c.dirK] : [c.termCat(t), c.termIdx(t), 1]
        this.clear(ca, ia, cb, f, { kind: 'clue', clue, text: this.quiet ? '' : this.reason(atom, ti, f, terms, doms) })
        if (this.contra) return
      }
    }
  }

  /** Why position f is impossible for term ti of the atom, given where the other terms can still be. */
  private reason(atom: Atom, ti: number, f: number, terms: (VarTerm | DirTerm)[], doms: number[]): string {
    const c = this.ctx
    const t0 = terms[ti]
    if (t0.k === 'd') return `${c.termLabel(t0.of)} facing ${c.lab(c.dirK, f)} would break the clue (${c.describeAtom(atom)})`
    if (terms.some((t) => t.k === 'd')) return `${c.termLabel(t0)} ${c.onWord} ${c.posLab(f)} would break the clue (${c.describeAtom(atom)})`
    const n = c.n
    const me = c.termLabel(terms[ti] as VarTerm)
    const here = c.posLab(f)
    const on = c.onWord
    const other = 1 - ti
    const who = terms.length === 2 ? c.termLabel(terms[other] as VarTerm) : ''
    const dom = (k: number) => c.fmtMask(doms[k])
    const generic = () => `${me} ${on} ${here} would break the clue (${c.describeAtom(atom)})`
    const wrap = (p: number) => (c.circular ? ((p % n) + n) % n : p)
    const needAt = (ps0: number[], what: string) => {
      const ps = ps0.map(wrap)
      const valid = [...new Set(ps.filter((p) => p >= 0 && p < n))]
      if (valid.length === 0) {
        const lab = ps.map((p) => c.posLab(p)).join(' or ')
        return `${me} ${on} ${here} would put ${who} ${on} ${lab} — there is no such ${c.unit}`
      }
      return `${me} ${on} ${here} would need ${who} ${on} ${c.fmtOr(valid)} (${what}), but ${who} can only be ${on} ${dom(other)}`
    }
    if (atom.neg && atom.t !== 'set') return generic()
    // the arithmetic below assumes one line of seats and plain people; two rows and "the one on the left of X" need the generic wording
    if (c.tworow || c.p.square || hasDerived(atom)) return atom.t === 'set' ? (atom.neg ? `${me} cannot be ${c.setPhrase(atom.fs)}` : `${me} must be ${c.setPhrase(atom.fs)}`) : generic()
    switch (atom.t) {
      case 'diff': {
        const p = wrap(ti === 0 ? f - atom.d : f + atom.d)
        const k = c.circular ? Math.min(Math.abs(atom.d) % n, n - (Math.abs(atom.d) % n)) : Math.abs(atom.d)
        if (p < 0 || p >= n) return `${me} ${on} ${here} would put ${who} ${on} ${c.posLab(p)} — there is no such ${c.unit}`
        return `${me} ${on} ${here} would need ${who} ${on} ${c.posLab(p)} (${k === 1 ? 'right next to it' : c.circular && k * 2 === n ? 'exactly opposite' : `${k} ${c.unit}s away`}), but ${who} can only be ${on} ${dom(other)}`
      }
      case 'adj':
        return needAt([f - 1, f + 1], 'next to it')
      case 'gap':
        return needAt([f - atom.k - 1, f + atom.k + 1], `${atom.k} ${atom.k === 1 ? c.noun : c.nouns} in between`)
      case 'rank': {
        const partnerHigher = (atom.hi && ti === 1) || (!atom.hi && ti === 0)
        const exists = partnerHigher ? f < n - 1 : f > 0
        if (!exists) return `${me} ${on} ${here} needs ${who} ${c.dirWord(partnerHigher)} it, but nothing is ${c.dirWord(partnerHigher)} ${here}`
        return `${me} ${on} ${here} needs ${who} ${c.dirWord(partnerHigher)} ${here}, but ${who} can only be ${on} ${dom(other)}`
      }
      case 'set':
        return atom.neg ? `${me} cannot be ${c.setPhrase(atom.fs)}` : `${me} must be ${c.setPhrase(atom.fs)}`
      case 'btw':
        if (ti === 0) return `${c.termLabel(terms[1] as VarTerm)} and ${c.termLabel(terms[2] as VarTerm)} cannot stand on opposite sides of ${here}`
        return `${me} ${on} ${here} leaves no way to put ${c.termLabel(terms[0] as VarTerm)} between ${c.termLabel(terms[1] as VarTerm)} and ${c.termLabel(terms[2] as VarTerm)}`
      default:
        return generic()
    }
  }

  // ─── bookkeeping rules ─────────────────────────────────────────────────────

  private uniqueness(): void {
    const { K, n } = this.ctx
    const c = this.ctx
    for (let a = 0; a < K; a++)
      for (let b = a + 1; b < K; b++) {
        for (let i = 0; i < n; i++) {
          const r = this.grid.row(a, i, b)
          if (r === 0) {
            this.setContra(b === 0 ? `Nobody is left for ${c.lab(a, i)}` : `${c.lab(a, i)} has no ${c.catName(b)} left`)
            return
          }
          if (pop(r) === 1) {
            const j = ctz(r)
            const col = this.grid.row(b, j, a)
            if (!this.fixed.has(cellKey(a, i, b, j)) || (col !== 1 << i && !c.isDir(b))) {
              this.newGroup()
              this.fix(a, i, b, j, { kind: 'single', text: `Only ${c.lab(b, j)} is left for ${c.lab(a, i)}` })
              if (this.contra) return
            }
          }
        }
        if (c.isDir(b)) continue // many people may face the same way: only the people ↔ direction rows above apply
        for (let j = 0; j < n; j++) {
          const col = this.grid.row(b, j, a)
          if (col === 0) {
            this.setContra(a === 0 ? `Nobody is left for ${c.lab(b, j)}` : `${c.lab(b, j)} has no ${c.catName(a)} left`)
            return
          }
          if (pop(col) === 1) {
            const i = ctz(col)
            const r = this.grid.row(a, i, b)
            if (!this.fixed.has(cellKey(a, i, b, j)) || r !== 1 << j) {
              this.newGroup()
              this.fix(a, i, b, j, { kind: 'single', text: `Only ${c.lab(a, i)} is still possible for ${c.lab(b, j)}` })
              if (this.contra) return
            }
          }
        }
      }
  }

  private trans(): void {
    const { K, n } = this.ctx
    const c = this.ctx
    for (let a = 0; a < K; a++)
      for (let cc = a + 1; cc < K; cc++)
        for (let b = 0; b < K; b++) {
          if (b === a || b === cc) continue
          for (let i = 0; i < n; i++) {
            let allowed = 0
            for (const j of bits(this.grid.row(a, i, b))) allowed |= this.grid.row(b, j, cc)
            const rem = this.grid.row(a, i, cc) & ~allowed
            if (!rem) continue
            this.newGroup()
            const rb = this.grid.row(a, i, b)
            for (const k of bits(rem)) {
              let text = ''
              if (this.quiet) {
                // no explanation needed
              } else if (pop(rb) === 1) {
                const j = ctz(rb)
                text = `${c.pair(a, i, b, j)}, but ${c.notPair(b, j, cc, k)}`
              } else {
                const rk = this.grid.row(cc, k, b)
                if (pop(rk) === 1) {
                  const j = ctz(rk)
                  text = `${c.pair(cc, k, b, j)}, but ${c.notPair(a, i, b, j)}`
                } else text = `no ${c.catName(b)} can match both ${c.lab(a, i)} and ${c.lab(cc, k)}`
              }
              this.clear(a, i, cc, k, { kind: 'trans', text })
              if (this.contra) return
            }
          }
        }
  }

  /** Runs every inference rule until nothing changes. Returns false when the table has become impossible (see `contra`). */
  propagate(): boolean {
    let guard = 0
    do {
      this.changed = false
      for (const id of this.active) {
        const clue = this.clueById.get(id)
        if (!clue) continue
        for (const atom of clue.atoms) {
          this.revise(atom, id)
          if (this.contra) return false
        }
      }
      this.uniqueness()
      if (this.contra) return false
      this.trans()
      if (this.contra) return false
    } while (this.changed && ++guard < 1000)
    return !this.contra
  }

  // ─── inspection ────────────────────────────────────────────────────────────

  /** The open row with the fewest candidates (people → positions first), or null when every row is down to one candidate. */
  smallestOpenRow(): { a: number; i: number; b: number; size: number } | null {
    const { K, n } = this.ctx
    let best: { a: number; i: number; b: number; size: number } | null = null
    for (let a = 0; a < K; a++)
      for (let b = a + 1; b < K; b++)
        for (let i = 0; i < n; i++) {
          const size = pop(this.grid.row(a, i, b))
          if (size > 1 && (!best || size < best.size)) best = { a, i, b, size }
        }
    return best
  }

  solved(): boolean {
    return !this.contra && this.smallestOpenRow() === null
  }

  solution(): Solution | null {
    if (!this.solved()) return null
    const { n, K } = this.ctx
    const pos: number[] = []
    for (let p = 0; p < n; p++) pos.push(ctz(this.grid.row(0, p, 1)))
    const val: number[][] = []
    for (let c = 2; c < K; c++) {
      const row: number[] = []
      for (let p = 0; p < n; p++) row.push(ctz(this.grid.row(0, p, c)))
      val.push(row)
    }
    return { pos, val }
  }

  /** Total candidates still alive across the people↔position and people↔value tables (a progress measure). */
  candidateCount(): number {
    const { K, n } = this.ctx
    let t = 0
    for (let a = 0; a < K; a++) for (let b = a + 1; b < K; b++) for (let i = 0; i < n; i++) t += pop(this.grid.row(a, i, b))
    return t
  }
}

// ─── independent check and exhaustive search ─────────────────────────────────

/** Evaluates every clue directly against a complete arrangement (no propagation involved). Returns the ids of clues that fail. */
export function failedClues(puzzle: Puzzle, sol: Solution): number[] {
  const n = puzzle.n
  const personAt = (c: number, v: number) => sol.val[c].indexOf(v)
  const personOf = (t: VarTerm): number => (t.k === 'p' ? t.i : t.k === 'v' ? personAt(t.c, t.i) : sol.pos.indexOf(t.f))
  const posOf = (t: VarTerm | DirTerm): number => (t.k === 'd' ? sol.val[puzzle.dirCat as number][personOf(t.of)] : t.k === 'f' ? t.f : sol.pos[personOf(t)])
  const bad: number[] = []
  for (const clue of puzzle.clues) {
    let ok = true
    for (const atom of clue.atoms) {
      if (atom.t === 'link') {
        // a direction is shared by many people: "L faces south" means L's own direction is south
        const dirVal = (t: VarTerm) => (puzzle.dirCat !== undefined && t.k === 'v' && t.c === puzzle.dirCat ? t.i : -1)
        const same =
          dirVal(atom.y) >= 0 && atom.x.k !== 'f'
            ? sol.val[puzzle.dirCat as number][personOf(atom.x)] === dirVal(atom.y)
            : dirVal(atom.x) >= 0 && atom.y.k !== 'f'
              ? sol.val[puzzle.dirCat as number][personOf(atom.y)] === dirVal(atom.x)
              : personOf(atom.x) === personOf(atom.y) && personOf(atom.x) >= 0
        if (atom.neg ? same : !same) ok = false
      } else if (!atomTest(atom, n, puzzle.axis === 'circle', puzzle.cols ?? 1, puzzle.axis === 'tworow' ? (puzzle.rowLen ?? 0) : 0, !!puzzle.square)(atomVars(atom).map(posOf))) ok = false
    }
    if (!ok) bad.push(clue.id)
  }
  if (sol.pos.length !== n) bad.push(0)
  return bad
}

export interface SearchResult {
  sols: Solution[]
  complete: boolean
}

/** All arrangements satisfying every clue, up to `limit` (propagation + branching on the smallest open row). */
export function enumerate(puzzle: Puzzle, limit = 50, nodeCap = 200000): SearchResult {
  const sols: Solution[] = []
  let nodes = 0
  let complete = true
  const root = new Engine(puzzle)
  root.quiet = true
  if (puzzle.axis === 'circle') root.anchor(anchorPerson(puzzle))
  for (const c of puzzle.clues) root.activate(c.id)
  const dfs = (e: Engine): void => {
    if (sols.length >= limit || !complete) return
    if (++nodes > nodeCap) {
      complete = false
      return
    }
    if (!e.propagate()) return
    const open = e.smallestOpenRow()
    if (!open) {
      const s = e.solution()
      if (s && failedClues(puzzle, s).length === 0) sols.push(s)
      return
    }
    for (const j of bits(e.grid.row(open.a, open.i, open.b))) {
      const next = e.clone()
      next.assume(open.a, open.i, open.b, j)
      dfs(next)
      if (sols.length >= limit || !complete) return
    }
  }
  if (!root.contra) dfs(root)
  return { sols, complete }
}
