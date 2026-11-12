import type { SetupGroup } from '../components/ReasoningSetup'
import type { Question } from './types'
import { between, chance, intQuestion, pick } from './mentalMath'

/**
 * Vedic Maths tricks: each one has a short lesson (idea + recipe + worked demos) and a generator for the practice game.
 *
 * `solve` works the answer out BY THE TRICK (so the steps shown to the learner are the real working), and `truth` is plain
 * arithmetic. scripts/verify-vedic.ts checks that the two always agree.
 */

export interface Problem {
  prompt: string
  answer: number
  steps: string[]
}

export interface VedicImpl {
  id: string
  /** Why the trick works, in a few sentences. */
  idea: string
  /** The recipe, one instruction per entry. */
  recipe: string[]
  /** An optional extra tip shown under the recipe. */
  tip?: string
  related?: { to: string; label: string }
  /** Arguments for the hand-picked worked examples in the lesson. */
  demos: number[][]
  solve: (args: number[]) => Problem
  /** Plain arithmetic, used only to verify `solve`. */
  truth: (args: number[]) => number
  /** Arguments for one random practice question (null = try again). `i` is the question index, used to cycle "mixed". */
  random: (choice: Record<string, string>, i: number) => number[] | null
  groups: SetupGroup[]
}

type Level = 'easy' | 'medium' | 'hard'

const LEVELS: Level[] = ['easy', 'medium', 'hard']
const levelOf = (choice: Record<string, string>, i: number): Level =>
  choice.difficulty === 'mixed' ? LEVELS[i % 3] : ((choice.difficulty as Level) ?? 'medium')

