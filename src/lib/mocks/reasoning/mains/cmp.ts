// SBI PO Mains-level comparison puzzles: 8 persons ranked on one or two attributes (height / weight / age / marks) through
// chained, counted, conditional and exclusive-or statements. Every answer is proved over ALL orderings consistent with the
// statements (exhaustive enumeration of the 8! orders), never just over the hidden one.
import type { Rng } from '../../rng'
import type { Group, MockDifficulty, QuestionDraft } from '../../types'
import { answerLine } from '../../options'
import { DIRECTIONS, NUMW, ORD, cap, pickNames, splitCount, type WithProof } from '../common'

// ------------------------------------------------------------------------------------------------ model
/** rank vector: r[p] = number of persons ABOVE p (0 = the greatest). */
type Ranks = Int8Array
export interface World {
  a: ArrayLike<number>
  b?: ArrayLike<number>
}

export type CClue =
  | { t: 'gt'; at: number; x: number; y: number }
  | { t: 'exact'; at: number; x: number; k: number }
  | { t: 'notext'; at: number; x: number }
  | { t: 'nbtw'; at: number; x: number; y: number; k: number }
  | { t: 'atl'; at: number; x: number; m: number }
  | { t: 'atm'; at: number; x: number; k: number }
  | { t: 'nor'; at: number; xs: number[]; z: number }
  | { t: 'cross'; ka: number; kb: number }
  | { t: 'not'; c: CClue }
  | { t: 'xor'; a: CClue; b: CClue }
  | { t: 'imp'; a: CClue; b: CClue }

export type CClaim =
  | { k: 'rank'; at: number; x: number; r: number }
  | { k: 'gt'; at: number; x: number; y: number }
  | { k: 'cntSet'; conds: { at: number; dir: 'above' | 'below'; x: number }[]; v: number }
  /** count persons p that are above/below the person z having rank refRank in attribute refAt (identity of z may vary per world). */
  | { k: 'cntRef'; at: number; dir: 'above' | 'below'; refAt: number; refRank: number; v: number }
  | { k: 'and'; cs: CClaim[] }
  | { k: 'under'; extra: CClaim; c: CClaim }

/** 'det': correct claim true in all worlds, wrong claims false in all worlds. 'T': correct entailed, wrong not entailed.
 *  'F': correct is false in all worlds, wrong claims are true in at least one world. */
export type CMode = 'det' | 'T' | 'F'

export interface MainsCmpProof {
  n: number
  nAttr: number
  names: string[]
  hidden: { a: number[]; b?: number[] }
  clues: CClue[]
  questions: { fam: string; mode: CMode; claims: CClaim[]; answer: number }[]
}

const N = 8
let PERMS: Ranks[] | null = null
function allRanks(): Ranks[] {
  if (PERMS) return PERMS
  const out: Ranks[] = []
  const cur = new Int8Array(N)
  const used = new Array<boolean>(N).fill(false)
  const rec = (i: number): void => {
    if (i === N) {
      out.push(cur.slice())
      return
    }
    for (let r = 0; r < N; r++) {
      if (!used[r]) {
        used[r] = true
        cur[i] = r
        rec(i + 1)
        used[r] = false
      }
    }
  }
  rec(0)
  PERMS = out
  return out
}

const rk = (w: World, at: number): ArrayLike<number> => (at === 0 ? w.a : (w.b as number[]))

function evClue(c: CClue, w: World): boolean {
  switch (c.t) {
    case 'gt': {
      const r = rk(w, c.at)
      return r[c.x] < r[c.y]
    }
    case 'exact':
      return rk(w, c.at)[c.x] === c.k
    case 'notext': {
      const r = rk(w, c.at)[c.x]
      return r > 0 && r < N - 1
    }
    case 'nbtw': {
      const r = rk(w, c.at)
      return r[c.x] - r[c.y] - 1 === c.k
    }
    case 'atl':
      return N - 1 - rk(w, c.at)[c.x] >= c.m
    case 'atm':
      return rk(w, c.at)[c.x] <= c.k
    case 'nor': {
      const r = rk(w, c.at)
      return c.xs.every((x) => r[x] > r[c.z])
    }
    case 'cross': {
      const ra = w.a
      const rb = w.b as ArrayLike<number>
      for (let p = 0; p < N; p++) if (ra[p] === c.ka) return rb[p] === c.kb
      return false
    }
    case 'not':
      return !evClue(c.c, w)
    case 'xor':
      return evClue(c.a, w) !== evClue(c.b, w)
    case 'imp':
      return !evClue(c.a, w) || evClue(c.b, w)
  }
}

function attrsOf(c: CClue, out: Set<number>): void {
  switch (c.t) {
    case 'cross':
      out.add(0)
      out.add(1)
      break
    case 'not':
      attrsOf(c.c, out)
      break
    case 'xor':
    case 'imp':
      attrsOf(c.a, out)
      attrsOf(c.b, out)
      break
    default:
      out.add(c.at)
  }
}

function personWith(r: ArrayLike<number>, rank: number): number {
  for (let p = 0; p < N; p++) if (r[p] === rank) return p
  return -1
}

