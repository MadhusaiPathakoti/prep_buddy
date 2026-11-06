// Verification harness for the SBI PO Mains-level ARRANGEMENT generators (seating, puzzles, comparison).
// Structural checks run on every seed; the semantic checks (unique solution, answer keys) use an INDEPENDENT solver /
// evaluator written in this file (coordinate-based semantics, own forward-checking search, own permutation enumeration)
// that shares no code with the generators.
//
// Usage: npx tsx scripts/verify-mains-rarrange.ts [--seeds N] [--proof N] [--topic id[,id]] [--no-samples]
import { createRng } from '../src/lib/mocks/rng'
import { assertGroup } from '../src/lib/mocks/validate'
import type { Group, ReasoningTopicId } from '../src/lib/mocks/types'
import { MAINS_ARRANGE, MAINS_ARRANGE_WITH_PROOF } from '../src/lib/mocks/reasoning/mains/arrange'
import type { ArrangeProof, MainsCmpProof } from '../src/lib/mocks/reasoning/mains/arrange'
import type { Atom, Geometry, Item } from '../src/lib/mocks/reasoning/mains/arrEngine'
import type { Claim } from '../src/lib/mocks/reasoning/mains/arrClaims'
import type { CClaim, CClue } from '../src/lib/mocks/reasoning/mains/cmp'
import { compileAtom, solveCons } from '../src/lib/mocks/reasoning/mains/arrEngine'

const argv = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const SEEDS = Number(flag('seeds') ?? 300)
const PROOF_SEEDS = Number(flag('proof') ?? 40)
const TOPIC_FILTER = flag('topic')?.split(',')
const NO_SAMPLES = argv.includes('--no-samples')

const TOPICS = (['seating-linear', 'seating-circular', 'puzzle-floor', 'puzzle-schedule', 'puzzle-box', 'puzzle-comparison'] as ReasoningTopicId[]).filter((t) => !TOPIC_FILTER || TOPIC_FILTER.includes(t))

const failures: string[] = []
function fail(msg: string): void {
  if (failures.length < 25) console.log(`  FAIL: ${msg}`)
  failures.push(msg)
}
function check(cond: unknown, msg: string): void {
  if (!cond) fail(msg)
}

const OK_EXTRA = new Set('−√∛≤≥≠₹→∴⇒≈π²³'.split(''))
function badChars(s: string): string[] {
  const bad: string[] = []
  for (const ch of s) {
    const c = ch.codePointAt(0) as number
    if (c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || OK_EXTRA.has(ch)) continue
    bad.push(ch)
  }
  return bad
}

// ================================================================================================ independent arrangement semantics
const md = (a: number, n: number) => ((a % n) + n) % n

function patPeriod(pat: number[]): number {
  const n = pat.length
  for (let r = 1; r <= n; r++) if (n % r === 0 && pat.every((v, s) => v === pat[(s + r) % n])) return r
  return n
}

interface Seat {
  group: number
  col: number
  size: number
}
function seat(g: Geometry, p: number): Seat {
  if (g.kind === 'tworow') {
    const m = g.n / 2
    return { group: p < m ? 0 : 1, col: p % m, size: m }
  }
  if (g.kind === 'stacks') {
    const h = g.n / g.stacks
    return { group: Math.floor(p / h), col: p % h, size: h }
  }
  return { group: 0, col: p, size: g.n }
}
/** physical west-east coordinate of a seat in a two-row arrangement (row 1 faces south, row 2 faces north). */
function physX(g: Geometry, p: number): number {
  const m = g.n / 2
  const s = seat(g, p)
  return s.group === 0 ? m - 1 - s.col : s.col
}
const isRoundG = (g: Geometry) => g.kind === 'circle' || g.kind === 'mixed'
/** angle index (anticlockwise) of a round-table seat */
const angle = (g: Geometry, p: number) => (g.kind === 'circle' && g.facing === 'out' ? -p : p)
/** direction (in angle units) of the right-hand side of the person at seat p */
function rightSign(g: Geometry, p: number): number {
  if (g.kind === 'circle') return g.facing === 'in' ? 1 : -1
  if (g.kind === 'mixed') return g.pattern[p] === 1 ? 1 : -1
  return 1
}
/** 'side +1' = counted from the right of x on a uniform round table, anticlockwise on a mixed-facing table */
const sideDir = (g: Geometry, px: number): number => (g.kind === 'circle' ? rightSign(g, px) : 1)
const circGap = (n: number, a: number, b: number) => Math.min(md(a - b, n), md(b - a, n))

