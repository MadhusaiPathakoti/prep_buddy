// Order & ranking: stand-alone row/class problems. The proof object lists the given facts, the operations and the
// question so the harness can re-derive the answer by brute force over the unknown row length.
import type { Rng } from '../rng'
import type { Group, MockDifficulty, QuestionDraft } from '../types'
import { ordinalNum, pickNames, placeCorrect, splitCount, type WithProof } from './common'

export type RFact =
  | { k: 'total'; n: number }
  | { k: 'fromLeft'; who: number; n: number }
  | { k: 'fromRight'; who: number; n: number }
  | { k: 'between'; a: number; b: number; n: number }
  | { k: 'leftOf'; a: number; b: number }
export type ROp = { k: 'swap'; a: number; b: number } | { k: 'removeLeft'; who: number; count: number } | { k: 'addRight'; count: number }
export type RAsk = { k: 'total' } | { k: 'between'; a: number; b: number } | { k: 'fromLeft'; who: number } | { k: 'fromRight'; who: number }

export interface RankProof {
  nPersons: number
  facts: RFact[]
  ops: ROp[]
  afterFacts: RFact[]
  ask: RAsk
  answerValue: number
  answer: number
}

interface Built {
  text: string
  nPersons: number
  facts: RFact[]
  ops: ROp[]
  afterFacts: RFact[]
  ask: RAsk
  value: number
  distractors: number[]
  expl: string
}

const ordS = (n: number) => ordinalNum(n)

function tClassSize(rng: Rng, names: string[]): Built {
  const N = rng.int(25, 59)
  const a = rng.int(6, N - 8)
  const b = N - a + 1
  const x = names[0]
  const text = rng.chance(0.5)
    ? `In a class, ${x} ranks ${ordS(a)} from the top and ${ordS(b)} from the bottom. How many students are there in the class?`
    : `${x} is ${ordS(a)} from the top and ${ordS(b)} from the bottom in a class. How many students are there in the class?`
  return {
    text, nPersons: 1, facts: [{ k: 'fromLeft', who: 0, n: a }, { k: 'fromRight', who: 0, n: b }], ops: [], afterFacts: [], ask: { k: 'total' }, value: N,
    distractors: [a + b, a + b - 2, a + b + 1, N + 2, N - 2, a + b + 2], expl: `Total = (rank from top) + (rank from bottom) - 1 = ${a} + ${b} - 1 = ${N}.`,
  }
}

function tBetween(rng: Rng, names: string[]): Built {
  const N = rng.int(30, 60)
  const p = rng.int(6, Math.floor(N / 2))
  const q = rng.int(6, Math.floor(N / 2))
  const m = N - p - q
  if (m < 3) return tBetween(rng, names)
  const [A, B] = names
  const things = rng.pick(['boys', 'students', 'persons'])
  const text = `In a row of ${N} ${things}, ${A} is ${ordS(p)} from the left end and ${B} is ${ordS(q)} from the right end. How many ${things} are there between ${A} and ${B}?`
  return {
    text, nPersons: 2, facts: [{ k: 'total', n: N }, { k: 'fromLeft', who: 0, n: p }, { k: 'fromRight', who: 1, n: q }], ops: [], afterFacts: [], ask: { k: 'between', a: 0, b: 1 }, value: m,
    distractors: [m + 1, m - 1, m + 2, N - p - q - 2, p + q, N - p - q + 3], expl: `Persons between = ${N} - (${p} + ${q}) = ${m}.`,
  }
}

