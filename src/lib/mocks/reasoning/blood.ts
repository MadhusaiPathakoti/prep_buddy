// Blood relations: hidden family tree -> chain of direct-relation statements; the answer is read from the tree AND
// re-derived from the statements alone with a "free model" builder (the statements must determine the answer).
import type { Rng } from '../rng'
import type { Group, MockDifficulty, QuestionDraft } from '../types'
import { pickGenderedNames, pickNames, splitCount, type WithProof } from './common'

export type Prim = 'father' | 'mother' | 'son' | 'daughter' | 'brother' | 'sister' | 'husband' | 'wife'
export const CANNOT = 'Cannot be determined'

export interface BloodProof {
  /** hops[i]: person i is the `rel` of person i+1. */
  hops: { rel: Prim }[]
  nPersons: number
  from: number
  to: number
  /** option index of the keyed answer, and the keyed text. */
  answer: number
  answerText: string
  /** coded: relation -> operator symbol. */
  code: Record<string, string> | null
}

const MALE_PRIM: Prim[] = ['father', 'son', 'brother', 'husband']
const kindOf = (r: Prim): 'parent' | 'child' | 'sib' | 'spouse' => (r === 'father' || r === 'mother' ? 'parent' : r === 'son' || r === 'daughter' ? 'child' : r === 'brother' || r === 'sister' ? 'sib' : 'spouse')
const genderOfPrim = (r: Prim): 0 | 1 => (MALE_PRIM.includes(r) ? 1 : 0)

export interface TreeLike {
  par(x: number): number[]
  sp(x: number): number
}

const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x))

export function classify(t: TreeLike, u: number, v: number, g: 0 | 1): string | null {
  if (u === v) return null
  const male = g === 1
  const P = (x: number) => t.par(x)
  const sib = (x: number, y: number) => x !== y && P(x).length === 2 && P(y).length === 2 && sameSet(P(x), P(y))
  const sp = (x: number) => t.sp(x)
  if (sp(u) === v) return male ? 'husband' : 'wife'
  if (P(v).includes(u)) return male ? 'father' : 'mother'
  if (P(u).includes(v)) return male ? 'son' : 'daughter'
  if (sib(u, v)) return male ? 'brother' : 'sister'
  if (P(v).some((p) => P(p).includes(u))) return male ? 'grandfather' : 'grandmother'
  if (P(u).some((p) => P(p).includes(v))) return male ? 'grandson' : 'granddaughter'
  const uncleAunt = (x: number, y: number) => P(y).some((p) => sib(x, p) || (sp(x) >= 0 && sib(sp(x), p)))
  if (uncleAunt(u, v)) return male ? 'uncle' : 'aunt'
  if (uncleAunt(v, u)) return male ? 'nephew' : 'niece'
  if (P(u).some((p) => P(v).some((q) => sib(p, q)))) return 'cousin'
  const spv = sp(v)
  const spu = sp(u)
  const sibOfV = (s: number) => sib(s, v)
  for (let s = 0; s < 64; s++) {
    if (sp(s) === u && s !== v && sibOfV(s)) return male ? 'brother-in-law' : 'sister-in-law'
  }
  if (spv >= 0 && sib(u, spv)) return male ? 'brother-in-law' : 'sister-in-law'
  if (spv >= 0 && P(spv).includes(u)) return male ? 'father-in-law' : 'mother-in-law'
  if (spu >= 0 && P(spu).includes(v)) return male ? 'son-in-law' : 'daughter-in-law'
  return null
}

// ------------------------------------------------------------------ hidden tree
interface Tree {
  g: number[]
  f: number[]
  m: number[]
  s: number[]
}

function genTree(rng: Rng): Tree | null {
  const t: Tree = { g: [], f: [], m: [], s: [] }
  const add = (g: number): number => {
    t.g.push(g)
    t.f.push(-1)
    t.m.push(-1)
    t.s.push(-1)
    return t.g.length - 1
  }
  const wed = (a: number, b: number) => {
    t.s[a] = b
    t.s[b] = a
  }
  const g1 = add(1)
  const g2 = add(0)
  wed(g1, g2)
  const kids: number[] = []
  const nk = rng.int(2, 3)
  for (let i = 0; i < nk; i++) {
    const c = add(rng.chance(0.5) ? 1 : 0)
    t.f[c] = g1
    t.m[c] = g2
    kids.push(c)
  }
  for (const c of kids) {
    if (!rng.chance(0.8)) continue
    const w = add(1 - t.g[c])
    wed(c, w)
    const nGrand = rng.int(0, 2)
    for (let i = 0; i < nGrand; i++) {
      const gc = add(rng.chance(0.5) ? 1 : 0)
      const [fa, mo] = t.g[c] === 1 ? [c, w] : [w, c]
      t.f[gc] = fa
      t.m[gc] = mo
    }
  }
  if (t.g.length < 8) return null
  return t
}

