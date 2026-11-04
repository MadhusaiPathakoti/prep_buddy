// puzzle-comparison: partial order from a hidden total order; answers proven over ALL linear extensions.
import type { Rng } from '../rng'
import type { Group, MockDifficulty, QuestionDraft } from '../types'
import { DIRECTIONS, NUMW, ORD, cap, pickNames, splitCount, type WithProof } from './common'

export type CmpClaim =
  | { t: 'rank'; x: number; r: number } // exactly r persons are above x (0 = the greatest)
  | { t: 'gt'; x: number; y: number }
  | { t: 'between'; x: number; hi: number; lo: number }

export interface ComparisonProof {
  n: number
  /** hidden[p] = rank of person p (0 = greatest). */
  hidden: number[]
  /** [a, b]: a is greater than b. */
  clues: [number, number][]
  questions: {
    /** claim per option; null for the "cannot be determined" option. */
    options: (CmpClaim | null)[]
    answer: number
  }[]
}

interface Adj {
  more: string
  less: string
  most: string
  least: string
  noun: string
  subject: string
}

const ADJS: Adj[] = [
  { more: 'taller', less: 'shorter', most: 'tallest', least: 'shortest', noun: 'height', subject: 'friends' },
  { more: 'heavier', less: 'lighter', most: 'heaviest', least: 'lightest', noun: 'weight', subject: 'friends' },
  { more: 'older', less: 'younger', most: 'oldest', least: 'youngest', noun: 'age', subject: 'persons' },
  { more: 'faster', less: 'slower', most: 'fastest', least: 'slowest', noun: 'speed', subject: 'runners' },
  { more: 'richer', less: 'poorer', most: 'richest', least: 'poorest', noun: 'wealth', subject: 'persons' },
]

export function evalCmp(cl: CmpClaim, rank: number[]): boolean {
  switch (cl.t) {
    case 'rank':
      return rank[cl.x] === cl.r
    case 'gt':
      return rank[cl.x] < rank[cl.y]
    case 'between':
      return rank[cl.hi] < rank[cl.x] && rank[cl.x] < rank[cl.lo]
  }
}

function perms(n: number): number[][] {
  const out: number[][] = []
  const cur: number[] = []
  const used = new Array<boolean>(n).fill(false)
  const rec = () => {
    if (cur.length === n) {
      out.push(cur.slice())
      return
    }
    for (let i = 0; i < n; i++) {
      if (!used[i]) {
        used[i] = true
        cur.push(i)
        rec()
        cur.pop()
        used[i] = false
      }
    }
  }
  rec()
  return out
}

const PERM_CACHE = new Map<number, number[][]>()

/** All rank vectors (rank[p] = persons above p) consistent with the clues. */
export function extensions(n: number, clues: [number, number][]): number[][] {
  let all = PERM_CACHE.get(n)
  if (!all) {
    all = perms(n)
    PERM_CACHE.set(n, all)
  }
  const res: number[][] = []
  for (const order of all) {
    const rank = new Array<number>(n)
    order.forEach((p, i) => {
      rank[p] = i
    })
    if (clues.every(([a, b]) => rank[a] < rank[b])) res.push(rank)
  }
  return res
}

function reaches(edges: [number, number][], a: number, b: number): boolean {
  const seen = new Set<number>([a])
  const st = [a]
  while (st.length) {
    const v = st.pop() as number
    if (v === b) return true
    for (const [x, y] of edges) {
      if (x === v && !seen.has(y)) {
        seen.add(y)
        st.push(y)
      }
    }
  }
  return false
}

interface Cand {
  stem: string
  options: (CmpClaim | null)[]
  texts: string[]
  answer: number
  fact: string
  determined: boolean
}

export function generateComparisonWithProof(rng: Rng, difficulty: MockDifficulty, count: number): WithProof<ComparisonProof> {
  const groups: Group[] = []
  const proofs: ComparisonProof[] = []
  for (const k of splitCount(count, 3)) {
    let built: { group: Group; proof: ComparisonProof } | null = null
    for (let attempt = 0; attempt < 300 && !built; attempt++) built = tryBuild(rng, difficulty, k)
    if (!built) throw new Error('comparison: could not build a set')
    groups.push(built.group)
    proofs.push(built.proof)
  }
  return { groups, proofs }
}

