// Coding-decoding: every code is produced by an explicit rule function; the example must identify the rule uniquely
// within a large rule family (see `family`).
import type { Rng } from '../rng'
import type { Group, MockDifficulty, QuestionDraft } from '../types'
import { placeCorrect, splitCount, type WithProof } from './common'

export type RuleSpec =
  | { k: 'shift'; s: number }
  | { k: 'rev' }
  | { k: 'mirror' }
  | { k: 'alt'; a: number; b: number }
  | { k: 'prog'; s: number }
  | { k: 'shiftRev'; s: number }
  | { k: 'mirrorRev' }
  | { k: 'swapEnds' }
  | { k: 'posNum' }
  | { k: 'posSum' }

export interface CodingProof {
  rule: RuleSpec
  mode: 'enc' | 'dec'
  example: [string, string]
  /** the word to encode (enc) or the code to decode (dec). */
  query: string
  answerText: string
  answer: number
}

const A = 65
const sh = (ch: string, s: number): string => String.fromCharCode(A + ((((ch.charCodeAt(0) - A + s) % 26) + 26) % 26))
const pos = (ch: string): number => ch.charCodeAt(0) - A + 1

export function applyRule(r: RuleSpec, w: string): string {
  const L = w.split('')
  switch (r.k) {
    case 'shift':
      return L.map((c) => sh(c, r.s)).join('')
    case 'rev':
      return L.slice().reverse().join('')
    case 'mirror':
      return L.map((c) => String.fromCharCode(A + 25 - (c.charCodeAt(0) - A))).join('')
    case 'alt':
      return L.map((c, i) => sh(c, i % 2 === 0 ? r.a : r.b)).join('')
    case 'prog':
      return L.map((c, i) => sh(c, r.s * (i + 1))).join('')
    case 'shiftRev':
      return L.map((c) => sh(c, r.s)).reverse().join('')
    case 'mirrorRev':
      return L.map((c) => String.fromCharCode(A + 25 - (c.charCodeAt(0) - A))).reverse().join('')
    case 'swapEnds':
      return L.length < 2 ? w : [L[L.length - 1], ...L.slice(1, -1), L[0]].join('')
    case 'posNum':
      return L.map((c) => String(pos(c))).join('')
    case 'posSum':
      return String(L.reduce((s, c) => s + pos(c), 0))
  }
}

/** Inverse for letter-to-letter rules; null when not invertible. */
export function invertRule(r: RuleSpec, code: string): string | null {
  const L = code.split('')
  switch (r.k) {
    case 'shift':
      return L.map((c) => sh(c, -r.s)).join('')
    case 'rev':
      return L.slice().reverse().join('')
    case 'mirror':
      return applyRule(r, code)
    case 'alt':
      return L.map((c, i) => sh(c, -(i % 2 === 0 ? r.a : r.b))).join('')
    case 'prog':
      return L.map((c, i) => sh(c, -r.s * (i + 1))).join('')
    case 'shiftRev':
      return L.slice().reverse().map((c) => sh(c, -r.s)).join('')
    case 'mirrorRev':
      return applyRule({ k: 'mirror' }, L.slice().reverse().join(''))
    case 'swapEnds':
      return applyRule(r, code)
    default:
      return null
  }
}

export function family(): RuleSpec[] {
  const out: RuleSpec[] = [{ k: 'rev' }, { k: 'mirror' }, { k: 'mirrorRev' }, { k: 'swapEnds' }, { k: 'posNum' }, { k: 'posSum' }]
  for (let s = -25; s <= 25; s++) if (s !== 0) out.push({ k: 'shift', s }, { k: 'shiftRev', s })
  for (let a = -6; a <= 6; a++) for (let b = -6; b <= 6; b++) if (a !== b) out.push({ k: 'alt', a, b })
  for (let s = -3; s <= 3; s++) if (s !== 0) out.push({ k: 'prog', s })
  return out
}
const FAMILY = family()

