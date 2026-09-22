import type { BankEntry, Difficulty, Question, WordEntry } from './types'

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Multiplication questions for the selected "tables" (e.g. 28's table) crossed with 1..30. */
export function generateTablesQuestions(tables: number[], multiplierMax: number, count: number): Question[] {
  const pool: Question[] = []
  for (const a of tables) {
    for (let b = 1; b <= multiplierMax; b++) {
      const answer = a * b
      pool.push({ id: `${a}x${b}`, prompt: `${a} × ${b}`, answer, displayAnswer: String(answer) })
    }
  }
  const shuffled = shuffle(pool)
  return count >= shuffled.length ? shuffled : shuffled.slice(0, count)
}

export type SquareCubeMode = 'square' | 'cube' | 'mixed'
/** 'forward' asks for n² or n³ given n; 'reverse' asks for n given √n² or ∛n³ (its root). */
export type SquareCubeDirection = 'forward' | 'reverse' | 'mixed'

export function generateSquaresCubesQuestions(
  min: number,
  max: number,
  mode: SquareCubeMode,
  direction: SquareCubeDirection,
  count: number,
): Question[] {
  const directions: ('forward' | 'reverse')[] = direction === 'mixed' ? ['forward', 'reverse'] : [direction]
  const pool: Question[] = []
  for (let n = min; n <= max; n++) {
    if (mode === 'square' || mode === 'mixed') {
      const value = n * n
      for (const dir of directions) {
        pool.push(
          dir === 'forward'
            ? { id: `sq-${n}-f`, prompt: `${n}²`, answer: value, displayAnswer: String(value) }
            : { id: `sq-${n}-r`, prompt: `√${value}`, answer: n, displayAnswer: String(n) },
        )
      }
    }
    if (mode === 'cube' || mode === 'mixed') {
      const value = n * n * n
      for (const dir of directions) {
        pool.push(
          dir === 'forward'
            ? { id: `cb-${n}-f`, prompt: `${n}³`, answer: value, displayAnswer: String(value) }
            : { id: `cb-${n}-r`, prompt: `∛${value}`, answer: n, displayAnswer: String(n) },
        )
      }
    }
  }
  const shuffled = shuffle(pool)
  return count >= shuffled.length ? shuffled : shuffled.slice(0, count)
}

/**
 * Pythagorean triplet questions: finds every integer triple (a, b, c) with a² + b² = c²
 * where the smallest leg `a` falls in [minA, maxA] (the user-selected range), then blanks
 * one randomly-chosen position for the user to fill in, e.g. "(3, 4, _)" or "(_, 4, 5)".
 * Includes scaled (non-primitive) triples like (6, 8, 10), not just primitives.
 */
export function generatePythagoreanQuestions(minA: number, maxA: number, count: number): Question[] {
  const CAP = 500 // keeps b/c to at most 3 digits, comfortable to type
  const triples: [number, number, number][] = []
  for (let a = minA; a <= maxA; a++) {
    for (let b = a + 1; b < CAP; b++) {
      const c = Math.sqrt(a * a + b * b)
      if (c >= CAP) break
      if (Number.isInteger(c)) triples.push([a, b, c])
    }
  }
  const shuffled = shuffle(triples)
  const chosen = count >= shuffled.length ? shuffled : shuffled.slice(0, count)
  return chosen.map(([a, b, c], i) => {
    const values = [a, b, c]
    const blankIndex = Math.floor(Math.random() * 3)
    const answer = values[blankIndex]
    const prompt = `(${values.map((v, idx) => (idx === blankIndex ? '_' : v)).join(', ')})`
    return {
      id: `${a}-${b}-${c}-${i}`,
      prompt,
      answer,
      displayAnswer: String(answer),
    }
  })
}

export type RatioDifficulty = 'basic' | 'advanced'

/** Fraction -> percentage questions, e.g. 1/9 -> 11.11 */
export function generateRatioQuestions(maxDenominator: number, difficulty: RatioDifficulty, count: number): Question[] {
  const pool: Question[] = []
  for (let d = 2; d <= maxDenominator; d++) {
    const numerators = difficulty === 'basic' ? [1] : Array.from({ length: d - 1 }, (_, i) => i + 1)
    for (const n of numerators) {
      if (n >= d) continue
      const gcdVal = gcd(n, d)
      if (gcdVal !== 1) continue // keep fractions in lowest terms, avoid duplicates like 2/4
      const raw = (n / d) * 100
      const answer = Math.round(raw * 100) / 100
      pool.push({
        id: `${n}/${d}`,
        prompt: `${n}/${d}`,
        answer,
        displayAnswer: answer.toFixed(2),
      })
    }
  }
  const shuffled = shuffle(pool)
  return count >= shuffled.length ? shuffled : shuffled.slice(0, count)
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

export interface RatioAnswerQuestion {
  id: string
  prompt: string
  numerator: number
  denominator: number
  displayAnswer: string
}

export type PercentToRatioDifficulty = 'basic' | 'advanced' | 'mixed'

/**
 * Percentage -> fraction questions, e.g. 25% -> 1/4. The answer must be in lowest terms.
 * Basic (1/n) and Advanced (n/d, n>1) are a clean partition so Mixed (n/d, any n) is their
 * union rather than a duplicate of Advanced.
 */
export function generatePercentToRatioQuestions(maxDenominator: number, difficulty: PercentToRatioDifficulty, count: number): RatioAnswerQuestion[] {
  const pool: RatioAnswerQuestion[] = []
  for (let d = 2; d <= maxDenominator; d++) {
    const numerators =
      difficulty === 'basic'
        ? [1]
        : difficulty === 'advanced'
          ? Array.from({ length: d - 2 }, (_, i) => i + 2)
          : Array.from({ length: d - 1 }, (_, i) => i + 1)
    for (const n of numerators) {
      if (n >= d) continue
      const gcdVal = gcd(n, d)
      if (gcdVal !== 1) continue // keep fractions in lowest terms, avoid duplicates like 2/4
      const raw = (n / d) * 100
      const percent = Math.round(raw * 100) / 100
      const promptPercent = Number.isInteger(percent) ? String(percent) : percent.toFixed(2)
      pool.push({
        id: `${n}/${d}`,
        prompt: `${promptPercent}%`,
        numerator: n,
        denominator: d,
        displayAnswer: `${n}/${d}`,
      })
    }
  }
  const shuffled = shuffle(pool)
  return count >= shuffled.length ? shuffled : shuffled.slice(0, count)
}

export type DigitLength = 1 | 2 | 3

function randomForDigitLength(digits: DigitLength): number {
  const min = digits === 1 ? 1 : 10 ** (digits - 1)
  const max = 10 ** digits - 1
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** Addition questions with independently chosen digit lengths for each side, e.g. double + single: 23 + 9. */
export function generateAdditionQuestions(lhsDigits: DigitLength, rhsDigits: DigitLength, count: number): Question[] {
  const seen = new Set<string>()
  const questions: Question[] = []
  let attempts = 0
  const maxAttempts = count * 25
  while (questions.length < count && attempts < maxAttempts) {
    attempts++
    const a = randomForDigitLength(lhsDigits)
    const b = randomForDigitLength(rhsDigits)
    const key = `${a}+${b}`
    if (seen.has(key)) continue
    seen.add(key)
    const answer = a + b
    questions.push({ id: key, prompt: `${a} + ${b}`, answer, displayAnswer: String(answer) })
  }
  return questions
}

/**
 * Subtraction questions with independently chosen digit lengths for each side, e.g.
 * double − single: 45 − 7. The larger of the two sampled numbers is always used as the
 * minuend (swapped if needed) so the result never goes negative, since the numeric input
 * only accepts digits.
 */
export function generateSubtractionQuestions(lhsDigits: DigitLength, rhsDigits: DigitLength, count: number): Question[] {
  const seen = new Set<string>()
  const questions: Question[] = []
  let attempts = 0
  const maxAttempts = count * 25
  while (questions.length < count && attempts < maxAttempts) {
    attempts++
    let a = randomForDigitLength(lhsDigits)
    let b = randomForDigitLength(rhsDigits)
    if (a < b) {
      ;[a, b] = [b, a]
    }
    const key = `${a}-${b}`
    if (seen.has(key)) continue
    seen.add(key)
    const answer = a - b
    questions.push({ id: key, prompt: `${a} − ${b}`, answer, displayAnswer: String(answer) })
  }
  return questions
}

/**
 * Division questions with independently chosen digit lengths for the dividend (lhs) and
 * divisor (rhs), e.g. double ÷ single: 84 ÷ 7 = 12. A divisor and quotient are picked
 * first, then the dividend is derived as their product so it always divides evenly and
 * still fits the chosen dividend digit length, since the numeric input only accepts
 * whole-number digits.
 */
export function generateDivisionQuestions(lhsDigits: DigitLength, rhsDigits: DigitLength, count: number): Question[] {
  const dividendMin = lhsDigits === 1 ? 1 : 10 ** (lhsDigits - 1)
  const dividendMax = 10 ** lhsDigits - 1
  const seen = new Set<string>()
  const questions: Question[] = []
  let attempts = 0
  const maxAttempts = count * 40
  while (questions.length < count && attempts < maxAttempts) {
    attempts++
    const divisor = randomForDigitLength(rhsDigits)
    const qMin = Math.max(1, Math.ceil(dividendMin / divisor))
    const qMax = Math.floor(dividendMax / divisor)
    if (qMax < qMin) continue
    const quotient = Math.floor(Math.random() * (qMax - qMin + 1)) + qMin
    const dividend = divisor * quotient
    const key = `${dividend}/${divisor}`
    if (seen.has(key)) continue
    seen.add(key)
    questions.push({ id: key, prompt: `${dividend} ÷ ${divisor}`, answer: quotient, displayAnswer: String(quotient) })
  }
  return questions
}

export interface MCQQuestion {
  id: string
  term: string
  correctMeaning: string
  options: string[]
  hint: string
}

/** MCQ questions: pick an entry from a bank (vocabulary, idioms, ...) at the chosen difficulty (or 'mixed' for all difficulties), with 3 wrong meanings as distractors. */
export function generateMCQQuestions(bank: BankEntry[], difficulty: Difficulty | 'mixed', count: number): MCQQuestion[] {
  const pool = difficulty === 'mixed' ? bank : bank.filter((w) => w.difficulty === difficulty)
  const chosen = shuffle(pool).slice(0, Math.min(count, pool.length))
  return chosen.map((w) => {
    const distractors = shuffle(pool.filter((x) => x.id !== w.id))
      .slice(0, 3)
      .map((x) => x.meaning)
    return {
      id: w.id,
      term: w.term,
      correctMeaning: w.meaning,
      options: shuffle([w.meaning, ...distractors]),
      hint: w.hint,
    }
  })
}

/**
 * MCQ questions from the shared word bank: the correct answer is one of the word's own
 * synonyms or antonyms (whichever `field` the game asks for), with distractors drawn from
 * other words' lists for that same field. Words with an empty list for `field` are excluded,
 * since there's nothing to quiz for them in that mode.
 */
export function generateWordMCQQuestions(
  bank: WordEntry[],
  field: 'synonyms' | 'antonyms',
  difficulty: Difficulty | 'mixed',
  count: number,
): MCQQuestion[] {
  const byDifficulty = difficulty === 'mixed' ? bank : bank.filter((w) => w.difficulty === difficulty)
  const pool = byDifficulty.filter((w) => w[field].length > 0)
  const chosen = shuffle(pool).slice(0, Math.min(count, pool.length))
  return chosen.map((w) => {
    const correctMeaning = w[field][Math.floor(Math.random() * w[field].length)]
    const otherValues = pool
      .filter((x) => x.id !== w.id)
      .flatMap((x) => x[field])
      .filter((v) => v.toLowerCase() !== correctMeaning.toLowerCase())
    const distractors = shuffle([...new Set(otherValues)]).slice(0, 3)
    return {
      id: w.id,
      term: w.word,
      correctMeaning,
      options: shuffle([correctMeaning, ...distractors]),
      hint: w.meaning,
    }
  })
}

export type DivisibilityDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'

interface DivisorSpec {
  divisor: number
  digits: number
  /** Max distance from the correct answer when picking distractors — smaller means options sit closer together and are harder to eliminate by estimation. */
  offsetMax: number
}

// Divisor choice and number size scale up with difficulty; distractor spacing tightens too,
// so "hard" options cluster close enough together that only the actual divisibility rule
// (not rough estimation) can tell them apart — matching SBI PO Mains-level rigor.
const EASY_DIVISOR_SPECS: DivisorSpec[] = [3, 4, 6, 9, 11].map((divisor) => ({ divisor, digits: 4, offsetMax: 50 }))
const MEDIUM_DIVISOR_SPECS: DivisorSpec[] = [7, 8, 12, 13, 16].map((divisor) => ({ divisor, digits: 5, offsetMax: 30 }))
const HARD_DIVISOR_SPECS: DivisorSpec[] = [7, 11, 13, 17, 19, 23].map((divisor) => ({ divisor, digits: 6, offsetMax: 15 }))

function divisorSpecsFor(difficulty: DivisibilityDifficulty): DivisorSpec[] {
  if (difficulty === 'easy') return EASY_DIVISOR_SPECS
  if (difficulty === 'medium') return MEDIUM_DIVISOR_SPECS
  if (difficulty === 'hard') return HARD_DIVISOR_SPECS
  return [...EASY_DIVISOR_SPECS, ...MEDIUM_DIVISOR_SPECS, ...HARD_DIVISOR_SPECS]
}

const DIVISIBILITY_HINTS: Record<number, string> = {
  3: 'Add all the digits — if that sum is divisible by 3, so is the number.',
  4: 'Look at just the last two digits as a number — if that’s divisible by 4, so is the whole number.',
  6: 'The number must pass both the rule for 2 (it’s even) and the rule for 3 (digit sum divisible by 3).',
  7: 'Double the last digit and subtract it from the rest of the number. Repeat until the result is small enough to check directly — if it’s divisible by 7 (or 0), so is the original.',
  8: 'Look at just the last three digits as a number — if that’s divisible by 8, so is the whole number.',
  9: 'Add all the digits — if that sum is divisible by 9, so is the number.',
  11: 'Starting from the right, alternately add and subtract digits. If the result is 0 or divisible by 11, so is the number.',
  12: 'The number must pass both the rule for 3 (digit sum) and the rule for 4 (last two digits).',
  13: 'Multiply the last digit by 4 and add it to the rest of the number. Repeat until small enough to check — if divisible by 13, so is the original.',
  16: 'Look at just the last four digits as a number — if that’s divisible by 16, so is the whole number.',
  17: 'Multiply the last digit by 5 and subtract it from the rest of the number. Repeat until small enough to check — if divisible by 17, so is the original.',
  19: 'Multiply the last digit by 2 and add it to the rest of the number. Repeat until small enough to check — if divisible by 19, so is the original.',
  23: 'Multiply the last digit by 7 and add it to the rest of the number. Repeat until small enough to check — if divisible by 23, so is the original.',
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

/**
 * One "which of these is divisible by N?" question: the correct option is a genuine multiple
 * of the divisor at the target digit length; the three distractors are numbers of the same
 * length sampled close to the correct answer (within offsetMax) so options can't be told
 * apart by rough size alone — only by actually applying the divisibility rule.
 */
function generateDivisibilityQuestion(spec: DivisorSpec, uniqueSuffix: number): MCQQuestion {
  const { divisor, digits, offsetMax } = spec
  const min = 10 ** (digits - 1)
  const max = 10 ** digits - 1
  const minK = Math.ceil(min / divisor)
  const maxK = Math.floor(max / divisor)
  const correct = randomInt(minK, maxK) * divisor

  const used = new Set<number>([correct])
  const distractors: number[] = []
  let attempts = 0
  while (distractors.length < 3 && attempts < 200) {
    attempts++
    const candidate = correct + randomInt(1, offsetMax) * (Math.random() < 0.5 ? -1 : 1)
    if (candidate < min || candidate > max || candidate % divisor === 0 || used.has(candidate)) continue
    used.add(candidate)
    distractors.push(candidate)
  }
  while (distractors.length < 3) {
    const candidate = randomInt(min, max)
    if (candidate % divisor !== 0 && !used.has(candidate)) {
      used.add(candidate)
      distractors.push(candidate)
    }
  }

  const correctMeaning = correct.toLocaleString('en-IN')
  return {
    id: `div-${divisor}-${correct}-${uniqueSuffix}`,
    term: `Which of the following numbers is exactly divisible by ${divisor}?`,
    correctMeaning,
    options: shuffle([correct, ...distractors]).map((n) => n.toLocaleString('en-IN')),
    hint: DIVISIBILITY_HINTS[divisor],
  }
}

export function generateDivisibilityQuestions(difficulty: DivisibilityDifficulty, count: number): MCQQuestion[] {
  const specs = divisorSpecsFor(difficulty)
  const seen = new Set<string>()
  const questions: MCQQuestion[] = []
  let attempts = 0
  const maxAttempts = count * 25
  while (questions.length < count && attempts < maxAttempts) {
    attempts++
    const spec = specs[randomInt(0, specs.length - 1)]
    const question = generateDivisibilityQuestion(spec, attempts)
    if (seen.has(question.correctMeaning)) continue
    seen.add(question.correctMeaning)
    questions.push(question)
  }
  return questions
}

export type AlphaNumSystem = 'forward' | 'reverse' | 'mixed'
export type AlphaNumDirection = 'alpha-to-num' | 'num-to-alpha' | 'mixed'

export interface AlphaNumQuestion {
  id: string
  prompt: string
  kind: 'alpha-to-num' | 'num-to-alpha'
  /** The expected typed answer: a numeric string (e.g. "-24") or a single uppercase letter. */
  answer: string
  displayAnswer: string
}

const ALPHABET = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))

/** A=1, B=2, ... Z=26 for 'forward'; Z=-1, Y=-2, ... A=-26 for 'reverse'. */
function alphaNumValue(letterPosition: number, system: 'forward' | 'reverse'): number {
  return system === 'forward' ? letterPosition : letterPosition - 27
}

/**
 * Alpha Numeric Test questions: convert between a letter and its position number under the
 * chosen numbering system(s). 'mixed' system means each question independently picks forward
 * or reverse; 'mixed' direction means each question independently asks alphabet->number or
 * number->alphabet. A number's sign alone identifies its system (reverse is always negative),
 * so number->alphabet questions need no extra label; alphabet->number questions show which
 * system applies directly in the prompt since the same letter maps to two different numbers.
 */
export function generateAlphaNumericQuestions(system: AlphaNumSystem, direction: AlphaNumDirection, count: number): AlphaNumQuestion[] {
  const systems: ('forward' | 'reverse')[] = system === 'mixed' ? ['forward', 'reverse'] : [system]
  const directions: ('alpha-to-num' | 'num-to-alpha')[] = direction === 'mixed' ? ['alpha-to-num', 'num-to-alpha'] : [direction]

  const pool: AlphaNumQuestion[] = []
  for (let position = 1; position <= 26; position++) {
    const letter = ALPHABET[position - 1]
    for (const sys of systems) {
      const value = alphaNumValue(position, sys)
      for (const dir of directions) {
        if (dir === 'alpha-to-num') {
          const sysLabel = sys === 'forward' ? 'A=1 … Z=26' : 'Z=-1 … A=-26'
          pool.push({
            id: `${letter}-${sys}-a2n`,
            prompt: `${letter}   (${sysLabel})`,
            kind: 'alpha-to-num',
            answer: String(value),
            displayAnswer: String(value),
          })
        } else {
          pool.push({
            id: `${letter}-${sys}-n2a`,
            prompt: String(value),
            kind: 'num-to-alpha',
            answer: letter,
            displayAnswer: letter,
          })
        }
      }
    }
  }
  const shuffled = shuffle(pool)
  return count >= shuffled.length ? shuffled : shuffled.slice(0, count)
}

export type TwinProductKind = 'product' | 'start'

export interface TwinProductQuestion {
  id: string
  prompt: string
  kind: TwinProductKind
  /** The expected typed answer: the product for 'product', the starting number for 'start'. */
  answer: string
  /** The full equation, e.g. "7 × 8 = 56" — shown on skip, and as a confirmation after a correct 'start' answer. */
  displayAnswer: string
}

/**
 * Twin (consecutive integer) product questions: n × (n+1) for n in [min, max], e.g. 4×5=20.
 * 'product' questions give both numbers and ask for the product; 'start' questions give only
 * the product and ask for the smaller of the two consecutive numbers, since the product alone
 * doesn't reveal which one is missing without solving for it.
 */
export function generateTwinProductQuestions(min: number, max: number, count: number): TwinProductQuestion[] {
  const pool: TwinProductQuestion[] = []
  for (let n = min; n <= max; n++) {
    const next = n + 1
    const product = n * next
    const equation = `${n} × ${next} = ${product}`
    pool.push({ id: `${n}-product`, kind: 'product', prompt: `${n} × ${next}`, answer: String(product), displayAnswer: equation })
    pool.push({ id: `${n}-start`, kind: 'start', prompt: `_ × _ = ${product}`, answer: String(n), displayAnswer: equation })
  }
  const shuffled = shuffle(pool)
  return count >= shuffled.length ? shuffled : shuffled.slice(0, count)
}

// ---- Statement & Conclusions (coded inequality chains, SBI PO Mains style) ----

export type InequalityRelation = '>' | '≥' | '=' | '≤' | '<'
export type StatementConclusionDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'

const RELATION_SYMBOLS: InequalityRelation[] = ['>', '≥', '=', '≤', '<']

const ANSWER_OPTIONS = [
  'Only conclusion I follows',
  'Only conclusion II follows',
  'Either conclusion I or II follows',
  'Neither conclusion I nor II follows',
  'Both conclusions I and II follow',
] as const

function flipRelation(r: InequalityRelation): InequalityRelation {
  if (r === '>') return '<'
  if (r === '<') return '>'
  if (r === '≥') return '≤'
  if (r === '≤') return '≥'
  return '='
}

function randomRelations(count: number): InequalityRelation[] {
  return Array.from({ length: count }, () => RELATION_SYMBOLS[randomInt(0, RELATION_SYMBOLS.length - 1)])
}

function formatChainText(elements: string[], relations: InequalityRelation[]): string {
  return elements.map((el, idx) => (idx < relations.length ? `${el} ${relations[idx]} ` : el)).join('')
}

interface ChainDescriptor {
  elements: string[]
  relations: InequalityRelation[]
  statementsText: string
  /** Present only for a "broken" (multi-clause) chain: the [start, end) index range within `elements` each clause contributes, in display order. Adjacent ranges overlap by one index at their shared linking element. */
  blocks?: { start: number; end: number }[]
}

function buildSimpleChain(length: number): ChainDescriptor {
  const elements = shuffle(Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))).slice(0, length)
  const relations = randomRelations(length - 1)
  return { elements, relations, statementsText: formatChainText(elements, relations) }
}

