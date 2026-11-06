// SBI PO MAINS-level generators for Syllogism, Inequality and Blood Relations (reasoning, set A).
//
// Truth is never "derived by a formula": every key is decided by exhaustive enumeration of a finite model space and then
// cross-checked by a second, structurally different method (ensure(...) throws on disagreement).
//  - Syllogism:   Venn-region models (subsets of the non-empty regions of the k-term Venn diagram); fast monotone
//                 decision procedure is cross-checked against full enumeration of every model.
//  - Inequality:  Floyd-Warshall relation closure cross-checked against a difference-constraint (Bellman-Ford) solver.
//  - Blood:       every family consistent with the stated structure and clues (all gender patterns x all name->position
//                 bijections), found by a pruned search; each question is evaluated in every such family.
import type { Rng } from '../../rng'
import type { Group, MockDifficulty, QuestionDraft, ReasoningTopicId, Stimulus, TopicGenerator } from '../../types'
import { Reject, ensure, need } from '../../quant/util'
import { DIRECTIONS, article, cap, splitCount } from '../common'

// ============================================================================================ shared helpers
const ROMAN = ['I', 'II', 'III', 'IV', 'V']
const OPT_LET = 'ABCDE'

function retry<T>(label: string, fn: () => T, tries = 250): T {
  for (let i = 0; i < tries; i++) {
    try {
      return fn()
    } catch (e) {
      if (!(e instanceof Reject)) throw e
    }
  }
  throw new Error(`${label}: generation failed after ${tries} attempts`)
}

function wchoose(rng: Rng, weights: readonly number[]): number {
  let r = rng.next() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r < 0) return i
  }
  return weights.length - 1
}

const joinAnd = (xs: string[]): string => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

function finishOptions(rng: Rng, correct: string, wrong: string[], explanation: string): { options: string[]; answer: number; explanation: string } {
  const options = rng.shuffle([correct, ...wrong.slice(0, 4)])
  const answer = options.indexOf(correct)
  ensure(new Set(options).size === 5 && answer >= 0, 'option layout')
  return { options, answer, explanation: `${explanation}\nCorrect answer: (${OPT_LET[answer]}) ${correct}` }
}

// ---------- subset descriptors ("Only I and III follow", "Only III and either I or II follow", ...)
interface Desc {
  set: number[]
  either: [number, number] | null
}
interface Verbs {
  one: string
  many: string
  none: string
  all: string
}
const V_FOLLOW: Verbs = { one: 'follows', many: 'follow', none: 'None follows', all: 'All follow' }
const V_TRUE: Verbs = { one: 'is true', many: 'are true', none: 'None is true', all: 'All are true' }
const V_POSS: Verbs = { one: 'is a possibility', many: 'are possibilities', none: 'None is a possibility', all: 'All are possibilities' }

function descText(d: Desc, n: number, v: Verbs): string {
  const labels = d.set.slice().sort((a, b) => a - b).map((i) => ROMAN[i])
  if (d.either) {
    const e = `either ${ROMAN[d.either[0]]} or ${ROMAN[d.either[1]]}`
    if (!labels.length) return `${cap(e)} ${v.one}`
    return `Only ${joinAnd([...labels, e])} ${v.many}`
  }
  if (labels.length === 0) return v.none
  if (labels.length === n) return v.all
  return `Only ${joinAnd(labels)} ${labels.length === 1 ? v.one : v.many}`
}

/** Correct descriptor text plus four distractors (single/double toggles of the truth), laid out in random order. */
function descOptions(rng: Rng, n: number, truth: Desc, v: Verbs, explanation: string): { options: string[]; answer: number; explanation: string } {
  const correct = descText(truth, n, v)
  const tset = new Set(truth.set)
  const cands: { text: string; dist: number }[] = []
  const seen = new Set<string>([correct])
  for (let mask = 0; mask < 1 << n; mask++) {
    const s: number[] = []
    for (let i = 0; i < n; i++) if (mask & (1 << i)) s.push(i)
    let dist = 0
    for (let i = 0; i < n; i++) if (tset.has(i) !== s.includes(i)) dist++
    const variants: (Desc | null)[] = [{ set: s, either: null }]
    // keep the either-or phrasing only for the pair that is genuinely the either-or pair of the truth
    if (truth.either && !s.includes(truth.either[0]) && !s.includes(truth.either[1])) variants.push({ set: s, either: truth.either })
    for (const d of variants) {
      if (!d) continue
      const text = descText(d, n, v)
      if (seen.has(text)) continue
      seen.add(text)
      cands.push({ text, dist: dist + (d.either ? 0 : truth.either ? 1 : 0) })
    }
  }
  const shuffled = rng.shuffle(cands)
  const near = shuffled.filter((c) => c.dist <= 2)
  const far = shuffled.filter((c) => c.dist > 2)
  const wrong = [...near, ...far].slice(0, 4).map((c) => c.text)
  return finishOptions(rng, correct, wrong, explanation)
}

// ============================================================================================ SYLLOGISM
// Region masks: for a k-term Venn diagram region r (1..2^k-1, bit t = "inside term t") occupies mask bit r-1.
// A model is a set of occupied regions; every term must be non-empty (existential import, as in the Indian bank exams).
interface Atom {
  none: boolean
  mask: number
}
type PT = 'A' | 'E' | 'I' | 'O' | 'F'
interface SPrem {
  t: PT
  x: number
  y: number
}
type CT = 'A' | 'E' | 'I' | 'O'
interface SConc {
  t: CT
  x: number
  y: number
  poss: boolean
}

const NOUNS: [string, string][] = [
  ['pen', 'pens'], ['book', 'books'], ['table', 'tables'], ['chair', 'chairs'], ['road', 'roads'], ['car', 'cars'], ['bus', 'buses'],
  ['train', 'trains'], ['flower', 'flowers'], ['tree', 'trees'], ['fruit', 'fruits'], ['bird', 'birds'], ['cat', 'cats'], ['dog', 'dogs'],
  ['house', 'houses'], ['river', 'rivers'], ['lake', 'lakes'], ['clock', 'clocks'], ['watch', 'watches'], ['mobile', 'mobiles'],
  ['laptop', 'laptops'], ['bag', 'bags'], ['key', 'keys'], ['coin', 'coins'], ['ring', 'rings'], ['chain', 'chains'], ['bell', 'bells'],
  ['drum', 'drums'], ['kite', 'kites'], ['stone', 'stones'], ['mountain', 'mountains'], ['hill', 'hills'], ['plate', 'plates'],
  ['cup', 'cups'], ['spoon', 'spoons'], ['lamp', 'lamps'], ['box', 'boxes'], ['wall', 'walls'], ['door', 'doors'], ['window', 'windows'],
  ['ship', 'ships'], ['bridge', 'bridges'], ['garden', 'gardens'], ['temple', 'temples'], ['market', 'markets'], ['school', 'schools'],
]

const FULL31 = 2 ** 31 - 1
const inT = (r: number, t: number): number => (r >> t) & 1
function regMask(k: number, pred: (r: number) => boolean): number {
  let m = 0
  for (let r = 1; r < 1 << k; r++) if (pred(r)) m |= 1 << (r - 1)
  return m
}
const popcount = (x: number): number => {
  let c = 0
  for (let v = x; v; v &= v - 1) c++
  return c
}

function atomOf(k: number, t: CT, x: number, y: number): Atom {
  switch (t) {
    case 'A':
      return { none: true, mask: regMask(k, (r) => !!inT(r, x) && !inT(r, y)) }
    case 'E':
      return { none: true, mask: regMask(k, (r) => !!inT(r, x) && !!inT(r, y)) }
    case 'I':
      return { none: false, mask: regMask(k, (r) => !!inT(r, x) && !!inT(r, y)) }
    case 'O':
      return { none: false, mask: regMask(k, (r) => !!inT(r, x) && !inT(r, y)) }
  }
}
function premAtoms(k: number, p: SPrem): Atom[] {
  if (p.t === 'F') return [atomOf(k, 'I', p.x, p.y), atomOf(k, 'O', p.x, p.y)]
  return [atomOf(k, p.t, p.x, p.y)]
}
const atomKey = (a: Atom): string => `${a.none ? 1 : 0}:${a.mask}`

interface Kb {
  k: number
  allowed: number
  some: number[]
}
const validSome = (some: number[], allowed: number): boolean => some.every((m) => (m & allowed) !== 0)

function buildKb(k: number, prems: SPrem[]): Kb | null {
  let forbid = 0
  const some: number[] = []
  for (const p of prems)
    for (const a of premAtoms(k, p)) {
      if (a.none) forbid |= a.mask
      else some.push(a.mask)
    }
  for (let t = 0; t < k; t++) some.push(regMask(k, (r) => !!inT(r, t)))
  const allowed = (2 ** (2 ** k - 1) - 1) & ~forbid & FULL31
  if (!validSome(some, allowed)) return null
  return { k, allowed, some }
}
/** true in EVERY model */
function followsDef(kb: Kb, a: Atom): boolean {
  if (a.none) return (a.mask & kb.allowed) === 0
  return !validSome(kb.some, kb.allowed & ~a.mask)
}
/** true in SOME model */
function possibleIn(kb: Kb, a: Atom): boolean {
  if (a.none) return validSome(kb.some, kb.allowed & ~a.mask)
  return (a.mask & kb.allowed) !== 0
}

/** Every valid model (set of occupied regions) by exhaustive enumeration of the subsets of allowed regions. */
function enumModels(kb: Kb): number[] {
  const bits: number[] = []
  for (let b = 0; b < 31; b++) if ((kb.allowed >> b) & 1) bits.push(1 << b)
  const R = bits.length
  const out: number[] = []
  const acc = new Int32Array(1 << R)
  for (let s = 1; s < 1 << R; s++) {
    const low = 31 - Math.clz32(s & -s)
    const m = acc[s & (s - 1)] | bits[low]
    acc[s] = m
    if (validSome(kb.some, m)) out.push(m)
  }
  return out
}
const holdsIn = (model: number, a: Atom): boolean => (a.none ? (model & a.mask) === 0 : (model & a.mask) !== 0)

function nounText(terms: [string, string][], t: number, plural: boolean): string {
  return plural ? terms[t][1] : terms[t][0]
}
function stmtText(terms: [string, string][], t: PT, x: number, y: number, poss = false): string {
  const px = terms[x][1]
  const py = terms[y][1]
  const sx = terms[x][0]
  const sy = terms[y][0]
  if (poss) {
    switch (t) {
      case 'A':
        return `All ${px} being ${py} is a possibility`
      case 'E':
        return `No ${sx} being ${article(sy)} ${sy} is a possibility`
      case 'I':
        return `Some ${px} being ${py} is a possibility`
      default:
        return `Some ${px} not being ${py} is a possibility`
    }
  }
  switch (t) {
    case 'A':
      return `All ${px} are ${py}`
    case 'E':
      return `No ${sx} is ${article(sy)} ${sy}`
    case 'I':
      return `Some ${px} are ${py}`
    case 'O':
      return `Some ${px} are not ${py}`
    case 'F':
      return `Only a few ${px} are ${py}`
  }
}

function describeModel(k: number, model: number, terms: [string, string][]): string {
  const regs: string[] = []
  for (let r = 1; r < 1 << k; r++) {
    if (!(model & (1 << (r - 1)))) continue
    const ins: string[] = []
    for (let t = 0; t < k; t++) if (inT(r, t)) ins.push(nounText(terms, t, true))
    regs.push(`${ins.join(' & ')} only`)
  }
  return regs.join('; ')
}
function smallestModel(models: number[], pred: (m: number) => boolean): number | null {
  let best: number | null = null
  let bc = 99
  for (const m of models) {
    if (!pred(m)) continue
    const c = popcount(m)
    if (c < bc) {
      bc = c
      best = m
    }
  }
  return best
}

interface SylCand {
  c: SConc
  atom: Atom
  key: string
  def: boolean
  pos: boolean
}

type SylKind = 'set' | 'poss' | 'one' | 'never' | 'two'

