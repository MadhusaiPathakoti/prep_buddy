// Question families over a solved arrangement + set assembly. Every option is a machine-checkable Atom "claim".
import type { Rng } from '../rng'
import type { Group, MockDifficulty, MockTopicId, QuestionDraft } from '../types'
import { DIRECTIONS, ORD, hasDup, ordinalNum, pickNames } from './common'
import { grpOf, grpSize, idxOf, mod, shiftPos, type Atom, type Geometry, type Item } from './arrange'
import { arrangementText, BOX_POOLS, clause, DAYS, introText, itemOption, itemText, MONTHS, PERSON_POOLS, SCHED_DAY, SCHED_MONTH, sentence, vpOf, type Theme, type ThemeKind } from './arrangeText'
import { buildPuzzle, genClue, genRandom, itemAt, makeCtx, truth, type GenCtx } from './arrangeGen'

export interface ArrangementProof {
  geom: Geometry
  nA: number
  hidden: number[][]
  clues: Atom[]
  questions: { claims: Atom[]; answer: number }[]
}

interface QSpec {
  stem: string
  optTexts: string[]
  claims: Atom[]
  answer: number
  fact: string
  fam: string
}

interface Q {
  c: GenCtx
  th: Theme
}

const COUNT_WORDS = ['None', 'One', 'Two', 'Three', 'Four', 'Five']

const person = (c: GenCtx, p: number): Item => [0, c.inv[0][p]]
const relRef = (th: Theme): string => (th.kind === 'stack' ? 'the box that' : 'the person who')

function assemble(c: GenCtx, stem: string, correct: { t: string; claim: Atom }, wrong: { t: string; claim: Atom }[], fact: string, fam: string): QSpec | null {
  if (wrong.length < 4) return null
  const all = wrong.slice(0, 4)
  const ans = c.rng.int(0, 4)
  all.splice(ans, 0, correct)
  if (hasDup(all.map((x) => x.t))) return null
  const tr = all.map((x) => truth(c, x.claim))
  if (tr.filter(Boolean).length !== 1 || !tr[ans]) return null
  return { stem, optTexts: all.map((x) => x.t), claims: all.map((x) => x.claim), answer: ans, fact, fam }
}

/** Persons (as option items) excluding the given persons. */
function otherPersons(q: Q, exclude: number[], k = 4): number[] {
  const all = Array.from({ length: q.c.n }, (_, i) => i).filter((v) => !exclude.includes(v))
  return q.c.rng.sample(all, k)
}

function shiftOrNull(g: Geometry, p: number, d: number): number {
  return shiftPos(g, p, d)
}

function pickD(c: GenCtx, hardMax = 3): number {
  const maxd = c.g.kind === 'square' ? 1 : c.difficulty === 'hard' ? hardMax : 2
  return c.rng.pick([1, -1, 2, -2, 3, -3].filter((v) => Math.abs(v) <= maxd))
}

function windowOptions(rng: Rng, k: number): { labels: string[]; ks: number[] } {
  const starts = [0, 1].filter((s) => k >= s && k <= s + 4)
  const s = rng.pick(starts)
  return { labels: COUNT_WORDS.slice(s, s + 5), ks: [s, s + 1, s + 2, s + 3, s + 4] }
}

// --------------------------------------------------------------------------- families

function whoOff(q: Q): QSpec | null {
  const { c, th } = q
  const py = c.rng.int(0, c.n - 1)
  const d = pickD(c)
  const px = shiftOrNull(c.g, py, d)
  if (px < 0) return null
  const useAttr = c.nA > 1 && c.rng.chance(c.difficulty === 'hard' ? 0.4 : 0.12)
  const y = itemAt(c, useAttr ? c.rng.int(1, c.nA - 1) : 0, py)
  const mkAtom = (v: number): Atom => ({ t: 'off', x: [0, v], y, d })
  const target = c.inv[0][px]
  const stem = `${th.who} ${vpOf(th, mkAtom(target))}?`
  const wrong = otherPersons(q, [target, c.inv[0][py]]).map((v) => ({ t: th.names[v], claim: mkAtom(v) }))
  return assemble(c, stem, { t: th.names[target], claim: mkAtom(target) }, wrong, sentence(th, mkAtom(target)), 'whoOff')
}

