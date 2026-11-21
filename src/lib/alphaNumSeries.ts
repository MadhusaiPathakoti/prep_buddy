import type { MCQQuestion } from './generators'
import { createRng, randomSeed, type Rng } from './mocks/rng'

/**
 * Alphanumeric Series (SBI / IBPS Prelims style): one arrangement of letters, digits and symbols, then five questions on it.
 *
 * Every element appears once, so "which element" always has exactly one answer. Each answer is computed from an explicit spec
 * (see `AlphaSpec`), never typed in, and `scripts/verify-alpha-series.ts` re-derives every answer a second way.
 */

export type AlphaDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'
export type AlphaQType = 'mixed' | 'count' | 'position' | 'between' | 'modified'

type Level = 'easy' | 'medium' | 'hard'

export type Cls = 'any' | 'letter' | 'vowel' | 'consonant' | 'digit' | 'even' | 'odd' | 'symbol'
type End = 'L' | 'R'

/** Which version of the series a question is asked about. */
export type View = { t: 'plain' } | { t: 'reversed' } | { t: 'drop'; cls: Cls }

/** A single element of the (viewed) series: the n-th element of a kind counted from one end, or a named element. */
export type Anchor = { t: 'rank'; cls: Cls; n: number; from: End } | { t: 'el'; ch: string }

export type AlphaSpec =
  | { k: 'count'; prev: Cls | null; cur: Cls; next: Cls | null }
  /** The j-th element to the left/right of the anchor (j = 0: the anchor itself). */
  | { k: 'nth'; view: View; anchor: Anchor; dir: End; j: number }
  | { k: 'between'; view: View; a: Anchor; b: Anchor; mode: 'count' | 'middle' }

export interface AlphaSet {
  series: string[]
  questions: { spec: AlphaSpec; options: string[]; answer: number; stem: string }[]
}

// ---------- the series ----------

const VOWELS = ['A', 'E', 'I', 'U'] // O is left out: it is too easily read as a zero
const CONSONANTS = 'BCDFGHJKLMNPQRSTVWXYZ'.split('')
const DIGITS = '23456789'.split('') // 0 and 1 are left out: they look like O and I
const SYMBOLS = ['@', '#', '$', '%', '&', '*', '^', '!', '©']

