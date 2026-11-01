import { shuffle, type MCQQuestion } from './generators'

export type SeriesKind = 'number' | 'letter' | 'mixed'
export type SeriesTask = 'next' | 'wrong' | 'mixed'
export type SeriesDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'

type ConcreteDifficulty = Exclude<SeriesDifficulty, 'mixed'>

const NUMBER_LEN = 7
const LETTER_LEN = 6
const MAX_NUMBER = 5000
const MAX_ATTEMPTS_PER_QUESTION = 200

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)]
}

function sign(n: number): string {
  return n >= 0 ? '+' : '−'
}

/** Ends a rule description as a sentence — rules that already end in "…" don't also get a full stop. */
function sentence(rule: string): string {
  return rule.endsWith('…') ? rule : `${rule}.`
}

function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10 > 3 ? 0 : n % 10]}`
}

// ---------------------------------------------------------------------------------------------
// Number patterns
// ---------------------------------------------------------------------------------------------

interface BuiltNumberSeries {
  terms: number[]
  rule: string
}
type NumberPattern = (len: number) => BuiltNumberSeries | null

const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71]

const arithmetic: NumberPattern = (len) => {
  const d = randInt(2, 9)
  const rising = Math.random() < 0.7
  const a = rising ? randInt(2, 30) : randInt(60, 95)
  return {
    terms: Array.from({ length: len }, (_, i) => (rising ? a + d * i : a - d * i)),
    rule: rising ? `Add ${d} each time` : `Subtract ${d} each time`,
  }
}

const geometric: NumberPattern = (len) => {
  const r = randInt(2, 3)
  const a = randInt(1, 5)
  return { terms: Array.from({ length: len }, (_, i) => a * r ** i), rule: `Multiply by ${r} each time` }
}

const consecutiveSquares: NumberPattern = (len) => {
  const s = randInt(2, 9)
  return {
    terms: Array.from({ length: len }, (_, i) => (s + i) ** 2),
    rule: `Squares of consecutive numbers (${s}², ${s + 1}², ${s + 2}², …)`,
  }
}

const growingDifferences: NumberPattern = (len) => {
  const d0 = randInt(1, 4)
  const k = randInt(1, 3)
  const terms = [randInt(1, 20)]
  for (let i = 0; i < len - 1; i++) terms.push(terms[i] + d0 + k * i)
  return { terms, rule: `The differences grow by ${k}: +${d0}, +${d0 + k}, +${d0 + 2 * k}, …` }
}

const squarePlusConstant: NumberPattern = (len) => {
  const s = randInt(2, 8)
  const c = pick([-3, -2, -1, 1, 2, 3])
  return {
    terms: Array.from({ length: len }, (_, i) => (s + i) ** 2 + c),
    rule: `n² ${sign(c)} ${Math.abs(c)}, for n = ${s}, ${s + 1}, ${s + 2}, …`,
  }
}

const consecutiveCubes: NumberPattern = (len) => {
  const s = randInt(1, 5)
  return {
    terms: Array.from({ length: len }, (_, i) => (s + i) ** 3),
    rule: `Cubes of consecutive numbers (${s}³, ${s + 1}³, ${s + 2}³, …)`,
  }
}

const multiplyThenAdd: NumberPattern = (len) => {
  const a = randInt(2, 3)
  const b = pick([-3, -2, -1, 1, 2, 3, 4, 5])
  const terms = [randInt(1, 6)]
  for (let i = 0; i < len - 1; i++) terms.push(terms[i] * a + b)
  return { terms, rule: `Multiply by ${a}, then ${b > 0 ? 'add' : 'subtract'} ${Math.abs(b)}` }
}

const interleavedNumbers: NumberPattern = (len) => {
  const d1 = randInt(2, 6)
  const d2 = randInt(2, 6)
  const a = randInt(1, 15)
  const b = randInt(16, 30)
  const terms = Array.from({ length: len }, (_, i) => (i % 2 === 0 ? a + d1 * (i / 2) : b + d2 * ((i - 1) / 2)))
  return { terms, rule: `Two interleaved series: +${d1} on the 1st, 3rd, 5th… terms and +${d2} on the 2nd, 4th, 6th… terms` }
}

const primes: NumberPattern = (len) => {
  const start = randInt(0, PRIMES.length - len)
  return { terms: PRIMES.slice(start, start + len), rule: 'Consecutive prime numbers' }
}

const polynomialOfN: NumberPattern = (len) => {
  const forms: { label: string; f: (n: number) => number }[] = [
    { label: 'n² + n', f: (n) => n * n + n },
    { label: 'n² − n', f: (n) => n * n - n },
    { label: 'n³ + n', f: (n) => n ** 3 + n },
    { label: 'n³ − n', f: (n) => n ** 3 - n },
    { label: 'n³ + n²', f: (n) => n ** 3 + n * n },
  ]
  const { label, f } = pick(forms)
  const s = randInt(2, 5)
  return { terms: Array.from({ length: len }, (_, i) => f(s + i)), rule: `${label}, for n = ${s}, ${s + 1}, ${s + 2}, …` }
}

const multiplyAddGrowing: NumberPattern = (len) => {
  const terms = [randInt(1, 3)]
  for (let i = 0; i < len - 1; i++) terms.push(terms[i] * (i + 1) + (i + 1))
  return { terms, rule: '×1 + 1, then ×2 + 2, then ×3 + 3, then ×4 + 4, …' }
}

const fibonacciLike: NumberPattern = (len) => {
  const c = pick([0, 0, 1, -1, 2])
  const terms = [randInt(1, 5), randInt(2, 6)]
  for (let i = 2; i < len; i++) terms.push(terms[i - 1] + terms[i - 2] + c)
  const extra = c === 0 ? '' : ` ${sign(c)} ${Math.abs(c)}`
  return { terms, rule: `Each term is the sum of the previous two${extra}` }
}

const alternatingOperations: NumberPattern = (len) => {
  const c = randInt(1, 6)
  const terms = [randInt(1, 6)]
  for (let i = 0; i < len - 1; i++) terms.push(i % 2 === 0 ? terms[i] * 2 : terms[i] + c)
  return { terms, rule: `Alternately multiply by 2 and add ${c}` }
}

const addSquares: NumberPattern = (len) => {
  const terms = [randInt(1, 15)]
  for (let i = 0; i < len - 1; i++) terms.push(terms[i] + (i + 1) ** 2)
  return { terms, rule: 'Add 1², then 2², then 3², then 4², …' }
}

const addPrimes: NumberPattern = (len) => {
  const terms = [randInt(1, 10)]
  for (let i = 0; i < len - 1; i++) terms.push(terms[i] + PRIMES[i])
  return { terms, rule: 'Add consecutive primes: +2, +3, +5, +7, +11, …' }
}

const NUMBER_PATTERNS: Record<ConcreteDifficulty, NumberPattern[]> = {
  easy: [arithmetic, geometric, consecutiveSquares, growingDifferences],
  medium: [squarePlusConstant, consecutiveCubes, multiplyThenAdd, interleavedNumbers, primes],
  hard: [polynomialOfN, multiplyAddGrowing, fibonacciLike, alternatingOperations, addSquares, addPrimes],
}

// ---------------------------------------------------------------------------------------------
// Letter patterns — each term is one or two letters, stored as 1-26 positions
// ---------------------------------------------------------------------------------------------

interface BuiltLetterSeries {
  items: number[][]
  rule: string
}
type LetterPattern = (len: number) => BuiltLetterSeries | null

const toLabel = (item: number[]): string => item.map((p) => String.fromCharCode(64 + p)).join('')

const letterStep: LetterPattern = (len) => {
  const k = randInt(1, 4)
  const forward = Math.random() < 0.6
  const span = k * (len - 1)
  const s = forward ? randInt(1, 26 - span) : randInt(1 + span, 26)
  return {
    items: Array.from({ length: len }, (_, i) => [forward ? s + k * i : s - k * i]),
    rule: forward ? `Move ${k} letter${k > 1 ? 's' : ''} forward each time` : `Move ${k} letter${k > 1 ? 's' : ''} backward each time`,
  }
}

const letterForwardBackward: LetterPattern = (len) => {
  const d1 = randInt(1, 2)
  const d2 = randInt(1, 2)
  const a = randInt(1, 8)
  const b = randInt(19, 26)
  const items = Array.from({ length: len }, (_, i) => [i % 2 === 0 ? a + d1 * (i / 2) : b - d2 * ((i - 1) / 2)])
  return { items, rule: `Two interleaved series: one moves ${d1} forward, the other ${d2} backward` }
}

const letterGrowingGaps: LetterPattern = (len) => {
  const g0 = pick([1, 2])
  const totalGap = (len - 1) * g0 + ((len - 1) * (len - 2)) / 2
  if (totalGap > 25) return null
  const s = randInt(1, 26 - totalGap)
  const items = [[s]]
  for (let i = 0; i < len - 1; i++) items.push([items[i][0] + g0 + i])
  return { items, rule: `The gaps grow by 1: +${g0}, +${g0 + 1}, +${g0 + 2}, …` }
}

const letterInterleavedForward: LetterPattern = (len) => {
  const k1 = randInt(1, 3)
  const k2 = randInt(1, 3)
  const a = randInt(1, 8)
  const b = randInt(10, 14)
  const items = Array.from({ length: len }, (_, i) => [i % 2 === 0 ? a + k1 * (i / 2) : b + k2 * ((i - 1) / 2)])
  return { items, rule: `Two interleaved series: one moves ${k1} forward each time, the other ${k2} forward each time` }
}

const letterPairs: LetterPattern = (len) => {
  const da = pick([1, 2, -1, -2])
  const db = pick([1, 2, -1, -2])
  const lo = (d: number) => (d > 0 ? 1 : 1 + Math.abs(d) * (len - 1))
  const hi = (d: number) => (d > 0 ? 26 - d * (len - 1) : 26)
  const sa = randInt(lo(da), hi(da))
  const sb = randInt(lo(db), hi(db))
  const items = Array.from({ length: len }, (_, i) => [sa + da * i, sb + db * i])
  const describe = (d: number, which: string) => `${which} letter moves ${Math.abs(d)} ${d > 0 ? 'forward' : 'backward'}`
  return { items, rule: `${describe(da, 'The first')}, ${describe(db, 'the second')}, each time` }
}

const letterZigzag: LetterPattern = (len) => {
  const up = pick([2, 3, 4])
  const down = randInt(1, up - 1)
  const s = randInt(1, 8)
  const items = [[s]]
  for (let i = 0; i < len - 1; i++) items.push([items[i][0] + (i % 2 === 0 ? up : -down)])
  if (items.some(([p]) => p < 1 || p > 26)) return null
  return { items, rule: `Alternately move ${up} forward, then ${down} backward` }
}

const LETTER_PATTERNS: Record<ConcreteDifficulty, LetterPattern[]> = {
  easy: [letterStep, letterForwardBackward],
  medium: [letterGrowingGaps, letterInterleavedForward],
  hard: [letterPairs, letterZigzag],
}

// ---------------------------------------------------------------------------------------------
// Distractors and corruption
// ---------------------------------------------------------------------------------------------

function numberDistractors(shown: number[], answer: number): number[] {
  const last = shown[shown.length - 1]
  const prev = shown[shown.length - 2]
  const picked: number[] = []
  const usable = (c: number) => c !== answer && c >= 1 && !shown.includes(c) && !picked.includes(c)

  // The classic traps first: keep adding the last gap, or keep applying the last ratio.
  const gapTrap = last + (last - prev)
  if (usable(gapTrap)) picked.push(gapTrap)
  if (prev !== 0 && last % prev === 0 && Math.random() < 0.5) {
    const ratioTrap = last * (last / prev)
    if (usable(ratioTrap)) picked.push(ratioTrap)
  }

  // Then fill with near-misses of the real answer.
  const near = shuffle([1, 2, 3, 4, 5, 10].flatMap((d) => [answer + d, answer - d]))
  for (const c of near) {
    if (picked.length >= 4) break
    if (usable(c)) picked.push(c)
  }
  for (let pad = 11; picked.length < 4; pad++) if (usable(answer + pad)) picked.push(answer + pad)
  return picked
}

/** Variants of a letter term, ordered roughly from "closest" to "furthest" so the options are tempting rather than random. */
function letterVariants(item: number[]): number[][] {
  const out: number[][] = []
  for (let d = 1; d <= 6; d++) {
    for (let j = 0; j < item.length; j++) {
      for (const s of [-1, 1]) {
        const p = item[j] + s * d
        if (p >= 1 && p <= 26) {
          const v = [...item]
          v[j] = p
          out.push(v)
        }
      }
    }
  }
  if (item.length === 2) {
    out.push([item[1], item[0]])
    for (const s of [-1, 1]) {
      const v = [item[0] + s, item[1] + s]
      if (v.every((p) => p >= 1 && p <= 26)) out.push(v)
    }
  }
  const seen = new Set<string>([toLabel(item)])
  return out.filter((v) => {
    const label = toLabel(v)
    if (seen.has(label)) return false
    seen.add(label)
    return true
  })
}

// ---------------------------------------------------------------------------------------------
// Question builders
// ---------------------------------------------------------------------------------------------

const NUMBER_HINT = 'Check the differences between terms first, then the ratios, then squares and cubes.'
const LETTER_HINT = 'Convert letters to positions (A=1 … Z=26) and look at the gaps.'
const WRONG_HINT = 'Find the rule from the terms that agree with each other — the odd one out is the wrong term.'

function finishQuestion(
  task: 'next' | 'wrong',
  seriesText: string,
  answer: string,
  options: string[],
  explanation: string,
  hint: string,
): MCQQuestion {
  const instruction = task === 'next' ? 'Find the next term' : 'Find the wrong term'
  return {
    id: `${instruction}|${seriesText}`,
    instruction,
    term: seriesText,
    correctMeaning: answer,
    options: shuffle(options),
    hint: task === 'wrong' ? `${hint} ${WRONG_HINT}` : hint,
    explanation,
  }
}

function buildNumberQuestion(task: 'next' | 'wrong', difficulty: ConcreteDifficulty): MCQQuestion | null {
  const built = pick(NUMBER_PATTERNS[difficulty])(NUMBER_LEN)
  if (!built) return null
  const { terms, rule } = built
  if (terms.some((t) => !Number.isInteger(t) || t < 1 || t > MAX_NUMBER) || new Set(terms).size !== terms.length) return null

  if (task === 'next') {
    const shown = terms.slice(0, NUMBER_LEN - 1)
    const answer = terms[NUMBER_LEN - 1]
    const options = [String(answer), ...numberDistractors(shown, answer).map(String)]
    return finishQuestion('next', `${shown.join(', ')}, ?`, String(answer), options, `${sentence(rule)} The next term is ${answer}.`, NUMBER_HINT)
  }

  // Wrong term: corrupt one term (never the first two, so the rule stays recoverable).
  const idx = randInt(2, NUMBER_LEN - 1)
  const truth = terms[idx]
  const magnitudes = truth > 100 ? [2, 3, 4, 5, 6, 8, 10, 12] : [1, 2, 3, 4, 5, 6]
  const wrongValue = truth + pick(magnitudes) * (Math.random() < 0.5 ? -1 : 1)
  if (wrongValue < 1 || terms.includes(wrongValue)) return null

  const displayed = terms.map((t, i) => (i === idx ? wrongValue : t))
  const others = shuffle(displayed.filter((_, i) => i !== idx)).slice(0, 4)
  const options = [String(wrongValue), ...others.map(String)]
  return finishQuestion(
    'wrong',
    displayed.join(', '),
    String(wrongValue),
    options,
    `${sentence(rule)} The ${ordinal(idx + 1)} term should be ${truth}, not ${wrongValue}.`,
    NUMBER_HINT,
  )
}

function buildLetterQuestion(task: 'next' | 'wrong', difficulty: ConcreteDifficulty): MCQQuestion | null {
  const built = pick(LETTER_PATTERNS[difficulty])(LETTER_LEN)
  if (!built) return null
  const { items, rule } = built
  if (items.some((it) => it.some((p) => p < 1 || p > 26))) return null
  const labels = items.map(toLabel)
  if (new Set(labels).size !== labels.length) return null

  if (task === 'next') {
    const shown = labels.slice(0, LETTER_LEN - 1)
    const answerItem = items[LETTER_LEN - 1]
    const answer = labels[LETTER_LEN - 1]
    const variants = letterVariants(answerItem)
      .map(toLabel)
      .filter((l) => !shown.includes(l))
    if (variants.length < 4) return null
    // Draw from the closest few so the options are tempting rather than random.
    const distractors = shuffle(variants.slice(0, 8)).slice(0, 4)
    return finishQuestion('next', `${shown.join(', ')}, ?`, answer, [answer, ...distractors], `${sentence(rule)} The next term is ${answer}.`, LETTER_HINT)
  }

  const idx = randInt(2, LETTER_LEN - 1)
  const truth = labels[idx]
  const wrongChoices = letterVariants(items[idx])
    .slice(0, 6)
    .map(toLabel)
    .filter((l) => !labels.includes(l))
  if (wrongChoices.length === 0) return null
  const wrongLabel = pick(wrongChoices)

  const displayed = labels.map((l, i) => (i === idx ? wrongLabel : l))
  const others = shuffle(displayed.filter((_, i) => i !== idx)).slice(0, 4)
  return finishQuestion(
    'wrong',
    displayed.join(', '),
    wrongLabel,
    [wrongLabel, ...others],
    `${sentence(rule)} The ${ordinal(idx + 1)} term should be ${truth}, not ${wrongLabel}.`,
    LETTER_HINT,
  )
}

// ---------------------------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------------------------

export function generateSeriesQuestions(kind: SeriesKind, task: SeriesTask, difficulty: SeriesDifficulty, count: number): MCQQuestion[] {
  const out: MCQQuestion[] = []
  const seen = new Set<string>()

  for (let attempts = 0; out.length < count && attempts < count * MAX_ATTEMPTS_PER_QUESTION; attempts++) {
    const k = kind === 'mixed' ? pick(['number', 'letter'] as const) : kind
    const t = task === 'mixed' ? pick(['next', 'wrong'] as const) : task
    const d: ConcreteDifficulty = difficulty === 'mixed' ? pick(['easy', 'medium', 'hard'] as const) : difficulty
    const q = k === 'number' ? buildNumberQuestion(t, d) : buildLetterQuestion(t, d)
    if (!q || seen.has(q.id)) continue
    seen.add(q.id)
    out.push(q)
  }
  return out
}
