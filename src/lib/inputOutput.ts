import { shuffle, type MCQQuestion } from './generators'

/**
 * Input–Output (SBI PO Mains style machine arrangement).
 *
 * A "machine" rearranges a line of words and numbers one step at a time. The player is shown one worked
 * example (every step), must work out the hidden rule, and then applies it to a NEW input.
 *
 * The hidden rule is: odd steps pick one item from one kind (numbers or words) by a selector — "the largest
 * number", "the alphabetically first word", "the word with the most vowels", … — and send it to one end;
 * even steps do the same for the other kind, towards the other end. Items already sent to an end stay
 * there. Items either slide into place ("shift") or swap places with whatever sits in that slot ("swap").
 *
 * A puzzle is only used when EVERY rule in this family that reproduces the worked example also produces
 * the same steps for the new input — so the answer never depends on guessing the author's mind.
 */

export type InputOutputDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'
type Level = 'easy' | 'medium' | 'hard'

type NumSel = 'max' | 'min' | 'maxOdd' | 'minOdd' | 'maxEven' | 'minEven' | 'maxDigit' | 'minDigit'
type WordSel = 'first' | 'last' | 'longest' | 'shortest' | 'mostVowels' | 'fewestVowels' | 'lastLetter'
interface Hyp {
  num: NumSel
  word: WordSel
  numSide: 'L' | 'R'
  mode: 'shift' | 'swap'
  start: 'num' | 'word'
}

const NUM_SELS: NumSel[] = ['max', 'min', 'maxOdd', 'minOdd', 'maxEven', 'minEven', 'maxDigit', 'minDigit']
const WORD_SELS: WordSel[] = ['first', 'last', 'longest', 'shortest', 'mostVowels', 'fewestVowels', 'lastLetter']

const rnd = (n: number) => Math.floor(Math.random() * n)
const chance = (p: number) => Math.random() < p
const pick = <T,>(a: readonly T[]): T => a[rnd(a.length)]

const WORDS = [
  'apple', 'bridge', 'candle', 'dolphin', 'engine', 'forest', 'garden', 'hammer', 'island', 'jungle', 'kettle', 'ladder', 'mirror',
  'needle', 'orange', 'pencil', 'quartz', 'rocket', 'silver', 'tunnel', 'umbrella', 'violet', 'window', 'yellow', 'zebra', 'anchor',
  'basket', 'cactus', 'desert', 'eagle', 'falcon', 'guitar', 'harbor', 'insect', 'jacket', 'kitten', 'lemon', 'magnet', 'nature',
  'ocean', 'planet', 'rabbit', 'spider', 'tiger', 'velvet', 'wallet', 'zipper', 'bottle', 'carpet', 'dragon', 'flower', 'goblet',
  'helmet', 'jersey', 'knight', 'locket', 'monkey', 'napkin',
]

const isNum = (t: string) => /^\d+$/.test(t)
const vowels = (w: string) => (w.match(/[aeiou]/g) ?? []).length
const digitSum = (n: string) => [...n].reduce((s, d) => s + +d, 0)

/** The single item the selector picks, or null when there is none or a tie (the rule is then unusable). */
function select(kind: 'num' | 'word', sel: NumSel | WordSel, remaining: string[]): string | null {
  let pool = remaining.filter((t) => (kind === 'num') === isNum(t))
  let key: (t: string) => number | string
  let wantMax: boolean
  if (kind === 'num') {
    if (sel === 'maxOdd' || sel === 'minOdd') pool = pool.filter((t) => +t % 2 === 1)
    if (sel === 'maxEven' || sel === 'minEven') pool = pool.filter((t) => +t % 2 === 0)
    key = sel === 'maxDigit' || sel === 'minDigit' ? (t) => digitSum(t) : (t) => +t
    wantMax = sel === 'max' || sel === 'maxOdd' || sel === 'maxEven' || sel === 'maxDigit'
  } else {
    key = sel === 'longest' || sel === 'shortest' ? (t) => t.length : sel === 'mostVowels' || sel === 'fewestVowels' ? (t) => vowels(t) : sel === 'lastLetter' ? (t) => t[t.length - 1] : (t) => t
    wantMax = sel === 'last' || sel === 'longest' || sel === 'mostVowels'
  }
  if (pool.length === 0) return null
  let best = pool[0]
  for (const t of pool) {
    const a = key(t)
    const b = key(best)
    if (wantMax ? a > b : a < b) best = t
  }
  const ties = pool.filter((t) => key(t) === key(best)).length
  return ties === 1 ? best : null
}