function tryBuild(rng: Rng, difficulty: MockDifficulty, k: number): { group: Group; proof: ComparisonProof } | null {
  const n = difficulty === 'hard' ? 6 : 5
  const adj = rng.pick(ADJS)
  const names = pickNames(rng, n)
  const order = rng.shuffle(Array.from({ length: n }, (_, i) => i)) // order[i] = person with rank i
  const rank = new Array<number>(n)
  order.forEach((p, i) => {
    rank[p] = i
  })
  const m = difficulty === 'hard' ? n + rng.int(0, 1) : n
  const edges: [number, number][] = []
  const allPairs: [number, number][] = []
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) allPairs.push([order[i], order[j]])
  for (const [a, b] of rng.shuffle(allPairs)) {
    if (edges.length >= m) break
    if (reaches(edges, a, b)) continue
    edges.push([a, b])
  }
  if (edges.length < m) return null
  const exts = extensions(n, edges)
  if (exts.length < 1 || exts.length > (difficulty === 'hard' ? 40 : 24)) return null
  const allTrue = (cl: CmpClaim) => exts.every((e) => evalCmp(cl, e))

  const cands: Cand[] = []
  const nm = (p: number) => names[p]
  const persons = Array.from({ length: n }, (_, i) => i)
  const whoOptions = (claimOf: (p: number) => CmpClaim, det: number | null, exclude: number[] = []) => {
    const pool = persons.filter((p) => !exclude.includes(p))
    if (det !== null) {
      const base = pool.filter((p) => p !== det)
      const others = rng.sample(base.length >= 3 ? base : persons.filter((p) => p !== det), 3)
      const arr = rng.shuffle([det, ...others])
      return { options: [...arr.map(claimOf), null] as (CmpClaim | null)[], texts: [...arr.map(nm), 'Cannot be determined'], answer: arr.indexOf(det) }
    }
    const arr = rng.sample(pool.length >= 4 ? pool : persons, 4)
    return { options: [...arr.map(claimOf), null] as (CmpClaim | null)[], texts: [...arr.map(nm), 'Cannot be determined'], answer: 4 }
  }

  // extreme + k-th: who has exactly r persons above
  for (let r = 0; r < n; r++) {
    const claimOf = (p: number): CmpClaim => ({ t: 'rank', x: p, r })
    const hit = persons.filter((p) => allTrue(claimOf(p)))
    if (hit.length > 1) continue
    const det = hit.length === 1 ? hit[0] : null
    const fromTop = r <= (n - 1) / 2
    const kth = fromTop ? r + 1 : n - r
    const sup = fromTop ? adj.most : adj.least
    const word = kth === 1 ? sup : `${ORD[kth]} ${sup}`
    const stem = kth === 1 ? `Who among them is the ${word}?` : `Who is the ${word} among them?`
    const fact = det === null ? `The statements do not fix who is the ${word}: it differs between valid orders.` : `${nm(det)} is the ${word} in every order consistent with the statements.`
    cands.push({ stem, ...whoOptions(claimOf, det), fact, determined: det !== null })
  }
  // between
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      if (rank[a] >= rank[b]) continue
      const claimOf = (p: number): CmpClaim => ({ t: 'between', x: p, hi: a, lo: b })
      const hit = persons.filter((p) => allTrue(claimOf(p)))
      if (hit.length > 1) continue
      const det = hit.length === 1 ? hit[0] : null
      const stem = `Who among them is ${adj.more} than ${nm(b)} but ${adj.less} than ${nm(a)}?`
      const fact = det === null ? `The statements do not fix a single person who is ${adj.more} than ${nm(b)} and ${adj.less} than ${nm(a)}.` : `${nm(det)} is ${adj.more} than ${nm(b)} and ${adj.less} than ${nm(a)} in every consistent order.`
      cands.push({ stem, ...whoOptions(claimOf, det, [a, b]), fact, determined: det !== null })
    }
  }
  // count above / below
  const labels = ['None', 'One', 'Two', 'Three', 'Four', 'Five']
  for (let x = 0; x < n; x++) {
    for (const dir of ['above', 'below'] as const) {
      const claimOf = (kk: number): CmpClaim => ({ t: 'rank', x, r: dir === 'above' ? kk : n - 1 - kk })
      const detK = Array.from({ length: n }, (_, kk) => kk).filter((kk) => allTrue(claimOf(kk)))
      const cmpWord = dir === 'above' ? adj.more : adj.less
      const stem = `How many persons are ${cmpWord} than ${nm(x)}?`
      if (detK.length === 1) {
        const kk = detK[0]
        const pool = Array.from({ length: 5 }, (_, i) => i).filter((i) => i !== kk)
        const picked = [kk, ...rng.sample(pool, 3)].sort((p, q) => p - q)
        cands.push({ stem, options: [...picked.map(claimOf), null], texts: [...picked.map((i) => labels[i]), 'Cannot be determined'], answer: picked.indexOf(kk), fact: `Exactly ${NUMW[kk]} person${kk === 1 ? ' is' : 's are'} ${cmpWord} than ${nm(x)} in every consistent order.`, determined: true })
      } else if (detK.length === 0) {
        const picked = rng.sample([0, 1, 2, 3, 4], 4).sort((p, q) => p - q)
        cands.push({ stem, options: [...picked.map(claimOf), null], texts: [...picked.map((i) => labels[i]), 'Cannot be determined'], answer: 4, fact: `The number of persons ${cmpWord} than ${nm(x)} differs between valid orders.`, determined: false })
      }
    }
  }
  // statements: exactly one definitely true
  let stmt: Cand | null = null
  for (let t = 0; t < 8 && !stmt; t++) {
    const trues: CmpClaim[] = []
    const falses: CmpClaim[] = []
    const keys = new Set<string>()
    for (let i = 0; i < 100 && (trues.length < 1 || falses.length < 4); i++) {
      const [x, y] = rng.sample(persons, 2)
      const cl: CmpClaim = { t: 'gt', x, y }
      const kk = `${x}-${y}`
      if (keys.has(kk)) continue
      if (allTrue(cl)) {
        if (trues.length < 1) {
          trues.push(cl)
          keys.add(kk)
        }
      } else if (falses.length < 4) {
        falses.push(cl)
        keys.add(kk)
      }
    }
    if (trues.length < 1 || falses.length < 4) continue
    const ans = rng.int(0, 4)
    const all = [...falses]
    all.splice(ans, 0, trues[0])
    const texts = all.map((cl) => (cl.t === 'gt' ? (rng.chance(0.5) ? `${nm(cl.x)} is ${adj.more} than ${nm(cl.y)}` : `${nm(cl.y)} is ${adj.less} than ${nm(cl.x)}`) : ''))
    if (new Set(texts).size !== 5) continue
    stmt = { stem: 'Which of the following statements is definitely true?', options: all, texts, answer: ans, fact: `"${texts[ans]}" follows from the statements in every consistent order; each of the other statements is false or cannot be established.`, determined: true }
  }
  const chosen: Cand[] = []
  const usedStems = new Set<string>()
  const take = (list: Cand[]): boolean => {
    const avail = list.filter((c) => !usedStems.has(c.stem))
    if (!avail.length) return false
    const c = rng.pick(avail)
    chosen.push(c)
    usedStems.add(c.stem)
    return true
  }
  const det = cands.filter((c) => c.determined)
  const undet = cands.filter((c) => !c.determined)
  for (let i = 0; i < k; i++) {
    const wantUndet = rng.chance(difficulty === 'hard' ? 0.3 : 0.22)
    if (stmt && !chosen.includes(stmt) && rng.chance(0.4)) {
      chosen.push(stmt)
      continue
    }
    if (wantUndet && take(undet)) continue
    if (take(det)) continue
    if (take(undet)) continue
    return null
  }
  const clueSentences = renderClues(rng, names, edges, adj)
  const given = edges.map(([a, b]) => `${names[a]} > ${names[b]}`).join(', ')
  const questions: QuestionDraft[] = chosen.map((c) => ({
    topic: 'puzzle-comparison',
    stem: c.stem,
    options: c.texts,
    answer: c.answer,
    explanation: `Given (${adj.noun}): ${given}. ${c.fact}`,
  }))
  const group: Group = {
    stimulus: {
      directions: DIRECTIONS,
      parts: [
        {
          kind: 'text',
          paragraphs: [
            `${cap(NUMW[n])} ${adj.subject} - ${names.join(', ')} - are compared on the basis of their ${adj.noun}. No two of them have the same ${adj.noun}. The following information is known:`,
            ...clueSentences,
          ],
        },
      ],
    },
    questions,
  }
  return { group, proof: { n, hidden: rank, clues: edges, questions: chosen.map((c) => ({ options: c.options, answer: c.answer })) } }
}