function attrOfOff(q: Q): QSpec | null {
  const { c, th } = q
  if (c.nA < 2) return null
  const py = c.rng.int(0, c.n - 1)
  const d = pickD(c)
  const px = shiftOrNull(c.g, py, d)
  if (px < 0) return null
  const a = c.rng.int(1, c.nA - 1)
  const y = person(c, py)
  const mkAtom = (v: number): Atom => ({ t: 'off', x: [a, v], y, d })
  const tv = c.inv[a][px]
  const pool = th.attrs[a - 1]
  const subj = `${relRef(th)} ${vpOf(th, mkAtom(tv))}`
  const stem = pool.pool.ask(subj)
  const others = c.rng.sample(Array.from({ length: c.n }, (_, i) => i).filter((v) => v !== tv), 4)
  const wrong = others.map((v) => ({ t: pool.values[v], claim: mkAtom(v) }))
  return assemble(c, stem, { t: pool.values[tv], claim: mkAtom(tv) }, wrong, sentence(th, mkAtom(tv)), 'attrOfOff')
}

function btwCount(q: Q): QSpec | null {
  const { c, th } = q
  const { g, rng } = c
  const px = rng.int(0, c.n - 1)
  const k = rng.int(0, 4)
  let py: number
  let side: 1 | -1 | undefined
  if (g.kind === 'circle') {
    side = rng.pick([1, -1] as const)
    py = mod(px + side * (k + 1), c.n)
  } else if (g.kind === 'square') return null
  else {
    py = shiftOrNull(g, px, rng.pick([1, -1]) * (k + 1))
    if (py < 0) return null
  }
  const pa = c.nA > 1 && rng.chance(c.difficulty === 'hard' ? 0.3 : 0)
  const x = itemAt(c, pa ? rng.int(1, c.nA - 1) : 0, px)
  const y = itemAt(c, 0, py)
  const X = itemText(th, x)
  const Y = itemText(th, y)
  const win = windowOptions(rng, k)
  const mk = (kk: number): Atom => (side ? { t: 'btw', x, y, k: kk, side } : { t: 'btw', x, y, k: kk })
  let stem: string
  switch (th.kind) {
    case 'floor':
      stem = `How many persons live between ${X} and ${Y}?`
      break
    case 'schedule':
      stem = `How many persons ${(th.sched as { plural: string }).plural} between ${X} and ${Y}?`
      break
    case 'stack':
      stem = `How many boxes are kept between ${X} and ${Y}?`
      break
    default:
      stem = `How many persons sit between ${X} and ${Y}?`
  }
  if (side) stem = stem.replace(/\?$/, ` when counted from the ${side === 1 ? 'right' : 'left'} of ${X}?`)
  // fixed ascending layout: the answer index follows the window
  const claims = win.ks.map(mk)
  const answer = win.ks.indexOf(k)
  const tr = claims.map((cl) => truth(c, cl))
  if (tr.filter(Boolean).length !== 1 || !tr[answer]) return null
  return { stem, optTexts: win.labels, claims, answer, fact: sentence(th, mk(k)), fam: 'btwCount' }
}

