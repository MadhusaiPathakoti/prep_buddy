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

/**
 * For answers that may be whole or decimal (12, 12.5, 7.52): correct as soon as the number matches; wrong as soon as as
 * many digits have been typed as the exact answer has (so a wrong whole number is flagged immediately, not after Enter).
 */
export function validateExact(raw: string, answer: number): CheckResult {
  if (raw.trim() === '') return 'incomplete'
  const n = Number(raw)
  if (Number.isNaN(n)) return 'incomplete'
  if (Math.abs(n - answer) < 1e-9) return 'correct'
  const expected = String(Math.round(answer * 100) / 100).replace(/[^0-9]/g, '').length
  if (raw.replace(/[^0-9]/g, '').length >= expected) return 'wrong'
  return 'incomplete'
}
