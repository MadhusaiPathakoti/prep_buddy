import type { MCQQuestion } from './generators'
import { createRng, randomSeed, type Rng } from './mocks/rng'

/**
 * Number Arrangement (SBI / IBPS Prelims style): five three-digit numbers, then five questions on them.
 *
 *  - position:  Nth lowest/highest, the number next to it in the sequence, a digit of it, how many numbers lie between two
 *  - count:     how many numbers have a digit property, or satisfy a test after a number is added/subtracted
 *  - modified:  digits rearranged in every number (swap, reverse, sort), then rank or count the new numbers
 *  - calc:      sum/difference of digits or of ranked numbers
 *
 * Numbers never have 0 as first or last digit (so rearranging never leaves a leading zero) and are all different.
 * Every answer is computed from an explicit spec; `scripts/verify-number-arrangement.ts` re-derives each from the question text.
 */

export type NumDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'
export type NumQType = 'mixed' | 'position' | 'count' | 'modified' | 'calc'
type Level = 'easy' | 'medium' | 'hard'

type Dir = 'lowest' | 'highest'
interface Rank {
  n: number
  dir: Dir
}
type DigitOp = 'swap13' | 'swap12' | 'swap23' | 'reverse' | 'asc' | 'desc'
type Prop = { t: 'div'; d: number } | { t: 'even' } | { t: 'odd' } | { t: 'gt'; v: number } | { t: 'lt'; v: number }
type Cond =
  | { t: 'diff13'; cmp: 'less' | 'more' | 'equal'; v: number }
  | { t: 'sumParity'; parity: 'even' | 'odd' }
  | { t: 'sumCmp'; cmp: 'more' | 'less'; v: number }
  | { t: 'mid'; rel: 'greater' | 'smaller' }
type Term = { rank: Rank; pos: 0 | 1 | 2 }

export type NumSpec =
  | { k: 'rank'; rank: Rank }
  | { k: 'nbr'; rank: Rank; side: 'L' | 'R' }
  | { k: 'digit'; rank: Rank; pos: 0 | 1 | 2 }
  | { k: 'between'; a: number; b: number }
  | { k: 'cond'; cond: Cond }
  | { k: 'opCount'; delta: number; prop: Prop }
  | { k: 'opRank'; op: DigitOp; rank: Rank }
  | { k: 'opCount2'; op: DigitOp; prop: Prop }
  | { k: 'calc'; a: Term; b: Term; sign: '+' | '-' }
  | { k: 'diffNum'; a: Rank; b: Rank }

// ---------- number helpers ----------

const digitsOf = (n: number): number[] => [Math.floor(n / 100), Math.floor(n / 10) % 10, n % 10]
const fromDigits = (d: number[]) => d[0] * 100 + d[1] * 10 + d[2]
const ascending = (nums: number[]) => nums.slice().sort((a, b) => a - b)

export function applyOp(n: number, op: DigitOp): number {
  const d = digitsOf(n)
  switch (op) {
    case 'swap13':
      return fromDigits([d[2], d[1], d[0]])
    case 'swap12':
      return fromDigits([d[1], d[0], d[2]])
    case 'swap23':
      return fromDigits([d[0], d[2], d[1]])
    case 'reverse':
      return fromDigits(d.slice().reverse())
    case 'asc':
      return fromDigits(d.slice().sort((a, b) => a - b))
    case 'desc':
      return fromDigits(d.slice().sort((a, b) => b - a))
  }
}

export function rankedNumber(nums: number[], r: Rank): number {
  const asc = ascending(nums)
  return r.dir === 'lowest' ? asc[r.n - 1] : asc[asc.length - r.n]
}

export function holds(n: number, p: Prop): boolean {
  switch (p.t) {
    case 'div':
      return n % p.d === 0
    case 'even':
      return n % 2 === 0
    case 'odd':
      return n % 2 === 1
    case 'gt':
      return n > p.v
    case 'lt':
      return n < p.v
  }
}

