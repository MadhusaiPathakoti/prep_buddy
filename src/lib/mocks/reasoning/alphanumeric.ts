// Alphanumeric series: one shared series of distinct letters/digits/symbols and 5 questions computed from explicit specs.
import type { Rng } from '../rng'
import type { Group, MockDifficulty, QuestionDraft } from '../types'
import { ordinalNum, placeCorrect, splitCount, type WithProof } from './common'

export type Cls = 'letter' | 'vowel' | 'consonant' | 'digit' | 'even' | 'odd' | 'symbol'
export type ASpec =
  | { k: 'pattern'; prev: Cls | null; cur: Cls; next: Cls | null }
  | { k: 'nth'; from: 'L' | 'R'; i: number; dir: 'L' | 'R'; j: number; rev: boolean }
  | { k: 'between'; a: string; b: string }
  | { k: 'mid'; a: string; b: string }

export interface AlphaProof {
  series: string[]
  questions: { spec: ASpec; options: string[]; answer: number }[]
}

const SYMBOLS = ['@', '#', '$', '%', '&', '*', '©']
const COUNT_LABELS = ['None', 'One', 'Two', 'Three', 'More than three']

export function isCls(ch: string, c: Cls): boolean {
  const L = /^[A-Z]$/.test(ch)
  const D = /^[0-9]$/.test(ch)
  switch (c) {
    case 'letter':
      return L
    case 'vowel':
      return L && 'AEIOU'.includes(ch)
    case 'consonant':
      return L && !'AEIOU'.includes(ch)
    case 'digit':
      return D
    case 'even':
      return D && Number(ch) % 2 === 0
    case 'odd':
      return D && Number(ch) % 2 === 1
    case 'symbol':
      return !L && !D
  }
}

const noun = (c: Cls, plural: boolean): string => {
  const base: Record<Cls, [string, string]> = {
    letter: ['letter', 'letters'],
    vowel: ['vowel', 'vowels'],
    consonant: ['consonant', 'consonants'],
    digit: ['number', 'numbers'],
    even: ['even number', 'even numbers'],
    odd: ['odd number', 'odd numbers'],
    symbol: ['symbol', 'symbols'],
  }
  return base[c][plural ? 1 : 0]
}
const art = (c: Cls) => (c === 'even' || c === 'odd' ? 'an' : 'a')

export function patternMatches(series: string[], s: { prev: Cls | null; cur: Cls; next: Cls | null }): number[] {
  const out: number[] = []
  for (let i = 0; i < series.length; i++) {
    if (!isCls(series[i], s.cur)) continue
    if (s.prev) {
      if (i === 0 || !isCls(series[i - 1], s.prev)) continue
    }
    if (s.next) {
      if (i === series.length - 1 || !isCls(series[i + 1], s.next)) continue
    }
    out.push(i)
  }
  return out
}

export function nthIndex(n: number, s: { from: 'L' | 'R'; i: number; dir: 'L' | 'R'; j: number }): number {
  const base = s.from === 'L' ? s.i - 1 : n - s.i
  return s.dir === 'R' ? base + s.j : base - s.j
}

function makeSeries(rng: Rng, n: number): string[] {
  const nl = rng.int(Math.round(n * 0.4), Math.round(n * 0.5))
  const nd = rng.int(Math.round(n * 0.3), Math.round(n * 0.4))
  const ns = n - nl - nd
  const letters = rng.sample('ABCDEFGHJKLMNPQRSTUVWXYZ'.split('').filter((c) => !'AEIOU'.includes(c)), nl - 2).concat(rng.sample(['A', 'E', 'I', 'O', 'U'], 2))
  const digits = rng.sample('123456789'.split(''), Math.min(nd, 9))
  const syms = rng.sample(SYMBOLS, Math.min(ns, SYMBOLS.length))
  return rng.shuffle([...letters, ...digits, ...syms])
}

function clsList(): Cls[] {
  return ['letter', 'vowel', 'consonant', 'digit', 'even', 'odd', 'symbol']
}

function countOptions(count: number): { options: string[]; answer: number } {
  return { options: COUNT_LABELS.slice(), answer: Math.min(count, 4) }
}

function patternStem(s: { prev: Cls | null; cur: Cls; next: Cls | null }): string {
  const conds: string[] = []
  if (s.prev) conds.push(`immediately preceded by ${art(s.prev)} ${noun(s.prev, false)}`)
  if (s.next) conds.push(`immediately followed by ${art(s.next)} ${noun(s.next, false)}`)
  if (conds.length === 2) return `How many such ${noun(s.cur, true)} are there in the above arrangement, each of which is ${conds[0]} and ${conds[1]}?`
  return `How many ${noun(s.cur, true)} are there in the above arrangement which are ${conds[0]}?`
}

function nthStem(s: { from: 'L' | 'R'; i: number; dir: 'L' | 'R'; j: number; rev: boolean }): string {
  const end = s.from === 'L' ? 'left' : 'right'
  const dir = s.dir === 'L' ? 'left' : 'right'
  const body = `which element is the ${ordinalNum(s.j)} to the ${dir} of the ${ordinalNum(s.i)} element from the ${end} end`
  return s.rev ? `If the series is reversed (written from right to left), ${body} of the new series?` : `In the above series, ${body}?`
}