/** All the steps (n-1 of them), or null if the rule cannot run on these tokens. */
function simulate(h: Hyp, tokens: string[]): string[][] | null {
  const n = tokens.length
  const arr = tokens.slice()
  const placed = new Set<string>()
  let left = 0
  let right = 0
  const steps: string[][] = []
  for (let s = 0; s < n - 1; s++) {
    const kind: 'num' | 'word' = (h.start === 'num') === (s % 2 === 0) ? 'num' : 'word'
    const remaining = tokens.filter((t) => !placed.has(t))
    const chosen = select(kind, kind === 'num' ? h.num : h.word, remaining)
    if (chosen === null) return null
    const side = kind === 'num' ? h.numSide : h.numSide === 'L' ? 'R' : 'L'
    const slot = side === 'L' ? left : n - 1 - right
    if (h.mode === 'swap') {
      const i = arr.indexOf(chosen)
      ;[arr[i], arr[slot]] = [arr[slot], arr[i]]
    } else {
      arr.splice(arr.indexOf(chosen), 1)
      arr.splice(slot, 0, chosen)
    }
    if (side === 'L') left++
    else right++
    placed.add(chosen)
    steps.push(arr.slice())
  }
  return steps
}

const ALL_HYPS: Hyp[] = NUM_SELS.flatMap((num) =>
  WORD_SELS.flatMap((word) => (['L', 'R'] as const).flatMap((numSide) => (['shift', 'swap'] as const).flatMap((mode) => (['num', 'word'] as const).map((start) => ({ num, word, numSide, mode, start }))))),
)

const sameSteps = (a: string[][], b: string[][]) => a.length === b.length && a.every((row, i) => row.every((t, j) => t === b[i][j]))

// ---------- wording ----------

const NUM_TEXT: Record<NumSel, string> = {
  max: 'the largest number',
  min: 'the smallest number',
  maxOdd: 'the largest odd number',
  minOdd: 'the smallest odd number',
  maxEven: 'the largest even number',
  minEven: 'the smallest even number',
  maxDigit: 'the number with the largest digit sum',
  minDigit: 'the number with the smallest digit sum',
}
const WORD_TEXT: Record<WordSel, string> = {
  first: 'the word that comes first alphabetically',
  last: 'the word that comes last alphabetically',
  longest: 'the longest word',
  shortest: 'the shortest word',
  mostVowels: 'the word with the most vowels',
  fewestVowels: 'the word with the fewest vowels',
  lastLetter: 'the word whose last letter comes first in the alphabet',
}

function ruleText(h: Hyp): string {
  const numEnd = h.numSide === 'L' ? 'left' : 'right'
  const wordEnd = h.numSide === 'L' ? 'right' : 'left'
  const first = h.start === 'num' ? `${NUM_TEXT[h.num]} goes to the ${numEnd} end` : `${WORD_TEXT[h.word]} goes to the ${wordEnd} end`
  const second = h.start === 'num' ? `${WORD_TEXT[h.word]} goes to the ${wordEnd} end` : `${NUM_TEXT[h.num]} goes to the ${numEnd} end`
  const how = h.mode === 'shift' ? 'The other items slide along in their original order.' : 'It swaps places with the item sitting in that spot.'
  return `Odd steps: ${first}. Even steps: ${second}. Items already moved to an end stay put. ${how}`
}

const ordn = (k: number) => `${k}${k % 100 >= 11 && k % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][k % 10] ?? 'th')}`
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
const line = (a: string[]) => a.join(' ')

// ---------- generation ----------