function condHolds(n: number, c: Cond): boolean {
  const [a, b, d] = digitsOf(n)
  switch (c.t) {
    case 'diff13': {
      const diff = Math.abs(a - d)
      return c.cmp === 'less' ? diff < c.v : c.cmp === 'more' ? diff > c.v : diff === c.v
    }
    case 'sumParity':
      return (a + b + d) % 2 === (c.parity === 'even' ? 0 : 1)
    case 'sumCmp':
      return c.cmp === 'more' ? a + b + d > c.v : a + b + d < c.v
    case 'mid':
      return c.rel === 'greater' ? b > a && b > d : b < a && b < d
  }
}

// ---------- wording ----------

const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth']
const POS = ['first', 'second', 'third']
const rankPhrase = (r: Rank) => (r.n === 1 ? r.dir : `${ORD[r.n]} ${r.dir}`)

const OP_TEXT: Record<DigitOp, string> = {
  swap13: 'the first and third digits of each number are interchanged',
  swap12: 'the first and second digits of each number are interchanged',
  swap23: 'the second and third digits of each number are interchanged',
  reverse: 'each number is reversed (its digits are written in the opposite order)',
  asc: 'the digits of each number are arranged in ascending order from left to right',
  desc: 'the digits of each number are arranged in descending order from left to right',
}

const propText = (p: Prop): string => {
  switch (p.t) {
    case 'div':
      return `divisible by ${p.d}`
    case 'even':
      return 'even'
    case 'odd':
      return 'odd'
    case 'gt':
      return `greater than ${p.v}`
    case 'lt':
      return `less than ${p.v}`
  }
}

const termText = (t: Term) => `the ${POS[t.pos]} digit of the ${rankPhrase(t.rank)} number`

function stemOf(s: NumSpec): string {
  switch (s.k) {
    case 'rank':
      return `Which is the ${rankPhrase(s.rank)} number in the sequence?`
    case 'nbr':
      return `Which of the following numbers is to the immediate ${s.side === 'R' ? 'right' : 'left'} of the ${rankPhrase(s.rank)} number in the sequence?`
    case 'digit':
      return `Which is the ${POS[s.pos]} digit of the ${rankPhrase(s.rank)} number in the sequence?`
    case 'between':
      return `How many numbers are there between ${s.a} and ${s.b} when the numbers are arranged in ascending order?`
    case 'cond': {
      const c = s.cond
      if (c.t === 'diff13') return `In how many numbers is the difference between the first and third digits ${c.cmp === 'equal' ? 'equal to' : c.cmp === 'less' ? 'less than' : 'more than'} ${c.v}?`
      if (c.t === 'sumParity') return `In how many numbers is the sum of all three digits ${c.parity}?`
      if (c.t === 'sumCmp') return `In how many numbers is the sum of all three digits ${c.cmp === 'more' ? 'more than' : 'less than'} ${c.v}?`
      return `In how many numbers is the middle digit ${c.rel} than both the first and third digits?`
    }
    case 'opCount':
      return `If ${Math.abs(s.delta)} is ${s.delta > 0 ? 'added to' : 'subtracted from'} each number, how many numbers will be ${propText(s.prop)}?`
    case 'opRank':
      return `If ${OP_TEXT[s.op]}, which of the following will be the ${rankPhrase(s.rank)} number?`
    case 'opCount2':
      return `If ${OP_TEXT[s.op]}, how many of the new numbers will be ${propText(s.prop)}?`
    case 'calc':
      return `What is the ${s.sign === '+' ? 'sum of' : 'difference between'} ${termText(s.a)} and ${termText(s.b)}?`
    case 'diffNum':
      return `What is the difference between the ${rankPhrase(s.a)} number and the ${rankPhrase(s.b)} number?`
  }
}

// ---------- options ----------

const COUNT_LABELS = ['None', 'One', 'Two', 'Three', 'More than three']
const BETWEEN_LABELS = ['None', 'One', 'Two', 'Three', 'Four']

interface Opts {
  options: string[]
  answer: number
}
const NONE: Opts = { options: [], answer: -1 }

function countOpts(c: number): Opts {
  return { options: COUNT_LABELS.slice(), answer: Math.min(c, 4) }
}

/** The correct number plus four others from `pool`, in random order. */
function pickOpts(rng: Rng, correct: number, pool: number[]): Opts {
  const wrong = [...new Set(pool)].filter((x) => x !== correct)
  if (wrong.length < 4) return NONE
  const four = rng.shuffle(wrong).slice(0, 4)
  const answer = rng.int(0, 4)
  const options = four.map(String)
  options.splice(answer, 0, String(correct))
  return { options, answer }
}