const treeLike = (t: Tree): TreeLike => ({
  par: (x) => (t.f[x] >= 0 && t.m[x] >= 0 ? [t.f[x], t.m[x]] : []),
  sp: (x) => (x >= 0 && x < t.s.length ? t.s[x] : -1),
})

function directRel(t: Tree, a: number, b: number): Prim | null {
  const tl = treeLike(t)
  const male = t.g[a] === 1
  if (tl.par(b).includes(a)) return male ? 'father' : 'mother'
  if (tl.par(a).includes(b)) return male ? 'son' : 'daughter'
  if (t.s[a] === b) return male ? 'husband' : 'wife'
  const pa = tl.par(a)
  const pb = tl.par(b)
  if (pa.length === 2 && sameSet(pa, pb) && a !== b) return male ? 'brother' : 'sister'
  return null
}

function randomPath(rng: Rng, t: Tree, len: number): number[] | null {
  const n = t.g.length
  const adjacent = (a: number): number[] => {
    const out: number[] = []
    for (let b = 0; b < n; b++) if (b !== a && directRel(t, a, b) !== null) out.push(b)
    return out
  }
  for (let attempt = 0; attempt < 50; attempt++) {
    const start = rng.int(0, n - 1)
    const path = [start]
    while (path.length < len + 1) {
      const last = path[path.length - 1]
      const opts = adjacent(last).filter((b) => !path.includes(b))
      if (!opts.length) break
      path.push(rng.pick(opts))
    }
    if (path.length === len + 1) return path
  }
  return null
}

// ------------------------------------------------------------------ free model from the statements alone
interface Free {
  g: number[]
  par: number[][]
  sp: number[]
  named: number
}

export function buildFree(hops: { rel: Prim }[], nPersons: number): Free | null {
  const F: Free = { g: new Array(nPersons).fill(-1), par: Array.from({ length: nPersons }, () => []), sp: new Array(nPersons).fill(-1), named: nPersons }
  const newNode = (g: number): number => {
    F.g.push(g)
    F.par.push([])
    F.sp.push(-1)
    return F.g.length - 1
  }
  const couple = (): [number, number] => {
    const a = newNode(-1)
    const b = newNode(-1)
    F.sp[a] = b
    F.sp[b] = a
    return [a, b]
  }
  const setG = (x: number, g: number): boolean => {
    if (F.g[x] >= 0 && F.g[x] !== g) return false
    F.g[x] = g
    return true
  }
  const propagate = (): boolean => {
    let ch = true
    while (ch) {
      ch = false
      for (let x = 0; x < F.g.length; x++) {
        const y = F.sp[x]
        if (y < 0 || F.g[x] === -2) continue
        if (F.g[x] >= 0) {
          if (F.g[y] < 0) {
            F.g[y] = 1 - F.g[x]
            ch = true
          } else if (F.g[y] === F.g[x]) return false
        }
      }
    }
    return true
  }
  const merge = (v: number, n: number): boolean => {
    if (v === n) return true
    if (F.g[v] >= 0 && F.g[n] >= 0 && F.g[v] !== F.g[n]) return false
    if (F.g[n] < 0) F.g[n] = F.g[v]
    if (F.par[n].length === 0) F.par[n] = F.par[v].slice()
    else if (F.par[v].length > 0 && !sameSet(F.par[n], F.par[v])) return false
    if (F.sp[v] >= 0) {
      if (F.sp[n] < 0) F.sp[n] = F.sp[v]
      else if (F.sp[n] !== F.sp[v]) return false
    }
    for (let x = 0; x < F.g.length; x++) {
      if (x === v) continue
      F.par[x] = F.par[x].map((p) => (p === v ? n : p))
      if (F.sp[x] === v) F.sp[x] = n
      if (new Set(F.par[x]).size !== F.par[x].length) return false
    }
    F.g[v] = -2
    F.par[v] = []
    F.sp[v] = -1
    if (F.sp[n] === n) return false
    return true
  }
  for (let i = 0; i < hops.length; i++) {
    const rel = hops[i].rel
    const a = i
    const b = i + 1
    if (!setG(a, genderOfPrim(rel))) return null
    switch (kindOf(rel)) {
      case 'parent': {
        if (F.sp[a] < 0) {
          const v = newNode(F.g[a] >= 0 ? 1 - F.g[a] : -1)
          F.sp[a] = v
          F.sp[v] = a
        }
        if (F.par[b].length) return null
        F.par[b] = [a, F.sp[a]]
        break
      }
      case 'child': {
        if (F.par[a].length === 0) {
          const v = newNode(F.g[b] >= 0 ? 1 - F.g[b] : -1)
          if (F.sp[b] >= 0) return null
          F.sp[b] = v
          F.sp[v] = b
          F.par[a] = [b, v]
        } else {
          const virt = F.par[a].filter((x) => x >= F.named)
          if (!virt.length) return null
          if (!merge(virt[0], b)) return null
        }
        break
      }
      case 'sib': {
        if (F.par[a].length === 0) {
          const [v1, v2] = couple()
          F.par[a] = [v1, v2]
        }
        if (F.par[b].length) return null
        F.par[b] = F.par[a].slice()
        break
      }
      case 'spouse': {
        if (F.sp[a] >= F.named) {
          if (!merge(F.sp[a], b)) return null
        } else if (F.sp[a] >= 0) return null
        else {
          F.sp[a] = b
          F.sp[b] = a
        }
        break
      }
    }
    if (!propagate()) return null
  }
  return F
}

