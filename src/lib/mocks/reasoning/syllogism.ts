// Syllogism with exact Venn-model semantics.
// A model = set of NON-EMPTY regions of the k-term Venn diagram that satisfies every premise, with every term non-empty
// (existential import, the convention of the Indian bank exams: "All A are B" lets "Some A are B" follow).
// Definite conclusions follow iff true in EVERY model; "possibility" conclusions iff true in SOME model.
import type { Rng } from '../rng'
import type { Group, MockDifficulty, QuestionDraft } from '../types'
import { article, splitCount, type WithProof } from './common'

export type SylType = 'A' | 'E' | 'I' | 'O' | 'P'
export interface SylStmt {
  type: SylType
  x: number
  y: number
}

export interface SyllogismProof {
  terms: string[]
  premises: SylStmt[]
  conclusions: SylStmt[]
  /** 0 only I, 1 only II, 2 either, 3 neither, 4 both. */
  answer: number
}

export const SYL_OPTIONS = [
  'Only conclusion I follows',
  'Only conclusion II follows',
  'Either conclusion I or II follows',
  'Neither conclusion I nor II follows',
  'Both conclusions I and II follow',
]

const NOUNS: [string, string][] = [
  ['pen', 'pens'], ['book', 'books'], ['table', 'tables'], ['chair', 'chairs'], ['road', 'roads'], ['car', 'cars'], ['bus', 'buses'],
  ['train', 'trains'], ['flower', 'flowers'], ['tree', 'trees'], ['fruit', 'fruits'], ['bird', 'birds'], ['cat', 'cats'], ['dog', 'dogs'],
  ['house', 'houses'], ['river', 'rivers'], ['lake', 'lakes'], ['clock', 'clocks'], ['watch', 'watches'], ['mobile', 'mobiles'],
  ['laptop', 'laptops'], ['bag', 'bags'], ['key', 'keys'], ['coin', 'coins'], ['ring', 'rings'], ['chain', 'chains'], ['bell', 'bells'],
  ['drum', 'drums'], ['kite', 'kites'], ['stone', 'stones'], ['mountain', 'mountains'], ['hill', 'hills'], ['plate', 'plates'],
  ['cup', 'cups'], ['spoon', 'spoons'], ['lamp', 'lamps'], ['box', 'boxes'], ['wall', 'walls'], ['door', 'doors'], ['window', 'windows'],
]

export function stmtText(s: SylStmt, terms: string[]): string {
  const [sx, px] = nounOf(terms[s.x])
  const [sy, py] = nounOf(terms[s.y])
  switch (s.type) {
    case 'A':
      return `All ${px} are ${py}`
    case 'I':
      return `Some ${px} are ${py}`
    case 'E':
      return `No ${sx} is ${article(sy)} ${sy}`
    case 'O':
      return `Some ${px} are not ${py}`
    case 'P':
      return `Some ${px} can be ${py}`
  }
}

function nounOf(sg: string): [string, string] {
  const f = NOUNS.find((n) => n[0] === sg)
  return f ?? [sg, `${sg}s`]
}

/** bit mask over regions (region r in 1..2^k-1; bit r-1) for the statement's truth condition */
function regionMask(k: number, pred: (r: number) => boolean): number {
  let m = 0
  for (let r = 1; r < 1 << k; r++) if (pred(r)) m |= 1 << (r - 1)
  return m
}
const has = (r: number, t: number) => (r >> t) & 1

/** [mask, kind]: 'none' => model & mask must be 0; 'some' => model & mask must be non-zero. */
function condOf(k: number, s: SylStmt): { mask: number; none: boolean } {
  const { x, y } = s
  switch (s.type) {
    case 'A':
      return { mask: regionMask(k, (r) => !!has(r, x) && !has(r, y)), none: true }
    case 'E':
      return { mask: regionMask(k, (r) => !!has(r, x) && !!has(r, y)), none: true }
    case 'I':
    case 'P':
      return { mask: regionMask(k, (r) => !!has(r, x) && !!has(r, y)), none: false }
    case 'O':
      return { mask: regionMask(k, (r) => !!has(r, x) && !has(r, y)), none: false }
  }
}

export function validModels(k: number, premises: SylStmt[]): number[] {
  const R = (1 << k) - 1
  const conds = premises.map((p) => condOf(k, p))
  const termMasks = Array.from({ length: k }, (_, t) => regionMask(k, (r) => !!has(r, t)))
  const out: number[] = []
  for (let m = 1; m < 1 << R; m++) {
    let ok = true
    for (let t = 0; t < k && ok; t++) if ((m & termMasks[t]) === 0) ok = false
    for (let i = 0; i < conds.length && ok; i++) {
      const hit = (m & conds[i].mask) !== 0
      if (conds[i].none ? hit : !hit) ok = false
    }
    if (ok) out.push(m)
  }
  return out
}

