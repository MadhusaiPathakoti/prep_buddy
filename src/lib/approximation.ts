import { shuffle, type MCQQuestion } from './generators'
import { between, chance, clean, collect, pick, qid, withCommas } from './mentalMath'

/**
 * Approximation (SBI/IBPS Prelims style): every number in the expression is a slightly "untidy" version of
 * an easy one (49.8 → 50, 799.9 → 800, 24.9 → 25). Round, calculate, and pick the closest option.
 *
 * Each question is built from the TIDY numbers, then disguised. It is only used when the true (untidy)
 * value lies within 1.5% of the tidy answer and every wrong option is at least 6% away from it — so there
 * is never any doubt about which option is closest.
 */

export type ApproxDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'
type Level = 'easy' | 'medium' | 'hard'

interface Term {
  text: string // as shown, e.g. "49.8% of 799.9"
  tidy: string // the rounded form, e.g. "50% of 800"
  tidyValue: number
  exact: number
}

/** A "nearly" version of v: 800 → 799.9 / 801.2. Never equal to v. */
function disguise(v: number): number {
  const decimals = v >= 100 ? 1 : v >= 10 ? 1 : 2
  for (let t = 0; t < 20; t++) {
    const rel = (between(2, 9) / 1000) * (chance(0.5) ? 1 : -1) // 0.2% – 0.9%
    const d = clean(Math.round(v * (1 + rel) * 10 ** decimals) / 10 ** decimals, decimals)
    if (d !== v) return d
  }
  return clean(v + 0.1, 1)
}

const fmtNum = (n: number) => String(clean(n, 3))

function percentOf(): Term {
  const p = pick([20, 25, 40, 50, 60, 75, 80, 30, 15, 45, 35, 65])
  const B = pick([200, 240, 400, 600, 800, 1200, 1600, 2000, 2400, 500, 1000, 1500])
  const tidyValue = (p * B) / 100
  if (!Number.isInteger(tidyValue)) return percentOf()
  const p2 = clean(p + (chance(0.5) ? 1 : -1) * between(1, 4) / 10, 1)
  const B2 = disguise(B)
  return { text: `${fmtNum(p2)}% of ${fmtNum(B2)}`, tidy: `${p}% of ${B}`, tidyValue, exact: (p2 * B2) / 100 }
}

function square(): Term {
  const m = pick([12, 15, 16, 18, 20, 24, 25, 30, 32, 35, 40, 45])
  const m2 = disguise(m)
  return { text: `${fmtNum(m2)}²`, tidy: `${m}²`, tidyValue: m * m, exact: m2 * m2 }
}

function root(): Term {
  const m = pick([12, 15, 16, 18, 20, 24, 25, 30, 36, 40])
  const s = m * m
  const s2 = disguise(s)
  return { text: `√${fmtNum(s2)}`, tidy: `√${s}`, tidyValue: m, exact: Math.sqrt(s2) }
}

function product(): Term {
  const x = pick([12, 15, 16, 18, 20, 24, 25, 30, 32, 40, 45, 50, 60, 75])
  const y = pick([8, 12, 15, 16, 20, 25, 30, 40, 50])
  const x2 = disguise(x)
  const y2 = disguise(y)
  return { text: `${fmtNum(x2)} × ${fmtNum(y2)}`, tidy: `${x} × ${y}`, tidyValue: x * y, exact: x2 * y2 }
}

function quotient(): Term {
  const y = pick([8, 12, 15, 16, 20, 24, 25, 30, 40])
  const q = pick([12, 15, 18, 20, 25, 30, 35, 40, 45, 50])
  const x = y * q
  const x2 = disguise(x)
  const y2 = disguise(y)
  return { text: `${fmtNum(x2)} ÷ ${fmtNum(y2)}`, tidy: `${x} ÷ ${y}`, tidyValue: q, exact: x2 / y2 }
}

function plain(): Term {
  const v = pick([120, 150, 180, 200, 240, 250, 300, 350, 400, 450, 500, 600, 750, 800])
  const v2 = disguise(v)
  return { text: fmtNum(v2), tidy: String(v), tidyValue: v, exact: v2 }
}

const TERM_SETS: Record<Level, (() => Term)[][]> = {
  easy: [[percentOf, plain], [square, plain], [product], [quotient], [percentOf, square]],
  medium: [[percentOf, square, plain], [product, plain, plain], [percentOf, quotient, plain], [square, quotient, plain], [root, product, plain]],
  hard: [[percentOf, square, root, plain], [product, quotient, percentOf, plain], [square, root, quotient, plain], [percentOf, product, root, plain], [percentOf, square, quotient, root]],
}

function build(level: Level): MCQQuestion | null {
  const makers = shuffle(pick(TERM_SETS[level]))
  const terms = makers.map((m) => m())
  // + / − between terms; the first sign is always +
  const signs = terms.map((_, i) => (i === 0 ? 1 : chance(0.5) ? 1 : -1))
  const tidyValue = terms.reduce((s, t, i) => s + signs[i] * t.tidyValue, 0)
  const exact = terms.reduce((s, t, i) => s + signs[i] * t.exact, 0)
  if (tidyValue < 60 || !Number.isInteger(tidyValue)) return null
  if (Math.abs(exact - tidyValue) / tidyValue > 0.015) return null

  // distractors: classic slips first (a flipped sign), then plain offsets — all at least 6% from the answer and from each other
  const wrong: number[] = []
  const farEnough = (v: number) => v > 0 && Math.abs(v - tidyValue) / tidyValue >= 0.06 && wrong.every((w) => Math.abs(w - v) / Math.max(v, w) >= 0.05)
  const slip = terms.reduce((s, t, i) => s + (i === terms.length - 1 ? -signs[i] : signs[i]) * t.tidyValue, 0)
  for (const v of [slip, ...shuffle([0.9, 1.1, 0.85, 1.15, 0.8, 1.2, 0.75, 1.25, 1.3, 0.7]).map((f) => Math.round((tidyValue * f) / 5) * 5)]) {
    if (wrong.length >= 4) break
    if (Number.isInteger(v) && farEnough(v)) wrong.push(v)
  }
  if (wrong.length < 4) return null

  const text = terms.map((t, i) => (i === 0 ? t.text : `${signs[i] > 0 ? '+' : '−'} ${t.text}`)).join(' ')
  const tidyText = terms.map((t, i) => (i === 0 ? t.tidy : `${signs[i] > 0 ? '+' : '−'} ${t.tidy}`)).join(' ')
  const mapping = terms.map((t) => `${t.text} ≈ ${t.tidy}`).join(';  ')
  const parts = terms.map((t, i) => `${i === 0 ? '' : signs[i] > 0 ? '+ ' : '− '}${withCommas(t.tidyValue)}`).join(' ')
  return {
    id: qid('ap'),
    instruction: `Approximate value · ${level}`,
    term: text,
    correctMeaning: withCommas(tidyValue),
    options: shuffle([tidyValue, ...wrong]).map(withCommas),
    hint: 'Round every number to the nearest easy one (25, 50, 800 …), calculate with those, and choose the closest option.',
    explanation: `Round: ${mapping}.\n${tidyText} = ${parts} = ${withCommas(tidyValue)}.\n(The exact value is ${withCommas(Math.round(exact * 10) / 10)} — closest to ${withCommas(tidyValue)}.)`,
  }
}

export function generateApproximationQuestions(difficulty: ApproxDifficulty, count: number): MCQQuestion[] {
  let i = 0
  return collect(count, () => build(difficulty === 'mixed' ? (['easy', 'medium', 'hard'] as Level[])[i++ % 3] : difficulty))
}