function buildPremises(rng: Rng, k: number): SPrem[] {
  const m = rng.chance(0.5) ? 4 : 5
  const order = rng.shuffle(Array.from({ length: k }, (_, i) => i))
  const edges: [number, number][] = []
  for (let i = 1; i < k; i++) edges.push([order[i], order[rng.int(0, i - 1)]])
  let guard = 0
  while (edges.length < m && guard++ < 50) {
    const a = rng.int(0, k - 1)
    const b = rng.int(0, k - 1)
    if (a === b || edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a))) continue
    edges.push([a, b])
  }
  const types: PT[] = ['A', 'A', 'A', 'E', 'E', 'I', 'I', 'I', 'O', 'O', 'F']
  const prems: SPrem[] = edges.map(([a, b]) => {
    const t = rng.pick(types)
    return rng.chance(0.5) ? { t, x: a, y: b } : { t, x: b, y: a }
  })
  need(prems.filter((p) => p.t === 'F').length <= 1, 'one F')
  need(prems.filter((p) => p.t === 'A' || p.t === 'E').length >= (k === 5 ? 2 : 1), 'universals')
  need(prems.filter((p) => p.t === 'I' || p.t === 'O' || p.t === 'F').length >= 1, 'existentials')
  return prems
}

const SYL_STD_OPTIONS = [
  'Only conclusion I follows',
  'Only conclusion II follows',
  'Either conclusion I or II follows',
  'Neither conclusion I nor II follows',
  'Both conclusions I and II follow',
]

function pickByKey<T extends { key: string }>(rng: Rng, pool: T[], n: number, used: Set<string>): T[] {
  const out: T[] = []
  for (const c of rng.shuffle(pool)) {
    if (out.length >= n) break
    if (used.has(c.key)) continue
    used.add(c.key)
    out.push(c)
  }
  return out
}

function genSyllogism(rng: Rng): QuestionDraft {
  return retry('syllogism', () => {
    const kind: SylKind = (['set', 'poss', 'one', 'never', 'two'] as const)[wchoose(rng, [30, 17, 20, 13, 20])]
    const k = rng.chance(0.5) ? 5 : 4
    const terms = rng.sample(NOUNS, k)
    const prems = buildPremises(rng, k)
    const kb = buildKb(k, prems)
    need(kb && popcount(kb.allowed) <= 16, 'model space')
    const premKeys = new Set<string>()
    for (const p of prems) for (const a of premAtoms(k, p)) premKeys.add(atomKey(a))
    const cands: SylCand[] = []
    for (let x = 0; x < k; x++)
      for (let y = 0; y < k; y++) {
        if (x === y) continue
        for (const t of ['A', 'E', 'I', 'O'] as CT[]) {
          const atom = atomOf(k, t, x, y)
          const key = atomKey(atom)
          if (premKeys.has(key)) continue
          cands.push({ c: { t, x, y, poss: false }, atom, key, def: followsDef(kb, atom), pos: possibleIn(kb, atom) })
        }
      }
    const FO = cands.filter((c) => c.def)
    const NFO = cands.filter((c) => !c.def)
    need(FO.length >= 1 && NFO.length >= 4, 'pools')
    const models = enumModels(kb)
    ensure(models.length > 0, 'no models')
    const text = (c: SConc) => stmtText(terms, c.t, c.x, c.y, c.poss)
    const sub = (c: SConc, forPoss: boolean): string => text({ ...c, poss: forPoss })

    // truth by enumeration of every model (cross-checked against the monotone procedure)
    const allHold = (c: SylCand) => models.every((m) => holdsIn(m, c.atom))
    const anyHold = (c: SylCand) => models.some((m) => holdsIn(m, c.atom))
    const verify = (c: SylCand) => {
      ensure(allHold(c) === c.def, `syllogism definite mismatch ${c.key}`)
      ensure(anyHold(c) === c.pos, `syllogism possibility mismatch ${c.key}`)
    }

    // derived facts shown in the explanation
    const facts = (() => {
      const seen = new Set<string>()
      const out: string[] = []
      for (const t of ['A', 'E', 'I', 'O'] as CT[])
        for (const c of FO.filter((q) => q.c.t === t)) {
          if (seen.has(c.key)) continue
          seen.add(c.key)
          out.push(sub(c.c, false))
        }
      return out
    })()
    const head = `Statements: ${prems.map((p) => `${stmtText(terms, p.t, p.x, p.y)}.`).join(' ')}\nFacts true in every valid Venn diagram (all ${models.length} valid arrangements checked): ${facts.slice(0, 8).join('; ')}${facts.length > 8 ? '; ...' : ''}.`
    const stmtBlock = `Statements:\n${prems.map((p) => `${stmtText(terms, p.t, p.x, p.y)}.`).join('\n')}`
    const minimalPremises = (c: SylCand): SPrem[] => {
      const P = prems.length
      for (let size = 1; size <= P; size++) {
        for (let mask = 1; mask < 1 << P; mask++) {
          if (popcount(mask) !== size) continue
          const sub0 = prems.filter((_, i) => mask & (1 << i))
          const kb0 = buildKb(k, sub0)
          if (kb0 && followsDef(kb0, c.atom)) return sub0
        }
      }
      return prems
    }
    const witnessLine = (label: string, c: SylCand, wantModelWhere: boolean, poss: boolean): string => {
      const text0 = `${label}. ${sub(c.c, poss)}`
      if (poss) {
        if (c.pos) {
          const w = smallestModel(models, (m) => holdsIn(m, c.atom))
          return `${text0} - possible: in the valid diagram whose only occupied parts are [${describeModel(k, w as number, terms)}] the statements hold and this is true.`
        }
        return `${text0} - not possible: every valid diagram of the statements contradicts it.`
      }
      if (c.def) {
        const used = minimalPremises(c)
        return `${text0} - follows: it already follows from ${used.map((p) => `"${stmtText(terms, p.t, p.x, p.y)}"`).join(' + ')}, so it is true in every valid Venn diagram.`
      }
      const w = smallestModel(models, (m) => !holdsIn(m, c.atom))
      void wantModelWhere
      return `${text0} - does not follow: in the valid diagram whose only occupied parts are [${describeModel(k, w as number, terms)}] all the statements hold but this fails.`
    }
    const complementary = (a: SylCand, b: SylCand): boolean => a.atom.mask === b.atom.mask && a.atom.none !== b.atom.none

    if (kind === 'set') {
      const N = rng.chance(0.4) ? 5 : 4
      const pairs: [SylCand, SylCand][] = []
      for (const a of NFO) for (const b of NFO) if (a.atom.none && !b.atom.none && a.atom.mask === b.atom.mask) pairs.push([a, b])
      const wantEither = pairs.length > 0 && rng.chance(0.32)
      const used = new Set<string>()
      const chosen: SylCand[] = []
      let fCount: number
      if (wantEither) {
        const [a, b] = rng.pick(pairs)
        used.add(a.key)
        used.add(b.key)
        chosen.push(a, b)
        fCount = wchoose(rng, [20, 45, 25, 10].slice(0, N - 1)) // followers among the rest (0..N-2)
      } else {
        fCount = wchoose(rng, N === 4 ? [8, 32, 34, 20, 6] : [5, 22, 33, 25, 12, 3])
      }
      need(fCount <= FO.length, 'few followers')
      const fol = pickByKey(rng, FO, fCount, used)
      need(fol.length === fCount, 'followers')
      const restN = N - chosen.length - fCount
      const non = pickByKey(rng, NFO, restN, used)
      need(non.length === restN, 'non-followers')
      const all = rng.shuffle([...chosen, ...fol, ...non])
      all.forEach(verify)
      const followSet = all.map((c, i) => (c.def ? i : -1)).filter((i) => i >= 0)
      const pairsFound: [number, number][] = []
      for (let i = 0; i < N; i++)
        for (let j = i + 1; j < N; j++) if (!all[i].def && !all[j].def && complementary(all[i], all[j])) pairsFound.push([i, j])
      need(pairsFound.length <= 1, 'ambiguous either-or')
      const truth: Desc = { set: followSet, either: pairsFound[0] ?? null }
      const verbs = V_FOLLOW
      const lines = all.map((c, i) => witnessLine(ROMAN[i], c, true, false))
      if (truth.either) lines.push(`${ROMAN[truth.either[0]]} and ${ROMAN[truth.either[1]]} are complementary (exactly one of them is true in every diagram), so either ${ROMAN[truth.either[0]]} or ${ROMAN[truth.either[1]]} follows.`)
      const ex = `${head}\n${lines.join('\n')}`
      const o = descOptions(rng, N, truth, verbs, ex)
      const nWord = N === 4 ? 'four' : 'five'
      const concl = all.map((c, i) => `${ROMAN[i]}. ${sub(c.c, false)}.`).join('\n')
      const romanList = ROMAN.slice(0, N - 1).join(', ') + ' and ' + ROMAN[N - 1]
      return {
        topic: 'syllogism',
        stem: `In the question below, ${N === 4 ? 'four' : 'five'} statements are followed by ${nWord} conclusions numbered ${romanList}. Take the statements to be true even if they seem at variance with commonly known facts, then decide which of the conclusions logically follow(s). A pair of conclusions that are complementary (one of them must be true) is to be treated as "either-or".\n${stmtBlock}\nConclusions:\n${concl}`,
        ...o,
      }
    }

    if (kind === 'poss') {
      const N = rng.chance(0.3) ? 5 : 4
      const P = cands.filter((c) => c.pos)
      const X = cands.filter((c) => !c.pos)
      need(X.length >= 1 && P.length >= 2, 'poss pools')
      const f = rng.int(1, Math.min(N - 1, P.length))
      const used = new Set<string>()
      const fol = pickByKey(rng, P, f, used)
      need(fol.length === f, 'poss fol')
      const non = pickByKey(rng, X, N - f, used)
      need(non.length === N - f, 'poss non')
      const all = rng.shuffle([...fol, ...non])
      all.forEach(verify)
      const truth: Desc = { set: all.map((c, i) => (c.pos ? i : -1)).filter((i) => i >= 0), either: null }
      const lines = all.map((c, i) => witnessLine(ROMAN[i], c, true, true))
      const o = descOptions(rng, N, truth, V_POSS, `${head}\n${lines.join('\n')}`)
      const romanList = ROMAN.slice(0, N - 1).join(', ') + ' and ' + ROMAN[N - 1]
      return {
        topic: 'syllogism',
        stem: `Statements given below are followed by ${N === 4 ? 'four' : 'five'} conclusions numbered ${romanList}. Assume the statements to be true. A conclusion is a possibility if there is at least one valid Venn diagram of the statements in which it is true. Which of the conclusions is/are a possibility?\n${stmtBlock}\nConclusions:\n${all.map((c, i) => `${ROMAN[i]}. ${sub(c.c, true)}.`).join('\n')}`,
        ...o,
      }
    }

    if (kind === 'one') {
      const used = new Set<string>()
      const key = pickByKey(rng, FO, 1, used)
      need(key.length === 1, 'key')
      const NP = NFO.filter((c) => c.pos)
      const NN = NFO.filter((c) => !c.pos)
      const nPos = Math.min(NP.length, rng.int(2, 3))
      const wrongP = pickByKey(rng, NP, nPos, used)
      const wrongN = pickByKey(rng, NN, 4 - wrongP.length, used)
      let wrong = [...wrongP, ...wrongN]
      if (wrong.length < 4) wrong = [...wrong, ...pickByKey(rng, NFO, 4 - wrong.length, used)]
      need(wrong.length === 4, 'wrong')
      ;[key[0], ...wrong].forEach(verify)
      const lines = [key[0], ...wrong].map((c, i) => witnessLine(i === 0 ? 'Key' : `Option ${i}`, c, true, false))
      const ex = `${head}\n${lines.join('\n')}`
      const o = finishOptions(rng, sub(key[0].c, false), wrong.map((c) => sub(c.c, false)), ex)
      return { topic: 'syllogism', stem: `Statements given below are to be taken as true even if they seem at variance with commonly known facts.\n${stmtBlock}\nWhich of the following conclusions definitely follows from the above statements?`, ...o }
    }

    if (kind === 'never') {
      const IMP = cands.filter((c) => !c.pos)
      const POS = cands.filter((c) => c.pos)
      need(IMP.length >= 1 && POS.length >= 4, 'never pools')
      const used = new Set<string>()
      const key = pickByKey(rng, IMP, 1, used)
      need(key.length === 1, 'never key')
      const wrong = pickByKey(rng, POS, 4, used)
      need(wrong.length === 4, 'never wrong')
      ;[key[0], ...wrong].forEach(verify)
      const lines = [`Key: ${sub(key[0].c, false)} - it is false in every valid diagram, so it can never be true.`]
      for (const w of wrong) {
        if (w.def) lines.push(`${sub(w.c, false)} - true in every valid diagram, so it can be true.`)
        else {
          const mm = smallestModel(models, (m) => holdsIn(m, w.atom))
          lines.push(`${sub(w.c, false)} - can be true: in the valid diagram whose only occupied parts are [${describeModel(k, mm as number, terms)}] it holds.`)
        }
      }
      const o = finishOptions(rng, sub(key[0].c, false), wrong.map((c) => sub(c.c, false)), `${head}\n${lines.join('\n')}`)
      return { topic: 'syllogism', stem: `Statements given below are to be taken as true even if they seem at variance with commonly known facts.\n${stmtBlock}\nWhich of the following can NEVER be true (i.e. is false in every valid Venn diagram of the statements)?`, ...o }
    }

    // kind === 'two': classic two-conclusion layout on a long premise set; one conclusion may be a possibility
    const want = rng.int(0, 4)
    const pairs: [SylCand, SylCand][] = []
    for (const a of NFO) for (const b of NFO) if (a.atom.none && !b.atom.none && a.atom.mask === b.atom.mask) pairs.push([a, b])
    let sel: { cand: SylCand; poss: boolean }[]
    const used = new Set<string>()
    if (want === 2) {
      need(pairs.length > 0, 'no pair')
      const [a, b] = rng.pick(pairs)
      sel = rng.shuffle([a, b]).map((cand) => ({ cand, poss: false }))
    } else {
      const slot = (needFollow: boolean): { cand: SylCand; poss: boolean } => {
        const usePoss = rng.chance(0.3)
        const pool = usePoss ? (needFollow ? cands.filter((c) => c.pos) : cands.filter((c) => !c.pos)) : needFollow ? FO : NFO
        const got = pickByKey(rng, pool, 1, used)
        need(got.length === 1, 'slot')
        return { cand: got[0], poss: usePoss }
      }
      const f1 = want === 0 || want === 4
      const f2 = want === 1 || want === 4
      sel = [slot(f1), slot(f2)]
    }
    sel.forEach((s) => verify(s.cand))
    const status = (s: { cand: SylCand; poss: boolean }) => (s.poss ? s.cand.pos : s.cand.def)
    const s1 = status(sel[0])
    const s2 = status(sel[1])
    let ans: number
    if (s1 && s2) ans = 4
    else if (s1) ans = 0
    else if (s2) ans = 1
    else if (!sel[0].poss && !sel[1].poss && complementary(sel[0].cand, sel[1].cand)) ans = 2
    else ans = 3
    need(ans === want, 'outcome')
    if (ans === 3) {
      const covers = models.every((m) => (sel[0].poss ? false : holdsIn(m, sel[0].cand.atom)) || (sel[1].poss ? false : holdsIn(m, sel[1].cand.atom)))
      need(!covers, 'debatable cover')
    }
    const lines = sel.map((s, i) => witnessLine(ROMAN[i], s.cand, true, s.poss))
    if (ans === 2) lines.push('I and II are complementary (exactly one of them is true in every diagram), so either I or II follows.')
    const ex = `${head}\n${lines.join('\n')}\nCorrect answer: (${OPT_LET[ans]}) ${SYL_STD_OPTIONS[ans]}`
    return {
      topic: 'syllogism',
      stem: `In the question below, statements are followed by two conclusions numbered I and II. Take the statements to be true even if they seem at variance with commonly known facts. ${sel.some((q) => q.poss) ? 'A conclusion stated as a possibility is accepted if it is true in at least one valid Venn diagram; all others must be true in every valid diagram. ' : ''}\n${stmtBlock}\nConclusions:\n${sel.map((s, i) => `${ROMAN[i]}. ${sub(s.cand.c, s.poss)}.`).join('\n')}`,
      options: SYL_STD_OPTIONS.slice(),
      answer: ans,
      explanation: ex,
    }
  })
}