function tTotalFromBetween(rng: Rng, names: string[], hard: boolean): Built {
  const p = rng.int(hard ? 9 : 6, hard ? 24 : 18)
  const q = rng.int(hard ? 9 : 6, hard ? 24 : 18)
  const m = rng.int(3, hard ? 15 : 12)
  const N = p + q + m
  const [A, B] = names
  const text = hard
    ? `In a queue, ${A} is ${ordS(p)} from the front and ${B} is ${ordS(q)} from the back. If ${A} stands ahead of ${B} and there are ${m} persons between them, how many persons are there in the queue?`
    : `In a row, ${A} is ${ordS(p)} from the left end and ${B} is ${ordS(q)} from the right end. If there are ${m} persons between ${A} and ${B}, how many persons are there in the row?`
  return {
    text, nPersons: 2, facts: [{ k: 'fromLeft', who: 0, n: p }, { k: 'fromRight', who: 1, n: q }, { k: 'between', a: 0, b: 1, n: m }, { k: 'leftOf', a: 0, b: 1 }], ops: [], afterFacts: [], ask: { k: 'total' }, value: N,
    distractors: [N + 1, N - 1, N + 2, N - 2, p + q, p + q + m + 2], expl: `Total = ${p} + ${m} + ${q} = ${N} (position of the first person from his end + persons between + position of the second person from the other end).`,
  }
}

function tSwapTotal(rng: Rng, names: string[]): Built {
  const q = rng.int(8, 25)
  const r = rng.int(14, 40)
  const N = r + q - 1
  let p = rng.int(5, 30)
  while (p === r || p > N) p = rng.int(5, 30)
  const [P, Q] = names
  const text = `In a row, ${P} is ${ordS(p)} from the left end and ${Q} is ${ordS(q)} from the right end. If ${P} and ${Q} interchange their positions, ${P} becomes ${ordS(r)} from the left end. How many persons are there in the row?`
  return {
    text, nPersons: 2, facts: [{ k: 'fromLeft', who: 0, n: p }, { k: 'fromRight', who: 1, n: q }], ops: [{ k: 'swap', a: 0, b: 1 }], afterFacts: [{ k: 'fromLeft', who: 0, n: r }], ask: { k: 'total' }, value: N,
    distractors: [N + 1, N - 1, p + q - 1, r + q, N + 2, N - 2],
    expl: `After the interchange ${P} takes ${Q}'s old place, so ${Q} was ${ordS(r)} from the left and ${ordS(q)} from the right. Total = ${r} + ${q} - 1 = ${N}.`,
  }
}

function tSwapBetween(rng: Rng, names: string[]): Built {
  const q = rng.int(8, 25)
  const r = rng.int(14, 40)
  const N = r + q - 1
  let p = rng.int(5, 30)
  while (p === r || Math.abs(r - p) < 4 || p > N) p = rng.int(5, 30)
  const [P, Q] = names
  const m = Math.abs(r - p) - 1
  const text = `In a row, ${P} is ${ordS(p)} from the left end and ${Q} is ${ordS(q)} from the right end. After they interchange their positions, ${P} becomes ${ordS(r)} from the left end. How many persons are there between ${P} and ${Q}?`
  return {
    text, nPersons: 2, facts: [{ k: 'fromLeft', who: 0, n: p }, { k: 'fromRight', who: 1, n: q }], ops: [{ k: 'swap', a: 0, b: 1 }], afterFacts: [{ k: 'fromLeft', who: 0, n: r }], ask: { k: 'between', a: 0, b: 1 }, value: m,
    distractors: [m + 1, m - 1, m + 2, m - 2, Math.abs(r - p), r + p],
    expl: `${Q}'s original position from the left = ${r} (the place ${P} now occupies). ${P}'s original place = ${p}. Persons between = |${r} - ${p}| - 1 = ${m}.`,
  }
}

function tRankBottom(rng: Rng, names: string[]): Built {
  const N = rng.int(25, 60)
  const a = rng.int(5, N - 6)
  const x = names[0]
  const useTop = rng.chance(0.5)
  const value = N - a + 1
  const text = useTop
    ? `In a class of ${N} students, ${x} ranks ${ordS(a)} from the top. What is ${x}'s rank from the bottom?`
    : `In a class of ${N} students, ${x} ranks ${ordS(a)} from the bottom. What is ${x}'s rank from the top?`
  return {
    text, nPersons: 1, facts: [{ k: 'total', n: N }, useTop ? { k: 'fromLeft', who: 0, n: a } : { k: 'fromRight', who: 0, n: a }], ops: [], afterFacts: [], ask: useTop ? { k: 'fromRight', who: 0 } : { k: 'fromLeft', who: 0 }, value,
    distractors: [value + 1, value - 1, N - a, value + 3, value + 2, value - 2], expl: `Other rank = ${N} - ${a} + 1 = ${value}.`,
  }
}

