import type { Question } from './types'
import { between, collect, pick, qid } from './mentalMath'

/**
 * Missing Digit: one digit of a sum, a product or a divisibility statement is hidden (□). The answer is the single
 * digit that makes it true — checked by brute force, so there is exactly one possible digit.
 *
 *   sum        417 + 5□8 + 296 = 1,261
 *   product    47 × 38 = 17□6
 *   divisible  4□382 is divisible by 11
 */

export type MissingDigitDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'
export type MissingDigitMode = 'mixed' | 'product' | 'sum' | 'divisible'
type Level = 'easy' | 'medium' | 'hard'

const BLANK = '□'
const digitSum = (n: number) => String(n).split('').reduce((s, d) => s + Number(d), 0)
const num = (lo: number, hi: number) => between(lo, hi)
const pad = (n: number) => n.toLocaleString('en-US')

interface Slot {
  digits: string
  hiddenAt: number | null
}

/** Show one number with its hidden digit (if any). Commas are skipped so the digit positions stay obvious. */
const shown = (s: Slot) => (s.hiddenAt === null ? s.digits : s.digits.slice(0, s.hiddenAt) + BLANK + s.digits.slice(s.hiddenAt + 1))

/** Digit-sum (casting out nines) clue for a blank inside the product. */
function nineClue(a: number, b: number, c: number, hiddenAt: number): string {
  const digits = String(c).split('')
  const known = digits.reduce((s, d, i) => (i === hiddenAt ? s : s + Number(d)), 0)
  const target = ((digitSum(a) % 9) * (digitSum(b) % 9)) % 9
  const candidates = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => (known + d) % 9 === target)
  const fits = candidates.length === 1 ? `so the hidden digit is ${candidates[0]}` : `so the hidden digit is ${candidates.join(' or ')} — the last digit settles which`
  return `Digit-sum check: ${a} → ${digitSum(a) % 9}, ${b} → ${digitSum(b) % 9}; product → ${target} (mod 9). Known digits of the answer add to ${known}, ${fits}.`
}

function product(level: Level): Question | null {
  const [la, lb] = level === 'easy' ? [[11, 99], [3, 9]] : level === 'medium' ? [[11, 99], [11, 99]] : [[101, 999], [11, 99]]
  const a = num(la[0], la[1])
  const b = num(lb[0], lb[1])
  const c = a * b
  const where = pick(level === 'easy' ? (['c', 'c', 'a'] as const) : (['c', 'c', 'a', 'b'] as const))
  const slots = { a: { digits: String(a), hiddenAt: null as number | null }, b: { digits: String(b), hiddenAt: null as number | null }, c: { digits: String(c), hiddenAt: null as number | null } }
  const len = slots[where].digits.length
  const idx = between(0, len - 1)
  slots[where].hiddenAt = idx
  const answer = Number(slots[where].digits[idx])
  const prompt = `${shown(slots.a)} × ${shown(slots.b)} = ${shown(slots.c)}`
  const note =
    where === 'c'
      ? `${a} × ${b} = ${c}, so the hidden digit is ${answer}.\n${nineClue(a, b, c, idx)}`
      : where === 'a'
        ? `${c} ÷ ${b} = ${a}, so the hidden digit is ${answer}.`
        : `${c} ÷ ${a} = ${b}, so the hidden digit is ${answer}.`
  if (where !== 'c' && slots[where].hiddenAt === 0 && answer === 0) return null
  return { id: qid('md'), prompt, answer, displayAnswer: String(answer), note, reviewPrompt: prompt, reviewJoiner: ' → ' }
}

function sum(level: Level): Question | null {
  const count = level === 'easy' ? 3 : level === 'medium' ? 3 : 4
  const [lo, hi] = level === 'easy' ? [11, 99] : level === 'medium' ? [101, 999] : [1001, 9999]
  const parts = Array.from({ length: count }, () => num(lo, hi))
  const total = parts.reduce((s, v) => s + v, 0)
  const items = [...parts, total]
  const which = pick(items.map((_, i) => i))
  const strs = items.map((v) => String(v))
  const idx = between(0, strs[which].length - 1)
  const answer = Number(strs[which][idx])
  if (idx === 0 && answer === 0) return null
  const shownItems = strs.map((d, i) => (i === which ? d.slice(0, idx) + BLANK + d.slice(idx + 1) : d))
  const prompt = `${shownItems.slice(0, count).join(' + ')} = ${shownItems[count]}`
  const note = `${parts.join(' + ')} = ${pad(total)}, so the hidden digit is ${answer}.
Tip: the last digits add on their own (a quick check), then confirm with digit sums.`
  return { id: qid('md'), prompt, answer, displayAnswer: String(answer), note, reviewPrompt: prompt, reviewJoiner: ' → ' }
}

function divisible(): Question | null {
  const divisor = pick([7, 11, 13] as const)
  const len = between(4, 6)
  const base = String(num(10 ** (len - 1), 10 ** len - 1))
  const idx = between(1, len - 1) // never the first digit
  const works: number[] = []
  for (let d = 0; d <= 9; d++) {
    const n = Number(base.slice(0, idx) + d + base.slice(idx + 1))
    if (n % divisor === 0) works.push(d)
  }
  if (works.length !== 1) return null
  const answer = works[0]
  const full = Number(base.slice(0, idx) + answer + base.slice(idx + 1))
  const prompt = `${base.slice(0, idx)}${BLANK}${base.slice(idx + 1)} is divisible by ${divisor}`
  const rule =
    divisor === 11
      ? `Rule for 11: (sum of digits in odd places) − (sum in even places) must be 0 or a multiple of 11.`
      : divisor === 7
        ? `Rule for 7: double the last digit and subtract it from the rest, repeat; the result must be 0 or a multiple of 7.`
        : `Rule for 13: add 4 × the last digit to the rest, repeat; the result must be 0 or a multiple of 13.`
  const note = `${rule}\nOnly the digit ${answer} works: ${pad(full)} = ${divisor} × ${pad(full / divisor)}.`
  return { id: qid('md'), prompt, answer, displayAnswer: String(answer), note, reviewPrompt: prompt, reviewJoiner: ' → ' }
}

export function generateMissingDigitQuestions(difficulty: MissingDigitDifficulty, mode: MissingDigitMode, count: number): Question[] {
  let i = 0
  return collect(count, () => {
    const level: Level = difficulty === 'mixed' ? (['easy', 'medium', 'hard'] as Level[])[i++ % 3] : difficulty
    const m = mode === 'mixed' ? pick(level === 'hard' ? (['product', 'sum', 'divisible'] as const) : (['product', 'sum'] as const)) : mode
    if (m === 'divisible') return divisible()
    return m === 'product' ? product(level) : sum(level)
  })
}
