// Verification for the Number Arrangement game.  Run:  npx tsx scripts/verify-number-arrangement.ts   (RUNS=n to change the number of sets)
//
// Each answer is recomputed from the question TEXT with string operations (digits are characters, "Nth lowest" is found by
// counting how many numbers are smaller), sharing no arithmetic with the generator. Also checks the numbers and the options.
import { createRng } from '../src/lib/mocks/rng'
import { generateNumberSets, type NumDifficulty, type NumQType } from '../src/lib/numberArrangement'

const RUNS = Number(process.env.RUNS ?? 600)
let failures = 0
let checked = 0
const fail = (msg: string) => {
  failures++
  if (failures <= 30) console.error('FAIL', msg)
}

const ORD: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 }
const COUNT = ['None', 'One', 'Two', 'Three', 'More than three']
const BETWEEN = ['None', 'One', 'Two', 'Three', 'Four']

/** The number with exactly (n-1) numbers below it (lowest) or above it (highest). */
function ranked(nums: number[], word: string | undefined, dir: string): number {
  const n = word ? ORD[word] : 1
  for (const x of nums) {
    const below = nums.filter((y) => y < x).length
    const above = nums.filter((y) => y > x).length
    if (dir === 'lowest' ? below === n - 1 : above === n - 1) return x
  }
  throw new Error('no such rank: ' + nums.join(' ') + ' ' + word + ' ' + dir)
}

function change(n: number, how: string): number {
  const s = String(n)
  if (how.startsWith('the first and third')) return Number(s[2] + s[1] + s[0])
  if (how.startsWith('the first and second')) return Number(s[1] + s[0] + s[2])
  if (how.startsWith('the second and third')) return Number(s[0] + s[2] + s[1])
  if (how.startsWith('each number is reversed')) return Number(s.split('').reverse().join(''))
  if (how.includes('ascending')) return Number(s.split('').sort().join(''))
  if (how.includes('descending')) return Number(s.split('').sort().reverse().join(''))
  throw new Error(`unknown change: ${how}`)
}

function test(n: number, prop: string): boolean {
  let m = prop.match(/^divisible by (\d+)$/)
  if (m) return n % Number(m[1]) === 0
  if (prop === 'even') return n % 2 === 0
  if (prop === 'odd') return n % 2 === 1
  m = prop.match(/^greater than (\d+)$/)
  if (m) return n > Number(m[1])
  m = prop.match(/^less than (\d+)$/)
  if (m) return n < Number(m[1])
  throw new Error(`unknown property: ${prop}`)
}

const digit = (n: number, where: string) => Number(String(n)['first second third'.split(' ').indexOf(where)])
const RANK = '(?:(second|third|fourth|fifth) )?(lowest|highest)'