/** A deliberately wider family of "plausible simple rules" used only to prove the example identifies the rule. */
function extendedFamily(): ((w: string) => string)[] {
  const out: ((w: string) => string)[] = FAMILY.map((r) => (w: string) => applyRule(r, w))
  const rev = (w: string) => w.split('').reverse().join('')
  const vow = (c: string) => 'AEIOU'.includes(c)
  const mir = (c: string) => String.fromCharCode(155 - c.charCodeAt(0))
  out.push((w) => rev(w).split('').map((c) => String(pos(c))).join(''))
  out.push((w) => String(w.split('').reduce((t, c) => t + pos(c), 0) * 2))
  for (let s = -25; s <= 25; s++) {
    if (s === 0) continue
    out.push((w) => (w.length < 2 ? w : [...(w[w.length - 1] + w.slice(1, -1) + w[0])].map((c) => sh(c, s)).join('')))
  }
  for (let a = -6; a <= 6; a++) for (let b = -6; b <= 6; b++) if (a !== b) out.push((w) => rev(w.split('').map((c, i) => sh(c, i % 2 === 0 ? a : b)).join('')))
  for (let a = 7; a <= 12; a++) for (let b = -12; b <= 12; b++) if (a !== b) out.push((w) => w.split('').map((c, i) => sh(c, i % 2 === 0 ? a : b)).join(''), (w) => w.split('').map((c, i) => sh(c, i % 2 === 0 ? b : a)).join(''))
  for (let a = -12; a <= -7; a++) for (let b = -12; b <= 12; b++) if (a !== b) out.push((w) => w.split('').map((c, i) => sh(c, i % 2 === 0 ? a : b)).join(''), (w) => w.split('').map((c, i) => sh(c, i % 2 === 0 ? b : a)).join(''))
  for (let s = -5; s <= 5; s++) {
    if (s === 0) continue
    out.push((w) => rev(w.split('').map((c, i) => sh(c, s * (i + 1))).join('')))
    out.push((w) => w.split('').map((c, i) => sh(c, s * (w.length - i))).join(''))
    out.push((w) => w.split('').map((c) => (vow(c) ? sh(c, s) : c)).join(''))
    out.push((w) => w.split('').map((c) => (vow(c) ? c : sh(c, s))).join(''))
    out.push((w) => w.split('').map((c) => sh(c, s * w.length)).join(''))
  }
  for (let s = 1; s <= 3; s++) {
    out.push((w) => w.split('').map((c, i) => sh(c, [s, -s, 0][i % 3])).join(''))
    out.push((w) => w.split('').map((c) => sh(mir(c), s)).join(''))
    out.push((w) => w.split('').map((c) => sh(mir(c), -s)).join(''))
  }
  return out
}
const EXT = extendedFamily()

export const WORDS = [
  'DOCTOR', 'PATIENT', 'MARKET', 'BRIDGE', 'CASTLE', 'FOREST', 'GARDEN', 'HAMMER', 'ISLAND', 'JUNGLE', 'KITTEN', 'LADDER',
  'MIRROR', 'NATION', 'ORANGE', 'PENCIL', 'QUARTER', 'RIVER', 'SILVER', 'TEMPLE', 'UNIFORM', 'VALLEY', 'WINDOW', 'YELLOW',
  'ZEBRA', 'BASKET', 'CANDLE', 'DINNER', 'ENGINE', 'FABRIC', 'GUITAR', 'HONEST', 'INSECT', 'JACKET', 'KERNEL', 'LEMON',
  'MONKEY', 'NOODLE', 'OFFICE', 'PLANET', 'RABBIT', 'SCHOOL', 'TICKET', 'UNIQUE', 'VOLUME', 'WALLET', 'ARTIST', 'BUTTER',
  'CHAIR', 'DANCE', 'EARTH', 'FLAME', 'GRAPE', 'HOUSE', 'JUICE', 'KNIFE', 'LIGHT', 'MONEY', 'NIGHT', 'OCEAN', 'PAPER',
  'QUEEN', 'ROUND', 'STONE', 'TABLE', 'UNCLE', 'VOICE', 'WATER', 'YOUTH', 'BREAD', 'CLOUD', 'DREAM', 'FIELD', 'GREEN',
  'HEART', 'IVORY', 'MANGO', 'NOBLE', 'PLANT', 'RADIO', 'SMILE', 'TRAIN', 'WORLD', 'BANK', 'CAKE', 'DOOR', 'FARM', 'GOLD',
  'HAND', 'KING', 'LAMP', 'MILK', 'NAIL', 'PARK', 'ROSE', 'SHIP', 'TREE', 'WIND', 'ZONE', 'BELT', 'COIN', 'DUCK', 'FISH',
]
const SHORT_WORDS = WORDS.filter((w) => w.length <= 5)

