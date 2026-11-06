// Mains-level question families over a solved arrangement + set assembly. Every option is a machine-checkable Claim.
import type { Rng } from '../../rng'
import type { Group, MockTopicId, QuestionDraft } from '../../types'
import { answerLine } from '../../options'
import { DIRECTIONS, NUMW, cap, hasDup, pickNames } from '../common'
import {
  compileAtom, grpOf, grpSize, idxOf, isRound, mod, shiftPos, solveCons, type Atom, type Geometry, type Item,
} from './arrEngine'
import { evalClaim, gapOf, fixedCount, type Claim } from './arrClaims'
import {
  arrangementText, BOX_POOLS, DAYS, introText, itemOption, itemText, MONTHS, PERSON_POOLS, SCHED_DAY, SCHED_MONTH, sentence, vpOf,
  type SetDef, type Theme, type ThemeKind,
} from './arrText'
import { buildPuzzle, itemAt, makeCtx, Pof, truth, type BuildOpts, type GenCtx } from './arrGen'

export interface ArrangeProof {
  geom: Geometry
  nA: number
  hidden: number[][]
  clues: Atom[]
  names: string[]
  attrValues: string[][]
  needsSplit: boolean
  questions: { fam: string; deep: boolean; claims: Claim[]; answer: number }[]
}

export interface PuzzleSpec extends BuildOpts {
  kind: ThemeKind
  g: Geometry
  nExtra: number
}

interface QSpec {
  stem: string
  optTexts: string[]
  claims: Claim[]
  answer: number
  fact: string[]
  fam: string
  deep: boolean
}