export function generateSyllogismMains(rng: Rng, _difficulty: MockDifficulty, count: number): Group[] {
  void _difficulty
  const groups: Group[] = []
  for (const k of splitCount(count, 1)) {
    void k
    groups.push({ questions: [genSyllogism(rng)] })
  }
  return groups
}

// ============================================================================================ INEQUALITY
type Rel = '>' | '<' | '≥' | '≤' | '='
const REL5: Rel[] = ['>', '<', '≥', '≤', '=']
const flipRel = (r: Rel): Rel => (r === '>' ? '<' : r === '<' ? '>' : r === '≥' ? '≤' : r === '≤' ? '≥' : '=')

interface IChain {
  seq: number[]
  rels: Rel[]
}
interface ICon {
  a: number
  rel: Rel
  b: number
}
interface Edge {
  u: number
  v: number
  w: number
}

const MEANINGS: Record<Rel, string[]> = {
  '>': ['X is greater than Y', 'X is neither smaller than nor equal to Y'],
  '<': ['X is smaller than Y', 'X is neither greater than nor equal to Y'],
  '≥': ['X is either greater than or equal to Y', 'X is not smaller than Y'],
  '≤': ['X is either smaller than or equal to Y', 'X is not greater than Y'],
  '=': ['X is equal to Y', 'X is neither greater than nor smaller than Y'],
}
const CODE_SYMBOLS = ['@', '©', '%', '$', '#', '*', '&', '^']

/** Edge list "x_v >= x_u + w" (u <= v non-strict when w = 0, u < v strict when w = 1). */
function edgesOfRel(a: number, rel: Rel, b: number): Edge[] {
  switch (rel) {
    case '>':
      return [{ u: b, v: a, w: 1 }]
    case '≥':
      return [{ u: b, v: a, w: 0 }]
    case '<':
      return [{ u: a, v: b, w: 1 }]
    case '≤':
      return [{ u: a, v: b, w: 0 }]
    case '=':
      return [{ u: a, v: b, w: 0 }, { u: b, v: a, w: 0 }]
  }
}
function edgesOfChains(chains: IChain[]): Edge[] {
  const out: Edge[] = []
  for (const c of chains) for (let i = 0; i < c.rels.length; i++) out.push(...edgesOfRel(c.seq[i], c.rels[i], c.seq[i + 1]))
  return out
}
/** Difference-constraint solver (longest-path potentials); null when the system has a positive cycle (infeasible). */
function solveBF(k: number, edges: Edge[]): number[] | null {
  const x = new Array<number>(k).fill(0)
  for (let pass = 0; pass <= k; pass++) {
    let changed = false
    for (const e of edges) {
      if (x[e.v] < x[e.u] + e.w) {
        x[e.v] = x[e.u] + e.w
        changed = true
      }
    }
    if (!changed) return x
  }
  return null
}
const negRel = (r: Rel): Rel => (r === '>' ? '≤' : r === '≥' ? '<' : r === '<' ? '≥' : '>')

/** [entailed by BF, counter-assignment (a model of the statements violating the conclusion) or null] */
function bfJudge(k: number, base: Edge[], c: ICon): { entailed: boolean; counter: number[] | null; satisfiable: boolean } {
  const sat = (rel: Rel): number[] | null => solveBF(k, [...base, ...edgesOfRel(c.a, rel, c.b)])
  const satisfiable = sat(c.rel) !== null
  if (c.rel === '=') {
    const lt = sat('<')
    const gt = sat('>')
    return { entailed: lt === null && gt === null, counter: lt ?? gt, satisfiable }
  }
  const counter = sat(negRel(c.rel))
  return { entailed: counter === null, counter, satisfiable }
}

/** Floyd-Warshall closure: m[i][j] = 0 none, 1: i <= j, 2: i < j. */
function closure(k: number, chains: IChain[]): number[][] {
  const m = Array.from({ length: k }, () => new Array<number>(k).fill(0))
  for (const e of edgesOfChains(chains)) if (m[e.u][e.v] < e.w + 1) m[e.u][e.v] = e.w + 1
  for (let q = 0; q < k; q++)
    for (let i = 0; i < k; i++)
      for (let j = 0; j < k; j++) if (m[i][q] && m[q][j]) m[i][j] = Math.max(m[i][j], m[i][q] === 2 || m[q][j] === 2 ? 2 : 1)
  return m
}
function entailsCl(m: number[][], c: ICon): boolean {
  const { a, b } = c
  switch (c.rel) {
    case '>':
      return m[b][a] === 2
    case '≥':
      return m[b][a] >= 1
    case '<':
      return m[a][b] === 2
    case '≤':
      return m[a][b] >= 1
    case '=':
      return m[a][b] >= 1 && m[b][a] >= 1
  }
}
/** the conclusion can never hold together with the statements */
function impossibleCl(m: number[][], c: ICon): boolean {
  const { a, b } = c
  if (c.rel === '=') return m[a][b] === 2 || m[b][a] === 2
  return entailsCl(m, { a, rel: negRel(c.rel), b })
}

function randomChainRels(rng: Rng, len: number, allowed: Rel[]): Rel[] {
  const out: Rel[] = []
  let dir = rng.chance(0.5)
  const hasEq = allowed.includes('=')
  for (let i = 0; i < len; i++) {
    if (hasEq && rng.chance(0.12)) {
      out.push('=')
      continue
    }
    if (i > 0 && !rng.chance(0.62)) dir = !dir
    const strict = rng.chance(0.5)
    let fam: Rel[] = dir ? ['>', '≥'] : ['<', '≤']
    let want: Rel = strict ? fam[0] : fam[1]
    if (!allowed.includes(want)) want = strict ? fam[1] : fam[0]
    if (!allowed.includes(want)) {
      dir = !dir
      fam = dir ? ['>', '≥'] : ['<', '≤']
      want = allowed.includes(fam[0]) ? fam[0] : fam[1]
    }
    out.push(want)
  }
  return out
}

function buildChains(rng: Rng, allowed: Rel[]): { k: number; chains: IChain[] } {
  const E = rng.int(7, 9)
  const cyc = rng.chance(0.2)
  const c = cyc ? 2 : rng.pick([2, 2, 3])
  let lens: number[]
  if (c === 2) {
    const L1 = rng.int(3, Math.min(5, E - 2))
    lens = [L1, E - L1]
  } else {
    const L1 = rng.int(3, 4)
    const L2 = rng.int(2, 3)
    lens = [L1, L2, E - L1 - L2]
  }
  need(lens.every((l) => l >= (cyc ? 2 : 1)), 'chain lengths')
  const seqs: number[][] = []
  let next = 0
  const fresh = () => next++
  seqs.push(Array.from({ length: lens[0] + 1 }, fresh))
  if (cyc) {
    const a = rng.int(0, lens[0])
    let b = rng.int(0, lens[0])
    while (b === a) b = rng.int(0, lens[0])
    const s2 = [seqs[0][a]]
    for (let i = 1; i < lens[1]; i++) s2.push(fresh())
    s2.push(seqs[0][b])
    seqs.push(s2)
  } else {
    for (let ci = 1; ci < c; ci++) {
      const existing = next
      const share = rng.int(0, existing - 1)
      const pos = rng.int(0, lens[ci])
      const s: number[] = []
      for (let i = 0; i <= lens[ci]; i++) s.push(i === pos ? share : fresh())
      seqs.push(s)
    }
  }
  const chains: IChain[] = seqs.map((seq) => ({ seq, rels: randomChainRels(rng, seq.length - 1, allowed) }))
  return { k: next, chains }
}

const LETTER_POOL = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split('')

interface ICand {
  con: ICon
  ent: boolean
  imp: boolean
}

function conText(letters: string[], c: ICon, sym: (r: Rel) => string, swap: boolean): string {
  return swap ? `${letters[c.b]} ${sym(flipRel(c.rel))} ${letters[c.a]}` : `${letters[c.a]} ${sym(c.rel)} ${letters[c.b]}`
}

function pathText(chains: IChain[], letters: string[], lo: number, hi: number, needStrict: boolean): string {
  const edges: { lo: number; hi: number; sym: string; strict: boolean }[] = []
  for (const c of chains)
    for (let i = 0; i < c.rels.length; i++) {
      const a = c.seq[i]
      const b = c.seq[i + 1]
      switch (c.rels[i]) {
        case '>':
          edges.push({ lo: b, hi: a, sym: '<', strict: true })
          break
        case '≥':
          edges.push({ lo: b, hi: a, sym: '≤', strict: false })
          break
        case '<':
          edges.push({ lo: a, hi: b, sym: '<', strict: true })
          break
        case '≤':
          edges.push({ lo: a, hi: b, sym: '≤', strict: false })
          break
        default:
          edges.push({ lo: a, hi: b, sym: '=', strict: false }, { lo: b, hi: a, sym: '=', strict: false })
      }
    }
  type St = { node: number; s: boolean; prev: number; sym: string }
  const states: St[] = [{ node: lo, s: false, prev: -1, sym: '' }]
  const seen = new Set<string>([`${lo}0`])
  for (let qi = 0; qi < states.length; qi++) {
    const cur = states[qi]
    if (cur.node === hi && (!needStrict || cur.s)) {
      const parts: St[] = []
      for (let i = qi; i >= 0; i = states[i].prev) parts.unshift(states[i])
      return parts.map((p, idx) => (idx === 0 ? letters[p.node] : `${p.sym} ${letters[p.node]}`)).join(' ')
    }
    for (const e of edges) {
      if (e.lo !== cur.node) continue
      const ns = cur.s || e.strict
      const key = `${e.hi}${ns ? 1 : 0}`
      if (seen.has(key)) continue
      seen.add(key)
      states.push({ node: e.hi, s: ns, prev: qi, sym: e.sym })
    }
  }
  return ''
}