const freeLike = (F: Free): TreeLike => ({ par: (x) => (x >= 0 && x < F.par.length ? F.par[x] : []), sp: (x) => (x >= 0 && x < F.sp.length ? F.sp[x] : -1) })

/** Term of `u` relative to `v` using only the statements; CANNOT when gender-dependent and unknown; null if not derivable. */
export function freeAnswer(hops: { rel: Prim }[], nPersons: number, u: number, v: number): string | null {
  const F = buildFree(hops, nPersons)
  if (!F) return null
  const tl = freeLike(F)
  if (F.g[u] >= 0) return classify(tl, u, v, F.g[u] as 0 | 1)
  const a = classify(tl, u, v, 0)
  const b = classify(tl, u, v, 1)
  if (a === null || b === null) return null
  return a === b ? a : CANNOT
}

// ------------------------------------------------------------------ rendering
const MALE_TERMS = ['father', 'son', 'brother', 'husband', 'grandfather', 'grandson', 'uncle', 'nephew', 'cousin', 'brother-in-law', 'father-in-law', 'son-in-law']
const FEMALE_TERMS = ['mother', 'daughter', 'sister', 'wife', 'grandmother', 'granddaughter', 'aunt', 'niece', 'cousin', 'sister-in-law', 'mother-in-law', 'daughter-in-law']
const OPS = ['+', '−', '×', '÷', '%']

function relText(r: Prim): string {
  return r
}

function explain(hops: { rel: Prim }[], names: string[], from: number, to: number, answerText: string, coded: boolean): string {
  const dec = hops.map((h, i) => `${names[i]} is the ${relText(h.rel)} of ${names[i + 1]}`).join('; ')
  const tail = answerText === CANNOT ? `The gender of ${names[from]} is not given, so the relation cannot be determined.` : `Hence ${names[from]} is the ${answerText} of ${names[to]}.`
  return `${coded ? 'Decoded: ' : ''}${dec}. ${tail}`
}