interface Q {
  c: GenCtx
  th: Theme
  clues: Atom[]
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const PRIMES = [2, 3, 5, 7, 11]

// --------------------------------------------------------------------------- themes

export function makeTheme(rng: Rng, spec: PuzzleSpec): Theme {
  const n = spec.g.n
  const isBox = spec.kind === 'stack'
  const names = pickNames(rng, n, isBox ? 'letters' : undefined)
  const pools = rng.sample(isBox ? BOX_POOLS : PERSON_POOLS, spec.nExtra)
  const attrs = pools.map((pool) => ({ pool, values: rng.sample(pool.values, n) }))
  let labels: string[] = []
  let sched: Theme['sched']
  const sets: SetDef[] = []
  if (spec.kind === 'schedule') {
    if (n === 7) {
      labels = DAYS.slice(0, 7)
      sched = SCHED_DAY
      sets.push({ id: 'weekend', ps: [5, 6], yes: 'has an appointment on a weekend day', no: 'does not have an appointment on a weekend day' })
    } else {
      const start = rng.int(0, 12 - n)
      labels = MONTHS.slice(start, start + n)
      sched = SCHED_MONTH
      const ps = labels.map((_, i) => i).filter((i) => MONTH_DAYS[start + i] === 31)
      sets.push({ id: 'd31', ps, yes: 'was born in a month having 31 days', no: 'was not born in a month having 31 days' })
    }
  }
  if (spec.kind === 'floor') {
    const prime = Array.from({ length: n }, (_, i) => i).filter((i) => PRIMES.includes(i + 1))
    const m3 = Array.from({ length: n }, (_, i) => i).filter((i) => (i + 1) % 3 === 0)
    sets.push({ id: 'prime', ps: prime, yes: 'lives on a prime-numbered floor', no: 'does not live on a prime-numbered floor' })
    sets.push({ id: 'mult3', ps: m3, yes: 'lives on a floor whose number is a multiple of 3', no: 'does not live on a floor whose number is a multiple of 3' })
  }
  return { kind: spec.kind, g: spec.g, names, prefix: isBox ? 'box ' : '', who: isBox ? 'Which box' : 'Who', attrs, labels, sched, sets }
}

// --------------------------------------------------------------------------- helpers

const COUNT_WORD = (v: number): string => (v === 0 ? 'None' : cap(NUMW[v]))
const relRef = (th: Theme): string => (th.kind === 'stack' ? 'the box that' : 'the person who')
const rowLike = (g: Geometry): boolean => g.kind === 'row' || (g.kind === 'stacks' && g.stacks === 1)
const holds = (c: GenCtx, cl: Claim): boolean => evalClaim(c.g, cl, Pof(c))
const person = (c: GenCtx, p: number): Item => [0, c.inv[0][p]]
const atomClaim = (a: Atom): Claim => ({ k: 'atom', a })
const normText = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ')

function pickD(c: GenCtx): number {
  const maxd = c.g.kind === 'mixed' && c.g.square ? 1 : 3
  return c.rng.pick([1, -1, 2, -2, 3, -3].filter((v) => Math.abs(v) <= maxd))
}

function futureVp(vp: string): string {
  return vp.replace(/^sits /, 'will sit ').replace(/^lives /, 'will live ').replace(/^is kept /, 'will be kept ').replace(/^faces /, 'will face ')
}

function plural(noun: string): string {
  return noun === 'city' ? 'cities' : `${noun}s`
}

/** Random attribute index (>=1 when attributes exist) used to refer to a person indirectly. */
function indirectAttr(c: GenCtx, pDirect = 0.15): number {
  if (c.nA < 2 || c.rng.chance(pDirect)) return 0
  return c.rng.int(1, c.nA - 1)
}

function describePos(th: Theme, p: number): string {
  const g = th.g
  switch (th.kind) {
    case 'floor':
      return `floor ${p + 1}`
    case 'schedule':
      return th.labels[p]
    case 'stack':
      return g.kind === 'stacks' && g.stacks > 1 ? `stack ${grpOf(g, p) + 1}, position ${idxOf(g, p) + 1}` : `position ${p + 1}`
    case 'tworow':
      return `row ${grpOf(g, p) + 1}, position ${idxOf(g, p) + 1} from the left`
    case 'row':
      return `position ${p + 1} from the left`
    default:
      return `seat ${p + 1}`
  }
}

function numOptions(rng: Rng, v: number, lo: number, hi: number): { texts: string[]; vals: number[]; answer: number } | null {
  const feas: number[] = []
  for (let j = 0; j < 5; j++) {
    const s = v - j
    if (s >= lo && s + 4 <= hi) feas.push(j)
  }
  if (!feas.length) return null
  const j = rng.pick(feas)
  let vals = Array.from({ length: 5 }, (_, i) => v - j + i)
  // small answers would otherwise crowd the first options: half of the time the numbers are listed in mixed order
  if (rng.chance(0.5)) vals = rng.shuffle(vals)
  return { texts: vals.map(COUNT_WORD), vals, answer: vals.indexOf(v) }
}

function assemble(q: Q, stem: string, correct: { t: string; claim: Claim }, wrong: { t: string; claim: Claim }[], fact: string[], fam: string, deep: boolean): QSpec | null {
  const { c } = q
  if (wrong.length < 4) return null
  const all = wrong.slice(0, 4)
  const ans = c.rng.int(0, 4)
  all.splice(ans, 0, correct)
  if (all.some((x) => typeof x.t !== "string")) throw new Error("undefined option text in " + fam + JSON.stringify(all.map((x) => x.t)))
  if (hasDup(all.map((x) => x.t))) return null
  const tr = all.map((x) => holds(c, x.claim))
  if (tr.filter(Boolean).length !== 1 || !tr[ans]) return null
  return { stem, optTexts: all.map((x) => x.t), claims: all.map((x) => x.claim), answer: ans, fact, fam, deep }
}

function assembleNum(q: Q, stem: string, mk: (v: number) => Claim, v: number, lo: number, hi: number, fact: string[], fam: string, deep: boolean): QSpec | null {
  const { c } = q
  const w = numOptions(c.rng, v, lo, hi)
  if (!w) return null
  const claims = w.vals.map(mk)
  const tr = claims.map((cl) => holds(c, cl))
  if (tr.filter(Boolean).length !== 1 || !tr[w.answer]) return null
  return { stem, optTexts: w.texts, claims, answer: w.answer, fact, fam, deep }
}

/** Distinct persons other than `exclude`, preferring the listed trap positions. */
function pickPersons(c: GenCtx, target: number, trapPositions: number[], k = 4): number[] | null {
  const out: number[] = []
  for (const p of trapPositions) {
    if (!Number.isInteger(p) || p < 0 || p >= c.n) continue
    const v = c.inv[0][p]
    if (v !== target && !out.includes(v)) out.push(v)
    if (out.length === k) return out
  }
  const rest = c.rng.shuffle(Array.from({ length: c.n }, (_, i) => i).filter((v) => v !== target && !out.includes(v)))
  for (const v of rest) {
    if (out.length === k) break
    out.push(v)
  }
  return out.length === k ? out : null
}

function oppPos(g: Geometry, p: number): number {
  if (g.kind === 'tworow') {
    const m = g.n / 2
    return (grpOf(g, p) === 0 ? m : 0) + (m - 1 - idxOf(g, p))
  }
  return mod(p + g.n / 2, g.n)
}

/** Relation used as the last hop of chain / swap questions: faces or opposite for tables, none otherwise. */
function acrossAtom(g: Geometry, x: Item, y: Item, ypos: number): Atom | null {
  if (g.kind === 'tworow') return { t: 'face', x, y }
  if (g.kind === 'circle') return g.facing === 'in' ? { t: 'face', x, y } : { t: 'opp', x, y }
  if (g.kind === 'mixed') return g.square && ypos % 2 === 1 ? { t: 'face', x, y } : { t: 'opp', x, y }
  return null
}

// --------------------------------------------------------------------------- families

/** Who/what is at the end of a two-step chain that starts from an attribute item. */
function chain(q: Q): QSpec | null {
  const { c, th } = q
  const { g, rng } = c
  const ps = rng.int(0, c.n - 1)
  const attrA = indirectAttr(c, 0.1)
  const S = itemAt(c, attrA, ps)
  const d1 = pickD(c)
  const p1 = shiftPos(g, ps, d1)
  if (p1 < 0) return null
  const z = person(c, p1)
  const role: Atom = { t: 'off', x: z, y: S, d: d1 }
  let mkFinal: (v: Item) => Atom
  let pp: number
  const useAcross = rng.chance(0.3) && acrossAtom(g, z, z, p1) !== null
  if (useAcross) {
    pp = oppPos(g, p1)
    mkFinal = (v) => acrossAtom(g, v, z, p1) as Atom
  } else {
    const d2 = pickD(c)
    pp = shiftPos(g, p1, d2)
    if (pp < 0) return null
    mkFinal = (v) => ({ t: 'off', x: v, y: z, d: d2 })
  }
  if (pp === ps || pp === p1) return null
  const roleRef = `${relRef(th)} ${vpOf(th, role)}`
  const target = c.inv[0][pp]
  const finalVp = vpOf(th, mkFinal([0, 0]), roleRef)
  const traps: number[] = [p1, ps, c.inv[0][pp] === c.inv[0][ps] ? -1 : ps]
  const d2s = [-1, 1, 2, -2, 3, -3]
  for (const dd of d2s) {
    traps.push(shiftPos(g, p1, dd), shiftPos(g, ps, dd))
  }
  traps.push(oppPos(g, p1), shiftPos(g, ps, -d1))
  const trapList = rng.shuffle(traps.slice(0, 3)).concat(rng.shuffle(traps.slice(3)))
  const askAttr = c.nA > 1 && rng.chance(0.55)
  const nameOf = (p: number) => th.names[c.inv[0][p]]
  const fact: string[] = []
  if (attrA > 0) fact.push(`${cap(itemText(th, S))} is ${nameOf(ps)}.`)
  fact.push(sentence(th, { t: 'off', x: z, y: person(c, ps), d: role.d }))
  const finalNamed = mkFinal([0, target])
  if (askAttr) {
    const bc = Array.from({ length: c.nA - 1 }, (_, i) => i + 1).filter((v) => v !== attrA)
    const b = rng.pick(bc.length ? bc : [1])
    const pool = th.attrs[b - 1]
    const subj = `${relRef(th)} ${finalVp}`
    const stem = pool.pool.ask(subj)
    const tv = c.inv[b][pp]
    const wrongPos = pickPersons(c, target, trapList, 4)
    if (!wrongPos) return null
    const mkc = (u: number): Claim => atomClaim({ t: 'and', cs: [role, mkFinal([b, u])] })
    const wrong = wrongPos.map((v) => ({ t: pool.values[c.inv[b][c.hidden[0][v]]], claim: mkc(c.inv[b][c.hidden[0][v]]) }))
    fact.push(sentence(th, finalNamed))
    fact.push(sentence(th, { t: 'eq', x: [0, target], y: [b, tv] }))
    return assemble(q, stem, { t: pool.values[tv], claim: mkc(tv) }, wrong, fact, 'chain', true)
  }
  const stem = `${th.who} ${finalVp}?`
  const wrongP = pickPersons(c, target, trapList, 4)
  if (!wrongP) return null
  const mkc = (v: number): Claim => atomClaim({ t: 'and', cs: [role, mkFinal([0, v])] })
  fact.push(sentence(th, finalNamed))
  return assemble(q, stem, { t: th.names[target], claim: mkc(target) }, wrongP.map((v) => ({ t: th.names[v], claim: mkc(v) })), fact, 'chain', true)
}

/** Which attribute value belongs to the person at a relation from an attribute item (single hop, cross attribute). */
function attrRel(q: Q): QSpec | null {
  const { c, th } = q
  const { g, rng } = c
  if (c.nA < 3) return null
  const a = rng.int(1, c.nA - 1)
  let b = rng.int(1, c.nA - 1)
  if (b === a) b = a === 1 ? 2 : 1
  const py = rng.int(0, c.n - 1)
  const d = pickD(c)
  const px = shiftPos(g, py, d)
  if (px < 0) return null
  const y = itemAt(c, b, py)
  const mk = (u: number): Atom => ({ t: 'off', x: [a, u], y, d })
  const pool = th.attrs[a - 1]
  const tv = c.inv[a][px]
  const subj = `${relRef(th)} ${vpOf(th, mk(tv))}`
  const others = rng.sample(Array.from({ length: c.n }, (_, i) => i).filter((v) => v !== tv), 4)
  const fact = [`${cap(itemText(th, y))} is ${th.names[c.inv[0][py]]}.`, sentence(th, { t: 'off', x: person(c, px), y: person(c, py), d }), sentence(th, { t: 'eq', x: [0, c.inv[0][px]], y: [a, tv] })]
  return assemble(q, pool.pool.ask(subj), { t: pool.values[tv], claim: atomClaim(mk(tv)) }, others.map((v) => ({ t: pool.values[v], claim: atomClaim(mk(v)) })), fact, 'attrRel', false)
}

function gapAttr(q: Q): QSpec | null {
  const { c, th } = q
  const { g, rng } = c
  if (c.nA < 2 || grpSize(g) < 6) return null
  const sz = grpSize(g)
  const px = rng.int(0, c.n - 1)
  let side: 1 | -1 | undefined
  let py: number
  if (isRound(g)) {
    side = rng.pick([1, -1] as const)
    const k = rng.int(0, 4)
    py = mod(px + side * (k + 1), c.n)
  } else {
    const gi = grpOf(g, px)
    py = gi * sz + rng.int(0, sz - 1)
    if (py === px) return null
  }
  const ax = indirectAttr(c, 0.05)
  const ay = indirectAttr(c, 0.05)
  const x = itemAt(c, ax, px)
  const y = itemAt(c, ay, py)
  if (ax === 0 && ay === 0) return null
  const k = gapOf(g, Pof(c), x, y, side)
  if (k < 0 || k > 5) return null
  const X = itemText(th, x)
  const Y = itemText(th, y)
  const q1 = th.kind === 'floor' ? `How many persons live between ${X} and ${Y}?` : th.kind === 'schedule' ? `How many persons ${(th.sched as { plural: string }).plural} between ${X} and ${Y}?` : th.kind === 'stack' ? `How many boxes are kept between ${X} and ${Y}?` : `How many persons sit between ${X} and ${Y}?`
  let stem = q1
  if (g.kind === 'circle') stem = q1.replace(/\?$/, ` when counted from the ${side === 1 ? 'right' : 'left'} of ${X}?`)
  if (g.kind === 'mixed') stem = q1.replace(/\?$/, ` when counted in the ${side === 1 ? 'anticlockwise' : 'clockwise'} direction from ${X}?`)
  const nm = (it: Item) => th.names[c.inv[0][c.hidden[it[0]][it[1]]]]
  const who = (it: Item, T: string): string => (it[0] === 0 ? '' : `${cap(T)} is ${nm(it)}. `)
  const fact = [`${who(x, X)}${who(y, Y)}`.trim() || `${nm(x)} and ${nm(y)} are the two persons concerned.`, `Persons between ${nm(x)} and ${nm(y)}: ${k}.`]
  return assembleNum(q, stem, (v) => ({ k: 'gap', x, y, side, v }), k, 0, 6, fact, 'gapAttr', true)
}

function countSide(q: Q): QSpec | null {
  const { c, th } = q
  const { g, rng } = c
  if (!rowLike(g) || c.nA < 2 || (th.kind !== 'row' && th.kind !== 'floor')) return null
  const p = rng.int(0, c.n - 1)
  const dir = rng.chance(0.5) ? 'lo' : 'hi'
  const k = dir === 'lo' ? p : c.n - 1 - p
  const x = itemAt(c, rng.int(1, c.nA - 1), p)
  const X = itemText(th, x)
  const stem = th.kind === 'row' ? `How many persons sit to the ${dir === 'lo' ? 'left' : 'right'} of ${X}?` : `How many persons live ${dir === 'lo' ? 'below' : 'above'} ${X}?`
  const fact = [`${cap(X)} is ${th.names[c.inv[0][p]]}, ${describePos(th, p)}.`, `Persons ${dir === 'lo' ? (th.kind === 'row' ? 'to his left' : 'below him') : th.kind === 'row' ? 'to his right' : 'above him'}: ${k}.`]
  return assembleNum(q, stem, (v) => ({ k: 'cnt', x, dir, v }), k, 0, 7, fact, 'countSide', false)
}

function midway(q: Q): QSpec | null {
  const { c, th } = q
  const { rng } = c
  if (!rowLike(c.g) || c.nA < 2) return null
  const half = rng.int(1, 3)
  const px = rng.int(0, c.n - 1 - 2 * half)
  const py = px + 2 * half
  const flip = rng.chance(0.5)
  const ax = indirectAttr(c, 0.05)
  const ay = indirectAttr(c, 0.05)
  if (ax === 0 && ay === 0) return null
  const x = itemAt(c, ax, flip ? py : px)
  const y = itemAt(c, ay, flip ? px : py)
  const tp = px + half
  const target = c.inv[0][tp]
  const dx = flip ? -half : half
  const mk = (v: number): Atom => ({ t: 'and', cs: [{ t: 'off', x: [0, v], y: x, d: dx }, { t: 'off', x: [0, v], y: y, d: -dx }] })
  const X = itemText(th, x)
  const Y = itemText(th, y)
  let stem: string
  switch (th.kind) {
    case 'floor':
      stem = `Who lives exactly midway between the floors of ${X} and ${Y}?`
      break
    case 'schedule':
      stem = `Who ${(th.sched as { yes: string }).yes} exactly midway between ${X} and ${Y}?`
      break
    case 'stack':
      stem = `Which box is kept exactly midway between ${X} and ${Y}?`
      break
    default:
      stem = `Who sits exactly in the middle of ${X} and ${Y}?`
  }
  const nm = (p: number) => th.names[c.inv[0][p]]
  const fact = [`${cap(X)} is ${nm(flip ? py : px)} and ${Y} is ${nm(flip ? px : py)} (${describePos(th, px)} and ${describePos(th, py)}).`, `${half} ${half === 1 ? 'place' : 'places'} from each of them, exactly in the middle, is ${nm(tp)}.`]
  const wrongP = pickPersons(c, target, [tp - 1, tp + 1, px, py, px + half * 2 - 1, px + 1], 4)
  if (!wrongP) return null
  return assemble(q, stem, { t: th.names[target], claim: atomClaim(mk(target)) }, wrongP.map((v) => ({ t: th.names[v], claim: atomClaim(mk(v)) })), fact, 'midway', true)
}

function alphaFixed(q: Q): QSpec | null {
  const { c, th } = q
  const { g, rng } = c
  if (!rowLike(g)) return null
  const textAttrs = th.attrs.map((a, i) => ({ a, i: i + 1 })).filter((x) => !['age', 'salary', 'weight'].includes(x.a.pool.key))
  const byAttr = textAttrs.length > 0 && rng.chance(0.4) ? rng.pick(textAttrs) : null
  const rev = rng.chance(0.25)
  const keys = Array.from({ length: c.n }, (_, person) => (byAttr ? byAttr.a.values[c.inv[byAttr.i][c.hidden[0][person]]] : th.names[person]))
  const v = fixedCount(g, Pof(c), keys, rev)
  if (v > 5) return null
  const what = byAttr ? `the ${plural(byAttr.a.pool.noun)} of the persons` : th.kind === 'stack' ? 'their labels' : 'their names'
  const ord = rev ? `reverse alphabetical order (Z to A) of ${what}` : `alphabetical order (A to Z) of ${what}`
  let stem: string
  switch (th.kind) {
    case 'floor':
      stem = `If all the persons are rearranged from the lowest floor to the topmost floor in the ${ord}, how many persons will remain on the same floor as before?`
      break
    case 'schedule':
      stem = `If all the persons are rearranged from ${th.labels[0]} to ${th.labels[c.n - 1]} in the ${ord}, how many persons will keep the same ${(th.sched as { unit: string }).unit} as before?`
      break
    case 'stack':
      stem = `If all the boxes are rearranged from the bottom to the top of the stack in the ${ord}, how many boxes will remain at the same position as before?`
      break
    default:
      stem = `If all the persons are rearranged from left to right in the ${ord}, how many persons will occupy the same position as before?`
  }
  const order = Array.from({ length: c.n }, (_, i) => i).sort((a, b) => (keys[a] < keys[b] ? -1 : keys[a] > keys[b] ? 1 : 0) * (rev ? -1 : 1))
  const fact = [
    `Present order: ${Array.from({ length: c.n }, (_, p) => `${th.names[c.inv[0][p]]}${byAttr ? ` (${keys[c.inv[0][p]]})` : ''}`).join(', ')}.`,
    `New order: ${order.map((p) => `${th.names[p]}${byAttr ? ` (${keys[p]})` : ''}`).join(', ')}.`,
    `Positions unchanged: ${order.map((p, r) => (c.hidden[0][p] === r ? th.names[p] : '')).filter(Boolean).join(', ') || 'none'} = ${v}.`,
  ]
  return assembleNum(q, stem, (val) => ({ k: 'fixed', keys, rev, v: val }), v, 0, 6, fact, 'alphaFixed', true)
}

function swapAsk(q: Q): QSpec | null {
  const { c, th } = q
  const { g, rng } = c
  if (th.kind === 'schedule') return null
  const u1 = rng.int(0, c.n - 1)
  let u2 = rng.int(0, c.n - 1)
  while (u2 === u1) u2 = rng.int(0, c.n - 1)
  const p = c.hidden[0][u1]
  const r = c.hidden[0][u2]
  const swp = (pos: number) => (pos === p ? r : pos === r ? p : pos)
  const a1 = indirectAttr(c, 0.55)
  const a2 = indirectAttr(c, 0.55)
  const i1 = itemAt(c, a1, p)
  const i2 = itemAt(c, a2, r)
  const T1 = itemText(th, i1)
  const T2 = itemText(th, i2)
  const noun = th.kind === 'floor' ? 'floors' : th.kind === 'circle' || th.kind === 'mixed' || th.kind === 'square' ? 'seats' : 'positions'
  const lead = `If ${T1} and ${T2} interchange their ${noun}`
  const nm = (pos: number) => th.names[c.inv[0][pos]]
  const swapNote = `${nm(p)} and ${nm(r)} swap places (${describePos(th, p)} <-> ${describePos(th, r)}).`
  // numeric variant (row-like or round tables with a direction)
  if (grpSize(g) >= 6 && rng.chance(0.3)) {
    const ax = indirectAttr(c, 0.2)
    const ay = indirectAttr(c, 0.2)
    const px = rng.int(0, c.n - 1)
    const sz = grpSize(g)
    let side: 1 | -1 | undefined
    let py: number
    if (isRound(g)) {
      side = rng.pick([1, -1] as const)
      py = mod(px + side * (rng.int(0, 4) + 1), c.n)
    } else {
      py = grpOf(g, px) * sz + rng.int(0, sz - 1)
      if (py === px) return null
    }
    const x = itemAt(c, ax, px)
    const y = itemAt(c, ay, py)
    const before = gapOf(g, Pof(c), x, y, side)
    const P2 = (it: Item) => swp(c.hidden[it[0]][it[1]])
    const after = gapOf(g, P2, x, y, side)
    if (after < 0 || after > 5 || before === after) return null
    const X = itemText(th, x)
    const Y = itemText(th, y)
    let stem = `${lead}, how many ${th.kind === 'stack' ? 'boxes' : 'persons'} will ${th.kind === 'floor' ? 'live' : th.kind === 'stack' ? 'be kept' : 'sit'} between ${X} and ${Y}?`
    if (g.kind === 'circle') stem = stem.replace(/\?$/, ` (counted from the ${side === 1 ? 'right' : 'left'} of ${X})?`)
    if (g.kind === 'mixed') stem = stem.replace(/\?$/, ` (counted in the ${side === 1 ? 'anticlockwise' : 'clockwise'} direction from ${X})?`)
    const fact = [swapNote, `Before the change there were ${before} persons between them; after it there are ${after}.`]
    return assembleNum(q, stem, (v) => ({ k: 'after', sw: [u1, u2], c: { k: 'gap', x, y, side, v } }), after, 0, 6, fact, 'swapAsk', true)
  }
  // who-variant: who will be at a given relation to Z after the swap
  const az = indirectAttr(c, 0.3)
  const pz = rng.int(0, c.n - 1)
  const z = itemAt(c, az, pz)
  const pzNew = swp(pz)
  let mkAtom: (v: Item) => Atom
  let newPosOrig: number
  const across = acrossAtom(g, z, z, pzNew)
  if (across && rng.chance(0.35)) {
    mkAtom = (v) => acrossAtom(g, v, z, pzNew) as Atom
    newPosOrig = swp(oppPos(g, pzNew))
  } else {
    const d = pickD(c)
    const t = shiftPos(g, pzNew, d)
    if (t < 0) return null
    mkAtom = (v) => ({ t: 'off', x: v, y: z, d })
    newPosOrig = swp(t)
  }
  const target = c.inv[0][newPosOrig]
  const oldTarget = ((): number => {
    const a = mkAtom([0, 0])
    if (a.t === 'off') {
      const t = shiftPos(g, pz, a.d)
      return t < 0 ? -1 : c.inv[0][t]
    }
    return c.inv[0][oppPos(g, pz)]
  })()
  const Z = itemText(th, z)
  const vp = futureVp(vpOf(th, mkAtom([0, 0]), Z))
  const stem = `${lead}, ${th.who.toLowerCase() === 'who' ? 'who' : 'which box'} ${vp}?`
  const mkc = (v: number): Claim => ({ k: 'after', sw: [u1, u2], c: atomClaim(mkAtom([0, v])) })
  const traps = [oldTarget < 0 ? -1 : c.hidden[0][oldTarget], p, r]
  const wrongP = pickPersons(c, target, traps, 4)
  if (!wrongP || oldTarget === target) return null
  const fact = [swapNote, `${cap(Z)} is ${nm(pz)}${pzNew !== pz ? `, who moves to ${describePos(th, pzNew)}` : ''}.`, `In the new arrangement ${sentence(th, mkAtom([0, target])).replace(/^(.*?) (sits|lives|is kept|faces|will)/, '$1 $2')}`]
  return assemble(q, stem, { t: th.names[target], claim: mkc(target) }, wrongP.map((v) => ({ t: th.names[v], claim: mkc(v) })), fact, 'swapAsk', true)
}

// ---- statements ---------------------------------------------------------------------------

function statementTypes(c: GenCtx): Atom['t'][] {
  const k = c.g.kind
  const t: Atom['t'][] = ['off', 'adj', 'eq']
  if (k === 'row' || k === 'stacks') t.push('lt', 'btw', 'off')
  if (k === 'tworow') t.push('face', 'same', 'btw')
  if (k === 'circle') t.push('btw', 'off')
  if (k === 'mixed') t.push('opp', 'btw', 'off')
  return t
}

function trueStatement(c: GenCtx): Atom | null {
  const { rng, g, n } = c
  const types = statementTypes(c)
  const t = rng.pick(types)
  const px = rng.int(0, n - 1)
  const ia = (p: number): Item => itemAt(c, c.nA > 1 && rng.chance(0.75) ? rng.int(1, c.nA - 1) : 0, p)
  switch (t) {
    case 'off': {
      const d = pickD(c)
      const py = shiftPos(g, px, d)
      if (py < 0) return null
      return { t: 'off', x: ia(py), y: ia(px), d }
    }
    case 'adj': {
      const py = isRound(g) ? mod(px + rng.pick([1, -1]), n) : shiftPos(g, px, rng.pick([1, -1]))
      return py < 0 ? null : { t: 'adj', x: ia(px), y: ia(py) }
    }
    case 'eq': {
      if (c.nA < 3) return null
      const a = rng.int(1, c.nA - 1)
      const b = a === 1 ? 2 : 1
      return { t: 'eq', x: itemAt(c, a, px), y: itemAt(c, b, px) }
    }
    case 'lt': {
      const iy = idxOf(g, px)
      if (iy < 2) return null
      return { t: 'lt', x: ia(grpOf(g, px) * grpSize(g) + rng.int(0, iy - 2)), y: ia(px) }
    }
    case 'btw': {
      const k = rng.int(1, isRound(g) ? 3 : 3)
      if (isRound(g)) {
        const side = rng.pick([1, -1] as const)
        return { t: 'btw', x: ia(px), y: ia(mod(px + side * (k + 1), n)), k, side }
      }
      const py = shiftPos(g, px, rng.pick([1, -1]) * (k + 1))
      return py < 0 ? null : { t: 'btw', x: ia(px), y: ia(py), k }
    }
    case 'face':
      return { t: 'face', x: ia(px), y: ia(oppPos(g, px)) }
    case 'opp':
      return { t: 'opp', x: ia(px), y: ia(oppPos(g, px)) }
    case 'same': {
      const sz = grpSize(g)
      const py = grpOf(g, px) * sz + rng.int(0, sz - 1)
      return py === px ? null : { t: 'same', x: ia(px), y: ia(py) }
    }
    default:
      return null
  }
}

/** Candidate FALSE statements that differ only slightly from a true one (classic exam distractors). */
function nearMisses(c: GenCtx, a: Atom): Atom[] {
  const out: Atom[] = []
  const other = (it: Item): Item => itemAt(c, it[0], c.rng.int(0, c.n - 1))
  switch (a.t) {
    case 'off':
      for (const d of [a.d + 1, a.d - 1, -a.d, a.d * 2]) if (d !== 0 && Math.abs(d) <= 4 && d !== a.d) out.push({ ...a, d })
      out.push({ t: 'off', x: a.y, y: a.x, d: a.d })
      out.push({ ...a, x: other(a.x) })
      break
    case 'adj':
      out.push({ t: 'off', x: a.x, y: a.y, d: 2 }, { t: 'off', x: a.x, y: a.y, d: -2 }, { ...a, y: other(a.y) })
      break
    case 'eq':
      out.push({ ...a, y: other(a.y) }, { ...a, y: other(a.y) })
      break
    case 'lt':
      out.push({ t: 'lt', x: a.y, y: a.x }, { ...a, x: other(a.x) })
      break
    case 'btw':
      out.push({ ...a, k: a.k + 1 }, { ...a, k: Math.max(0, a.k - 1) }, { ...a, k: a.k + 2 }, { ...a, y: other(a.y) })
      if (a.side) out.push({ ...a, side: (-a.side) as 1 | -1 })
      break
    case 'face':
      out.push({ t: 'adj', x: a.x, y: a.y }, { ...a, y: other(a.y) }, { t: 'opp', x: a.x, y: other(a.y) })
      break
    case 'opp':
      out.push({ ...a, y: other(a.y) }, { t: 'adj', x: a.x, y: a.y })
      break
    case 'same':
      out.push({ ...a, y: other(a.y) }, { ...a, y: other(a.y) })
      break
    default:
      break
  }
  return out.filter((x) => x.t !== 'off' || (x.x[0] !== x.y[0] || x.x[1] !== x.y[1])).filter((x) => !truth(c, x))
}

function statementPool(q: Q, nTrue: number, nFalse: number): { trues: Atom[]; falses: Atom[] } | null {
  const { c, th } = q
  const trues: Atom[] = []
  const falses: Atom[] = []
  const seen = new Set<string>()
  for (let i = 0; i < 160 && (trues.length < nTrue || falses.length < nFalse); i++) {
    const a = trueStatement(c)
    if (!a) continue
    const s = sentence(th, a)
    if (seen.has(s)) continue
    if (falses.length < nFalse) {
      const ms = nearMisses(c, a)
      if (ms.length) {
        const m = c.rng.pick(ms)
        const ms2 = sentence(th, m)
        if (!seen.has(ms2)) {
          seen.add(ms2)
          falses.push(m)
          if (trues.length >= nTrue) {
            seen.add(s)
            continue
          }
        }
      }
    }
    if (trues.length < nTrue) {
      seen.add(s)
      trues.push(a)
    }
  }
  return trues.length >= nTrue && falses.length >= nFalse ? { trues, falses } : null
}

function stmtTF(q: Q): QSpec | null {
  const { c, th } = q
  const wantTrue = c.rng.chance(0.5)
  const pool = statementPool(q, wantTrue ? 1 : 4, wantTrue ? 4 : 1)
  if (!pool) return null
  const fact = (a: Atom, verdict: boolean) => `${sentence(th, a)} (${verdict ? 'true' : 'false in the final arrangement'})`
  if (wantTrue) {
    const t = pool.trues[0]
    return assemble(q, 'Which of the following statements is true?', { t: sentence(th, t), claim: atomClaim(t) }, pool.falses.map((a) => ({ t: sentence(th, a), claim: atomClaim(a) })), [`Checking each option against the final arrangement, only this one holds: ${fact(t, true)}`], 'stmtTrue', true)
  }
  const bad = pool.falses[0]
  return assemble(
    q,
    'Which of the following statements is NOT true?',
    { t: sentence(th, bad), claim: atomClaim({ t: 'not', c: bad }) },
    pool.trues.map((a) => ({ t: sentence(th, a), claim: atomClaim({ t: 'not', c: a }) })),
    [`Checking each option against the final arrangement, only this one fails: ${fact(bad, false)}`, 'The other four statements all match the final arrangement.'],
    'stmtFalse',
    true,
  )
}

const ROMAN = ['I', 'II', 'III']
function maskText(m: number): string {
  if (m === 0) return 'None of the statements is true'
  const ids = [0, 1, 2].filter((i) => m & (1 << i)).map((i) => ROMAN[i])
  if (ids.length === 3) return 'All of I, II and III are true'
  if (ids.length === 1) return `Only ${ids[0]} is true`
  return `Only ${ids[0]} and ${ids[1]} are true`
}

function multiStmt(q: Q): QSpec | null {
  const { c, th } = q
  const { rng } = c
  const nT = rng.int(1, 2)
  const pool = statementPool(q, nT, 3 - nT)
  if (!pool) return null
  const items = rng.shuffle([...pool.trues.map((a) => ({ a, t: true })), ...pool.falses.map((a) => ({ a, t: false }))])
  const stmts = items.map((x) => x.a)
  const mask = items.reduce((m, x, i) => (x.t ? m | (1 << i) : m), 0)
  const near = [0, 1, 2].map((i) => mask ^ (1 << i))
  const rest = [...new Set([...near, 0, 7, ...[1, 2, 3, 4, 5, 6]])].filter((m) => m !== mask)
  const wrongMasks = [...rng.shuffle(near), ...rng.shuffle(rest.filter((m) => !near.includes(m)))].slice(0, 4)
  const masks = rng.shuffle([mask, ...wrongMasks])
  const stem = `Consider the following statements based on the given arrangement:\n${items.map((x, i) => `${ROMAN[i]}. ${sentence(th, x.a)}`).join('\n')}\nWhich of the statements given above is/are true?`
  const answer = masks.indexOf(mask)
  const claims: Claim[] = masks.map((m) => ({ k: 'subset', stmts, mask: m }))
  if (new Set(masks).size !== 5) return null
  const fact = items.map((x, i) => `Statement ${ROMAN[i]}: ${x.t ? 'true' : 'false'} - ${sentence(th, x.a)}`)
  const spec = { stem, optTexts: masks.map(maskText), claims, answer, fact, fam: 'multiStmt', deep: true }
  const tr = claims.map((cl) => holds(c, cl))
  return tr.filter(Boolean).length === 1 && tr[answer] ? spec : null
}

// ---- pairs ---------------------------------------------------------------------------------

/** Item-pair option text, e.g. "Red - Pune". */
const pairText = (th: Theme, x: Item, y: Item): string => `${itemOption(th, x)} - ${itemOption(th, y)}`

function circDist(n: number, a: number, b: number): number {
  const d = mod(a - b, n)
  return Math.min(d, n - d)
}

/** Atom "x and y have exactly k persons between them (shorter arc on round tables)". */
function gapRel(g: Geometry, x: Item, y: Item, k: number): Atom {
  if (isRound(g)) return { t: 'or', cs: [{ t: 'btw', x, y, k, side: 1 }, { t: 'btw', x, y, k, side: -1 }] }
  return { t: 'btw', x, y, k }
}

function oddOne(q: Q): QSpec | null {
  const { c, th } = q
  const { g, rng, n } = c
  if (c.nA < 2) return null
  const posPairs: { a: number; b: number; rel: Atom; feat: number[] }[] = []
  const ia = (p: number): Item => itemAt(c, rng.int(1, c.nA - 1), p)
  let relText = ''
  if (g.kind === 'tworow') {
    const m = n / 2
    const cols = rng.shuffle(Array.from({ length: m }, (_, i) => i))
    const facing = cols.slice(0, 4)
    for (const i of facing) {
      const a = i
      const b = m + (m - 1 - i)
      posPairs.push({ a, b, rel: { t: 'face', x: ia(a), y: ia(b) }, feat: [1] })
    }
    const i = rng.int(0, m - 1)
    let j = rng.int(0, m - 1)
    while (j === m - 1 - i) j = rng.int(0, m - 1)
    posPairs.push({ a: i, b: m + j, rel: { t: 'face', x: ia(i), y: ia(m + j) }, feat: [0] })
    relText = 'face each other'
  } else if (isRound(g)) {
    const dd = rng.int(2, 4)
    const all: number[][] = []
    for (let i = 0; i < n; i++) all.push([i, mod(i + dd, n)])
    const seen = new Set<string>()
    const uniq = all.filter((pr) => {
      const k = [Math.min(...pr), Math.max(...pr)].join('-')
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    if (uniq.length < 4) return null
    const four = rng.sample(uniq, 4)
    let dd2 = rng.pick([dd - 1, dd + 1, dd - 2, dd + 2].filter((v) => v >= 1 && v <= n / 2 && v !== dd))
    if (!dd2) dd2 = dd === 1 ? 2 : 1
    const s0 = rng.int(0, n - 1)
    const odd = [s0, mod(s0 + dd2, n)]
    for (const pr of four) {
      const [a, b] = rng.chance(0.5) ? pr : [pr[1], pr[0]]
      posPairs.push({ a, b, rel: gapRel(g, ia(a), ia(b), dd - 1), feat: [dd] })
    }
    posPairs.push({ a: odd[0], b: odd[1], rel: gapRel(g, ia(odd[0]), ia(odd[1]), dd - 1), feat: [dd2] })
    relText = 'gap'
  } else {
    const sz = grpSize(g)
    if (sz < 6) return null
    const dist = rng.int(2, 4)
    const pairs: number[][] = []
    for (let i = 0; i + dist < n; i++) pairs.push([i, i + dist])
    if (pairs.length < 4) return null
    const four = rng.sample(pairs, 4)
    const opts = [dist - 1, dist + 1, dist - 2, dist + 2].filter((v) => v >= 1 && v < n && v !== dist)
    const dist2 = rng.pick(opts)
    const a0 = rng.int(0, n - 1 - dist2)
    for (const pr of four) posPairs.push({ a: pr[0], b: pr[1], rel: { t: 'btw', x: ia(pr[0]), y: ia(pr[1]), k: dist - 1 }, feat: [dist] })
    posPairs.push({ a: a0, b: a0 + dist2, rel: { t: 'btw', x: ia(a0), y: ia(a0 + dist2), k: dist - 1 }, feat: [dist2] })
    relText = 'gap'
  }
  // all pairs must be distinct as item pairs
  const texts = posPairs.map((pp) => {
    const r = pp.rel
    const x = r.t === 'or' ? (r.cs[0] as Extract<Atom, { t: 'btw' }>).x : (r as Extract<Atom, { t: 'face' | 'btw' }>).x
    const y = r.t === 'or' ? (r.cs[0] as Extract<Atom, { t: 'btw' }>).y : (r as Extract<Atom, { t: 'face' | 'btw' }>).y
    return pairText(th, x, y)
  })
  if (new Set(texts.map(normText)).size !== 5) return null
  // the odd pair is the last one; shuffle into option order
  const order = rng.shuffle([0, 1, 2, 3, 4])
  const optTexts = order.map((i) => texts[i])
  const answer = order.indexOf(4)
  const claims: Claim[] = order.map((i) => atomClaim({ t: 'not', c: posPairs[i].rel }))
  const tr = claims.map((cl) => holds(c, cl))
  if (tr.filter(Boolean).length !== 1 || !tr[answer]) return null
  const stem = 'Four of the following five pairs are alike in a certain way based on the given arrangement and hence form a group. Which of the following does not belong to that group?'
  const nm = (it: Item) => th.names[c.inv[0][c.hidden[it[0]][it[1]]]]
  const info = posPairs.map((pp, i) => {
    const r = pp.rel
    const x = r.t === 'or' ? (r.cs[0] as Extract<Atom, { t: 'btw' }>).x : (r as Extract<Atom, { t: 'face' | 'btw' }>).x
    const y = r.t === 'or' ? (r.cs[0] as Extract<Atom, { t: 'btw' }>).y : (r as Extract<Atom, { t: 'face' | 'btw' }>).y
    return `${texts[i]} = ${nm(x)} and ${nm(y)}`
  })
  const fact = [
    relText === 'face' || g.kind === 'tworow' ? 'Four pairs consist of persons who face each other; one pair does not.' : `Four pairs have the same number of ${th.kind === 'stack' ? 'boxes' : 'persons'} between them; one pair has a different number.`,
    ...info.slice(0, 4).map((s) => `Group member: ${s}`),
    `Odd one: ${info[4]}`,
  ]
  return { stem, optTexts, claims, answer, fact, fam: 'oddOne', deep: true }
}

function pairWho(q: Q): QSpec | null {
  const { c, th } = q
  const { g, rng, n } = c
  if (c.nA < 2) return null
  const sz = grpSize(g)
  if (sz < 4) return null
  const k = rng.int(1, g.kind === 'tworow' ? 2 : 3)
  const ia = (p: number): Item => itemAt(c, rng.int(1, c.nA - 1), p)
  const mkPair = (a: number, b: number): { t: string; claim: Claim } => {
    const x = ia(a)
    const y = ia(b)
    return { t: pairText(th, x, y), claim: atomClaim(gapRel(g, x, y, k)) }
  }
  const valid: number[][] = []
  const invalid: number[][] = []
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      if (!isRound(g) && grpOf(g, a) !== grpOf(g, b)) continue
      const dd = isRound(g) ? circDist(n, a, b) : Math.abs(idxOf(g, a) - idxOf(g, b))
      if (dd === k + 1) valid.push([a, b])
      else if (Math.abs(dd - (k + 1)) <= 2 && dd >= 1) invalid.push([a, b])
    }
  }
  if (!valid.length || invalid.length < 4) return null
  const good = rng.pick(valid)
  const bads = rng.sample(invalid, 4)
  const correct = mkPair(good[0], good[1])
  const wrong = bads.map((pr) => mkPair(pr[0], pr[1]))
  const kw = NUMW[k]
  let stem: string
  if (th.kind === 'floor') stem = `Which of the following pairs of persons has exactly ${kw} ${k === 1 ? 'person' : 'persons'} living between them?`
  else if (th.kind === 'stack') stem = `Which of the following pairs of boxes has exactly ${kw} ${k === 1 ? 'box' : 'boxes'} kept between them${g.kind === 'stacks' && g.stacks > 1 ? ' (in the same stack)' : ''}?`
  else if (th.kind === 'schedule') stem = `Which of the following pairs of persons has exactly ${kw} ${k === 1 ? 'person' : 'persons'} between them in the order of ${(th.sched as { units: string }).units}?`
  else if (g.kind === 'tworow') stem = `Which of the following pairs of persons sits in the same row with exactly ${kw} ${k === 1 ? 'person' : 'persons'} between them?`
  else if (isRound(g)) stem = `Which of the following pairs of persons has exactly ${kw} ${k === 1 ? 'person' : 'persons'} sitting between them (along the shorter arc)?`
  else stem = `Which of the following pairs of persons has exactly ${kw} ${k === 1 ? 'person' : 'persons'} sitting between them?`
  const nm = (p: number) => th.names[c.inv[0][p]]
  const fact = [`${correct.t} = ${nm(good[0])} and ${nm(good[1])}, with exactly ${kw} between them.`, `Every other pair has a different number of ${th.kind === 'stack' ? 'boxes' : 'persons'} between them.`]
  return assemble(q, stem, correct, wrong, fact, 'pairWho', true)
}

function combo(q: Q): QSpec | null {
  const { c, th } = q
  const { rng } = c
  if (c.nA < 3) return null
  const comps = c.nA >= 4 ? [1, 2, 3] : [0, 1, 2]
  const p = rng.int(0, c.n - 1)
  const val = (a: number, pos: number) => c.inv[a][pos]
  const text = (vals: number[]) => comps.map((a, i) => itemOption(th, [a, vals[i]])).join(' - ')
  const claimOf = (vals: number[]): Claim =>
    atomClaim({ t: 'and', cs: [{ t: 'eq', x: [comps[0], vals[0]], y: [comps[1], vals[1]] }, { t: 'eq', x: [comps[0], vals[0]], y: [comps[2], vals[2]] }] })
  const tvals = comps.map((a) => val(a, p))
  const wrong: { t: string; claim: Claim }[] = []
  for (let i = 0; i < 80 && wrong.length < 4; i++) {
    const q2 = rng.int(0, c.n - 1)
    if (q2 === p) continue
    const odd = (wrong.length + i) % 3
    const vals = comps.map((a, j) => (j === odd ? val(a, q2) : val(a, p)))
    const cl = claimOf(vals)
    if (holds(c, cl)) continue
    const t = text(vals)
    if (wrong.some((w) => w.t === t)) continue
    wrong.push({ t, claim: cl })
  }
  const hd = c.nA >= 4 ? `${th.attrs[0].pool.noun}, ${th.attrs[1].pool.noun} and ${th.attrs[2].pool.noun}` : `name, ${th.attrs[0].pool.noun} and ${th.attrs[1].pool.noun}`
  const fact = comps.map((a, i) => (i === 0 ? '' : sentence(th, { t: 'eq', x: [comps[0], tvals[0]], y: [a, tvals[i]] }))).filter(Boolean)
  return assemble(q, `Which of the following is the correct combination of ${hd}?`, { t: text(tvals), claim: claimOf(tvals) }, wrong, [`The person with ${itemOption(th, [comps[0], tvals[0]])} is also linked with ${tvals.slice(1).map((v, i) => itemOption(th, [comps[i + 1], v])).join(' and ')}.`, ...fact], 'combo', true)
}

function facingWho(q: Q): QSpec | null {
  const { c, th } = q
  const { g, rng } = c
  if (g.kind !== 'mixed') return null
  const wantIn = rng.chance(0.5)
  const ins: number[] = []
  const outs: number[] = []
  for (let p = 0; p < c.n; p++) (g.pattern[p] === 1 ? ins : outs).push(c.inv[0][p])
  const mk = (v: number): Atom => (wantIn ? { t: 'fin', x: [0, v] } : { t: 'not', c: { t: 'fin', x: [0, v] } })
  const targetPool = wantIn ? ins : outs
  const wrongPool = wantIn ? outs : ins
  if (wrongPool.length < 4) return null
  const t = rng.pick(targetPool)
  const wrongs = rng.sample(wrongPool, 4)
  const stem = wantIn ? 'Who among the following faces the centre of the table?' : 'Who among the following faces outside (away from the centre)?'
  const fact = [`${th.names[t]} sits at ${describePos(th, c.hidden[0][t])} of the table and ${wantIn ? 'faces the centre' : 'faces outside'}.`, 'Each of the other four persons faces the opposite direction.']
  return assemble(q, stem, { t: th.names[t], claim: atomClaim(mk(t)) }, wrongs.map((v) => ({ t: th.names[v], claim: atomClaim(mk(v)) })), fact, 'facingWho', false)
}

type Fam = { id: string; f: (q: Q) => QSpec | null; w: number; ok?: (c: GenCtx) => boolean }

function families(): Fam[] {
  return [
    { id: 'chain', f: chain, w: 20 },
    { id: 'gapAttr', f: gapAttr, w: 11, ok: (c) => grpSize(c.g) >= 6 },
    { id: 'midway', f: midway, w: 9, ok: (c) => rowLike(c.g) },
    { id: 'alphaFixed', f: alphaFixed, w: 15, ok: (c) => rowLike(c.g) },
    { id: 'swapAsk', f: swapAsk, w: 17, ok: (c) => c.th.kind !== 'schedule' },
    { id: 'stmt', f: (q) => stmtTF(q), w: 15 },
    { id: 'multiStmt', f: multiStmt, w: 13 },
    { id: 'oddOne', f: oddOne, w: 12 },
    { id: 'pairWho', f: pairWho, w: 9 },
    { id: 'combo', f: combo, w: 11, ok: (c) => c.nA >= 3 },
    { id: 'attrRel', f: attrRel, w: 7, ok: (c) => c.nA >= 3 },
    { id: 'countSide', f: countSide, w: 4, ok: (c) => rowLike(c.g) },
    { id: 'facingWho', f: facingWho, w: 5, ok: (c) => c.g.kind === 'mixed' },
  ]
}

/** True when ONE clue alone already settles the answer (such questions are too easy and are rejected). */
function singleClueAnswers(q: Q, spec: QSpec): boolean {
  const { c, clues } = q
  if (!spec.claims.every((cl) => cl.k === 'atom')) return false
  const atoms = spec.claims.map((cl) => (cl as { k: 'atom'; a: Atom }).a)
  const correct = compileAtom(c.g, c.n, { t: 'not', c: atoms[spec.answer] })
  const wrongs = atoms.map((a, j) => (j === spec.answer ? null : compileAtom(c.g, c.n, a)))
  for (const cl of clues) {
    const cc = compileAtom(c.g, c.n, cl)
    const r = solveCons(c.g, c.nA, [cc, correct], 1, 400)
    if (r.complete && r.sols.length === 0) return true
    let all = true
    for (const w of wrongs) {
      if (!w) continue
      const r2 = solveCons(c.g, c.nA, [cc, w], 1, 400)
      if (!(r2.complete && r2.sols.length === 0)) {
        all = false
        break
      }
    }
    if (all) return true
  }
  return false
}

function makeQuestions(c: GenCtx, th: Theme, clues: Atom[], k: number): QSpec[] {
  const q: Q = { c, th, clues }
  const fams = families().filter((f) => !f.ok || f.ok(c))
  const out: QSpec[] = []
  const used: Record<string, number> = {}
  const needDeep = Math.min(3, k)
  let guard = 0
  while (out.length < k && guard++ < 400) {
    const avail = fams.filter((f) => !(f.id === 'stmt' && (used.stmt ?? 0) >= 1) && (used[f.id] ?? 0) < (f.id === 'chain' ? 2 : 1))
    if (!avail.length) break
    const remaining = k - out.length
    const deepNow = out.filter((s) => s.deep).length
    const mustDeep = needDeep - deepNow >= remaining
    const total = avail.reduce((s, x) => s + x.w, 0)
    let r = c.rng.next() * total
    let chosen = avail[avail.length - 1]
    for (const a of avail) {
      r -= a.w
      if (r < 0) {
        chosen = a
        break
      }
    }
    const spec = chosen.f(q)
    if (!spec) continue
    if (mustDeep && !spec.deep) continue
    if (out.some((o) => o.stem === spec.stem)) continue
    if (singleClueAnswers(q, spec)) continue
    out.push(spec)
    used[chosen.id] = (used[chosen.id] ?? 0) + 1
    if (chosen.id === 'stmt') used.multiStmt = (used.multiStmt ?? 0) + 1
    if (chosen.id === 'multiStmt') used.stmt = (used.stmt ?? 0) + 1
  }
  if (out.length < k) throw new Error(`mains arrangement: could only build ${out.length}/${k} questions`)
  return c.rng.shuffle(out)
}

export function generateMainsSet(rng: Rng, k: number, topic: MockTopicId, spec: PuzzleSpec): { group: Group; proof: ArrangeProof } {
  const nA = spec.nExtra + 1
  for (let attempt = 0; attempt < 8; attempt++) {
    const th = makeTheme(rng, spec)
    let built: ReturnType<typeof buildPuzzle>
    try {
      built = buildPuzzle(rng, spec.g, nA, th, spec)
    } catch (e) {
      if (attempt < 7) continue
      throw e
    }
    const c = makeCtx(rng, spec.g, nA, th, built.hidden)
    let specs: QSpec[]
    try {
      specs = makeQuestions(c, th, built.clues, k)
    } catch (e) {
      if (attempt < 7) continue
      throw e
    }
    const arrangement = arrangementText(th, built.hidden)
    const clueTexts = built.clues.map((a) => sentence(th, a))
    const questions: QuestionDraft[] = specs.map((s) => {
      const built5 = { options: s.optTexts, answer: s.answer, answerIsNone: false }
      return {
        topic,
        stem: s.stem,
        options: s.optTexts,
        answer: s.answer,
        explanation: `${arrangement}\n${s.fact.join('\n')}\n${answerLine(built5, s.optTexts[s.answer])}`,
      }
    })
    const group: Group = {
      stimulus: { directions: DIRECTIONS, parts: [{ kind: 'text', paragraphs: [...introText(th), ...clueTexts] }] },
      questions,
    }
    const proof: ArrangeProof = {
      geom: spec.g,
      nA,
      hidden: built.hidden,
      clues: built.clues,
      names: th.names,
      attrValues: th.attrs.map((a) => a.values),
      needsSplit: built.needsSplit,
      questions: specs.map((s) => ({ fam: s.fam, deep: s.deep, claims: s.claims, answer: s.answer })),
    }
    return { group, proof }
  }
  throw new Error('mains arrangement: set generation failed')
}

