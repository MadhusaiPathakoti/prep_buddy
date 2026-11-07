import { between, chance, collect, pick, qid } from './mentalMath'

/**
 * Generators for the two "flash" games, where numbers appear briefly and you must hold them in your head.
 *   Flash Chain    a start number, then operations one at a time (+8, ×3, −14, ÷2 …): type the final result.
 *   Mental Memory  two or three numbers appear together and vanish: then you are asked about them.
 */

export interface FlashQuestion {
  id: string
  /** Each frame is shown in turn, then hidden. */
  frames: string[]
  /** What you are asked once the frames have gone. */
  prompt: string
  answer: number
  displayAnswer: string
  /** One line for the review list. */
  review: string
  note: string
}

type Level = 'easy' | 'medium' | 'hard'
export type FlashDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'

// ---------- Flash Chain ----------

type Op = '+' | '−' | '×' | '÷'
interface Step {
  op: Op
  n: number
}

const CHAIN: Record<Level, { steps: number; start: [number, number]; add: [number, number]; mul: number[]; div: number[]; cap: number }> = {
  easy: { steps: 3, start: [10, 50], add: [2, 20], mul: [], div: [], cap: 200 },
  medium: { steps: 4, start: [8, 40], add: [3, 30], mul: [2, 3, 4], div: [2, 3, 4, 5], cap: 400 },
  hard: { steps: 6, start: [12, 60], add: [5, 60], mul: [2, 3, 4, 5, 6], div: [2, 3, 4, 5, 6, 8], cap: 900 },
}

function apply(v: number, s: Step): number {
  if (s.op === '+') return v + s.n
  if (s.op === '−') return v - s.n
  if (s.op === '×') return v * s.n
  return v / s.n
}

function chain(level: Level): FlashQuestion | null {
  const cfg = CHAIN[level]
  const start = between(cfg.start[0], cfg.start[1])
  let v = start
  const steps: Step[] = []
  const trace: number[] = [start]
  for (let i = 0; i < cfg.steps; i++) {
    const options: Step[] = []
    options.push({ op: '+', n: between(cfg.add[0], cfg.add[1]) })
    if (v > cfg.add[0]) options.push({ op: '−', n: between(cfg.add[0], Math.min(cfg.add[1], v - 1)) })
    if (cfg.mul.length && v * 2 <= cfg.cap) options.push({ op: '×', n: pick(cfg.mul) })
    for (const d of cfg.div) if (v % d === 0 && v / d >= 2) options.push({ op: '÷', n: d })
    // do not stack two operations of the same kind in a row, and keep the numbers in range
    const prev = steps[steps.length - 1]
    const usable = options.filter((s) => s.op !== prev?.op || chance(0.25)).filter((s) => {
      const next = apply(v, s)
      return Number.isInteger(next) && next >= 1 && next <= cfg.cap
    })
    if (!usable.length) return null
    // favour multiply / divide a little in the harder levels so they are not just sums
    const s = level === 'easy' ? pick(usable) : pick([...usable, ...usable.filter((x) => x.op === '×' || x.op === '÷')])
    steps.push(s)
    v = apply(v, s)
    trace.push(v)
  }
  if (!steps.some((s) => s.op === '×' || s.op === '÷') && level !== 'easy') return null
  const frames = [String(start), ...steps.map((s) => `${s.op} ${s.n}`)]
  const review = `${start} ${steps.map((s) => `${s.op} ${s.n}`).join(' ')}`
  return {
    id: qid('fc'),
    frames,
    prompt: 'Result?',
    answer: v,
    displayAnswer: String(v),
    review,
    note: `${start}${steps.map((s, i) => ` ${s.op} ${s.n} = ${trace[i + 1]}`).join(',')}.`,
  }
}

// ---------- Mental Memory ----------

function memory(level: Level): FlashQuestion | null {
  const two = (lo: number, hi: number) => [between(lo, hi), between(lo, hi)] as const
  if (level === 'easy') {
    const [a, b] = two(11, 89)
    if (a === b) return null
    if (chance(0.5)) return mem([a, b], 'Sum of the two numbers?', a + b, `${a} + ${b} = ${a + b}`)
    const [hi, lo] = a > b ? [a, b] : [b, a]
    return mem([a, b], 'Difference of the two numbers?', hi - lo, `${hi} − ${lo} = ${hi - lo}`)
  }
  if (level === 'medium') {
    const kind = pick(['sum', 'diff', 'times'] as const)
    if (kind === 'times') {
      const a = between(12, 49)
      const b = between(3, 9)
      return mem([a, b], 'Product of the two numbers?', a * b, `${a} × ${b} = ${a * b}`)
    }
    const [a, b] = two(100, 899)
    if (a === b) return null
    if (kind === 'sum') return mem([a, b], 'Sum of the two numbers?', a + b, `${a} + ${b} = ${a + b}`)
    const [hi, lo] = a > b ? [a, b] : [b, a]
    return mem([a, b], 'Difference of the two numbers?', hi - lo, `${hi} − ${lo} = ${hi - lo}`)
  }
  const kind = pick(['abc', 'range', 'times'] as const)
  if (kind === 'times') {
    const a = between(13, 29)
    const b = between(11, 19)
    if (a === b) return null
    return mem([a, b], 'Product of the two numbers?', a * b, `${a} × ${b} = ${a * b}`)
  }
  const nums = [between(20, 99), between(20, 99), between(20, 99)]
  if (new Set(nums).size < 3) return null
  if (kind === 'abc') {
    const [a, b, c] = nums
    if (a + b <= c) return null
    return mem(nums, '(First + second) − third?', a + b - c, `${a} + ${b} − ${c} = ${a + b - c}`)
  }
  const hi = Math.max(...nums)
  const lo = Math.min(...nums)
  return mem(nums, 'Largest − smallest?', hi - lo, `${hi} − ${lo} = ${hi - lo}`)
}

function mem(nums: readonly number[], prompt: string, answer: number, note: string): FlashQuestion {
  return { id: qid('mm'), frames: [nums.join('      ')], prompt, answer, displayAnswer: String(answer), review: `${nums.join(', ')} → ${prompt.replace('?', '')}`, note }
}

// ---------- entry points ----------

const pickLevel = (d: FlashDifficulty, i: number): Level => (d === 'mixed' ? (['easy', 'medium', 'hard'] as Level[])[i % 3] : d)

export function generateFlashChainQuestions(difficulty: FlashDifficulty, count: number): FlashQuestion[] {
  let i = 0
  return collect(count, () => chain(pickLevel(difficulty, i++)))
}

export function generateMemoryQuestions(difficulty: FlashDifficulty, count: number): FlashQuestion[] {
  let i = 0
  return collect(count, () => memory(pickLevel(difficulty, i++)))
}
