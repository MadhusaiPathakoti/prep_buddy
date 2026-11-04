// reasoning-misc: pair formation, word formation (provable by letter multiset), odd-one-out (provable by a property
// family) and word-based letter-position questions. Everything is computed from explicit data.
import type { Rng } from '../rng'
import type { Group, MockDifficulty, QuestionDraft } from '../types'
import { cap, ordinalNum, placeCorrect, splitCount, type WithProof } from './common'
import { WORDS } from './coding'

export type MiscProof =
  | { k: 'pairs'; word: string; count: number }
  | { k: 'formWhich'; source: string; options: string[]; answer: number }
  | { k: 'formCount'; source: string; words: string[]; count: number }
  | { k: 'odd'; family: 'num' | 'letters' | 'words'; items: string[]; odd: number; prop: string }
  | { k: 'alphaSame'; word: string; count: number }
  | { k: 'alphaNth'; word: string; from: 'L' | 'R'; n: number; letter: string }
  | { k: 'swapNth'; word: string; i: number; j: number; fromRight: number; letter: string }

const EXTRA_WORDS = [
  'CAPITAL', 'CHARITY', 'COMPANY', 'COUNTRY', 'CULTURE', 'DEFENCE', 'DESTINY', 'DIAMOND', 'DISTANT', 'ECONOMY', 'EVENING', 'EXAMPLE', 'FACTORY',
  'FASHION', 'FEATURE', 'FREEDOM', 'GALLERY', 'GENERAL', 'HARVEST', 'HEALTHY', 'HISTORY', 'HOLIDAY', 'HUSBAND', 'IMAGINE', 'JOURNEY', 'KINGDOM',
  'LIBRARY', 'MACHINE', 'MESSAGE', 'MILLION', 'MORNING', 'NATURAL', 'NETWORK', 'OBSERVE', 'OPINION', 'PASSAGE', 'PICTURE', 'PLASTIC', 'PROBLEM',
  'QUALITY', 'RAILWAY', 'READING', 'REQUEST', 'SCIENCE', 'SEASON', 'SERVICE', 'SILENCE', 'STUDENT', 'SUMMER', 'SUPPORT', 'SURFACE', 'TEACHER',
  'THEATRE', 'THOUGHT', 'TOGETHER', 'TRAFFIC', 'TRAVEL', 'VILLAGE', 'VISITOR', 'WEATHER', 'WINTER', 'WRITING', 'ANCIENT', 'BALANCE', 'BEAUTY',
  'BOUNDARY', 'BROTHER', 'CARPET', 'CENTRE', 'CHANNEL', 'CLIMATE', 'COMFORT', 'CURRENT', 'DEGREE', 'DESIGN', 'DOLLAR', 'EASTERN', 'EXPERT',
  'FAMILY', 'FINGER', 'FOREIGN', 'FUTURE', 'GARMENT', 'HEIGHT', 'INSIDE', 'JUSTICE', 'LEADER', 'LETTER', 'MEMBER', 'MINUTE', 'MOTHER', 'NUMBER',
  'OBJECT', 'PEOPLE', 'PERSON', 'POLICE', 'POWDER', 'REASON', 'RECORD', 'SCHEME', 'SECOND', 'SIMPLE', 'SPRING', 'STREET', 'STRONG', 'SUDDEN',
  'SYSTEM', 'TARGET', 'THIRTY', 'TROPHY', 'WONDER', 'ADVANCE', 'BATTERY', 'CABINET', 'CAPTAIN', 'CENTURY', 'CHICKEN', 'COTTAGE', 'DOLPHIN',
  'ENOUGH', 'FINANCE', 'GRAVITY', 'HEALTH', 'INCOME', 'KITCHEN', 'LECTURE', 'MONSTER', 'NEPHEW', 'ORCHARD', 'PACKAGE', 'QUARREL', 'ROCKET',
  'SHELTER', 'TONIGHT', 'UNKNOWN', 'VINEGAR', 'WARRIOR', 'YOGHURT',
]
const POOL_WORDS = [...new Set([...WORDS, ...EXTRA_WORDS])]
const COUNT_LABELS = ['None', 'One', 'Two', 'Three', 'More than three']
const countAns = (c: number) => ({ options: COUNT_LABELS.slice(), answer: Math.min(c, 4) })