function V(g: Geometry, a: Atom, P: (i: Item) => number): boolean {
  const n = g.n
  switch (a.t) {
    case 'not':
      return !V(g, a.c, P)
    case 'and':
      return a.cs.every((c) => V(g, c, P))
    case 'or':
      return a.cs.some((c) => V(g, c, P))
    case 'imp':
      return V(g, a.b, P) || !V(g, a.a, P)
    case 'xor':
      return (V(g, a.a, P) ? 1 : 0) + (V(g, a.b, P) ? 1 : 0) === 1
    case 'nor':
      return a.cs.filter((c) => V(g, c, P)).length === 0
    case 'eq':
      return P(a.x) === P(a.y)
    case 'pos':
      return seat(g, P(a.x)).col === a.p
    case 'end': {
      const s = seat(g, P(a.x))
      return s.col === 0 || s.col === s.size - 1
    }
    case 'grp':
      return seat(g, P(a.x)).group === a.g
    case 'same':
      return seat(g, P(a.x)).group === seat(g, P(a.y)).group
    case 'par':
      return a.odd ? (P(a.x) + 1) % 2 === 1 : (P(a.x) + 1) % 2 === 0
    case 'set':
      return a.ps.includes(seat(g, P(a.x)).col)
    case 'corner':
      return g.kind === 'mixed' && g.pattern[P(a.x)] === 0
    case 'fin':
      return g.kind === 'mixed' ? g.pattern[P(a.x)] === 1 : g.kind === 'circle' && g.facing === 'in'
    case 'sface':
      return g.kind === 'mixed' && g.pattern[P(a.x)] === g.pattern[P(a.y)]
    case 'off': {
      const px = P(a.x)
      const py = P(a.y)
      if (isRoundG(g)) {
        if (g.kind === 'mixed' && g.square && Math.abs(a.d) !== 1) return false
        return md(angle(g, px) - angle(g, py) - a.d * rightSign(g, py), n) === 0
      }
      const sx = seat(g, px)
      const sy = seat(g, py)
      if (sx.group !== sy.group) return false
      if (g.kind === 'tworow') {
        // physical: right of a row-1 person is west, right of a row-2 person is east
        const dx = physX(g, px) - physX(g, py)
        return sy.group === 0 ? dx === -a.d : dx === a.d
      }
      return sx.col - sy.col === a.d
    }
    case 'lt': {
      const sx = seat(g, P(a.x))
      const sy = seat(g, P(a.y))
      return sx.group === sy.group && sx.col < sy.col
    }
    case 'btw': {
      const px = P(a.x)
      const py = P(a.y)
      if (isRoundG(g)) return md(angle(g, py) - angle(g, px), n) === md(sideDir(g, px) * (a.side ?? 1) * (a.k + 1), n)
      const sx = seat(g, px)
      const sy = seat(g, py)
      return sx.group === sy.group && Math.abs(sx.col - sy.col) - 1 === a.k
    }
    case 'mid': {
      const sx = seat(g, P(a.x))
      const sy = seat(g, P(a.y))
      const sz = seat(g, P(a.z))
      if (sx.group !== sy.group || sy.group !== sz.group) return false
      return Math.min(sx.col, sz.col) < sy.col && sy.col < Math.max(sx.col, sz.col)
    }
    case 'adj': {
      const px = P(a.x)
      const py = P(a.y)
      if (isRoundG(g)) return circGap(n, px, py) === 1
      const sx = seat(g, px)
      const sy = seat(g, py)
      return sx.group === sy.group && Math.abs(sx.col - sy.col) === 1
    }
    case 'opp':
      return circGap(n, P(a.x), P(a.y)) === n / 2
    case 'face': {
      const px = P(a.x)
      const py = P(a.y)
      if (g.kind === 'tworow') return seat(g, px).group !== seat(g, py).group && physX(g, px) === physX(g, py)
      if (g.kind === 'mixed') return g.pattern[px] === 1 && g.pattern[py] === 1 && circGap(n, px, py) === n / 2
      return circGap(n, px, py) === n / 2
    }
    case 'samegap': {
      const gap = (u: Item, v: Item) => {
        const su = seat(g, P(u))
        const sv = seat(g, P(v))
        return su.group === sv.group ? Math.abs(su.col - sv.col) - 1 : -99
      }
      const g1 = gap(a.x, a.y)
      return g1 >= 0 && g1 === gap(a.z, a.w)
    }
  }
}