/** Reason line for one conclusion (written as `a rel b` in decoded form). */
function ineqReason(chains: IChain[], letters: string[], c: ICon, ent: boolean, base: Edge[], k: number): string {
  const L = (i: number) => letters[i]
  const txt = `${L(c.a)} ${c.rel} ${L(c.b)}`
  if (ent) {
    let path: string
    if (c.rel === '>' || c.rel === '≥') path = pathText(chains, letters, c.b, c.a, c.rel === '>')
    else if (c.rel === '<' || c.rel === '≤') path = pathText(chains, letters, c.a, c.b, c.rel === '<')
    else path = `${pathText(chains, letters, c.a, c.b, false)} and ${pathText(chains, letters, c.b, c.a, false)}`
    ensure(path !== '' && !path.startsWith(' and') && !path.endsWith('and '), 'path not found for entailed conclusion')
    return `${txt}: TRUE, since ${path}.`
  }
  const j = bfJudge(k, base, c)
  const counter = j.counter
  ensure(counter !== null, 'no counter-assignment for non-entailed conclusion')
  const shown = letters.map((l, i) => `${l}=${(counter as number[])[i]}`).join(', ')
  return `${txt}: NOT necessarily true. The values ${shown} satisfy every statement but violate it.`
}

type IneqKind = 'sub3' | 'two' | 'tf' | 'tfalse'

function genInequality(rng: Rng): QuestionDraft {
  return retry('inequality', () => {
    const kind: IneqKind = (['sub3', 'two', 'tf', 'tfalse'] as const)[wchoose(rng, [48, 17, 22, 13])]
    const coded = rng.chance(kind === 'sub3' ? 0.55 : 0.5)
    // symbols available (coded forms define only 4 or 5 of the five relations)
    let allowed: Rel[] = REL5.slice()
    if (coded && rng.chance(0.4)) {
      const drop = rng.pick<Rel>(['=', '≥', '≤', '>', '<'])
      allowed = REL5.filter((r) => r !== drop)
    }
    // keep at least one complementary-capable pair of symbols
    need(allowed.includes('≥') && allowed.includes('<') ? true : allowed.includes('>') && allowed.includes('≤'), 'pair')
    const { k, chains } = buildChains(rng, allowed)
    const m = closure(k, chains)
    for (let i = 0; i < k; i++) need(m[i][i] !== 2, 'inconsistent')
    const base = edgesOfChains(chains)
    ensure(solveBF(k, base) !== null, 'BF disagrees on consistency')
    const letters = rng.sample(LETTER_POOL, k)
    // adjacency: any pair appearing directly in a statement is not used in conclusions
    const adj = new Set<string>()
    for (const c of chains)
      for (let i = 0; i < c.rels.length; i++) {
        adj.add(`${c.seq[i]}-${c.seq[i + 1]}`)
        adj.add(`${c.seq[i + 1]}-${c.seq[i]}`)
      }
    const cands: ICand[] = []
    for (let a = 0; a < k; a++)
      for (let b = a + 1; b < k; b++) {
        if (adj.has(`${a}-${b}`)) continue
        for (const rel of allowed) {
          const con: ICon = { a, rel, b }
          cands.push({ con, ent: entailsCl(m, con), imp: impossibleCl(m, con) })
        }
      }
    const FO = cands.filter((c) => c.ent)
    const NF = cands.filter((c) => !c.ent)
    need(FO.length >= 3 && NF.length >= 6, 'pools')
    const verify = (c: ICand) => {
      const j = bfJudge(k, base, c.con)
      ensure(j.entailed === c.ent, `inequality entailment mismatch ${letters[c.con.a]} ${c.con.rel} ${letters[c.con.b]}`)
      ensure(!j.satisfiable === c.imp, 'inequality impossibility mismatch')
    }
    const samePair = (x: ICand, y: ICand) => x.con.a === y.con.a && x.con.b === y.con.b
    const pickDistinctPairs = (pool: ICand[], n: number, used: ICand[]): ICand[] => {
      const out: ICand[] = []
      for (const c of rng.shuffle(pool)) {
        if (out.length >= n) break
        if ([...used, ...out].some((u) => samePair(u, c))) continue
        out.push(c)
      }
      return out
    }
    // complementary candidate pairs: same two letters, relations (>=, <) or (>, <=), neither entailed
    const compPairs: [ICand, ICand][] = []
    for (const x of NF)
      for (const y of NF) {
        if (!samePair(x, y)) continue
        const r = x.con.rel + y.con.rel
        if (r === '≥<' || r === '>≤') compPairs.push([x, y])
      }
    const wantEither = compPairs.length > 0 && rng.chance(0.32)
    let code: Record<Rel, string> | null = null
    const sym = (r: Rel): string => (code ? code[r] : r)
    let legend = ''
    if (coded) {
      const syms = rng.sample(CODE_SYMBOLS, allowed.length)
      code = { '>': '', '<': '', '≥': '', '≤': '', '=': '' }
      allowed.forEach((r, i) => {
        ;(code as Record<Rel, string>)[r] = syms[i]
      })
      const lines = allowed
        .slice()
        .sort((p, q) => (code as Record<Rel, string>)[p].localeCompare((code as Record<Rel, string>)[q]))
        .map((r) => `'X ${(code as Record<Rel, string>)[r]} Y' means '${rng.pick(MEANINGS[r])}'.`)
      const ss = allowed.map((r) => (code as Record<Rel, string>)[r])
      legend = `In the following question the symbols ${ss.slice(0, -1).join(', ')} and ${ss[ss.length - 1]} are used with the meanings given below.\n${lines.join('\n')}`
    }
    const decodeLine = (() => {
      if (!code) return ''
      const c = code
      return `Decoding: ${allowed.map((r) => `${c[r]} means ${r}`).join(', ')}.`
    })()
    const stmtLines = chains.map((c) => c.seq.reduce((s, node, i) => (i === 0 ? letters[node] : `${s} ${sym(c.rels[i - 1])} ${letters[node]}`), ''))
    const decodedLines = chains.map((c) => c.seq.reduce((s, node, i) => (i === 0 ? letters[node] : `${s} ${c.rels[i - 1]} ${letters[node]}`), ''))
    const stmtBlock = `Statements:\n${stmtLines.join('\n')}`
    const exHead = `${decodeLine ? `${decodeLine}\n` : ''}Statements: ${decodedLines.join(' ; ')}.`
    const textOf = (c: ICand, swap: boolean) => conText(letters, c.con, sym, swap)
    const decodedOf = (c: ICand, swap: boolean) => conText(letters, c.con, (r) => r, swap)

    if (kind === 'sub3' || kind === 'two') {
      const N = kind === 'two' ? 2 : 3
      let all: ICand[]
      let want = -1
      if (kind === 'two') {
        want = rng.int(0, 4)
        if (want === 2) {
          need(compPairs.length > 0, 'no pair')
          all = rng.shuffle([...rng.pick(compPairs)])
        } else {
          const f1 = want === 0 || want === 4
          const f2 = want === 1 || want === 4
          const a = pickDistinctPairs(f1 ? FO : NF, 1, [])
          const b = pickDistinctPairs(f2 ? FO : NF, 1, a)
          need(a.length === 1 && b.length === 1, 'two pick')
          all = [a[0], b[0]]
        }
      } else if (wantEither) {
        const pair = rng.pick(compPairs)
        const f = rng.int(0, 1)
        const third = pickDistinctPairs(f ? FO : NF, 1, pair)
        need(third.length === 1, 'third')
        all = rng.shuffle([...pair, third[0]])
      } else {
        const f = wchoose(rng, [12, 34, 36, 18])
        const fo = pickDistinctPairs(FO, f, [])
        need(fo.length === f, 'followers')
        const non = pickDistinctPairs(NF, N - f, fo)
        need(non.length === N - f, 'non-followers')
        all = rng.shuffle([...fo, ...non])
      }
      all.forEach(verify)
      const idx = all.map((_, i) => i)
      const followSet = idx.filter((i) => all[i].ent)
      const pairsFound: [number, number][] = []
      for (let i = 0; i < N; i++)
        for (let j = i + 1; j < N; j++) {
          if (all[i].ent || all[j].ent || !samePair(all[i], all[j])) continue
          const r = all[i].con.rel + all[j].con.rel
          if (r === '≥<' || r === '>≤' || r === '<≥' || r === '≤>') pairsFound.push([i, j])
        }
      need(pairsFound.length <= 1, 'ambiguous either-or')
      // reject overlapping (non-complementary) joint cover of the same pair: debatable in the exam convention
      for (let i = 0; i < N; i++)
        for (let j = i + 1; j < N; j++) {
          if (!samePair(all[i], all[j]) || all[i].ent || all[j].ent || pairsFound.some(([p, q]) => p === i && q === j)) continue
          const sets = [all[i], all[j]].map((c) => relSet(c.con.rel))
          need(!(new Set([...sets[0], ...sets[1]]).size === 3), 'debatable cover')
        }
      const truth: Desc = { set: followSet, either: pairsFound[0] ?? null }
      const swaps = all.map((c) => rng.chance(0.5) && allowed.includes(flipRel(c.con.rel)))
      const lines = all.map((c, i) => `${ROMAN[i]}. ${decodedOf(c, swaps[i])}${code ? ` (coded: ${textOf(c, swaps[i])})` : ''} - ${ineqReason(chains, letters, c.con, c.ent, base, k).split(': ').slice(1).join(': ')}`)
      if (truth.either) lines.push(`${ROMAN[truth.either[0]]} and ${ROMAN[truth.either[1]]} are complementary (together they cover every possibility and exclude each other), so either ${ROMAN[truth.either[0]]} or ${ROMAN[truth.either[1]]} is true.`)
      const concl = all.map((c, i) => `${ROMAN[i]}. ${textOf(c, swaps[i])}`).join('\n')
      const ex = `${exHead}\n${lines.join('\n')}`
      if (kind === 'two') {
        const stdOpts = SYL_STD_OPTIONS.map((o) => o.replace('follows', 'is true').replace('follow', 'are true'))
        const f1 = all[0].ent
        const f2 = all[1].ent
        const ans = f1 && f2 ? 4 : f1 ? 0 : f2 ? 1 : truth.either ? 2 : 3
        ensure(ans === want, 'inequality two-conclusion outcome')
        return {
          topic: 'inequality',
          stem: `${coded ? `${legend}\n` : ''}In the question below, assuming the given statements to be true, find which of the conclusions I and II is/are definitely true.\n${stmtBlock}\nConclusions:\n${concl}`,
          options: stdOpts,
          answer: ans,
          explanation: `${ex}\nCorrect answer: (${OPT_LET[ans]}) ${stdOpts[ans]}`,
        }
      }
      const o = descOptions(rng, N, truth, V_TRUE, ex)
      return {
        topic: 'inequality',
        stem: `${coded ? `${legend}\n` : ''}In the question below, assuming the given statements to be true, find which of the three conclusions I, II and III is/are definitely true. (If two conclusions are complementary, one of them must be true: treat that as "either-or".)\n${stmtBlock}\nConclusions:\n${concl}`,
        ...o,
      }
    }

    // single-answer forms: five expressions, exactly one is definitely true / definitely false
    const used: ICand[] = []
    let key: ICand
    let wrong: ICand[]
    if (kind === 'tf') {
      const kk = pickDistinctPairs(FO, 1, used)
      need(kk.length === 1, 'tf key')
      key = kk[0]
      const NP = NF.filter((c) => !c.imp)
      const NI = NF.filter((c) => c.imp)
      const wp = pickDistinctPairs(NP, rng.int(2, 3), [key])
      const wi = pickDistinctPairs(NI, 4 - wp.length, [key, ...wp])
      wrong = [...wp, ...wi]
      if (wrong.length < 4) wrong = [...wrong, ...pickDistinctPairs(NF, 4 - wrong.length, [key, ...wrong])]
    } else {
      const IMP = cands.filter((c) => c.imp)
      need(IMP.length >= 1, 'imp pool')
      const kk = pickDistinctPairs(IMP, 1, used)
      need(kk.length === 1, 'tfalse key')
      key = kk[0]
      const SAT = cands.filter((c) => !c.imp)
      wrong = pickDistinctPairs(SAT, 4, [key])
    }
    need(wrong.length === 4, 'wrong options')
    ;[key, ...wrong].forEach(verify)
    const swaps = [key, ...wrong].map((c) => rng.chance(0.5) && allowed.includes(flipRel(c.con.rel)))
    const optText = [key, ...wrong].map((c, i) => textOf(c, swaps[i]))
    need(new Set(optText).size === 5, 'dup options')
    const lines = [key, ...wrong].map((c, i) => {
      const judge = ineqReason(chains, letters, c.con, c.ent, base, k)
      if (kind === 'tf') return `${decodedOf(c, swaps[i])}${code ? ` (coded: ${optText[i]})` : ''} - ${judge.split(': ').slice(1).join(': ')}`
      if (c.imp) {
        const neg = negRel(c.con.rel)
        const path = c.con.rel === '=' ? '' : neg === '>' || neg === '≥' ? pathText(chains, letters, c.con.b, c.con.a, neg === '>') : pathText(chains, letters, c.con.a, c.con.b, neg === '<')
        return `${decodedOf(c, swaps[i])}${code ? ` (coded: ${optText[i]})` : ''} - IMPOSSIBLE: ${c.con.rel === '=' ? 'the statements force one of them to be strictly larger' : `the statements force ${letters[c.con.a]} ${neg} ${letters[c.con.b]} (${path})`}, so it is definitely false.`
      }
      const witness = solveBF(k, [...base, ...edgesOfRel(c.con.a, c.con.rel, c.con.b)])
      ensure(witness !== null, 'witness for satisfiable expression')
      return `${decodedOf(c, swaps[i])}${code ? ` (coded: ${optText[i]})` : ''} - can be true: ${(witness as number[]).map((v, ix) => `${letters[ix]}=${v}`).join(', ')} satisfies the statements and this expression.`
    })
    const ask = kind === 'tf' ? 'Which of the following expressions is definitely true?' : 'Which of the following expressions can NEVER be true (is definitely false) given the statements?'
    const o = finishOptions(rng, optText[0], optText.slice(1), `${exHead}\n${lines.join('\n')}`)
    return { topic: 'inequality', stem: `${coded ? `${legend}\n` : ''}Study the statements and answer the question that follows.\n${stmtBlock}\n${ask}`, ...o }
  })
}

