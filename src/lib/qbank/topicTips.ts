import type { BankTopicId, QuantQuestion } from './types'

/**
 * Standard exam shortcuts for each topic, shown under the step-by-step solution. They are the formulas and
 * tricks an SBI/IBPS aspirant is expected to know, so a question that has no tip of its own still teaches the quick way.
 */
export const TOPIC_TIPS: Record<BankTopicId, string[]> = {
  simplification: [
    'Turn decimals into fractions once (0.125 = 1/8, 0.375 = 3/8, 0.0625 = 1/16) and cancel before you multiply.',
    'Use (a ± b)² = a² ± 2ab + b² for numbers near a round figure: 98² = (100 − 2)² = 10000 − 400 + 4 = 9604.',
    'a² − b² = (a − b)(a + b): 47² − 43² = 4 × 90 = 360. Keep squares to 30 and cubes to 15 by heart.',
  ],
  approximation: [
    'Round every number to a nearby convenient value (one or two significant digits) and keep the order of operations; the options are usually far apart.',
    'Remember fraction–percent pairs: 1/6 = 16.67%, 1/7 = 14.28%, 1/8 = 12.5%, 1/9 = 11.11%, 3/8 = 37.5%.',
    'Replace a root with the nearest perfect square or cube root, then adjust only if two options are close.',
  ],
  'wrong-number-series': [
    'Check the differences of neighbouring terms first, then the ratios, then n² ± k and n³ ± k patterns.',
    'The wrong term is the one that breaks an otherwise steady pattern: test the pattern on the terms before and after it.',
    'If the differences themselves form a pattern (constant, squares, doubling), extend that pattern to find the term that does not fit.',
  ],
  'missing-number-series': [
    'Try differences, then differences of differences, then ratios; also look for patterns like ×1 + 1, ×2 + 2, ×3 + 3.',
    'Split the series into odd-position and even-position terms if one pattern does not fit all of it.',
    'Compare each term with squares, cubes and primes near it (n² + 1, n³ − 1, next prime).',
  ],
  'quadratic-equations': [
    'To factorise x² + bx + c, find two numbers whose sum is b and product is c, then change their signs to get the roots.',
    'Sign shortcut (a > 0): c > 0 and b > 0 give two negative roots, c > 0 and b < 0 give two positive roots, c < 0 gives roots of opposite signs.',
    'State a relation only if it holds for every pair of roots (x > y needs the smallest x above the largest y); otherwise the answer is "cannot be determined".',
  ],
  'quantity-comparison': [
    'Solve both quantities completely before comparing; do not estimate when the values could be close.',
    'Put both quantities in the same form (fractions, percentages or decimals) before comparing.',
    'To compare a/b with c/d (all positive), cross-multiply and compare ad with bc.',
  ],
  percentage: [
    'Successive changes of x% and y%: net % = x + y + xy/100 (use a minus sign for a decrease). +20% then −10% = 20 − 10 − 2 = +8%.',
    'Price up r%: to keep expenditure the same, cut consumption by r/(100 + r) × 100%. Price down r%: raise it by r/(100 − r) × 100%.',
    'Learn the fraction–percent pairs: 1/6 = 16.67%, 1/7 = 14.28%, 1/8 = 12.5%, 1/9 = 11.11%, 1/11 = 9.09%, 1/12 = 8.33%.',
  ],
  'profit-loss': [
    'SP = CP × (100 ± profit or loss %)/100, so CP = SP × 100/(100 ± %).',
    'Two successive discounts d1 and d2: net discount = d1 + d2 − d1·d2/100. Marked price = SP × 100/(100 − discount %).',
    'Two articles sold at the same price, one at x% profit and one at x% loss, always give an overall loss of x²/100 %.',
  ],
  'ratio-partnership': [
    'Make the ratio units equal first, then find 1 part = given amount ÷ its ratio number.',
    'Profit share is proportional to capital × time; when partners join late, compare capital × months.',
    'If x : y = a : b and y : z = c : d, then x : y : z = ac : bc : bd.',
  ],
  'ages-averages': [
    'Average = sum ÷ count. When one member is replaced, change in total = count × change in average.',
    'For ages, write present ages as ratio multiples (5x, 7x) and apply "after n years" to every term.',
    'Average of an arithmetic progression = (first + last)/2; average of the first n natural numbers = (n + 1)/2.',
  ],
  interest: [
    'CI − SI for 2 years = P × (r/100)²; for 3 years = P × (r/100)² × (300 + r)/100.',
    'Two-year compound multipliers: 5% = 1.1025, 10% = 1.21, 20% = 1.44; the amount is P × (1 + r/100)ⁿ.',
    'SI is the same every year; in CI the second year earns interest on the first year\'s interest too, which is exactly why CI − SI is small.',
  ],
  'time-work': [
    'Take total work = LCM of the given days; efficiency = LCM ÷ days.',
    'Pipes: an inlet adds its efficiency, an outlet subtracts; time = LCM ÷ net efficiency.',
    'Two workers taking a and b days finish together in ab/(a + b) days.',
  ],
  'speed-distance': [
    'km/h to m/s: multiply by 5/18; m/s to km/h: multiply by 18/5.',
    'A train crossing a pole covers its own length; crossing a platform or another train covers the sum of the lengths. Opposite directions: add speeds; same direction: subtract.',
    'Boats: downstream = b + s, upstream = b − s, so b = (D + U)/2 and s = (D − U)/2. Same distance at speeds a and b: average speed = 2ab/(a + b).',
  ],
  'mixture-alligation': [
    'Alligation: quantity of cheaper : quantity of dearer = (dearer price − mean price) : (mean price − cheaper price).',
    'After n replacements of x litres from a vessel of V litres, the original liquid left = V × (1 − x/V)ⁿ.',
    'Track the quantity that does not change (for example the milk) through each step and compare it with the new total.',
  ],
  mensuration: [
    'Circle: area πr², circumference 2πr. Use π = 22/7 when the radius is a multiple of 7.',
    'Cylinder: V = πr²h, curved area 2πrh. Cone: V = ⅓πr²h with slant l = √(r² + h²). Sphere: V = 4/3 πr³, surface area 4πr².',
    'Rectangle: perimeter 2(l + b), diagonal √(l² + b²). If every side of a square grows x%, its area grows 2x + x²/100 %.',
  ],
  'probability-pnc': [
    'nCr = n!/(r!(n − r)!) and nCr = nC(n − r); nPr = n!/(n − r)!.',
    'Probability = favourable ÷ total outcomes; "at least one" = 1 − P(none).',
    'Arrangements with repeated letters: n!/(p! q! …). For "together" conditions, treat the group as one object and multiply by its internal arrangements.',
  ],
  'number-system': [
    'LCM × HCF = product of the two numbers. HCF of fractions = HCF of numerators ÷ LCM of denominators.',
    'Divisibility: 3 and 9 by the digit sum, 11 by the difference of the sums of alternate digits, 8 by the last three digits.',
    'A number that leaves the same remainder r when divided by a, b and c has the form LCM(a, b, c) × k + r.',
  ],
  other: ['Write the given data in one line, decide what is asked, and look for a standard formula before calculating at length.'],
}

/** The shortcut(s) to show for a question: its own tip if it has one, otherwise the standard tips for its topic. */
export function shortcutsFor(question: Pick<QuantQuestion, 'shortcut' | 'topic'>): string[] {
  if (question.shortcut && question.shortcut.trim()) return [question.shortcut.trim()]
  return TOPIC_TIPS[question.topic] ?? TOPIC_TIPS.other
}