/** Numeric answer with near-miss distractors, shown in ascending order. */
function nearOpts(rng: Rng, correct: number, steps: number[]): Opts {
  const pool = [...new Set(steps.flatMap((d) => [correct + d, correct - d]))].filter((x) => x >= 0 && x !== correct)
  if (pool.length < 4) return NONE
  const nums = [...rng.shuffle(pool).slice(0, 4), correct].sort((a, b) => a - b)
  return { options: nums.map(String), answer: nums.indexOf(correct) }
}

// ---------- building one question ----------

interface Built {
  spec: NumSpec
  stem: string
  options: string[]
  answer: number
  explanation: string
  hint: string
}

const showNums = (n: number[]) => n.join(' ')
const ascLine = (nums: number[]) => `Ascending order: ${ascending(nums).join(' < ')}`
const tick = (ok: boolean) => (ok ? '✓' : '✗')

function build(spec: NumSpec, o: Opts, explanation: string, hint: string): Built | null {
  return o.answer < 0 ? null : { spec, stem: stemOf(spec), ...o, explanation, hint }
}

const HINT_RANK = 'Write the five numbers in ascending order first. The Nth highest is the (6 − N)th lowest, and the third is the middle one either way.'

function buildRank(rng: Rng, nums: number[], rank: Rank): Built | null {
  const ans = rankedNumber(nums, rank)
  return build({ k: 'rank', rank }, pickOpts(rng, ans, nums), `${ascLine(nums)}. The ${rankPhrase(rank)} number is ${ans}.`, HINT_RANK)
}

function buildNbr(rng: Rng, nums: number[], rank: Rank, side: 'L' | 'R'): Built | null {
  const anchor = rankedNumber(nums, rank)
  const at = nums.indexOf(anchor) + (side === 'R' ? 1 : -1)
  if (at < 0 || at >= nums.length) return null
  return build(
    { k: 'nbr', rank, side },
    pickOpts(rng, nums[at], nums),
    `${ascLine(nums)}. The ${rankPhrase(rank)} number is ${anchor}. In the sequence ${showNums(nums)}, the number immediately to its ${side === 'R' ? 'right' : 'left'} is ${nums[at]}.`,
    '"Immediate right/left" means beside it in the sequence as given, not in the sorted order. Find the ranked number first, then look at its neighbour.',
  )
}

function buildDigit(rng: Rng, nums: number[], rank: Rank, pos: 0 | 1 | 2): Built | null {
  const n = rankedNumber(nums, rank)
  const ans = digitsOf(n)[pos]
  const pool = [...nums.map((x) => digitsOf(x)[pos]), ...digitsOf(n)]
  while (new Set(pool.filter((d) => d !== ans)).size < 4) pool.push(rng.int(0, 9))
  return build(
    { k: 'digit', rank, pos },
    pickOpts(rng, ans, pool),
    `${ascLine(nums)}. The ${rankPhrase(rank)} number is ${n}; its ${POS[pos]} digit is ${ans}.`,
    'Find which number is meant first, then read the digit from the left (first = hundreds).',
  )
}

function buildBetween(nums: number[], a: number, b: number): Built | null {
  const asc = ascending(nums)
  const ia = asc.indexOf(a)
  const ib = asc.indexOf(b)
  if (ia < 0 || ib < 0 || ia === ib) return null
  const gap = Math.abs(ia - ib) - 1
  return build(
    { k: 'between', a, b },
    { options: BETWEEN_LABELS.slice(), answer: gap },
    `${ascLine(nums)}. ${a} is ${ORD[ia + 1]} and ${b} is ${ORD[ib + 1]}, so ${gap === 0 ? 'no number' : gap === 1 ? 'one number' : `${gap} numbers`} lie between them.`,
    'Sort the numbers, then count the places between the two — the difference of their places minus 1.',
  )
}