function whoAt(q: Q): QSpec | null {
  const { c, th } = q
  const { g, rng } = c
  const sz = grpSize(g)
  if (g.kind === 'circle' || g.kind === 'square') return null
  const gi = rng.int(0, c.n / sz - 1)
  const idx = rng.int(0, sz - 1)
  const p = gi * sz + idx
  const target = c.inv[0][p]
  const multi = c.n / sz > 1
  const mkAtom = (v: number): Atom => {
    const pos: Atom = { t: 'pos', x: [0, v], p: idx }
    return multi ? { t: 'and', cs: [{ t: 'grp', x: [0, v], g: gi }, pos] } : pos
  }
  let stem: string
  if (th.kind === 'tworow') {
    const lead = idx === 0 ? 'at the extreme left end' : idx === sz - 1 ? 'at the extreme right end' : `${ORD[idx + 1]} from the left end`
    stem = `Who sits ${lead} of row ${gi + 1}?`
  } else if (th.kind === 'stack') {
    const of = multi ? `stack ${gi + 1}` : 'the stack'
    const lead = idx === 0 ? 'at the bottom of' : idx === sz - 1 ? 'at the top of' : `${ORD[idx + 1]} from the bottom of`
    stem = `Which box is kept ${lead} ${of}?`
  } else if (th.kind === 'row' && idx > 0 && idx < sz - 1 && rng.chance(0.5)) {
    stem = `Who sits ${ORD[sz - idx]} from the right end?`
  } else stem = `Who ${vpOf(th, { t: 'pos', x: [0, 0], p: idx })}?`
  const wrong = otherPersons(q, [target]).map((v) => ({ t: th.names[v], claim: mkAtom(v) }))
  const fact = `${th.names[target]} ${vpOf(th, { t: 'pos', x: [0, 0], p: idx })}${multi ? ` (${th.kind === 'stack' ? 'stack' : 'row'} ${gi + 1})` : ''}.`
  return assemble(c, stem, { t: th.names[target], claim: mkAtom(target) }, wrong, fact, 'whoAt')
}

function attrPos(q: Q): QSpec | null {
  const { c, th } = q
  const { g, rng } = c
  if (g.kind === 'circle' || g.kind === 'square' || g.kind === 'tworow') return null
  if (g.kind === 'stacks' && g.stacks > 1) return null
  const p = rng.int(0, c.n - 1)
  const useAttr = c.nA > 1 && rng.chance(0.3)
  const x = itemAt(c, useAttr ? rng.int(1, c.nA - 1) : 0, p)
  const X = itemText(th, x)
  let stem: string
  let label: (i: number) => string
  switch (th.kind) {
    case 'floor':
      stem = `On which floor does ${X} live?`
      label = (i) => `${ordinalNum(i + 1)} floor`
      break
    case 'schedule':
      if ((th.sched as { unit: string }).unit === 'month') stem = `In which month was ${X} born?`
      else stem = `On which day does ${X} have an appointment?`
      label = (i) => th.labels[i]
      break
    case 'stack':
      stem = `At which position from the bottom is ${X} kept?`
      label = (i) => ordinalNum(i + 1)
      break
    default:
      stem = `At which position from the left end does ${X} sit?`
      label = (i) => ordinalNum(i + 1)
  }
  const mkAtom = (i: number): Atom => ({ t: 'pos', x, p: i })
  const others = rng.sample(Array.from({ length: c.n }, (_, i) => i).filter((i) => i !== p), 4)
  const wrong = others.map((i) => ({ t: label(i), claim: mkAtom(i) }))
  return assemble(c, stem, { t: label(p), claim: mkAtom(p) }, wrong, sentence(th, mkAtom(p)), 'attrPos')
}