/**
 * A "broken" statement: a necklace of separate clauses where each one ends in an element
 * shared with the previous clause, e.g. "L ≤ M < N; O ≥ P = N; Q > R ≥ O" (N links clause 1
 * and 2, O links clause 2 and 3). Solving still needs one continuous chain, so each clause
 * after the first is reversed and its relations flipped, then spliced onto the growing chain
 * at the shared element — e.g. clause 2 here splices in as "= P ≤ O", giving the combined
 * chain L ≤ M < N = P ≤ O ≥ R > Q — and the existing single-chain solver runs on that as
 * usual. Only the display text keeps every clause visually separate.
 */
function buildBrokenChain(blockSizes: number[]): ChainDescriptor {
  const totalUnique = blockSizes.reduce((sum, size) => sum + size, 0) - (blockSizes.length - 1)
  const pool = shuffle(Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))).slice(0, totalUnique)
  let poolIndex = 0
  const takeLetters = (n: number) => pool.slice(poolIndex, (poolIndex += n))

  const firstElements = takeLetters(blockSizes[0])
  const firstRelations = randomRelations(blockSizes[0] - 1)

  let elements = [...firstElements]
  let relations = [...firstRelations]
  const blocks = [{ start: 0, end: firstElements.length }]
  const clauseTexts = [formatChainText(firstElements, firstRelations)]

  for (let i = 1; i < blockSizes.length; i++) {
    const anchor = elements[elements.length - 1]
    const fresh = takeLetters(blockSizes[i] - 1)
    const blockElements = [...fresh, anchor]
    const blockRelations = randomRelations(blockSizes[i] - 1)
    clauseTexts.push(formatChainText(blockElements, blockRelations))

    const start = elements.length - 1
    elements = elements.concat(blockElements.slice(0, -1).reverse())
    relations = relations.concat(blockRelations.slice().reverse().map(flipRelation))
    blocks.push({ start, end: elements.length })
  }

  return { elements, relations, statementsText: clauseTexts.join('; '), blocks }
}