function buildCond(rng: Rng, nums: number[], cond: Cond): Built | null {
  const hit = nums.map((n) => condHolds(n, cond))
  const c = hit.filter(Boolean).length
  if (c === 0 && !rng.chance(0.15)) return null
  const work = nums
    .map((n) => {
      const [a, b, d] = digitsOf(n)
      const val = cond.t === 'diff13' ? `|${a} − ${d}| = ${Math.abs(a - d)}` : cond.t === 'mid' ? `middle ${b} vs ${a} and ${d}` : `${a} + ${b} + ${d} = ${a + b + d}`
      return `${n}: ${val} ${tick(hit[nums.indexOf(n)])}`
    })
    .join(';  ')
  return build(
    { k: 'cond', cond },
    countOpts(c),
    `${work}. Count = ${c}.`,
    cond.t === 'diff13' ? 'Take the difference between the first and third digits as a positive number, number by number, and tick the ones that qualify.' : 'Check every number against the digit rule and tick the ones that qualify.',
  )
}

function buildOpCount(rng: Rng, nums: number[], delta: number, prop: Prop): Built | null {
  const next = nums.map((n) => n + delta)
  if (next.some((n) => n < 100 || n > 999)) return null
  const hit = next.map((n) => holds(n, prop))
  const c = hit.filter(Boolean).length
  if (c === 0 && !rng.chance(0.15)) return null
  // adding a multiple of d cannot change divisibility by d — a good question still, so it is allowed; it is taught in the tips
  const work = nums.map((n, i) => `${n} ${delta > 0 ? '+' : '−'} ${Math.abs(delta)} = ${next[i]} ${tick(hit[i])}`).join(';  ')
  return build(
    { k: 'opCount', delta, prop },
    countOpts(c),
    `${work}. Count = ${c}.`,
    prop.t === 'div'
      ? `Adding or subtracting a number changes the remainder on division by ${prop.d} by that amount: ${prop.d} must go into (number ${delta > 0 ? '+' : '−'} ${Math.abs(delta)}), so check the new numbers or the old remainders.`
      : 'Work out all five new numbers first, then test each one.',
  )
}

function newNumbers(nums: number[], op: DigitOp): number[] | null {
  const next = nums.map((n) => applyOp(n, op))
  if (next.some((n) => n < 100)) return null // a leading zero would make it a two-digit number
  if (new Set(next).size !== next.length) return null // ties make "Nth lowest" ambiguous
  return next
}

function buildOpRank(rng: Rng, nums: number[], op: DigitOp, rank: Rank): Built | null {
  const next = newNumbers(nums, op)
  if (!next) return null
  const ans = rankedNumber(next, rank)
  return build(
    { k: 'opRank', op, rank },
    pickOpts(rng, ans, next),
    `${showNums(nums)} → ${showNums(next)}\n${ascLine(next)}. The ${rankPhrase(rank)} new number is ${ans}.`,
    'Rewrite all five numbers after the change, in a row under the originals, and rank those new numbers — not the old ones.',
  )
}

function buildOpCount2(rng: Rng, nums: number[], op: DigitOp, prop: Prop): Built | null {
  const next = newNumbers(nums, op)
  if (!next) return null
  const hit = next.map((n) => holds(n, prop))
  const c = hit.filter(Boolean).length
  if (c === 0 && !rng.chance(0.15)) return null
  return build(
    { k: 'opCount2', op, prop },
    countOpts(c),
    `${showNums(nums)} → ${showNums(next)}\n${next.map((n, i) => `${n} ${tick(hit[i])}`).join(';  ')}. Count = ${c}.`,
    'Rewrite the five numbers after the change, then test each new number.',
  )
}

function buildCalc(rng: Rng, nums: number[], a: Term, b: Term, sign: '+' | '-'): Built | null {
  const va = digitsOf(rankedNumber(nums, a.rank))[a.pos]
  const vb = digitsOf(rankedNumber(nums, b.rank))[b.pos]
  if (a.rank.n === b.rank.n && a.rank.dir === b.rank.dir && a.pos === b.pos) return null
  const ans = sign === '+' ? va + vb : Math.abs(va - vb)
  if (sign === '-' && ans === 0) return null
  return build(
    { k: 'calc', a, b, sign },
    nearOpts(rng, ans, [1, 2, 3, 4]),
    `${ascLine(nums)}. ${termText(a)} is ${va}; ${termText(b)} is ${vb}. ${sign === '+' ? `${va} + ${vb}` : `${Math.max(va, vb)} − ${Math.min(va, vb)}`} = ${ans}.`,
    'Find the two ranked numbers first, pick out the digits asked for, then do the sum or difference.',
  )
}