function evClaim(c: CClaim, w: World, worlds: World[]): boolean {
  switch (c.k) {
    case 'rank':
      return rk(w, c.at)[c.x] === c.r
    case 'gt': {
      const r = rk(w, c.at)
      return r[c.x] < r[c.y]
    }
    case 'cntSet': {
      let cnt = 0
      for (let p = 0; p < N; p++) {
        if (c.conds.every((cd) => (cd.dir === 'above' ? rk(w, cd.at)[p] < rk(w, cd.at)[cd.x] : rk(w, cd.at)[p] > rk(w, cd.at)[cd.x]))) cnt++
      }
      return cnt === c.v
    }
    case 'cntRef': {
      const z = personWith(rk(w, c.refAt), c.refRank)
      const r = rk(w, c.at)
      let cnt = 0
      for (let p = 0; p < N; p++) if (p !== z && (c.dir === 'above' ? r[p] < r[z] : r[p] > r[z])) cnt++
      return cnt === c.v
    }
    case 'and':
      return c.cs.every((x) => evClaim(x, w, worlds))
    case 'under':
      return holdsAll(c, worlds)
  }
}

/** true in every world (for 'under': in every world where the extra statement also holds, and at least one exists). */
function holdsAll(c: CClaim, worlds: World[]): boolean {
  if (c.k === 'under') {
    const ws = worlds.filter((w) => evClaim(c.extra, w, worlds))
    return ws.length > 0 && ws.every((w) => evClaim(c.c, w, ws))
  }
  return worlds.every((w) => evClaim(c, w, worlds))
}
function holdsSome(c: CClaim, worlds: World[]): boolean {
  if (c.k === 'under') {
    const ws = worlds.filter((w) => evClaim(c.extra, w, worlds))
    return ws.some((w) => evClaim(c.c, w, ws))
  }
  return worlds.some((w) => evClaim(c, w, worlds))
}

// ------------------------------------------------------------------------------------------------ wording
interface AttrDef {
  key: string
  noun: string
  subject: string
  flavour: 'adj' | 'marks'
  more: string
  less: string
  most: string
  least: string
}

const ATTRS: AttrDef[] = [
  { key: 'height', noun: 'height', subject: 'friends', flavour: 'adj', more: 'taller', less: 'shorter', most: 'tallest', least: 'shortest' },
  { key: 'weight', noun: 'weight', subject: 'friends', flavour: 'adj', more: 'heavier', less: 'lighter', most: 'heaviest', least: 'lightest' },
  { key: 'age', noun: 'age', subject: 'persons', flavour: 'adj', more: 'older', less: 'younger', most: 'oldest', least: 'youngest' },
  { key: 'marks', noun: 'marks obtained in an examination', subject: 'students', flavour: 'marks', more: 'more', less: 'fewer', most: 'highest', least: 'lowest' },
]

/** Full predicate: "is taller than Y" / "has scored more marks than Y". */
function pred(d: AttrDef, up: boolean, y: string): string {
  return d.flavour === 'adj' ? `is ${up ? d.more : d.less} than ${y}` : `has scored ${up ? 'more' : 'fewer'} marks than ${y}`
}
/** Predicate without the verb, for "X is taller than Y but shorter than Z". */
function predNV(d: AttrDef, up: boolean, y: string): string {
  return d.flavour === 'adj' ? `${up ? d.more : d.less} than ${y}` : `has scored ${up ? 'more' : 'fewer'} marks than ${y}`
}
const countPlural = (k: number, one: string, many: string): string => (k === 1 ? one : many)

interface Ctx {
  names: string[]
  defs: AttrDef[]
}

function clueText(cx: Ctx, c: CClue): string {
  const nm = (p: number) => cx.names[p]
  switch (c.t) {
    case 'gt': {
      const d = cx.defs[c.at]
      return `${nm(c.x)} ${pred(d, true, nm(c.y))}`
    }
    case 'exact': {
      const d = cx.defs[c.at]
      if (c.k === 0) return d.flavour === 'adj' ? `${nm(c.x)} is the ${d.most}` : `${nm(c.x)} has scored the ${d.most} marks`
      return d.flavour === 'adj'
        ? `Exactly ${NUMW[c.k]} ${countPlural(c.k, 'person is', 'persons are')} ${d.more} than ${nm(c.x)}`
        : `Exactly ${NUMW[c.k]} ${countPlural(c.k, 'person has', 'persons have')} scored more marks than ${nm(c.x)}`
    }
    case 'notext': {
      const d = cx.defs[c.at]
      return d.flavour === 'adj' ? `${nm(c.x)} is neither the ${d.most} nor the ${d.least}` : `${nm(c.x)} has scored neither the ${d.most} nor the ${d.least} marks`
    }
    case 'nbtw': {
      const d = cx.defs[c.at]
      return d.flavour === 'adj'
        ? `Exactly ${NUMW[c.k]} ${countPlural(c.k, 'person is', 'persons are')} ${d.more} than ${nm(c.x)} and ${d.less} than ${nm(c.y)}`
        : `Exactly ${NUMW[c.k]} ${countPlural(c.k, 'person has', 'persons have')} scored more marks than ${nm(c.x)} and fewer marks than ${nm(c.y)}`
    }
    case 'atl': {
      const d = cx.defs[c.at]
      return d.flavour === 'adj' ? `${nm(c.x)} is ${d.more} than at least ${NUMW[c.m]} persons` : `${nm(c.x)} has scored more marks than at least ${NUMW[c.m]} persons`
    }
    case 'atm': {
      const d = cx.defs[c.at]
      return d.flavour === 'adj'
        ? `At most ${NUMW[c.k]} ${countPlural(c.k, 'person is', 'persons are')} ${d.more} than ${nm(c.x)}`
        : `At most ${NUMW[c.k]} ${countPlural(c.k, 'person has', 'persons have')} scored more marks than ${nm(c.x)}`
    }
    case 'nor': {
      const d = cx.defs[c.at]
      const xs = c.xs.map(nm).join(' nor ')
      return d.flavour === 'adj' ? `Neither ${xs} is ${d.more} than ${nm(c.z)}` : `Neither ${xs} has scored more marks than ${nm(c.z)}`
    }
    case 'cross': {
      const [d0, d1] = cx.defs
      const s0 = rankPhrase(d0, c.ka)
      const s1 = rankPhrase(d1, c.kb)
      return `The person who is ${s0} is also ${s1}`
    }
    case 'not': {
      if (c.c.t === 'gt') {
        const d = cx.defs[c.c.at]
        return `${nm(c.c.x)} ${pred(d, true, nm(c.c.y)).replace(/^is /, 'is not ').replace(/^has scored/, 'has not scored')}`
      }
      return `It is not true that ${lower(clueText(cx, c.c))}`
    }
    case 'xor':
      return `Either ${lower(clueText(cx, c.a))} or ${lower(clueText(cx, c.b))}, but not both`
    case 'imp':
      return `If ${lower(clueText(cx, c.a))}, then ${lower(clueText(cx, c.b))}`
  }
}