function itemsOf(a: Atom, out: Item[] = []): Item[] {
  const add = (it: Item) => {
    if (!out.some((o) => o[0] === it[0] && o[1] === it[1])) out.push(it)
  }
  const anyA = a as unknown as Record<string, unknown>
  for (const k of ['x', 'y', 'z', 'w']) if (Array.isArray(anyA[k])) add(anyA[k] as unknown as Item)
  for (const k of ['c', 'a', 'b']) if (anyA[k] && typeof anyA[k] === 'object' && !Array.isArray(anyA[k])) itemsOf(anyA[k] as Atom, out)
  if (Array.isArray(anyA.cs)) (anyA.cs as Atom[]).forEach((c) => itemsOf(c, out))
  return out
}

// ------------------------------------------------------------------------------------------------ independent solver
interface SolveOut {
  count: number
  sol: number[][] | null
  complete: boolean
}
function solveIndep(g: Geometry, nA: number, clues: Atom[], cap: number): SolveOut {
  const n = g.n
  const nv = nA * n
  const cl = clues.map((a) => ({ a, vars: itemsOf(a).map((it) => it[0] * n + it[1]) }))
  const used = new Array<number[]>(nv).fill([])
  const varClues: number[][] = Array.from({ length: nv }, () => [])
  cl.forEach((c, i) => c.vars.forEach((v) => varClues[v].push(i)))
  void used
  let nodes = 0
  let count = 0
  let sol: number[][] | null = null
  let aborted = false
  const full = (1 << n) - 1
  const pos0 = new Int8Array(nv).fill(-1)
  const dom0 = new Int32Array(nv).fill(full)
  if (g.kind === 'circle') dom0[0] = 1
  if (g.kind === 'mixed') dom0[0] = (1 << patPeriod(g.pattern)) - 1
  const posFn = (pos: Int8Array) => (it: Item) => pos[it[0] * n + it[1]]
  const bits = (m: number) => {
    let c = 0
    while (m) {
      m &= m - 1
      c++
    }
    return c
  }
  function propagate(dom: Int32Array, pos: Int8Array): boolean {
    const P = posFn(pos)
    let changed = true
    while (changed) {
      changed = false
      for (let v = 0; v < nv; v++) {
        if (pos[v] < 0 && bits(dom[v]) === 1) {
          const p = 31 - Math.clz32(dom[v])
          pos[v] = p
          const a0 = Math.floor(v / n)
          for (let u = a0 * n; u < a0 * n + n; u++) {
            if (u === v) continue
            if (pos[u] === p) return false
            if (pos[u] < 0 && dom[u] & (1 << p)) {
              dom[u] &= ~(1 << p)
              if (dom[u] === 0) return false
            }
          }
          changed = true
        }
      }
      for (const c of cl) {
        let free = -1
        let nfree = 0
        for (const v of c.vars) if (pos[v] < 0) {
          nfree++
          free = v
        }
        if (nfree === 0) {
          if (!V(g, c.a, P)) return false
        } else if (nfree === 1) {
          let nd = dom[free]
          for (let p = 0; p < n; p++) {
            if (!(dom[free] & (1 << p))) continue
            pos[free] = p
            if (!V(g, c.a, P)) nd &= ~(1 << p)
          }
          pos[free] = -1
          if (nd === 0) return false
          if (nd !== dom[free]) {
            dom[free] = nd
            changed = true
          }
        }
      }
    }
    return true
  }
  function rec(dom: Int32Array, pos: Int8Array): void {
    if (count >= 2 || aborted) return
    if (++nodes > cap) {
      aborted = true
      return
    }
    if (!propagate(dom, pos)) return
    let best = -1
    let bs = 99
    for (let v = 0; v < nv; v++) if (pos[v] < 0) {
      const s = bits(dom[v])
      if (s < bs) {
        bs = s
        best = v
      }
    }
    if (best < 0) {
      count++
      if (!sol) sol = Array.from({ length: nA }, (_, a) => Array.from({ length: n }, (_, v) => pos[a * n + v]))
      return
    }
    for (let p = 0; p < n; p++) {
      if (!(dom[best] & (1 << p))) continue
      const d2 = dom.slice()
      const p2 = pos.slice()
      d2[best] = 1 << p
      rec(d2, p2)
      if (count >= 2 || aborted) return
    }
  }
  rec(dom0, pos0)
  return { count, sol, complete: !aborted }
}