function expected(nums: number[], stem: string): string | null {
  let m = stem.match(new RegExp(`^Which is the ${RANK} number in the sequence\\?$`))
  if (m) return String(ranked(nums, m[1], m[2]))

  m = stem.match(new RegExp(`^Which of the following numbers is to the immediate (right|left) of the ${RANK} number in the sequence\\?$`))
  if (m) {
    const at = nums.indexOf(ranked(nums, m[2], m[3])) + (m[1] === 'right' ? 1 : -1)
    return at < 0 || at >= nums.length ? null : String(nums[at])
  }

  m = stem.match(new RegExp(`^Which is the (first|second|third) digit of the ${RANK} number in the sequence\\?$`))
  if (m) return String(digit(ranked(nums, m[2], m[3]), m[1]))

  m = stem.match(/^How many numbers are there between (\d+) and (\d+) when the numbers are arranged in ascending order\?$/)
  if (m) {
    const lo = Math.min(Number(m[1]), Number(m[2]))
    const hi = Math.max(Number(m[1]), Number(m[2]))
    return BETWEEN[nums.filter((x) => x > lo && x < hi).length]
  }

  m = stem.match(/^In how many numbers is the difference between the first and third digits (equal to|less than|more than) (\d+)\?$/)
  if (m) {
    const c = nums.filter((x) => {
      const s = String(x)
      const d = Math.abs(Number(s[0]) - Number(s[2]))
      return m![1] === 'equal to' ? d === Number(m![2]) : m![1] === 'less than' ? d < Number(m![2]) : d > Number(m![2])
    }).length
    return COUNT[Math.min(c, 4)]
  }

  m = stem.match(/^In how many numbers is the sum of all three digits (even|odd|more than \d+|less than \d+)\?$/)
  if (m) {
    const c = nums.filter((x) => {
      const sum = String(x).split('').reduce((a, ch) => a + Number(ch), 0)
      if (m![1] === 'even') return sum % 2 === 0
      if (m![1] === 'odd') return sum % 2 === 1
      const v = Number(m![1].split(' ')[2])
      return m![1].startsWith('more') ? sum > v : sum < v
    }).length
    return COUNT[Math.min(c, 4)]
  }

  m = stem.match(/^In how many numbers is the middle digit (greater|smaller) than both the first and third digits\?$/)
  if (m) {
    const c = nums.filter((x) => {
      const [a, b, d] = String(x).split('').map(Number)
      return m![1] === 'greater' ? b > a && b > d : b < a && b < d
    }).length
    return COUNT[Math.min(c, 4)]
  }

  m = stem.match(/^If (\d) is (added to|subtracted from) each number, how many numbers will be (.+)\?$/)
  if (m) {
    const k = Number(m[1]) * (m[2] === 'added to' ? 1 : -1)
    return COUNT[Math.min(nums.filter((x) => test(x + k, m![3])).length, 4)]
  }

  m = stem.match(new RegExp(`^If (.+), which of the following will be the ${RANK} number\\?$`))
  if (m) return String(ranked(nums.map((x) => change(x, m![1])), m[2], m[3]))

  m = stem.match(/^If (.+), how many of the new numbers will be (.+)\?$/)
  if (m) return COUNT[Math.min(nums.map((x) => change(x, m![1])).filter((x) => test(x, m![2])).length, 4)]

  const T = `the (first|second|third) digit of the ${RANK} number`
  m = stem.match(new RegExp(`^What is the (sum of|difference between) ${T} and ${T}\\?$`))
  if (m) {
    const a = digit(ranked(nums, m[3], m[4]), m[2])
    const b = digit(ranked(nums, m[6], m[7]), m[5])
    return String(m[1] === 'sum of' ? a + b : Math.abs(a - b))
  }

  m = stem.match(new RegExp(`^What is the difference between the ${RANK} number and the ${RANK} number\\?$`))
  if (m) return String(Math.abs(ranked(nums, m[1], m[2]) - ranked(nums, m[3], m[4])))

  return null
}

const LEVELS: NumDifficulty[] = ['easy', 'medium', 'hard', 'mixed']
const TYPES: NumQType[] = ['mixed', 'position', 'count', 'modified', 'calc']
const shapes = new Set<string>()
const kinds = new Set<string>()

for (let r = 0; r < RUNS; r++) {
  const difficulty = LEVELS[r % 4]
  const type = TYPES[(r >> 2) % TYPES.length]
  const sets = generateNumberSets(difficulty, type, 10, createRng(9000 + r))
  for (const set of sets) {
    const nums = set.numbers
    const tag = `[${difficulty}/${type}] ${nums.join(' ')}`
    if (nums.length !== 5 || new Set(nums).size !== 5) fail(`${tag}: numbers not five different`)
    if (nums.some((x) => x < 100 || x > 999 || String(x)[0] === '0' || x % 10 === 0)) fail(`${tag}: zero at an end or not three digits`)
    if (set.questions.length !== 5) fail(`${tag}: ${set.questions.length} questions`)
    const stems = new Set<string>()
    set.questions.forEach((q, i) => {
      checked++
      kinds.add(q.spec.k)
      shapes.add(q.stem.replace(/\d+/g, 'N'))
      if (stems.has(q.stem)) fail(`${tag}: duplicate stem "${q.stem}"`)
      stems.add(q.stem)
      if (q.options.length !== 5 || new Set(q.options).size !== 5) fail(`${tag} Q${i + 1} "${q.stem}": options ${q.options.join('|')}`)
      const want = expected(nums, q.stem)
      if (want === null) fail(`${tag} Q${i + 1} "${q.stem}": could not read the question`)
      else if (q.options[q.answer] !== want) fail(`${tag} Q${i + 1} "${q.stem}": game says ${q.options[q.answer]}, recount says ${want}`)
      if (!set.explanations[i] || !set.hints[i]) fail(`${tag} Q${i + 1}: missing explanation/hint`)
    })
  }
}

if (kinds.size !== 10) fail(`only saw kinds: ${[...kinds].join(',')}`)
console.log(`${checked} questions checked over ${RUNS} runs; ${kinds.size} kinds, ${shapes.size} wordings.`)
if (failures) {
  console.error(`${failures} failure(s)`)
  process.exit(1)
}
console.log('OK')