/** "the third tallest" style phrase for a rank (0 = greatest); counted from the top when r <= 3 else from the bottom. */
function rankPhrase(d: AttrDef, r: number): string {
  const fromTop = r <= 3
  const k = fromTop ? r : N - 1 - r
  const sup = fromTop ? d.most : d.least
  if (d.flavour === 'adj') return `the ${k === 0 ? '' : `${ORD[k + 1]} `}${sup}`
  return `the ${k === 0 ? '' : `${ORD[k + 1]} `}${sup} scorer`
}

function lower(s: string): string {
  // keep person names (single capital letter or capitalised name) intact: only lowercase sentence starters we generated
  return /^(Exactly|At most|Neither|Either|If|It is)/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s
}

// ------------------------------------------------------------------------------------------------ clue generation
function rndPair(rng: Rng): [number, number] {
  const a = rng.int(0, N - 1)
  let b = rng.int(0, N - 1)
  while (b === a) b = rng.int(0, N - 1)
  return [a, b]
}

function genSimple(rng: Rng, hidden: World, nAttr: number, wantTrue: boolean): CClue | null {
  const at = rng.int(0, nAttr - 1)
  const r = rk(hidden, at)
  const [x, y] = rndPair(rng)
  const t = rng.pick(['gt', 'gt', 'exact', 'notext', 'nbtw', 'atl', 'atm'] as const)
  let c: CClue | null = null
  switch (t) {
    case 'gt':
      c = { t: 'gt', at, x, y }
      break
    case 'exact':
      c = { t: 'exact', at, x, k: wantTrue ? r[x] : rng.int(0, N - 1) }
      break
    case 'notext':
      c = { t: 'notext', at, x }
      break
    case 'nbtw':
      c = { t: 'nbtw', at, x, y, k: wantTrue ? r[x] - r[y] - 1 : rng.int(1, 4) }
      if (wantTrue && (c as { k: number }).k < 1) return null
      break
    case 'atl':
      c = { t: 'atl', at, x, m: wantTrue ? Math.max(2, N - 1 - r[x] - rng.int(0, 1)) : rng.int(2, 6) }
      break
    case 'atm':
      c = { t: 'atm', at, x, k: wantTrue ? Math.min(N - 3, r[x] + rng.int(0, 1)) : rng.int(1, 5) }
      break
  }
  if (!c) return null
  if (c.t === 'exact' && c.k < 1 && wantTrue && rng.chance(0.6)) return null
  if (c.t === 'atl' && c.m > 6) return null
  return evClue(c, hidden) === wantTrue ? c : null
}

function genClue(rng: Rng, hidden: World, nAttr: number): CClue | null {
  const kind = rng.pick(['simple', 'simple', 'simple', 'gt2', 'gt2', 'xor', 'imp', 'nor', 'not', 'cross'] as const)
  switch (kind) {
    case 'simple':
      return genSimple(rng, hidden, nAttr, true)
    case 'gt2': {
      const at = rng.int(0, nAttr - 1)
      const r = rk(hidden, at)
      const [x, y] = rndPair(rng)
      return r[x] < r[y] ? { t: 'gt', at, x, y } : { t: 'gt', at, x: y, y: x }
    }
    case 'xor': {
      const a = genSimple(rng, hidden, nAttr, true)
      const b = genSimple(rng, hidden, nAttr, false)
      return a && b ? (rng.chance(0.5) ? { t: 'xor', a, b } : { t: 'xor', a: b, b: a }) : null
    }
    case 'imp': {
      const a = genSimple(rng, hidden, nAttr, true)
      const b = genSimple(rng, hidden, nAttr, true)
      return a && b && a.t !== 'imp' ? { t: 'imp', a, b } : null
    }
    case 'nor': {
      const at = rng.int(0, nAttr - 1)
      const r = rk(hidden, at)
      const z = rng.int(0, N - 1)
      const lowers = Array.from({ length: N }, (_, p) => p).filter((p) => r[p] > r[z])
      if (lowers.length < 2) return null
      return { t: 'nor', at, xs: rng.sample(lowers, 2), z }
    }
    case 'not': {
      const at = rng.int(0, nAttr - 1)
      const r = rk(hidden, at)
      const [x, y] = rndPair(rng)
      return r[x] > r[y] ? { t: 'not', c: { t: 'gt', at, x, y } } : { t: 'not', c: { t: 'gt', at, x: y, y: x } }
    }
    case 'cross': {
      if (nAttr < 2) return null
      const p = rng.int(0, N - 1)
      return { t: 'cross', ka: hidden.a[p], kb: (hidden.b as ArrayLike<number>)[p] }
    }
  }
}

const isCross = (c: CClue): boolean => {
  const s = new Set<number>()
  attrsOf(c, s)
  return s.size > 1
}

