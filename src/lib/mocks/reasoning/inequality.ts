// Inequality (direct and coded). Entailment by exact relation-closure (Floyd-Warshall over <= / <).
import type { Rng } from '../rng'
import type { Group, MockDifficulty, QuestionDraft } from '../types'
import { splitCount, type WithProof } from './common'
import { SYL_OPTIONS } from './syllogism'

export type Rel = '>' | '<' | '≥' | '≤' | '='
const RELS: Rel[] = ['>', '<', '≥', '≤', '=']

export interface Chain {
  /** indices into letters */
  seq: number[]
  rels: Rel[]
}
export interface Concl {
  a: number
  rel: Rel
  b: number
}
export interface InequalityProof {
  letters: string[]
  statements: Chain[]
  conclusions: Concl[]
  /** symbol used for each relation when coded, else null. */
  code: Record<Rel, string> | null
  /** the meaning phrase chosen for each relation (coded only), "A"/"B" placeholders. */
  meaning: Record<Rel, string> | null
  answer: number
}

const MEANINGS: Record<Rel, string[]> = {
  '>': ['{A} is greater than {B}', '{A} is neither smaller than nor equal to {B}'],
  '<': ['{A} is smaller than {B}', '{A} is neither greater than nor equal to {B}'],
  '≥': ['{A} is either greater than or equal to {B}', '{A} is not smaller than {B}'],
  '≤': ['{A} is either smaller than or equal to {B}', '{A} is not greater than {B}'],
  '=': ['{A} is equal to {B}'],
}
const SYMBOLS = ['@', '©', '%', '$', '#', '*', '&']

export const flip = (r: Rel): Rel => (r === '>' ? '<' : r === '<' ? '>' : r === '≥' ? '≤' : r === '≤' ? '≥' : '=')

/** closure matrix: m[i][j] = 0 none, 1: i <= j, 2: i < j */
export function closure(k: number, chains: Chain[]): number[][] {
  const m = Array.from({ length: k }, () => new Array<number>(k).fill(0))
  const add = (i: number, j: number, v: number) => {
    if (m[i][j] < v) m[i][j] = v
  }
  for (const c of chains) {
    for (let t = 0; t < c.rels.length; t++) {
      const a = c.seq[t]
      const b = c.seq[t + 1]
      switch (c.rels[t]) {
        case '>':
          add(b, a, 2)
          break
        case '≥':
          add(b, a, 1)
          break
        case '<':
          add(a, b, 2)
          break
        case '≤':
          add(a, b, 1)
          break
        case '=':
          add(a, b, 1)
          add(b, a, 1)
          break
      }
    }
  }
  for (let q = 0; q < k; q++)
    for (let i = 0; i < k; i++)
      for (let j = 0; j < k; j++) {
        if (m[i][q] && m[q][j]) add(i, j, Math.max(m[i][q], m[q][j]))
      }
  return m
}