// ------------------------------------------------------------------ pair formation
export function pairCount(w: string): number {
  let c = 0
  for (let i = 0; i < w.length; i++) {
    for (let j = i + 1; j < w.length; j++) {
      const d = Math.abs(w.charCodeAt(i) - w.charCodeAt(j))
      if (d !== 0 && d === j - i) c++
    }
  }
  return c
}

// ------------------------------------------------------------------ word formation
const SOURCES = [
  'DEPARTMENT', 'STATIONERY', 'EDUCATION', 'TRIANGLE', 'COMPUTER', 'NATIONAL', 'CHAMPION', 'ADVENTURE', 'MOUNTAIN', 'UNIVERSE', 'DAUGHTER',
  'CREATION', 'PAINTER', 'HOSPITAL', 'PRACTICE', 'SECURITY', 'TEACHERS', 'PLATFORM', 'GOVERNMENT', 'BIRTHDAY', 'CHOCOLATE', 'ELEPHANT',
  'SUBMARINE', 'FURNITURE', 'PARTICIPATE', 'CALENDAR', 'MARKETING', 'DISCOVERY', 'PRESIDENT', 'STRAIGHT', 'ADVERTISE', 'BEAUTIFUL', 'CHARACTER',
  'CONTINENT', 'DANGEROUS', 'ENTERTAIN', 'FAVOURITE', 'GENERATION', 'HAPPINESS', 'INDUSTRY', 'JOURNALIST', 'KNOWLEDGE', 'LANGUAGE', 'MAGAZINE',
  'NEWSPAPER', 'OPERATION', 'PASSENGER', 'RESTAURANT', 'SENTENCE', 'TELEPHONE', 'UNIVERSITY', 'VEGETABLE', 'WORKSHOP', 'ADMISSION', 'BUILDING',
  'COMMUNITY', 'DIRECTION', 'ELECTRONIC', 'FOOTBALL', 'GRADUATE', 'HOSPITALS', 'INTERVIEW', 'LIGHTNING', 'MOUNTAINS', 'ORCHESTRA',
]
const CAND = [
  'PAINT', 'TRADE', 'NOTE', 'RAIN', 'NAME', 'DOOR', 'TENT', 'STONE', 'TRAIN', 'STAIN', 'SATIN', 'TONE', 'LINE', 'LION', 'PLANT', 'PLATE',
  'SLATE', 'CHAIR', 'HEART', 'EARTH', 'HATE', 'RATE', 'TIME', 'MOON', 'NEAT', 'MEAT', 'TEAM', 'MATE', 'SEAT', 'EAST', 'NEST', 'PEARL',
  'PAIR', 'PEAR', 'REAL', 'LAMP', 'PALM', 'LEAP', 'CAKE', 'MAKE', 'LAKE', 'RISE', 'SIDE', 'TIDE', 'DIET', 'EDIT', 'RIDE', 'DIRT', 'TRIP',
  'STRIP', 'SPORT', 'PORT', 'SORT', 'ROOT', 'TOOL', 'POOL', 'LOOP', 'SOUP', 'CORN', 'COIN', 'ICON', 'IRON', 'NOON', 'SOON', 'RACE', 'CARE',
  'ACRE', 'SCARE', 'CRATE', 'TRACE', 'CART', 'STAR', 'LATE', 'TALE', 'TILE', 'MOST', 'MIST', 'MINT', 'DUST', 'RUSH', 'LUNCH', 'BRICK',
  'HORSE', 'SHORE', 'WORLD', 'GRAPE', 'MANGO', 'WATER', 'LEMON', 'PLANE', 'CABLE', 'TABLE', 'BAKE', 'BEAR', 'BEAT', 'BEST', 'BIRD', 'BOAT',
]

const letterCounts = (w: string): Map<string, number> => {
  const m = new Map<string, number>()
  for (const c of w) m.set(c, (m.get(c) ?? 0) + 1)
  return m
}
export function canForm(source: string, word: string): boolean {
  const src = letterCounts(source)
  for (const [c, n] of letterCounts(word)) if ((src.get(c) ?? 0) < n) return false
  return true
}
function deficit(source: string, word: string): number {
  const src = letterCounts(source)
  let d = 0
  for (const [c, n] of letterCounts(word)) d += Math.max(0, n - (src.get(c) ?? 0))
  return d
}
function whyNot(source: string, word: string): string {
  const src = letterCounts(source)
  for (const [c, n] of letterCounts(word)) {
    const have = src.get(c) ?? 0
    if (have < n) return have === 0 ? `needs ${c}, which is not in ${source}` : `needs ${n} ${c}'s but ${source} has only ${have}`
  }
  return 'can be formed'
}

