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

export interface MCQQuestion {
  id: string
  term: string
  correctMeaning: string
  options: string[]
  hint: string
}

/** MCQ questions: pick an entry from a bank (vocabulary, idioms, ...) at the chosen difficulty, with 3 wrong meanings as distractors. */
export function generateMCQQuestions(bank: BankEntry[], difficulty: Difficulty, count: number): MCQQuestion[] {
  const pool = bank.filter((w) => w.difficulty === difficulty)
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
