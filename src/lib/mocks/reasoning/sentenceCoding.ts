// Sentence coding ("Chinese coding"): coded sentences from a hidden dictionary; every asked fact is proven by enumerating
// ALL dictionaries (word -> code bijections) consistent with the sentences.
import type { Rng } from '../rng'
import type { Group, MockDifficulty, QuestionDraft } from '../types'
import { DIRECTIONS, placeCorrect, splitCount, type WithProof } from './common'

export interface CodedSentence {
  words: string[]
  codes: string[]
}
export type SCKind = 'code' | 'word' | 'phrase' | 'may'
export interface SCQuestionProof {
  kind: SCKind
  /** words (code/phrase/may) or the code (word). */
  query: string[]
  options: string[]
  answer: number
}
export interface SentenceCodingProof {
  sentences: CodedSentence[]
  questions: SCQuestionProof[]
}

const VOCAB = [
  'sky', 'blue', 'bird', 'flies', 'high', 'red', 'rose', 'sweet', 'green', 'tree', 'tall', 'big', 'house', 'nice', 'boys', 'play',
  'cricket', 'good', 'girls', 'read', 'books', 'new', 'old', 'fast', 'car', 'road', 'long', 'water', 'cold', 'fresh', 'morning',
  'sun', 'shines', 'bright', 'market', 'busy', 'city', 'clean', 'rain', 'falls', 'small', 'river', 'flows',
]
const CONS = 'bcdfghjklmnprstvz'.split('')
const VOW = 'aeiou'.split('')

/** All bijections words->codes consistent with the sentences (each sentence's code set = image of its word set). */
export function allDictionaries(sentences: CodedSentence[], cap = 20000): Map<string, string>[] {
  const words = [...new Set(sentences.flatMap((s) => s.words))]
  const codes = [...new Set(sentences.flatMap((s) => s.codes))]
  if (words.length !== codes.length) return []
  const sols: Map<string, string>[] = []
  const used = new Set<string>()
  const cur = new Map<string, string>()
  const rec = (i: number) => {
    if (sols.length >= cap) return
    if (i === words.length) {
      sols.push(new Map(cur))
      return
    }
    const w = words[i]
    for (const c of codes) {
      if (used.has(c)) continue
      let ok = true
      for (const s of sentences) if (s.words.includes(w) && !s.codes.includes(c)) ok = false
      if (!ok) continue
      used.add(c)
      cur.set(w, c)
      rec(i + 1)
      cur.delete(w)
      used.delete(c)
    }
  }
  rec(0)
  return sols
}

function explainCode(sentences: CodedSentence[], w: string, c: string): string {
  const containing = sentences.filter((x) => x.words.includes(w))
  if (containing.length >= 2) {
    const common = containing[0].codes.filter((k) => containing.every((x) => x.codes.includes(k)))
    if (common.length === 1) return `'${w}' occurs in ${containing.length} sentences and the only code common to all of them is '${common[0]}', so '${w}' = '${c}'.`
  }
  return `Comparing the sentences and eliminating the codes already identified for the other words, '${w}' = '${c}'.`
}

function explainWord(sentences: CodedSentence[], w: string, c: string): string {
  const containing = sentences.filter((x) => x.codes.includes(c))
  if (containing.length >= 2) {
    const common = containing[0].words.filter((k) => containing.every((x) => x.words.includes(k)))
    if (common.length === 1) return `The code '${c}' occurs in ${containing.length} sentences and the only word common to all of them is '${common[0]}', so '${c}' = '${w}'.`
  }
  return `Comparing the sentences and eliminating the words already identified, the code '${c}' stands for '${w}'.`
}

function shuffled<T>(rng: Rng, a: T[]): T[] {
  return rng.shuffle(a)
}

function buildStructure(rng: Rng, hard: boolean): { sentences: CodedSentence[]; dict: Map<string, string>; sols: Map<string, string>[] } | null {
  const nw = hard ? 8 : 6
  const words = rng.sample(VOCAB, nw)
  const codeSet = new Set<string>()
  while (codeSet.size < nw) codeSet.add(rng.pick(CONS) + rng.pick(VOW))
  const dict = new Map<string, string>()
  const codes = shuffled(rng, [...codeSet])
  words.forEach((w, i) => dict.set(w, codes[i]))
  const ns = hard ? 4 : 3
  const sentences: CodedSentence[] = []
  for (let i = 0; i < ns; i++) {
    const m = hard ? rng.pick([3, 3, 4]) : 3
    const ws = rng.sample(words, m)
    sentences.push({ words: ws, codes: shuffled(rng, ws.map((w) => dict.get(w) as string)) })
  }
  // every word must appear
  const seen = new Set(sentences.flatMap((s) => s.words))
  if (seen.size < nw) return null
  // sentences must be distinct sets
  const keys = sentences.map((s) => [...s.words].sort().join('|'))
  if (new Set(keys).size !== keys.length) return null
  const sols = allDictionaries(sentences)
  if (!sols.length) return null
  return { sentences, dict, sols }
}

