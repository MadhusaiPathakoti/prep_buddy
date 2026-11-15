import { between, chance, collect, pick, qid } from './mentalMath'

/**
 * Surds comparison. An expression is a short sum of terms `coef × √rad` (rad = 1 means a plain integer), e.g. 3√2 or √2 + √3.
 * The answer is always the EXACT relation (<, > or =). "≤" and "≥" are offered as answer buttons but are never the exact
 * relation, so they are traps: they are true whenever < (or >) or = is, but not as precise as possible.
 */

export interface Term {
  coef: number
  rad: number
  /** Subtracted rather than added (only ever on a non-first term). */
  neg?: boolean
}
export type Expr = Term[]

export type Relation = '<' | '>' | '='
export const RELATION_CHOICES = ['<', '>', '≤', '≥', '='] as const
export type RelationChoice = (typeof RELATION_CHOICES)[number]

export type SurdDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'
type Level = 'easy' | 'medium' | 'hard'

export interface SurdQuestion {
  id: string
  left: Expr
  right: Expr
  leftValue: number
  rightValue: number
  /** The exact relation between left and right. */
  answer: Relation
  /** The quick way to decide it without a calculator. */
  note: string
}

// ─── Values and text ─────────────────────────────────────────────────────────

/** Non-perfect-square radicands from 2 to 20. */
export const SURD_RADICANDS = [2, 3, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20]

export const termValue = (t: Term) => (t.neg ? -1 : 1) * t.coef * Math.sqrt(t.rad)
export const exprValue = (e: Expr) => e.reduce((sum, t) => sum + termValue(t), 0)
/** Decimal values are always shown to 4 places. */
export const fmtValue = (x: number) => x.toFixed(4)

function termBody(t: Term): string {
  if (t.rad === 1) return String(t.coef)
  return `${t.coef === 1 ? '' : t.coef}√${t.rad}`
}

/** Plain-text form, e.g. "3√2" or "√2 + √3". */
export function exprText(e: Expr): string {
  return e.map((t, i) => (i === 0 ? `${t.neg ? '−' : ''}${termBody(t)}` : ` ${t.neg ? '−' : '+'} ${termBody(t)}`)).join('')
}

export interface SurdRow {
  n: number
  value: number
  /** The simplified form when it differs from √n (√12 = 2√3), or the integer root for a perfect square. */
  simplified: string | null
}

/** √2 … √20 with their values and simplified forms, for the "view surds" table. */
export function surdTable(from = 2, to = 20): SurdRow[] {
  const rows: SurdRow[] = []
  for (let n = from; n <= to; n++) {
    let f = 1
    for (let k = 2; k * k <= n; k++) if (n % (k * k) === 0) f = k
    const rest = n / (f * f)
    rows.push({ n, value: Math.sqrt(n), simplified: f === 1 ? null : rest === 1 ? `${f}` : `${f}√${rest}` })
  }
  return rows
}

// ─── Generation ──────────────────────────────────────────────────────────────

const LEVEL_SPEC: Record<Level, { maxCoef: number; minGap: number; maxGap: number }> = {
  // gaps are relative: |left − right| / the larger of the two
  easy: { maxCoef: 4, minGap: 0.08, maxGap: 1 },
  medium: { maxCoef: 6, minGap: 0.02, maxGap: 0.12 },
  hard: { maxCoef: 8, minGap: 0.003, maxGap: 0.05 },
}
/** Below this absolute difference two 4-decimal values might print the same, so such pairs are never asked. */
const MIN_ABS_GAP = 0.002
const EQUAL_TOLERANCE = 1e-9

const randomSurd = (maxCoef: number): Term => ({ coef: chance(0.3) ? 1 : between(1, maxCoef), rad: pick(SURD_RADICANDS) })
const randomInteger = (maxCoef: number): Term => ({ coef: between(2, Math.max(3, maxCoef * 3)), rad: 1 })

function relationOf(l: number, r: number): Relation {
  if (Math.abs(l - r) < EQUAL_TOLERANCE) return '='
  return l < r ? '<' : '>'
}

/** Move the coefficient under the root: 3√2 = √(3² × 2) = √18. */
function insideRoot(t: Term): { text: string; value: number } {
  const value = t.coef * t.coef * t.rad
  if (t.rad === 1) return { text: `${t.coef} = √${value}`, value }
  if (t.coef === 1) return { text: `√${t.rad}`, value }
  return { text: `${t.coef}√${t.rad} = √(${t.coef}² × ${t.rad}) = √${value}`, value }
}

function noteFor(left: Expr, right: Expr, lv: number, rv: number, answer: Relation): string {
  const word = answer === '=' ? 'equal' : answer === '<' ? 'smaller' : 'larger'
  if (left.length === 1 && right.length === 1) {
    const a = insideRoot(left[0])
    const b = insideRoot(right[0])
    const lines = [`Bring each number under the root: ${a.text}; ${b.text}.`]
    lines.push(
      answer === '='
        ? `Both are √${a.value}, so they are equal.`
        : `Compare ${a.value} and ${b.value}: ${a.value} ${a.value < b.value ? '<' : '>'} ${b.value}, so ${exprText(left)} is the ${word} one.`,
    )
    return lines.join('\n')
  }
  const sideDecimals = (e: Expr) => e.map((t, i) => `${i === 0 ? '' : t.neg ? '− ' : '+ '}${fmtValue(t.coef * Math.sqrt(t.rad))}`).join(' ')
  return [
    `Use the decimals: ${exprText(left)} ≈ ${sideDecimals(left)} = ${fmtValue(lv)}`,
    `${exprText(right)} ≈ ${sideDecimals(right)} = ${fmtValue(rv)}`,
  ].join('\n')
}