export function isCls(ch: string, c: Cls): boolean {
  const L = /^[A-Z]$/.test(ch)
  const D = /^[0-9]$/.test(ch)
  switch (c) {
    case 'any':
      return true
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

const NOUN: Record<Cls, [string, string]> = {
  any: ['element', 'elements'],
  letter: ['alphabet', 'alphabets'],
  vowel: ['vowel', 'vowels'],
  consonant: ['consonant', 'consonants'],
  digit: ['number', 'numbers'],
  even: ['even number', 'even numbers'],
  odd: ['odd number', 'odd numbers'],
  symbol: ['symbol', 'symbols'],
}
const noun = (c: Cls, plural = false) => NOUN[c][plural ? 1 : 0]
const art = (c: Cls) => (/^[aeiou]/.test(noun(c)) ? 'an' : 'a')

function ordinal(n: number): string {
  const m100 = n % 100
  if (m100 >= 11 && m100 <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

const LENGTH: Record<Level, [number, number]> = { easy: [14, 16], medium: [18, 22], hard: [26, 30] }

function makeSeries(rng: Rng, level: Level): string[] {
  const n = rng.int(...LENGTH[level])
  const nDigits = Math.min(DIGITS.length, rng.int(Math.round(n * 0.25), Math.round(n * 0.33)))
  const nSymbols = Math.min(SYMBOLS.length, rng.int(Math.round(n * 0.2), Math.round(n * 0.28)))
  const nLetters = n - nDigits - nSymbols
  const nVowels = rng.int(2, Math.min(4, Math.max(2, Math.round(nLetters * 0.3))))
  const letters = [...rng.sample(VOWELS, nVowels), ...rng.sample(CONSONANTS, nLetters - nVowels)]
  return rng.shuffle([...letters, ...rng.sample(DIGITS, nDigits), ...rng.sample(SYMBOLS, nSymbols)])
}

// ---------- the engine ----------

export function viewOf(series: string[], v: View): string[] {
  if (v.t === 'reversed') return series.slice().reverse()
  if (v.t === 'drop') return series.filter((ch) => !isCls(ch, v.cls))
  return series
}

/** Index of the anchor in `view`, or -1 when the series has no such element. */
export function anchorIndex(view: string[], a: Anchor): number {
  if (a.t === 'el') return view.indexOf(a.ch)
  const hits: number[] = []
  view.forEach((ch, i) => {
    if (isCls(ch, a.cls)) hits.push(i)
  })
  const at = a.from === 'L' ? a.n - 1 : hits.length - a.n
  return at >= 0 && at < hits.length ? hits[at] : -1
}

export function nthIndex(view: string[], s: { anchor: Anchor; dir: End; j: number }): number {
  const base = anchorIndex(view, s.anchor)
  if (base < 0) return -1
  const idx = s.dir === 'R' ? base + s.j : base - s.j
  return idx >= 0 && idx < view.length ? idx : -1
}

/** Indices of every element of kind `cur` that has the required neighbours. */
export function countMatches(series: string[], s: { prev: Cls | null; cur: Cls; next: Cls | null }): number[] {
  const out: number[] = []
  series.forEach((ch, i) => {
    if (!isCls(ch, s.cur)) return
    if (s.prev && (i === 0 || !isCls(series[i - 1], s.prev))) return
    if (s.next && (i === series.length - 1 || !isCls(series[i + 1], s.next))) return
    out.push(i)
  })
  return out
}

// ---------- wording ----------

function anchorText(a: Anchor): string {
  if (a.t === 'el') return a.ch
  return `the ${ordinal(a.n)} ${noun(a.cls)} from the ${a.from === 'L' ? 'left' : 'right'} end`
}

function viewPrefix(v: View): string {
  if (v.t === 'reversed') return 'If the series is reversed (written from right to left), '
  if (v.t === 'drop') return `If all the ${noun(v.cls, true)} are dropped from the series, `
  return ''
}

const lowerFirst = (s: string) => s[0].toLowerCase() + s.slice(1)

function sentence(view: View, body: string): string {
  const prefix = viewPrefix(view)
  return prefix ? `${prefix}${lowerFirst(body)}` : body
}

function stemOf(spec: AlphaSpec): string {
  if (spec.k === 'count') {
    const conds: string[] = []
    if (spec.next) conds.push(`immediately followed by ${art(spec.next)} ${noun(spec.next)}`)
    if (spec.prev) conds.push(`immediately preceded by ${art(spec.prev)} ${noun(spec.prev)}`)
    return `How many ${noun(spec.cur, true)} are there in the series which are ${conds.join(' and ')}?`
  }
  if (spec.k === 'nth') {
    const where = spec.dir === 'L' ? 'left' : 'right'
    const body =
      spec.j === 0
        ? `Which element is ${anchorText(spec.anchor)}?`
        : `Which element is the ${ordinal(spec.j)} to the ${where} of ${anchorText(spec.anchor)}?`
    return sentence(spec.view, body)
  }
  const both = `${anchorText(spec.a)} and ${anchorText(spec.b)}`
  const body = spec.mode === 'count' ? `How many elements are there between ${both}?` : `Which of the following elements is exactly between ${both}?`
  return sentence(spec.view, body)
}

// ---------- building one question ----------

interface Built {
  spec: AlphaSpec
  stem: string
  options: string[]
  answer: number
  explanation: string
  hint: string
}

const showSeries = (s: string[]) => s.join(' ')

/** Five options with the right one at a random place; wrong ones are the elements next to the right one (the usual slips) first. */
function elementOptions(rng: Rng, pool: string[], correctIdx: number, extraWrong: string[] = []): { options: string[]; answer: number } {
  const correct = pool[correctIdx]
  const near = [pool[correctIdx - 1], pool[correctIdx + 1], pool[correctIdx - 2], pool[correctIdx + 2], ...extraWrong].filter((x): x is string => x !== undefined && x !== correct)
  const wrong: string[] = []
  for (const x of rng.shuffle(near)) if (!wrong.includes(x) && wrong.length < 2) wrong.push(x)
  for (const x of rng.shuffle(pool)) if (x !== correct && !wrong.includes(x) && wrong.length < 4) wrong.push(x)
  if (wrong.length < 4) return { options: [], answer: -1 }
  const answer = rng.int(0, 4)
  const options = wrong.slice(0, 4)
  options.splice(answer, 0, correct)
  return { options, answer }
}

function numberOptions(rng: Rng, correct: number, lo: number, hi: number): { options: string[]; answer: number } {
  const labels = (n: number) => (n === 0 ? 'None' : String(n))
  const pool: number[] = []
  for (let v = lo; v <= hi; v++) if (v !== correct) pool.push(v)
  if (pool.length < 4) return { options: [], answer: -1 }
  const near = pool.slice().sort((a, b) => Math.abs(a - correct) - Math.abs(b - correct) || rng.next() - 0.5)
  const nums = [...near.slice(0, 4), correct].sort((a, b) => a - b)
  return { options: nums.map(labels), answer: nums.indexOf(correct) }
}

const posFromLeft = (idx: number) => `position ${idx + 1} from the left`

function viewLine(series: string[], view: View): string {
  if (view.t === 'plain') return `Series: ${showSeries(series)}`
  const label = view.t === 'reversed' ? 'Reversed series' : `Series without ${noun(view.cls, true)}`
  return `Series: ${showSeries(series)}\n${label}: ${showSeries(viewOf(series, view))}`
}

function anchorWork(view: string[], a: Anchor, idx: number): string {
  if (a.t === 'el') return `${a.ch} is at ${posFromLeft(idx)}`
  const what = `${ordinal(a.n)} ${noun(a.cls)} from the ${a.from === 'L' ? 'left' : 'right'} end`
  return `the ${what} is ${view[idx]} (${posFromLeft(idx)})`
}

function buildNth(rng: Rng, series: string[], view: View, anchor: Anchor, dir: End, j: number): Built | null {
  const v = viewOf(series, view)
  if (v.length < 8) return null
  const base = anchorIndex(v, anchor)
  const idx = nthIndex(v, { anchor, dir, j })
  if (base < 0 || idx < 0) return null
  const spec: AlphaSpec = { k: 'nth', view, anchor, dir, j }
  // a tempting wrong answer: the same count taken the other way round
  const other = nthIndex(v, { anchor, dir: dir === 'L' ? 'R' : 'L', j })
  const extra = other >= 0 ? [v[other]] : []
  const o = elementOptions(rng, v, idx, extra)
  if (o.answer < 0) return null
  const step =
    j === 0
      ? `So the answer is ${v[idx]}.`
      : `Moving ${j} to the ${dir === 'L' ? 'left' : 'right'}: position ${base + 1} ${dir === 'L' ? '−' : '+'} ${j} = position ${idx + 1}, which is ${v[idx]}.`
  return {
    spec,
    stem: stemOf(spec),
    ...o,
    explanation: `${viewLine(series, view)}\nIn it, ${anchorWork(v, anchor, base)}. ${step}`,
    hint:
      view.t === 'plain'
        ? 'Find the starting element first, then count steps one way from it — "to the left" means towards the left end.'
        : 'Write out the new series first, then count positions in that one — not in the original.',
  }
}

function buildBetween(rng: Rng, series: string[], view: View, a: Anchor, b: Anchor, mode: 'count' | 'middle'): Built | null {
  const v = viewOf(series, view)
  const ia = anchorIndex(v, a)
  const ib = anchorIndex(v, b)
  if (ia < 0 || ib < 0 || ia === ib) return null
  const lo = Math.min(ia, ib)
  const hi = Math.max(ia, ib)
  const gap = hi - lo - 1
  const spec: AlphaSpec = { k: 'between', view, a, b, mode }
  const where = `${anchorWork(v, a, ia)}; ${anchorWork(v, b, ib)}.`
  if (mode === 'count') {
    if (gap < 1 || gap > 12) return null
    const o = numberOptions(rng, gap, Math.max(0, gap - 4), gap + 4)
    if (o.answer < 0) return null
    return {
      spec,
      stem: stemOf(spec),
      ...o,
      explanation: `${viewLine(series, view)}\nIn it, ${where} Elements between them: ${v.slice(lo + 1, hi).join(' ')} → ${gap}.`,
      hint: 'Between two elements, the count is the difference of their positions minus 1.',
    }
  }
  if (gap < 1 || gap % 2 === 0) return null // an exact middle element needs an odd number of elements between
  const mid = (lo + hi) / 2
  const o = elementOptions(rng, v, mid)
  if (o.answer < 0) return null
  return {
    spec,
    stem: stemOf(spec),
    ...o,
    explanation: `${viewLine(series, view)}\nIn it, ${where} The element exactly between them is at position (${lo + 1} + ${hi + 1}) ÷ 2 = ${mid + 1}, which is ${v[mid]}.`,
    hint: 'Add the two positions (counted from the same end) and halve the total.',
  }
}

function buildCount(rng: Rng, series: string[], cur: Cls, prev: Cls | null, next: Cls | null): Built | null {
  if (!prev && !next) return null
  const spec: AlphaSpec = { k: 'count', prev, cur, next }
  const m = countMatches(series, spec)
  if (m.length > 5) return null
  const o = numberOptions(rng, m.length, 0, 6)
  if (o.answer < 0) return null
  const shown = m.length ? m.map((i) => `${series[i - 1] ?? ''} ${series[i]} ${series[i + 1] ?? ''}`.trim()).join(';  ') : 'none'
  return {
    spec,
    stem: stemOf(spec),
    ...o,
    explanation: `Series: ${showSeries(series)}\nMatching ${noun(cur, true)} (shown with their neighbours): ${shown}. So the count is ${m.length === 0 ? 'None (0)' : m.length}.`,
    hint: 'Check every element of that kind and look at both of its neighbours — a match needs all the conditions together.',
  }
}

// ---------- choosing what to ask ----------

const CLASSES: Cls[] = ['letter', 'vowel', 'consonant', 'digit', 'even', 'odd', 'symbol']
const BIG_CLASSES: Cls[] = ['letter', 'consonant', 'digit', 'symbol'] // plentiful enough to count to the 3rd/4th/5th
const DROPPABLE: Cls[] = ['digit', 'symbol', 'vowel', 'even', 'odd']

type Kind = 'count' | 'nth' | 'nthClass' | 'nthEl' | 'between' | 'middle' | 'dropNth' | 'reverseNth' | 'dropBetween'

function tryKind(rng: Rng, kind: Kind, series: string[], level: Level): Built | null {
  const n = series.length
  const hard = level === 'hard'
  const easy = level === 'easy'
  const end = (): End => rng.pick<End>(['L', 'R'])
  const jMax = easy ? 4 : hard ? 11 : 7
  const anyRank = (len: number): Anchor => ({ t: 'rank', cls: 'any', n: rng.int(3, Math.max(3, len - 3)), from: end() })
  const classRank = (pool: Cls[]): Anchor => {
    const cls = rng.pick(pool)
    const have = series.filter((ch) => isCls(ch, cls)).length
    return { t: 'rank', cls, n: rng.int(1, Math.min(have, hard ? 6 : 4)), from: end() }
  }
  switch (kind) {
    case 'count': {
      const cur = rng.pick(CLASSES)
      const twoSided = !easy && rng.chance(hard ? 1 : 0.55)
      const prev = twoSided || rng.chance(0.5) ? rng.pick(CLASSES) : null
      const next = twoSided || !prev ? rng.pick(CLASSES) : null
      const b = buildCount(rng, series, cur, prev, next)
      // a "None" answer is allowed now and then, never as the usual case
      return b && (b.options[b.answer] !== 'None' || rng.chance(0.15)) ? b : null
    }
    case 'nth':
      return buildNth(rng, series, { t: 'plain' }, anyRank(n), end(), rng.int(2, jMax))
    case 'nthEl':
      return buildNth(rng, series, { t: 'plain' }, { t: 'el', ch: rng.pick(series) }, end(), rng.int(2, jMax))
    case 'nthClass':
      return buildNth(rng, series, { t: 'plain' }, classRank(BIG_CLASSES), end(), rng.int(0, jMax) || 2)
    case 'between':
      return buildBetween(rng, series, { t: 'plain' }, easy ? { t: 'el', ch: rng.pick(series) } : classRank(BIG_CLASSES), easy ? { t: 'el', ch: rng.pick(series) } : classRank(BIG_CLASSES), 'count')
    case 'middle':
      return buildBetween(rng, series, { t: 'plain' }, classRank(BIG_CLASSES), classRank(BIG_CLASSES), 'middle')
    case 'dropNth': {
      const cls = rng.pick(DROPPABLE)
      const view: View = { t: 'drop', cls }
      const len = viewOf(series, view).length
      return buildNth(rng, series, view, anyRank(len), end(), rng.int(2, jMax))
    }
    case 'reverseNth':
      return buildNth(rng, series, { t: 'reversed' }, anyRank(n), end(), rng.int(2, jMax))
    case 'dropBetween': {
      const view: View = { t: 'drop', cls: rng.pick(DROPPABLE) }
      return buildBetween(rng, series, view, anyRank(viewOf(series, view).length), anyRank(viewOf(series, view).length), rng.pick(['count', 'middle'] as const))
    }
  }
}

/** The five kinds of question a set is made of. */
function plan(rng: Rng, level: Level, type: AlphaQType): Kind[] {
  const positional: Kind[] = level === 'easy' ? ['nth', 'nthEl'] : ['nth', 'nthClass', 'nthEl']
  const betweens: Kind[] = level === 'easy' ? ['between'] : ['between', 'middle']
  const modified: Kind[] = level === 'easy' ? ['dropNth'] : level === 'medium' ? ['dropNth', 'reverseNth'] : ['dropNth', 'reverseNth', 'dropBetween']
  const pickN = (pool: Kind[], n: number) => Array.from({ length: n }, () => rng.pick(pool))
  switch (type) {
    case 'count':
      return pickN(['count'], 5)
    case 'position':
      return pickN(positional, 5)
    case 'between':
      return pickN(betweens, 5)
    case 'modified':
      return pickN(modified, 5)
    case 'mixed':
      return rng.shuffle<Kind>(['count', 'count', rng.pick(positional), rng.pick([...positional, ...betweens]), rng.pick(level === 'easy' ? [...betweens, ...modified] : [...modified, ...betweens])])
  }
}

interface BuiltSet {
  series: string[]
  built: Built[]
}

function buildSet(rng: Rng, level: Level, type: AlphaQType, size: number): BuiltSet {
  for (let attempt = 0; attempt < 4000; attempt++) {
    const series = makeSeries(rng, level)
    const kinds = plan(rng, level, type).slice(0, size)
    const built: Built[] = []
    const stems = new Set<string>()
    let ok = true
    for (const kind of kinds) {
      let got: Built | null = null
      for (let t = 0; t < 150 && !got; t++) {
        const b = tryKind(rng, kind, series, level)
        if (b && !stems.has(b.stem)) got = b
      }
      if (!got) {
        ok = false
        break
      }
      stems.add(got.stem)
      built.push(got)
    }
    if (ok) return { series, built }
  }
  throw new Error('alphanumeric series: generation failed')
}

const SET_SIZE = 5

/** Sets of five questions, each set on its own series. Also the entry point for the verifier. */
export function generateAlphaSets(difficulty: AlphaDifficulty, type: AlphaQType, count: number, rng: Rng = createRng(randomSeed())): (AlphaSet & { explanations: string[]; hints: string[] })[] {
  const sets: (AlphaSet & { explanations: string[]; hints: string[] })[] = []
  for (let made = 0; made < count; made += SET_SIZE) {
    const level: Level = difficulty === 'mixed' ? (['easy', 'medium', 'hard'] as Level[])[sets.length % 3] : difficulty
    const { series, built } = buildSet(rng, level, type, Math.min(SET_SIZE, count - made))
    sets.push({
      series,
      questions: built.map((b) => ({ spec: b.spec, options: b.options, answer: b.answer, stem: b.stem })),
      explanations: built.map((b) => b.explanation),
      hints: built.map((b) => b.hint),
    })
  }
  return sets
}

export function generateAlphaSeriesQuestions(difficulty: AlphaDifficulty, type: AlphaQType, count: number): MCQQuestion[] {
  const run = randomSeed().toString(36)
  const out: MCQQuestion[] = []
  generateAlphaSets(difficulty, type, count).forEach((set, si) => {
    set.questions.forEach((q, qi) => {
      out.push({
        id: `alpha-${run}-${si}-${qi}`,
        instruction: `Series · question ${qi + 1} of ${set.questions.length}`,
        context: showSeries(set.series),
        contextBig: true,
        term: q.stem,
        termSmall: true,
        correctMeaning: q.options[q.answer],
        options: q.options,
        hint: set.hints[qi],
        explanation: set.explanations[qi],
        noPronounce: true,
      })
    })
  })
  return out
}