// ------------------------------------------------------------------------------------------------ independent claim evaluation
function evalClaimIndep(g: Geometry, cl: Claim, P: (i: Item) => number, names: string[]): boolean {
  const n = g.n
  const betw = (x: Item, y: Item, side?: 1 | -1): number => {
    const px = P(x)
    const py = P(y)
    if (isRoundG(g)) return md(sideDir(g, px) * (side ?? 1) * (angle(g, py) - angle(g, px)), n) - 1
    const sx = seat(g, px)
    const sy = seat(g, py)
    return sx.group === sy.group ? Math.abs(sx.col - sy.col) - 1 : -1
  }
  switch (cl.k) {
    case 'atom':
      return V(g, cl.a, P)
    case 'gap':
      return betw(cl.x, cl.y, cl.side) === cl.v
    case 'cnt': {
      const s = seat(g, P(cl.x))
      return (cl.dir === 'lo' ? s.col : s.size - 1 - s.col) === cl.v
    }
    case 'fixed': {
      const order = names.map((_, i) => i).sort((p, q) => {
        const kp = cl.keys[p]
        const kq = cl.keys[q]
        return (kp < kq ? -1 : kp > kq ? 1 : 0) * (cl.rev ? -1 : 1)
      })
      let c = 0
      order.forEach((person, rank) => {
        if (P([0, person]) === rank) c++
      })
      return c === cl.v
    }
    case 'after': {
      const a = P([0, cl.sw[0]])
      const b = P([0, cl.sw[1]])
      return evalClaimIndep(g, cl.c, (it) => {
        const p = P(it)
        return p === a ? b : p === b ? a : p
      }, names)
    }
    case 'subset': {
      let m = 0
      cl.stmts.forEach((s, i) => {
        if (V(g, s, P)) m += 1 << i
      })
      return m === cl.mask
    }
  }
}

// ------------------------------------------------------------------------------------------------ arrangement proof checks
interface ProofStats {
  checked: number
  inconclusive: number
  hardClues: number
  clueTotal: number
  splitSets: number
  famCount: Record<string, number>
  deepOk: number
  deepChecked: number
  singleClueBad: number
}

function checkArrangementProof(p: ArrangeProof, label: string, st: ProofStats): void {
  const { geom: g, nA, hidden } = p
  const n = g.n
  const P = (it: Item) => hidden[it[0]][it[1]]
  p.clues.forEach((c, i) => check(V(g, c, P), `${label}: clue ${i} false in hidden arrangement`))
  const r = solveIndep(g, nA, p.clues, 4_000_000)
  st.checked++
  if (!r.complete && r.count < 2) st.inconclusive++
  else {
    check(r.count === 1, `${label}: independent solver found ${r.count} solutions`)
    if (r.sol && r.count === 1) {
      // compare up to rotation for round tables
      let ok = false
      const shifts = g.kind === 'circle' ? n : g.kind === 'mixed' ? n : 1
      for (let s = 0; s < shifts && !ok; s++) {
        if (g.kind === 'mixed' && s % patPeriod(g.pattern) !== 0) continue
        const rot = (q: number) => (g.kind === 'circle' || g.kind === 'mixed' ? md(q + s, n) : q)
        ok = hidden.every((row, a) => row.every((q, v) => rot((r.sol as number[][])[a][v]) === q))
      }
      check(ok, `${label}: independent solution differs from the hidden arrangement`)
    }
  }
  // answer keys evaluated on the hidden arrangement with the independent claim evaluator
  p.questions.forEach((q, qi) => {
    const tr = q.claims.map((cl) => evalClaimIndep(g, cl, P, p.names))
    check(tr.filter(Boolean).length === 1 && tr[q.answer], `${label} q${qi + 1} (${q.fam}): claims truth ${JSON.stringify(tr)} vs answer ${q.answer}`)
    st.famCount[q.fam] = (st.famCount[q.fam] ?? 0) + 1
  })
  st.clueTotal += p.clues.length
  st.hardClues += p.clues.filter((c) => ['not', 'nor', 'xor', 'imp', 'samegap', 'set'].includes(c.t)).length
  if (p.needsSplit) st.splitSets++
}

