// Verification for the Digit Operations game.  Run:  npx tsx scripts/verify-digit-operations.ts   (RUNS=n to change the number of rounds)
//
// Each answer is recomputed from the question TEXT: the sentences are parsed back, then every digit is processed as a character
// with its own digit tables (no shared arithmetic with the generator). Also checks every changed digit stays 0-9.
import { createRng } from '../src/lib/mocks/rng'
import { generateDigitQuestions, type DigitDifficulty, type DigitQType } from '../src/lib/digitOperations'

const RUNS = Number(process.env.RUNS ?? 400)
let failures = 0
let checked = 0
const fail = (msg: string) => {
  failures++
  if (failures <= 30) console.error('FAIL', msg)
}

const ODD = '13579'
const EVEN = '02468'
const PRIME = '2357'

/** Does the digit character belong to the named group? */
function member(ch: string, group: string): boolean {
  if (group === 'odd digits') return ODD.includes(ch)
  if (group === 'even digits') return EVEN.includes(ch)
  if (group === 'prime digits') return PRIME.includes(ch)
  const m = group.match(/^digits smaller than (\d)$/)
  if (m) return Number(ch) < Number(m[1])
  throw new Error(`unknown group ${group}`)
}

const delta = (amount: string, how: string) => Number(amount) * (how === 'added to' ? 1 : -1)
const GROUP = '(odd digits|even digits|prime digits|digits smaller than \\d)'

function parseAndRun(number: string, stem: string): { digits: string[]; tail: string; changed: string[] } | null {
  const t = stem.match(new RegExp(`^If in the given number, (\\d) is (added to|subtracted from) each of the ${GROUP} and (\\d) is (added to|subtracted from) each of the remaining digits(.*)$`))
  if (!t) return null
  const inGroup = delta(t[1], t[2])
  const rest = delta(t[4], t[5])
  const group = t[3]
  const changed = number.split('').map((ch) => String(Number(ch) + (member(ch, group) ? inGroup : rest)))
  let digits = changed.slice()
  const parts = t[6].split(', and then ')
  const tail = parts.pop() as string // ", which digit …?" — the question itself follows the last comma
  const stepsText = parts.filter((p) => p !== '')
  // the last step sentence is glued to the question: split it at its final ", "
  const lastStep = tail.slice(0, tail.lastIndexOf(', '))
  const question = tail.slice(tail.lastIndexOf(', ') + 2)
  if (lastStep) stepsText.push(lastStep)
  for (const s of stepsText) {
    let m: RegExpMatchArrayLike | null
    if ((m = s.match(/^all the digits are arranged in (ascending|descending) order from left to right$/))) {
      digits = digits.slice().sort((x, y) => (m![1] === 'ascending' ? Number(x) - Number(y) : Number(y) - Number(x)))
    } else if (s.startsWith('all the repeated digits are deleted')) {
      const seen = new Set<string>()
      digits = digits.filter((d) => (seen.has(d) ? false : (seen.add(d), true)))
    } else if ((m = s.match(new RegExp(`^all the ${GROUP} are deleted$`)))) {
      digits = digits.filter((d) => !member(d, m![1]))
    } else {
      throw new Error(`unknown step: ${s}`)
    }
  }
  return { digits, tail: question, changed }
}
type RegExpMatchArrayLike = RegExpMatchArray

const ORD = (s: string) => Number(s.replace(/(st|nd|rd|th)$/, ''))

function expected(digits: string[], question: string): string | null {
  const len = digits.length
  let m = question.match(/^which digit will be (\d+(?:st|nd|rd|th)) from the (left|right) end of the new number\?$/)
  if (m) {
    const n = ORD(m[1])
    return digits[m[2] === 'left' ? n - 1 : len - n] ?? null
  }
  m = question.match(/^what will be the (sum of|product of|difference between) the (\d+(?:st|nd|rd|th)) digit from the left end and the (\d+(?:st|nd|rd|th)) digit from the right end of the new number\?$/)
  if (m) {
    const a = Number(digits[ORD(m[2]) - 1])
    const b = Number(digits[len - ORD(m[3])])
    if (Number.isNaN(a) || Number.isNaN(b)) return null
    return String(m[1] === 'sum of' ? a + b : m[1] === 'product of' ? a * b : Math.abs(a - b))
  }
  m = question.match(new RegExp(`^how many ${GROUP} will the new number have\\?$`))
  if (m) return String(digits.filter((d) => member(d, m![1])).length)
  return null
}

const LEVELS: DigitDifficulty[] = ['easy', 'medium', 'hard', 'mixed']
const TYPES: DigitQType[] = ['mixed', 'nth', 'calc', 'count']
const shapes = new Set<string>()

for (let r = 0; r < RUNS; r++) {
  const difficulty = LEVELS[r % 4]
  const type = TYPES[(r >> 2) % 4]
  const qs = generateDigitQuestions(difficulty, type, 12, createRng(7000 + r))
  const numbers = new Set<string>()
  for (const q of qs) {
    checked++
    const number = q.spec.digits.join('')
    const tag = `[${difficulty}/${type}] ${number}`
    if (numbers.has(number)) fail(`${tag}: number repeated within a session`)
    numbers.add(number)
    shapes.add(q.stem.replace(/\d+(st|nd|rd|th)?/g, 'N'))
    if (q.options.length !== 5 || new Set(q.options).size !== 5) fail(`${tag}: options ${q.options.join('|')}`)
    const run = parseAndRun(number, q.stem)
    if (!run) {
      fail(`${tag}: could not read "${q.stem}"`)
      continue
    }
    if (run.changed.some((d) => Number(d) < 0 || Number(d) > 9)) fail(`${tag}: a changed digit left 0-9 (${run.changed.join(' ')}) in "${q.stem}"`)
    const want = expected(run.digits, run.tail)
    if (want === null) fail(`${tag}: could not resolve "${run.tail}" on ${run.digits.join('')}`)
    else if (q.options[q.answer] !== want) fail(`${tag}: "${q.stem}" game says ${q.options[q.answer]}, recount says ${want} (new number ${run.digits.join('')})`)
    if (!q.explanation || !q.hint) fail(`${tag}: missing explanation/hint`)
  }
}

console.log(`${checked} questions checked over ${RUNS} rounds; ${shapes.size} wordings.`)
if (failures) {
  console.error(`${failures} failure(s)`)
  process.exit(1)
}
console.log('OK')