function attrWho(q: Q): QSpec | null {
  const { c, th } = q
  if (c.nA < 2) return null
  const { rng } = c
  const a = rng.int(1, c.nA - 1)
  const p = rng.int(0, c.n - 1)
  const pool = th.attrs[a - 1]
  if (rng.chance(0.5)) {
    // who has attribute value
    const tv = c.inv[a][p]
    const target = c.inv[0][p]
    const mk = (v: number): Atom => ({ t: 'eq', x: [0, v], y: [a, tv] })
    const stem = `${th.who} ${pool.pool.yes(pool.values[tv])}?`
    const wrong = otherPersons(q, [target]).map((v) => ({ t: th.names[v], claim: mk(v) }))
    return assemble(c, stem, { t: th.names[target], claim: mk(target) }, wrong, sentence(th, mk(target)), 'attrWho')
  }
  // what attribute does subject have (subject: person, or another attribute's holder when 3 attrs)
  const subjAttr = c.nA >= 3 && rng.chance(c.difficulty === 'hard' ? 0.5 : 0) ? (a === 1 ? 2 : 1) : 0
  const subject = itemAt(c, subjAttr, p)
  const tv = c.inv[a][p]
  const mk = (v: number): Atom => ({ t: 'eq', x: subject, y: [a, v] })
  const stem = pool.pool.ask(itemText(th, subject))
  const others = rng.sample(Array.from({ length: c.n }, (_, i) => i).filter((v) => v !== tv), 4)
  const wrong = others.map((v) => ({ t: pool.values[v], claim: mk(v) }))
  return assemble(c, stem, { t: pool.values[tv], claim: mk(tv) }, wrong, sentence(th, mk(tv)), 'attrWho')
}

function combo(q: Q): QSpec | null {
  const { c, th } = q
  if (c.nA < 2) return null
  const { rng } = c
  const extra = c.nA - 1
  const comboAtom = (v: number, vals: number[]): Atom => {
    const eqs: Atom[] = vals.map((x, i) => ({ t: 'eq', x: [0, v], y: [i + 1, x] }))
    return eqs.length === 1 ? eqs[0] : { t: 'and', cs: eqs }
  }
  const text = (v: number, vals: number[]): string => [th.names[v], ...vals.map((x, i) => th.attrs[i].values[x])].join('-')
  const p = rng.int(0, c.n - 1)
  const tv = c.inv[0][p]
  const tvals = Array.from({ length: extra }, (_, i) => c.inv[i + 1][p])
  const wrong: { t: string; claim: Atom }[] = []
  let guard = 0
  while (wrong.length < 4 && guard++ < 100) {
    // mostly realistic distractors: take another person's true values and mix one component
    const v = rng.int(0, c.n - 1)
    const vals = Array.from({ length: extra }, (_, i) => (rng.chance(0.5) ? c.inv[i + 1][c.hidden[0][v]] : rng.int(0, c.n - 1)))
    const atom = comboAtom(v, vals)
    if (truth(c, atom)) continue
    const t = text(v, vals)
    if (wrong.some((w) => w.t === t)) continue
    wrong.push({ t, claim: atom })
  }
  const correctAtom = comboAtom(tv, tvals)
  const fact = (correctAtom.t === 'and' ? correctAtom.cs : [correctAtom]).map((a) => sentence(th, a)).join(' ')
  return assemble(c, 'Which of the following combinations is correct?', { t: text(tv, tvals), claim: correctAtom }, wrong, fact, 'combo')
}

function simpleTrue(c: GenCtx): Atom | null {
  for (let i = 0; i < 40; i++) {
    const a = genClue(c)
    if (a && a.t !== 'not' && a.t !== 'or') return a
  }
  return null
}

function simpleTypes(c: GenCtx): Parameters<typeof genRandom>[1] {
  const k = c.g.kind
  const t: Parameters<typeof genRandom>[1] = k === 'circle' || k === 'square' ? ['off', 'adj'] : ['off', 'adj', 'end']
  if (k === 'row' || k === 'stacks') t.push('lt', 'pos', 'btw')
  if (k === 'tworow') t.push('face', 'same', 'grp', 'btw')
  if (k === 'circle') t.push('btw', c.g.kind === 'circle' && c.g.facing === 'in' ? 'face' : 'opp')
  if (k === 'square') t.push('face', 'corner')
  if (k === 'stacks' && c.g.kind === 'stacks' && c.g.stacks > 1) t.push('grp', 'same')
  return t
}