/** which of {<, =, >} a relation allows */
function relSet(r: Rel): number[] {
  switch (r) {
    case '>':
      return [2]
    case '≥':
      return [1, 2]
    case '<':
      return [0]
    case '≤':
      return [0, 1]
    default:
      return [1]
  }
}

export function generateInequalityMains(rng: Rng, _difficulty: MockDifficulty, count: number): Group[] {
  void _difficulty
  const groups: Group[] = []
  for (const k of splitCount(count, 1)) {
    void k
    groups.push({ questions: [genInequality(rng)] })
  }
  return groups
}

// ============================================================================================ BLOOD RELATIONS
// Model space = every family that fits the structure described in the puzzle text: one married couple, `k` children,
// the first `m` of them married to outsiders (members without parents in the family), grandchildren per married child
// `g[i]`. A model = (gender pattern of the children/grandchildren, bijection names -> positions).
interface Skel {
  k: number
  m: number
  g: number[]
  n: number
  bits: number
}
interface Kin {
  n: number
  gen: number[]
  fa: number[]
  mo: number[]
  sp: number[]
}
interface BModel {
  pat: number
  slot: Int8Array
}
export interface BloodProofA {
  k: number
  m: number
  g: number[]
  n: number
}

const GENDERED = [
  'father', 'mother', 'son', 'daughter', 'brother', 'sister', 'husband', 'wife', 'paternal grandfather', 'paternal grandmother',
  'maternal grandfather', 'maternal grandmother', 'grandson', 'granddaughter', 'paternal uncle', 'maternal uncle', 'paternal aunt',
  'maternal aunt', 'uncle', 'aunt', 'nephew', 'niece', 'brother-in-law', 'sister-in-law', 'father-in-law', 'mother-in-law',
  'son-in-law', 'daughter-in-law',
]
const PRIM = GENDERED.slice(0, 8)
const NEUTRAL = ['sibling', 'spouse', 'parent', 'child', 'grandparent', 'grandchild', 'cousin']
const VOCAB = [...GENDERED, ...NEUTRAL]
/** terms usable as answers: gender-specific ones plus "cousin" */
const AV = [...GENDERED, 'cousin']
const FUNC_TERMS = ['father', 'mother', 'spouse', 'paternal grandfather', 'paternal grandmother', 'maternal grandfather', 'maternal grandmother', 'father-in-law', 'mother-in-law']
const ONLY_VIA = ['paternal grandfather', 'paternal grandmother', 'maternal grandfather', 'maternal grandmother']
const MALE_TERMS = new Set(['father', 'son', 'brother', 'husband', 'paternal grandfather', 'maternal grandfather', 'grandson', 'paternal uncle', 'maternal uncle', 'uncle', 'nephew', 'brother-in-law', 'father-in-law', 'son-in-law'])
const GEN_LEVEL: Record<string, number> = {
  father: 1, mother: 1, 'paternal uncle': 1, 'maternal uncle': 1, 'paternal aunt': 1, 'maternal aunt': 1, uncle: 1, aunt: 1, 'father-in-law': 1, 'mother-in-law': 1,
  'paternal grandfather': 2, 'paternal grandmother': 2, 'maternal grandfather': 2, 'maternal grandmother': 2,
  son: -1, daughter: -1, nephew: -1, niece: -1, 'son-in-law': -1, 'daughter-in-law': -1, grandson: -2, granddaughter: -2,
  brother: 0, sister: 0, husband: 0, wife: 0, cousin: 0, 'brother-in-law': 0, 'sister-in-law': 0,
}
const PLURAL: Record<string, string> = {
  brother: 'brothers', sister: 'sisters', cousin: 'cousins', son: 'sons', daughter: 'daughters', nephew: 'nephews', niece: 'nieces',
  grandson: 'grandsons', granddaughter: 'granddaughters', 'paternal uncle': 'paternal uncles', 'paternal aunt': 'paternal aunts',
  'maternal uncle': 'maternal uncles', 'maternal aunt': 'maternal aunts',
}
const COUNT_TERMS = Object.keys(PLURAL)

function randSkel(rng: Rng): Skel {
  const k = rng.pick([2, 3, 3])
  const m = k === 2 ? rng.pick([1, 2, 2]) : rng.pick([1, 2])
  const g: number[] = []
  for (let i = 0; i < m; i++) g.push(rng.int(0, 2))
  const n = 2 + k + m + g.reduce((a, b) => a + b, 0)
  need(n >= 8 && n <= 10, 'size')
  need(g.reduce((a, b) => a + b, 0) >= 1, 'grandchildren')
  if (m === 2) need(g[0] !== g[1], 'distinct branches')
  return { k, m, g, n, bits: k + g.reduce((a, b) => a + b, 0) }
}

function buildKin(sk: Skel, pat: number): Kin {
  const { n, k, m, g } = sk
  const gen = new Array<number>(n).fill(0)
  const fa = new Array<number>(n).fill(-1)
  const mo = new Array<number>(n).fill(-1)
  const sp = new Array<number>(n).fill(-1)
  gen[0] = 1
  gen[1] = 0
  sp[0] = 1
  sp[1] = 0
  let bit = 0
  for (let i = 0; i < k; i++) {
    gen[2 + i] = (pat >> bit++) & 1
    fa[2 + i] = 0
    mo[2 + i] = 1
  }
  for (let i = 0; i < m; i++) {
    const s = 2 + k + i
    gen[s] = 1 - gen[2 + i]
    sp[s] = 2 + i
    sp[2 + i] = s
  }
  let next = 2 + k + m
  for (let i = 0; i < m; i++) {
    const kid = 2 + i
    const spo = 2 + k + i
    for (let j = 0; j < g[i]; j++) {
      const s = next++
      gen[s] = (pat >> bit++) & 1
      fa[s] = gen[kid] === 1 ? kid : spo
      mo[s] = gen[kid] === 1 ? spo : kid
    }
  }
  return { n, gen, fa, mo, sp }
}

/** groups of interchangeable (leaf sibling) slots: kept in canonical (gender, name) order to remove duplicate models */
function symGroups(sk: Skel): number[][] {
  const out: number[][] = []
  if (sk.k - sk.m >= 2) out.push(Array.from({ length: sk.k - sk.m }, (_, i) => 2 + sk.m + i))
  let next = 2 + sk.k + sk.m
  for (let i = 0; i < sk.m; i++) {
    if (sk.g[i] >= 2) out.push(Array.from({ length: sk.g[i] }, (_, j) => next + j))
    next += sk.g[i]
  }
  return out
}

const sibK = (kin: Kin, a: number, b: number): boolean => a >= 0 && b >= 0 && a !== b && kin.fa[a] >= 0 && kin.fa[a] === kin.fa[b] && kin.mo[a] === kin.mo[b]

/** slot of the single person related to slot s by a functional term, or -1 */
function fnTerm(kin: Kin, term: string, s: number): number {
  if (s < 0) return -1
  const f = (x: number) => (x >= 0 ? kin.fa[x] : -1)
  const mm = (x: number) => (x >= 0 ? kin.mo[x] : -1)
  const sp = (x: number) => (x >= 0 ? kin.sp[x] : -1)
  switch (term) {
    case 'father':
      return f(s)
    case 'mother':
      return mm(s)
    case 'spouse':
      return sp(s)
    case 'paternal grandfather':
      return f(f(s))
    case 'paternal grandmother':
      return mm(f(s))
    case 'maternal grandfather':
      return f(mm(s))
    case 'maternal grandmother':
      return mm(mm(s))
    case 'father-in-law':
      return f(sp(s))
    case 'mother-in-law':
      return mm(sp(s))
  }
  throw new Error(`fnTerm ${term}`)
}

const fOf = (kin: Kin, s: number): number => (s >= 0 ? kin.fa[s] : -1)
const mOf = (kin: Kin, s: number): number => (s >= 0 ? kin.mo[s] : -1)
/** a is a grandparent of s */
const grandOf = (kin: Kin, s: number, a: number): boolean => fOf(kin, fOf(kin, s)) === a || mOf(kin, fOf(kin, s)) === a || fOf(kin, mOf(kin, s)) === a || mOf(kin, mOf(kin, s)) === a
const nephewOf = (kin: Kin, x: number, y: number): boolean => {
  const sy = kin.sp[y]
  const p1 = kin.fa[x]
  const p2 = kin.mo[x]
  return (p1 >= 0 && (sibK(kin, p1, y) || (sy >= 0 && sibK(kin, p1, sy)))) || (p2 >= 0 && (sibK(kin, p2, y) || (sy >= 0 && sibK(kin, p2, sy))))
}
const cousinOf = (kin: Kin, x: number, y: number): boolean => {
  if (x === y) return false
  const a1 = kin.fa[x]
  const a2 = kin.mo[x]
  const b1 = kin.fa[y]
  const b2 = kin.mo[y]
  return (a1 >= 0 && ((b1 >= 0 && sibK(kin, a1, b1)) || (b2 >= 0 && sibK(kin, a1, b2)))) || (a2 >= 0 && ((b1 >= 0 && sibK(kin, a2, b1)) || (b2 >= 0 && sibK(kin, a2, b2))))
}
const inLawSib = (kin: Kin, x: number, y: number): boolean => (kin.sp[x] >= 0 && sibK(kin, kin.sp[x], y)) || (kin.sp[y] >= 0 && sibK(kin, x, kin.sp[y]))
const uncleBy = (kin: Kin, x: number, y: number): boolean => kin.sp[x] >= 0 && (sibK(kin, kin.sp[x], kin.fa[y]) || sibK(kin, kin.sp[x], kin.mo[y]))