function ruleText(r: RuleSpec, w: string): string {
  const show = (f: (c: string) => string) => w.split('').slice(0, 3).map((c) => `${c}->${f(c)}`).join(', ')
  switch (r.k) {
    case 'shift':
      return `each letter is moved ${Math.abs(r.s)} place${Math.abs(r.s) === 1 ? '' : 's'} ${r.s > 0 ? 'forward' : 'backward'} in the alphabet (${show((c) => sh(c, r.s))}, ...)`
    case 'rev':
      return 'the letters of the word are written in reverse order'
    case 'mirror':
      return 'each letter is replaced by its opposite letter in the alphabet (A<->Z, B<->Y, ...)'
    case 'alt':
      return `letters in odd positions are moved ${Math.abs(r.a)} place${Math.abs(r.a) === 1 ? '' : 's'} ${r.a > 0 ? 'forward' : 'backward'} and letters in even positions ${Math.abs(r.b)} place${Math.abs(r.b) === 1 ? '' : 's'} ${r.b > 0 ? 'forward' : 'backward'}`
    case 'prog':
      return `the 1st, 2nd, 3rd ... letters are moved ${Math.abs(r.s)}, ${Math.abs(r.s) * 2}, ${Math.abs(r.s) * 3} ... places ${r.s > 0 ? 'forward' : 'backward'}`
    case 'shiftRev':
      return `each letter is moved ${Math.abs(r.s)} place${Math.abs(r.s) === 1 ? '' : 's'} ${r.s > 0 ? 'forward' : 'backward'} and the resulting word is written in reverse order`
    case 'mirrorRev':
      return 'each letter is replaced by its opposite letter in the alphabet and the resulting word is written in reverse order'
    case 'swapEnds':
      return 'the first and the last letters of the word are interchanged'
    case 'posNum':
      return 'each letter is replaced by its position number in the alphabet (A=1, B=2, ...)'
    case 'posSum':
      return 'the code is the sum of the alphabet position numbers of the letters (A=1, B=2, ...)'
  }
}

function pickRule(rng: Rng, hard: boolean): RuleSpec {
  if (!hard) {
    const t = rng.pick(['shift', 'shift', 'rev', 'mirror', 'shiftRev', 'posNum', 'swapEnds'])
    switch (t) {
      case 'shift':
        return { k: 'shift', s: rng.pick([1, 2, 3, 4, 5, -1, -2, -3]) }
      case 'shiftRev':
        return { k: 'shiftRev', s: rng.pick([1, 2, 3, -1, -2]) }
      case 'rev':
        return { k: 'rev' }
      case 'mirror':
        return { k: 'mirror' }
      case 'swapEnds':
        return { k: 'swapEnds' }
      default:
        return { k: 'posNum' }
    }
  }
  const t = rng.pick(['alt', 'alt', 'prog', 'shiftRev', 'mirrorRev', 'posSum', 'alt'])
  switch (t) {
    case 'alt': {
      const a = rng.pick([1, 2, 3, -1, -2])
      let b = rng.pick([1, 2, 3, -1, -2, -3])
      if (b === a) b = -a
      return { k: 'alt', a, b }
    }
    case 'prog':
      return { k: 'prog', s: rng.pick([1, -1, 2]) }
    case 'shiftRev':
      return { k: 'shiftRev', s: rng.pick([2, 3, 4, -2, -3, 5]) }
    case 'mirrorRev':
      return { k: 'mirrorRev' }
    default:
      return { k: 'posSum' }
  }
}

