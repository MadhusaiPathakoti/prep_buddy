import type { MCQQuestion } from './generators'
import { createRng, randomSeed, type Rng } from './mocks/rng'

/**
 * Digit Operations (SBI / IBPS Prelims style): a long number, a change applied to its digits, optionally a rearrangement,
 * then a question about the new number.
 *
 *   "If in the given number, 1 is added to each of the prime digits and 2 is subtracted from each of the remaining digits,
 *    and then all the repeated digits are deleted, what is the product of the 2nd digit from the left end and the 3rd from the right end?"
 *
 * Rules fixed by this game so that every question has exactly one answer:
 *  - the number is built only from digits whose changed value is still a single digit 0-9 (no "8 + 2 = 10");
 *  - 0 and 1 are not prime; the prime digits are 2, 3, 5, 7;
 *  - "repeated digits deleted" keeps the FIRST appearance of each digit and deletes the later ones.
 * Every answer is computed from an explicit spec; `scripts/verify-digit-operations.ts` re-derives each from the question text.
 */

export type DigitDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'
export type DigitQType = 'mixed' | 'nth' | 'calc' | 'count'
type Level = 'easy' | 'medium' | 'hard'

export type DigitClass = { t: 'odd' } | { t: 'even' } | { t: 'prime' } | { t: 'lt'; v: number }
export interface Transform {
  cls: DigitClass
  /** signed change for digits in the class */
  a: number
  /** signed change for all the remaining digits */
  b: number
}
export type Step = { t: 'arrange'; dir: 'ascending' | 'descending' } | { t: 'dedupe' } | { t: 'delete'; cls: DigitClass }
export type Ask =
  | { t: 'nth'; from: 'left' | 'right'; n: number }
  | { t: 'calc'; op: 'sum' | 'product' | 'difference'; n: number; m: number }
  | { t: 'count'; cls: DigitClass }

export interface DigitSpec {
  digits: number[]
  transform: Transform
  steps: Step[]
  ask: Ask
}

// ---------- the engine ----------

const PRIMES = new Set([2, 3, 5, 7])

export function inClass(d: number, c: DigitClass): boolean {
  switch (c.t) {
    case 'odd':
      return d % 2 === 1
    case 'even':
      return d % 2 === 0
    case 'prime':
      return PRIMES.has(d)
    case 'lt':
      return d < c.v
  }
}

const changeFor = (d: number, tr: Transform) => (inClass(d, tr.cls) ? tr.a : tr.b)

export const applyTransform = (digits: number[], tr: Transform): number[] => digits.map((d) => d + changeFor(d, tr))

export function applyStep(digits: number[], s: Step): number[] {
  switch (s.t) {
    case 'arrange':
      return digits.slice().sort((x, y) => (s.dir === 'ascending' ? x - y : y - x))
    case 'dedupe':
      return digits.filter((d, i) => digits.indexOf(d) === i)
    case 'delete':
      return digits.filter((d) => !inClass(d, s.cls))
  }
}

export function finalDigits(spec: { digits: number[]; transform: Transform; steps: Step[] }): number[] {
  return spec.steps.reduce(applyStep, applyTransform(spec.digits, spec.transform))
}

// ---------- wording ----------

const className = (c: DigitClass): string => {
  switch (c.t) {
    case 'odd':
      return 'odd digits'
    case 'even':
      return 'even digits'
    case 'prime':
      return 'prime digits'
    case 'lt':
      return `digits smaller than ${c.v}`
  }
}