/**
 * The certain relationship between chain positions a and b, found by transitivity: if every
 * link between them is a non-increasing one ('>', '≥', or '='), the left side is definitely
 * >= the right (and strictly > if any link is a strict '>'); symmetrically for non-decreasing
 * links. If the segment contains links pointing BOTH ways (a "peak" or "valley" between a and
 * b), nothing can be inferred — this is the classic trap in these questions. Returns 'none'
 * for that indeterminate case.
 */
function deriveChainRelation(relations: InequalityRelation[], a: number, b: number): InequalityRelation | 'none' {
  if (a === b) return '='
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  const segment = relations.slice(lo, hi)
  const hasDown = segment.some((r) => r === '>' || r === '≥')
  const hasUp = segment.some((r) => r === '<' || r === '≤')
  let result: InequalityRelation
  if (hasDown && hasUp) return 'none'
  if (hasDown) result = segment.some((r) => r === '>') ? '>' : '≥'
  else if (hasUp) result = segment.some((r) => r === '<') ? '<' : '≤'
  else result = '='
  return a === lo ? result : flipRelation(result)
}

/** Whether a stated conclusion is guaranteed true given the certain derived relation between the same two elements. */
function conclusionFollows(derived: InequalityRelation | 'none', stated: InequalityRelation): boolean {
  if (derived === 'none') return false
  if (derived === stated) return true
  if (derived === '>' && stated === '≥') return true
  if (derived === '<' && stated === '≤') return true
  if (derived === '=' && (stated === '≥' || stated === '≤')) return true
  return false
}