function holds(k: number, s: SylStmt, m: number): boolean {
  const c = condOf(k, s)
  const hit = (m & c.mask) !== 0
  return c.none ? !hit : hit
}

/** 'follows' status of a conclusion for the given model list. */
export function follows(k: number, s: SylStmt, models: number[]): boolean {
  if (s.type === 'P') return models.some((m) => holds(k, s, m))
  return models.every((m) => holds(k, s, m))
}

export function outcomeOf(k: number, concl: SylStmt[], models: number[]): number {
  const f1 = follows(k, concl[0], models)
  const f2 = follows(k, concl[1], models)
  if (f1 && f2) return 4
  if (f1) return 0
  if (f2) return 1
  if (isComplementary(concl[0], concl[1])) return 2
  return 3
}

/** Contradictory pair about the same two terms in the same order: (Some, No) or (All, Some-not). */
export function isComplementary(a: SylStmt, b: SylStmt): boolean {
  if (a.x !== b.x || a.y !== b.y) return false
  const t = [a.type, b.type].sort().join('')
  return t === 'EI' || t === 'AO'
}

function randType(rng: Rng, hard: boolean): SylType {
  return rng.pick<SylType>(hard ? ['A', 'A', 'I', 'I', 'E', 'E', 'O'] : ['A', 'I', 'E', 'O'])
}

function describeRegion(k: number, r: number, terms: string[]): string {
  const ins = terms.filter((_, t) => has(r, t))
  const outs = terms.filter((_, t) => !has(r, t) && t < k)
  if (ins.length === 1) return `${ins[0]} only`
  return `${ins.join(' & ')}${outs.length ? ` but not ${outs.join('/')}` : ''}`
}

function counterModel(k: number, s: SylStmt, models: number[], terms: string[]): string {
  const bad = models.filter((m) => !holds(k, s, m))
  if (!bad.length) return ''
  let best = bad[0]
  let bc = 99
  for (const m of bad) {
    let c = 0
    for (let i = 0; i < 15; i++) if (m & (1 << i)) c++
    if (c < bc) {
      bc = c
      best = m
    }
  }
  const regs: string[] = []
  for (let r = 1; r < 1 << k; r++) if (best & (1 << (r - 1))) regs.push(describeRegion(k, r, terms))
  return regs.join('; ')
}

function sylExplanation(terms: string[], k: number, prem: SylStmt[], concl: SylStmt[], models: number[], answer: number): string {
  const lines: string[] = []
  lines.push(`Statements: ${prem.map((p) => stmtText(p, terms)).join('. ')}.`)
  concl.forEach((c, i) => {
    const f = follows(k, c, models)
    const label = i === 0 ? 'I' : 'II'
    if (c.type === 'P') {
      if (f) lines.push(`${label}. "${stmtText(c, terms)}" - possible: there is a valid Venn diagram of the statements in which the two circles overlap, so it follows.`)
      else lines.push(`${label}. "${stmtText(c, terms)}" - not possible: in every valid diagram of the statements the two circles stay apart, so it does not follow.`)
    } else if (f) lines.push(`${label}. "${stmtText(c, terms)}" - true in every valid Venn diagram of the statements, so it follows.`)
    else lines.push(`${label}. "${stmtText(c, terms)}" - does not follow: it fails in a valid diagram whose non-empty parts are: ${counterModel(k, c, models, terms)}.`)
  })
  if (answer === 2) lines.push('Conclusions I and II are a complementary (contradictory) pair about the same terms, so exactly one of them is always true: either I or II follows.')
  lines.push(`Answer: ${SYL_OPTIONS[answer]}.`)
  return lines.join(' ')
}

