// Powers: "2 power 8 = _". The player picks which bases (any of 2 to 10, or a range) and which powers (a range inside 2 to 10);
// every base is paired with every power in that range, so the whole pool is bases × powers (at most 9 × 9 = 81 questions).
// Answers are exact: the biggest, 10 to the power 10, is 10,000,000,000, well inside what a JS number holds without rounding.
import { shuffle } from './generators'

export const BASE_LIMIT = { min: 2, max: 10 }
export const POWER_LIMIT = { min: 2, max: 10 }

export interface PowerQuestion {
  id: string
  base: number
  exp: number
  answer: number
}

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹'

/** 10 → "¹⁰" */
export const superscript = (n: number) => [...String(n)].map((d) => SUPERSCRIPT[Number(d)]).join('')

/** "2⁸" */
export const powerText = (base: number, exp: number) => `${base}${superscript(exp)}`

/** 256 → "256", 10000000000 → "10,000,000,000" */
export const formatAnswer = (n: number) => n.toLocaleString('en-US')

export const BASES = Array.from({ length: BASE_LIMIT.max - BASE_LIMIT.min + 1 }, (_, i) => BASE_LIMIT.min + i)

/** Every question the chosen bases and power range allow, ordered by base then power. */
export function buildPool(bases: readonly number[], powerFrom: number, powerTo: number): PowerQuestion[] {
  const lo = Math.max(POWER_LIMIT.min, Math.min(powerFrom, powerTo))
  const hi = Math.min(POWER_LIMIT.max, Math.max(powerFrom, powerTo))
  const chosen = [...new Set(bases)].filter((b) => b >= BASE_LIMIT.min && b <= BASE_LIMIT.max).sort((a, b) => a - b)
  const pool: PowerQuestion[] = []
  for (const base of chosen) {
    for (let exp = lo; exp <= hi; exp++) pool.push({ id: `pw-${base}-${exp}`, base, exp, answer: base ** exp })
  }
  return pool
}

/** A random session: no question twice, so at most the whole pool. */
export function generatePowerQuestions(bases: readonly number[], powerFrom: number, powerTo: number, count: number): PowerQuestion[] {
  return shuffle(buildPool(bases, powerFrom, powerTo)).slice(0, count)
}

/** What was typed, as a whole number; null when it is empty or not a plain number. Commas and spaces are ignored. */
export function parseAnswer(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, '')
  return /^\d{1,12}$/.test(cleaned) ? Number(cleaned) : null
}