interface ConclusionSpec {
  a: number
  b: number
  relation: InequalityRelation
}

/**
 * Combines the truth of both conclusions into one of the five standard answer options,
 * including the "either follows" special case: when neither conclusion is individually
 * guaranteed, but they state the same pair of elements with the two relations that exactly
 * split an ambiguous '≥' (i.e. '>' and '=') or '≤' (i.e. '<' and '=') derived relation, one of
 * them must be true even though we can't tell which.
 */
function resolveStatementAnswer(relations: InequalityRelation[], I: ConclusionSpec, II: ConclusionSpec): string {
  const derivedI = deriveChainRelation(relations, I.a, I.b)
  const derivedII = deriveChainRelation(relations, II.a, II.b)
  const trueI = conclusionFollows(derivedI, I.relation)
  const trueII = conclusionFollows(derivedII, II.relation)

  if (trueI && trueII) return ANSWER_OPTIONS[4]
  if (trueI) return ANSWER_OPTIONS[0]
  if (trueII) return ANSWER_OPTIONS[1]

  const samePair = (I.a === II.a && I.b === II.b) || (I.a === II.b && I.b === II.a)
  if (samePair) {
    const relIINormalized = I.a === II.a ? II.relation : flipRelation(II.relation)
    const pairSet = new Set([I.relation, relIINormalized])
    if (derivedI === '≥' && pairSet.size === 2 && pairSet.has('>') && pairSet.has('=')) return ANSWER_OPTIONS[2]
    if (derivedI === '≤' && pairSet.size === 2 && pairSet.has('<') && pairSet.has('=')) return ANSWER_OPTIONS[2]
  }
  return ANSWER_OPTIONS[3]
}