/** x is the `term` of y (slot level) */
function holdsTerm(kin: Kin, term: string, x: number, y: number): boolean {
  const { gen, fa, mo, sp } = kin
  const M = gen[x] === 1
  switch (term) {
    case 'father':
      return fa[y] === x
    case 'mother':
      return mo[y] === x
    case 'son':
      return M && (fa[x] === y || mo[x] === y)
    case 'daughter':
      return !M && (fa[x] === y || mo[x] === y)
    case 'brother':
      return M && sibK(kin, x, y)
    case 'sister':
      return !M && sibK(kin, x, y)
    case 'husband':
      return M && sp[y] === x
    case 'wife':
      return !M && sp[y] === x
    case 'paternal grandfather':
      return fOf(kin, fOf(kin, y)) === x
    case 'paternal grandmother':
      return mOf(kin, fOf(kin, y)) === x
    case 'maternal grandfather':
      return fOf(kin, mOf(kin, y)) === x
    case 'maternal grandmother':
      return mOf(kin, mOf(kin, y)) === x
    case 'grandson':
      return M && grandOf(kin, x, y)
    case 'granddaughter':
      return !M && grandOf(kin, x, y)
    case 'paternal uncle':
      return M && sibK(kin, x, fa[y])
    case 'maternal uncle':
      return M && sibK(kin, x, mo[y])
    case 'paternal aunt':
      return !M && sibK(kin, x, fa[y])
    case 'maternal aunt':
      return !M && sibK(kin, x, mo[y])
    case 'uncle':
      return M && uncleBy(kin, x, y)
    case 'aunt':
      return !M && uncleBy(kin, x, y)
    case 'nephew':
      return M && nephewOf(kin, x, y)
    case 'niece':
      return !M && nephewOf(kin, x, y)
    case 'cousin':
      return cousinOf(kin, x, y)
    case 'brother-in-law':
      return M && inLawSib(kin, x, y)
    case 'sister-in-law':
      return !M && inLawSib(kin, x, y)
    case 'father-in-law':
      return M && sp[y] >= 0 && fa[sp[y]] === x
    case 'mother-in-law':
      return !M && sp[y] >= 0 && mo[sp[y]] === x
    case 'son-in-law':
      return M && sp[x] >= 0 && (fa[sp[x]] === y || mo[sp[x]] === y)
    case 'daughter-in-law':
      return !M && sp[x] >= 0 && (fa[sp[x]] === y || mo[sp[x]] === y)
    case 'sibling':
      return sibK(kin, x, y)
    case 'spouse':
      return sp[y] === x
    case 'parent':
      return fa[y] === x || mo[y] === x
    case 'child':
      return fa[x] === y || mo[x] === y
    case 'grandparent':
      return grandOf(kin, y, x)
    case 'grandchild':
      return grandOf(kin, x, y)
  }
  throw new Error(`holdsTerm ${term}`)
}

/** wider everyday readings of a few terms; a distractor that is definitely true under such a reading would be ambiguous */
function holdsBroad(kin: Kin, term: string, x: number, y: number): boolean {
  if (holdsTerm(kin, term, x, y)) return true
  switch (term) {
    case 'uncle':
      return holdsTerm(kin, 'paternal uncle', x, y) || holdsTerm(kin, 'maternal uncle', x, y)
    case 'aunt':
      return holdsTerm(kin, 'paternal aunt', x, y) || holdsTerm(kin, 'maternal aunt', x, y)
    case 'brother-in-law':
      return kin.gen[x] === 1 && kin.sp[x] >= 0 && kin.sp[y] >= 0 && sibK(kin, kin.sp[x], kin.sp[y])
    case 'sister-in-law':
      return kin.gen[x] === 0 && kin.sp[x] >= 0 && kin.sp[y] >= 0 && sibK(kin, kin.sp[x], kin.sp[y])
  }
  return false
}

type Clue = { kind: 'rel'; term: string; x: number; y: number } | { kind: 'only'; sex: 'son' | 'daughter' | 'child'; x: number; y: number; via: string }

function onlyHolds(kin: Kin, sx: number, sy: number, via: string, sex: 'son' | 'daughter' | 'child'): boolean {
  const z = fnTerm(kin, via, sy)
  if (z < 0) return false
  let count = 0
  let hit = false
  for (let s = 0; s < kin.n; s++) {
    if (kin.fa[s] !== z && kin.mo[s] !== z) continue
    if (sex === 'son' && kin.gen[s] !== 1) continue
    if (sex === 'daughter' && kin.gen[s] !== 0) continue
    count++
    if (s === sx) hit = true
  }
  return count === 1 && hit
}
function clueHolds(kin: Kin, slot: Int8Array, c: Clue): boolean {
  if (c.kind === 'rel') return holdsTerm(kin, c.term, slot[c.x], slot[c.y])
  return onlyHolds(kin, slot[c.x], slot[c.y], c.via, c.sex)
}

const PATTERN_CACHE = new Map<string, { pat: number; kin: Kin }[]>()
function validPatterns(sk: Skel): { pat: number; kin: Kin }[] {
  const ck = `${sk.k}|${sk.m}|${sk.g.join(',')}`
  const hit = PATTERN_CACHE.get(ck)
  if (hit) return hit
  const groups = symGroups(sk)
  const out: { pat: number; kin: Kin }[] = []
  for (let pat = 0; pat < 1 << sk.bits; pat++) {
    const kin = buildKin(sk, pat)
    if (groups.every((gr) => gr.every((s, i) => i === 0 || kin.gen[gr[i - 1]] <= kin.gen[s]))) out.push({ pat, kin })
  }
  PATTERN_CACHE.set(ck, out)
  return out
}

function searchModels(sk: Skel, clues: Clue[], order: number[], cap: number): { models: BModel[]; kins: Map<number, Kin>; overflow: boolean } {
  const n = sk.n
  const pos = new Array<number>(n).fill(0)
  order.forEach((name, i) => {
    pos[name] = i
  })
  const byDepth: Clue[][] = Array.from({ length: n }, () => [])
  for (const c of clues) byDepth[Math.max(pos[c.x], pos[c.y])].push(c)
  const gprev = new Array<number>(n).fill(-1)
  const gnext = new Array<number>(n).fill(-1)
  for (const gr of symGroups(sk))
    for (let i = 0; i < gr.length; i++) {
      if (i > 0) gprev[gr[i]] = gr[i - 1]
      if (i < gr.length - 1) gnext[gr[i]] = gr[i + 1]
    }
  const models: BModel[] = []
  const kins = new Map<number, Kin>()
  let nodes = 0
  let overflow = false
  for (const { pat, kin } of validPatterns(sk)) {
    kins.set(pat, kin)
    const slot = new Int8Array(n).fill(-1)
    const occ = new Int8Array(n).fill(-1)
    const dfs = (d: number): boolean => {
      if (d === n) {
        models.push({ pat, slot: Int8Array.from(slot) })
        return models.length <= cap
      }
      const name = order[d]
      for (let s = 0; s < n; s++) {
        if (occ[s] >= 0) continue
        if (++nodes > 250000) return false
        const p = gprev[s]
        if (p >= 0 && occ[p] >= 0 && kin.gen[p] === kin.gen[s] && occ[p] > name) continue
        const q = gnext[s]
        if (q >= 0 && occ[q] >= 0 && kin.gen[q] === kin.gen[s] && occ[q] < name) continue
        slot[name] = s
        occ[s] = name
        let ok = true
        for (const c of byDepth[d])
          if (!clueHolds(kin, slot, c)) {
            ok = false
            break
          }
        if (ok && !dfs(d + 1)) return false
        slot[name] = -1
        occ[s] = -1
      }
      return true
    }
    if (!dfs(0)) {
      overflow = true
      break
    }
  }
  return { models, kins, overflow }
}

interface Ctx {
  sk: Skel
  names: string[]
  models: BModel[]
  kins: Map<number, Kin>
  clues: Clue[]
  kin0: Kin
  slot0: number[]
  coded: boolean
  ops: Record<string, string>
}
type Status = 'all' | 'some' | 'none'

function statusOf(ctx: Ctx, f: (kin: Kin, slot: Int8Array) => boolean): Status {
  let t = false
  let fl = false
  for (const m of ctx.models) {
    if (f(ctx.kins.get(m.pat) as Kin, m.slot)) t = true
    else fl = true
    if (t && fl) return 'some'
  }
  return t ? 'all' : 'none'
}

/** Status of every answer term for the ordered pair returned by `pairOf` (null = no pair in that model). */
function termStatuses(ctx: Ctx, pairOf: (kin: Kin, slot: Int8Array) => [number, number] | null): { stat: Map<string, Status>; bstat: Map<string, Status>; everyHas: boolean } {
  const tCount = new Map<string, number>()
  const bCount = new Map<string, number>()
  for (const t of AV) {
    tCount.set(t, 0)
    bCount.set(t, 0)
  }
  let everyHas = true
  for (const m of ctx.models) {
    const kin = ctx.kins.get(m.pat) as Kin
    const pr = pairOf(kin, m.slot)
    let has = false
    if (pr) {
      for (const t of AV)
        if (holdsTerm(kin, t, pr[0], pr[1])) {
          tCount.set(t, (tCount.get(t) as number) + 1)
          has = true
        }
      for (const t of AV) if (holdsBroad(kin, t, pr[0], pr[1])) bCount.set(t, (bCount.get(t) as number) + 1)
    }
    if (!has) everyHas = false
  }
  const stat = new Map<string, Status>()
  const bstat = new Map<string, Status>()
  for (const t of AV) {
    const c = tCount.get(t) as number
    stat.set(t, c === 0 ? 'none' : c === ctx.models.length ? 'all' : 'some')
    const b = bCount.get(t) as number
    bstat.set(t, b === 0 ? 'none' : b === ctx.models.length ? 'all' : 'some')
  }
  return { stat, bstat, everyHas }
}

const relPhrase = (term: string): string => (['cousin', 'sibling', 'child', 'parent', 'grandparent', 'grandchild'].includes(term) ? `a ${term} of` : `the ${term} of`)
const relSentence = (x: string, term: string, y: string): string => (term === 'spouse' ? `${x} is married to ${y}` : `${x} is ${relPhrase(term)} ${y}`)
const NUMWORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

function clueText(ctx: Ctx, c: Clue): string {
  const nm = ctx.names
  if (c.kind === 'only') return `${nm[c.x]} is the only ${c.sex} of ${nm[c.y]}'s ${c.via}.`
  return `${relSentence(nm[c.x], c.term, nm[c.y])}.`
}

function pickTerm(rng: Rng, terms: string[], coded: boolean): string {
  const w = terms.map((t) => (PRIM.includes(t) ? (coded ? 3 : 1) : NEUTRAL.includes(t) ? (coded ? 0.6 : 1) : coded ? 0.9 : 2.2))
  return terms[wchoose(rng, w)]
}

function roleText(ctx: Ctx, name: number): string {
  const kin = ctx.kin0
  const s = ctx.slot0[name]
  const inv = new Map<number, number>()
  ctx.slot0.forEach((sl, nme) => inv.set(sl, nme))
  const nm = (sl: number) => ctx.names[inv.get(sl) as number]
  const parts: string[] = [kin.gen[s] === 1 ? 'male' : 'female']
  if (kin.fa[s] >= 0) parts.push(`child of ${nm(kin.fa[s])} and ${nm(kin.mo[s])}`)
  if (kin.sp[s] >= 0) parts.push(`married to ${nm(kin.sp[s])}`)
  const kids: string[] = []
  for (let c = 0; c < kin.n; c++) if (kin.fa[c] === s || kin.mo[c] === s) kids.push(nm(c))
  if (kids.length) parts.push(`parent of ${joinAnd(kids)}`)
  return parts.join(', ')
}

function treeLines(ctx: Ctx): string[] {
  const { sk, kin0 } = ctx
  const inv = new Map<number, number>()
  ctx.slot0.forEach((sl, nme) => inv.set(sl, nme))
  const nm = (sl: number) => ctx.names[inv.get(sl) as number]
  const sx = (sl: number) => `${nm(sl)} (${kin0.gen[sl] === 1 ? 'M' : 'F'})`
  const lines: string[] = [`Generation I: ${sx(0)} is married to ${sx(1)}.`]
  const g2: string[] = []
  for (let i = 0; i < sk.k; i++) {
    const s = 2 + i
    g2.push(`${sx(s)} child of ${nm(0)} and ${nm(1)}${i < sk.m ? `, married to ${sx(2 + sk.k + i)}` : ', unmarried'}`)
  }
  lines.push(`Generation II: ${g2.join('; ')}.`)
  const g3: string[] = []
  let next = 2 + sk.k + sk.m
  for (let i = 0; i < sk.m; i++) {
    const kids: string[] = []
    for (let j = 0; j < sk.g[i]; j++) kids.push(sx(next++))
    g3.push(kids.length ? `${kids.join(' and ')} child${kids.length > 1 ? 'ren' : ''} of ${nm(2 + i)} and ${nm(2 + sk.k + i)}` : `${nm(2 + i)} and ${nm(2 + sk.k + i)} have no children`)
  }
  lines.push(`Generation III: ${g3.join('; ')}.`)
  return lines
}

