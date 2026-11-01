import { shuffle } from './generators'
import type { Question } from './types'

export type LcmHcfSimpMode = 'lcm' | 'hcf' | 'simplification' | 'mixed'
export type LcmHcfSimpDifficulty = 'easy' | 'medium' | 'hard'

type Op = '+' | '−' | '×' | '÷'

const MAX_ATTEMPTS_PER_QUESTION = 400

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b
}

function gcdAll(nums: number[]): number {
  return nums.reduce(gcd)
}

function lcmAll(nums: number[]): number {
  return nums.reduce(lcm)
}

// ---------------------------------------------------------------------------------------------
// LCM / HCF
// ---------------------------------------------------------------------------------------------

interface LcmHcfShape {
  count: number
  gMax: number
  mMax: number
  maxLcm: number
}

const LCM_HCF_SHAPES: Record<LcmHcfSimpDifficulty, LcmHcfShape> = {
  easy: { count: 2, gMax: 6, mMax: 6, maxLcm: 200 },
  medium: { count: 2, gMax: 12, mMax: 9, maxLcm: 900 },
  hard: { count: 3, gMax: 9, mMax: 8, maxLcm: 1200 },
}

/** Builds a set like [g·m1, g·m2, ...] with gcd(m1, m2, ...) = 1, so the HCF is exactly g (rather than usually 1 for random picks). */
function pickSharedFactorSet(shape: LcmHcfShape): number[] | null {
  const g = randInt(2, shape.gMax)
  const multipliers = new Set<number>()
  while (multipliers.size < shape.count) multipliers.add(randInt(1, shape.mMax))
  const ms = [...multipliers]
  if (gcdAll(ms) !== 1) return null
  return ms.map((m) => g * m).sort((a, b) => a - b)
}