function stmtGen(q: Q, wantTrue: boolean): QSpec | null {
  const { c, th } = q
  const nTrue = wantTrue ? 1 : 4
  const nFalse = wantTrue ? 4 : 1
  const trues: Atom[] = []
  const falses: Atom[] = []
  const seen = new Set<string>()
  for (let i = 0; i < 200 && (trues.length < nTrue || falses.length < nFalse); i++) {
    if (trues.length < nTrue) {
      const a = simpleTrue(c)
      if (a && !seen.has(sentence(th, a))) {
        seen.add(sentence(th, a))
        trues.push(a)
      }
    }
    if (falses.length < nFalse) {
      const a = genRandom(c, simpleTypes(c))
      if (a && !truth(c, a) && !seen.has(sentence(th, a))) {
        seen.add(sentence(th, a))
        falses.push(a)
      }
    }
  }
  if (trues.length < nTrue || falses.length < nFalse) return null
  if (wantTrue) {
    const correct = trues[0]
    return assemble(
      c,
      'Which of the following statements is true?',
      { t: sentence(th, correct), claim: correct },
      falses.map((a) => ({ t: sentence(th, a), claim: a })),
      sentence(th, correct),
      'stmtTrue',
    )
  }
  const bad = falses[0]
  return assemble(
    c,
    'Which of the following statements is NOT true?',
    { t: sentence(th, bad), claim: { t: 'not', c: bad } },
    trues.map((a) => ({ t: sentence(th, a), claim: { t: 'not', c: a } as Atom })),
    `Statement "${sentence(th, bad)}" does not match the final arrangement; all the others do.`,
    'stmtFalse',
  )
}

function twoHop(q: Q): QSpec | null {
  const { c, th } = q
  const { g, rng } = c
  const py = rng.int(0, c.n - 1)
  const d1 = pickD(c, 2)
  const pz = shiftOrNull(g, py, d1)
  if (pz < 0) return null
  const useAttr = c.nA > 1 && rng.chance(0.3)
  const y = itemAt(c, useAttr ? rng.int(1, c.nA - 1) : 0, py)
  const z = person(c, pz)
  const role: Atom = { t: 'off', x: z, y, d: d1 }
  const roleRef = `${relRef(th)} ${vpOf(th, role)}`
  // final relation from Z
  let final: ((v: number) => Atom) | null = null
  let pp = -1
  if (rng.chance(0.5) || g.kind === 'stacks' || g.kind === 'row') {
    const d2 = pickD(c, 2)
    pp = shiftOrNull(g, pz, d2)
    if (pp < 0) return null
    final = (v) => ({ t: 'off', x: [0, v], y: z, d: d2 })
  } else if (g.kind === 'tworow') {
    const m = c.n / 2
    pp = (grpOf(g, pz) === 0 ? m : 0) + (m - 1 - idxOf(g, pz))
    final = (v) => ({ t: 'face', x: [0, v], y: z })
  } else if (g.kind === 'circle') {
    pp = mod(pz + c.n / 2, c.n)
    final = g.facing === 'in' ? (v) => ({ t: 'face', x: [0, v], y: z }) : (v) => ({ t: 'opp', x: [0, v], y: z })
  } else {
    pp = mod(pz + c.n / 2, c.n)
    final = pz % 2 === 1 ? (v) => ({ t: 'face', x: [0, v], y: z }) : (v) => ({ t: 'opp', x: [0, v], y: z })
  }
  if (!final || pp < 0) return null
  const target = c.inv[0][pp]
  if (target === c.inv[0][py]) return null
  const mkAtom = (v: number): Atom => ({ t: 'and', cs: [role, (final as (v: number) => Atom)(v)] })
  const stem = `${th.who} ${vpOf(th, final(0), roleRef)}?`
  const wrong = otherPersons(q, [target, c.inv[0][py]]).map((v) => ({ t: th.names[v], claim: mkAtom(v) }))
  const fact = `${sentence(th, role)} ${sentence(th, final(target))}`
  return assemble(c, stem, { t: th.names[target], claim: mkAtom(target) }, wrong, fact, 'twoHop')
}