function relationClause(elements: string[], relations: InequalityRelation[], a: number, b: number): string {
  const derived = deriveChainRelation(relations, a, b)
  if (derived === 'none') return `${elements[a]} vs ${elements[b]}: the chain changes direction between them, so no certain relationship can be derived.`
  return `${elements[a]} vs ${elements[b]}: the chain gives ${elements[a]} ${derived} ${elements[b]}.`
}

function randomPair(length: number): { a: number; b: number } {
  const a = randomInt(0, length - 1)
  let b = randomInt(0, length - 1)
  while (b === a) b = randomInt(0, length - 1)
  return { a, b }
}

/** A pair with one element from each of two distinct clauses of a broken chain, so the conclusion actually exercises a shared link rather than staying within one clause. */
function randomCrossBlockPair(blocks: { start: number; end: number }[]): { a: number; b: number } {
  const i = randomInt(0, blocks.length - 1)
  let j = randomInt(0, blocks.length - 1)
  while (j === i) j = randomInt(0, blocks.length - 1)
  const a = randomInt(blocks[i].start, blocks[i].end - 1)
  const b = randomInt(blocks[j].start, blocks[j].end - 1)
  return { a, b }
}

function generateOneStatementQuestion(chain: ChainDescriptor, uniqueSuffix: number): MCQQuestion {
  const { elements, relations, statementsText, blocks } = chain
  const chainLength = elements.length
  const pickPair = () => (blocks && Math.random() < 0.7 ? randomCrossBlockPair(blocks) : randomPair(chainLength))

  const posI = pickPair()
  const useSamePair = Math.random() < 0.55
  const posII = useSamePair ? (Math.random() < 0.5 ? { a: posI.a, b: posI.b } : { a: posI.b, b: posI.a }) : pickPair()

  const derivedI = deriveChainRelation(relations, posI.a, posI.b)
  let relI: InequalityRelation
  let relII: InequalityRelation

  if (useSamePair && (derivedI === '≥' || derivedI === '≤') && Math.random() < 0.6) {
    // Deliberately bait the classic "either follows" case fairly often, since it's rare by pure chance.
    const pair = shuffle<InequalityRelation>(derivedI === '≥' ? ['>', '='] : ['<', '='])
    relI = pair[0]
    relII = posII.a === posI.a ? pair[1] : flipRelation(pair[1])
  } else {
    relI = RELATION_SYMBOLS[randomInt(0, RELATION_SYMBOLS.length - 1)]
    relII = RELATION_SYMBOLS[randomInt(0, RELATION_SYMBOLS.length - 1)]
    if (useSamePair) {
      const normalizedRelII = posII.a === posI.a ? relII : flipRelation(relII)
      if (normalizedRelII === relI) {
        const alt = RELATION_SYMBOLS.filter((r) => r !== normalizedRelII)
        const picked = alt[randomInt(0, alt.length - 1)]
        relII = posII.a === posI.a ? picked : flipRelation(picked)
      }
    }
  }

  const conclusionI: ConclusionSpec = { a: posI.a, b: posI.b, relation: relI }
  const conclusionII: ConclusionSpec = { a: posII.a, b: posII.b, relation: relII }
  const answer = resolveStatementAnswer(relations, conclusionI, conclusionII)

  const term =
    `Statements:\n${statementsText}\n\n` +
    `Conclusions:\nI. ${elements[conclusionI.a]} ${conclusionI.relation} ${elements[conclusionI.b]}` +
    `\nII. ${elements[conclusionII.a]} ${conclusionII.relation} ${elements[conclusionII.b]}`

  return {
    id: `stmt-${uniqueSuffix}-${elements.join('')}`,
    term,
    correctMeaning: answer,
    options: [...ANSWER_OPTIONS],
    hint: `${relationClause(elements, relations, conclusionI.a, conclusionI.b)} ${relationClause(elements, relations, conclusionII.a, conclusionII.b)}`,
  }
}