function build(left: Expr, right: Expr, level: Level, kind: 'single' | 'sum' | 'equal'): SurdQuestion | null {
  const lv = exprValue(left)
  const rv = exprValue(right)
  if (lv < 0.5 || rv < 0.5 || lv > 45 || rv > 45) return null
  if (exprText(left) === exprText(right)) return null
  const answer = relationOf(lv, rv)
  if (kind === 'equal') {
    if (answer !== '=') return null
  } else {
    if (answer === '=') return null
    const gap = Math.abs(lv - rv)
    const rel = gap / Math.max(lv, rv)
    const spec = LEVEL_SPEC[level]
    if (gap < MIN_ABS_GAP || rel < spec.minGap || rel > spec.maxGap) return null
  }
  return { id: qid('surd'), left, right, leftValue: lv, rightValue: rv, answer, note: noteFor(left, right, lv, rv, answer) }
}

/** Two single terms, either could be a plain integer: 3√2 vs 2√3, 5√2 vs 7. */
function makeSingle(level: Level): SurdQuestion | null {
  const { maxCoef } = LEVEL_SPEC[level]
  const left: Term = randomSurd(maxCoef)
  const right: Term = chance(level === 'hard' ? 0.1 : 0.2) ? randomInteger(maxCoef) : randomSurd(maxCoef)
  // 3√2 vs 5√2 is just comparing 3 and 5, so keep that rare
  if (left.rad === right.rad && chance(0.85)) return null
  // √17 vs √18 is just comparing 17 and 18, so keep that rare too
  if (left.coef === 1 && right.coef === 1 && right.rad !== 1 && chance(0.85)) return null
  return build([left], [right], level, 'single')
}

/** An equal pair in different clothes: √12 and 2√3, or 3√2 and √18. */
function makeEqual(level: Level): SurdQuestion | null {
  const m = pick(SURD_RADICANDS.filter((r) => r <= 15))
  const f = pick(level === 'hard' ? [2, 3, 4] : [2, 3])
  const k = chance(0.5) ? 1 : between(1, LEVEL_SPEC[level].maxCoef > 4 ? 3 : 2)
  const inside: Term = { coef: k, rad: m * f * f }
  const outside: Term = { coef: k * f, rad: m }
  if (inside.rad > 100) return null
  return chance(0.5) ? build([inside], [outside], level, 'equal') : build([outside], [inside], level, 'equal')
}

/** Sums and differences of two terms: √2 + √3 vs √5 + 1, 2√3 − 1 vs √7 + √2. */
function makeSum(level: Level): SurdQuestion | null {
  const side = (): Expr => {
    const first: Term = chance(0.8) ? { coef: chance(0.6) ? 1 : between(1, 3), rad: pick(SURD_RADICANDS) } : { coef: between(1, 4), rad: 1 }
    const second: Term = chance(0.75) ? { coef: chance(0.6) ? 1 : between(1, 3), rad: pick(SURD_RADICANDS), neg: chance(0.25) } : { coef: between(1, 4), rad: 1, neg: chance(0.25) }
    return [first, second]
  }
  return build(side(), side(), level, 'sum')
}

/** The kind is chosen first and then retried until it works: most random draws are rejected, and each kind is rejected at a different rate. */
function retry(fn: () => SurdQuestion | null): SurdQuestion | null {
  for (let i = 0; i < 400; i++) {
    const q = fn()
    if (q) return q
  }
  return null
}

function make(level: Level): SurdQuestion | null {
  const r = Math.random()
  if (level === 'easy') return retry(() => makeSingle('easy'))
  if (level === 'medium') return retry(r < 0.15 ? () => makeEqual('medium') : () => makeSingle('medium'))
  if (r < 0.15) return retry(() => makeEqual('hard'))
  if (r < 0.5) return retry(() => makeSum('hard'))
  return retry(() => makeSingle('hard'))
}

export function generateSurdQuestions(difficulty: SurdDifficulty, count: number): SurdQuestion[] {
  let i = 0
  const levels: Level[] = ['easy', 'medium', 'hard']
  // build() rejects most random draws, so keep drawing until every slot has a question (and avoid asking the same pair twice)
  const seen = new Set<string>()
  return collect(
    count,
    () => {
      const level: Level = difficulty === 'mixed' ? levels[i % 3] : difficulty
      const q = make(level)
      if (!q) return null
      const key = `${exprText(q.left)}|${exprText(q.right)}`
      if (seen.has(key)) return null
      seen.add(key)
      i++
      return q
    },
    2000,
  )
}

/** Whether the picked button is the exact answer, and if not, why. */
export function judge(choice: RelationChoice, answer: Relation): { correct: boolean; remark: string } {
  if (choice === answer) return { correct: true, remark: '' }
  if (choice === '≤' || choice === '≥') {
    const trueHere = (choice === '≤' && (answer === '<' || answer === '=')) || (choice === '≥' && (answer === '>' || answer === '='))
    if (trueHere) return { correct: false, remark: `${choice} is true here, but it is not exact. The exact relation is ${answer}.` }
    return { correct: false, remark: `${choice} is false here. The exact relation is ${answer}.` }
  }
  return { correct: false, remark: `The exact relation is ${answer}.` }
}