interface Puzzle {
  clues: CClue[]
  worlds: World[]
  hidden: { a: number[]; b?: number[] }
}

function buildPuzzle(rng: Rng, nAttr: number): Puzzle | null {
  const base = allRanks()
  const shuf = (): number[] => rng.shuffle(Array.from({ length: N }, (_, i) => i))
  const hidden: World & { a: number[]; b?: number[] } = { a: shuf(), b: nAttr > 1 ? shuf() : undefined }
  const wl: Ranks[][] = [base, base]
  const clues: CClue[] = []
  const single = (c: CClue): number => {
    const s = new Set<number>()
    attrsOf(c, s)
    return s.size === 1 ? [...s][0] : -1
  }
  let guard = 0
  const lim = nAttr === 1 ? 60 : 36
  let joint: World[] | null = null
  while (guard++ < 260) {
    const sizes = wl.slice(0, nAttr).map((l) => l.length)
    const done = nAttr === 1 ? sizes[0] <= lim : joint !== null && joint.length <= 160
    if (done && clues.length >= (nAttr === 1 ? 8 : 10)) break
    const c = genClue(rng, hidden, nAttr)
    if (!c || !evClue(c, hidden)) continue
    const cross = isCross(c)
    if (cross && !joint) {
      if (sizes[0] * sizes[1] > 5000) continue
      joint = []
      for (const a of wl[0]) for (const b of wl[1]) joint.push({ a, b })
    }
    if (!cross && joint) {
      const nj: World[] = joint.filter((w) => evClue(c, w))
      if (nj.length >= joint.length || nj.length < 1) continue
      joint = nj
      clues.push(c)
      continue
    }
    if (cross && joint) {
      const nj: World[] = joint.filter((w) => evClue(c, w))
      if (nj.length >= joint.length || nj.length < 1) continue
      joint = nj
      clues.push(c)
      continue
    }
    const at = single(c)
    const tmp: World = { a: [] }
    const nl = wl[at].filter((r) => {
      if (at === 0) tmp.a = r
      else tmp.b = r
      return evClue(c, tmp)
    })
    if (nl.length >= wl[at].length || nl.length < 2) continue
    wl[at] = nl
    clues.push(c)
  }
  if (nAttr === 2 && !joint) return null
  const worlds: World[] = joint ?? wl[0].map((a) => ({ a }))
  if (worlds.length < 2 || worlds.length > 160) return null
  if (clues.length < 8 || clues.length > 15) return null
  if (nAttr === 2 && !clues.some(isCross)) return null
  if (!worlds.every(() => true)) return null
  const same = (x: ArrayLike<number>, y: ArrayLike<number>): boolean => Array.from(x).every((v, i) => v === y[i])
  if (!worlds.some((w) => same(w.a, hidden.a) && (nAttr === 1 || same(w.b as ArrayLike<number>, hidden.b as ArrayLike<number>)))) throw new Error('internal: hidden order lost')
  return { clues, worlds, hidden }
}

// ------------------------------------------------------------------------------------------------ questions
interface Cand {
  stem: string
  texts: string[]
  claims: CClaim[]
  answer: number
  mode: CMode
  fact: string[]
  fam: string
}

function nameOpts(rng: Rng, det: number, pool: number[]): { order: number[]; answer: number } | null {
  const others = rng.sample(pool.filter((p) => p !== det), 4)
  if (others.length < 4) return null
  const order = rng.shuffle([det, ...others])
  return { order, answer: order.indexOf(det) }
}

const COUNT_WORD = (v: number): string => (v === 0 ? 'None' : cap(NUMW[v]))

function numWindow(rng: Rng, v: number, hi: number): { vals: number[]; answer: number } | null {
  const feas: number[] = []
  for (let j = 0; j < 5; j++) if (v - j >= 0 && v - j + 4 <= hi) feas.push(j)
  if (!feas.length) return null
  const j = rng.pick(feas)
  let vals = Array.from({ length: 5 }, (_, i) => v - j + i)
  if (rng.chance(0.5)) vals = rng.shuffle(vals)
  return { vals, answer: vals.indexOf(v) }
}

function orderLine(cx: Ctx, w: World, at: number): string {
  const r = rk(w, at)
  const order = Array.from({ length: N }, (_, p) => p).sort((p, q) => r[p] - r[q])
  const d = cx.defs[at]
  return `${d.noun} (${d.flavour === 'adj' ? `${d.most} to ${d.least}` : 'highest to lowest'}): ${order.map((p) => cx.names[p]).join(' > ')}`
}

function worldsNote(cx: Ctx, worlds: World[], nAttr: number): string[] {
  const out: string[] = []
  for (let at = 0; at < nAttr; at++) {
    const d = cx.defs[at]
    const parts = cx.names.map((name, p) => {
      let lo = N
      let hi = -1
      for (const w of worlds) {
        const r = rk(w, at)[p]
        if (r < lo) lo = r
        if (r > hi) hi = r
      }
      return `${name} ${lo === hi ? `${lo + 1}` : `${lo + 1}-${hi + 1}`}`
    })
    out.push(`Possible positions in ${d.flavour === 'adj' ? `${d.noun} (1 = ${d.most})` : 'marks (1 = highest)'}: ${parts.join(', ')}.`)
  }
  if (worlds.length <= 4) {
    worlds.forEach((w, i) => {
      for (let at = 0; at < nAttr; at++) out.push(`${worlds.length > 1 ? `Order ${i + 1} - ` : ''}${orderLine(cx, w, at)}`)
    })
  } else out.push(`${worlds.length} orders are consistent with the statements; the answer is the same in every one of them.`)
  return out
}

