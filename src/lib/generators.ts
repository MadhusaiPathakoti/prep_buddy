import type { BankEntry, Difficulty, Question } from './types'

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