// ------------------------------------------------------------------ odd one out
type NumProp = { id: string; label: string; f: (n: number) => boolean }
const isPrime = (n: number) => {
  if (n < 2) return false
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false
  return true
}
const isSq = (n: number) => Number.isInteger(Math.sqrt(n))
const isCube = (n: number) => Math.round(Math.cbrt(n)) ** 3 === n
const dsum = (n: number) => String(n).split('').reduce((s, c) => s + Number(c), 0)
const NUM_PROPS: NumProp[] = [
  { id: 'prime', label: 'prime numbers', f: isPrime },
  { id: 'square', label: 'perfect squares', f: isSq },
  { id: 'cube', label: 'perfect cubes', f: isCube },
  { id: 'm3', label: 'multiples of 3', f: (n) => n % 3 === 0 },
  { id: 'm4', label: 'multiples of 4', f: (n) => n % 4 === 0 },
  { id: 'm6', label: 'multiples of 6', f: (n) => n % 6 === 0 },
  { id: 'm7', label: 'multiples of 7', f: (n) => n % 7 === 0 },
  { id: 'm9', label: 'multiples of 9', f: (n) => n % 9 === 0 },
  { id: 'm11', label: 'multiples of 11', f: (n) => n % 11 === 0 },
  { id: 'm13', label: 'multiples of 13', f: (n) => n % 13 === 0 },
  { id: 'pal', label: 'palindromes', f: (n) => String(n) === String(n).split('').reverse().join('') },
]
/** A superset of the generator's properties used for the "no other 4-1 split" ambiguity check. */
const NUM_FAMILY: ((n: number) => boolean)[] = [
  ...NUM_PROPS.map((p) => p.f),
  ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((d) => (n: number) => n % d === 0),
  (n) => dsum(n) % 2 === 0,
  (n) => dsum(n) % 3 === 0,
  (n) => dsum(n) % 9 === 0,
  (n) => dsum(n) > 10,
  (n) => n < 100,
  (n) => n > 50,
  (n) => n > 100,
  (n) => n > 150,
  (n) => n > 200,
  (n) => String(n).split('').every((c) => Number(c) % 2 === 1),
  (n) => String(n).split('').every((c) => Number(c) % 2 === 0),
  (n) => n % 3 === 1,
  (n) => n % 3 === 2,
  (n) => n % 4 === 1,
  (n) => n % 4 === 3,
  (n) => n % 5 === 1,
  (n) => n % 7 === 1,
  (n) => isPrime(dsum(n)),
]

function splitOddIndex(items: boolean[]): number | null {
  const t = items.filter(Boolean).length
  if (t === 1) return items.indexOf(true)
  if (t === 4) return items.indexOf(false)
  return null
}

function numberOdd(rng: Rng, hard: boolean): { items: string[]; odd: number; prop: string; expl: string } | null {
  const P = rng.pick(NUM_PROPS)
  const lo = hard ? 20 : 12
  const hi = hard ? 399 : 199
  const withP: number[] = []
  const without: number[] = []
  for (let n = lo; n <= hi; n++) (P.f(n) ? withP : without).push(n)
  if (withP.length < 4) return null
  const four = rng.sample(withP, 4)
  const one = rng.pick(without)
  const odd = rng.int(0, 4)
  const nums = four.slice()
  nums.splice(odd, 0, one)
  for (const Q of NUM_FAMILY) {
    const s = splitOddIndex(nums.map(Q))
    if (s !== null && s !== odd) return null
  }
  return { items: nums.map(String), odd, prop: P.id, expl: `${four.join(', ')} are all ${P.label}, but ${one} is not. So ${one} is the odd one out.` }
}