export function generateLcmHcfQuestions(kind: 'lcm' | 'hcf', difficulty: LcmHcfSimpDifficulty, count: number): Question[] {
  const shape = LCM_HCF_SHAPES[difficulty]
  const label = kind === 'lcm' ? 'LCM' : 'HCF'
  const seen = new Set<string>()
  const out: Question[] = []

  for (let attempts = 0; out.length < count && attempts < count * MAX_ATTEMPTS_PER_QUESTION; attempts++) {
    const nums = pickSharedFactorSet(shape)
    if (!nums) continue
    const answer = kind === 'lcm' ? lcmAll(nums) : gcdAll(nums)
    if (kind === 'lcm' && answer > shape.maxLcm) continue
    if (kind === 'hcf' && answer < 2) continue
    const prompt = `${label}(${nums.join(', ')})`
    if (seen.has(prompt)) continue
    seen.add(prompt)
    out.push({ id: prompt, prompt, answer, displayAnswer: String(answer) })
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Simplification (BODMAS)
// ---------------------------------------------------------------------------------------------

function applyOp(a: number, op: Op, b: number): number | null {
  switch (op) {
    case '+':
      return a + b
    case '−':
      return a - b
    case '×':
      return a * b
    case '÷':
      return b !== 0 && a % b === 0 ? a / b : null
  }
}

/** Evaluates `nums[0] ops[0] nums[1] ...` with × and ÷ taking precedence; null if any division isn't exact. */
function evalFlat(nums: number[], ops: Op[]): number | null {
  const n = [...nums]
  const o = [...ops]
  for (let i = 0; i < o.length; ) {
    if (o[i] === '×' || o[i] === '÷') {
      const r = applyOp(n[i], o[i], n[i + 1])
      if (r === null) return null
      n.splice(i, 2, r)
      o.splice(i, 1)
    } else {
      i += 1
    }
  }
  let acc = n[0]
  for (let i = 0; i < o.length; i++) {
    const r = applyOp(acc, o[i], n[i + 1])
    if (r === null) return null
    acc = r
  }
  return acc
}

interface SimpShape {
  operators: number
  maxOperand: number
  maxResult: number
  brackets: boolean
}

const SIMP_SHAPES: Record<LcmHcfSimpDifficulty, SimpShape> = {
  easy: { operators: 2, maxOperand: 30, maxResult: 200, brackets: false },
  medium: { operators: 3, maxOperand: 50, maxResult: 500, brackets: false },
  hard: { operators: 3, maxOperand: 60, maxResult: 900, brackets: true },
}

const ALL_OPS: Op[] = ['+', '−', '×', '÷']

function randomOps(n: number): Op[] {
  return Array.from({ length: n }, () => ALL_OPS[randInt(0, 3)])
}

function tryBuildSimplification(shape: SimpShape): { prompt: string; answer: number } | null {
  const nums = Array.from({ length: shape.operators + 1 }, () => randInt(2, shape.maxOperand))
  const ops = randomOps(shape.operators)

  // Every expression should actually exercise BODMAS: at least one × or ÷, and at least one + or −.
  if (!ops.some((o) => o === '×' || o === '÷') || !ops.some((o) => o === '+' || o === '−')) return null

  if (shape.brackets) {
    // Wrap one adjacent pair in brackets: evaluate it first, then the rest as a flat expression.
    const start = randInt(0, shape.operators - 1)
    const innerOp = ops[start]
    // Only bracket a + or − that sits next to a × or ÷, so the brackets genuinely change the answer.
    const before = ops[start - 1]
    const after = ops[start + 1]
    const neighbourIsMulDiv = before === '×' || before === '÷' || after === '×' || after === '÷'
    if ((innerOp !== '+' && innerOp !== '−') || !neighbourIsMulDiv) return null

    const inner = applyOp(nums[start], innerOp, nums[start + 1])
    if (inner === null || inner < 1) return null
    const flatNums = [...nums.slice(0, start), inner, ...nums.slice(start + 2)]
    const flatOps = [...ops.slice(0, start), ...ops.slice(start + 1)]
    const answer = evalFlat(flatNums, flatOps)
    if (answer === null || answer < 1 || answer > shape.maxResult) return null

    const parts: string[] = []
    let i = 0
    while (i < nums.length) {
      if (i === start) {
        parts.push(`(${nums[i]} ${innerOp} ${nums[i + 1]})`)
        i += 2
      } else {
        parts.push(String(nums[i]))
        i += 1
      }
      // The operator that follows the item just pushed is always ops[i - 1], if there is one.
      if (i - 1 < ops.length) parts.push(ops[i - 1])
    }
    return { prompt: parts.join(' '), answer }
  }

  const answer = evalFlat(nums, ops)
  if (answer === null || answer < 1 || answer > shape.maxResult) return null
  const prompt = nums.map((n, i) => (i < ops.length ? `${n} ${ops[i]}` : String(n))).join(' ')
  return { prompt, answer }
}

export function generateSimplificationQuestions(difficulty: LcmHcfSimpDifficulty, count: number): Question[] {
  const shape = SIMP_SHAPES[difficulty]
  const seen = new Set<string>()
  const out: Question[] = []

  for (let attempts = 0; out.length < count && attempts < count * MAX_ATTEMPTS_PER_QUESTION; attempts++) {
    const built = tryBuildSimplification(shape)
    if (!built || seen.has(built.prompt)) continue
    seen.add(built.prompt)
    out.push({ id: built.prompt, prompt: built.prompt, answer: built.answer, displayAnswer: String(built.answer) })
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------------------------

export function generateLcmHcfSimplificationQuestions(mode: LcmHcfSimpMode, difficulty: LcmHcfSimpDifficulty, count: number): Question[] {
  if (mode === 'lcm') return generateLcmHcfQuestions('lcm', difficulty, count)
  if (mode === 'hcf') return generateLcmHcfQuestions('hcf', difficulty, count)
  if (mode === 'simplification') return generateSimplificationQuestions(difficulty, count)

  const third = Math.floor(count / 3)
  const lcmCount = third
  const hcfCount = third
  const simpCount = count - lcmCount - hcfCount
  return shuffle([
    ...generateLcmHcfQuestions('lcm', difficulty, lcmCount),
    ...generateLcmHcfQuestions('hcf', difficulty, hcfCount),
    ...generateSimplificationQuestions(difficulty, simpCount),
  ])
}