function countSide(q: Q): QSpec | null {
  const { c, th } = q
  const { g, rng } = c
  if (g.kind !== 'row') return null
  if (th.kind !== 'row' && th.kind !== 'floor') return null
  const p = rng.int(0, c.n - 1)
  const side = rng.chance(0.5) ? 'low' : 'high'
  const k = side === 'low' ? p : c.n - 1 - p
  if (k > 5) return null
  const useAttr = c.nA > 1 && rng.chance(0.25)
  const x = itemAt(c, useAttr ? rng.int(1, c.nA - 1) : 0, p)
  const X = itemText(th, x)
  const win = windowOptions(rng, k)
  const mk = (kk: number): Atom => ({ t: 'pos', x, p: side === 'low' ? kk : c.n - 1 - kk })
  let stem: string
  if (th.kind === 'row') stem = `How many persons sit to the ${side === 'low' ? 'left' : 'right'} of ${X}?`
  else stem = `How many persons live ${side === 'low' ? 'below' : 'above'} ${X}?`
  const claims = win.ks.map(mk)
  const answer = win.ks.indexOf(k)
  const tr = claims.map((cl) => truth(c, cl))
  if (tr.filter(Boolean).length !== 1 || !tr[answer]) return null
  const fact = th.kind === 'row' ? `${itemOption(th, x)} sits ${p === 0 ? 'at the extreme left end' : `${ORD[p + 1]} from the left end`}, so ${k} persons sit to the ${side === 'low' ? 'left' : 'right'}.` : `${itemOption(th, x)} lives on floor ${p + 1}, so ${k} persons live ${side === 'low' ? 'below' : 'above'}.`
  return { stem, optTexts: win.labels, claims, answer, fact, fam: 'countSide' }
}

function sameGroup(q: Q): QSpec | null {
  const { c, th } = q
  const { g, rng } = c
  if (g.kind !== 'tworow' && !(g.kind === 'stacks' && g.stacks > 1)) return null
  const sz = grpSize(g)
  const py = rng.int(0, c.n - 1)
  const gi = grpOf(g, py)
  const same = Array.from({ length: sz }, (_, i) => gi * sz + i).filter((p) => p !== py)
  const diff = Array.from({ length: c.n }, (_, i) => i).filter((p) => grpOf(g, p) !== gi)
  if (diff.length < 4) return null
  const tp = rng.pick(same)
  const target = c.inv[0][tp]
  const y = person(c, py)
  const mk = (v: number): Atom => ({ t: 'same', x: [0, v], y })
  const stem = th.kind === 'stack' ? `Which of the following boxes is kept in the same stack as ${itemText(th, y)}?` : `Who among the following sits in the same row as ${itemText(th, y)}?`
  const wrong = rng.sample(diff, 4).map((p) => ({ t: th.names[c.inv[0][p]], claim: mk(c.inv[0][p]) }))
  return assemble(c, stem, { t: th.names[target], claim: mk(target) }, wrong, sentence(th, mk(target)), 'sameGroup')
}

function endWho(q: Q): QSpec | null {
  const { c, th } = q
  const { g, rng } = c
  if (g.kind === 'circle' || g.kind === 'square') return null
  const sz = grpSize(g)
  const ends: number[] = []
  const mids: number[] = []
  for (let p = 0; p < c.n; p++) (idxOf(g, p) === 0 || idxOf(g, p) === sz - 1 ? ends : mids).push(p)
  if (mids.length < 4) return null
  const mk = (v: number): Atom => ({ t: 'end', x: [0, v] })
  const tp = rng.pick(ends)
  const target = c.inv[0][tp]
  let stem: string
  switch (th.kind) {
    case 'floor':
      stem = 'Who among the following lives on either the topmost or the lowest floor?'
      break
    case 'stack':
      stem = 'Which of the following boxes is kept at either the top or the bottom of its stack?'
      break
    case 'schedule':
      stem = `Who among the following ${(th.sched as { yes: string }).yes} in either the first or the last ${(th.sched as { unit: string }).unit} of the list?`
      break
    default:
      stem = 'Who among the following sits at one of the extreme ends of the row?'
  }
  const wrong = rng.sample(mids, 4).map((p) => ({ t: th.names[c.inv[0][p]], claim: mk(c.inv[0][p]) }))
  return assemble(c, stem, { t: th.names[target], claim: mk(target) }, wrong, sentence(th, mk(target)), 'endWho')
}