interface LevelCfg {
  nums: NumSel[]
  words: WordSel[]
  modes: ('shift' | 'swap')[]
  sizes: [number, number][] // [numbers, words]
}
const CFG: Record<Level, LevelCfg> = {
  easy: { nums: ['max', 'min'], words: ['first', 'last'], modes: ['shift'], sizes: [[3, 3]] },
  medium: {
    nums: ['max', 'min', 'maxOdd', 'minOdd', 'maxEven', 'minEven'],
    words: ['first', 'last', 'longest', 'shortest'],
    modes: ['shift', 'swap'],
    sizes: [[3, 3], [4, 3], [3, 4]],
  },
  hard: { nums: NUM_SELS, words: WORD_SELS, modes: ['shift', 'swap'], sizes: [[4, 4], [4, 4], [5, 4], [4, 5]] },
}

function randomTokens(nums: number, words: number): string[] {
  const numbers = new Set<string>()
  while (numbers.size < nums) numbers.add(String(10 + rnd(90)))
  const w = shuffle(WORDS).slice(0, words)
  return shuffle([...numbers, ...w])
}

interface Puzzle {
  truth: Hyp
  example: string[]
  exampleSteps: string[][]
  input: string[]
  steps: string[][]
}

function makePuzzle(level: Level): Puzzle | null {
  const cfg = CFG[level]
  const truth: Hyp = { num: pick(cfg.nums), word: pick(cfg.words), numSide: pick(['L', 'R'] as const), mode: pick(cfg.modes), start: pick(['num', 'word'] as const) }
  const [k, w] = pick(cfg.sizes)
  // draw tokens until the true rule runs cleanly on them (no ties) and every step really moves something
  const drawn = (): { tokens: string[]; steps: string[][] } | null => {
    for (let t = 0; t < 60; t++) {
      const tokens = randomTokens(k, w)
      const steps = simulate(truth, tokens)
      if (!steps) continue
      if (steps.every((row, i) => line(i === 0 ? tokens : steps[i - 1]) !== line(row))) return { tokens, steps }
    }
    return null
  }
  const ex = drawn()
  const nw = drawn()
  if (!ex || !nw) return null
  const example = ex.tokens
  const exampleSteps = ex.steps
  const input = nw.tokens
  const steps = nw.steps
  if (input.join() === example.join()) return null
  // every rule that fits the example AND can run on the new input must give the very same steps
  for (const h of ALL_HYPS) {
    const s = simulate(h, example)
    if (!s || !sameSteps(s, exampleSteps)) continue
    const t = simulate(h, input)
    // a rule that cannot even run on the new input (a tie, no odd number left) is simply not usable, so it cannot mislead
    if (t && !sameSteps(t, steps)) return null
  }
  return { truth, example, exampleSteps, input, steps }
}

function arrangementOptions(p: Puzzle, stepIdx: number): string[] {
  const correct = line(p.steps[stepIdx])
  const set = new Set<string>([correct])
  for (const h of shuffle(ALL_HYPS)) {
    if (set.size >= 5) break
    const s = simulate(h, p.input)
    if (s && s[stepIdx]) set.add(line(s[stepIdx]))
  }
  while (set.size < 5) {
    const a = p.steps[stepIdx].slice()
    const i = rnd(a.length)
    const j = rnd(a.length)
    ;[a[i], a[j]] = [a[j], a[i]]
    set.add(line(a))
  }
  const rest = [...set].filter((x) => x !== correct)
  return shuffle([correct, ...shuffle(rest).slice(0, 4)])
}