interface QOut {
  stem: string
  options: string[]
  answer: number
  reason: string
}

function tidyOptions(rng: Rng, correct: string, wrong: string[]): { options: string[]; answer: number } {
  const options = rng.shuffle([correct, ...wrong.slice(0, 4)])
  ensure(new Set(options).size === 5, 'blood options')
  return { options, answer: options.indexOf(correct) }
}

const CBD = 'Cannot be determined'
const capT = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1)

function distractorTerms(rng: Rng, key: string | null, stat: Map<string, Status>, bstat: Map<string, Status>, count: number, genderHint: boolean | null): string[] {
  const exclude = new Set<string>([key ?? ''])
  if (key && (key === 'paternal uncle' || key === 'maternal uncle')) exclude.add('uncle')
  if (key && (key === 'paternal aunt' || key === 'maternal aunt')) exclude.add('aunt')
  if (key === 'uncle') {
    exclude.add('paternal uncle')
    exclude.add('maternal uncle')
  }
  if (key === 'aunt') {
    exclude.add('paternal aunt')
    exclude.add('maternal aunt')
  }
  const lvl = key ? GEN_LEVEL[key] : undefined
  const pool = AV.filter((t) => !exclude.has(t) && stat.get(t) !== 'all' && bstat.get(t) !== 'all')
  const scored = pool.map((t) => {
    let s = rng.next() * 2
    if (stat.get(t) === 'some') s += 3
    if (lvl !== undefined && GEN_LEVEL[t] === lvl) s += 2
    if (genderHint !== null && MALE_TERMS.has(t) === genderHint) s += 1
    return { t, s }
  })
  scored.sort((a, b) => b.s - a.s)
  return scored.slice(0, count).map((x) => x.t)
}

function qRelation(rng: Rng, ctx: Ctx, via: string | null): QOut | null {
  const n = ctx.sk.n
  for (let tr = 0; tr < 14; tr++) {
    const x = rng.int(0, n - 1)
    const y = rng.int(0, n - 1)
    if (x === y) continue
    if (!via && ctx.clues.some((c) => c.kind === 'rel' && ((c.x === x && c.y === y) || (c.x === y && c.y === x)))) continue
    const { stat, bstat, everyHas } = termStatuses(ctx, (kin, slot) => {
      const sy = via ? fnTerm(kin, via, slot[y]) : slot[y]
      if (sy < 0 || sy === slot[x]) return null
      return [slot[x], sy]
    })
    const D = AV.filter((t) => stat.get(t) === 'all')
    if (D.length > 1) continue
    const target = via ? `the ${via} of ${ctx.names[y]}` : ctx.names[y]
    const stem = `How is ${ctx.names[x]} related to ${target}?`
    if (D.length === 1) {
      const key = D[0]
      const hint = MALE_TERMS.has(key)
      const dist = distractorTerms(rng, key, stat, bstat, 4, hint)
      if (dist.length < 4) continue
      const withCbd = rng.chance(0.3)
      const wrong = withCbd ? [...dist.slice(0, 3).map(capT), CBD] : dist.map(capT)
      const o = tidyOptions(rng, capT(key), wrong)
      const reason = `${ctx.names[x]}: ${roleText(ctx, x)}. ${ctx.names[y]}: ${roleText(ctx, y)}.\nSo ${ctx.names[x]} is the ${key} of ${via ? `the ${via} of ` : ''}${ctx.names[y]} in every consistent family structure.`
      return { stem, ...o, reason }
    }
    // no definite term: legitimate "cannot be determined" only when a relation always exists but varies
    const distinct = AV.filter((t) => stat.get(t) === 'some')
    if (everyHas && distinct.length >= 2 && rng.chance(0.5)) {
      const pick = rng.sample(distinct, Math.min(distinct.length, 4))
      const extra = distractorTerms(rng, null, stat, bstat, 8, null).filter((t) => !pick.includes(t))
      const four = [...pick, ...extra].slice(0, 4)
      if (four.length < 4) continue
      const o = tidyOptions(rng, CBD, four.map(capT))
      const reason = `The statements do not fix the gender or position of ${ctx.names[x]} (or ${ctx.names[y]}) uniquely: in different consistent family structures the relation comes out as ${joinAnd(distinct.map(capT).slice(0, 4))}. No single relation holds in all of them.`
      return { stem, ...o, reason }
    }
  }
  return null
}

function qDefinite(rng: Rng, ctx: Ctx): QOut | null {
  const n = ctx.sk.n
  const statOf = (x: number, t: string, y: number): Status => statusOf(ctx, (kin, slot) => holdsTerm(kin, t, slot[x], slot[y]))
  const D: { x: number; t: string; y: number }[] = []
  const S: { x: number; t: string; y: number }[] = []
  const N0: { x: number; t: string; y: number }[] = []
  const clueSet = new Set(ctx.clues.filter((c) => c.kind === 'rel').map((c) => `${c.x}|${(c as { term: string }).term}|${c.y}`))
  let guard = 0
  const termsAvail = ctx.coded ? PRIM.filter((t) => ctx.ops[t]) : AV
  while (guard++ < 70 && (D.length < 2 || S.length < 3 || N0.length < 3)) {
    const x = rng.int(0, n - 1)
    const y = rng.int(0, n - 1)
    if (x === y) continue
    const t = rng.pick(termsAvail)
    const st = statOf(x, t, y)
    const item = { x, t, y }
    if (st === 'all') {
      if (!clueSet.has(`${x}|${t}|${y}`)) D.push(item)
    } else if (st === 'some') S.push(item)
    else N0.push(item)
  }
  if (!D.length || S.length + N0.length < 4) return null
  const key = rng.pick(D)
  const sameKeyPair = (i: { x: number; y: number }) => (i.x === key.x && i.y === key.y) || (i.x === key.y && i.y === key.x)
  const take: { x: number; t: string; y: number }[] = []
  for (const it of [...rng.shuffle(S).slice(0, 2), ...rng.shuffle(N0), ...rng.shuffle(S).slice(2)]) {
    if (take.length >= 4) break
    if (sameKeyPair(it)) continue
    if (statusOf(ctx, (kin, slot) => holdsBroad(kin, it.t, slot[it.x], slot[it.y])) === 'all') continue
    if (take.some((o) => o.x === it.x && o.y === it.y && o.t === it.t)) continue
    take.push(it)
  }
  if (take.length < 4) return null
  const render = (i: { x: number; t: string; y: number }): string => relSentence(ctx.names[i.x], i.t, ctx.names[i.y])
  const o = tidyOptions(rng, render(key), take.map(render))
  const reason = `Only "${render(key)}" holds in every consistent family structure.\n${[key, ...take]
    .map((i, ix) => `${render(i)}: ${ix === 0 ? 'true in all structures' : statOf(i.x, i.t, i.y) === 'some' ? 'true in some structures only, so not definite' : 'false in every structure'}.`)
    .join('\n')}`
  return { stem: 'Which of the following statements is definitely true?', ...o, reason }
}

function codedExpr(ctx: Ctx, hops: { x: number; t: string; y: number }[]): string {
  return hops.reduce((s, h, i) => (i === 0 ? `${ctx.names[h.x]} ${ctx.ops[h.t]} ${ctx.names[h.y]}` : `${s} ${ctx.ops[h.t]} ${ctx.names[h.y]}`), '')
}
function qDefiniteCoded(rng: Rng, ctx: Ctx): QOut | null {
  const n = ctx.sk.n
  const prims = PRIM.filter((t) => ctx.ops[t])
  type Hops = { x: number; t: string; y: number }[]
  const holdsAll = (kin: Kin, slot: Int8Array, hops: Hops) => hops.every((h) => holdsTerm(kin, h.t, slot[h.x], slot[h.y]))
  const clueSet = new Set(ctx.clues.filter((c) => c.kind === 'rel').map((c) => `${c.x}|${(c as { term: string }).term}|${c.y}`))
  const D: Hops[] = []
  const S: Hops[] = []
  const N0: Hops[] = []
  let guard = 0
  while (guard++ < 90 && (D.length < 2 || S.length < 2 || N0.length < 3)) {
    const len = rng.chance(0.6) ? 2 : 1
    const a = rng.int(0, n - 1)
    const b = rng.int(0, n - 1)
    const c = rng.int(0, n - 1)
    if (a === b || (len === 2 && (c === a || c === b))) continue
    const hops: Hops = len === 1 ? [{ x: a, t: rng.pick(prims), y: b }] : [{ x: a, t: rng.pick(prims), y: b }, { x: b, t: rng.pick(prims), y: c }]
    if (hops.every((h) => clueSet.has(`${h.x}|${h.t}|${h.y}`))) continue
    const st = statusOf(ctx, (kin, slot) => holdsAll(kin, slot, hops))
    if (st === 'all') D.push(hops)
    else if (st === 'some') S.push(hops)
    else N0.push(hops)
  }
  if (!D.length || S.length + N0.length < 4) return null
  const key = rng.pick(D)
  const take: Hops[] = []
  const keyText = codedExpr(ctx, key)
  for (const it of [...rng.shuffle(S).slice(0, 2), ...rng.shuffle(N0), ...rng.shuffle(S).slice(2)]) {
    if (take.length >= 4) break
    const tx = codedExpr(ctx, it)
    if (tx === keyText || take.some((t) => codedExpr(ctx, t) === tx)) continue
    take.push(it)
  }
  if (take.length < 4) return null
  const o = tidyOptions(rng, keyText, take.map((t) => codedExpr(ctx, t)))
  const decode = (h: Hops) => h.map((x) => relSentence(ctx.names[x.x], x.t, ctx.names[x.y])).join(' and ')
  const reason = `Decoded, the true expression is: ${decode(key)}; it holds in every consistent family structure.\n${take.map((t) => `${codedExpr(ctx, t)} means ${decode(t)}: ${statusOf(ctx, (kin, slot) => holdsAll(kin, slot, t)) === 'some' ? 'holds only in some structures, so not definite' : 'false in every structure'}.`).join('\n')}`
  return { stem: 'Which of the following expressions is definitely true?', ...o, reason }
}

function qWho(rng: Rng, ctx: Ctx): QOut | null {
  const n = ctx.sk.n
  const clueSet = new Set(ctx.clues.filter((c) => c.kind === 'rel').map((c) => `${c.x}|${(c as { term: string }).term}|${c.y}`))
  for (let tr = 0; tr < 12; tr++) {
    const t = rng.pick(AV)
    const y = rng.int(0, n - 1)
    const D: number[] = []
    const rest: { x: number; st: Status }[] = []
    for (let x = 0; x < n; x++) {
      if (x === y) continue
      const st = statusOf(ctx, (kin, slot) => holdsTerm(kin, t, slot[x], slot[y]))
      if (st === 'all') {
        if (!clueSet.has(`${x}|${t}|${y}`)) D.push(x)
      } else rest.push({ x, st })
    }
    if (!D.length) continue
    const key = rng.pick(D)
    const some = rng.shuffle(rest.filter((r) => r.st === 'some'))
    const none = rng.shuffle(rest.filter((r) => r.st === 'none'))
    const wrong = [...some.slice(0, 2), ...none, ...some.slice(2)]
      .filter((r) => statusOf(ctx, (kin, slot) => holdsBroad(kin, t, slot[r.x], slot[y])) !== 'all')
      .slice(0, 4)
    if (wrong.length < 4) continue
    const o = tidyOptions(rng, ctx.names[key], wrong.map((w) => ctx.names[w.x]))
    const reason = `${ctx.names[key]}: ${roleText(ctx, key)}. ${ctx.names[y]}: ${roleText(ctx, y)}.\nIn every consistent family structure ${ctx.names[key]} is the ${t} of ${ctx.names[y]}; each other option fails in at least one structure.`
    return { stem: `Who among the following is the ${t} of ${ctx.names[y]}?`, ...o, reason }
  }
  return null
}