export function generateAlphanumericWithProof(rng: Rng, difficulty: MockDifficulty, count: number): WithProof<AlphaProof> {
  const hard = difficulty === 'hard'
  const groups: Group[] = []
  const proofs: AlphaProof[] = []
  for (const k of splitCount(count, 5)) {
    let done = false
    for (let attempt = 0; attempt < 3000 && !done; attempt++) {
      const n = hard ? rng.int(18, 20) : rng.int(16, 18)
      const series = makeSeries(rng, n)
      if (series.length !== n) continue
      const qs: { q: QuestionDraft; spec: ASpec; options: string[]; answer: number }[] = []
      const stems = new Set<string>()
      const add = (spec: ASpec, stem: string, options: string[], answer: number, expl: string): boolean => {
        if (stems.has(stem)) return false
        stems.add(stem)
        qs.push({ q: { topic: 'alphanumeric-series', stem, options, answer, explanation: expl }, spec, options, answer })
        return true
      }
      const shown = series.join(' ')
      const kinds: ('pattern' | 'nth' | 'between' | 'mid')[] = rng.shuffle(['pattern', 'pattern', 'nth', 'nth', rng.pick(['between', 'mid'])])
      let ok = true
      for (const kind of kinds.slice(0, k)) {
        let placed = false
        for (let t = 0; t < 200 && !placed; t++) {
          if (kind === 'pattern') {
            const cur = rng.pick(clsList())
            const both = hard ? true : rng.chance(0.55)
            const prev = both || rng.chance(0.5) ? rng.pick(clsList()) : null
            const next = both || !prev ? rng.pick(clsList()) : null
            if (!prev && !next) continue
            const spec = { prev, cur, next }
            const m = patternMatches(series, spec)
            if (m.length === 0 && !rng.chance(0.04)) continue
            if (m.length > 4) continue
            const co = countOptions(m.length)
            const matches = m.length ? m.map((i) => `${series[i - 1] ?? ''} ${series[i]} ${series[i + 1] ?? ''}`.trim()).join('; ') : 'none'
            placed = add({ k: 'pattern', ...spec }, patternStem(spec), co.options, co.answer, `Series: ${shown}. Matching ${noun(cur, true)} (shown with neighbours): ${matches}. Count = ${m.length}.`)
          } else if (kind === 'nth') {
            const rev = hard && rng.chance(0.4)
            const from = rng.pick<'L' | 'R'>(['L', 'R'])
            const dir = rng.pick<'L' | 'R'>(['L', 'R'])
            const i = rng.int(3, n - 3)
            const j = rng.int(2, 6)
            const idx = nthIndex(n, { from, i, dir, j })
            if (idx < 0 || idx >= n) continue
            const eff = rev ? series.slice().reverse() : series
            const ans = eff[idx]
            const others = rng.sample(series.filter((x) => x !== ans), 4)
            const p = placeCorrect(rng, ans, others)
            const spec: ASpec = { k: 'nth', from, i, dir, j, rev }
            placed = add(spec, nthStem(spec), p.items, p.answer, `${rev ? 'Reversed series' : 'Series'}: ${eff.join(' ')}. The ${ordinalNum(i)} element from the ${from === 'L' ? 'left' : 'right'} end is ${eff[from === 'L' ? i - 1 : n - i]}; the ${ordinalNum(j)} to its ${dir === 'L' ? 'left' : 'right'} is ${ans}.`)
          } else if (kind === 'between') {
            const [a, b] = rng.sample(series, 2)
            const ia = series.indexOf(a)
            const ib = series.indexOf(b)
            const between = Math.abs(ia - ib) - 1
            if (between < 1 || between > 8) continue
            const wrong = rng.sample([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((v) => v !== between && v >= 0), 4).map(String)
            const p = placeCorrect(rng, String(between), wrong)
            const spec: ASpec = { k: 'between', a, b }
            placed = add(spec, `How many elements are there between ${a} and ${b} in the above series?`, p.items, p.answer, `Series: ${shown}. Elements between ${a} and ${b}: ${series.slice(Math.min(ia, ib) + 1, Math.max(ia, ib)).join(' ')} (${between}).`)
          } else {
            const [a, b] = rng.sample(series, 2)
            const ia = series.indexOf(a)
            const ib = series.indexOf(b)
            if (Math.abs(ia - ib) % 2 !== 0 || Math.abs(ia - ib) < 2) continue
            const mid = series[(ia + ib) / 2]
            const others = rng.sample(series.filter((x) => x !== mid), 4)
            const p = placeCorrect(rng, mid, others)
            const spec: ASpec = { k: 'mid', a, b }
            placed = add(spec, `Which element is exactly in the middle of ${a} and ${b} in the above series?`, p.items, p.answer, `Series: ${shown}. The middle element between ${a} and ${b} is ${mid}.`)
          }
        }
        if (!placed) {
          ok = false
          break
        }
      }
      if (!ok) continue
      groups.push({
        stimulus: { directions: 'Study the following arrangement carefully and answer the questions given below:', parts: [{ kind: 'text', paragraphs: [shown] }] },
        questions: qs.map((x) => x.q),
      })
      proofs.push({ series, questions: qs.map((x) => ({ spec: x.spec, options: x.options, answer: x.answer })) })
      done = true
    }
    if (!done) throw new Error('alphanumeric-series: generation failed')
  }
  return { groups, proofs }
}