function buildDiffNum(rng: Rng, nums: number[], a: Rank, b: Rank): Built | null {
  const na = rankedNumber(nums, a)
  const nb = rankedNumber(nums, b)
  if (na === nb) return null
  const ans = Math.abs(na - nb)
  return build(
    { k: 'diffNum', a, b },
    nearOpts(rng, ans, [1, 10, 11, 20, 100]),
    `${ascLine(nums)}. The ${rankPhrase(a)} is ${na} and the ${rankPhrase(b)} is ${nb}: ${Math.max(na, nb)} − ${Math.min(na, nb)} = ${ans}.`,
    'Find the two ranked numbers first, then subtract the smaller from the larger.',
  )
}

// ---------- choosing what to ask ----------

type Kind = 'rank' | 'nbr' | 'digit' | 'between' | 'cond' | 'opCount' | 'opRank' | 'opCount2' | 'calc' | 'diffNum'

const OPS: Record<Level, DigitOp[]> = {
  easy: ['swap13'],
  medium: ['swap13', 'swap12', 'swap23', 'reverse'],
  hard: ['swap13', 'swap12', 'swap23', 'reverse', 'asc', 'desc'],
}
const DIVS: Record<Level, number[]> = { easy: [2, 3, 5], medium: [2, 3, 4, 5, 6], hard: [3, 4, 6, 7, 9] }

function makeNumbers(rng: Rng): number[] {
  for (;;) {
    const nums = Array.from({ length: 5 }, () => rng.int(1, 9) * 100 + rng.int(0, 9) * 10 + rng.int(1, 9))
    if (new Set(nums).size === 5 && new Set(nums.map((n) => Math.floor(n / 100))).size >= 4) return nums
  }
}

// ranks 1-4 only: the "fifth highest" of five numbers is just the lowest, which nobody would say
const randRank = (rng: Rng): Rank => ({ n: rng.int(1, 4), dir: rng.pick<Dir>(['lowest', 'highest']) })

function tryKind(rng: Rng, kind: Kind, nums: number[], level: Level): Built | null {
  switch (kind) {
    case 'rank':
      return buildRank(rng, nums, randRank(rng))
    case 'nbr':
      return buildNbr(rng, nums, randRank(rng), rng.pick(['L', 'R'] as const))
    case 'digit':
      return buildDigit(rng, nums, randRank(rng), rng.pick<0 | 1 | 2>([0, 1, 2]))
    case 'between': {
      const [a, b] = rng.sample(nums, 2)
      return buildBetween(nums, a, b)
    }
    case 'cond': {
      const t = rng.pick(level === 'easy' ? ['diff13', 'sumParity', 'mid'] : ['diff13', 'diff13', 'sumParity', 'sumCmp', 'mid'])
      const cond: Cond =
        t === 'diff13'
          ? { t, cmp: rng.pick(['less', 'more', 'equal'] as const), v: rng.int(2, 6) }
          : t === 'sumParity'
            ? { t, parity: rng.pick(['even', 'odd'] as const) }
            : t === 'sumCmp'
              ? { t, cmp: rng.pick(['more', 'less'] as const), v: rng.int(10, 16) }
              : { t: 'mid', rel: rng.pick(['greater', 'smaller'] as const) }
      return buildCond(rng, nums, cond)
    }
    case 'opCount': {
      const delta = rng.int(1, 9) * (rng.chance(0.5) ? 1 : -1)
      const prop: Prop =
        level === 'hard' && rng.chance(0.3)
          ? rng.chance(0.5)
            ? { t: 'gt', v: rng.int(4, 7) * 100 + 50 }
            : { t: 'lt', v: rng.int(4, 7) * 100 + 50 }
          : { t: 'div', d: rng.pick(DIVS[level]) }
      return buildOpCount(rng, nums, delta, prop)
    }
    case 'opRank':
      return buildOpRank(rng, nums, rng.pick(OPS[level]), randRank(rng))
    case 'opCount2': {
      const pick = rng.int(0, 3)
      const prop: Prop = pick === 0 ? { t: 'even' } : pick === 1 ? { t: 'odd' } : pick === 2 ? { t: 'gt', v: rng.int(4, 6) * 100 } : { t: 'lt', v: rng.int(4, 6) * 100 }
      return buildOpCount2(rng, nums, rng.pick(OPS[level]), prop)
    }
    case 'calc': {
      const term = (): Term => ({ rank: randRank(rng), pos: rng.pick<0 | 1 | 2>([0, 1, 2]) })
      return buildCalc(rng, nums, term(), term(), rng.pick(['+', '-'] as const))
    }
    case 'diffNum':
      return buildDiffNum(rng, nums, randRank(rng), randRank(rng))
  }
}