export function generateSentenceCodingWithProof(rng: Rng, difficulty: MockDifficulty, count: number): WithProof<SentenceCodingProof> {
  const hard = difficulty === 'hard'
  const groups: Group[] = []
  const proofs: SentenceCodingProof[] = []
  for (const k of splitCount(count, 5)) {
    let result: { group: Group; proof: SentenceCodingProof } | null = null
    for (let attempt = 0; attempt < 2000 && !result; attempt++) {
      const st = buildStructure(rng, hard)
      if (!st) continue
      const { sentences, sols } = st
      const words = [...st.dict.keys()]
      const codeOf = (w: string) => sols[0].get(w) as string
      const det = words.filter((w) => sols.every((s) => s.get(w) === codeOf(w)))
      const undet = words.filter((w) => !det.includes(w))
      const minDet = hard ? 4 : 5
      if (det.length < minDet) continue
      if (hard && undet.length === 0 && rng.chance(0.7)) continue
      const allCodes = [...st.dict.values()]
      const feasible = (w: string) => new Set(sols.map((s) => s.get(w) as string))
      const qs: { q: QuestionDraft; p: SCQuestionProof }[] = []
      const used = new Set<string>()
      const mk = (kind: SCKind): { q: QuestionDraft; p: SCQuestionProof } | null => {
        if (kind === 'code') {
          const w = rng.pick(det)
          const c = codeOf(w)
          const wrong = rng.sample(allCodes.filter((x) => x !== c), 4)
          const { items, answer } = placeCorrect(rng, c, wrong)
          return {
            q: { topic: 'sentence-coding', stem: `What is the code for '${w}' in the given code language?`, options: items, answer, explanation: explainCode(sentences, w, c) },
            p: { kind, query: [w], options: items, answer },
          }
        }
        if (kind === 'word') {
          const w = rng.pick(det)
          const c = codeOf(w)
          const wrong = rng.sample(words.filter((x) => x !== w), 4)
          const { items, answer } = placeCorrect(rng, w, wrong)
          return {
            q: { topic: 'sentence-coding', stem: `What does the code '${c}' stand for in the given code language?`, options: items, answer, explanation: explainWord(sentences, w, c) },
            p: { kind, query: [c], options: items, answer },
          }
        }
        if (kind === 'phrase') {
          const n = hard && det.length >= 3 && rng.chance(0.5) ? 3 : 2
          const ws = rng.sample(det, n)
          const cs = ws.map(codeOf)
          const target = new Set(cs)
          const optSets: string[][] = []
          const keys = new Set<string>([[...cs].sort().join('|')])
          let guard = 0
          while (optSets.length < 4 && guard++ < 200) {
            const c2 = rng.shuffle(allCodes).slice(0, n)
            const key = [...c2].sort().join('|')
            if (keys.has(key)) continue
            // keep at least one code of the right pair so options look plausible
            if (c2.every((x) => !target.has(x)) && rng.chance(0.6)) continue
            keys.add(key)
            optSets.push(c2)
          }
          if (optSets.length < 4) return null
          const correctText = rng.shuffle(cs).join(' ')
          const { items, answer } = placeCorrect(rng, correctText, optSets.map((o) => o.join(' ')))
          return {
            q: { topic: 'sentence-coding', stem: `What is the code for '${ws.join(' ')}' in the given code language? (The order of the code words may vary.)`, options: items, answer, explanation: `${ws.map((w) => `'${w}' = '${codeOf(w)}'`).join(', ')}; so '${ws.join(' ')}' is coded as '${cs.join(' ')}' (in any order).` },
            p: { kind, query: ws, options: items, answer },
          }
        }
        // may
        if (!undet.length) return null
        const w = rng.pick(undet)
        const feas = feasible(w)
        const feasList = [...feas]
        const correct = rng.pick(feasList)
        const impossible = allCodes.filter((c) => !feas.has(c))
        if (impossible.length < 4) return null
        const wrong = rng.sample(impossible, 4)
        const { items, answer } = placeCorrect(rng, correct, wrong)
        return {
          q: { topic: 'sentence-coding', stem: `Which of the following may be the code for '${w}' in the given code language?`, options: items, answer, explanation: `The sentences do not fix the code of '${w}' uniquely; it can only be one of ${feasList.map((c) => `'${c}'`).join(' or ')}. The other codes belong to other words.` },
          p: { kind, query: [w], options: items, answer },
        }
      }
      const plan: SCKind[] = shuffled(rng, hard ? ['code', 'word', 'phrase', 'may', 'code'] : ['code', 'word', 'phrase', 'code', 'word'])
      if (hard && !undet.length) plan[plan.indexOf('may')] = 'phrase'
      let fail = false
      for (const kind of plan.slice(0, Math.max(k, 0))) {
        let r: ReturnType<typeof mk> = null
        for (let t = 0; t < 40 && !r; t++) {
          const c = mk(kind)
          if (c && !used.has(c.q.stem)) r = c
        }
        if (!r) {
          fail = true
          break
        }
        used.add(r.q.stem)
        qs.push(r)
      }
      if (fail) continue
      const stimParas = [
        'In a certain code language, the following sentences are coded as shown:',
        ...sentences.map((s) => `'${rng.shuffle(s.words).join(' ')}' is coded as '${s.codes.join(' ')}'`),
      ]
      result = {
        group: { stimulus: { directions: DIRECTIONS, parts: [{ kind: 'text', paragraphs: stimParas }] }, questions: qs.map((x) => x.q) },
        proof: { sentences, questions: qs.map((x) => x.p) },
      }
    }
    if (!result) throw new Error('sentence-coding: generation failed')
    groups.push(result.group)
    proofs.push(result.proof)
  }
  return { groups, proofs }
}