type StatementTier = 'easy' | 'medium' | 'hard'

/** Chain length for a plain (non-broken) statement: 3-4 elements (easy) up to 8-10 (hard). */
function simpleChainLengthFor(tier: StatementTier): number {
  if (tier === 'easy') return randomInt(3, 4)
  if (tier === 'medium') return randomInt(5, 7)
  return randomInt(8, 10)
}

/**
 * Clause sizes for a broken statement: easy is always two 3-element clauses (matching the
 * simplest real exam form); medium is three clauses each mixing 3-4 elements; hard is four
 * clauses each with more than three elements.
 */
function brokenBlockSizesFor(tier: StatementTier): number[] {
  if (tier === 'easy') return [3, 3]
  if (tier === 'medium') return [randomInt(3, 4), randomInt(3, 4), randomInt(3, 4)]
  return [randomInt(4, 5), randomInt(4, 5), randomInt(4, 5), randomInt(4, 5)]
}

const STATEMENT_TIERS: StatementTier[] = ['easy', 'medium', 'hard']

/**
 * "Statements & Conclusions" (coded inequality) questions: a chain of elements linked by >,
 * ≥, =, ≤, < is given, followed by two conclusions comparing some pair of elements from it.
 * About two-thirds of questions instead give a "broken" statement — several separate clauses
 * each sharing one linking element with the next, e.g. "L ≤ M < N; O ≥ P = N" — which must be
 * spliced together before the same transitivity rules apply. The answer is always one of the
 * five standard options (only I / only II / either / neither / both), matching the fixed
 * answer key used for this question type in exams like SBI PO Mains. 'mixed' picks a tier
 * independently for each question rather than blending the ranges together.
 */