function faceWho(q: Q): QSpec | null {
  const { c, th } = q
  const { g, rng } = c
  if (g.kind === 'row' || g.kind === 'stacks') return null
  let py = rng.int(0, c.n - 1)
  let atomOf: (v: number, y: Item) => Atom
  let pp: number
  if (g.kind === 'tworow') {
    const m = c.n / 2
    pp = (grpOf(g, py) === 0 ? m : 0) + (m - 1 - idxOf(g, py))
    atomOf = (v, y) => ({ t: 'face', x: [0, v], y })
  } else if (g.kind === 'circle') {
    pp = mod(py + c.n / 2, c.n)
    atomOf = g.facing === 'in' ? (v, y) => ({ t: 'face', x: [0, v], y }) : (v, y) => ({ t: 'opp', x: [0, v], y })
  } else {
    pp = mod(py + c.n / 2, c.n)
    atomOf = py % 2 === 1 ? (v, y) => ({ t: 'face', x: [0, v], y }) : (v, y) => ({ t: 'opp', x: [0, v], y })
  }
  py = mod(py, c.n)
  const useAttr = c.nA > 1 && rng.chance(0.3)
  const y = itemAt(c, useAttr ? rng.int(1, c.nA - 1) : 0, py)
  const target = c.inv[0][pp]
  const stem = `${th.who} ${vpOf(th, atomOf(0, y))}?`
  const wrong = otherPersons(q, [target, c.inv[0][py]]).map((v) => ({ t: th.names[v], claim: atomOf(v, y) }))
  return assemble(c, stem, { t: th.names[target], claim: atomOf(target, y) }, wrong, sentence(th, atomOf(target, y)), 'faceWho')
}

function cornerWho(q: Q): QSpec | null {
  const { c, th } = q
  if (c.g.kind !== 'square') return null
  const mk = (v: number): Atom => ({ t: 'corner', x: [0, v] })
  const tp = 2 * c.rng.int(0, 3)
  const target = c.inv[0][tp]
  const mids = [1, 3, 5, 7].map((p) => c.inv[0][p])
  const wrong = mids.map((v) => ({ t: th.names[v], claim: mk(v) }))
  return assemble(c, 'Who among the following sits at a corner of the table?', { t: th.names[target], claim: mk(target) }, wrong, sentence(th, mk(target)), 'cornerWho')
}

type Fam = { id: string; f: (q: Q) => QSpec | null; m: number; h: number }

function families(th: Theme): Fam[] {
  const k = th.g.kind
  const fams: Fam[] = [
    { id: 'whoOff', f: whoOff, m: 30, h: 20 },
    { id: 'btwCount', f: btwCount, m: 16, h: 14 },
    { id: 'stmtTrue', f: (q) => stmtGen(q, true), m: 8, h: 12 },
    { id: 'stmtFalse', f: (q) => stmtGen(q, false), m: 4, h: 10 },
    { id: 'twoHop', f: twoHop, m: 4, h: 22 },
  ]
  if (k !== 'circle' && k !== 'square') fams.push({ id: 'whoAt', f: whoAt, m: 16, h: 8 }, { id: 'endWho', f: endWho, m: 10, h: 4 })
  if (k === 'row') fams.push({ id: 'countSide', f: countSide, m: 12, h: 8 })
  if (k === 'row' || k === 'stacks') fams.push({ id: 'attrPos', f: attrPos, m: 14, h: 8 })
  if (k === 'tworow' || k === 'stacks') fams.push({ id: 'sameGroup', f: sameGroup, m: 10, h: 8 })
  if (k === 'tworow' || k === 'circle' || k === 'square') fams.push({ id: 'faceWho', f: faceWho, m: 16, h: 12 })
  if (k === 'square') fams.push({ id: 'cornerWho', f: cornerWho, m: 8, h: 5 })
  if (th.attrs.length) fams.push({ id: 'attrWho', f: attrWho, m: 22, h: 16 }, { id: 'attrOfOff', f: attrOfOff, m: 14, h: 14 }, { id: 'combo', f: combo, m: 14, h: 14 })
  return fams
}