function tLeave(rng: Rng, names: string[], hard: boolean): Built {
  const x = names[0]
  if (!hard) {
    const p = rng.int(12, 30)
    const k = rng.int(3, p - 4)
    const value = p - k
    return {
      text: `In a row, ${x} is ${ordS(p)} from the left end. If ${k} persons standing to the left of ${x} leave the row, what will be ${x}'s position from the left end?`,
      nPersons: 1, facts: [{ k: 'fromLeft', who: 0, n: p }], ops: [{ k: 'removeLeft', who: 0, count: k }], afterFacts: [], ask: { k: 'fromLeft', who: 0 }, value,
      distractors: [value + 1, value - 1, p + k, p - k + 2, value + 2, value - 2], expl: `New position = ${p} - ${k} = ${value}.`,
    }
  }
  const N = rng.int(30, 55)
  const p = rng.int(12, N - 8)
  const k = rng.int(3, 8)
  const m = rng.int(3, 9)
  const value = N - p + 1 + m
  return {
    text: `In a row of ${N} persons, ${x} is ${ordS(p)} from the left end. If ${k} persons standing to the left of ${x} leave the row and ${m} new persons join at the right end, what will be ${x}'s position from the right end?`,
    nPersons: 1, facts: [{ k: 'total', n: N }, { k: 'fromLeft', who: 0, n: p }], ops: [{ k: 'removeLeft', who: 0, count: k }, { k: 'addRight', count: m }], afterFacts: [], ask: { k: 'fromRight', who: 0 }, value,
    distractors: [value + 1, value - 1, value - m, N - p + 1, value + k, value - k],
    expl: `Persons to the right of ${x} = ${N} - ${p} = ${N - p}; after ${m} join at the right end his position from the right = ${N - p} + ${m} + 1 = ${value}. (The persons leaving from the left do not affect it.)`,
  }
}

export function generateRankingWithProof(rng: Rng, difficulty: MockDifficulty, count: number): WithProof<RankProof> {
  const hard = difficulty === 'hard'
  const groups: Group[] = []
  const proofs: RankProof[] = []
  for (const _k of splitCount(count, 1)) {
    void _k
    let made = false
    for (let attempt = 0; attempt < 200 && !made; attempt++) {
      const names = pickNames(rng, 2)
      const t = hard ? rng.pick(['swapT', 'swapB', 'tot', 'leave', 'swapT', 'swapB']) : rng.pick(['class', 'between', 'tot', 'bottom', 'leave'])
      const b: Built =
        t === 'class' ? tClassSize(rng, names)
        : t === 'between' ? tBetween(rng, names)
        : t === 'tot' ? tTotalFromBetween(rng, names, hard)
        : t === 'bottom' ? tRankBottom(rng, names)
        : t === 'leave' ? tLeave(rng, names, hard)
        : t === 'swapT' ? tSwapTotal(rng, names)
        : tSwapBetween(rng, names)
      const wrong = [...new Set(b.distractors.filter((v) => v > 0 && v !== b.value))]
      if (wrong.length < 4) continue
      const p = placeCorrect(rng, String(b.value), rng.sample(wrong, 4).map(String))
      const q: QuestionDraft = { topic: 'order-ranking', stem: b.text, options: p.items, answer: p.answer, explanation: b.expl }
      groups.push({ questions: [q] })
      proofs.push({ nPersons: b.nPersons, facts: b.facts, ops: b.ops, afterFacts: b.afterFacts, ask: b.ask, answerValue: b.value, answer: p.answer })
      made = true
    }
    if (!made) throw new Error('order-ranking: generation failed')
  }
  return { groups, proofs }
}