const difficultyGroup = (easy: string, medium: string, hard: string): SetupGroup => ({
  key: 'difficulty',
  title: 'Difficulty',
  defaultId: 'medium',
  options: [
    { id: 'easy', label: 'Easy', description: easy },
    { id: 'medium', label: 'Medium', description: medium },
    { id: 'hard', label: 'Hard', description: hard },
    { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
  ],
})

const pad2 = (n: number) => String(n).padStart(2, '0')
const swapped = (a: number, b: number): number[] => (chance(0.5) ? [a, b] : [b, a])

// ───────────────────────────────────────────────────────────── 1. Squares near 50 & 100
const squaresNear50: VedicImpl = {
  id: 'squares-near-50',
  idea:
    'Write a number near 50 as 50 + d, where d is the gap (negative if the number is below 50). Then (50 + d)² = 2500 + 100d + d² = (25 + d) × 100 + d². ' +
    'So the left part of the answer is simply 25 plus the gap, and the right part is the gap squared. The same thing works around 100: (100 + d)² = (100 + 2d) × 100 + d².',
  recipe: [
    'Find the gap d between your number and 50 (a minus if it is below). 49 is 1 below, so d = −1.',
    'Left part: 25 + d. For 49 that is 25 − 1 = 24. For 53 it is 25 + 3 = 28.',
    'Right part: d², written as exactly two digits (1 → 01, 9 → 09). If d² is 100 or more, its hundreds digit carries into the left part.',
    'Glue the parts together: 24 | 01 → 2401.',
    'Around 100 the left part is the number plus its own gap: 97 → 97 − 3 = 94, and 3² = 09, so 97² = 9409.',
  ],
  tip: 'Check the left part: for numbers below 50 it is under 25, for numbers above 50 it is over 25. 49² has to be just under 50² = 2500, and 2401 is.',
  related: { to: '/maths/multiply-near-base', label: 'Multiply Near a Base — the same idea for two different numbers' },
  demos: [[49], [53], [97], [62]],
  solve: ([n]) => {
    const base = n > 75 ? 100 : 50
    const d = n - base
    const ad = Math.abs(d)
    const sq = d * d
    const left = base === 50 ? 25 + d : n + d
    const answer = left * 100 + sq
    const op = d < 0 ? '−' : '+'
    const steps = [`${n} is ${ad} ${d < 0 ? 'below' : 'above'} ${base}, so the gap is d = ${d < 0 ? '−' : '+'}${ad}.`]
    steps.push(
      base === 50
        ? `Left part: 25 ${op} ${ad} = ${left}  (half of 50, moved by the gap).`
        : `Left part: ${n} ${op} ${ad} = ${left}  (the number, moved by its own gap).`,
    )
    steps.push(
      sq < 100
        ? `Right part: d² = ${ad}² = ${sq}, written with two digits: ${pad2(sq)}.`
        : `Right part: d² = ${ad}² = ${sq}. That has three digits, so its hundreds digit carries into the left part.`,
    )
    steps.push(sq < 100 ? `Join: ${left} | ${pad2(sq)} → ${answer}.` : `Combine: ${left} × 100 + ${sq} = ${left * 100} + ${sq} = ${answer}.`)
    return { prompt: `${n}²`, answer, steps }
  },
  truth: ([n]) => n * n,
  random: (c, i) => {
    const level = levelOf(c, i)
    let n: number
    if (level === 'easy') n = between(46, 54)
    else if (level === 'medium') n = between(41, 59)
    else n = chance(0.35) ? between(91, 109) : between(31, 69)
    return n === 50 || n === 100 ? null : [n]
  },
  groups: [difficultyGroup('46–54', '41–59', '31–69 and 91–109, with carries')],
}

// ───────────────────────────────────────────────────────────── 2. Squares ending in 5
const squaresEnding5: VedicImpl = {
  id: 'squares-ending-5',
  idea:
    'A number ending in 5 is 10n + 5, and (10n + 5)² = 100n² + 100n + 25 = n(n + 1) × 100 + 25. ' +
    'So the front of the answer is n times the next number up, and the last two digits are always 25.',
  recipe: [
    'Cover the 5 and read the number that is left. For 75 that is 7.',
    'Multiply it by the next number up: 7 × 8 = 56.',
    'Write 25 straight after it: 56 | 25 → 5625.',
    'It keeps working for bigger numbers: 105² → 10 × 11 = 110, then 25 → 11025.',
  ],
  tip: 'Learn the products n × (n + 1) as you go: 2, 6, 12, 20, 30, 42, 56, 72, 90, 110, 132 … they are the twin-number products you may already drill.',
  demos: [[35], [75], [105]],
  solve: ([n]) => {
    const t = (n - 5) / 10
    const front = t * (t + 1)
    const answer = front * 100 + 25
    return {
      prompt: `${n}²`,
      answer,
      steps: [
        `Cover the 5. What is left is ${t}.`,
        `Multiply it by the next number up: ${t} × ${t + 1} = ${front}.`,
        `Write 25 straight after it: ${front} | 25 → ${answer}.`,
      ],
    }
  },
  truth: ([n]) => n * n,
  random: (c, i) => {
    const level = levelOf(c, i)
    const t = level === 'easy' ? between(1, 5) : level === 'medium' ? between(6, 9) : between(10, 19)
    return [t * 10 + 5]
  },
  groups: [difficultyGroup('15–55', '65–95', '105–195')],
}

// ───────────────────────────────────────────────────────────── 3. Duplex squares
const duplexSquares: VedicImpl = {
  id: 'duplex-squares',
  idea:
    'A two-digit number 10a + b squares to a² × 100 + 2ab × 10 + b². The three pieces are the first digit squared, twice the product of the two digits, and the last digit squared. ' +
    'Writing them side by side (the sutra calls each piece a "duplex") gives the square of any two-digit number, with no base needed.',
  recipe: [
    'Split the number into its tens digit a and units digit b. For 63: a = 6, b = 3.',
    'Left piece: a² = 36.',
    'Middle piece: 2 × a × b = 2 × 6 × 3 = 36.',
    'Right piece: b² = 9 (think of it as 09).',
    'Add them with their place values: 3600 + 360 + 9 = 3969.',
  ],
  tip: 'Say it left to right as you add: "thirty-six hundred … plus three-sixty is thirty-nine sixty … plus nine is 3969." Nothing to hold in memory.',
  demos: [[63], [27], [84]],
  solve: ([n]) => {
    const a = Math.floor(n / 10)
    const b = n % 10
    const left = a * a
    const mid = 2 * a * b
    const right = b * b
    const answer = left * 100 + mid * 10 + right
    return {
      prompt: `${n}²`,
      answer,
      steps: [
        `Split ${n} into a = ${a} and b = ${b}.`,
        `Left piece: a² = ${a}² = ${left}.`,
        `Middle piece: 2 × a × b = 2 × ${a} × ${b} = ${mid}.`,
        `Right piece: b² = ${b}² = ${right} (as two digits: ${pad2(right)}).`,
        `Add with place values: ${left * 100} + ${mid * 10} + ${right} = ${answer}.`,
      ],
    }
  },
  truth: ([n]) => n * n,
  random: (c, i) => {
    const level = levelOf(c, i)
    const tens = level === 'easy' ? between(1, 2) : level === 'medium' ? between(3, 6) : between(7, 9)
    const units = between(1, 9)
    return [tens * 10 + units]
  },
  groups: [difficultyGroup('11–29', '31–69', '71–99')],
}

// ───────────────────────────────────────────────────────────── 4. Same tens, units add to 10
const unitsAddTo10: VedicImpl = {
  id: 'units-add-to-10',
  idea:
    'If two numbers share the same front part T and their last digits u and v add up to 10, then (10T + u)(10T + v) = 100T² + 10T(u + v) + uv = 100T² + 100T + uv = T(T + 1) × 100 + uv. ' +
    'So the answer is "front × next front" followed by "last digits multiplied". Squares ending in 5 are the special case u = v = 5.',
  recipe: [
    'Check the pattern: the front parts are identical and the last digits add to 10. In 43 × 47, both start with 4 and 3 + 7 = 10.',
    'Left part: front × (front + 1) = 4 × 5 = 20.',
    'Right part: multiply the last digits: 3 × 7 = 21. Always give it two digits (1 × 9 = 09).',
    'Join them: 20 | 21 → 2021.',
  ],
  tip: 'It works with longer numbers too: 123 × 127 → front 12, so 12 × 13 = 156, then 3 × 7 = 21 → 15621.',
  demos: [[43, 47], [62, 68], [81, 89], [123, 127]],
  solve: ([a, b]) => {
    const u = a % 10
    const v = b % 10
    const T = (a - u) / 10
    const left = T * (T + 1)
    const right = u * v
    const answer = left * 100 + right
    return {
      prompt: `${a} × ${b}`,
      answer,
      steps: [
        `Both numbers start with ${T}, and the last digits ${u} + ${v} = 10, so the trick applies.`,
        `Left part: ${T} × (${T} + 1) = ${T} × ${T + 1} = ${left}.`,
        `Right part: ${u} × ${v} = ${right}, as two digits: ${pad2(right)}.`,
        `Join: ${left} | ${pad2(right)} → ${answer}.`,
      ],
    }
  },
  truth: ([a, b]) => a * b,
  random: (c, i) => {
    const level = levelOf(c, i)
    const T = level === 'easy' ? between(1, 5) : level === 'medium' ? between(1, 9) : between(10, 29)
    const u = level === 'easy' ? between(1, 4) : between(1, 9)
    const [a, b] = swapped(T * 10 + u, T * 10 + (10 - u))
    return [a, b]
  },
  groups: [difficultyGroup('fronts 1–5, last digits 1+9, 2+8, 3+7, 4+6', 'any two-digit pair', 'three-digit pairs like 123 × 127')],
}

// ───────────────────────────────────────────────────────────── 5. Multiply by 11
function resolveCarries(cells: number[]): number[] {
  const out = [...cells]
  for (let i = out.length - 1; i > 0; i--) {
    out[i - 1] += Math.floor(out[i] / 10)
    out[i] %= 10
  }
  return out
}

const timesEleven: VedicImpl = {
  id: 'times-11',
  idea:
    'n × 11 = n × 10 + n. Adding n to a copy of itself shifted one place left means every digit gets added to its neighbour. ' +
    'So the middle digits of the answer are sums of neighbouring digits, while the outer digits are just the first and last digits of n.',
  recipe: [
    'Write the first digit of the number at the left end and its last digit at the right end. For 253: a 2 on the left and a 3 on the right.',
    'In between, put the sum of each neighbouring pair of digits: 2 + 5 = 7, then 5 + 3 = 8.',
    'Read across: 2 | 7 | 8 | 3 → 2783.',
    'If a sum is 10 or more, keep its units digit and carry the 1 to the cell on its left: 78 → 7 | 15 | 8 → 8 | 5 | 8 → 858.',
  ],
  tip: 'Work right to left when there are carries — you meet the carry before you need it.',
  demos: [[34], [78], [253], [648]],
  solve: ([n]) => {
    const d = String(n).split('').map(Number)
    const sums = d.slice(0, -1).map((x, i) => x + d[i + 1])
    const cells = [d[0], ...sums, d[d.length - 1]]
    const steps = [
      `Write the first digit (${d[0]}) at the left end and the last digit (${d[d.length - 1]}) at the right end.`,
      `Add each neighbouring pair: ${sums.map((s, i) => `${d[i]} + ${d[i + 1]} = ${s}`).join(', ')}.`,
      `Line them up: ${cells.join(' | ')}.`,
    ]
    const resolved = resolveCarries(cells)
    if (cells.some((c) => c > 9)) steps.push(`A cell above 9 keeps its units digit and passes the tens digit left: ${resolved.join(' | ')}.`)
    const answer = Number(resolved.join(''))
    steps.push(`Read across: ${answer}.`)
    return { prompt: `${n} × 11`, answer, steps }
  },
  truth: ([n]) => n * 11,
  random: (c, i) => {
    const level = levelOf(c, i)
    if (level === 'hard') return [chance(0.6) ? between(100, 999) : between(1000, 9999)]
    const a = between(1, level === 'easy' ? 8 : 9)
    const b = level === 'easy' ? between(1, 9 - a) : between(Math.max(0, 10 - a), 9)
    return [a * 10 + b]
  },
  groups: [difficultyGroup('two digits, no carry (digit sum 9 or less)', 'two digits with a carry (digit sum 10+)', 'three and four digits')],
}

// ───────────────────────────────────────────────────────────── 6. Teens × teens (base 10 / 20)
const teens: VedicImpl = {
  id: 'teens-times-teens',
  idea:
    'This is the base method on a small base. Write a = B + d₁ and b = B + d₂. Then ab = (a + d₂) × B + d₁d₂. ' +
    'For the teens the base is 10 and the gaps are just the units digits; for the 20s use base 20 (the gaps are still the units digits).',
  recipe: [
    'Pick the base: 10 for numbers from 11 to 19, 20 for numbers from 21 to 29.',
    'The gaps are the units digits. For 14 × 16: 4 and 6.',
    'Cross-add: 14 + 6 = 20 (adding 16 + 4 gives the same).',
    'Multiply by the base: 20 × 10 = 200.',
    'Multiply the gaps and add: 4 × 6 = 24, so 200 + 24 = 224.',
  ],
  tip: 'In the 20s, use 20 as the base: 23 × 27 → cross-add 23 + 7 = 30, × 20 = 600, plus 3 × 7 = 21 → 621.',
  related: { to: '/maths/multiply-near-base', label: 'Multiply Near a Base — the same method for 100, 1000 …' },
  demos: [[13, 14], [17, 18], [23, 27]],
  solve: ([a, b]) => {
    const base = a >= 21 ? 20 : 10
    const d1 = a - base
    const d2 = b - base
    const cross = a + d2
    const answer = cross * base + d1 * d2
    return {
      prompt: `${a} × ${b}`,
      answer,
      steps: [
        `Base ${base}: ${a} is ${d1} above it and ${b} is ${d2} above it.`,
        `Cross-add: ${a} + ${d2} = ${cross} (or ${b} + ${d1} = ${cross}).`,
        `Multiply by the base: ${cross} × ${base} = ${cross * base}.`,
        `Multiply the gaps: ${d1} × ${d2} = ${d1 * d2}.`,
        `Add: ${cross * base} + ${d1 * d2} = ${answer}.`,
      ],
    }
  },
  truth: ([a, b]) => a * b,
  random: (c, i) => {
    const level = levelOf(c, i)
    const lo = level === 'hard' && chance(0.5) ? 21 : 11
    const hi = level === 'easy' ? 15 : lo + 8
    return [between(lo, hi), between(lo, hi)]
  },
  groups: [difficultyGroup('both numbers from 11 to 15', 'both numbers from 11 to 19', 'adds the 20s (base 20)')],
}

// ───────────────────────────────────────────────────────────── 7. × 9, 99, 999
const timesNines: VedicImpl = {
  id: 'times-nines',
  idea: '9, 99 and 999 are one less than 10, 100 and 1000. So n × 99 = n × 100 − n: shift the number two places and take it off once.',
  recipe: [
    'Count the nines and name the round number above them: 99 → 100, 999 → 1000.',
    'Multiply by the round number by adding zeros: 47 × 100 = 4700.',
    'Subtract the number once: 4700 − 47 = 4653.',
  ],
  tip: 'Take the subtraction in two bites: 4700 − 50 = 4650, then add back 3 → 4653. (That is the "round it, then correct" trick, later in this section.)',
  demos: [[37, 1], [47, 2], [63, 3]],
  solve: ([n, k]) => {
    const pw = 10 ** k
    const m = pw - 1
    const answer = n * pw - n
    return {
      prompt: `${n} × ${m}`,
      answer,
      steps: [
        `${m} is ${pw} − 1, so ${n} × ${m} = ${n} × ${pw} − ${n}.`,
        `${n} × ${pw} = ${n * pw}.`,
        `${n * pw} − ${n} = ${answer}.`,
      ],
    }
  },
  truth: ([n, k]) => n * (10 ** k - 1),
  random: (c, i) => {
    const level = levelOf(c, i)
    if (level === 'easy') return [between(12, 99), 1]
    if (level === 'medium') return [between(12, 99), 2]
    return chance(0.5) ? [between(101, 999), 2] : [between(12, 99), 3]
  },
  groups: [difficultyGroup('× 9 with two-digit numbers', '× 99 with two-digit numbers', '× 99 with three-digit numbers, × 999')],
}

// ───────────────────────────────────────────────────────────── 8. × and ÷ by 5, 25, 125
const SHIFT: Record<number, { div: number; shift: number }> = {
  5: { div: 2, shift: 10 },
  25: { div: 4, shift: 100 },
  125: { div: 8, shift: 1000 },
}

const fiveTwentyFive: VedicImpl = {
  id: 'five-25-125',
  idea:
    '5 is 10 ÷ 2, 25 is 100 ÷ 4 and 125 is 1000 ÷ 8. So multiplying by 5, 25 or 125 means halving, quartering or eighthing, then shifting the decimal point. ' +
    'Dividing by them is the same trick run backwards: multiply by 2, 4 or 8, then shift the other way.',
  recipe: [
    '× 5: halve it, then × 10. 36 × 5 → 18 → 180.',
    '× 25: divide by 4, then × 100. 36 × 25 → 9 → 900.',
    '× 125: divide by 8, then × 1000. 48 × 125 → 6 → 6000.',
    'A leftover fraction is fine, it vanishes when you shift: 37 × 25 → 9.25 → 925.',
    '÷ 5, ÷ 25, ÷ 125: multiply by 2, 4, 8, then shift back. 350 ÷ 25 → 350 × 4 = 1400 → 14.',
  ],
  tip: 'Handy halves: 1000 ÷ 8 = 125, 100 ÷ 4 = 25, so 8 × 125 = 1000 and 4 × 25 = 100. Spot those pairs inside bigger products.',
  demos: [[48, 5, 0], [36, 25, 0], [24, 125, 0], [135, 5, 1]],
  solve: ([n, m, op]) => {
    const { div, shift } = SHIFT[m]
    if (op === 0) {
      const answer = n * m
      return {
        prompt: `${n} × ${m}`,
        answer,
        steps: [
          `${m} = ${shift} ÷ ${div}, so ${n} × ${m} = (${n} ÷ ${div}) × ${shift}.`,
          `${n} ÷ ${div} = ${n / div}.`,
          `${n / div} × ${shift} = ${answer}.`,
        ],
      }
    }
    const q = n / m
    return {
      prompt: `${n} ÷ ${m}`,
      answer: q,
      steps: [
        `Run the trick backwards: ${n} ÷ ${m} = (${n} × ${div}) ÷ ${shift}.`,
        `${n} × ${div} = ${n * div}.`,
        `${n * div} ÷ ${shift} = ${q}.`,
      ],
    }
  },
  truth: ([n, m, op]) => (op === 0 ? n * m : n / m),
  random: (c, i) => {
    const level = levelOf(c, i)
    const mode = c.mode === 'mixed' ? (chance(0.5) ? 'multiply' : 'divide') : (c.mode ?? 'multiply')
    const m = level === 'easy' ? pick([5, 25]) : pick([5, 25, 125])
    const { div } = SHIFT[m]
    if (mode === 'multiply') {
      let n: number
      if (level === 'hard') n = between(11, m === 5 ? 199 : 99)
      else if (level === 'easy') n = div * (m === 5 ? between(6, 49) : between(3, 25))
      else n = div * (m === 5 ? between(10, 99) : m === 25 ? between(5, 60) : between(2, 40))
      return [n, m, 0]
    }
    const q = level === 'easy' ? between(4, 40) : level === 'medium' ? between(6, 60) : between(12, 99)
    return [q * m, m, 1]
  },
  groups: [
    {
      key: 'mode',
      title: 'Operation',
      defaultId: 'mixed',
      options: [
        { id: 'multiply', label: 'Multiply', description: '36 × 25' },
        { id: 'divide', label: 'Divide', description: '350 ÷ 25' },
        { id: 'mixed', label: 'Mixed' },
      ],
    },
    difficultyGroup('× 5 and × 25, numbers that halve cleanly', 'adds × 125, still clean numbers', 'any number (fractions appear mid-way), bigger quotients'),
  ],
}

// ───────────────────────────────────────────────────────────── 9. Crosswise multiplication
const crosswise: VedicImpl = {
  id: 'crosswise',
  idea:
    '(10p + q)(10r + s) = pr × 100 + (ps + qr) × 10 + qs. Each piece is a product of digits: the units multiplied vertically, the digits multiplied crosswise and added, ' +
    'the tens multiplied vertically. The sutra "vertically and crosswise" is exactly this pattern, and it works for any two two-digit numbers.',
  recipe: [
    'Split both numbers into digits: 23 = (2, 3) and 41 = (4, 1).',
    'Right piece, vertical on the units: 3 × 1 = 3.',
    'Middle piece, crosswise: 2 × 1 + 3 × 4 = 2 + 12 = 14.',
    'Left piece, vertical on the tens: 2 × 4 = 8.',
    'Stack them, each one place to the right of the last: 8 | 14 | 3 → 800 + 140 + 3 = 943. A two-digit piece just spills into the place on its left.',
  ],
  tip: 'Do the middle piece last in your head if you like: left first (8 hundreds), then middle (14 tens = 140), then right (3).',
  demos: [[23, 41], [34, 52], [67, 48]],
  solve: ([a, b]) => {
    const p = Math.floor(a / 10)
    const q = a % 10
    const r = Math.floor(b / 10)
    const s = b % 10
    const L = p * r
    const M = p * s + q * r
    const R = q * s
    const answer = L * 100 + M * 10 + R
    return {
      prompt: `${a} × ${b}`,
      answer,
      steps: [
        `Split: ${a} = (${p}, ${q}) and ${b} = (${r}, ${s}).`,
        `Right, units × units: ${q} × ${s} = ${R}.`,
        `Middle, crosswise: ${p} × ${s} + ${q} × ${r} = ${p * s} + ${q * r} = ${M}.`,
        `Left, tens × tens: ${p} × ${r} = ${L}.`,
        `Stack: ${L} | ${M} | ${R} → ${L * 100} + ${M * 10} + ${R} = ${answer}.`,
      ],
    }
  },
  truth: ([a, b]) => a * b,
  random: (c, i) => {
    const level = levelOf(c, i)
    if (level === 'hard') return [between(11, 99), between(11, 99)]
    const max = level === 'easy' ? 3 : 6
    return [between(1, max) * 10 + between(1, max), between(1, max) * 10 + between(1, max)]
  },
  groups: [difficultyGroup('every digit 1–3', 'every digit 1–6', 'any two two-digit numbers')],
}

// ───────────────────────────────────────────────────────────── 10. All from 9, last from 10
const allFrom9: VedicImpl = {
  id: 'all-from-9',
  idea:
    'Subtracting from 1000 is the same as subtracting from 999 (every digit simply becomes 9 − digit, so no borrowing) and then adding 1. ' +
    'Adding that 1 only touches the last non-zero digit, which is why that digit goes "from 10" instead.',
  recipe: [
    'Count the zeros in the round number: 1000 has three, so work with three digits (pad the number with zeros on the left if it is shorter).',
    'Turn every digit into what it needs to reach 9: 4 → 5, 6 → 3.',
    'The last non-zero digit goes from 10 instead: 8 → 2.',
    'Any zeros after it stay zeros. Read off the result: 1000 − 468 = 532.',
  ],
  tip: '1000 − 350 → 3 → 6, 5 → 5 (from 10), the final 0 stays → 650. Pad on the left when needed: 10000 − 468 → 0468 → 9532.',
  demos: [[2, 36], [3, 468], [3, 350], [4, 468]],
  solve: ([k, n]) => {
    const N = 10 ** k
    const digits = String(n).padStart(k, '0').split('').map(Number)
    let last = digits.length - 1
    while (last > 0 && digits[last] === 0) last--
    const parts: string[] = []
    const out = digits.map((d, i) => {
      if (i < last) {
        parts.push(`9 − ${d} = ${9 - d}`)
        return 9 - d
      }
      if (i === last) {
        parts.push(`10 − ${d} = ${10 - d}`)
        return 10 - d
      }
      parts.push('0 stays 0')
      return 0
    })
    const answer = Number(out.join(''))
    const steps = [`Every digit from 9, except the last non-zero digit, which is taken from 10.`]
    if (String(n).length < k) steps.push(`Pad ${n} with zeros on the left to ${k} digits: ${digits.join('')}.`)
    steps.push(`Digit by digit: ${parts.join(', ')}.`)
    steps.push(`Read across: ${answer}.`)
    return { prompt: `${N} − ${n}`, answer, steps }
  },
  truth: ([k, n]) => 10 ** k - n,
  random: (c, i) => {
    const level = levelOf(c, i)
    if (level === 'easy') {
      const n = between(11, 99)
      return n % 10 === 0 ? null : [2, n]
    }
    if (level === 'medium') {
      const n = between(101, 999)
      return n % 10 === 0 && chance(0.7) ? null : [3, n]
    }
    const k = pick([4, 5])
    let n = between(10 ** (k - 3), 10 ** k - 1)
    if (chance(0.3)) n -= n % 10
    return n > 0 ? [k, n] : null
  },
  groups: [difficultyGroup('from 100, two-digit numbers', 'from 1000, three-digit numbers', 'from 10000 or 100000, with padding and trailing zeros')],
}

// ───────────────────────────────────────────────────────────── 11. Compensation (round, then correct)
const compensation: VedicImpl = {
  id: 'compensation',
  idea:
    'A number just under a round number is awkward, so round it up, do the easy sum, then give back the small difference. ' +
    'a + (R − e) = (a + R) − e and a − (R − e) = (a − R) + e. The correction e is always small, so it is easy to apply.',
  recipe: [
    'Spot the awkward number sitting close to a round one: 198 is close to 200, 297 is close to 300.',
    'Name the gap: 198 = 200 − 2.',
    'Add (or subtract) the round number, which is easy: 467 + 200 = 667.',
    'Correct for the gap. Adding 198 means you added 2 too many, so take 2 back: 665.',
    'Subtracting 297? You took 3 too many, so add 3 back: 842 − 300 = 542, then + 3 → 545.',
  ],
  tip: 'If the awkward number is just ABOVE the round one (203), the correction flips: 905 − 203 → 905 − 200 = 705, then − 3 → 702.',
  demos: [[467, 198, 0, 200], [842, 297, 1, 300], [3456, 1997, 0, 2000], [905, 203, 1, 200]],
  solve: ([a, b, op, R]) => {
    const below = b < R
    const e = Math.abs(R - b)
    const steps: string[] = [`${b} is ${R} ${below ? '−' : '+'} ${e}.`]
    let answer: number
    if (op === 0) {
      const x = a + R
      steps.push(`${a} + ${R} = ${x}.`)
      answer = below ? x - e : x + e
      steps.push(below ? `That added ${e} too many, so take it back: ${x} − ${e} = ${answer}.` : `Now add the extra ${e}: ${x} + ${e} = ${answer}.`)
    } else {
      const x = a - R
      steps.push(`${a} − ${R} = ${x}.`)
      answer = below ? x + e : x - e
      steps.push(below ? `That took ${e} too many, so give it back: ${x} + ${e} = ${answer}.` : `Now take away the extra ${e}: ${x} − ${e} = ${answer}.`)
    }
    return { prompt: `${a} ${op === 0 ? '+' : '−'} ${b}`, answer, steps }
  },
  truth: ([a, b, op]) => (op === 0 ? a + b : a - b),
  random: (c, i) => {
    const level = levelOf(c, i)
    const op = c.mode === 'mixed' ? (chance(0.5) ? 0 : 1) : c.mode === 'subtract' ? 1 : 0
    let R: number
    let e: number
    let below = true
    let span: number
    if (level === 'easy') {
      R = 100
      e = between(1, 4)
      span = 150
    } else if (level === 'medium') {
      R = 100 * between(2, 9)
      e = between(1, 6)
      span = 900
    } else {
      R = pick([100, 1000]) * between(2, 9)
      e = between(1, 9)
      below = chance(0.6)
      span = R >= 1000 ? 4000 : 900
    }
    const b = below ? R - e : R + e
    const a = op === 0 ? between(20, span) + (level === 'hard' ? 1000 : 0) : R + between(e + 1, span)
    return [a, b, op, R]
  },
  groups: [
    {
      key: 'mode',
      title: 'Operation',
      defaultId: 'mixed',
      options: [
        { id: 'add', label: 'Add', description: '467 + 198' },
        { id: 'subtract', label: 'Subtract', description: '842 − 297' },
        { id: 'mixed', label: 'Mixed' },
      ],
    },
    difficultyGroup('just under 100 (96–99)', 'just under 200–900', 'thousands too, and sometimes just over (203, 1004)'),
  ],
}

export const VEDIC_IMPLS: Record<string, VedicImpl> = Object.fromEntries(
  [squaresNear50, squaresEnding5, duplexSquares, unitsAddTo10, timesEleven, teens, timesNines, fiveTwentyFive, crosswise, allFrom9, compensation].map((t) => [t.id, t]),
)

export const stepsNote = (steps: string[]) => steps.map((s, i) => `${i + 1}. ${s}`).join('\n')

/** Builds a practice session for one trick. Avoids repeats while the pool is big enough, then allows them rather than coming up short. */
export function generateVedicQuestions(id: string, choice: Record<string, string>, count: number): Question[] {
  const impl = VEDIC_IMPLS[id]
  const out: Question[] = []
  const seen = new Set<string>()
  let guard = 0
  while (out.length < count && guard++ < count * 60) {
    const args = impl.random(choice, out.length)
    if (!args) continue
    const p = impl.solve(args)
    if (seen.has(p.prompt) && guard < count * 30) continue
    seen.add(p.prompt)
    out.push(intQuestion('vd', p.prompt, p.answer, stepsNote(p.steps)))
  }
  return out
}