const pos = (c: string) => c.charCodeAt(0) - 64
const LETTER_FAMILY: ((p: string) => boolean)[] = [
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((g) => (p: string) => Math.abs(pos(p[0]) - pos(p[1])) === g),
  (p) => 'AEIOU'.includes(p[0]) && 'AEIOU'.includes(p[1]),
  (p) => !'AEIOU'.includes(p[0]) && !'AEIOU'.includes(p[1]),
  (p) => 'AEIOU'.includes(p[0]) || 'AEIOU'.includes(p[1]),
  (p) => 'AEIOU'.includes(p[0]),
  (p) => 'AEIOU'.includes(p[1]),
  (p) => (pos(p[0]) + pos(p[1])) % 2 === 0,
  (p) => (pos(p[0]) + pos(p[1])) % 2 === 1,
  (p) => pos(p[0]) < pos(p[1]),
  (p) => pos(p[0]) + pos(p[1]) > 26,
  (p) => pos(p[0]) + pos(p[1]) > 20,
  (p) => pos(p[0]) <= 13 && pos(p[1]) <= 13,
  (p) => pos(p[0]) > 13 && pos(p[1]) > 13,
  (p) => pos(p[0]) % 2 === 0,
  (p) => pos(p[1]) % 2 === 0,
  (p) => pos(p[0]) % 2 === 1,
  (p) => pos(p[1]) % 2 === 1,
  (p) => pos(p[0]) % 3 === 0,
  (p) => pos(p[1]) % 3 === 0,
]

function letterOdd(rng: Rng, hard: boolean): { items: string[]; odd: number; prop: string; expl: string } | null {
  const g = rng.int(2, hard ? 6 : 4)
  const mk = (gap: number): string => {
    const a = rng.int(1, 26 - gap)
    return String.fromCharCode(64 + a) + String.fromCharCode(64 + a + gap)
  }
  const four = new Set<string>()
  let guard = 0
  while (four.size < 4 && guard++ < 50) four.add(mk(g))
  if (four.size < 4) return null
  let g2 = rng.int(1, 7)
  while (g2 === g) g2 = rng.int(1, 7)
  const one = mk(g2)
  const odd = rng.int(0, 4)
  const items = [...four]
  items.splice(odd, 0, one)
  if (new Set(items).size !== 5) return null
  for (const Q of LETTER_FAMILY) {
    const s = splitOddIndex(items.map(Q))
    if (s !== null && s !== odd) return null
  }
  return { items, odd, prop: `gap${g}`, expl: `In ${[...four].join(', ')} the two letters are ${g} places apart in the alphabet, but in ${one} they are ${g2} places apart. So ${one} is the odd one out.` }
}

export const CATS: Record<string, string[]> = {
  fruits: ['apple', 'mango', 'banana', 'grapes', 'papaya', 'guava', 'cherry', 'pineapple'],
  vegetables: ['potato', 'carrot', 'spinach', 'cabbage', 'cauliflower', 'brinjal', 'radish', 'onion'],
  animals: ['tiger', 'lion', 'elephant', 'zebra', 'giraffe', 'leopard', 'cheetah', 'rhino'],
  birds: ['sparrow', 'eagle', 'parrot', 'pigeon', 'peacock', 'crow', 'owl', 'kingfisher'],
  metals: ['iron', 'copper', 'gold', 'silver', 'zinc', 'nickel', 'platinum', 'aluminium'],
  planets: ['mars', 'venus', 'earth', 'jupiter', 'saturn', 'neptune', 'uranus'],
  rivers: ['ganga', 'yamuna', 'godavari', 'krishna', 'kaveri', 'narmada', 'indus', 'mahanadi'],
  languages: ['hindi', 'tamil', 'telugu', 'bengali', 'marathi', 'gujarati', 'punjabi', 'kannada'],
  furniture: ['table', 'chair', 'sofa', 'bed', 'stool', 'desk', 'cupboard', 'bench'],
  vehicles: ['bus', 'train', 'truck', 'scooter', 'tractor', 'bicycle', 'tram', 'ship'],
  instruments: ['guitar', 'piano', 'flute', 'violin', 'drum', 'sitar', 'harmonium', 'tabla'],
}
const CAT_LABEL: Record<string, string> = {
  fruits: 'fruits', vegetables: 'vegetables', animals: 'animals', birds: 'birds', metals: 'metals', planets: 'planets', rivers: 'rivers',
  languages: 'languages', furniture: 'pieces of furniture', vehicles: 'vehicles', instruments: 'musical instruments',
}
// category pairs that are semantically close enough to be debatable are never combined
const CLOSE: [string, string][] = [['fruits', 'vegetables'], ['animals', 'birds'], ['vehicles', 'furniture']]