const POSITION: Kind[] = ['rank', 'nbr', 'digit', 'between']
const COUNT: Kind[] = ['cond', 'opCount']
const MODIFIED: Kind[] = ['opRank', 'opCount2']
const CALC: Kind[] = ['calc', 'diffNum']

function plan(rng: Rng, level: Level, type: NumQType): Kind[] {
  const many = (pool: Kind[]) => Array.from({ length: 5 }, () => rng.pick(pool))
  switch (type) {
    case 'position':
      return many(POSITION)
    case 'count':
      return many(COUNT)
    case 'modified':
      return many(MODIFIED)
    case 'calc':
      return many(CALC)
    case 'mixed': {
      const pos = rng.sample(POSITION, 3)
      if (level === 'easy') return rng.shuffle<Kind>([pos[0], pos[1], pos[2], 'cond', 'opCount'])
      if (level === 'medium') return rng.shuffle<Kind>([pos[0], pos[1], 'cond', 'opCount', 'opRank'])
      return rng.shuffle<Kind>([pos[0], 'cond', 'opCount', rng.pick(MODIFIED), rng.pick(CALC)])
    }
  }
}

export interface NumSet {
  numbers: number[]
  questions: { spec: NumSpec; stem: string; options: string[]; answer: number }[]
  explanations: string[]
  hints: string[]
}

const SET_SIZE = 5

function buildSet(rng: Rng, level: Level, type: NumQType, size: number): { numbers: number[]; built: Built[] } {
  for (let attempt = 0; attempt < 4000; attempt++) {
    const numbers = makeNumbers(rng)
    const kinds = plan(rng, level, type).slice(0, size)
    const built: Built[] = []
    const stems = new Set<string>()
    let ok = true
    for (const kind of kinds) {
      let got: Built | null = null
      for (let t = 0; t < 120 && !got; t++) {
        const b = tryKind(rng, kind, numbers, level)
        if (b && !stems.has(b.stem)) got = b
      }
      if (!got) {
        ok = false
        break
      }
      stems.add(got.stem)
      built.push(got)
    }
    if (ok) return { numbers, built }
  }
  throw new Error('number arrangement: generation failed')
}

/** Sets of five questions, each on its own five numbers. Also the entry point for the verifier. */
export function generateNumberSets(difficulty: NumDifficulty, type: NumQType, count: number, rng: Rng = createRng(randomSeed())): NumSet[] {
  const sets: NumSet[] = []
  for (let made = 0; made < count; made += SET_SIZE) {
    const level: Level = difficulty === 'mixed' ? (['easy', 'medium', 'hard'] as Level[])[sets.length % 3] : difficulty
    const { numbers, built } = buildSet(rng, level, type, Math.min(SET_SIZE, count - made))
    sets.push({
      numbers,
      questions: built.map((b) => ({ spec: b.spec, stem: b.stem, options: b.options, answer: b.answer })),
      explanations: built.map((b) => b.explanation),
      hints: built.map((b) => b.hint),
    })
  }
  return sets
}

export function generateNumberArrangementQuestions(difficulty: NumDifficulty, type: NumQType, count: number): MCQQuestion[] {
  const run = randomSeed().toString(36)
  const out: MCQQuestion[] = []
  generateNumberSets(difficulty, type, count).forEach((set, si) => {
    set.questions.forEach((q, qi) => {
      out.push({
        id: `numarr-${run}-${si}-${qi}`,
        instruction: `Five three-digit numbers · question ${qi + 1} of ${set.questions.length}`,
        context: showNums(set.numbers),
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