export function generateStatementConclusionQuestions(difficulty: StatementConclusionDifficulty, count: number): MCQQuestion[] {
  const seen = new Set<string>()
  const questions: MCQQuestion[] = []
  let attempts = 0
  const maxAttempts = count * 30
  while (questions.length < count && attempts < maxAttempts) {
    attempts++
    const tier = difficulty === 'mixed' ? STATEMENT_TIERS[randomInt(0, STATEMENT_TIERS.length - 1)] : difficulty
    const chain = Math.random() < 2 / 3 ? buildBrokenChain(brokenBlockSizesFor(tier)) : buildSimpleChain(simpleChainLengthFor(tier))
    const question = generateOneStatementQuestion(chain, attempts)
    if (seen.has(question.term)) continue
    seen.add(question.term)
    questions.push(question)
  }
  return questions
}

export type PercentDegreeDirection = 'percent-to-degree' | 'degree-to-percent' | 'mixed'

/**
 * Percentage <-> degree conversions for pie-chart-style questions: a full circle is 360deg =
 * 100%, so 1% = 3.6deg. Restricted to 5%-step percentages (5, 10, ..., 100) since those are
 * exactly the ones that convert to a whole number of degrees in both directions.
 */
export function generatePercentDegreeQuestions(direction: PercentDegreeDirection, count: number): Question[] {
  const directions: ('percent-to-degree' | 'degree-to-percent')[] = direction === 'mixed' ? ['percent-to-degree', 'degree-to-percent'] : [direction]
  const pool: Question[] = []
  for (let percent = 5; percent <= 100; percent += 5) {
    const degrees = (percent / 5) * 18
    for (const dir of directions) {
      pool.push(
        dir === 'percent-to-degree'
          ? { id: `p2d-${percent}`, prompt: `${percent}%`, answer: degrees, displayAnswer: `${degrees}°` }
          : { id: `d2p-${percent}`, prompt: `${degrees}°`, answer: percent, displayAnswer: `${percent}%` },
      )
    }
  }
  const shuffled = shuffle(pool)
  return count >= shuffled.length ? shuffled : shuffled.slice(0, count)
}
