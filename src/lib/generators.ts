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

export function generateSquaresCubesQuestions(min: number, max: number, mode: SquareCubeMode, count: number): Question[] {
  const pool: Question[] = []
  for (let n = min; n <= max; n++) {
    if (mode === 'square' || mode === 'mixed') {
      const answer = n * n
      pool.push({ id: `sq-${n}`, prompt: `${n}²`, answer, displayAnswer: String(answer) })
    }
    if (mode === 'cube' || mode === 'mixed') {
      const answer = n * n * n
      pool.push({ id: `cb-${n}`, prompt: `${n}³`, answer, displayAnswer: String(answer) })
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