function ordinal(n: number): string {
  const m100 = n % 100
  if (m100 >= 11 && m100 <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

const change = (delta: number) => `${Math.abs(delta)} is ${delta > 0 ? 'added to' : 'subtracted from'}`

const transformText = (t: Transform) => `${change(t.a)} each of the ${className(t.cls)} and ${change(t.b)} each of the remaining digits`

const stepText = (s: Step): string => {
  switch (s.t) {
    case 'arrange':
      return `all the digits are arranged in ${s.dir} order from left to right`
    case 'dedupe':
      return 'all the repeated digits are deleted (only the first appearance of each digit is kept)'
    case 'delete':
      return `all the ${className(s.cls)} are deleted`
  }
}

const askText = (a: Ask): string => {
  switch (a.t) {
    case 'nth':
      return `which digit will be ${ordinal(a.n)} from the ${a.from} end of the new number`
    case 'calc':
      return `what will be the ${a.op === 'sum' ? 'sum of' : a.op === 'product' ? 'product of' : 'difference between'} the ${ordinal(a.n)} digit from the left end and the ${ordinal(a.m)} digit from the right end of the new number`
    case 'count':
      return `how many ${className(a.cls)} will the new number have`
  }
}

export function stemOf(spec: DigitSpec): string {
  const after = spec.steps.map((s) => `, and then ${stepText(s)}`).join('')
  return `If in the given number, ${transformText(spec.transform)}${after}, ${askText(spec.ask)}?`
}

// ---------- building one question ----------

const spaced = (d: number[]) => d.join(' ')

interface Built {
  spec: DigitSpec
  stem: string
  options: string[]
  answer: number
  explanation: string
  hint: string
}

/** Digit answer: the right digit plus four others, nearest-looking ones (digits of the new number) first. */
function digitOptions(rng: Rng, correct: number, pool: number[]): { options: string[]; answer: number } | null {
  // digits that really occur in the working look the most tempting, so they come first
  const near = rng.shuffle([...new Set(pool)].filter((d) => d !== correct))
  const rest = rng.shuffle(ALL.filter((d) => d !== correct && !near.includes(d)))
  const four = [...near, ...rest].slice(0, 4)
  if (four.length < 4) return null
  const answer = rng.int(0, 4)
  const options = four.map(String)
  options.splice(answer, 0, String(correct))
  return { options, answer }
}

function numberOptions(rng: Rng, correct: number, steps: number[]): { options: string[]; answer: number } | null {
  const pool = [...new Set(steps.flatMap((d) => [correct + d, correct - d]))].filter((x) => x >= 0 && x !== correct)
  if (pool.length < 4) return null
  const nums = [...rng.shuffle(pool).slice(0, 4), correct].sort((a, b) => a - b)
  return { options: nums.map(String), answer: nums.indexOf(correct) }
}

const ALL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

function randomClass(rng: Rng, level: Level): DigitClass {
  const pool: DigitClass[] =
    level === 'easy'
      ? [{ t: 'odd' }, { t: 'even' }]
      : level === 'medium'
        ? [{ t: 'odd' }, { t: 'even' }, { t: 'prime' }, { t: 'prime' }]
        : [{ t: 'odd' }, { t: 'even' }, { t: 'prime' }, { t: 'lt', v: rng.int(4, 6) }]
  return rng.pick(pool)
}

function randomTransform(rng: Rng, level: Level): Transform | null {
  const cls = randomClass(rng, level)
  const deltas = level === 'easy' ? [-2, -1, 1, 2] : [-3, -2, -1, 1, 2, 3]
  const a = rng.pick(deltas)
  const b = rng.pick(deltas)
  if (a === b) return null
  const t: Transform = { cls, a, b }
  // at least five digits must survive the change as single digits, in both groups, or the numbers would all look alike
  const ok = ALL.filter((d) => d + changeFor(d, t) >= 0 && d + changeFor(d, t) <= 9)
  if (ok.length < 6 || !ok.some((d) => inClass(d, cls)) || !ok.some((d) => !inClass(d, cls))) return null
  return t
}

function randomSteps(rng: Rng, level: Level): Step[] {
  const dir = () => rng.pick(['ascending', 'descending'] as const)
  const filter = (): Step => ({ t: 'delete', cls: rng.pick<DigitClass>([{ t: 'odd' }, { t: 'even' }, { t: 'prime' }]) })
  if (level === 'easy') return rng.chance(0.5) ? [] : [{ t: 'arrange', dir: dir() }]
  if (level === 'medium') return [rng.pick<Step>([{ t: 'arrange', dir: dir() }, { t: 'dedupe' }, { t: 'dedupe' }, filter()])]
  const first: Step = rng.chance(0.6) ? { t: 'dedupe' } : filter()
  return [first, rng.chance(0.65) ? { t: 'arrange', dir: dir() } : first.t === 'dedupe' ? filter() : { t: 'dedupe' }]
}

const LENGTH: Record<Level, number> = { easy: 8, medium: 9, hard: 10 }

function randomAsk(rng: Rng, level: Level, type: DigitQType, len: number): Ask | null {
  const kind = type === 'mixed' ? rng.pick(level === 'easy' ? ['nth', 'calc'] : ['nth', 'calc', 'nth', 'calc', 'count']) : type
  const maxPos = Math.min(len, 7)
  if (kind === 'nth') return { t: 'nth', from: rng.pick(['left', 'right'] as const), n: rng.int(2, maxPos) }
  if (kind === 'count') return { t: 'count', cls: rng.pick<DigitClass>([{ t: 'odd' }, { t: 'even' }, { t: 'prime' }, { t: 'lt', v: rng.int(4, 6) }]) }
  const n = rng.int(1, maxPos)
  const m = rng.int(1, maxPos)
  if (n === len - m + 1) return null // both ends would point at the same digit
  return { t: 'calc', op: rng.pick(['sum', 'sum', 'product', 'difference'] as const), n, m }
}

function build(rng: Rng, level: Level, type: DigitQType): Built | null {
  const transform = randomTransform(rng, level)
  if (!transform) return null
  const allowed = ALL.filter((d) => d + changeFor(d, transform) >= 0 && d + changeFor(d, transform) <= 9)
  const digits = Array.from({ length: LENGTH[level] }, () => rng.pick(allowed))
  const steps = randomSteps(rng, level)

  const cur = finalDigits({ digits, transform, steps })
  const len = cur.length
  if (len < 5) return null
  if (steps.some((s) => s.t === 'dedupe') && len > digits.length - 2) return null // a "repeat" step that deletes next to nothing is no test
  if (steps.some((s) => s.t === 'delete') && len > digits.length - 2) return null

  const ask = randomAsk(rng, level, type, len)
  if (!ask) return null
  const spec: DigitSpec = { digits, transform, steps, ask }

  const transformed = applyTransform(digits, transform)
  const trail = [`Number: ${spaced(digits)}`, `After the change: ${spaced(transformed)}`]
  let walk = transformed
  for (const s of steps) {
    walk = applyStep(walk, s)
    trail.push(`After ${s.t === 'arrange' ? `arranging (${s.dir})` : s.t === 'dedupe' ? 'deleting repeats' : `deleting the ${className(s.cls)}`}: ${spaced(walk)}`)
  }
  const at = (fromLeft: number) => cur[fromLeft - 1]

  let opts: { options: string[]; answer: number } | null
  let finish: string
  let hint: string
  if (ask.t === 'nth') {
    const idx = ask.from === 'left' ? ask.n : len - ask.n + 1
    const correct = at(idx)
    opts = digitOptions(rng, correct, [...cur, ...transformed.slice(0, 3)])
    finish = `The new number has ${len} digits, so the ${ordinal(ask.n)} from the ${ask.from} end is the ${ordinal(idx)} from the left: ${correct}.`
    hint = 'Write the new number out in full first. The Nth digit from the right in an L-digit number is the (L − N + 1)th from the left.'
  } else if (ask.t === 'calc') {
    const a = at(ask.n)
    const b = at(len - ask.m + 1)
    const value = ask.op === 'sum' ? a + b : ask.op === 'product' ? a * b : Math.abs(a - b)
    if (ask.op === 'difference' && value === 0) return null
    if (ask.op === 'product' && value === 0 && !rng.chance(0.1)) return null
    opts = numberOptions(rng, value, ask.op === 'product' ? [1, 2, 3, 4, 6, 8, 9, 12] : [1, 2, 3, 4])
    finish = `The new number has ${len} digits: the ${ordinal(ask.n)} from the left is ${a} and the ${ordinal(ask.m)} from the right (the ${ordinal(len - ask.m + 1)} from the left) is ${b}. ${a} ${ask.op === 'sum' ? '+' : ask.op === 'product' ? '×' : '−'} ${b}${ask.op === 'difference' ? ` (larger minus smaller: ${Math.max(a, b)} − ${Math.min(a, b)})` : ''} = ${value}.`
    hint = 'Write the new number, find each digit by its place (from the left, and from the right), then do the sum, product or difference.'
  } else {
    const c = cur.filter((d) => inClass(d, ask.cls)).length
    if (c === 0) return null
    opts = numberOptions(rng, c, [1, 2, 3])
    finish = `Counting the ${className(ask.cls)} in ${spaced(cur)}: ${c}.`
    hint = 'Write the new number first, then go through it digit by digit and tick the ones that fit.'
  }
  if (!opts) return null
  return { spec, stem: stemOf(spec), ...opts, explanation: `${trail.join('\n')}\n${finish}`, hint }
}

export interface DigitQuestion extends Built {
  level: Level
}

export function generateDigitQuestions(difficulty: DigitDifficulty, type: DigitQType, count: number, rng: Rng = createRng(randomSeed())): DigitQuestion[] {
  const out: DigitQuestion[] = []
  const seen = new Set<string>()
  for (let n = 0; n < count; n++) {
    const level: Level = difficulty === 'mixed' ? (['easy', 'medium', 'hard'] as Level[])[n % 3] : difficulty
    let got: Built | null = null
    for (let attempt = 0; attempt < 3000 && !got; attempt++) {
      const b = build(rng, level, type)
      if (b && !seen.has(b.spec.digits.join(''))) got = b
    }
    if (!got) throw new Error(`digit operations: could not build a ${level} question`)
    seen.add(got.spec.digits.join(''))
    out.push({ ...got, level })
  }
  return out
}

export function generateDigitOperationQuestions(difficulty: DigitDifficulty, type: DigitQType, count: number): MCQQuestion[] {
  const run = randomSeed().toString(36)
  return generateDigitQuestions(difficulty, type, count).map((q, i) => ({
    id: `digitops-${run}-${i}`,
    instruction: 'Given number',
    context: spaced(q.spec.digits),
    contextBig: true,
    term: q.stem,
    termSmall: true,
    correctMeaning: q.options[q.answer],
    options: q.options,
    hint: q.hint,
    explanation: q.explanation,
    noPronounce: true,
  }))
}