function makeQuestions(c: GenCtx, th: Theme, k: number): QSpec[] {
  const q: Q = { c, th }
  const fams = families(th)
  const out: QSpec[] = []
  const used: Record<string, number> = {}
  let guard = 0
  while (out.length < k && guard++ < 600) {
    const avail = fams.map((f) => ({ f, w: (c.difficulty === 'hard' ? f.h : f.m) / (1 + (used[f.id] ?? 0) * 9) })).filter((x) => x.w > 0)
    const total = avail.reduce((s, x) => s + x.w, 0)
    let r = c.rng.next() * total
    let chosen = avail[avail.length - 1].f
    for (const a of avail) {
      r -= a.w
      if (r < 0) {
        chosen = a.f
        break
      }
    }
    const spec = chosen.f(q)
    if (!spec) continue
    if (out.some((o) => o.stem === spec.stem)) continue
    out.push(spec)
    used[chosen.id] = (used[chosen.id] ?? 0) + 1
  }
  if (out.length < k) throw new Error(`arrangement: could only build ${out.length}/${k} questions`)
  return out
}

// --------------------------------------------------------------------------- themes

export interface PuzzleSpec {
  kind: ThemeKind
  g: Geometry
  nExtra: number
}

export function makeTheme(rng: Rng, spec: PuzzleSpec): Theme {
  const n = spec.g.n
  const isBox = spec.kind === 'stack'
  const names = pickNames(rng, n, isBox ? 'letters' : undefined)
  const pools = rng.sample(isBox ? BOX_POOLS : PERSON_POOLS, spec.nExtra)
  const attrs = pools.map((pool) => ({ pool, values: rng.sample(pool.values, n) }))
  let labels: string[] = []
  let sched: Theme['sched']
  if (spec.kind === 'schedule') {
    if (n === 7) {
      labels = DAYS.slice(0, 7)
      sched = SCHED_DAY
    } else {
      const start = rng.int(0, 12 - n)
      labels = MONTHS.slice(start, start + n)
      sched = SCHED_MONTH
    }
  }
  return { kind: spec.kind, g: spec.g, names, prefix: isBox ? 'box ' : '', who: isBox ? 'Which box' : 'Who', attrs, labels, sched }
}

export function generateArrangementSet(rng: Rng, difficulty: MockDifficulty, k: number, topic: MockTopicId, spec: PuzzleSpec): { group: Group; proof: ArrangementProof } {
  const nA = spec.nExtra + 1
  const built = buildPuzzle(rng, spec.g, nA, difficulty, { floors: spec.kind === 'floor' })
  const th = makeTheme(rng, spec)
  const c = makeCtx(rng, spec.g, nA, difficulty, spec.kind === 'floor', built.hidden)
  const specs = makeQuestions(c, th, k)
  const arrangement = arrangementText(th, built.hidden)
  const clueTexts = built.clues.map((a) => sentence(th, a))
  const questions: QuestionDraft[] = specs.map((s) => ({
    topic,
    stem: s.stem,
    options: s.optTexts,
    answer: s.answer,
    explanation: `${arrangement} ${s.fact}`,
  }))
  const group: Group = {
    stimulus: { directions: DIRECTIONS, parts: [{ kind: 'text', paragraphs: [...introText(th), ...clueTexts] }] },
    questions,
  }
  const proof: ArrangementProof = {
    geom: spec.g,
    nA,
    hidden: built.hidden,
    clues: built.clues,
    questions: specs.map((s) => ({ claims: s.claims, answer: s.answer })),
  }
  return { group, proof }
}

export { clause }