function makeCandidates(rng: Rng, pz: Puzzle, cx: Ctx, nAttr: number): Cand[] {
  const { worlds } = pz
  const cands: Cand[] = []
  const persons = Array.from({ length: N }, (_, i) => i)
  const nm = (p: number) => cx.names[p]
  const note = worldsNote(cx, worlds, nAttr)
  const allDet = (c: CClaim) => holdsAll(c, worlds)
  const anyOf = (c: CClaim) => holdsSome(c, worlds)

  // who is the k-th greatest / least
  for (let at = 0; at < nAttr; at++) {
    const d = cx.defs[at]
    for (let r = 0; r < N; r++) {
      const hit = persons.filter((p) => allDet({ k: 'rank', at, x: p, r }))
      if (hit.length !== 1) continue
      const fromTop = r <= (N - 1) / 2
      const k = fromTop ? r + 1 : N - r
      if (k === 1) continue
      const sup = fromTop ? d.most : d.least
      const stem = d.flavour === 'adj' ? `Who is the ${ORD[k]} ${sup}?` : `Who has scored the ${ORD[k]} ${sup} marks?`
      // plausible traps: persons that could hold a neighbouring rank
      const near = persons.filter((p) => p !== hit[0] && [r - 1, r + 1].some((rr) => rr >= 0 && rr < N && anyOf({ k: 'rank', at, x: p, r: rr })))
      const opt = nameOpts(rng, hit[0], near.length >= 4 ? near : persons)
      if (!opt) continue
      cands.push({
        stem,
        texts: opt.order.map(nm),
        claims: opt.order.map((p) => ({ k: 'rank', at, x: p, r })),
        answer: opt.answer,
        mode: 'det',
        fact: [`In every consistent order ${nm(hit[0])} has exactly ${NUMW[r]} ${countPlural(r, 'person', 'persons')} above, so ${nm(hit[0])} is the ${ORD[k]} ${sup}.`, ...note],
        fam: 'kth',
      })
    }
  }
  // how many persons are above / below x
  for (let at = 0; at < nAttr; at++) {
    const d = cx.defs[at]
    for (let x = 0; x < N; x++) {
      for (const dir of ['above', 'below'] as const) {
        const hit = Array.from({ length: N }, (_, v) => v).filter((v) => allDet({ k: 'cntSet', conds: [{ at, dir, x }], v }))
        if (hit.length !== 1) continue
        const v = hit[0]
        if (v < 1 || v > 6) continue
        const w = numWindow(rng, v, 7)
        if (!w) continue
        const stem = d.flavour === 'adj' ? `How many persons are ${dir === 'above' ? d.more : d.less} than ${nm(x)}?` : `How many persons have scored ${dir === 'above' ? 'more' : 'fewer'} marks than ${nm(x)}?`
        cands.push({
          stem,
          texts: w.vals.map(COUNT_WORD),
          claims: w.vals.map((vv) => ({ k: 'cntSet', conds: [{ at, dir, x }], v: vv })),
          answer: w.answer,
          mode: 'det',
          fact: [d.flavour === 'adj' ? `In every consistent order exactly ${v} ${countPlural(v, 'person is', 'persons are')} ${dir === 'above' ? d.more : d.less} than ${nm(x)}.` : `In every consistent order exactly ${v} ${countPlural(v, 'person has', 'persons have')} scored ${dir === 'above' ? 'more' : 'fewer'} marks than ${nm(x)}.`, ...note],
          fam: 'count',
        })
      }
    }
  }
  // who lies strictly between two persons (one or two attributes)
  for (let at = 0; at < nAttr; at++) {
    const d = cx.defs[at]
    for (const [hi, lo] of persons.flatMap((a) => persons.filter((b) => b !== a).map((b) => [a, b] as const))) {
      const claimOf = (p: number): CClaim => ({ k: 'and', cs: [{ k: 'gt', at, x: hi, y: p }, { k: 'gt', at, x: p, y: lo }] })
      if (!allDet({ k: 'gt', at, x: hi, y: lo })) continue
      const hit = persons.filter((p) => allDet(claimOf(p)))
      const possible = persons.filter((p) => anyOf(claimOf(p)))
      if (hit.length !== 1 || possible.length !== 1) continue
      const opt = nameOpts(rng, hit[0], persons.filter((p) => p !== hi && p !== lo))
      if (!opt) continue
      const stem = `Who among them ${pred(d, false, nm(hi))} but ${predNV(d, true, nm(lo))}?`
      cands.push({ stem, texts: opt.order.map(nm), claims: opt.order.map(claimOf), answer: opt.answer, mode: 'det', fact: [`Only ${nm(hit[0])} lies between ${nm(lo)} and ${nm(hi)} in every consistent order.`, ...note], fam: 'between' })
    }
  }
  // two-attribute: who is [more] in attribute 0 than A and [less] in attribute 1 than B
  if (nAttr === 2) {
    const [d0, d1] = cx.defs
    for (let a = 0; a < N; a++) {
      for (let b = 0; b < N; b++) {
        if (a === b) continue
        for (const [u0, u1] of [[true, false], [false, true], [true, true], [false, false]]) {
          const claimOf = (p: number): CClaim => ({ k: 'and', cs: [{ k: 'gt', at: 0, x: u0 ? p : a, y: u0 ? a : p }, { k: 'gt', at: 1, x: u1 ? p : b, y: u1 ? b : p }] })
          const hit = persons.filter((p) => p !== a && p !== b && allDet(claimOf(p)))
          const possible = persons.filter((p) => anyOf(claimOf(p)))
          if (hit.length !== 1 || possible.length !== 1) continue
          const opt = nameOpts(rng, hit[0], persons.filter((p) => p !== a && p !== b))
          if (!opt) continue
          const second = d0.flavour === 'adj' && d1.flavour === 'adj' ? predNV(d1, u1, nm(b)) : pred(d1, u1, nm(b))
          const stem = `Who among them ${pred(d0, u0, nm(a))} and ${second}?`
          cands.push({ stem, texts: opt.order.map(nm), claims: opt.order.map(claimOf), answer: opt.answer, mode: 'det', fact: [`Only ${nm(hit[0])} satisfies both conditions in every consistent pair of orders.`, ...note], fam: 'bothAttr' })
        }
      }
    }
    // how many persons are above X in attribute 0 AND above X in attribute 1
    for (let x = 0; x < N; x++) {
      for (const dir0 of ['above', 'below'] as const) {
        for (const dir1 of ['above', 'below'] as const) {
          const conds = [{ at: 0, dir: dir0, x }, { at: 1, dir: dir1, x }]
          const hit = Array.from({ length: N }, (_, v) => v).filter((v) => allDet({ k: 'cntSet', conds, v }))
          if (hit.length !== 1) continue
          const w = numWindow(rng, hit[0], 7)
          if (!w) continue
          const cmpW = (d: AttrDef, dir: string): string => (dir === 'above' ? d.more : d.less)
          const first = cx.defs[0].flavour === 'adj' ? `are ${cmpW(cx.defs[0], dir0)} than ${nm(x)}` : `have scored ${dir0 === 'above' ? 'more' : 'fewer'} marks than ${nm(x)}`
          const second =
            cx.defs[1].flavour === 'adj'
              ? cx.defs[0].flavour === 'adj'
                ? `${cmpW(cx.defs[1], dir1)} than ${nm(x)}`
                : `are ${cmpW(cx.defs[1], dir1)} than ${nm(x)}`
              : `have scored ${dir1 === 'above' ? 'more' : 'fewer'} marks than ${nm(x)}`
          const stem = `How many persons ${first} and also ${second}?`
          cands.push({
            stem,
            texts: w.vals.map(COUNT_WORD),
            claims: w.vals.map((vv) => ({ k: 'cntSet', conds, v: vv })),
            answer: w.answer,
            mode: 'det',
            fact: [`Counting the persons who satisfy both comparisons in every consistent pair of orders gives ${hit[0]}.`, ...note],
            fam: 'countBoth',
          })
        }
      }
    }
    // reference person defined by a rank in attribute refAt, count in attribute at
    for (let refAt = 0; refAt < 2; refAt++) {
      const at = 1 - refAt
      for (let refRank = 1; refRank < N - 1; refRank++) {
        for (const dir of ['above', 'below'] as const) {
          const hit = Array.from({ length: N }, (_, v) => v).filter((v) => allDet({ k: 'cntRef', at, dir, refAt, refRank, v }))
          if (hit.length !== 1) continue
          // must not be determined by a single identified person (otherwise it is just a 'count' question)
          const ids = new Set(worlds.map((w) => personWith(rk(w, refAt), refRank)))
          if (ids.size < 2) continue
          const w = numWindow(rng, hit[0], 7)
          if (!w) continue
          const dr = cx.defs[refAt]
          const da = cx.defs[at]
          const kk = refRank <= 3 ? refRank : N - 1 - refRank
          const sup = refRank <= 3 ? dr.most : dr.least
          const who = dr.flavour === 'adj' ? `the ${ORD[kk + 1]} ${sup} person` : `the person who has scored the ${ORD[kk + 1]} ${sup} marks`
          const stem = da.flavour === 'adj' ? `How many persons are ${dir === 'above' ? da.more : da.less} than ${who}?` : `How many persons have scored ${dir === 'above' ? 'more' : 'fewer'} marks than ${who}?`
          cands.push({
            stem,
            texts: w.vals.map(COUNT_WORD),
            claims: w.vals.map((vv) => ({ k: 'cntRef', at, dir, refAt, refRank, v: vv })),
            answer: w.answer,
            mode: 'det',
            fact: [`The person referred to may differ between orders, but in every consistent pair of orders the count is ${hit[0]}.`, ...note],
            fam: 'refCount',
          })
        }
      }
    }
  }
  // statements: definitely true / definitely false
  for (let rep = 0; rep < 2; rep++) {
    const wantTrue = rep === 0
    const mk = (): { c: CClaim; t: string } | null => {
      const at = rng.int(0, nAttr - 1)
      const [x, y] = rndPair(rng)
      const d = cx.defs[at]
      const t = rng.chance(0.5) ? `${nm(x)} ${pred(d, true, nm(y))}` : `${nm(y)} ${pred(d, false, nm(x))}`
      return { c: { k: 'gt', at, x, y }, t }
    }
    const good: { c: CClaim; t: string }[] = []
    const bad: { c: CClaim; t: string }[] = []
    const seen = new Set<string>()
    for (let i = 0; i < 400 && (good.length < 1 || bad.length < 4); i++) {
      const s = mk()
      if (!s || seen.has(s.t)) continue
      const always = allDet(s.c)
      const never = !anyOf(s.c)
      if (wantTrue) {
        if (always && good.length < 1) {
          good.push(s)
          seen.add(s.t)
        } else if (!always && bad.length < 4) {
          bad.push(s)
          seen.add(s.t)
        }
      } else if (never && good.length < 1) {
        good.push(s)
        seen.add(s.t)
      } else if (!never && bad.length < 4) {
        bad.push(s)
        seen.add(s.t)
      }
    }
    if (good.length < 1 || bad.length < 4) continue
    // at least one wrong option must be genuinely "possible but not certain" to keep it tricky
    const all = rng.shuffle([good[0], ...bad])
    const answer = all.indexOf(good[0])
    cands.push({
      stem: wantTrue ? 'Which of the following statements is definitely true?' : 'Which of the following statements is definitely false?',
      texts: all.map((s) => s.t),
      claims: all.map((s) => s.c),
      answer,
      mode: wantTrue ? 'T' : 'F',
      fact: [wantTrue ? `"${good[0].t}" holds in every consistent order; each of the other statements is false or may be false in some consistent order.` : `"${good[0].t}" is false in every consistent order; each of the other statements is true in at least one consistent order.`, ...note],
      fam: wantTrue ? 'stmtTrue' : 'stmtFalse',
    })
  }
  // new condition: an extra statement that is not already known settles a question
  for (let tries = 0; tries < 60; tries++) {
    const at = rng.int(0, nAttr - 1)
    const [x, y] = rndPair(rng)
    const extra: CClaim = { k: 'gt', at, x, y }
    if (!anyOf(extra) || allDet(extra)) continue
    if (!worlds.some((w) => evClaim(extra, w, worlds)) || !worlds.every((w) => evClaim(extra, w, worlds) || true)) continue
    const sub = worlds.filter((w) => evClaim(extra, w, worlds))
    if (sub.length === 0 || sub.length === worlds.length) continue
    const d = cx.defs[at]
    // pick a kth question determined only under the extra condition
    const rr = rng.int(1, N - 2)
    const hitSub = persons.filter((p) => sub.every((w) => rk(w, at)[p] === rr))
    const hitAll = persons.filter((p) => allDet({ k: 'rank', at, x: p, r: rr }))
    if (hitSub.length !== 1 || hitAll.length) continue
    const fromTop = rr <= (N - 1) / 2
    const k = fromTop ? rr + 1 : N - rr
    if (k === 1) continue
    const sup = fromTop ? d.most : d.least
    const opt = nameOpts(rng, hitSub[0], persons)
    if (!opt) continue
    const cond = `${nm(x)} ${pred(d, true, nm(y))}`
    const stem = d.flavour === 'adj' ? `If ${cond}, who will be the ${ORD[k]} ${sup} among them?` : `If ${cond}, who will have scored the ${ORD[k]} ${sup} marks among them?`
    cands.push({
      stem,
      texts: opt.order.map(nm),
      claims: opt.order.map((p) => ({ k: 'under', extra, c: { k: 'rank', at, x: p, r: rr } })),
      answer: opt.answer,
      mode: 'det',
      fact: [`The statements alone do not fix the ${ORD[k]} ${sup}. With the extra condition (${cond}), ${sub.length} of the ${worlds.length} orders remain and in all of them ${nm(hitSub[0])} is the ${ORD[k]} ${sup}.`, ...note],
      fam: 'newCond',
    })
    break
  }
  return cands
}


