import type { CheckResult } from './types'

/** For whole-number answers (tables, squares, cubes). Checks as soon as the digit count matches. */
export function validateInteger(raw: string, answer: number): CheckResult {
  if (raw.trim() === '') return 'incomplete'
  const n = Number(raw)
  if (Number.isNaN(n)) return 'incomplete'
  if (n === answer) return 'correct'
  if (raw.replace(/[^0-9]/g, '').length >= String(Math.abs(answer)).length) return 'wrong'
  return 'incomplete'
}

/** For percentage answers with up to 2 decimals (ratios game). */
export function validateDecimal(raw: string, answer: number): CheckResult {
  if (raw.trim() === '') return 'incomplete'
  const n = Number(raw)
  if (Number.isNaN(n)) return 'incomplete'
  if (Math.abs(n - answer) < 0.005) return 'correct'
  const digitsTyped = raw.replace(/[^0-9]/g, '').length
  const digitsExpected = answer.toFixed(2).replace(/[^0-9]/g, '').length
  if (digitsTyped >= digitsExpected) return 'wrong'
  return 'incomplete'
}