/** Greedy minimal entailing clue set size per atom-claim question (uses the engine's solver: a statistic, not an independent proof). */
function entailStats(p: ArrangeProof, st: ProofStats): void {
  const { geom: g, nA } = p
  const cons = p.clues.map((a) => compileAtom(g, g.n, a))
  let deep = 0
  p.questions.forEach((q) => {
    if (!q.claims.every((c) => c.k === 'atom')) {
      deep++
      return
    }
    const neg = compileAtom(g, g.n, { t: 'not', c: (q.claims[q.answer] as { k: 'atom'; a: Atom }).a })
    const entails = (idx: number[]) => {
      const r = solveCons(g, nA, [...idx.map((i) => cons[i]), neg], 1, 20000)
      return r.complete && r.sols.length === 0
    }
    let cur = p.clues.map((_, i) => i)
    if (!entails(cur)) {
      // answer decided by elimination of the wrong options: count it as using all clues
      deep++
      return
    }
    for (let i = 0; i < p.clues.length; i++) {
      const without = cur.filter((x) => x !== i)
      if (without.length && entails(without)) cur = without
    }
    if (cur.length <= 1) st.singleClueBad++
    if (cur.length >= 3) deep++
  })
  st.deepChecked++
  if (deep >= Math.min(2, p.questions.length)) st.deepOk++
}

// ================================================================================================ comparison (independent)
function* perms(n: number): Generator<number[]> {
  const a = Array.from({ length: n }, (_, i) => i)
  function* rec(k: number): Generator<number[]> {
    if (k === n) {
      yield a.slice()
      return
    }
    for (let i = k; i < n; i++) {
      ;[a[k], a[i]] = [a[i], a[k]]
      yield* rec(k + 1)
      ;[a[k], a[i]] = [a[i], a[k]]
    }
  }
  yield* rec(0)
}
let RANK_VECS: number[][] | null = null
function rankVecs(n: number): number[][] {
  if (!RANK_VECS) RANK_VECS = [...perms(n)]
  return RANK_VECS
}

interface W {
  a: number[]
  b?: number[]
}
const R = (w: W, at: number) => (at === 0 ? w.a : (w.b as number[]))