function renderClues(rng: Rng, names: string[], edges: [number, number][], adj: Adj): string[] {
  const out: string[] = []
  const used = new Set<number>()
  for (let i = 0; i < edges.length; i++) {
    if (used.has(i)) continue
    let merged = false
    if (rng.chance(0.55)) {
      for (let j = i + 1; j < edges.length && !merged; j++) {
        if (used.has(j)) continue
        const [a1, b1] = edges[i]
        const [a2, b2] = edges[j]
        if (b1 === a2) {
          out.push(`${names[b1]} is ${adj.less} than ${names[a1]} but ${adj.more} than ${names[b2]}.`)
          merged = true
        } else if (b2 === a1) {
          out.push(`${names[b2]} is ${adj.less} than ${names[a2]} but ${adj.more} than ${names[b1]}.`)
          merged = true
        } else if (a1 === a2) {
          out.push(`${names[a1]} is ${adj.more} than both ${names[b1]} and ${names[b2]}.`)
          merged = true
        } else if (b1 === b2) {
          out.push(`${names[b1]} is ${adj.less} than both ${names[a1]} and ${names[a2]}.`)
          merged = true
        }
        if (merged) {
          used.add(i)
          used.add(j)
        }
      }
    }
    if (!merged) {
      const [a, b] = edges[i]
      out.push(rng.chance(0.5) ? `${names[a]} is ${adj.more} than ${names[b]}.` : `${names[b]} is ${adj.less} than ${names[a]}.`)
      used.add(i)
    }
  }
  return rng.shuffle(out)
}