function distractorsFor(rng: Rng, rule: RuleSpec, word: string, correct: string, mode: 'enc' | 'dec'): string[] {
  const out = new Set<string>()
  const add = (s: string | null) => {
    if (s && s !== correct) out.add(s)
  }
  if (mode === 'dec') {
    // query code -> word; wrong decodes come from decoding with neighbouring rules
    return []
  }
  const alt: RuleSpec[] = []
  switch (rule.k) {
    case 'shift':
      alt.push({ k: 'shift', s: rule.s + 1 }, { k: 'shift', s: rule.s - 1 }, { k: 'shift', s: -rule.s }, { k: 'rev' }, { k: 'shiftRev', s: rule.s })
      break
    case 'shiftRev':
      alt.push({ k: 'shift', s: rule.s }, { k: 'rev' }, { k: 'shiftRev', s: rule.s + 1 }, { k: 'shiftRev', s: -rule.s }, { k: 'shiftRev', s: rule.s - 1 })
      break
    case 'rev':
      alt.push({ k: 'swapEnds' }, { k: 'mirror' }, { k: 'shift', s: 1 }, { k: 'shiftRev', s: 1 })
      break
    case 'mirror':
      alt.push({ k: 'mirrorRev' }, { k: 'rev' }, { k: 'shift', s: 1 }, { k: 'shift', s: -1 })
      break
    case 'mirrorRev':
      alt.push({ k: 'mirror' }, { k: 'rev' }, { k: 'shiftRev', s: 1 }, { k: 'shiftRev', s: -1 })
      break
    case 'alt':
      alt.push({ k: 'alt', a: rule.b, b: rule.a }, { k: 'shift', s: rule.a }, { k: 'shift', s: rule.b }, { k: 'alt', a: rule.a, b: rule.b + 1 }, { k: 'alt', a: rule.a + 1, b: rule.b })
      break
    case 'prog':
      alt.push({ k: 'prog', s: -rule.s }, { k: 'shift', s: rule.s }, { k: 'prog', s: rule.s + 1 }, { k: 'alt', a: rule.s, b: rule.s * 2 })
      break
    case 'swapEnds':
      alt.push({ k: 'rev' }, { k: 'shift', s: 1 })
      break
    case 'posNum':
    case 'posSum':
      break
  }
  for (const r of alt) add(applyRule(r, word))
  if (rule.k === 'posNum' || rule.k === 'posSum') {
    const n = Number(correct)
    if (rule.k === 'posSum') for (const d of [-3, -2, -1, 1, 2, 3, 5, -5, 10]) add(String(n + d))
    else {
      // plausible digit slips
      const digits = correct.split('')
      for (let t = 0; t < 12; t++) {
        const i = rng.int(0, digits.length - 1)
        const copy = digits.slice()
        copy[i] = String((Number(copy[i]) + rng.int(1, 3)) % 10)
        add(copy.join(''))
      }
      add(correct.split('').reverse().join(''))
    }
  } else {
    // single-letter slips
    const L = correct.split('')
    for (let t = 0; t < 10; t++) {
      const i = rng.int(0, L.length - 1)
      const copy = L.slice()
      copy[i] = sh(copy[i], rng.pick([1, -1, 2, -2]))
      add(copy.join(''))
    }
  }
  return [...out]
}