function buildSet(level: Level, count: number): MCQQuestion[] | null {
  const p = makePuzzle(level)
  if (!p) return null
  const n = p.input.length
  const setId = Math.random().toString(36).slice(2, 7)
  const context =
    `A machine rearranges its input step by step, using one fixed rule.\n\nInput: ${line(p.example)}\n` +
    p.exampleSteps.map((s, i) => `Step ${ROMAN[i]}: ${line(s)}`).join('\n') +
    `\n(Step ${ROMAN[p.exampleSteps.length - 1]} is the last step.)\n\nNow the machine is given a new input:\nInput: ${line(p.input)}`
  const why = (extra: string) =>
    `Rule: ${ruleText(p.truth)}\nNew input: ${line(p.input)}\n${p.steps.map((s, i) => `Step ${ROMAN[i]}: ${line(s)}`).join('\n')}\n${extra}`
  const out: MCQQuestion[] = []
  const kinds = shuffle(['step', ...shuffle(['element', 'which', 'between'] as const).slice(0, 2), 'step'] as const)
  for (const kind of kinds) {
    if (out.length >= count) break
    const base = { id: `io-${setId}-${out.length}`, instruction: `Input–output · ${level}`, context, hint: 'Compare each step with the one before: which item moved, to which end, and what makes it the one chosen (largest, first alphabetically, …)?' }
    if (kind === 'step') {
      const idx = 1 + rnd(n - 2) // steps II … last-but-one
      out.push({ ...base, term: `What will be Step ${ROMAN[idx]} for the new input?`, correctMeaning: line(p.steps[idx]), options: arrangementOptions(p, idx), explanation: why(`Step ${ROMAN[idx]} is: ${line(p.steps[idx])}`) })
    } else if (kind === 'element') {
      const idx = 1 + rnd(n - 2)
      const fromLeft = chance(0.5)
      const pos = 1 + rnd(n)
      const arr = p.steps[idx]
      const answer = fromLeft ? arr[pos - 1] : arr[n - pos]
      const options = shuffle([answer, ...shuffle(arr.filter((t) => t !== answer)).slice(0, 4)])
      out.push({ ...base, term: `In Step ${ROMAN[idx]} of the new input, which item is ${ordn(pos)} from the ${fromLeft ? 'left' : 'right'}?`, correctMeaning: answer, options, explanation: why(`In Step ${ROMAN[idx]} (${line(arr)}), the item ${pos} from the ${fromLeft ? 'left' : 'right'} is ${answer}.`) })
    } else if (kind === 'which') {
      const lines = p.steps.map(line)
      const idx = rnd(n - 1)
      if (lines.filter((l) => l === lines[idx]).length !== 1) continue
      const nums = shuffle(Array.from({ length: n - 1 }, (_, i) => i))
      const opts = nums.slice(0, 5)
      if (!opts.includes(idx)) opts[0] = idx
      if (new Set(opts).size < Math.min(5, n - 1)) continue
      out.push({ ...base, term: `In which step of the new input does this arrangement appear?\n${lines[idx]}`, correctMeaning: ROMAN[idx], options: shuffle(opts).map((i) => ROMAN[i]), explanation: why(`That arrangement is Step ${ROMAN[idx]}.`) })
    } else {
      const idx = 1 + rnd(n - 2)
      const arr = p.steps[idx]
      const i = rnd(n)
      let j = rnd(n)
      if (j === i) j = (i + 2) % n
      const answer = Math.abs(i - j) - 1
      const opts = new Set<number>([answer])
      for (const d of shuffle([1, -1, 2, -2, 3])) if (opts.size < 5 && answer + d >= 0 && answer + d <= n - 2) opts.add(answer + d)
      for (let v = 0; opts.size < 5 && v <= n - 2; v++) opts.add(v)
      out.push({ ...base, term: `How many items are between ${arr[i]} and ${arr[j]} in Step ${ROMAN[idx]} of the new input?`, correctMeaning: String(answer), options: shuffle([...opts]).slice(0, 5).map(String), explanation: why(`In Step ${ROMAN[idx]} (${line(arr)}) there ${answer === 1 ? 'is 1 item' : `are ${answer} items`} between ${arr[i]} and ${arr[j]}.`) })
    }
  }
  const uniq = out.filter((q) => new Set(q.options).size === 5 && q.options.includes(q.correctMeaning))
  return uniq.length >= count ? uniq.slice(0, count) : null
}

export function generateInputOutputQuestions(difficulty: InputOutputDifficulty, count: number): MCQQuestion[] {
  const out: MCQQuestion[] = []
  let guard = 0
  while (out.length < count && guard++ < count * 200) {
    const level: Level = difficulty === 'mixed' ? (['easy', 'medium', 'hard'] as Level[])[Math.floor(out.length / 3) % 3] : difficulty
    const set = buildSet(level, Math.min(3, count - out.length))
    if (set) out.push(...set)
  }
  return out.slice(0, count)
}