function wordOdd(rng: Rng): { items: string[]; odd: number; prop: string; expl: string } | null {
  const keys = Object.keys(CATS)
  const a = rng.pick(keys)
  const b = rng.pick(keys.filter((k) => k !== a && !CLOSE.some(([x, y]) => (x === a && y === k) || (y === a && x === k))))
  const four = rng.sample(CATS[a], 4)
  const one = rng.pick(CATS[b])
  const odd = rng.int(0, 4)
  const items = four.slice()
  items.splice(odd, 0, one)
  return { items: items.map(cap), odd, prop: `${a}|${b}`, expl: `${four.map(cap).join(', ')} are all ${CAT_LABEL[a]}, whereas ${cap(one)} is one of the ${CAT_LABEL[b]}. So ${cap(one)} is the odd one out.` }
}

// ------------------------------------------------------------------ builders
function build(rng: Rng, difficulty: MockDifficulty): { q: QuestionDraft; proof: MiscProof } {
  const hard = difficulty === 'hard'
  for (let attempt = 0; attempt < 5000; attempt++) {
    const kind = rng.pick(['pairs', 'pairs', 'formWhich', 'formCount', 'odd', 'odd', 'alpha', 'alpha'] as const)
    if (kind === 'pairs') {
      const pool = POOL_WORDS.filter((w) => w.length >= (hard ? 6 : 5))
      const w = rng.pick(pool)
      const c = pairCount(w)
      if (c < 1 || c > 4) continue
      const o = countAns(c)
      const stem = `How many pairs of letters are there in the word '${w}' each of which has as many letters between them in the word as there are between them in the English alphabet (in forward or backward direction)?`
      const pairs: string[] = []
      for (let i = 0; i < w.length; i++) for (let j = i + 1; j < w.length; j++) if (Math.abs(w.charCodeAt(i) - w.charCodeAt(j)) === j - i) pairs.push(`${w[i]}${w[j]}`)
      const expl = `Word: ${w.split('').join(' ')}. Pairs with equal gap in the word and in the alphabet: ${pairs.join(', ')} (${c}).`
      return { q: { topic: 'reasoning-misc', stem, options: o.options, answer: o.answer, explanation: expl }, proof: { k: 'pairs', word: w, count: c } }
    }
    if (kind === 'formWhich') {
      const source = rng.pick(SOURCES)
      const formable = CAND.filter((w) => canForm(source, w) && w.length >= 4)
      const not = CAND.filter((w) => !canForm(source, w))
      if (!formable.length || not.length < 4) continue
      const correct = rng.pick(formable)
      const near = not.filter((w) => deficit(source, w) <= 1)
      const wrongPool = near.length >= 4 ? near : not
      const wrong = rng.sample(wrongPool, 4)
      const p = placeCorrect(rng, correct, wrong)
      const stem = `Which of the following words can be formed using the letters of the word '${source}' (each letter can be used only as many times as it appears in '${source}')?`
      const expl = `'${correct}' can be formed from the letters of ${source}. ${wrong.map((w) => `'${w}' ${whyNot(source, w)}`).join('; ')}.`
      return { q: { topic: 'reasoning-misc', stem, options: p.items, answer: p.answer, explanation: expl }, proof: { k: 'formWhich', source, options: p.items, answer: p.answer } }
    }
    if (kind === 'formCount') {
      const source = rng.pick(SOURCES)
      const formable = CAND.filter((w) => canForm(source, w))
      const not = CAND.filter((w) => !canForm(source, w) && deficit(source, w) <= 1)
      const nF = rng.int(0, 4)
      if (formable.length < nF || not.length < 5 - nF) continue
      const words = rng.shuffle([...rng.sample(formable, nF), ...rng.sample(not, 5 - nF)])
      const c = nF
      if (c === 0 && !rng.chance(0.2)) continue
      const o = countAns(c)
      const stem = `How many of the following words can be formed using the letters of the word '${source}' (each letter can be used only as many times as it appears in '${source}')?\n${words.join(', ')}`
      const expl = `${words.map((w) => (canForm(source, w) ? `'${w}' can be formed` : `'${w}' ${whyNot(source, w)}`)).join('; ')}. Count = ${c}.`
      return { q: { topic: 'reasoning-misc', stem, options: o.options, answer: o.answer, explanation: expl }, proof: { k: 'formCount', source, words, count: c } }
    }
    if (kind === 'odd') {
      const fam = rng.pick(['num', 'num', 'letters', 'words'] as const)
      const r = fam === 'num' ? numberOdd(rng, hard) : fam === 'letters' ? letterOdd(rng, hard) : wordOdd(rng)
      if (!r) continue
      const stem = `Four of the following five are alike in a certain way and hence form a group. Which one does not belong to that group?`
      return { q: { topic: 'reasoning-misc', stem, options: r.items, answer: r.odd, explanation: r.expl }, proof: { k: 'odd', family: fam, items: r.items, odd: r.odd, prop: r.prop } }
    }
    // alpha
    const w = rng.pick(POOL_WORDS.filter((x) => x.length >= 5))
    const sub = rng.pick(['same', 'nth', 'swap'] as const)
    if (sub === 'same') {
      const sorted = w.split('').sort().join('')
      let c = 0
      for (let i = 0; i < w.length; i++) if (w[i] === sorted[i]) c++
      if (c < 1 || c > 4) continue
      const o = countAns(c)
      const stem = `If the letters of the word '${w}' are arranged in alphabetical order from left to right, how many letters will remain at the same position (counting from the left end)?`
      return { q: { topic: 'reasoning-misc', stem, options: o.options, answer: o.answer, explanation: `Original: ${w.split('').join(' ')}; alphabetical: ${sorted.split('').join(' ')}. Letters at the same positions: ${c}.` }, proof: { k: 'alphaSame', word: w, count: c } }
    }
    if (sub === 'nth') {
      const sorted = w.split('').sort()
      const from = rng.pick(['L', 'R'] as const)
      const n = rng.int(2, Math.min(5, w.length - 1))
      const letter = from === 'L' ? sorted[n - 1] : sorted[sorted.length - n]
      const others = [...new Set(w.split(''))].filter((c) => c !== letter)
      if (others.length < 4) continue
      const p = placeCorrect(rng, letter, rng.sample(others, 4))
      const stem = `If the letters of the word '${w}' are arranged in alphabetical order (A to Z) from left to right, which letter will be ${ordinalNum(n)} from the ${from === 'L' ? 'left' : 'right'} end?`
      return { q: { topic: 'reasoning-misc', stem, options: p.items, answer: p.answer, explanation: `Alphabetical order: ${sorted.join(' ')}. The ${ordinalNum(n)} from the ${from === 'L' ? 'left' : 'right'} is ${letter}.` }, proof: { k: 'alphaNth', word: w, from, n, letter } }
    }
    const i = rng.int(1, w.length - 1)
    let j = rng.int(i + 1, w.length)
    if (j === i) j = w.length
    const arr = w.split('')
    ;[arr[i - 1], arr[j - 1]] = [arr[j - 1], arr[i - 1]]
    const fr = rng.int(1, w.length)
    const letter = arr[arr.length - fr]
    const others = [...new Set(w.split(''))].filter((c) => c !== letter)
    if (others.length < 4) continue
    const p = placeCorrect(rng, letter, rng.sample(others, 4))
    const stem = `If the ${ordinalNum(i)} and the ${ordinalNum(j)} letters of the word '${w}' are interchanged, which letter will be ${ordinalNum(fr)} from the right end of the new arrangement?`
    return { q: { topic: 'reasoning-misc', stem, options: p.items, answer: p.answer, explanation: `New arrangement: ${arr.join(' ')}. The ${ordinalNum(fr)} from the right is ${letter}.` }, proof: { k: 'swapNth', word: w, i, j, fromRight: fr, letter } }
  }
  throw new Error('reasoning-misc: generation failed')
}

export function generateMiscWithProof(rng: Rng, difficulty: MockDifficulty, count: number): WithProof<MiscProof> {
  const groups: Group[] = []
  const proofs: MiscProof[] = []
  for (const _k of splitCount(count, 1)) {
    void _k
    const { q, proof } = build(rng, difficulty)
    groups.push({ questions: [q] })
    proofs.push(proof)
  }
  return { groups, proofs }
}
