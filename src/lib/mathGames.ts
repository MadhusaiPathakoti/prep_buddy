export interface MathGame {
  id: string
  title: string
  description: string
  to: string
  icon: string
}

export interface MathSection {
  id: string
  title: string
  blurb: string
  games: MathGame[]
}

/** The original arithmetic drills (all under /speed-math/…). */
const SPEED_DRILLS: MathGame[] = [
  {
    id: 'additions',
    title: 'Additions',
    description: 'Pick a digit length for each side, e.g. double + single digit gives 23 + 9.',
    to: '/speed-math/additions',
    icon: '➕',
  },
  {
    id: 'subtraction',
    title: 'Subtraction',
    description: 'Pick a digit length for each side, e.g. double − single digit gives 45 − 7.',
    to: '/speed-math/subtraction',
    icon: '➖',
  },
  {
    id: 'division',
    title: 'Division',
    description: 'Pick a digit length for dividend and divisor, e.g. double ÷ single digit gives 84 ÷ 7.',
    to: '/speed-math/division',
    icon: '➗',
  },
  {
    id: 'tables',
    title: 'Tables Practice',
    description: 'Multiplication tables from 1× up to 30×, e.g. 28 × 17.',
    to: '/speed-math/tables',
    icon: '✖️',
  },
  {
    id: 'squares-cubes',
    title: 'Squares & Cubes',
    description: 'Squares and cubes of numbers from 1 to 150.',
    to: '/speed-math/squares-cubes',
    icon: '²³',
  },
  {
    id: 'ratios',
    title: 'Ratios to Percentage',
    description: 'Convert fractions to percentages, e.g. 1/9 = 11.11%.',
    to: '/speed-math/ratios',
    icon: '%',
  },
  {
    id: 'percent-to-ratio',
    title: 'Percentage to Ratio',
    description: 'Convert percentages to fractions in lowest terms, e.g. 25% = 1/4.',
    to: '/speed-math/percent-to-ratio',
    icon: '⅟',
  },
  {
    id: 'pythagorean-triplets',
    title: 'Pythagorean Triplets',
    description: 'Fill in the missing number in a triplet, e.g. (3, 4, _) or (_, 4, 5).',
    to: '/speed-math/pythagorean-triplets',
    icon: '△',
  },
  {
    id: 'twin-number-products',
    title: 'Twin Number Products',
    description: 'Products of consecutive numbers, e.g. 4 × 5 = 20, or find the starting number from the product.',
    to: '/speed-math/twin-number-products',
    icon: '⨯',
  },
  {
    id: 'lcm-hcf-simplification',
    title: 'LCM, HCF & Simplification',
    description: 'LCM/HCF of 2-3 numbers and BODMAS simplification, e.g. LCM(12, 18) or 48 ÷ 6 + 7 × 3.',
    to: '/speed-math/lcm-hcf-simplification',
    icon: '∑',
  },
]

/** Quick-check drills that used to live in the separate Quant module (still under /quant/…). */
const QUICK_CHECKS: MathGame[] = [
  {
    id: 'divisibility',
    title: 'Divisibility',
    description: 'Spot the one number, out of four, that\'s exactly divisible by the given divisor.',
    to: '/quant/divisibility',
    icon: '÷',
  },
  {
    id: 'percent-degree',
    title: 'Percentage ↔ Degree',
    description: 'Convert between percentages and degrees of a circle, e.g. 10% = 36°.',
    to: '/quant/percent-degree',
    icon: '°',
  },
]

/** Mental-math shortcut games: techniques to do the calculation in your head, no pen and paper. */
export const SHORTCUT_GAMES: MathGame[] = [
  {
    id: 'multiply-near-base',
    title: 'Multiply Near a Base',
    description: 'Use 100 or 1000 as a base: 97 × 94 = (97 − 6) | (3 × 6) = 9118.',
    to: '/maths/multiply-near-base',
    icon: 'B×',
  },
  {
    id: 'percentage-of-number',
    title: 'Percentage of a Number',
    description: 'Find 18% of 450, what % one number is of another, or the whole from its percentage.',
    to: '/maths/percentage-of-number',
    icon: '%',
  },
  {
    id: 'approximation',
    title: 'Approximation',
    description: 'Round smartly and pick the closest answer, e.g. 49.8% of 799.9 + 24.9² ≈ ?',
    to: '/maths/approximation',
    icon: '≈',
  },
  {
    id: 'compare-fractions',
    title: 'Compare Fractions',
    description: 'Which of 7/13, 9/17, 5/9 is the largest? Decide without dividing out.',
    to: '/maths/compare-fractions',
    icon: '⅗',
  },
  {
    id: 'successive-percent',
    title: 'Successive % & Discount',
    description: 'Net change after +20% then −10%, equivalent single discount, or the final price.',
    to: '/maths/successive-percent',
    icon: '±%',
  },
  {
    id: 'missing-digit',
    title: 'Missing Digit',
    description: 'Find the digit hidden in 47 × 38 = 17□6 using digit sums and last-digit checks.',
    to: '/maths/missing-digit',
    icon: '□',
  },
  {
    id: 'square-cube-roots',
    title: 'Square & Cube Roots',
    description: 'Roots of perfect squares and cubes from the last digit and bracketing, e.g. ∛17576 = 26.',
    to: '/maths/square-cube-roots',
    icon: '√',
  },
  {
    id: 'quadratic-equations',
    title: 'Quadratic Equations',
    description: 'Factorise two equations and compare x and y, exactly like the Prelims.',
    to: '/maths/quadratic-equations',
    icon: 'x²',
  },
  {
    id: 'series-warmup',
    title: 'Number Series Warm-up',
    description: 'Type the next term: squares, cubes, n² ± n, primes, running totals, interleaved series.',
    to: '/maths/series-warmup',
    icon: '1·4·9',
  },
]

/** Pace and memory games: hold numbers in your head and keep up with the clock. */
export const PACE_GAMES: MathGame[] = [
  {
    id: 'flash-chain',
    title: 'Flash Chain',
    description: 'A number flashes, then +8, ×3, −14 … one at a time. Type the final result from memory.',
    to: '/maths/flash-chain',
    icon: '➜',
  },
  {
    id: 'mental-memory',
    title: 'Mental Memory',
    description: 'Two numbers appear and vanish, then you are asked for their sum, difference or product.',
    to: '/maths/mental-memory',
    icon: '👁',
  },
  {
    id: 'beat-the-clock',
    title: 'Beat the Clock',
    description: 'A 30-120 second sprint that gets harder the longer you stay accurate. Beat your best score.',
    to: '/maths/beat-the-clock',
    icon: '⏱',
  },
]

export const MATH_SECTIONS: MathSection[] = [
  {
    id: 'shortcuts',
    title: 'Mental-math shortcuts',
    blurb: 'Techniques that let you calculate in your head — no pen and paper.',
    games: SHORTCUT_GAMES,
  },
  {
    id: 'pace',
    title: 'Pace & memory',
    blurb: 'Hold numbers in your head and keep up with the clock.',
    games: PACE_GAMES,
  },
  {
    id: 'drills',
    title: 'Basic drills',
    blurb: 'Tables, squares, conversions and quick checks that every shortcut builds on.',
    games: [...SPEED_DRILLS, ...QUICK_CHECKS],
  },
].filter((s) => s.games.length > 0)

export const ALL_MATH_GAMES: MathGame[] = MATH_SECTIONS.flatMap((s) => s.games)