function clueTrue(c: CClue, w: W, n: number): boolean {
  switch (c.t) {
    case 'gt':
      return R(w, c.at)[c.x] < R(w, c.at)[c.y]
    case 'exact':
      return R(w, c.at).filter((v) => v < R(w, c.at)[c.x]).length === c.k
    case 'notext': {
      const above = R(w, c.at).filter((v) => v < R(w, c.at)[c.x]).length
      return above !== 0 && above !== n - 1
    }
    case 'nbtw': {
      const r = R(w, c.at)
      return r.filter((v) => v > r[c.y] && v < r[c.x]).length === c.k && r[c.y] < r[c.x]
    }
    case 'atl':
      return R(w, c.at).filter((v) => v > R(w, c.at)[c.x]).length >= c.m
    case 'atm':
      return R(w, c.at).filter((v) => v < R(w, c.at)[c.x]).length <= c.k
    case 'nor':
      return c.xs.every((x) => R(w, c.at)[x] > R(w, c.at)[c.z])
    case 'cross': {
      const p = w.a.indexOf(c.ka)
      return (w.b as number[])[p] === c.kb
    }
    case 'not':
      return !clueTrue(c.c, w, n)
    case 'xor':
      return clueTrue(c.a, w, n) !== clueTrue(c.b, w, n)
    case 'imp':
      return !clueTrue(c.a, w, n) || clueTrue(c.b, w, n)
  }
}
function clueAttrs(c: CClue): Set<number> {
  const s = new Set<number>()
  const go = (x: CClue): void => {
    if (x.t === 'cross') {
      s.add(0)
      s.add(1)
    } else if (x.t === 'not') go(x.c)
    else if (x.t === 'xor' || x.t === 'imp') {
      go(x.a)
      go(x.b)
    } else s.add(x.at)
  }
  go(c)
  return s
}
function claimTrue(c: CClaim, w: W, n: number): boolean {
  switch (c.k) {
    case 'rank':
      return R(w, c.at).filter((v) => v < R(w, c.at)[c.x]).length === c.r
    case 'gt':
      return R(w, c.at)[c.x] < R(w, c.at)[c.y]
    case 'cntSet': {
      let cnt = 0
      for (let p = 0; p < n; p++) {
        if (c.conds.every((cd) => (cd.dir === 'above' ? R(w, cd.at)[p] < R(w, cd.at)[cd.x] : R(w, cd.at)[p] > R(w, cd.at)[cd.x]))) cnt++
      }
      return cnt === c.v
    }
    case 'cntRef': {
      const z = R(w, c.refAt).indexOf(c.refRank)
      let cnt = 0
      for (let p = 0; p < n; p++) {
        if (p === z) continue
        if (c.dir === 'above' ? R(w, c.at)[p] < R(w, c.at)[z] : R(w, c.at)[p] > R(w, c.at)[z]) cnt++
      }
      return cnt === c.v
    }
    case 'and':
      return c.cs.every((x) => claimTrue(x, w, n))
    case 'under':
      return false
  }
}
const allWorldsHold = (c: CClaim, ws: W[], n: number): boolean => {
  if (c.k === 'under') {
    const sub = ws.filter((w) => claimTrue(c.extra, w, n))
    return sub.length > 0 && sub.every((w) => claimTrue(c.c, w, n))
  }
  return ws.every((w) => claimTrue(c, w, n))
}
const someWorldHolds = (c: CClaim, ws: W[], n: number): boolean => {
  if (c.k === 'under') {
    const sub = ws.filter((w) => claimTrue(c.extra, w, n))
    return sub.some((w) => claimTrue(c.c, w, n))
  }
  return ws.some((w) => claimTrue(c, w, n))
}

function claimAttrs(c: CClaim, out = new Set<number>()): Set<number> {
  if (c.k === 'under') {
    claimAttrs(c.extra, out)
    claimAttrs(c.c, out)
  } else if (c.k === 'and') c.cs.forEach((x) => claimAttrs(x, out))
  else if (c.k === 'cntSet') c.conds.forEach((x) => out.add(x.at))
  else if (c.k === 'cntRef') {
    out.add(c.at)
    out.add(c.refAt)
  } else out.add(c.at)
  return out
}

function checkComparisonProof(p: MainsCmpProof, label: string): { worlds: number } {
  const n = p.n
  const vecs = rankVecs(n)
  const wA = vecs.filter((r) => p.clues.every((c) => (clueAttrs(c).size === 1 && clueAttrs(c).has(0) ? clueTrue(c, { a: r }, n) : true)))
  let worlds: W[]
  if (p.nAttr === 1) worlds = wA.map((a) => ({ a })).filter((w) => p.clues.every((c) => clueTrue(c, w, n)))
  else {
    const wB = vecs.filter((r) => p.clues.every((c) => (clueAttrs(c).size === 1 && clueAttrs(c).has(1) ? clueTrue(c, { a: [], b: r }, n) : true)))
    worlds = []
    for (const a of wA) for (const b of wB) if (p.clues.every((c) => clueTrue(c, { a, b }, n))) worlds.push({ a, b })
  }
  check(worlds.length >= 2, `${label}: fewer than 2 consistent worlds`)
  const hw: W = { a: p.hidden.a, b: p.hidden.b }
  check(p.clues.every((c) => clueTrue(c, hw, n)), `${label}: a clue is false in the hidden order`)
  check(worlds.some((w) => w.a.every((v, i) => v === p.hidden.a[i]) && (p.nAttr === 1 || (w.b as number[]).every((v, i) => v === (p.hidden.b as number[])[i]))), `${label}: hidden order not among the worlds`)
  p.questions.forEach((q, qi) => {
    q.claims.forEach((cl, i) => {
      const all = allWorldsHold(cl, worlds, n)
      const some = someWorldHolds(cl, worlds, n)
      let ok: boolean
      if (i === q.answer) ok = q.mode === 'F' ? !some : all
      else ok = q.mode === 'det' ? !some : q.mode === 'T' ? !all : some
      check(ok, `${label} q${qi + 1} (${q.fam}) option ${i} violates mode ${q.mode} (all=${all}, some=${some})`)
    })
    // one statement alone must not settle the question
    const ats = new Set<number>()
    q.claims.forEach((c) => claimAttrs(c, ats))
    if (ats.size === 1) {
      const at = [...ats][0]
      for (const c of p.clues) {
        const ca = clueAttrs(c)
        if (ca.size !== 1 || !ca.has(at)) continue
        const ws: W[] = vecs.map((r) => (at === 0 ? { a: r } : { a: [], b: r })).filter((w) => clueTrue(c, w, n))
        const cor = q.claims[q.answer]
        const decided = q.mode === 'F' ? !someWorldHolds(cor, ws, n) : allWorldsHold(cor, ws, n)
        check(!decided, `${label} q${qi + 1} (${q.fam}) is settled by a single statement`)
      }
    }
  })
  return { worlds: worlds.length }
}