function oneQuestion(rng: Rng, difficulty: MockDifficulty): { q: QuestionDraft; proof: BloodProof } {
  const hard = difficulty === 'hard'
  for (let attempt = 0; attempt < 2000; attempt++) {
    const t = genTree(rng)
    if (!t) continue
    const len = hard ? rng.int(4, 5) : rng.int(3, 4)
    const path = randomPath(rng, t, len)
    if (!path) continue
    const hops: { rel: Prim }[] = []
    let ok = true
    for (let i = 0; i < len; i++) {
      const r = directRel(t, path[i], path[i + 1])
      if (!r) {
        ok = false
        break
      }
      hops.push({ rel: r })
    }
    if (!ok) continue
    // avoid trivial same-kind runs
    if (hops.some((h, i) => i > 0 && kindOf(h.rel) === 'sib' && kindOf(hops[i - 1].rel) === 'sib')) continue
    if (hops.some((h, i) => i > 0 && kindOf(h.rel) === 'spouse' && kindOf(hops[i - 1].rel) === 'spouse')) continue
    const nP = len + 1
    const tl = treeLike(t)
    // which direction does the question ask
    const reverse = rng.chance(hard ? 0.4 : 0.3)
    const fromI = reverse ? len : 0
    const toI = reverse ? 0 : len
    const hiddenTerm = classify(tl, path[fromI], path[toI], t.g[path[fromI]] as 0 | 1)
    if (!hiddenTerm) continue
    const freeTerm = freeAnswer(hops, nP, fromI, toI)
    if (freeTerm === null) continue
    let answerText: string
    if (freeTerm === CANNOT) {
      // keep the trap only sometimes
      if (!rng.chance(0.5)) continue
      answerText = CANNOT
    } else {
      if (freeTerm !== hiddenTerm) continue
      answerText = freeTerm
    }
    const isPrimitive = ['father', 'mother', 'son', 'daughter', 'brother', 'sister', 'husband', 'wife'].includes(answerText)
    if (answerText !== CANNOT && isPrimitive && rng.chance(hard ? 0.95 : 0.6)) continue
    // options
    const gKnown = answerText === CANNOT ? t.g[path[fromI]] : t.g[path[fromI]]
    const pool = (gKnown === 1 ? MALE_TERMS : FEMALE_TERMS).filter((x) => x !== answerText)
    const anyPool = [...new Set([...MALE_TERMS, ...FEMALE_TERMS])].filter((x) => x !== answerText)
    const names = answerText === CANNOT || rng.chance(0.5) ? pickNames(rng, nP, 'letters') : pickGenderedNames(rng, path.map((p) => t.g[p]))
    let options: string[]
    let answer: number
    if (answerText === CANNOT) {
      const wrong = rng.sample(anyPool, 4)
      options = [...wrong, CANNOT]
      answer = 4
    } else if (rng.chance(0.45)) {
      const wrong = rng.sample(pool, 3)
      const body = rng.shuffle([answerText, ...wrong])
      options = [...body, CANNOT]
      answer = body.indexOf(answerText)
    } else {
      const wrong = rng.sample(pool, 4)
      options = rng.shuffle([answerText, ...wrong])
      answer = options.indexOf(answerText)
    }
    if (new Set(options).size !== 5) continue
    let stem: string
    let code: Record<string, string> | null = null
    const nm = (i: number) => names[i]
    const q1 = `How is ${nm(fromI)} related to ${nm(toI)}?`
    // coded hard variant: only for forward chains on distinct relation kinds
    if (hard && rng.chance(0.55)) {
      const used = [...new Set(hops.map((h) => h.rel))]
      const ops = rng.sample(OPS, 5)
      const extras = rng.sample((['father', 'mother', 'son', 'daughter', 'brother', 'sister', 'husband', 'wife'] as Prim[]).filter((x) => !used.includes(x)), 5 - used.length)
      const rels = [...used, ...extras]
      code = {}
      rels.forEach((r, i) => {
        ;(code as Record<string, string>)[r] = ops[i]
      })
      const legend = rels.map((r) => `'P ${(code as Record<string, string>)[r]} Q' means 'P is the ${r} of Q'`).join('; ')
      const expr = hops.reduce((s, h, i) => `${s} ${(code as Record<string, string>)[h.rel]} ${nm(i + 1)}`, nm(0))
      const ask = reverse ? `how is ${nm(fromI)} related to ${nm(toI)}` : `how is ${nm(0)} related to ${nm(len)}`
      stem = `In a certain code language, ${legend}.\nIf ${expr}, ${ask}?`
    } else {
      stem = `${hops.map((h, i) => `${nm(i)} is the ${relText(h.rel)} of ${nm(i + 1)}.`).join(' ')} ${q1}`
    }
    const q: QuestionDraft = { topic: 'blood-relation', stem, options, answer, explanation: explain(hops, names, fromI, toI, answerText, !!code) }
    return { q, proof: { hops, nPersons: nP, from: fromI, to: toI, answer, answerText, code } }
  }
  throw new Error('blood-relation: generation failed')
}

export function generateBloodWithProof(rng: Rng, difficulty: MockDifficulty, count: number): WithProof<BloodProof> {
  const groups: Group[] = []
  const proofs: BloodProof[] = []
  for (const _k of splitCount(count, 1)) {
    void _k
    const { q, proof } = oneQuestion(rng, difficulty)
    groups.push({ questions: [q] })
    proofs.push(proof)
  }
  return { groups, proofs }
}