function qCount(rng: Rng, ctx: Ctx): QOut | null {
  const n = ctx.sk.n
  type Counter = { stem: string; items: (kin: Kin, slot: Int8Array) => number[]; what: string }
  const range = (kin: Kin) => Array.from({ length: kin.n }, (_, i) => i)
  const kinds: Counter[] = [
    { stem: 'How many male members are there in the family?', what: 'male members', items: (kin) => range(kin).filter((s) => kin.gen[s] === 1) },
    { stem: 'How many female members are there in the family?', what: 'female members', items: (kin) => range(kin).filter((s) => kin.gen[s] === 0) },
    { stem: 'How many mothers are there in the family?', what: 'mothers', items: (kin) => range(kin).filter((s) => range(kin).some((c) => kin.mo[c] === s)) },
    { stem: 'How many fathers are there in the family?', what: 'fathers', items: (kin) => range(kin).filter((s) => range(kin).some((c) => kin.fa[c] === s)) },
  ]
  const choice = rng.int(0, 5)
  let counter: Counter
  let yName = -1
  if (choice < 2) counter = kinds[rng.int(0, 3)]
  else {
    const t = rng.pick(COUNT_TERMS)
    const y = rng.int(0, n - 1)
    yName = y
    counter = {
      stem: `How many ${PLURAL[t]} does ${ctx.names[y]} have in the family?`,
      what: PLURAL[t],
      items: (kin, slot) => {
        const out: number[] = []
        for (let z = 0; z < n; z++) if (z !== y && holdsTerm(kin, t, slot[z], slot[y])) out.push(slot[z])
        return out
      },
    }
  }
  const vals = new Set<number>()
  for (const m of ctx.models) vals.add(counter.items(ctx.kins.get(m.pat) as Kin, m.slot).length)
  if (vals.size === 1) {
    const v = [...vals][0]
    const cand: number[] = []
    for (let d = -3; d <= 4; d++) if (d !== 0 && v + d >= 0) cand.push(v + d)
    if (cand.length < 4) return null
    const withCbd = rng.chance(0.3)
    const pickN = rng.sample(cand, withCbd ? 3 : 4).map(String)
    const wrong = withCbd ? [...pickN, CBD] : pickN
    const o = tidyOptions(rng, String(v), wrong)
    const inv = new Map<number, number>()
    ctx.slot0.forEach((sl, nme) => inv.set(sl, nme))
    const listed = counter.items(ctx.kin0, Int8Array.from(ctx.slot0)).map((sl) => ctx.names[inv.get(sl) as number])
    const extra = yName >= 0 ? `${ctx.names[yName]}: ${roleText(ctx, yName)}.\n` : ''
    return {
      stem: counter.stem,
      ...o,
      reason: `${extra}Counting the ${counter.what} in the family tree: ${listed.length ? joinAnd(listed) : 'nobody'} (${v}). The same count comes out in every consistent family structure.`,
    }
  }
  if (yName >= 0 || vals.size > 3 || !rng.chance(0.4)) return null
  const vs = [...vals]
  const pool: number[] = []
  for (let d = -2; d <= 3; d++) {
    const c = vs[0] + d
    if (c >= 0 && !vs.includes(c)) pool.push(c)
  }
  const near = [...vs, ...rng.shuffle(pool)].slice(0, 4).map(String)
  if (near.length < 4) return null
  const o = tidyOptions(rng, CBD, near)
  return { stem: counter.stem, ...o, reason: `The statements leave the genders of some members open, and the count comes out as ${joinAnd(vs.map(String))} in different consistent family structures, so it cannot be determined.` }
}

function structureText(sk: Skel, names: string[]): string[] {
  const nTxt = `${sk.n} persons - ${names.slice().sort().join(', ')} - form one family spread over three generations.`
  const kids = `The first generation is a single married couple (a husband and a wife) with ${NUMWORD[sk.k]} children. ${
    sk.m === sk.k ? 'All of the children are married' : sk.m === 1 ? 'Only one of the children is married' : `${cap(NUMWORD[sk.m])} of the children are married`
  }, each to a member of this family who has no parents in the family (every marriage is between a man and a woman). Every other person in the family is a child or grandchild of the first-generation couple.`
  const gr =
    sk.m === 1
      ? `The married child has ${NUMWORD[sk.g[0]]} child${sk.g[0] === 1 ? '' : 'ren'}; no one else has any children.`
      : `One of the two married couples has ${NUMWORD[Math.max(...sk.g)]} child${Math.max(...sk.g) === 1 ? '' : 'ren'} and the other has ${sk.g.includes(0) ? 'no children' : `${NUMWORD[Math.min(...sk.g)]} child${Math.min(...sk.g) === 1 ? '' : 'ren'}`}; no one else has any children.`
  return [nTxt, kids, gr, 'All relations are by birth or marriage only. A person\'s gender is revealed only through the statements given below.']
}

function bloodAttempt(rng: Rng, q: number): { group: Group; proof: BloodProofA } {
  const sk = randSkel(rng)
  const n = sk.n
  const pat0 = rng.int(0, (1 << sk.bits) - 1)
  const kin0 = buildKin(sk, pat0)
  const slot0 = rng.shuffle(Array.from({ length: n }, (_, i) => i))
  const names = rng.sample(LETTER_POOL, n)
  let coded = rng.chance(0.4)
  const order = rng.shuffle(Array.from({ length: n }, (_, i) => i))
  const trueTerms = (x: number, y: number): string[] => VOCAB.filter((t) => holdsTerm(kin0, t, slot0[x], slot0[y]))
  const clues: Clue[] = []
  for (let i = 1; i < n; i++) {
    const nw = order[i]
    let done = false
    for (const p of rng.shuffle(order.slice(0, i))) {
      const dirs: [number, number][] = rng.chance(0.5) ? [[nw, p], [p, nw]] : [[p, nw], [nw, p]]
      for (const [x, y] of dirs) {
        const tt = trueTerms(x, y)
        if (!tt.length) continue
        clues.push({ kind: 'rel', term: pickTerm(rng, tt, coded), x, y })
        done = true
        break
      }
      if (done) break
    }
    need(done, 'no clue for person')
  }
  // "only" clues
  const onlyCands: Clue[] = []
  for (let x = 0; x < n; x++)
    for (let y = 0; y < n; y++) {
      if (x === y) continue
      for (const via of ONLY_VIA) for (const sex of ['son', 'daughter', 'child'] as const) if (onlyHolds(kin0, slot0[x], slot0[y], via, sex)) onlyCands.push({ kind: 'only', sex, x, y, via })
    }
  const nOnly = Math.min(onlyCands.length, rng.chance(0.85) ? rng.int(1, 2) : 0)
  for (const c of rng.sample(onlyCands, nOnly)) clues.push(c)
  need(clues.filter((c) => c.kind === 'only' || !PRIM.includes(c.term)).length >= 3, 'too easy')
  if (coded) {
    const prims = new Set(clues.filter((c) => c.kind === 'rel' && PRIM.includes(c.term)).map((c) => (c as { term: string }).term))
    if (prims.size > 5 || clues.filter((c) => c.kind === 'rel' && PRIM.includes(c.term)).length < 3) coded = false
  }
  let res = searchModels(sk, clues, order, 1200)
  for (let extra = 0; res.overflow && extra < 7; extra++) {
    const x = rng.int(0, n - 1)
    let y = rng.int(0, n - 1)
    if (x === y) y = (y + 1) % n
    const tt = trueTerms(x, y).filter((t) => !coded || !PRIM.includes(t) || clues.some((c) => c.kind === 'rel' && c.term === t))
    if (!tt.length) continue
    clues.push({ kind: 'rel', term: pickTerm(rng, tt, false), x, y })
    res = searchModels(sk, clues, order, 1200)
  }
  need(!res.overflow && res.models.length >= 1, 'model space')
  if (coded) {
    const prims = new Set(clues.filter((c) => c.kind === 'rel' && PRIM.includes(c.term)).map((c) => (c as { term: string }).term))
    if (prims.size > 5) coded = false
  }
  // operators for the coded legend
  const ops: Record<string, string> = {}
  let legendLines: string[] = []
  if (coded) {
    const usedPrims = [...new Set(clues.filter((c) => c.kind === 'rel' && PRIM.includes(c.term)).map((c) => (c as { term: string }).term))]
    const rest = rng.shuffle(PRIM.filter((t) => !usedPrims.includes(t)))
    const legendTerms = [...usedPrims, ...rest].slice(0, 5)
    const syms = rng.sample(['+', '−', '×', '÷', '%', '$', '#', '@'], 5)
    legendTerms.forEach((t, i) => {
      ops[t] = syms[i]
    })
    legendLines = legendTerms.map((t) => `'P ${ops[t]} Q' means 'P is the ${t} of Q'`)
  }
  const ctx: Ctx = { sk, names, models: res.models, kins: res.kins, clues, kin0, slot0, coded, ops }

  // build the clue block (coded primitives are merged into chains such as "P + Q × R")
  const clueLines: string[] = []
  const usedIdx = new Set<number>()
  clues.forEach((c, i) => {
    if (usedIdx.has(i)) return
    if (coded && c.kind === 'rel' && ops[c.term]) {
      const chain = [c]
      usedIdx.add(i)
      for (;;) {
        const last = chain[chain.length - 1]
        const nextI = clues.findIndex((d, j) => !usedIdx.has(j) && d.kind === 'rel' && ops[d.term] && d.x === last.y && !chain.some((e) => e.x === d.y || e.y === d.y))
        if (nextI < 0 || chain.length >= 3) break
        usedIdx.add(nextI)
        chain.push(clues[nextI] as Clue & { kind: 'rel' })
      }
      clueLines.push(`${chain.reduce((s, e, k) => (k === 0 ? `${names[e.x]} ${ops[(e as { term: string }).term]} ${names[e.y]}` : `${s} ${ops[(e as { term: string }).term]} ${names[e.y]}`), '')}.`)
    } else {
      usedIdx.add(i)
      clueLines.push(clueText(ctx, c))
    }
  })
  const shownClues = rng.shuffle(clueLines)
  const paragraphs = [...structureText(sk, names)]
  if (coded) paragraphs.push(`In a certain code language: ${legendLines.join('; ')}. A chain such as 'P + Q × R' means that both 'P + Q' and 'Q × R' are true.`)
  paragraphs.push(`Statements:\n${shownClues.map((c, i) => `${i + 1}. ${c}`).join('\n')}`)
  const stimulus: Stimulus = { directions: DIRECTIONS, parts: [{ kind: 'text', paragraphs }] }

  // questions
  const typeOrder = rng.shuffle(['rel', 'relrel', 'def', 'who', 'count'])
  const outs: QOut[] = []
  const tried = new Set<string>()
  const build = (type: string): QOut | null => {
    for (let a = 0; a < 3; a++) {
      let r: QOut | null = null
      if (type === 'rel') r = qRelation(rng, ctx, null)
      else if (type === 'relrel') r = qRelation(rng, ctx, rng.pick(FUNC_TERMS))
      else if (type === 'def') r = coded ? qDefiniteCoded(rng, ctx) : qDefinite(rng, ctx)
      else if (type === 'who') r = qWho(rng, ctx)
      else r = qCount(rng, ctx)
      if (r) return r
    }
    return null
  }
  for (const t of typeOrder) {
    if (outs.length >= q) break
    tried.add(t)
    const r = build(t)
    if (r) outs.push(r)
  }
  need(outs.length === q, 'not enough questions')
  const tree = ['Family tree (one valid reconstruction; the statements may leave some genders open):', ...treeLines(ctx)]
  const questions: QuestionDraft[] = outs.map((o) => ({
    topic: 'blood-relation',
    stem: o.stem,
    options: o.options,
    answer: o.answer,
    explanation: `${tree.join('\n')}\n${o.reason}\nAll ${ctx.models.length} consistent family structure${ctx.models.length === 1 ? '' : 's'} were checked.\nCorrect answer: (${OPT_LET[o.answer]}) ${o.options[o.answer]}`,
  }))
  return { group: { stimulus, questions }, proof: { k: sk.k, m: sk.m, g: sk.g, n: sk.n } }
}

export function generateBloodMainsWithProof(rng: Rng, _difficulty: MockDifficulty, count: number): { groups: Group[]; proofs: BloodProofA[] } {
  void _difficulty
  const groups: Group[] = []
  const proofs: BloodProofA[] = []
  for (const size of splitCount(count, 5)) {
    const r = retry('blood-relation', () => bloodAttempt(rng, size), 80)
    groups.push(r.group)
    proofs.push(r.proof)
  }
  return { groups, proofs }
}

export const MAINS_LOGIC_A: Partial<Record<ReasoningTopicId, TopicGenerator>> = {
  syllogism: generateSyllogismMains,
  inequality: generateInequalityMains,
  'blood-relation': (rng, d, count) => generateBloodMainsWithProof(rng, d, count).groups,
}