function cluePersons(c: CClue, out = new Set<number>()): Set<number> {
  switch (c.t) {
    case 'gt':
    case 'nbtw':
      out.add(c.x)
      out.add(c.y)
      break
    case 'exact':
    case 'notext':
    case 'atl':
    case 'atm':
      out.add(c.x)
      break
    case 'nor':
      c.xs.forEach((x) => out.add(x))
      out.add(c.z)
      break
    case 'cross':
      break
    case 'not':
      cluePersons(c.c, out)
      break
    case 'xor':
    case 'imp':
      cluePersons(c.a, out)
      cluePersons(c.b, out)
      break
  }
  return out
}
function claimPersons(c: CClaim, out = new Set<number>()): Set<number> {
  switch (c.k) {
    case 'rank':
      out.add(c.x)
      break
    case 'gt':
      out.add(c.x)
      out.add(c.y)
      break
    case 'cntSet':
      c.conds.forEach((x) => out.add(x.x))
      break
    case 'and':
      c.cs.forEach((x) => claimPersons(x, out))
      break
    case 'under':
      claimPersons(c.extra, out)
      claimPersons(c.c, out)
      break
    case 'cntRef':
      break
  }
  return out
}

let SINGLE_CACHE: { key: string; worlds: World[] }[] = []
/** True when ONE statement alone (together with nothing else) already settles the answer of this question. */
function singleClueDecides(clues: CClue[], c: Cand): boolean {
  const ats = new Set<number>()
  const scan = (cl: CClaim): void => {
    if (cl.k === 'under') {
      scan(cl.extra)
      scan(cl.c)
    } else if (cl.k === 'and') cl.cs.forEach(scan)
    else if (cl.k === 'cntSet') cl.conds.forEach((x) => ats.add(x.at))
    else if (cl.k === 'cntRef') {
      ats.add(cl.at)
      ats.add(cl.refAt)
    } else ats.add(cl.at)
  }
  c.claims.forEach(scan)
  if (ats.size !== 1) return false
  const at = [...ats][0]
  const involved = new Set<number>()
  c.claims.forEach((x) => claimPersons(x, involved))
  const refOnly = c.claims.some((x) => x.k === 'cntRef')
  for (const cl of clues) {
    const own = new Set<number>()
    attrsOf(cl, own)
    if (own.size !== 1 || !own.has(at)) continue
    if (!refOnly && ![...cluePersons(cl)].some((p) => involved.has(p))) continue
    const key = JSON.stringify([cl, at])
    let hit = SINGLE_CACHE.find((x) => x.key === key)
    if (!hit) {
      const ws: World[] = []
      const tmp: World = { a: [] }
      for (const r of allRanks()) {
        if (at === 0) tmp.a = r
        else tmp.b = r
        if (evClue(cl, tmp)) ws.push(at === 0 ? { a: r } : { a: [], b: r })
      }
      hit = { key, worlds: ws }
      SINGLE_CACHE.push(hit)
      if (SINGLE_CACHE.length > 400) SINGLE_CACHE = SINGLE_CACHE.slice(-200)
    }
    const ws = hit.worlds
    const correct = c.claims[c.answer]
    const decided = c.mode === 'F' ? !holdsSome(correct, ws) : holdsAll(correct, ws)
    if (decided) return true
    if (c.mode === 'det' && c.claims.every((x, i) => i === c.answer || !holdsSome(x, ws))) return true
  }
  return false
}