// ================================================================================================ main
const countsFor = (topic: ReasoningTopicId, seed: number): number => {
  const cycle = topic === 'puzzle-comparison' ? [3, 5, 3, 6, 1, 3, 10, 4] : [5, 10, 5, 5, 1, 7, 5, 15]
  return cycle[seed % cycle.length]
}

const ZERO_STATS = (): ProofStats => ({ checked: 0, inconclusive: 0, hardClues: 0, clueTotal: 0, splitSets: 0, famCount: {}, deepOk: 0, deepChecked: 0, singleClueBad: 0 })

const t00 = Date.now()
for (const topic of TOPICS) {
  console.log(`\n=== ${topic} ===`)
  const gen = MAINS_ARRANGE[topic]
  if (!gen) {
    fail(`${topic}: generator missing`)
    continue
  }
  const stats = ZERO_STATS()
  let nQ = 0
  let totalMs = 0
  const stems = new Set<string>()
  const pos = [0, 0, 0, 0, 0]
  const optLens: number[] = []
  let sample: Group[] | null = null
  let cmpWorlds = 0
  let cmpChecked = 0
  for (let seed = 1; seed <= SEEDS; seed++) {
    const count = countsFor(topic, seed)
    let groups: Group[] = []
    const t0 = performance.now()
    try {
      groups = gen(createRng(seed * 7919 + 13), 'hard', count)
    } catch (e) {
      fail(`${topic} seed ${seed} count ${count}: generator threw ${(e as Error).message}`)
      continue
    }
    totalMs += performance.now() - t0
    const total = groups.reduce((s, g) => s + g.questions.length, 0)
    check(total === count, `${topic} seed ${seed}: got ${total} questions, wanted ${count}`)
    groups.forEach((g, gi) => {
      try {
        assertGroup(g, `${topic} seed ${seed} g${gi}`)
      } catch (e) {
        fail((e as Error).message)
      }
      const texts = [...(g.stimulus?.parts ?? []).flatMap((pt) => (pt.kind === 'text' ? pt.paragraphs : [])), ...g.questions.flatMap((q) => [q.stem, q.explanation, ...q.options])]
      for (const s of texts) {
        const bad = badChars(s)
        if (bad.length) fail(`${topic} seed ${seed}: unsupported characters ${JSON.stringify(bad)} in "${s.slice(0, 60)}"`)
      }
      g.questions.forEach((q) => {
        stems.add(q.stem)
        pos[q.answer]++
        optLens.push(q.options.length)
        check(q.explanation.split('\n').length >= 3, `${topic} seed ${seed}: explanation has fewer than 3 lines`)
        check(q.explanation.includes('Correct answer: ('), `${topic} seed ${seed}: explanation lacks the answer line`)
        check(q.stem.length >= 8, `${topic} seed ${seed}: stem too short`)
      })
      nQ += g.questions.length
    })
    if (seed === 1) sample = groups
    if (seed <= 6) {
      const again = gen(createRng(seed * 7919 + 13), 'hard', count)
      check(JSON.stringify(again) === JSON.stringify(groups), `${topic} seed ${seed}: not deterministic`)
    }
  }
  // independent proof checks (count 5 for sets, 3 for comparison)
  const pg = MAINS_ARRANGE_WITH_PROOF[topic]
  if (pg) {
    for (let seed = 1; seed <= PROOF_SEEDS; seed++) {
      const wp = pg(createRng(seed * 104729 + 7), 'hard', topic === 'puzzle-comparison' ? 6 : 10)
      wp.proofs.forEach((pr, i) => {
        const label = `${topic} proof seed ${seed}.${i}`
        if (topic === 'puzzle-comparison') {
          const r = checkComparisonProof(pr as MainsCmpProof, label)
          cmpWorlds += r.worlds
          cmpChecked++
        } else {
          checkArrangementProof(pr as ArrangeProof, label, stats)
          if (seed <= Math.min(PROOF_SEEDS, 12)) entailStats(pr as ArrangeProof, stats)
        }
      })
    }
  }
  const tot = pos.reduce((a, b) => a + b, 0)
  const pct = pos.map((x) => (100 * x) / tot)
  pct.forEach((x, i) => check(x >= 12 && x <= 28, `${topic}: correct option ${'ABCDE'[i]} occurs ${x.toFixed(1)}% (must be 12-28%)`))
  check(optLens.every((l) => l === 5), `${topic}: option count != 5`)
  console.log(`  questions: ${nQ}  seeds: ${SEEDS}  avg ms per 30 questions: ${((totalMs / Math.max(nQ, 1)) * 30).toFixed(0)}  distinct stems: ${stems.size}`)
  console.log(`  correct-option position %: ${pct.map((x, i) => `${'ABCDE'[i]}=${x.toFixed(1)}`).join(' ')}`)
  if (topic === 'puzzle-comparison') console.log(`  independent proof: ${cmpChecked} sets re-solved by exhaustive enumeration, avg ${(cmpWorlds / Math.max(cmpChecked, 1)).toFixed(0)} consistent worlds per set`)
  else {
    console.log(`  independent proof: ${stats.checked} puzzles re-solved (${stats.inconclusive} inconclusive within node cap); case-split needed in ${stats.splitSets}/${stats.checked}; hard clues ${(stats.hardClues / Math.max(stats.clueTotal, 1) * 100).toFixed(0)}% of ${stats.clueTotal} clues (avg ${(stats.clueTotal / Math.max(stats.checked, 1)).toFixed(1)}/puzzle)`)
    console.log(`  entailment (engine solver, ${stats.deepChecked} sets): sets with >=2 questions needing 3+ clues: ${stats.deepOk}/${stats.deepChecked}; questions settled by <=1 clue: ${stats.singleClueBad}`)
    check(stats.deepOk === stats.deepChecked, `${topic}: ${stats.deepChecked - stats.deepOk} sets lack 2 questions that need 3+ clues`)
    check(stats.singleClueBad === 0, `${topic}: ${stats.singleClueBad} questions settled by a single clue`)
    check(stats.inconclusive <= Math.ceil(stats.checked * 0.1), `${topic}: too many inconclusive independent solves (${stats.inconclusive}/${stats.checked})`)
    console.log(`  question families: ${Object.entries(stats.famCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ')}`)
  }
  if (!NO_SAMPLES && sample) {
    const g = sample[0]
    const paras = g.stimulus?.parts[0]?.kind === 'text' ? (g.stimulus.parts[0] as { paragraphs: string[] }).paragraphs : []
    console.log(`  --- sample statement (${paras.length} paragraphs) ---`)
    paras.forEach((s) => console.log(`    ${s}`))
    g.questions.slice(0, 3).forEach((q, i) => {
      console.log(`  --- sample question ${i + 1} ---`)
      console.log(`    ${q.stem.replace(/\n/g, '\n    ')}`)
      q.options.forEach((o, j) => console.log(`      (${'ABCDE'[j]}) ${o}${j === q.answer ? '   <== key' : ''}`))
      console.log(`    Explanation:\n      ${q.explanation.replace(/\n/g, '\n      ')}`)
    })
  }
}

console.log(`\nTotal time ${((Date.now() - t00) / 1000).toFixed(1)}s`)
if (failures.length) {
  console.log(`\nFAILED: ${failures.length} problem(s)`)
  process.exit(1)
}
console.log('\nALL MAINS-RARRANGE CHECKS PASSED')