function buildOne(rng: Rng, difficulty: MockDifficulty): { q: QuestionDraft; proof: CodingProof } {
  const hard = difficulty === 'hard'
  for (let attempt = 0; attempt < 5000; attempt++) {
    const rule = pickRule(rng, hard)
    const numeric = rule.k === 'posNum' || rule.k === 'posSum'
    const mode: 'enc' | 'dec' = !numeric && rng.chance(0.3) ? 'dec' : 'enc'
    const pool = rule.k === 'posSum' || rule.k === 'posNum' ? SHORT_WORDS : WORDS
    const [w1, w2] = rng.sample(pool, 2)
    if (w1[0] === w2[0] && w1.length === w2.length) continue
    const c1 = applyRule(rule, w1)
    const c2 = applyRule(rule, w2)
    if (c1 === w1) continue
    const query = mode === 'enc' ? w2 : c2
    const answerText = mode === 'enc' ? c2 : w2
    let options: string[]
    let answer: number
    if (mode === 'dec') {
      // wrong decodes: decode the query with other rules of the family (kept only when they fit nothing but are plausible)
      const wrongSet = new Set<string>()
      const alts: RuleSpec[] = rule.k === 'shift' ? [{ k: 'shift', s: rule.s + 1 }, { k: 'shift', s: rule.s - 1 }, { k: 'shift', s: -rule.s }, { k: 'shiftRev', s: rule.s }] : rule.k === 'rev' ? [{ k: 'mirror' }, { k: 'shift', s: 1 }, { k: 'swapEnds' }] : rule.k === 'mirror' ? [{ k: 'mirrorRev' }, { k: 'rev' }, { k: 'shift', s: 1 }] : rule.k === 'shiftRev' ? [{ k: 'shift', s: rule.s }, { k: 'rev' }, { k: 'shiftRev', s: rule.s + 1 }, { k: 'shiftRev', s: -rule.s }] : rule.k === 'alt' ? [{ k: 'alt', a: rule.b, b: rule.a }, { k: 'shift', s: rule.a }, { k: 'shift', s: rule.b }, { k: 'alt', a: rule.a + 1, b: rule.b }] : rule.k === 'prog' ? [{ k: 'prog', s: -rule.s }, { k: 'shift', s: rule.s }, { k: 'prog', s: rule.s + 1 }] : rule.k === 'mirrorRev' ? [{ k: 'mirror' }, { k: 'rev' }, { k: 'shiftRev', s: 1 }] : [{ k: 'rev' }, { k: 'shift', s: 1 }]
      for (const r of alts) {
        const d = invertRule(r, c2)
        if (d && d !== answerText) wrongSet.add(d)
      }
      const L = answerText.split('')
      for (let t = 0; t < 12 && wrongSet.size < 6; t++) {
        const i = rng.int(0, L.length - 1)
        const copy = L.slice()
        copy[i] = sh(copy[i], rng.pick([1, -1, 2, -2]))
        const s = copy.join('')
        if (s !== answerText) wrongSet.add(s)
      }
      const wrong = rng.sample([...wrongSet], 4)
      if (wrong.length < 4) continue
      const p = placeCorrect(rng, answerText, wrong)
      options = p.items
      answer = p.answer
    } else {
      const wrong = rng.shuffle(distractorsFor(rng, rule, w2, answerText, mode))
      if (wrong.length < 4) continue
      const p = placeCorrect(rng, answerText, wrong.slice(0, 4))
      options = p.items
      answer = p.answer
    }
    if (new Set(options).size !== 5) continue
    // uniqueness: every rule of the wide family that reproduces the example must give the keyed answer
    const fits = EXT.filter((f) => f(w1) === c1)
    let ambiguous = false
    for (const f of fits) {
      if (mode === 'enc') {
        if (f(w2) !== answerText) ambiguous = true
      } else {
        const dec = options.filter((o) => f(o) === c2)
        if (dec.length !== 1 || dec[0] !== answerText) ambiguous = true
      }
      if (ambiguous) break
    }
    if (ambiguous) continue
    const lang = rng.pick(['a certain code language', 'a certain code', 'a code language'])
    const stem = mode === 'enc' ? `In ${lang}, '${w1}' is written as '${c1}'. How is '${w2}' written in that code?` : `In ${lang}, '${w1}' is written as '${c1}'. What does '${c2}' stand for in that code?`
    const expl = `Rule: ${ruleText(rule, w1)}. '${w1}' -> '${c1}'. ${mode === 'enc' ? `So '${w2}' -> '${answerText}'.` : `Reversing the rule, '${c2}' stands for '${answerText}'.`}`
    const q: QuestionDraft = { topic: 'coding-decoding', stem, options, answer, explanation: expl }
    return { q, proof: { rule, mode, example: [w1, c1], query, answerText, answer } }
  }
  throw new Error('coding-decoding: generation failed')
}

export function generateCodingWithProof(rng: Rng, difficulty: MockDifficulty, count: number): WithProof<CodingProof> {
  const groups: Group[] = []
  const proofs: CodingProof[] = []
  for (const _k of splitCount(count, 1)) {
    void _k
    const { q, proof } = buildOne(rng, difficulty)
    groups.push({ questions: [q] })
    proofs.push(proof)
  }
  return { groups, proofs }
}