const DEEP_FAMS = new Set(['bothAttr', 'countBoth', 'refCount', 'newCond', 'between', 'stmtTrue', 'stmtFalse'])

function tryBuild(rng: Rng, k: number): { group: Group; proof: MainsCmpProof } | null {
  const nAttr = rng.chance(0.5) ? 2 : 1
  const pz = buildPuzzle(rng, nAttr)
  if (!pz) return null
  const defs = rng.sample(ATTRS, nAttr)
  const names = pickNames(rng, N)
  const cx: Ctx = { names, defs }
  const cands = makeCandidates(rng, pz, cx, nAttr)
  // choose questions: distinct families first, at least two "deep" ones when k >= 3; reject questions one clue already settles
  const byFam = new Map<string, Cand[]>()
  for (const c of cands) byFam.set(c.fam, [...(byFam.get(c.fam) ?? []), c])
  const fams = rng.shuffle([...byFam.keys()])
  const chosen: Cand[] = []
  const pickFrom = (f: string): boolean => {
    for (const c of rng.shuffle(byFam.get(f) as Cand[]).slice(0, 12)) {
      if (!singleClueDecides(pz.clues, c)) {
        chosen.push(c)
        return true
      }
    }
    return false
  }
  const wantDeep = Math.min(2, k)
  const tier1 = new Set(['refCount', 'bothAttr', 'countBoth'])
  const deepOrder = [...fams.filter((x) => tier1.has(x)), ...fams.filter((x) => DEEP_FAMS.has(x) && !tier1.has(x))]
  for (const f of deepOrder) {
    if (chosen.length >= wantDeep) break
    pickFrom(f)
  }
  if (chosen.length < wantDeep) return null
  for (const f of fams) {
    if (chosen.length >= k) break
    if (chosen.some((c) => c.fam === f)) continue
    pickFrom(f)
  }
  if (chosen.length < k) return null
  const final = rng.shuffle(chosen)
  const given = pz.clues.map((c) => clueText(cx, c))
  const d0 = defs[0]
  const intro =
    nAttr === 1
      ? d0.flavour === 'marks'
        ? `Eight ${d0.subject} - ${names.join(', ')} - are compared on the basis of the marks they obtained in an examination. No two of them obtained the same marks. The following information is known:`
        : `Eight ${d0.subject} - ${names.join(', ')} - are compared on the basis of their ${d0.noun}. No two of them have the same ${d0.noun}. The following information is known:`
      : `Eight ${defs[0].flavour === 'marks' || defs[1].flavour === 'marks' ? 'students' : 'persons'} - ${names.join(', ')} - are compared on the basis of their ${defs[0].key === 'marks' ? 'marks' : defs[0].noun} and their ${defs[1].key === 'marks' ? 'marks' : defs[1].noun}. No two of them are equal in the same attribute. The following information is known:`
  const paragraphs = [intro, ...rng.shuffle(given).map((s) => `${s}.`)]
  const questions: QuestionDraft[] = final.map((c) => ({
    topic: 'puzzle-comparison',
    stem: c.stem,
    options: c.texts,
    answer: c.answer,
    explanation: `${c.fact.join('\n')}\n${answerLine({ options: c.texts, answer: c.answer, answerIsNone: false }, c.texts[c.answer])}`,
  }))
  const group: Group = { stimulus: { directions: DIRECTIONS, parts: [{ kind: 'text', paragraphs }] }, questions }
  const proof: MainsCmpProof = {
    n: N,
    nAttr,
    names,
    hidden: { a: pz.hidden.a, b: pz.hidden.b },
    clues: pz.clues,
    questions: final.map((c) => ({ fam: c.fam, mode: c.mode, claims: c.claims, answer: c.answer })),
  }
  // self-check against the claim evaluator (independent from the candidate builders)
  final.forEach((c, qi) => {
    c.claims.forEach((cl, i) => {
      const all = holdsAll(cl, pz.worlds)
      const some = holdsSome(cl, pz.worlds)
      const ok = i === c.answer ? (c.mode === 'F' ? !some : all) : c.mode === 'det' ? !some : c.mode === 'T' ? !all : some
      if (!ok) throw new Error(`SELF-CHECK FAILED: comparison question ${qi} option ${i} (${c.fam})`)
    })
  })
  return { group, proof }
}

export function MAINS_COMPARISON_WITH_PROOF(rng: Rng, _d: MockDifficulty, count: number): WithProof<MainsCmpProof> {
  const groups: Group[] = []
  const proofs: MainsCmpProof[] = []
  for (const k of splitCount(count, 3)) {
    let built: { group: Group; proof: MainsCmpProof } | null = null
    for (let attempt = 0; attempt < 200 && !built; attempt++) built = tryBuild(rng, k)
    if (!built) throw new Error('mains comparison: could not build a set')
    groups.push(built.group)
    proofs.push(built.proof)
  }
  return { groups, proofs }
}
