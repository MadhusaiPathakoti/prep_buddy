// Factor Pairs: the game shows a number such as 72 = _ × _ and the player types every pair of whole numbers that
// multiply to it (8 × 9, 4 × 18 …). Order does not matter — 8 × 9 and 9 × 8 are the same pair — so each pair is kept once,
// stored smaller-first. When the round ends, the full list is shown.
//
// Which numbers come up is chosen by the filters in FactorSettings: either a plain number range (50 to 200), or the products
// of a table range and a multiplier range (11 to 19 table × 11 to 20 gives 121 … 380). Extra filters decide what counts as a
// pair (include 1 × N, limit the size of the factors) and how rich a number must be (at least N pairs).
import { shuffle } from './generators'

export type FactorSource = 'range' | 'tables'
export type Pair = readonly [number, number]

export interface FactorSettings {
  source: FactorSource
  /** source = 'range': the numbers to factorise. */
  numFrom: number
  numTo: number
  /** source = 'tables': numbers are tableFrom…tableTo times multFrom…multTo (every distinct product). */
  tableFrom: number
  tableTo: number
  multFrom: number
  multTo: number
  /** Count 1 × N as a pair. */
  includeOne: boolean
  /** Only count pairs whose two factors both lie in factorMin…factorMax. */
  limitFactors: boolean
  factorMin: number
  factorMax: number
  /** A number needs at least this many pairs (after the two filters above) to be asked. */
  minPairs: number
  /** Show "3 of 6 found" while playing (the count is a hint). */
  showCount: boolean
}

export const NUM_LIMIT = { min: 2, max: 2500 }
export const TABLE_LIMIT = { min: 2, max: 50 }
export const FACTOR_LIMIT = { min: 1, max: 2500 }

export const DEFAULT_SETTINGS: FactorSettings = {
  source: 'range',
  numFrom: 20,
  numTo: 100,
  tableFrom: 11,
  tableTo: 19,
  multFrom: 11,
  multTo: 20,
  includeOne: true,
  limitFactors: false,
  factorMin: 2,
  factorMax: 30,
  minPairs: 2,
  showCount: true,
}

export interface FactorQuestion {
  id: string
  n: number
  /** Every valid pair under the current filters, smaller factor first, ordered by the smaller factor. */
  pairs: Pair[]
}

export function pairKey(a: number, b: number): string {
  return a <= b ? `${a}x${b}` : `${b}x${a}`
}

export function pairText(p: Pair): string {
  return `${p[0]} × ${p[1]}`
}

/** All pairs a ≤ b with a × b = n that pass the pair filters. */
export function factorPairsOf(n: number, s: Pick<FactorSettings, 'includeOne' | 'limitFactors' | 'factorMin' | 'factorMax'>): Pair[] {
  const out: Pair[] = []
  for (let a = 1; a * a <= n; a++) {
    if (n % a !== 0) continue
    const b = n / a
    if (a === 1 && !s.includeOne) continue
    if (s.limitFactors && (a < s.factorMin || b > s.factorMax || a > s.factorMax || b < s.factorMin)) continue
    out.push([a, b])
  }
  return out
}

/** Numbers the chosen source can produce, ascending and without repeats. */
export function candidateNumbers(s: FactorSettings): number[] {
  if (s.source === 'range') {
    const lo = Math.min(s.numFrom, s.numTo)
    const hi = Math.max(s.numFrom, s.numTo)
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
  }
  const set = new Set<number>()
  for (let t = Math.min(s.tableFrom, s.tableTo); t <= Math.max(s.tableFrom, s.tableTo); t++) {
    for (let m = Math.min(s.multFrom, s.multTo); m <= Math.max(s.multFrom, s.multTo); m++) set.add(t * m)
  }
  return [...set].sort((x, y) => x - y)
}

/** Every question the filters allow (the pool a session draws from). */
export function buildPool(s: FactorSettings): FactorQuestion[] {
  const need = Math.max(1, s.minPairs)
  const pool: FactorQuestion[] = []
  for (const n of candidateNumbers(s)) {
    const pairs = factorPairsOf(n, s)
    if (pairs.length >= need) pool.push({ id: `fp-${n}`, n, pairs })
  }
  return pool
}

export function generateFactorQuestions(s: FactorSettings, count: number): FactorQuestion[] {
  return shuffle(buildPool(s)).slice(0, count)
}

export type EntryResult =
  | { kind: 'new'; pair: Pair }
  /** A correct pair that was already entered (in either order). */
  | { kind: 'dup'; pair: Pair }
  /** The product is not n. */
  | { kind: 'wrong'; product: number }
  /** The product is n, but the filters do not count this pair (1 × N switched off, or a factor outside the limit). */
  | { kind: 'excluded'; pair: Pair; reason: string }

/** Judge one typed pair against the question; `found` holds the pairKeys already entered this round. */
export function checkEntry(q: FactorQuestion, a: number, b: number, s: FactorSettings, found: ReadonlySet<string>): EntryResult {
  const product = a * b
  if (product !== q.n) return { kind: 'wrong', product }
  const pair: Pair = a <= b ? [a, b] : [b, a]
  const key = pairKey(a, b)
  if (found.has(key)) return { kind: 'dup', pair }
  if (q.pairs.some((p) => pairKey(p[0], p[1]) === key)) return { kind: 'new', pair }
  if (pair[0] === 1 && !s.includeOne) return { kind: 'excluded', pair, reason: '1 × N is switched off in the settings' }
  return { kind: 'excluded', pair, reason: `factors must be between ${s.factorMin} and ${s.factorMax}` }
}

/** What the player typed, as two whole numbers; null when either box is empty or not a number. */
export function parseEntry(left: string, right: string): [number, number] | null {
  if (!/^\d{1,6}$/.test(left.trim()) || !/^\d{1,6}$/.test(right.trim())) return null
  return [Number(left), Number(right)]
}

export function describeSettings(s: FactorSettings): string {
  const lo = (a: number, b: number) => Math.min(a, b)
  const hi = (a: number, b: number) => Math.max(a, b)
  const base =
    s.source === 'range'
      ? `Numbers ${lo(s.numFrom, s.numTo)}–${hi(s.numFrom, s.numTo)}`
      : `Tables ${lo(s.tableFrom, s.tableTo)}–${hi(s.tableFrom, s.tableTo)} × ${lo(s.multFrom, s.multTo)}–${hi(s.multFrom, s.multTo)}`
  return base
}
