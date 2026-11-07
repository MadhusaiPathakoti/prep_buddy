import type { Question } from './types'

/** Small helpers shared by the mental-math generators. */

export const rnd = (n: number) => Math.floor(Math.random() * n)
export const between = (lo: number, hi: number) => lo + rnd(hi - lo + 1)
export const chance = (p: number) => Math.random() < p
export const pick = <T,>(a: readonly T[]): T => a[rnd(a.length)]

export function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b)
}

/** Round away floating-point noise: 0.1 + 0.2 → 0.3. */
export const clean = (n: number, places = 6) => Math.round(n * 10 ** places) / 10 ** places

/** True when the number has at most `places` decimals (so it can be typed exactly). */
export const hasAtMostDecimals = (n: number, places: number) => Math.abs(n * 10 ** places - Math.round(n * 10 ** places)) < 1e-7

/** "12.5", "40", "0.25" — no trailing zeros, up to 2 decimals. */
export function fmt(n: number): string {
  const r = Math.round(n * 100) / 100
  return Number.isInteger(r) ? String(r) : String(r).replace(/(\.\d*?)0+$/, '$1')
}

/** 1234567 → "12,34,567"-free grouping: plain western commas are fine for the exam-style numbers used here. */
export const withCommas = (n: number) => n.toLocaleString('en-US')

let counter = 0
export const qid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`

export function intQuestion(prefix: string, prompt: string, answer: number, note: string, extra: Partial<Question> = {}): Question {
  return { id: qid(prefix), prompt, answer, displayAnswer: String(answer), note, ...extra }
}

/** Generates `count` items by calling `make` until it returns something; gives up after plenty of tries. */
export function collect<T>(count: number, make: () => T | null, tries = 200): T[] {
  const out: T[] = []
  let guard = 0
  while (out.length < count && guard++ < count * tries) {
    const q = make()
    if (q) out.push(q)
  }
  return out
}
