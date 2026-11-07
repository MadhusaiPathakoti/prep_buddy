import type { Question } from './types'
import { between, chance, gcd, pick, qid } from './mentalMath'

/**
 * Beat the Clock sprint: one question at a time, difficulty rises as you stay accurate.
 * Ten levels, each with whole-number answers:
 *   1 two-digit + one-digit      6 two-digit × two-digit (11–25)
 *   2 two-digit ± two-digit      7 exact division (3-digit ÷ 1–2 digit)
 *   3 tables up to 12            8 percentages of friendly numbers
 *   4 two-digit × one-digit      9 squares / near-100 products
 *   5 three-digit ± two-digit   10 three-step expressions
 */

export const MAX_LEVEL = 10

export const LEVEL_LABELS = [
  '',
  '2-digit + 1-digit',
  '2-digit ± 2-digit',
  'Tables to 12',
  '2-digit × 1-digit',
  '3-digit ± 2-digit',
  '2-digit × 2-digit',
  'Division',
  'Percentages',
  'Squares & near-100',
  'Mixed expressions',
]

const q = (prompt: string, answer: number): Question => ({ id: qid('sp'), prompt, answer, displayAnswer: String(answer) })

export function sprintQuestion(level: number): Question {
  switch (level) {
    case 1: {
      const a = between(11, 59)
      const b = between(2, 9)
      return q(`${a} + ${b}`, a + b)
    }
    case 2: {
      const a = between(21, 99)
      const b = between(11, 79)
      if (chance(0.5)) return q(`${a} + ${b}`, a + b)
      const [hi, lo] = a > b ? [a, b] : [b, a]
      return q(`${hi} − ${lo}`, hi - lo)
    }
    case 3: {
      const a = between(6, 12)
      const b = between(6, 12)
      return q(`${a} × ${b}`, a * b)
    }
    case 4: {
      const a = between(12, 49)
      const b = between(3, 9)
      return q(`${a} × ${b}`, a * b)
    }
    case 5: {
      const a = between(120, 899)
      const b = between(21, 99)
      if (chance(0.5)) return q(`${a} + ${b}`, a + b)
      return q(`${a} − ${b}`, a - b)
    }
    case 6: {
      const a = between(11, 25)
      const b = between(11, 25)
      return q(`${a} × ${b}`, a * b)
    }
    case 7: {
      const d = pick([3, 4, 6, 7, 8, 9, 12, 13, 15])
      const k = between(12, Math.min(90, Math.floor(999 / d)))
      return q(`${d * k} ÷ ${d}`, k)
    }
    case 8: {
      const p = pick([10, 20, 25, 30, 40, 50, 60, 75, 15, 35, 45, 12.5])
      const g = p === 12.5 ? 8 : 100 / gcd(100, p)
      const n = g * between(Math.ceil(30 / g), Math.floor(900 / g))
      return q(`${p}% of ${n}`, (p * n) / 100)
    }
    case 9: {
      if (chance(0.5)) {
        const a = between(21, 49)
        return q(`${a}²`, a * a)
      }
      const a = 100 - between(2, 12)
      const b = 100 - between(2, 12)
      return q(`${a} × ${b}`, a * b)
    }
    default: {
      const a = between(12, 40)
      const b = between(3, 9)
      const c = between(20, 99)
      const d = between(10, 60)
      const form = between(0, 2)
      if (form === 0) return q(`${a} × ${b} + ${c}`, a * b + c)
      if (form === 1) {
        const total = a * b
        return total > d ? q(`${a} × ${b} − ${d}`, total - d) : q(`${a} × ${b} + ${d}`, total + d)
      }
      const e = pick([2, 4, 5, 8])
      return q(`${e * c} ÷ ${e} + ${d}`, c + d)
    }
  }
}
