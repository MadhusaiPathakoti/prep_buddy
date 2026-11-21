// Verification for the Alphanumeric Series game.  Run:  npx tsx scripts/verify-alpha-series.ts   (RUNS=n to change the number of sets)
//
// Every generated answer is re-derived a second way: the question TEXT is parsed back and the answer worked out by counting
// elements one at a time (no index arithmetic shared with the generator). Also checks the series and the options.
import { createRng } from '../src/lib/mocks/rng'
import { generateAlphaSets, type AlphaDifficulty, type AlphaQType } from '../src/lib/alphaNumSeries'

const RUNS = Number(process.env.RUNS ?? 400)
let failures = 0
let checked = 0
const fail = (msg: string) => {
  failures++
  if (failures <= 30) console.error('FAIL', msg)
}

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U'])
const kind = (ch: string): string[] => {
  if (/[A-Z]/.test(ch)) return ['letter', VOWELS.has(ch) ? 'vowel' : 'consonant']
  if (/[0-9]/.test(ch)) return ['number', Number(ch) % 2 ? 'odd number' : 'even number']
  return ['symbol']
}
const is = (ch: string, noun: string) => noun === 'element' || (noun === 'alphabet' ? kind(ch).includes('letter') : kind(ch).includes(noun))

const ORD = (s: string) => Number(s.replace(/(st|nd|rd|th)$/, ''))
const NOUN = '(element|alphabet|vowel|consonant|number|even number|odd number|symbol)'
const ANCHOR = `(?:the (\\d+(?:st|nd|rd|th)) ${NOUN} from the (left|right) end|([^ ]))`

/** Resolve "the 3rd symbol from the right end" / a bare element against a row, counting by hand. */
function resolve(row: string[], m: RegExpMatchArray, at: number): number {
  if (m[at + 3]) return row.indexOf(m[at + 3])
  const n = ORD(m[at])
  const noun = m[at + 1]
  const fromLeft = m[at + 2] === 'left'
  let seen = 0
  const walk = fromLeft ? row.map((_, i) => i) : row.map((_, i) => row.length - 1 - i)
  for (const i of walk) {
    if (is(row[i], noun) && ++seen === n) return i
  }
  return -1
}

function rowFor(series: string[], stem: string): string[] {
  if (stem.startsWith('If the series is reversed')) return series.slice().reverse()
  const d = stem.match(/^If all the (.+?) are dropped/)
  if (d) {
    const plural = d[1]
    const noun = plural.replace(/s$/, '')
    return series.filter((ch) => !is(ch, noun))
  }
  return series
}

function expected(series: string[], stem: string): string | null {
  const row = rowFor(series, stem)
  const body = stem.replace(/^If [^,]*(?:\([^)]*\))?[^,]*, /, '').replace(/^[a-z]/, (c) => c.toUpperCase())

  let m = body.match(new RegExp(`^Which element is ${ANCHOR}\\?$`))
  if (m) return row[resolve(row, m, 1)] ?? null

  m = body.match(new RegExp(`^Which element is the (\\d+(?:st|nd|rd|th)) to the (left|right) of ${ANCHOR}\\?$`))
  if (m) {
    const base = resolve(row, m, 3)
    const j = ORD(m[1])
    const idx = m[2] === 'left' ? base - j : base + j
    return base < 0 || idx < 0 || idx >= row.length ? null : row[idx]
  }

  m = body.match(new RegExp(`^How many elements are there between ${ANCHOR} and ${ANCHOR}\\?$`))
  if (m) {
    const a = resolve(row, m, 1)
    const b = resolve(row, m, 5)
    return a < 0 || b < 0 ? null : String(Math.abs(a - b) - 1)
  }

  m = body.match(new RegExp(`^Which of the following elements is exactly between ${ANCHOR} and ${ANCHOR}\\?$`))
  if (m) {
    const a = resolve(row, m, 1)
    const b = resolve(row, m, 5)
    if (a < 0 || b < 0 || (a + b) % 2 !== 0) return null
    return row[(a + b) / 2]
  }

  m = stem.match(/^How many (.+?) are there in the series which are (.+)\?$/)
  if (m) {
    const cur = m[1].replace(/s$/, '')
    const next = m[2].match(/immediately followed by an? (.+?)(?: and |$)/)?.[1]
    const prev = m[2].match(/immediately preceded by an? (.+?)(?: and |$)/)?.[1]
    let count = 0
    for (let i = 0; i < series.length; i++) {
      if (!is(series[i], cur)) continue
      if (prev && !(i > 0 && is(series[i - 1], prev))) continue
      if (next && !(i < series.length - 1 && is(series[i + 1], next))) continue
      count++
    }
    return count === 0 ? 'None' : String(count)
  }
  return null
}

const LEVELS: AlphaDifficulty[] = ['easy', 'medium', 'hard']
const TYPES: AlphaQType[] = ['mixed', 'count', 'position', 'between', 'modified']
const seen = new Set<string>()

for (let r = 0; r < RUNS; r++) {
  const difficulty = LEVELS[r % 3]
  const type = TYPES[(r >> 1) % TYPES.length]
  const rng = createRng(1000 + r)
  const sets = generateAlphaSets(difficulty, type, 10, rng)
  for (const set of sets) {
    const s = set.series
    const tag = `[${difficulty}/${type}] ${s.join(' ')}`
    if (new Set(s).size !== s.length) fail(`${tag}: repeated element`)
    if (s.some((c) => c === '0' || c === '1' || c === 'O')) fail(`${tag}: confusable character`)
    if (!s.some((c) => kind(c).includes('vowel'))) fail(`${tag}: no vowel`)
    if (set.questions.length !== 5) fail(`${tag}: ${set.questions.length} questions`)
    const stems = new Set<string>()
    set.questions.forEach((q, i) => {
      checked++
      seen.add(q.spec.k + ':' + q.stem.replace(/\d+(st|nd|rd|th)/g, 'N').replace(/ [^ ]( |\?)/g, ' X$1'))
      if (stems.has(q.stem)) fail(`${tag}: duplicate stem "${q.stem}"`)
      stems.add(q.stem)
      if (q.options.length !== 5 || new Set(q.options).size !== 5) fail(`${tag} Q${i + 1} "${q.stem}": options ${q.options.join('|')}`)
      const want = expected(s, q.stem)
      if (want === null) fail(`${tag} Q${i + 1} "${q.stem}": verifier could not read or resolve the question`)
      else if (q.options[q.answer] !== want) fail(`${tag} Q${i + 1} "${q.stem}": game says ${q.options[q.answer]}, recount says ${want}`)
      if (!set.explanations[i] || !set.hints[i]) fail(`${tag} Q${i + 1}: missing explanation/hint`)
    })
  }
}

console.log(`${checked} questions checked across ${RUNS} sets; ${seen.size} distinct question shapes seen.`)
if (failures) {
  console.error(`${failures} failure(s)`)
  process.exit(1)
}
console.log('OK')