function buildOne(rng: Rng, difficulty: MockDifficulty, want: number): SyllogismProof | null {
  const hard = difficulty === 'hard'
  const k = hard ? (rng.chance(0.6) ? 4 : 3) : 3
  const nStmt = hard ? (k === 4 ? 3 : rng.pick([2, 3])) : 2
  const nounPick = rng.sample(NOUNS, k).map((n) => n[0])
  // premises form a tree/chain over the terms so that a middle term links them
  const premises: SylStmt[] = []
  const order = rng.shuffle(Array.from({ length: k }, (_, i) => i))
  if (nStmt === 2 && k === 3) {
    premises.push({ type: randType(rng, hard), x: order[0], y: order[1] }, { type: randType(rng, hard), x: order[1], y: order[2] })
  } else if (k === 4) {
    const shape = rng.int(0, 1)
    if (shape === 0) premises.push({ type: randType(rng, hard), x: order[0], y: order[1] }, { type: randType(rng, hard), x: order[1], y: order[2] }, { type: randType(rng, hard), x: order[2], y: order[3] })
    else premises.push({ type: randType(rng, hard), x: order[0], y: order[1] }, { type: randType(rng, hard), x: order[1], y: order[2] }, { type: randType(rng, hard), x: order[1], y: order[3] })
  } else {
    premises.push({ type: randType(rng, hard), x: order[0], y: order[1] }, { type: randType(rng, hard), x: order[1], y: order[2] }, { type: randType(rng, hard), x: order[0], y: order[2] })
  }
  // random orientation for each premise
  for (const p of premises) if (rng.chance(0.5)) [p.x, p.y] = [p.y, p.x]
  // a statement pair about the same terms must not repeat
  const models = validModels(k, premises)
  if (!models.length) return null
  const text = (st: SylStmt) => stmtText(st, nounPick)
  const premTexts = new Set(premises.map(text))
  const defTypes: SylType[] = ['A', 'I', 'E', 'O']
  const types: SylType[] = hard ? [...defTypes, 'P'] : defTypes
  const fo: SylStmt[] = []
  const nf: SylStmt[] = []
  for (let x = 0; x < k; x++) {
    for (let y = 0; y < k; y++) {
      if (x === y) continue
      for (const type of types) {
        const st: SylStmt = { type, x, y }
        if (premTexts.has(text(st))) continue
        ;(follows(k, st, models) ? fo : nf).push(st)
      }
    }
  }
  const pick = (list: SylStmt[]): SylStmt | null => {
    if (!list.length) return null
    if (hard) {
      const ps = list.filter((c) => c.type === 'P')
      const os = list.filter((c) => c.type !== 'P')
      if (ps.length && (!os.length || rng.chance(0.3))) return rng.pick(ps)
      return rng.pick(os)
    }
    return rng.pick(list)
  }
  let concl: SylStmt[] | null = null
  if (want === 2) {
    const opts: SylStmt[][] = []
    for (let x = 0; x < k; x++) {
      for (let y = 0; y < k; y++) {
        if (x === y) continue
        for (const [t1, t2] of [['I', 'E'], ['A', 'O']] as [SylType, SylType][]) {
          const c1: SylStmt = { type: t1, x, y }
          const c2: SylStmt = { type: t2, x, y }
          if (follows(k, c1, models) || follows(k, c2, models)) continue
          if (premTexts.has(text(c1)) || premTexts.has(text(c2))) continue
          opts.push(rng.chance(0.5) ? [c1, c2] : [c2, c1])
        }
      }
    }
    if (opts.length) concl = rng.pick(opts)
  } else {
    const c1 = pick(want === 0 || want === 4 ? fo : nf)
    const c2 = pick(want === 1 || want === 4 ? fo : nf)
    if (c1 && c2) concl = [c1, c2]
  }
  if (!concl) return null
  if (text(concl[0]) === text(concl[1])) return null
  const ans = outcomeOf(k, concl, models)
  if (ans !== want) return null
  // two conclusions that together exhaust every model but are not contradictories (e.g. Some / Some-not) are debatable in the exam convention: avoid
  if (ans === 3 && models.every((m) => holds(k, concl[0] as SylStmt, m) || holds(k, concl[1] as SylStmt, m))) return null
  return { terms: nounPick, premises, conclusions: concl, answer: ans }
}

export function generateSyllogismWithProof(rng: Rng, difficulty: MockDifficulty, count: number): WithProof<SyllogismProof> {
  const groups: Group[] = []
  const proofs: SyllogismProof[] = []
  const weights = [22, 22, 14, 22, 20] // desired outcome
  for (const k of splitCount(count, 1)) {
    void k
    let proof: SyllogismProof | null = null
    let want = 0
    for (let attempt = 0; attempt < 4000 && !proof; attempt++) {
      if (attempt % 25 === 0) {
        let r = rng.next() * weights.reduce((a, b) => a + b, 0)
        for (let i = 0; i < weights.length; i++) {
          r -= weights[i]
          if (r < 0) {
            want = i
            break
          }
        }
      }
      proof = buildOne(rng, difficulty, want)
    }
    if (!proof) throw new Error('syllogism: generation failed')
    const kk = proof.terms.length
    const models = validModels(kk, proof.premises)
    const stem = `Statements:\n${proof.premises.map((p) => `${stmtText(p, proof.terms)}.`).join('\n')}\nConclusions:\nI. ${stmtText(proof.conclusions[0], proof.terms)}.\nII. ${stmtText(proof.conclusions[1], proof.terms)}.`
    const q: QuestionDraft = {
      topic: 'syllogism',
      stem,
      options: SYL_OPTIONS.slice(),
      answer: proof.answer,
      explanation: sylExplanation(proof.terms, kk, proof.premises, proof.conclusions, models, proof.answer),
    }
    groups.push({ questions: [q] })
    proofs.push(proof)
  }
  return { groups, proofs }
}