export function entails(m: number[][], c: Concl): boolean {
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

export function consistent(m: number[][]): boolean {
  for (let i = 0; i < m.length; i++) if (m[i][i] === 2) return false
  // x <= y and y <= x forces equality; a strict edge between them is a contradiction (caught as m[i][i]===2 after closure)
  return true
}

export function relHolds(rel: Rel, x: number, y: number): boolean {
  switch (rel) {
    case '>':
      return x > y
    case '<':
      return x < y
    case '≥':
      return x >= y
    case '≤':
      return x <= y
    case '=':
      return x === y
  }
}

/** Finds an integer assignment (values 0..k-1) satisfying the statements but violating `c`; null if none. */
function counterAssignment(k: number, chains: Chain[], c: Concl): number[] | null {
  const vals = new Array<number>(k).fill(0)
  const total = k ** k
  for (let code = 0; code < total; code++) {
    let t = code
    for (let i = 0; i < k; i++) {
      vals[i] = t % k
      t = (t / k) | 0
    }
    if (!chains.every((ch) => ch.rels.every((r, i) => relHolds(r, vals[ch.seq[i]], vals[ch.seq[i + 1]])))) continue
    if (!relHolds(c.rel, vals[c.a], vals[c.b])) return vals.slice()
  }
  return null
}

/** which of {<, =, >} (for the ordered pair (a, b)) a conclusion allows */
function allowed(c: Concl, a: number): number[] {
  const rel = c.a === a ? c.rel : flip(c.rel)
  switch (rel) {
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

/** true when the conclusions are about the same two letters, together cover every case, but overlap (not contradictories). */
function debatableCover(c1: Concl, c2: Concl): boolean {
  const samePair = (c1.a === c2.a && c1.b === c2.b) || (c1.a === c2.b && c1.b === c2.a)
  if (!samePair) return false
  const s1 = allowed(c1, c1.a)
  const s2 = allowed(c2, c1.a)
  const union = new Set([...s1, ...s2])
  const overlap = s1.some((x) => s2.includes(x))
  return union.size === 3 && overlap
}

function outcome(m: number[][], concl: Concl[]): number {
  const f1 = entails(m, concl[0])
  const f2 = entails(m, concl[1])
  if (f1 && f2) return 4
  if (f1) return 0
  if (f2) return 1
  if (isComplement(concl[0], concl[1])) return 2
  return 3
}

/** (x >= y, x < y) and (x > y, x <= y) in any orientation. */
export function isComplement(p: Concl, q: Concl): boolean {
  let q2: Concl
  if (q.a === p.a && q.b === p.b) q2 = q
  else if (q.a === p.b && q.b === p.a) q2 = { a: p.a, rel: flip(q.rel), b: p.b }
  else return false
  const r1 = p.rel
  const r2 = q2.rel
  return (r1 === '>' && r2 === '≤') || (r1 === '≥' && r2 === '<') || (r1 === '≤' && r2 === '>') || (r1 === '<' && r2 === '≥')
}

function chainText(c: Chain, letters: string[], sym: (r: Rel) => string): string {
  let s = letters[c.seq[0]]
  for (let i = 0; i < c.rels.length; i++) s += ` ${sym(c.rels[i])} ${letters[c.seq[i + 1]]}`
  return s
}

function pickLetters(rng: Rng, n: number): string[] {
  const pool = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split('')
  return rng.sample(pool, n)
}

function buildStatements(rng: Rng, hard: boolean, k: number): { chains: Chain[]; vals: number[] } | null {
  const vals = Array.from({ length: k }, () => rng.int(0, k - 1))
  const relFor = (x: number, y: number): Rel => {
    if (x > y) return rng.chance(0.65) ? '>' : '≥'
    if (x < y) return rng.chance(0.65) ? '<' : '≤'
    return rng.chance(0.7) ? '=' : rng.pick<Rel>(['≥', '≤'])
  }
  const mkChain = (seq: number[]): Chain => ({ seq, rels: seq.slice(0, -1).map((s, i) => relFor(vals[s], vals[seq[i + 1]])) })
  const order = rng.shuffle(Array.from({ length: k }, (_, i) => i))
  const chains: Chain[] = []
  if (!hard) {
    if (rng.chance(0.5)) chains.push(mkChain(order.slice(0, Math.min(k, 4))))
    else {
      chains.push(mkChain(order.slice(0, 2)), mkChain(order.slice(1, 4)))
    }
  } else {
    // two chains sharing one or two letters
    const cut = rng.int(2, 3)
    chains.push(mkChain(order.slice(0, cut + 1)))
    const rest = order.slice(rng.int(1, cut), k)
    if (rest.length >= 2) chains.push(mkChain(rng.chance(0.5) ? rest : rest.slice().reverse()))
  }
  return { chains, vals }
}

function buildOne(rng: Rng, difficulty: MockDifficulty, want: number, coded: boolean): InequalityProof | null {
  const hard = difficulty === 'hard'
  const k = hard ? rng.int(5, 6) : rng.int(4, 5)
  const letters = pickLetters(rng, k)
  const st = buildStatements(rng, hard, k)
  if (!st) return null
  const m = closure(k, st.chains)
  if (!consistent(m)) return null
  // candidate conclusions
  const written = new Set<string>()
  for (const c of st.chains)
    for (let t = 0; t < c.rels.length; t++) {
      written.add(`${c.seq[t]}${c.rels[t]}${c.seq[t + 1]}`)
      written.add(`${c.seq[t + 1]}${flip(c.rels[t])}${c.seq[t]}`)
    }
  const used = new Set<number>(st.chains.flatMap((c) => c.seq))
  const fo: Concl[] = []
  const nf: Concl[] = []
  for (const a of used)
    for (const b of used) {
      if (a === b) continue
      for (const rel of RELS) {
        if (rel === '=' && a > b) continue
        if (written.has(`${a}${rel}${b}`)) continue
        const c: Concl = { a, rel, b }
        ;(entails(m, c) ? fo : nf).push(c)
      }
    }
  let concl: Concl[] | null = null
  if (want === 2) {
    const opts: Concl[][] = []
    for (const a of used)
      for (const b of used) {
        if (a === b) continue
        for (const [r1, r2] of [['≥', '<'], ['>', '≤']] as [Rel, Rel][]) {
          const c1: Concl = { a, rel: r1, b }
          const c2: Concl = rng.chance(0.5) ? { a, rel: r2, b } : { a: b, rel: flip(r2), b: a }
          if (entails(m, c1) || entails(m, c2)) continue
          if (written.has(`${c1.a}${c1.rel}${c1.b}`) || written.has(`${c2.a}${c2.rel}${c2.b}`)) continue
          opts.push(rng.chance(0.5) ? [c1, c2] : [c2, c1])
        }
      }
    if (opts.length) concl = rng.pick(opts)
  } else {
    const pickC = (list: Concl[]) => (list.length ? rng.pick(list) : null)
    const c1 = pickC(want === 0 || want === 4 ? fo : nf)
    const c2 = pickC(want === 1 || want === 4 ? fo : nf)
    if (c1 && c2) concl = [c1, c2]
  }
  if (!concl) return null
  if (concl[0].a === concl[1].a && concl[0].b === concl[1].b && concl[0].rel === concl[1].rel) return null
  if (outcome(m, concl) !== want) return null
  if (want === 3 && debatableCover(concl[0], concl[1])) return null
  let code: Record<Rel, string> | null = null
  let meaning: Record<Rel, string> | null = null
  if (coded) {
    const syms = rng.sample(SYMBOLS, 5)
    code = { '>': syms[0], '<': syms[1], '≥': syms[2], '≤': syms[3], '=': syms[4] }
    meaning = { '>': rng.pick(MEANINGS['>']), '<': rng.pick(MEANINGS['<']), '≥': rng.pick(MEANINGS['≥']), '≤': rng.pick(MEANINGS['≤']), '=': MEANINGS['='][0] }
  }
  return { letters, statements: st.chains, conclusions: concl, code, meaning, answer: want }
}

export function legendText(p: InequalityProof): string {
  if (!p.code || !p.meaning) return ''
  const order: Rel[] = ['>', '<', '≥', '≤', '=']
  const sy = order.map((r) => (p.code as Record<Rel, string>)[r])
  const head = `In the following questions, the symbols ${sy.slice(0, -1).join(', ')} and ${sy[sy.length - 1]} are used with the following meaning as illustrated below:`
  const lines = [...order].sort((x, y) => (p.code as Record<Rel, string>)[x].localeCompare((p.code as Record<Rel, string>)[y])).map((r) => `'A ${(p.code as Record<Rel, string>)[r]} B' means '${(p.meaning as Record<Rel, string>)[r].replace('{A}', 'A').replace('{B}', 'B')}'.`)
  return `${head}\n${lines.join('\n')}`
}

function pathText(m: number[][], chains: Chain[], letters: string[], from: number, to: number, strict: boolean): string {
  // BFS over base edges (ascending direction) from `from` to `to`; strict => need a strict edge on the path
  type St = { node: number; s: boolean; prev: number; rel: Rel | null }
  const edges: { a: number; b: number; strict: boolean }[] = []
  for (const c of chains)
    for (let t = 0; t < c.rels.length; t++) {
      const a = c.seq[t]
      const b = c.seq[t + 1]
      const r = c.rels[t]
      if (r === '>') edges.push({ a: b, b: a, strict: true })
      else if (r === '≥') edges.push({ a: b, b: a, strict: false })
      else if (r === '<') edges.push({ a, b, strict: true })
      else if (r === '≤') edges.push({ a, b, strict: false })
      else {
        edges.push({ a, b, strict: false })
        edges.push({ a: b, b: a, strict: false })
      }
    }
  const states: St[] = [{ node: from, s: false, prev: -1, rel: null }]
  const seen = new Set<string>([`${from}0`])
  for (let qi = 0; qi < states.length; qi++) {
    const cur = states[qi]
    if (cur.node === to && (!strict || cur.s)) {
      const seq: string[] = []
      let i = qi
      const parts: { node: number; rel: Rel | null }[] = []
      while (i >= 0) {
        parts.unshift({ node: states[i].node, rel: states[i].rel })
        i = states[i].prev
      }
      parts.forEach((p, idx) => {
        if (idx > 0) seq.push(p.rel === '<' ? '<' : '≤')
        seq.push(letters[p.node])
      })
      return seq.join(' ')
    }
    for (const e of edges) {
      if (e.a !== cur.node) continue
      const ns = cur.s || e.strict
      const key = `${e.b}${ns ? 1 : 0}`
      if (seen.has(key)) continue
      seen.add(key)
      states.push({ node: e.b, s: ns, prev: qi, rel: e.strict ? '<' : '≤' })
    }
  }
  void m
  return ''
}

function explain(p: InequalityProof): string {
  const k = p.letters.length
  const m = closure(k, p.statements)
  const lines: string[] = []
  lines.push(`Decoded statements: ${p.statements.map((c) => chainText(c, p.letters, (r) => r)).join('; ')}.`)
  p.conclusions.forEach((c, i) => {
    const label = i === 0 ? 'I' : 'II'
    const txt = `${p.letters[c.a]} ${c.rel} ${p.letters[c.b]}`
    if (entails(m, c)) {
      let reason = ''
      if (c.rel === '>' || c.rel === '≥') reason = pathText(m, p.statements, p.letters, c.b, c.a, c.rel === '>')
      else if (c.rel === '<' || c.rel === '≤') reason = pathText(m, p.statements, p.letters, c.a, c.b, c.rel === '<')
      else reason = `${p.letters[c.a]} ≤ ... ≤ ${p.letters[c.b]} and ${p.letters[c.b]} ≤ ... ≤ ${p.letters[c.a]}`
      lines.push(`${label}. ${txt}: true (${reason}).`)
    } else {
      const ca = counterAssignment(k, p.statements, c)
      const show = ca ? ` (e.g. ${p.letters.map((l, ix) => `${l}=${ca[ix]}`).join(', ')} satisfies the statements but not the conclusion)` : ''
      lines.push(`${label}. ${txt}: not necessarily true${show}.`)
    }
  })
  if (p.answer === 2) lines.push('The two conclusions are complementary (one of them is always true), so either I or II follows.')
  lines.push(`Answer: ${SYL_OPTIONS[p.answer]}.`)
  return lines.join(' ')
}

export function generateInequalityWithProof(rng: Rng, difficulty: MockDifficulty, count: number): WithProof<InequalityProof> {
  const groups: Group[] = []
  const proofs: InequalityProof[] = []
  const weights = [22, 22, 14, 22, 20]
  for (const _k of splitCount(count, 1)) {
    void _k
    const coded = difficulty === 'hard' ? rng.chance(0.55) : rng.chance(0.35)
    let proof: InequalityProof | null = null
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
      proof = buildOne(rng, difficulty, want, coded)
    }
    if (!proof) throw new Error('inequality: generation failed')
    const p = proof
    const sym = (r: Rel) => (p.code ? p.code[r] : r)
    const stm = `Statements: ${p.statements.map((c) => chainText(c, p.letters, sym)).join('; ')}`
    const cc = (c: Concl) => `${p.letters[c.a]} ${sym(c.rel)} ${p.letters[c.b]}`
    const body = `${stm}\nConclusions:\nI. ${cc(p.conclusions[0])}\nII. ${cc(p.conclusions[1])}`
    const stem = p.code ? `${legendText(p)}\n${body}` : body
    const q: QuestionDraft = { topic: 'inequality', stem, options: SYL_OPTIONS.slice(), answer: p.answer, explanation: explain(p) }
    groups.push({ questions: [q] })
    proofs.push(p)
  }
  return { groups, proofs }
}
