import type { Rng } from './rng'

export const NONE_OF_THESE = 'None of these'

/** Fixed (never shuffled) option sets used by the real papers' formulaic question types. */
export const QUADRATIC_OPTIONS = ['x > y', 'x ≥ y', 'x < y', 'x ≤ y', 'x = y or the relationship cannot be established']
export const QUANTITY_OPTIONS = [
  'Quantity I > Quantity II',
  'Quantity I ≥ Quantity II',
  'Quantity II > Quantity I',
  'Quantity II ≥ Quantity I',
  'Quantity I = Quantity II or no relation can be established',
]

export interface BuiltOptions {
  options: string[]
  answer: number
  /** true when the correct choice is the literal "None of these" option (the computed value is NOT among the options). */
  answerIsNone: boolean
}

export interface BuildOptionsInit {
  /** 'asc' / 'desc' sorts numerically when every option parses as a number (the usual exam layout). Default: shuffle. */
  sort?: 'asc' | 'desc'
  /**
   * Probability (0–1) that option E is "None of these". When it is used, half the time it is the
   * correct answer (the computed value is then withheld from the options) and half the time it is a distractor.
   */
  noneProb?: number
}

function numericValue(s: string): number | null {
  const cleaned = s.replace(/[,%₹\s]|Rs\.?/g, '').replace('−', '-')
  if (cleaned === '' || !/^-?\d*\.?\d+$/.test(cleaned)) return null
  return Number(cleaned)
}

/** Lays out 5 options (A–E) from the correct answer and a pool of distractors. Throws if fewer than 4 distinct distractors exist. */
export function buildOptions(rng: Rng, correct: string, distractors: string[], init: BuildOptionsInit = {}): BuiltOptions {
  const correctKey = correct.trim()
  const seen = new Set<string>([correctKey, NONE_OF_THESE])
  const pool: string[] = []
  for (const d of distractors) {
    const k = d.trim()
    if (k === '' || seen.has(k)) continue
    seen.add(k)
    pool.push(k)
  }
  if (pool.length < 4) throw new Error(`buildOptions: need at least 4 distinct distractors, got ${pool.length} for "${correct}"`)

  const useNone = init.noneProb !== undefined && rng.chance(init.noneProb)
  const noneIsCorrect = useNone && rng.chance(0.5)
  const shuffled = rng.shuffle(pool)

  let body: string[]
  if (!useNone) body = [correctKey, ...shuffled.slice(0, 4)]
  else if (noneIsCorrect) body = shuffled.slice(0, 4)
  else body = [correctKey, ...shuffled.slice(0, 3)]

  const values = body.map(numericValue)
  if (init.sort && values.every((v) => v !== null)) {
    const dir = init.sort === 'asc' ? 1 : -1
    body = body
      .map((text, i) => ({ text, v: values[i] as number }))
      .sort((a, b) => (a.v - b.v) * dir)
      .map((x) => x.text)
  } else {
    body = rng.shuffle(body)
  }

  const options = useNone ? [...body, NONE_OF_THESE] : body
  const answer = noneIsCorrect ? 4 : options.indexOf(correctKey)
  return { options, answer, answerIsNone: noneIsCorrect }
}

/** "Correct answer: (C) 24" line generators append to explanations so the text always matches the final layout. */
export function answerLine(built: BuiltOptions, correct: string): string {
  const letter = 'ABCDE'[built.answer]
  if (built.answerIsNone) return `Correct answer: (${letter}) ${NONE_OF_THESE} — the correct value, ${correct}, is not among the options.`
  return `Correct answer: (${letter}) ${correct}`
}

/** Formats a number without float noise: up to `decimals` places, trailing zeros trimmed. */
export function fmtNum(n: number, decimals = 2): string {
  const r = Number(n.toFixed(decimals))
  return Object.is(r, -0) ? '0' : String(r)
}

/**
 * Plausible wrong numeric answers near `correct` (never equal to it, never duplicated, positive when
 * `correct` is positive). Returns formatted strings. Generators should still add method-specific
 * distractors (the value a common mistake produces) and pass them through buildOptions first.
 */
export function numericDistractors(rng: Rng, correct: number, opts: { decimals?: number; count?: number } = {}): string[] {
  const decimals = opts.decimals ?? 0
  const count = opts.count ?? 6
  const step = 10 ** -decimals
  const out = new Set<string>()
  const correctStr = fmtNum(correct, decimals)
  const tries = [
    () => correct * (1 + rng.pick([-0.25, -0.2, -0.15, -0.1, -0.05, 0.05, 0.1, 0.15, 0.2, 0.25, 0.5])),
    () => correct + step * rng.int(1, 12) * rng.pick([-1, 1]),
    () => correct * rng.pick([2, 0.5, 1.5, 3]),
    () => correct + Math.max(1, Math.abs(correct) * 0.02) * rng.int(1, 6) * rng.pick([-1, 1]),
  ]
  let guard = 0
  while (out.size < count && guard++ < 200) {
    let v = rng.pick(tries)()
    v = Number(v.toFixed(decimals))
    if (correct > 0 && v <= 0) continue
    const s = fmtNum(v, decimals)
    if (s === correctStr || out.has(s)) continue
    out.add(s)
  }
  return [...out]
}
