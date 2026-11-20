// Text → Puzzle. Reads the usual bank-exam wording of a "people on floors / in a row, each with a city / colour / …" puzzle:
//   header   "Eight persons - A, B, D … live on eight different floors …"       → people, floors or a row
//   category "Each of them is from a different city - Nagpur, Delhi, …"          → one extra category per such sentence
//   clues    "T lives two floors below the person from Bhopal." and friends     → atoms (see types.ts)
// Anything it cannot read is returned in `unparsed` rather than guessed at, so the solver never works from a wrong clue silently.
import { sameTerm } from './core'
import { MAX_N, type Atom, type Axis, type Category, type Clue, type Puzzle, type Term, type VarTerm } from './types'

export interface ParseSummary {
  people: string[]
  axis: Axis
  topDown: boolean
  cats: Category[]
  labels?: string[]
  unit?: string
  facing?: 'in' | 'out'
  cols?: number
  flats?: string[]
  noun?: string
  place?: string
  rowLen?: number
  /** some people face north and some south (left / right are as seen by the second person named) */
  mixed?: boolean
  /** a table with corners and sides (square, pentagon-shaped …) */
  square?: boolean
  hierarchy?: { unit: string; up: string; down: string }
  mirror?: boolean
  shape?: string
  cornersIn?: boolean
  /** no seating or order at all: people are only matched with attributes */
  unordered?: boolean
  /** more dates than people: every date of every month, in order (the unused ones stay vacant) */
  dates?: string[]
}

export interface ParseResult {
  puzzle: Puzzle | null
  summary: ParseSummary | null
  errors: string[] // problems that stop the solver
  warnings: string[]
  unparsed: string[] // clue sentences that were not understood
  questions: string[] // question lines found in the text (not solved here)
}

const NUM: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
const ORD: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 }
const COUNT_NOUN = '(?:persons?|people|ones?|floors?|seats?|boxes|box|others?|friends?|students?|members?|boys?|girls?|men|women|individuals?|days?|dates?|weeks?|months?|years?|places?)'
const ENT = '@(\\d+)'
const ARTICLE_NOUNS = new Set(['person', 'man', 'woman', 'boy', 'girl', 'friend', 'student', 'floor', 'seat', 'row', 'few', 'couple', 'number', 'different', 'certain', 'particular', 'lot', 'building', 'group', 'member', 'colleague', 'child'])

// ─── text clean-up and sentence splitting ────────────────────────────────────

function normalizeText(raw: string): string {
  return raw
    .replace(/\r/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[‐-―−]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\bviz\.?\s*,?\s*/gi, ' - ') // "Seven persons viz. A, B, C" / "different profession viz. Dentist, Farmer"
    .replace(/\bi\.\s*e\.\s*,?/gi, ' - ') // "different fruits i.e., Banana, Cherry …" introduces the list like a dash would
    .replace(/ /g, ' ')
}

function splitSentences(text: string): string[] {
  const chunks: string[] = []
  let cur = ''
  for (const line of text.split('\n').map((l) => l.trim())) {
    if (!line) {
      if (cur) chunks.push(cur)
      cur = ''
      continue
    }
    cur = cur ? `${cur} ${line}` : line
    if (/[.?!:]\)?$/.test(line)) {
      chunks.push(cur)
      cur = ''
    }
  }
  if (cur) chunks.push(cur)
  const out: string[] = []
  for (const ch of chunks)
    for (const s of ch.split(/(?<=[.?!]\)?)\s+(?=[A-Z0-9("])/)) {
      const t = s
        .trim()
        .replace(/^(?:\d+[.)]|\([a-z0-9]{1,3}\)|[-*•])\s+/i, '')
        .trim()
      if (t) out.push(t)
    }
  return out
}

const isBoilerplate = (s: string): boolean =>
  /^(?:directions?|study|read|answer|refer|based on|solve)\b/i.test(s) || (/[:]$/.test(s) && /\b(?:following|below|given|information|questions?)\b/i.test(s)) || /^q(?:uestion)?\s*\d+/i.test(s)
const isQuestion = (s: string): boolean => /\?\s*$/.test(s) || /^(?:who|which|what|how many|where|whose|whom|when)\b.*\?/i.test(s)

// ─── header: people, axis, categories ────────────────────────────────────────

const NAME_LIST = /\b([A-Z][A-Za-z]*(?:\s*(?:,\s*and|,|\band\b|&)\s*[A-Z][A-Za-z]*){2,})\b/

function parseNames(list: string): string[] {
  return list
    .split(/\s*(?:,\s*and|,|\band\b|&)\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
}

const singular = (w: string): string => {
  const s = w.trim().toLowerCase()
  if (s.endsWith('ies')) return `${s.slice(0, -3)}y`
  if (/(?:ss|x|ch|sh|z)es$/.test(s)) return s.slice(0, -2)
  if (s.endsWith('s') && !s.endsWith('ss')) return s.slice(0, -1)
  return s
}

interface CatSentence {
  name: string
  values: string[]
}

/** "class 1, class 2, … class 8" / "1, 2, … 8": a list that is just the numbers 1 … n (with a common noun) */
function numberedFromList(values: string[], n: number, catName: string): { noun: string } | null {
  const parsed = values.map((v) => v.trim().match(/^([A-Za-z]+)?\s*(\d+)$/))
  if (parsed.some((m) => !m)) return null
  const nouns = new Set(parsed.map((m) => (m as RegExpMatchArray)[1]?.toLowerCase() ?? ''))
  if (nouns.size !== 1) return null
  const nums = parsed.map((m) => Number((m as RegExpMatchArray)[2])).sort((a, b) => a - b)
  if (!nums.every((v, i) => v === i + 1) || nums.length !== n) return null
  const noun = [...nouns][0] || catName
  return /^(?:class|floor|level|grade|standard|rank|step|stage|tier|year)$/.test(noun) ? { noun } : null
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
const ordSuffix = (k: number) => (k % 100 >= 11 && k % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][k % 10 < 4 ? k % 10 : 0])

/**
 * "Each person holds different ranks from I to VI": the values are I … VI, never listed one by one. The text then says "IIIrd rank",
 * "Vth rank", "top rank" (= rank I), "lowest rank" (= the last one).
 */
function parseRankRange(s: string, n: number): (Category & { aliases: string[][] }) | { error: string } | null {
  const m = s.match(/\b(?:different|distinct)\s+([a-z]+)\s+from\s+([IVXivx]+|\d+)\s+to\s+([IVXivx]+|\d+)\b/)
  if (!m) return null
  const num = (w: string) => (/^\d+$/.test(w) ? Number(w) : ROMAN.indexOf(w.toUpperCase()))
  const from = num(m[2])
  const to = num(m[3])
  if (from < 1 || to < from) return null
  if (to - from + 1 !== n) return { error: `"${m[1]}" run from ${m[2]} to ${m[3]} (${to - from + 1} values) but there are ${n} people — they must match.` }
  const roman = !/^\d+$/.test(m[2])
  const name = singular(m[1])
  const values = Array.from({ length: n }, (_, i) => (roman ? ROMAN[from + i] : String(from + i)))
  const aliases = values.map((v, i) => {
    const k = from + i
    const base = roman ? [`${v}${ordSuffix(k)}`, `${v}th`, `${v}st`, `${v}nd`, `${v}rd`] : [`${k}${ordSuffix(k)}`]
    const out = [...new Set(base)].flatMap((b) => [`${b} ${name}`, b])
    if (i === 0) out.push(`top ${name}`, `topmost ${name}`, `highest ${name}`, `first ${name}`)
    if (i === n - 1) out.push(`lowest ${name}`, `bottom ${name}`, `last ${name}`)
    return out
  })
  return { name, values, aliases }
}

/** "born in 8 different years i.e. 1998, 2005, …": the positions are those years, earliest first (and the numbers are kept for age clues) */
function yearOrder(cs: { name: string; values: string[] }): { labels: string[]; values: number[] } | null {
  if (cs.name !== 'year' || !cs.values.every((v) => /^\d{4}$/.test(v.trim()))) return null
  const values = cs.values.map((v) => Number(v.trim())).sort((a, b) => a - b)
  return { labels: values.map(String), values }
}

/** a test on a number from words such as "a perfect square number", "a multiple of 11", "odd", "more than 30" */
function numberPredicate(txt: string): ((v: number) => boolean) | null {
  const t = txt.replace(/\b(?:number|age|year)\b/g, ' ').replace(/\s+/g, ' ').trim()
  const isPrime = (k: number) => k > 1 && Array.from({ length: Math.max(0, Math.floor(Math.sqrt(k)) - 1) }, (_, i) => i + 2).every((d) => k % d !== 0)
  let m: RegExpMatchArray | null
  if (/^(?:a |an )?perfect square$/.test(t)) return (v) => v >= 0 && Number.isInteger(Math.sqrt(v))
  if (/^(?:a |an )?perfect cube$/.test(t)) return (v) => v >= 0 && Number.isInteger(Math.round(Math.cbrt(v))) && Math.round(Math.cbrt(v)) ** 3 === v
  if (/^(?:a |an )?prime$/.test(t)) return isPrime
  if (/^(?:a |an )?(?:composite)$/.test(t)) return (v) => v > 3 && !isPrime(v)
  if (/^(?:an )?odd$/.test(t)) return (v) => v % 2 === 1
  if (/^(?:an )?even$/.test(t)) return (v) => v % 2 === 0
  if ((m = t.match(/^(?:a )?multiple of (\d+)$/) ?? t.match(/^divisible by (\d+)$/))) return (v) => v % Number(m![1]) === 0
  if ((m = t.match(/^(?:more|greater|higher|older) than (\d+)$/))) return (v) => v > Number(m![1])
  if ((m = t.match(/^(?:less|lower|smaller|fewer|younger) than (\d+)$/))) return (v) => v < Number(m![1])
  if ((m = t.match(/^(?:at least|not less than) (\d+)$/))) return (v) => v >= Number(m![1])
  if ((m = t.match(/^(?:at most|not more than) (\d+)$/))) return (v) => v <= Number(m![1])
  if ((m = t.match(/^between (\d+) and (\d+)$/))) return (v) => v > Number(m![1]) && v < Number(m![2])
  return null
}

function parseCategorySentence(s: string): CatSentence | null {
  const m = s.match(/\bdifferent\s+([a-z][a-z' ]*?)\s*(?:-|:|\(|\bamong\b|\bnamely\b)\s*(.+)$/i)
  if (!m) return null
  let rest = m[2].replace(/\([^)]*\)/g, ' ').replace(/[.)]+\s*$/, '')
  rest = rest.replace(/\s+/g, ' ').trim()
  rest = rest.replace(/[,;]?\s*(?:(?:but|though|although)\s+)?not\s+(?:necessarily\s+)?in\s+the\s+same\s+order\.?\s*$/i, '').trim() // "… but not in the same order"
  rest = rest.replace(/[\s-]+(?:in|within|during|over)\s+(?:a|an|the|one)\s+(?:week|month|year|day)\b.*$/i, '').trim().replace(/^(?:namely|viz\.?)\s+/i, '') // "… Bajaj and Benelli in a week"
  if (!rest.includes(',') && !/\band\b/i.test(rest)) return null
  // "₹55,000, ₹70,000": a comma between digit groups of three is a thousands separator, not a list separator
  const SEP = '\u0001'
  const values = rest
    .replace(/(\d),(\d{3})(?!\d)/g, `$1${SEP}$2`)
    .split(/\s*(?:,\s*and\s+|,|;|\band\b)\s*/i)
    .map((v) => v.trim().replace(/[.]+$/, '').split(SEP).join(','))
    .filter(Boolean)
  if (values.length < 3) return null
  return { name: singular(m[1]), values }
}

// ─── mentions ────────────────────────────────────────────────────────────────

interface Lexicon {
  n: number
  axis: Axis
  topDown: boolean
  people: string[]
  cats: Category[]
  valueRe: RegExp | null
  valueIndex: Map<string, { c: number; i: number }>
  personRe: RegExp
  /** axis 'order' with named positions ("July"): the names, matched like values but standing for a fixed position */
  labels?: string[]
  posRe: RegExp | null
  /** axis 'grid': flats per floor, their letters west → east, and a matcher for "flat B" */
  cols?: number
  flats?: string[]
  flatRe: RegExp | null
  /** axis 'tworow': people per row */
  rowLen?: number
  /** axis 'order' made of (month, date) slots: the months in calendar order and the dates; slot = month * dates + date */
  birth?: { months: string[]; dates: number[]; slotMode?: boolean }
  /** people face north or south: index (within the categories) of the 'direction' category */
  dirCat?: number
  /** axis 'order' made of numbers (birth years): the number of every position, and the base year that turns a year into an age */
  values?: number[]
  baseYear?: number
  /** fewer people than the seven days of a week: the days (from the named first day), each person on one, one or more days vacant */
  daySlots?: { labels: string[] }
  /** everyone faces south: left and right are swapped relative to the positions (west → east) */
  mirror?: boolean
  /** a table with corners and sides: even seats are corners, odd seats the middles of the sides */
  square?: boolean
  /** true when the people at the corners face the centre (the people on the sides then face outside) */
  cornersIn?: boolean
}

const isVar = (t: Term): t is VarTerm => t.k !== 'r'

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function buildLexicon(people: string[], cats: Category[], axis: Axis, topDown: boolean, labels?: string[], building?: { cols: number; flats: string[] }, rowLen?: number): Lexicon {
  const valueIndex = new Map<string, { c: number; i: number }>()
  const all: string[] = []
  cats.forEach((cat, c) =>
    cat.values.forEach((v, i) => {
      if (cat.aliases) {
        for (const al of cat.aliases[i]) {
          valueIndex.set(al.toLowerCase(), { c, i })
          all.push(al)
        }
        return
      }
      valueIndex.set(v.toLowerCase(), { c, i })
      all.push(v)
    }),
  )
  // the list says "Bananas" but a clue says "the box which contains Banana": a plural / singular spelling means the same value
  cats.forEach((cat, c) =>
    cat.values.forEach((v, i) => {
      const w = v.toLowerCase()
      if (!/^[a-z]{4,}$/.test(w)) return
      const forms = new Set<string>([`${w}s`, `${w}es`])
      if (w.endsWith('y')) forms.add(`${w.slice(0, -1)}ies`)
      if (w.endsWith('ies')) forms.add(`${w.slice(0, -3)}y`)
      if (w.endsWith('es')) forms.add(w.slice(0, -2))
      if (w.endsWith('s')) forms.add(w.slice(0, -1))
      for (const f of forms) {
        if (f.length < 4 || valueIndex.has(f)) continue
        valueIndex.set(f, { c, i })
        all.push(f)
      }
    }),
  )
  all.sort((a, b) => b.length - a.length)
  const valueRe = all.length ? new RegExp(`(?<![A-Za-z0-9])(?:${all.map(escapeRe).join('|')})(?![A-Za-z0-9])`, 'gi') : null
  const personRe = new RegExp(`(?<![A-Za-z0-9'])(${[...people].sort((a, b) => b.length - a.length).map(escapeRe).join('|')})(?![A-Za-z0-9])`, 'g')
  const posRe = labels ? new RegExp(`(?<![A-Za-z0-9])(?:${[...labels].sort((a, b) => b.length - a.length).map(escapeRe).join('|')})(?![A-Za-z0-9])`, 'gi') : null
  const flatRe = building ? /\b[Ff]lats?\s+([A-Z])\b/g : null
  return { n: people.length, axis, topDown, people, cats, valueRe, valueIndex, personRe, labels, posRe, cols: building?.cols, flats: building?.flats, flatRe, rowLen }
}

/** "may" / "march" in lower case are ordinary English words, not months */
const LOWER_WORDS = new Set(['may', 'march'])

/** Replaces every person / value in the sentence by an @k placeholder and returns the mentions in order. */
function extract(sentence: string, lex: Lexicon): { text: string; ments: Term[] } {
  const ments: Term[] = []
  let t = sentence
  if (lex.valueRe) {
    t = t.replace(lex.valueRe, (m) => {
      const hit = lex.valueIndex.get(m.toLowerCase())
      if (!hit) return m
      ments.push({ k: 'v', c: hit.c, i: hit.i })
      return ` @${ments.length - 1} `
    })
  }
  if (lex.posRe && lex.labels) {
    const labels = lex.labels
    t = t.replace(lex.posRe, (m) => {
      if (m === m.toLowerCase() && LOWER_WORDS.has(m)) return m
      const f = labels.findIndex((l) => l.toLowerCase() === m.toLowerCase())
      if (f < 0) return m
      ments.push({ k: 'f', f })
      return ` @${ments.length - 1} `
    })
  }
  if (lex.flatRe && lex.flats) {
    const flats = lex.flats
    t = t.replace(lex.flatRe, (m, letter: string) => {
      const c = flats.indexOf(letter.toUpperCase())
      return c < 0 ? m : ` colx${c} `
    })
  }
  t = t.replace(lex.personRe, (m: string, _g: string, offset: number, whole: string) => {
    const i = lex.people.indexOf(m)
    if (i < 0) return m
    if (m.length === 1 && /^[AI]$/.test(m)) {
      const before = whole.slice(0, offset).trim()
      const atStart = before === '' || /[,.;:(]$/.test(before)
      const next = whole.slice(offset + 1).trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? ''
      if (atStart && ARTICLE_NOUNS.has(next)) return m
    }
    ments.push({ k: 'p', i })
    return ` @${ments.length - 1} `
  })
  return { text: t.replace(/\s+/g, ' ').trim(), ments }
}

// ─── skeleton and clause patterns ────────────────────────────────────────────

/**
 * "the one who stands third to the right of @3" / "the one who faces @5": a person described by where they are, not by name.
 * Each becomes a derived mention appended to `ments` (see Term kind 'r'); the clause then reads as if it named that person.
 */
function foldDerived(sIn: string, ments: Term[], axis: Axis): string {
  let s = sIn
  const WHO = '(?:the\\s+)?(?:one|person|man|woman|boy|girl|friend|student)\\s+(?:(?:who|that|which)\\s+)?(?:[a-z]+\\s+){0,2}?'
  const opp = new RegExp(`\\b${WHO}(?:opposite|faces?|facing)\\s+@(\\d+)`, 'g')
  const shift = new RegExp(`\\b${WHO}(?:the\\s+)?(#\\d+|\\d+|immediately)\\s+(?:(?:seats?|places?|positions?|persons?)\\s+)?(left|right)\\s+of\\s+@(\\d+)`, 'g')
  for (let round = 0; round < 2; round++) {
    if (axis === 'tworow')
      s = s.replace(opp, (_m, b: string) => {
        ments.push({ k: 'r', base: ments[Number(b)], op: 'opp', d: 0 })
        return ` @${ments.length - 1} `
      })
    s = s.replace(shift, (_m, dist: string, side: string, b: string) => {
      const k = dist === 'immediately' ? 1 : Number(dist.replace('#', ''))
      ments.push({ k: 'r', base: ments[Number(b)], op: 'shift', d: side === 'left' ? -k : k })
      return ` @${ments.length - 1} `
    })
  }
  return s
}

function norm(t: string, ments?: Term[], axis?: Axis, mirror?: boolean): string {
  let s = t.toLowerCase()
  // everyone faces south: a person's left is the east, so every "left" in the text is a higher position and every "right" a lower one
  if (mirror) s = s.replace(/\b(left|right)(most)?\b/g, (_m, d: string, most?: string) => (d === 'left' ? 'right' : 'left') + (most ?? ''))
  s = s.replace(/\b(north|south)[\s-]*(east|west)\b/g, '$1$2')
  s = s.replace(/\bit is not (?:true|the case) that\b/g, ' not ')
  s = s.replace(/\bsenior (?:to|than)\b/g, 'above').replace(/\bjunior (?:to|than)\b/g, 'below') // a higher class is more senior
  s = s.replace(/\bper (?:month|year|annum)\b/g, ' ')
  s = s.replace(/\b(?:immediate(?:ly)?|directly|just) (?:before or after|after or before)\b/g, 'adjacent to') // "born immediately before or after X" = right next to X
  s = s.replace(/\b(?:does not|doesn't|do not|don't|is not|isn't|are not|aren't|cannot|can't|never|was not|wasn't)\b/g, ' not ')
  s = s.replace(/\bimmediate(?:ly)?\b/g, 'immediately').replace(/\b(?:directly|just)\b/g, 'immediately')
  s = s.replace(/\b(higher|lower|taller|shorter)\s+(?:floor|seat|position)\s+than\b/g, '$1 than')
  s = s.replace(/\b(?:on|to|at) the immediately (left|right) of\b/g, 'immediately $1 of')
  s = s.replace(/\bimmediately (?:on|to|at) the (left|right) of\b/g, 'immediately $1 of')
  s = s.replace(/\b(?:on|to|at) the (left|right) of\b/g, '$1 of')
  s = s.replace(/\b(?:exactly )?opposite(?: to)?\b/g, 'opposite')
  s = s.replace(/[^a-z0-9@#' ]+/g, ' ')
  s = s.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b(?=\s+(?:floors?|places?|seats?|positions?|classes|class|levels?|boxes|box|months?|days?|weeks?|years?|persons?|people|steps?|others?|friends?|students?|members?|boys?|girls?))/g, (w) => String(NUM[w]))
  s = s.replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/g, (w) => `#${ORD[w]}`)
  s = s.replace(/\b(\d+)(?:st|nd|rd|th)\b/g, '#$1')
  s = s.replace(/'s\b/g, '')
  s = s.replace(/\bbetween\s+(?:the\s+)?(?:[a-z]+\s+){1,2}(?:in\s+which|of)\s+(@\d+)\s+and\s+(@\d+)\b/g, 'between $1 and $2') // "between the classes in which @F and @H studies"
  if (ments && axis && axis !== 'grid') s = foldDerived(s, ments, axis)
  // "the person from @3" / "the one who likes @3" → "@3";  "@3 person" → "@3"
  s = s.replace(/\b(?:the\s+)?(?:person|one|man|woman|friend|student|employee|boy|girl|individual|member|box)\s+(?:(?:who|that|which)\s+(?:[a-z]+\s+){0,2}?|to be sent to\s+)?(?:from|in|at|of|with)?\s*(?=@\d)/g, '')
  s = s.replace(/(@\d+)\s+(?:person|one|man|woman|friend|student|employee|boy|girl|box)\b/g, '$1')
  s = s.replace(/(@\d+)\s+(?:years?\s+)?old\b/g, '$1') // "the person who is 29 years old"
  s = s.replace(/\bthe\s+(?=@)/g, '')
  return s.replace(/\s+/g, ' ').trim()
}

const HI_WORDS = ['above', 'over', 'higher than', 'right of', 'taller than', 'after', 'later than']
const POSITION_WORDS = /\b(?:floors?|seats?|rows?|above|below|between|left|right|top|topmost|bottom|lowest|lowermost|highest|numbered|odd|even|prime|multiple|weekend|weekday|ends?|adjacent|next|beside|neighbou?rs?|opposite|counted|storey|ground|uppermost)\b|#\d/

const DAYS_IN: Record<string, number> = { january: 31, february: 28, march: 31, april: 30, may: 31, june: 30, july: 31, august: 31, september: 30, october: 31, november: 30, december: 31 }

/** "in the month of January", "in the month having 31 days", "on the 16th": the (month, date) slots a clue allows */
function birthCells(sIn: string, lex: Lexicon): number[] | 'bad' | null {
  // "neither in October nor on the 16th": the slots of either part
  if (/\bneither\b/.test(sIn) && /\bnor\b/.test(sIn)) {
    const parts = sIn.replace(/\bneither\b/g, ' ').split(/\bnor\b/)
    const sets = parts.map((part) => birthCells(part, lex))
    if (sets.some((x) => x === 'bad' || x === null)) return 'bad'
    return [...new Set((sets as number[][]).flat())].sort((a, b) => a - b)
  }
  const { months, dates } = lex.birth as { months: string[]; dates: number[] }
  let s = sIn.replace(/@\d+/g, ' ')
  const rows = new Set<number>()
  const cols = new Set<number>()
  const isWord = (name: string) => (name === 'may' ? /\b(?:in|of|on|during|and|or|from|to|before|after|than)\s+may\b/.test(s) : new RegExp(`\\b${name}\\b`).test(s))
  for (const name of Object.keys(DAYS_IN)) {
    if (!isWord(name)) continue
    const r = months.findIndex((mo) => mo.toLowerCase() === name)
    if (r < 0) return 'bad'
    rows.add(r)
    s = s.replace(new RegExp(`\\b${name}\\b`, 'g'), ' ')
  }
  const days = s.match(/\b(28|29|30|31)\s+days\b/)
  if (days) {
    const want = Number(days[1])
    const hit = months.map((mo, r) => (DAYS_IN[mo.toLowerCase()] === want || (want === 29 && DAYS_IN[mo.toLowerCase()] === 28) ? r : -1)).filter((r) => r >= 0)
    if (!hit.length) return 'bad'
    hit.forEach((r) => rows.add(r))
    s = s.replace(days[0], ' ')
  }
  // "an even-numbered date": the date numbers 16, 20, … (not the position in the list)
  const parity = s.match(/\b(odd|even)\s*(?:numbered\s+)?(?:dates?|days?)\b/)
  if (parity) {
    dates.forEach((d, c) => {
      if (d % 2 === (parity[1] === 'odd' ? 1 : 0)) cols.add(c)
    })
    if (!cols.size) return 'bad'
    s = s.replace(parity[0], ' ')
  }
  for (const m of s.matchAll(/#?(\d+)/g)) {
    const c = dates.indexOf(Number(m[1]))
    if (c < 0) return 'bad'
    cols.add(c)
  }
  if (!rows.size && !cols.size) return null
  const out: number[] = []
  for (let r = 0; r < months.length; r++) for (let c = 0; c < dates.length; c++) if ((!rows.size || rows.has(r)) && (!cols.size || cols.has(c))) out.push(r * dates.length + c)
  return out
}

/** Birthdays on a few dates of a few months: "same month", "same date but different months", "born before B on the 16th" */
/** with vacant dates a clue about a month or a date is about the person's date slot, not about their place in the order */
const onSlot = (lex: Lexicon): { on?: 'slot' } => (lex.birth?.slotMode || lex.daySlots ? { on: 'slot' } : {})

/** the days a clue about the week allows: "on Friday", "on the penultimate day", "right in the middle of the week", "the last day", "on a weekend" */
function daySlotCells(sIn: string, lex: Lexicon): number[] | 'bad' | null {
  const labels = (lex.daySlots as { labels: string[] }).labels
  const len = labels.length
  const t = sIn.replace(/@\d+/g, ' ')
  const out = new Set<number>()
  labels.forEach((l, i) => {
    if (new RegExp(`\\b${l.toLowerCase()}\\b`).test(t)) out.add(i)
  })
  if (/\b(?:penultimate|second last|second to last)\b/.test(t)) out.add(len - 2)
  if (/\bmiddle\b/.test(t)) {
    out.add(Math.floor((len - 1) / 2))
    out.add(Math.ceil((len - 1) / 2))
  }
  if (/\b(?:last|final|latest)\s+day\b/.test(t)) out.add(len - 1)
  for (const m of t.matchAll(/#(\d+)\s+day\b/g)) {
    if (Number(m[1]) < 1 || Number(m[1]) > len) return 'bad'
    out.add(Number(m[1]) - 1)
  }
  if (/\bweekends?\b/.test(t)) labels.forEach((l, i) => (l === 'Saturday' || l === 'Sunday') && out.add(i))
  if (/\bweekdays?\b/.test(t)) labels.forEach((l, i) => l !== 'Saturday' && l !== 'Sunday' && out.add(i))
  return out.size ? [...out].sort((a, b) => a - b) : null
}

function interpretBirth(s: string, ments: Term[], lex: Lexicon): Atom[] | null {
  const M = (k: string): Term => ments[Number(k)]
  const ids = s.match(/@\d+/g) ?? []
  const neg = /\bnot\b/.test(s) || undefined
  if (ids.length === 2) {
    const row = /\bsame month\b/.test(s) ? 'eq' : /\bdifferent months?\b/.test(s) ? 'ne' : undefined
    const col = /\bsame (?:date|day)\b/.test(s) ? 'eq' : /\bdifferent (?:dates?|days?)\b/.test(s) ? 'ne' : undefined
    if (row || col) {
      if (neg && row && col) return null
      return [{ t: 'grid', x: M(ids[0].slice(1)), y: M(ids[1].slice(1)), row, col, neg, ...onSlot(lex) }]
    }
  }
  // "D was born before B on the 16th of a month": both people were born on that date (D in an earlier month than B)
  const tail = s.match(/^(.*@\d+.*?)\s+on the #?(\d+)(?: of (?:a|the|any|that) month)?$/)
  if (tail && ids.length >= 2) {
    const head = interpretClause(tail[1], ments, lex)
    const cells = birthCells(`#${tail[2]}`, lex)
    const named = [...new Set((tail[1].match(/@\d+/g) ?? []).map((t) => t.slice(1)))]
    if (head && cells && cells !== 'bad') return [...head, ...named.map((k) => ({ t: 'set', x: M(k), fs: cells, ...onSlot(lex) }) as Atom)]
  }
  return null
}

/** Clues about a building with several flats per floor: same floor, different lettered flats, north-east of, above in the same flat … */
function interpretGrid(s: string, ments: Term[]): Atom[] | null {
  const M = (k: string): Term => ments[Number(k)]
  const neg = /\bnot\b/.test(s) || undefined
  const sameFlat = /\bsame (?:type of |lettered )?flats?\b|\bsame (?:type of )?(?:lettered )?flat\b/.test(s)
  let m = s.match(new RegExp(`^${ENT}\\s+and\\s+${ENT}\\b.*\\bsame floor\\b`))
  if (m) return [{ t: 'grid', x: M(m[1]), y: M(m[2]), row: 'eq', neg }]
  m = s.match(new RegExp(`^${ENT}\\b.*\\bsame floor as\\s+${ENT}`))
  if (m) return [{ t: 'grid', x: M(m[1]), y: M(m[2]), row: 'eq', neg }]
  m = s.match(new RegExp(`^${ENT}\\s+and\\s+${ENT}\\b.*\\bdifferent floors?\\b`))
  if (m) return [{ t: 'grid', x: M(m[1]), y: M(m[2]), row: 'ne', neg }]
  m = s.match(new RegExp(`^${ENT}\\s+and\\s+${ENT}\\b.*\\b(different|same)\\b.*\\bflats?\\b`))
  if (m && !/\bfloor/.test(s)) return [{ t: 'grid', x: M(m[1]), y: M(m[2]), col: m[3] === 'same' ? 'eq' : 'ne', neg }]
  // "U's flat is to the south-east of E's flat"
  m = s.match(new RegExp(`${ENT}\\b(?:\\s+flat)?\\s+(?:[a-z]+\\s+){0,4}?(northeast|northwest|southeast|southwest|north|south|east|west)\\s+(?:of\\s+)?${ENT}`))
  if (m) {
    const d = m[2]
    const row = d.startsWith('north') ? 'gt' : d.startsWith('south') ? 'lt' : undefined
    const col = d.endsWith('east') ? 'gt' : d.endsWith('west') ? 'lt' : undefined
    return [{ t: 'grid', x: M(m[1]), y: M(m[3]), row, col, neg }]
  }
  // "L lives above R in the same type of flat", "X lives immediately below Y", "X lives two floors above Y"
  m = s.match(new RegExp(`${ENT}\\b.*?(?:\\b(immediately)\\s+)?(?:(\\d+)\\s+floors?\\s+)?\\b(above|below|higher than|lower than)\\s+${ENT}(.*)$`))
  if (m && !/floor number/.test(s)) {
    // groups: 1 = x, 2 = "immediately", 3 = N floors, 4 = above / below, 5 = y, 6 = the rest of the sentence
    const up = m[4] === 'above' || m[4] === 'higher than'
    const k = m[3] ? Number(m[3]) : m[2] ? 1 : undefined
    return [{ t: 'grid', x: M(m[1]), y: M(m[5]), row: up ? 'gt' : 'lt', rowDiff: k === undefined ? undefined : up ? k : -k, col: sameFlat || m[2] ? 'eq' : undefined, neg }]
  }
  // "The floor number of O's flat is more than the floor number of A's flat"
  m = s.match(new RegExp(`floor number of\\s+${ENT}\\b(?:\\s+flat)?\\s+(?:is\\s+)?(more|greater|higher|less|lower)\\s+than\\s+(?:the\\s+)?floor number of\\s+${ENT}`))
  if (m) return [{ t: 'grid', x: M(m[1]), y: M(m[3]), row: m[2] === 'more' || m[2] === 'greater' || m[2] === 'higher' ? 'gt' : 'lt', neg }]
  return null
}

/** In a line of people who face north or south, "x is to the left of y" is as seen by y: mark every such relation. */
function markFacing(a: Atom): Atom | null {
  if (a.t === 'logic') {
    const x = markFacing(a.a)
    const y = markFacing(a.b)
    return x && y ? { ...a, a: x, b: y } : null
  }
  if (a.t === 'diff' || a.t === 'rank') return isVar(a.y) ? { ...a, ref: true } : null
  return a
}

const markDays = (a: Atom): Atom => (a.t === 'diff' || a.t === 'gap' || a.t === 'adj' || a.t === 'same' ? { ...a, on: 'slot' } : a.t === 'logic' ? { ...a, a: markDays(a.a), b: markDays(a.b) } : a)

function interpretClause(s: string, ments: Term[], lex: Lexicon): Atom[] | null {
  let raw = interpretClauseRaw(s, ments, lex)
  // in a week with a vacant day, "N days after / between" counts days (the vacant one too), not people
  if (raw && lex.daySlots && /\b(?:days?|dates?)\b/.test(s)) raw = raw.map(markDays)
  if (!raw || lex.dirCat === undefined) return raw
  const marked = raw.map(markFacing)
  return marked.every(Boolean) ? (marked as Atom[]) : null
}

function interpretClauseRaw(s: string, ments: Term[], lex: Lexicon): Atom[] | null {
  const M = (k: string): Term => ments[Number(k)]
  const neg = /\bnot\b/.test(s.replace(/\bbut not both\b/g, '')) || undefined
  const grid = lex.axis === 'grid'
  if (lex.birth) {
    const b = interpretBirth(s, ments, lex)
    if (b) return b
  }
  if (grid) {
    const g = interpretGrid(s, ments)
    if (g) return g
  }
  if (!grid) {

  // "The number of persons between x and y is (not) the same as the number of persons between z and w"
  let m = s.match(new RegExp(`(?:number of|as many) (?:[a-z]+\\s+){1,3}?between\\s+${ENT}\\s+and\\s+${ENT}\\s+(?:(?:is|are)\\s+)?(not\\s+)?(?:the\\s+)?same as\\s+(?:(?:the\\s+)?number of (?:[a-z]+\\s+){1,3}?)?between\\s+${ENT}\\s+and\\s+${ENT}`))
  if (m) return [{ t: 'same', x: M(m[1]), y: M(m[2]), z: M(m[4]), w: M(m[5]), neg: m[3] ? true : undefined }]

  // "Two people sit between x and y when counted from the left / right of x": a direction and a distance
  m = s.match(new RegExp(`(?:(?:exactly|only)\\s+)?(\\d+|no)\\s+${COUNT_NOUN}\\s+(?:[a-z]+\\s+){0,3}?between\\s+${ENT}\\s+and\\s+${ENT}\\s+(?:when\\s+)?counted\\s+from\\s+(?:the\\s+)?(left|right)\\s+of\\s+${ENT}`))
  if (m) {
    const k = m[1] === 'no' ? 0 : Number(m[1])
    const a = M(m[2])
    const b = M(m[3])
    const from = M(m[5])
    const dir = m[4] === 'left' ? -1 : 1
    if (sameTerm(from, a)) return [{ t: 'diff', x: b, y: a, d: dir * (k + 1), neg }]
    if (sameTerm(from, b)) return [{ t: 'diff', x: a, y: b, d: dir * (k + 1), neg }]
    return null
  }

  // positions that are numbers (birth years): "The age of G is a multiple of 11", "the year of birth of F is a leap year"
  if (lex.values) {
    m = s.match(new RegExp(`^(?:the\\s+)?(age|year)(?:\\s+of\\s+birth)?(?:\\s+of)?\\s+${ENT}\\s+(?:(?:is|was)\\s+)?(not\\s+)?(.+)$`))
    if (m) {
      const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
      const pred = /^(?:a |an )?leap(?: year)?$/.test(m[4].replace(/\\s+/g, ' ').trim()) ? (m[1] === 'year' ? leap : null) : numberPredicate(m[4])
      const base = lex.baseYear
      if (pred && (m[1] === 'year' || base !== undefined)) {
        const val = (y: number) => (m![1] === 'age' ? (base as number) - y : y)
        const fs = lex.values.map((y, f) => (pred(val(y)) ? f : -1)).filter((f) => f >= 0)
        return [{ t: 'set', x: M(m[2]), fs, neg: m[3] || neg ? true : undefined }]
      }
    }
    // "A was born in an odd numbered year", "born in a leap year"
    m = s.match(new RegExp(`^${ENT}\\s+(?:[a-z]+\\s+){0,3}?(?:in\\s+)?(?:a\\s+|an\\s+)?(odd|even|leap)(?:[\\s-]*numbered)?\\s+year$`))
    if (m) {
      const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
      const fs = lex.values.map((y, f) => ((m![2] === 'leap' ? leap(y) : y % 2 === (m![2] === 'odd' ? 1 : 0)) ? f : -1)).filter((f) => f >= 0)
      return [{ t: 'set', x: M(m[1]), fs, neg }]
    }
    // "The difference between the ages of G and A is the same as the difference between the ages of F and C"
    m = s.match(new RegExp(`difference between\\s+(?:the\\s+)?(?:[a-z]+\\s+){0,2}?${ENT}\\s+and\\s+${ENT}\\s+(?:(?:is|are)\\s+)?(not\\s+)?(?:the\\s+)?(?:same as|equal to)\\s+(?:the\\s+)?difference between\\s+(?:the\\s+)?(?:[a-z]+\\s+){0,2}?${ENT}\\s+and\\s+${ENT}`))
    if (m) return [{ t: 'vsame', x: M(m[1]), y: M(m[2]), z: M(m[4]), w: M(m[5]), neg: m[3] ? true : undefined }]
  }

  // "I sits immediate right and immediate left of A and C respectively": one person, two relations, one to each named person
  const REL = '(?:(immediately)\\s+|#(\\d+)\\s+)?(left|right)'
  m = s.match(new RegExp(`^${ENT}\\s+(?:[a-z]+\\s+){0,2}?${REL}\\s+and\\s+${REL}\\s+of\\s+${ENT}\\s+and\\s+${ENT}\\s+respectively$`))
  if (m) {
    const rel = (imm: string | undefined, num: string | undefined, side: string, y: Term): Atom | null =>
      imm || num ? { t: 'diff', x: M(m![1]), y, d: (side === 'right' ? 1 : -1) * (num ? Number(num) : 1) } : lex.axis === 'circle' ? null : { t: 'rank', x: M(m![1]), y, hi: side === 'right' }
    const a1 = rel(m[2], m[3], m[4], M(m[8]))
    const a2 = rel(m[5], m[6], m[7], M(m[9]))
    return a1 && a2 ? [a1, a2] : null
  }

  // "Mayank buys either KTM or Yamaha": one of the two
  m = s.match(new RegExp(`^${ENT}\\s+(?:[a-z]+\\s+){0,3}?either\\s+${ENT}\\s+or\\s+${ENT}$`))
  if (m) {
    const x = M(m[1])
    const a = M(m[2])
    const b = M(m[3])
    const cat = (t: Term) => (t.k === 'p' ? -1 : t.k === 'v' ? t.c : -2)
    if (isVar(x) && a.k === 'v' && b.k === 'v' && cat(x) !== cat(a) && cat(x) !== cat(b)) return [{ t: 'logic', op: 'or', a: { t: 'link', x, y: a }, b: { t: 'link', x, y: b } }]
  }

  // "Mayank purchased after two days of the one who purchased Ducati": exactly that many days after / before
  m = s.match(new RegExp(`${ENT}\\s+(?:[a-z]+\\s+){0,3}?(after|before)\\s+(\\d+)\\s+(?:days?|floors?|seats?|places?|months?|weeks?|years?|steps?)\\s+(?:of|from)\\s+${ENT}`))
  if (m) return [{ t: 'diff', x: M(m[1]), y: M(m[4]), d: (m[2] === 'after' ? 1 : -1) * Number(m[3]), neg }]

  // "The number of persons to the left of x is the same as the number of persons to the right of y"
  // ("the number of floors above G is the same as the number of floors below the Fireman")
  const SIDE = '(left of|right of|above|below|before|after)'
  m = s.match(new RegExp(`(?:number(?:\\s+of)?|as many) (?:[a-z]+\\s+){1,3}?${SIDE}\\s+${ENT}\\s+(?:(?:is|are)\\s+)?(not\\s+)?(?:the\\s+)?(?:same as|equal to)\\s+(?:(?:the\\s+)?number(?:\\s+of)?\\s+(?:[a-z]+\\s+){0,3}?)?${SIDE}\\s+${ENT}`))
  if (m) {
    if (lex.axis === 'circle') return null
    const low = (w: string) => w === 'left of' || w === 'below' || w === 'before'
    return [{ t: 'cnt', x: M(m[2]), xs: low(m[1]) ? 'l' : 'r', y: M(m[5]), ys: low(m[4]) ? 'l' : 'r', neg: m[3] || neg ? true : undefined }]
  }

  // two facing rows: "x sits in the same row as y", "x and y sit in different rows"
  if (lex.axis === 'tworow') {
    m = s.match(new RegExp(`^${ENT}\\s+and\\s+${ENT}\\s+(?:[a-z]+\\s+){0,3}?(?:in\\s+)?(?:the\\s+)?(same|different)\\s+rows?\\b`))
    if (m) return [{ t: 'samerow', x: M(m[1]), y: M(m[2]), neg: (m[3] === 'different') !== !!neg ? true : undefined }]
    m = s.match(new RegExp(`${ENT}\\s+(?:[a-z]+\\s+){0,3}?(?:in\\s+)?(?:the\\s+)?same row as\\s+${ENT}`))
    if (m) return [{ t: 'samerow', x: M(m[1]), y: M(m[2]), neg }]
    m = s.match(new RegExp(`${ENT}\\s+(?:[a-z]+\\s+){0,3}?(?:in\\s+)?(?:a\\s+)?different rows? (?:from|than)\\s+${ENT}`))
    if (m) return [{ t: 'samerow', x: M(m[1]), y: M(m[2]), neg: neg ? undefined : true }]
  }

  // people who face north or south: "B and I face the same direction", "L faces towards south"
  if (lex.dirCat !== undefined) {
    m = s.match(new RegExp(`${ENT}\\s+and\\s+${ENT}\\s+(?:[a-z]+\\s+){0,3}?(?:faces?|facing)\\s+(?:towards?\\s+)?(?:the\\s+)?(same|opposite|different)\\s+(?:direction|way)`))
    if (m) {
      const x = M(m[1])
      const y = M(m[2])
      if (!isVar(x) || !isVar(y)) return null
      return [{ t: 'sdir', x, y, neg: (m[3] !== 'same') !== !!neg ? true : undefined }]
    }
    m = s.match(new RegExp(`${ENT}\\s+(?:[a-z]+\\s+){0,2}?(?:faces?|facing)\\s+(?:towards?\\s+)?(?:the\\s+)?${ENT}`))
    if (m) {
      const x = M(m[1])
      const y = M(m[2])
      if (isVar(x) && isVar(y) && y.k === 'v' && y.c === lex.dirCat && x.k !== 'f') return [{ t: 'link', x, y, neg }]
    }
  }

  // "The one who likes Lemon and the one who likes Fig sit opposite to each other"
  m = s.match(new RegExp(`^${ENT}\\s+and\\s+${ENT}\\s+(?:[a-z]+\\s+){0,3}?opposite\\s+(?:to\\s+)?each other$`))
  if (m) return lex.axis === 'circle' ? [{ t: 'diff', x: M(m[1]), y: M(m[2]), d: lex.n / 2, neg }] : lex.axis === 'tworow' ? [{ t: 'opp', x: M(m[1]), y: M(m[2]), neg }] : null

  // "N doesn't sit immediate right of M and S": the denial holds for each of the people named
  m = s.match(new RegExp(`^${ENT}\\s+(?:[a-z]+\\s+){0,3}?(?:(immediately)\\s+|#(\\d+)\\s+)?(left|right) of\\s+${ENT}\\s+(?:and|or|nor)\\s+${ENT}$`))
  if (m && neg) {
    const mk = (y: string): Atom | null => (m![2] || m![3] ? { t: 'diff', x: M(m![1]), y: M(y), d: (m![4] === 'right' ? 1 : -1) * (m![3] ? Number(m![3]) : 1), neg: true } : lex.axis === 'circle' ? null : { t: 'rank', x: M(m![1]), y: M(y), hi: m![4] === 'right', neg: true })
    const a1 = mk(m[5])
    const a2 = mk(m[6])
    if (a1 && a2) return [a1, a2]
  }

  // "x sits exactly opposite y" (round table: across the table; two rows: the person facing x)
  m = s.match(new RegExp(`${ENT}\\s+(?:[a-z]+\\s+){0,4}?opposite\\s+${ENT}`))
  if (m) return lex.axis === 'circle' ? [{ t: 'diff', x: M(m[1]), y: M(m[2]), d: lex.n / 2, neg }] : lex.axis === 'tworow' ? [{ t: 'opp', x: M(m[1]), y: M(m[2]), neg }] : null

  // "x faces y": on a round table, the person across the table
  m = s.match(new RegExp(`${ENT}\\s+(?:[a-z]+\\s+){0,3}?faces?\\s+${ENT}`))
  // on a square table only people on the sides face the centre: "x faces y" = x is across the table from y and sits on a side
  if (m && lex.square) return [{ t: 'opp', x: M(m[1]), y: M(m[2]), neg }]
  if (m) return lex.axis === 'circle' ? [{ t: 'diff', x: M(m[1]), y: M(m[2]), d: lex.n / 2, neg }] : lex.axis === 'tworow' ? [{ t: 'opp', x: M(m[1]), y: M(m[2]), neg }] : null

  // "more than one person between x and y", "at most two people between …": any gap that fits the bound
  m = s.match(new RegExp(`((?:not\\s+)?(?:more|less|fewer)\\s+than|at\\s+(?:most|least))\\s+(\\d+)\\s+${COUNT_NOUN}\\s+(?:[a-z]+\\s+){0,3}?(?:in\\s+)?between\\s+${ENT}\\s+and\\s+${ENT}`))
  if (m && lex.axis !== 'circle') {
    const k = Number(m[2])
    const phrase = m[1].replace(/\\s+/g, ' ')
    const ok = (c: number) => (/^not more than|^at most/.test(phrase) ? c <= k : /^not (?:less|fewer) than|^at least/.test(phrase) ? c >= k : /^more than/.test(phrase) ? c > k : c < k)
    const gaps = Array.from({ length: Math.max(0, lex.n - 1) }, (_, c) => c).filter(ok)
    if (gaps.length) return [{ t: 'gap', x: M(m[3]), y: M(m[4]), k: gaps[0], hi: gaps[gaps.length - 1] }]
  }

  // exactly k people between x and y
  m = s.match(new RegExp(`(?:(?:exactly|only)\\s+)?(?:there (?:are|is)\\s+)?(?:(?:exactly|only)\\s+)?(\\d+|no)\\s+${COUNT_NOUN}\\s+(?:[a-z]+\\s+){0,3}?(?:exactly\\s+)?(?:in\\s+)?between\\s+${ENT}\\s+and\\s+${ENT}`))
  if (m) return [{ t: 'gap', x: M(m[2]), y: M(m[3]), k: m[1] === 'no' ? 0 : Number(m[1]), neg }]
  m = s.match(new RegExp(`${ENT}\\s+and\\s+${ENT}\\s+(?:have|has)\\s+(\\d+|no)\\s+${COUNT_NOUN}\\s+between\\s+them`))
  if (m) return [{ t: 'gap', x: M(m[1]), y: M(m[2]), k: m[3] === 'no' ? 0 : Number(m[3]), neg }]

  // "Not more than four persons were born before E", "at least two people sit to the left of X": a range of positions
  m = s.match(new RegExp(`((?:not\\s+|no\\s+)?(?:more|less|fewer)\\s+than|at\\s+(?:most|least))\\s+(\\d+)\\s+${COUNT_NOUN}\\s+(?:[a-z]+\\s+){0,3}?(above|below|after|before|higher than|lower than|left of|right of)\\s+${ENT}`))
  if (m && !/@\d/.test(s.slice(0, m.index)) && lex.axis !== 'circle') {
    const k = Number(m[2])
    const phrase = m[1].replace(/\s+/g, ' ')
    const ok = (c: number) => (/^(?:not|no) more than|^at most/.test(phrase) ? c <= k : /^(?:not|no) (?:less|fewer) than|^at least/.test(phrase) ? c >= k : /^more than/.test(phrase) ? c > k : c < k)
    const fs = Array.from({ length: lex.n }, (_, c) => c)
      .filter(ok)
      .map((c) => (HI_WORDS.includes(m![3]) ? lex.n - 1 - c : c))
      .sort((a, b) => a - b)
    if (fs.length && fs.length < lex.n) return [{ t: 'set', x: M(m[4]), fs }]
  }

  // "N people above / after / below / before x": exactly N people on that side, so x has one exact position
  m = s.match(new RegExp(`(?:(?:exactly|only)\\s+)?(\\d+|no)\\s+${COUNT_NOUN}\\s+(?:[a-z]+\\s+){0,3}?(above|below|after|before|higher than|lower than|left of|right of)\\s+${ENT}`))
  if (m && !/@\d/.test(s.slice(0, m.index))) {
    const count = m[1] === 'no' ? 0 : Number(m[1])
    const idx = HI_WORDS.includes(m[2]) ? lex.n - 1 - count : count
    if (idx < 0 || idx >= lex.n) return null
    return [{ t: 'set', x: M(m[3]), fs: [idx], neg }]
  }

  // x between y and z
  m = s.match(new RegExp(`^${ENT}\\s+(?:[a-z]+\\s+){0,3}?(immediately\\s+)?between\\s+${ENT}\\s+and\\s+${ENT}$`))
  if (m) {
    const x = M(m[1])
    const y = M(m[3])
    const z = M(m[4])
    const base: Atom = { t: 'btw', x, y, z, neg }
    if (lex.axis === 'circle' && !m[2]) return null // "between" on a circle is ambiguous unless it means right next to both
    if (m[2] && !neg)
      return [base, { t: 'adj', x, y }, { t: 'adj', x, y: z }]
    return [base]
  }

  // x (immediately | N floors) above / below y
  m = s.match(new RegExp(`${ENT}\\s+(?:[a-z]+\\s+){0,8}?(?:(immediately)\\s+)?(?:#?(\\d+)\\s+(?:(?:floors?|places?|seats?|positions?|classes|class|levels?|boxes|box|steps?|months?|days?|weeks?|years?)\\s+)?)?(above|below|over|under|higher than|lower than|left of|right of|taller than|shorter than|after|before|later than|earlier than)\\s+(?:(?:the\\s+)?(?:floor|seat|month|day) of\\s+)?${ENT}`))
  if (m) {
    const hi = HI_WORDS.includes(m[4])
    const x = M(m[1])
    const y = M(m[5])
    if (m[3]) return [{ t: 'diff', x, y, d: hi ? Number(m[3]) : -Number(m[3]), neg }]
    if (m[2]) return [{ t: 'diff', x, y, d: hi ? 1 : -1, neg }]
    if (lex.axis === 'circle') return null // "to the left of" with no distance means nothing on a round table
    return [{ t: 'rank', x, y, hi, neg }]
  }

  // neighbours
  m = s.match(new RegExp(`${ENT}\\s+(?:[a-z]+\\s+){0,6}?(?:next to|adjacent to|beside|immediately to|neighbou?r of|neighbouring|adjoining)\\s+${ENT}`))
  if (m) return [{ t: 'adj', x: M(m[1]), y: M(m[2]), neg }]
  m = s.match(new RegExp(`${ENT}\\s+and\\s+${ENT}\\s+(?:[a-z]+\\s+){0,4}?(?:adjacent|neighbou?rs?|next to each other|beside each other)`))
  if (m) return [{ t: 'adj', x: M(m[1]), y: M(m[2]), neg }]

  }

  const count = (s.match(/@\d+/g) ?? []).length

  // "Neither F nor B likes Bajaj and Hero": every person named is denied every value named
  const cross = s.match(/^(?:neither\s+)?((?:@\d+\s+(?:nor|and|or)\s+)*@\d+)\s+(?:[a-z]+\s+){0,2}?((?:@\d+\s+(?:nor|and|or)\s+)+@\d+)$/)
  if (cross && (/^neither\b/.test(s) || /\bnot\b/.test(s))) {
    const who = (cross[1].match(/@(\d+)/g) ?? []).map((t) => M(t.slice(1)))
    const what = (cross[2].match(/@(\d+)/g) ?? []).map((t) => M(t.slice(1)))
    const cat = (t: Term) => (t.k === 'p' ? -1 : t.k === 'v' ? t.c : -2)
    if (who.every(isVar) && what.every(isVar) && who.every((x) => what.every((y) => cat(x) !== cat(y)))) {
      return who.flatMap((x) => what.map((y) => ({ t: 'link', x: x as VarTerm, y: y as VarTerm, neg: true }) as Atom))
    }
  }

  // "Neither A nor B lives on the top floor", "Both A and B live on odd floors", "A and B do not live on the lowest floor"
  const listed = s.match(/(?:^|\s)(?:neither\s+|both\s+)?((?:@\d+)(?:\s+(?:and|nor)\s+@\d+)+)(?=\s)/)
  if (count >= 2 && listed && (listed[1].match(/@/g) ?? []).length === count) {
    const who = (s.match(/@(\d+)/g) ?? []).map((t) => M(t.slice(1)))
    if (who.every((t) => t.k !== 'f')) {
      const fs = positionSet(s, lex)
      if (fs && fs !== 'bad' && fs.length) {
        const no = neg || /\bneither\b/.test(s) ? true : undefined
        return who.map((x) => ({ t: 'set', x, fs, neg: no, ...onSlot(lex) }) as Atom)
      }
    }
  }

  // a person / value and one or more named positions: "V was born in July", "not in May or June"
  {
    const all = (s.match(/@(\d+)/g) ?? []).map((t) => M(t.slice(1)))
    const named = all.filter((t): t is Extract<Term, { k: 'f' }> => t.k === 'f')
    const others = all.filter((t) => t.k !== 'f')
    const chain = others.every(isVar) && (others.length === 1 || /^(?:neither\s+|both\s+)?@\d+(?:\s+(?:and|nor)\s+@\d+)+\s/.test(s))
    if (named.length >= 1 && others.length >= 1 && chain) {
      const fs = [...new Set(named.map((t) => t.f))].sort((a, b) => a - b)
      const either = /\b(?:either|neither)\b/.test(s)
      return others.map((x) => (fs.length === 1 && !either ? { t: 'link', x, y: named[0], neg } : { t: 'set', x, fs, neg: neg || (/\bneither\b/.test(s) ? true : undefined) }) as Atom)
    }
    // "Virat buys Honda on Friday": the two are the same person, and that person is on that day
    if (named.length >= 1 && others.length === 2 && !neg && !/\b(?:either|neither)\b/.test(s) && others.every(isVar)) {
      const cat = (t: Term) => (t.k === 'p' ? -1 : t.k === 'v' ? t.c : -2)
      if (cat(others[0]) !== cat(others[1])) {
        const fs = [...new Set(named.map((t) => t.f))].sort((a, b) => a - b)
        const pos: Atom = fs.length === 1 ? { t: 'link', x: others[0] as VarTerm, y: named[0] } : { t: 'set', x: others[0], fs }
        return [{ t: 'link', x: others[0] as VarTerm, y: others[1] as VarTerm }, pos]
      }
    }
  }

  // "Hardik buys Benelli on the penultimate day": the two are the same person, and that person is at that position
  if (count === 2 && !neg && lex.axis !== 'grid') {
    const ids2 = (s.match(/@(\d+)/g) ?? []).map((t) => M(t.slice(1)))
    const fs2 = ids2.every((t) => t.k !== 'f') ? positionSet(s, lex) : null
    const cat2 = (t: Term) => (t.k === 'p' ? -1 : t.k === 'v' ? t.c : -2)
    if (fs2 && fs2 !== 'bad' && fs2.length && ids2.every(isVar) && cat2(ids2[0]) !== cat2(ids2[1])) return [{ t: 'link', x: ids2[0] as VarTerm, y: ids2[1] as VarTerm }, { t: 'set', x: ids2[0], fs: fs2, ...onSlot(lex) }]
  }

  // one person / value and a position: "topmost", "floor 3", "either the topmost or the lowest", "an odd-numbered floor" …
  if (count === 1 && (lex.axis !== 'circle' || lex.square)) {
    const x = M((s.match(/@(\d+)/) as RegExpMatchArray)[1])
    const fs = positionSet(s, lex)
    if (fs === 'bad') return null
    if (fs && fs.length) return [{ t: 'set', x, fs, neg: neg || (/\bneither\b/.test(s) ? true : undefined), ...onSlot(lex) }]
    return null
  }

  // link: "x is from y", "x likes y", "x is neither y nor z"
  if (count >= 2 && !POSITION_WORDS.test(s)) {
    const ids = (s.match(/@(\d+)/g) ?? []).map((t) => M(t.slice(1)))
    const cat = (t: Term) => (t.k === 'p' ? -1 : t.k === 'v' ? t.c : -2)
    const vars = ids.filter(isVar)
    if (vars.length !== ids.length) return null // "the one who faces E" has no row of its own in the tables, so it cannot be linked directly
    if (/\bneither\b/.test(s) && /\bnor\b/.test(s) && vars.length === 3) {
      const [a, b, c] = vars
      if (cat(a) === cat(b) || cat(a) === cat(c)) return null
      return [{ t: 'link', x: a, y: b, neg: true }, { t: 'link', x: a, y: c, neg: true }]
    }
    if (vars.length === 2 && cat(vars[0]) !== cat(vars[1])) return [{ t: 'link', x: vars[0], y: vars[1], neg }]
  }
  return null
}

/** The set of heights a unary clue allows ('bad' when it names a floor that does not exist). */
/** The cells of a building a unary clue allows: "in flat A", "on floor 3", "on an even-numbered floor", "in flat B on floor 2". */
function gridCells(sIn: string, lex: Lexicon): number[] | 'bad' | null {
  const cols = lex.cols ?? 1
  const rows = lex.n / cols
  let s = sIn.replace(/@\d+/g, ' ')
  const colSel = new Set<number>()
  for (const m of s.matchAll(/\bcolx(\d+)\b/g)) colSel.add(Number(m[1]))
  s = s.replace(/\bcolx\d+\b/g, ' ')
  const rowSel = new Set<number>()
  for (const m of s.matchAll(/#?(\d+)/g)) {
    const r = Number(m[1]) - 1
    if (r < 0 || r >= rows) return 'bad'
    rowSel.add(r)
  }
  if (/\b(?:topmost|top|highest|uppermost)\b/.test(s)) rowSel.add(rows - 1)
  if (/\b(?:ground|lowest|lowermost|bottom|bottommost)\b/.test(s)) rowSel.add(0)
  const par = s.match(/\b(odd|even)\b/)
  if (par) for (let r = 0; r < rows; r++) if ((r + 1) % 2 === (par[1] === 'odd' ? 1 : 0)) rowSel.add(r)
  if (!colSel.size && !rowSel.size) return null
  const cells: number[] = []
  for (let f = 0; f < lex.n; f++) if ((!rowSel.size || rowSel.has(Math.floor(f / cols))) && (!colSel.size || colSel.has(f % cols))) cells.push(f)
  return cells
}

/**
 * Two facing rows: the cells a unary clue allows — "in row 1", "at either end of the row", "third from the left end of row 2".
 * Seats are counted inside a row, so a seat clue without a row names that seat in both rows.
 */
function twoRowCells(sIn: string, lex: Lexicon): number[] | 'bad' | null {
  const m = lex.rowLen ?? lex.n / 2
  let s = sIn.replace(/@\d+/g, ' ')
  const rows = new Set<number>()
  for (const r of s.matchAll(/\brow\s*#?([12])\b|#([12])\s+row\b/g)) rows.add(Number(r[1] ?? r[2]) - 1)
  s = s.replace(/\brow\s*#?[12]\b|#[12]\s+row\b/g, ' ')
  const END = /(?<!left\s)(?<!right\s)\bends?\b/
  const ends = END.test(s)
  if (ends) s = s.replace(new RegExp(END.source, 'g'), ' ')
  const idx = positionSet(s, { ...lex, n: m, axis: 'row', topDown: false, labels: undefined, posRe: null })
  if (idx === 'bad') return 'bad'
  const seats = new Set<number>(idx ?? [])
  if (ends) {
    seats.add(0)
    seats.add(m - 1)
  }
  if (!seats.size && !rows.size) return null
  const cells: number[] = []
  for (let r = 0; r < 2; r++) {
    if (rows.size && !rows.has(r)) continue
    for (let i = 0; i < m; i++) if (!seats.size || seats.has(i)) cells.push(r * m + i)
  }
  return cells
}

/** square table: "at one of the corners" (even seats), "at the middle of a side" / "faces the centre" (odd seats) */
function squareSeats(s: string, lex: Lexicon): number[] | 'bad' | null {
  const faceOut = /\bfac(?:e|es|ing)\s+(?:towards?\s+)?(?:the\s+)?outside\b|\bfac(?:e|es|ing)\s+away\b/.test(s)
  const faceIn = /\bfac(?:e|es|ing)\s+(?:towards?\s+)?(?:the\s+)?(?:centre|center|inside)\b/.test(s)
  const corner = /\bcorners?\b/.test(s) || (lex.cornersIn ? faceIn : faceOut)
  const side = /\b(?:middle|centre|center)\s+of\s+(?:a|an|the|each|any)\s+sides?\b|\bmiddles?\b|\bsides?\b/.test(s.replace(/\bcorners? of the table\b/g, '')) || (lex.cornersIn ? faceOut : faceIn)
  if (corner === side) return null
  return Array.from({ length: lex.n }, (_, f) => f).filter((f) => (corner ? f % 2 === 0 : f % 2 === 1))
}

function positionSet(sIn: string, lex: Lexicon): number[] | 'bad' | null {
  if (lex.axis === 'grid') return gridCells(sIn, lex)
  if (lex.square) return squareSeats(sIn, lex)
  if (lex.axis === 'tworow') return twoRowCells(sIn, lex)
  if (lex.birth) return birthCells(sIn, lex)
  if (lex.daySlots) return daySlotCells(sIn, lex)
  const n = lex.n
  let s = sIn.replace(/@\d+/g, ' ') // the @k mention placeholders are not floor numbers
  const set = new Set<number>()
  let any = false
  const add = (f: number) => {
    set.add(f)
    any = true
  }
  const label2idx = (k: number) => (lex.topDown ? n - k : k - 1)
  const daysIn = s.match(/\b(31|30|28|29)\s+days\b/)
  if (daysIn && lex.labels) {
    const want: Record<string, string[]> = {
      '31': ['January', 'March', 'May', 'July', 'August', 'October', 'December'],
      '30': ['April', 'June', 'September', 'November'],
      '28': ['February'],
      '29': ['February'],
    }
    lex.labels.forEach((l, f) => {
      if (want[daysIn[1]].includes(l)) add(f)
    })
    if (!any) return 'bad'
    s = s.replace(daysIn[0], ' ')
  }
  // "a prime-numbered floor", "a floor whose number is a multiple of 3", "a weekend day"
  const label = (f: number) => (lex.topDown ? n - f : f + 1)
  const isPrime = (k: number) => k > 1 && Array.from({ length: k - 2 }, (_, i) => i + 2).every((d) => k % d !== 0)
  if (/\bprime\b/.test(s)) {
    for (let f = 0; f < n; f++) if (isPrime(label(f))) add(f)
    s = s.replace(/\bprime\b/g, ' ')
  }
  const mult = s.match(/\bmultiple of (\d+)\b/)
  if (mult) {
    for (let f = 0; f < n; f++) if (label(f) % Number(mult[1]) === 0) add(f)
    s = s.replace(mult[0], ' ')
  }
  if (lex.labels && /\bweek(?:end|day)\b/.test(s)) {
    const end = /\bweekend\b/.test(s)
    lex.labels.forEach((l, f) => {
      const weekend = l === 'Saturday' || l === 'Sunday'
      if (end ? weekend : !weekend) add(f)
    })
    s = s.replace(/\bweek(?:end|day)\b/g, ' ')
  }
  // "second from one of the ends": that seat counted from either end
  // "on the penultimate day", "in the middle of the week"
  if (/\b(?:penultimate|second last|second to last)\b/.test(s)) {
    if (n < 2) return 'bad'
    add(n - 2)
    s = s.replace(/\b(?:penultimate|second last|second to last)\b/g, ' ')
  }
  if (/\bmiddle\b/.test(s) && !lex.square) {
    add(Math.floor((n - 1) / 2))
    add(Math.ceil((n - 1) / 2))
    s = s.replace(/\bmiddle\b/g, ' ')
  }
  const fromEnds = s.match(/#?(\d+)\s*(?:seat|place|position)?\s+from\s+(?:one of|both|either of)\s+(?:the\s+)?(?:two\s+)?ends\b/)
  if (fromEnds) {
    const k = Number(fromEnds[1])
    if (k < 1 || k > n) return 'bad'
    add(k - 1)
    add(n - k)
    s = s.replace(fromEnds[0], ' ')
  }
  const fromEnd = s.match(/#?(\d+)\s*(?:floor|seat|place|position|month|day)?\s+from\s+the\s+(?:extreme\s+)?(top|bottom|left|right|end|last|first)/)
  if (fromEnd) {
    const k = Number(fromEnd[1])
    const idx = fromEnd[2] === 'top' || fromEnd[2] === 'right' || fromEnd[2] === 'last' ? n - k : k - 1
    if (idx < 0 || idx >= n) return 'bad'
    add(idx)
    s = s.replace(fromEnd[0], ' ')
  }
  if (lex.axis === 'floor') {
    if (/\b(?:topmost|top|highest|uppermost)\b/.test(s)) add(n - 1)
    if (/\b(?:lowest|lowermost|bottom|bottommost|ground)\b/.test(s)) add(0)
  } else if (lex.axis === 'order') {
    if (/\b(?:last|latest|final)\b/.test(s)) add(n - 1)
    if (/\b(?:earliest|first)\b/.test(s)) {
      add(0)
      s = s.replace(/#1\b/g, ' ') // "first" already counted as position 1
    }
  } else {
    if (/\b(?:leftmost|left end|left most)\b/.test(s)) add(0)
    if (/\b(?:rightmost|right end|right most)\b/.test(s)) add(n - 1)
    if (/\b(?:either end|both ends|one of the ends|extreme ends?|any end|one end|an end|the ends)\b/.test(s)) {
      add(0)
      add(n - 1)
    }
  }
  for (const num of s.matchAll(/#?(\d+)/g)) {
    const idx = label2idx(Number(num[1]))
    if (idx < 0 || idx >= n) return 'bad'
    add(idx)
  }
  const par = s.match(/\b(odd|even)\b/)
  if (par) {
    for (let f = 0; f < n; f++) {
      const label = lex.topDown ? n - f : f + 1
      if (label % 2 === (par[1] === 'odd' ? 1 : 0)) add(f)
    }
  }
  return any ? [...set].sort((a, b) => a - b) : null
}

/** a clause that must read as exactly one position clue (no links, no conjunctions) so it can sit inside "if … then …" */
function single(s: string, ments: Term[], lex: Lexicon): Atom | null {
  const atoms = interpretClause(s.trim(), ments, lex)
  return atoms && atoms.length === 1 ? atoms[0] : null
}

/**
 * "If x then y", "Either x or y, but not both", "Either x or y", "Neither x nor y <relation>":
 * each half is an ordinary clause over the same mentions.
 */
function compoundClause(s: string, ments: Term[], lex: Lexicon): Atom[] | null {
  let m = s.match(/^if (.+?) then (.+)$/)
  if (m) {
    const a = single(m[1], ments, lex)
    const b = single(m[2], ments, lex)
    return a && b ? [{ t: 'logic', op: 'imp', a, b }] : null
  }
  m = s.match(/^either (.+?)(?: but not both)?$/)
  if (m) {
    const exclusive = / but not both$/.test(s)
    const body = m[1]
    // the "or" that separates the two statements is the one where both sides read as clauses on their own
    const pieces = body.split(/\s+or\s+/)
    const cuts = Array.from({ length: Math.max(0, pieces.length - 1) }, (_, i) => i + 1)
    // an "or" that starts a new statement (next word is a person or value) is the real separator; try those first
    cuts.sort((x, y) => Number(/^@\d/.test(pieces[y])) - Number(/^@\d/.test(pieces[x])) || x - y)
    for (const cut of cuts) {
      const left = pieces.slice(0, cut).join(' or ')
      const right = pieces.slice(cut).join(' or ')
      // "… at either the top or the bottom of its stack or …": an "either" with its own "or" still to come must not be cut in half
      if (/\beither\b/.test(left) && !/\bor\b/.test(left)) continue
      const a = single(left, ments, lex)
      const b = single(right, ments, lex)
      if (a && b) return [{ t: 'logic', op: exclusive ? 'xor' : 'or', a, b }]
    }
    return null
  }
  // "O neither stands opposite C nor F": one subject, the same relation denied of two others
  m = s.match(/^(@\d+) neither ((?:[a-z]+ ){0,3}?(?:opposite|faces?|next to|adjacent to|beside|left of|right of|above|below|in the same row as)) (@\d+) nor (@\d+)$/)
  if (m) {
    const parts = [m[3], m[4]].map((w) => single(`${m![1]} not ${m![2]} ${w}`, ments, lex))
    return parts.every(Boolean) ? (parts as Atom[]) : null
  }
  // "Neither x nor y is next to z": the same statement denied of both, i.e. two "not" clauses
  m = s.match(/^neither ((?:@\d+\s+)+)nor (@\d+) (.+)$/)
  if (m) {
    const who = [...(m[1].match(/@\d+/g) ?? []), m[2]]
    const parts = who.map((w) => single(`${w} not ${m![3]}`, ments, lex))
    return parts.every(Boolean) ? (parts as Atom[]) : null
  }
  return null
}

function parseClueText(sentence: string, lex: Lexicon): Atom[] | null {
  const { text, ments } = extract(sentence.replace(/[.]+$/, ''), lex)
  if (ments.length === 0) {
    // "No bike is purchased on the day in the middle of the week": nobody has that day
    if (lex.daySlots || lex.birth?.slotMode) {
      const s0 = norm(text, [], lex.axis, lex.mirror)
      const cells = /\bno\b/.test(s0) && !/\bnot\b/.test(s0) ? positionSet(s0, lex) : null
      if (cells && cells !== 'bad' && cells.length) return lex.people.map((_, i) => ({ t: 'set', x: { k: 'p', i }, fs: cells, neg: true, ...onSlot(lex) }) as Atom)
    }
    return null
  }
  const atoms: Atom[] = []
  // "A, who is from Kolkata, lives on …" → a link plus the rest
  const rest = text.replace(
    new RegExp(`${ENT}\\s*,?\\s*(?:who|which|that)\\s+((?:[a-z']+\\s+){1,6}?)(?:(?:a|an|the)\\s+)?${ENT}(?:\\s+(?:old|per\\s+(?:month|year|annum)))?\\s*,?(?=\\s|$)`, 'gi'),
    (m0: string, a: string, mid: string, b: string) => {
      const x = ments[Number(a)]
      const y = ments[Number(b)]
      if (!isVar(x) || !isVar(y)) return m0
      const cx = x.k === 'p' ? -1 : x.k === 'v' ? x.c : -2
      const cy = y.k === 'p' ? -1 : y.k === 'v' ? y.c : -2
      // only "who is from Kolkata" / "who likes Fig" / "who does not like Apple": a relation ("who lives above B") is a clause of its own
      if (cx === cy || /\b(?:above|below|left|right|before|after|between|next|adjacent|neighbou?rs?|opposite|than|beside|faces?|facing|floors?|seats?|places?)\b/i.test(mid)) return m0
      atoms.push({ t: 'link', x, y, neg: /\b(?:not|never)\b|n't/i.test(mid) ? true : undefined })
      return `@${a} `
    },
  )
  const s = norm(rest, ments, lex.dirCat === undefined ? lex.axis : undefined, lex.mirror)
  if (s) {
    // "D was not born immediately before B, who was born in April": a second statement about the person just named
    const who = s.match(/^(.+@(\d+))\s+who\s+(.+)$/)
    if (who) {
      const a1 = interpretClause(who[1], ments, lex)
      const a2 = interpretClause(`@${who[2]} ${who[3]}`, ments, lex)
      if (a1 && a2) return [...atoms, ...a1, ...a2]
    }
    // "Kiwi sits at one end immediate left of M": a position and a relation, both about the same person
    const endRel = s.match(/^(@\d+)\s+(?:[a-z]+\s+){0,3}?at\s+(?:one|any|an|either)\s+end\s+(.+)$/)
    if (endRel) {
      const a1 = interpretClause(`${endRel[1]} at one end`, ments, lex)
      const a2 = interpretClause(`${endRel[1]} ${endRel[2]}`, ments, lex)
      if (a1 && a2) return [...atoms, ...a1, ...a2]
    }
    const compound = compoundClause(s, ments, lex)
    if (compound) return [...atoms, ...compound]
    // "E lives in flat A but not on floor number 1": the second half borrows the subject of the first
    const but = s.split(/\s+(?:but|whereas|while)\s+/)
    if (but.length === 2 && !/^not both\b/.test(but[1])) {
      const subject = but[0].match(/@\d+/)?.[0]
      const a1 = interpretClause(but[0], ments, lex)
      const a2 = subject || /^@\d+/.test(but[1]) ? interpretClause(/^@\d+/.test(but[1]) ? but[1] : `${subject} ${but[1]}`, ments, lex) : null
      if (a1 && a2) return [...atoms, ...a1, ...a2]
    }
    // "A lives immediately below B and is from Delhi": the second half starts with a verb, so it is a second statement about A
    const verbSplit = s.split(/\s+and\s+(?=(?:is|are|lives?|stays?|sits?|stands?|likes?|has|have|works?|comes?|belongs?|placed|kept|situated|located|immediately|below|above|somewhere|next|adjacent|between|not|in|on|at|to|(?:more|less|fewer) than|at (?:least|most)|(?:exactly|only) \d+)\b)/)
    if (verbSplit.length === 2) {
      const subject = verbSplit[0].match(/@\d+/)?.[0]
      const a1 = interpretClause(verbSplit[0], ments, lex)
      const a2 = subject ? interpretClause(`${subject} ${verbSplit[1]}`, ments, lex) : null
      if (a1 && a2) return [...atoms, ...a1, ...a2]
    }
    const whole = interpretClause(s, ments, lex)
    if (whole) return [...atoms, ...whole]
    // two statements joined by "and": split where both halves read on their own (the second may borrow the first subject)
    const parts = s.split(/\s+and\s+|\s*;\s*/)
    for (let cut = 1; cut < parts.length; cut++) {
      const left = parts.slice(0, cut).join(' and ')
      let right = parts.slice(cut).join(' and ')
      const subject = left.match(/@\d+/)?.[0]
      if (!/^@\d+/.test(right) && subject) right = `${subject} ${right}`
      const a1 = interpretClause(left, ments, lex)
      const a2 = interpretClause(right, ments, lex)
      if (a1 && a2) return [...atoms, ...a1, ...a2]
    }
    return null
  }
  return atoms.length ? atoms : null
}

// ─── ordered, named positions (months, weekdays) ─────────────────────────────

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const ORDER_KINDS = [
  { names: MONTHS, unit: 'month', on: 'in' },
  { names: DAYS, unit: 'day', on: 'on' },
]

interface OrderInfo {
  labels?: string[] // undefined = ordered but unnamed ("first month", "third month" still work)
  unit: string
  on: string
}

/** "from May to December", "Monday to Friday" (wrapping round the year / week is allowed) */
/** "birthdays in January, April, May and September on two different dates, 11th and 16th": months × dates slots in calendar order */
function birthdayGrid(header: string, n: number): { labels: string[]; months: string[]; dates: number[]; slots: number } | null {
  const monthRe = new RegExp(`\\b(${MONTHS.join('|')})\\b`, 'gi')
  const months = [...new Set([...header.matchAll(monthRe)].map((m) => MONTHS.find((x) => x.toLowerCase() === m[1].toLowerCase()) as string))].sort((a, b) => MONTHS.indexOf(a) - MONTHS.indexOf(b))
  const dates = [...new Set([...header.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)\b/g)].map((m) => Number(m[1])))].sort((a, b) => a - b)
  const slots = months.length * dates.length
  // as many people as dates, or fewer when the text is about dates (the spare ones stay vacant)
  if (slots === n ? months.length < 2 || dates.length < 2 : months.length < 1 || dates.length < 1 || slots < n || slots > 16 || !/\b(?:dates?|days?)\b/i.test(header)) return null
  return { labels: months.flatMap((mo) => dates.map((d) => `${mo} ${d}`)), months, dates, slots }
}

/** the seven days of a week, from the day the text starts it with (Monday by default) — when the text is about a week */
function weekLabels(text: string): string[] | null {
  if (!/\b(?:in|within|during|over|of)\s+(?:a|the|one)\s+week\b/i.test(text)) return null
  const start = text.match(/\b(?:start(?:s|ed|ing)?|begin(?:s|ning)?)\s+(?:from|on|with)?\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i)
  const a = start ? DAYS.findIndex((d) => d.toLowerCase() === start[1].toLowerCase()) : 0
  return Array.from({ length: 7 }, (_, k) => DAYS[(a + k) % 7])
}

/** "buy seven bikes in a week … The week is starting from Monday": seven people on the seven days of a week */
function orderFromWeek(text: string, n: number): OrderInfo | null {
  if (n !== 7 || !/\b(?:in|within|during|over|of)\s+(?:a|the|one)\s+week\b/i.test(text)) return null
  const start = text.match(/\b(?:start(?:s|ed|ing)?|begin(?:s|ning)?)\s+(?:from|on|with)?\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i)
  const a = start ? DAYS.findIndex((d) => d.toLowerCase() === start[1].toLowerCase()) : 0
  return { labels: Array.from({ length: 7 }, (_, k) => DAYS[(a + k) % 7]), unit: 'day', on: 'on' }
}

function orderFromRange(text: string, n: number): OrderInfo | { error: string } | null {
  for (const kind of ORDER_KINDS) {
    const alt = kind.names.join('|')
    const m = text.match(new RegExp(`\\b(${alt})\\b\\s*(?:to|-|through|till|until)\\s*\\b(${alt})\\b`, 'i'))
    if (!m) continue
    const idx = (w: string) => kind.names.findIndex((x) => x.toLowerCase() === w.toLowerCase())
    const a = idx(m[1])
    const b = idx(m[2])
    const len = ((b - a + kind.names.length) % kind.names.length) + 1
    if (len !== n) return { error: `${kind.names[a]} to ${kind.names[b]} is ${len} ${kind.unit}s, but there are ${n} people — they must match.` }
    return { labels: Array.from({ length: n }, (_, k) => kind.names[(a + k) % kind.names.length]), unit: kind.unit, on: kind.on }
  }
  return null
}

/** a category whose values are all month / weekday names is really the order of the positions */
function orderFromList(values: string[]): OrderInfo | null {
  for (const kind of ORDER_KINDS) {
    const canon = values.map((v) => kind.names.find((x) => x.toLowerCase() === v.toLowerCase()))
    if (canon.every(Boolean)) return { labels: canon as string[], unit: kind.unit, on: kind.on }
  }
  return null
}

/** statements that only restate the setup ("Each person was born in one month only.") — nothing to solve, so nothing to warn about */
const isFiller = (s: string): boolean =>
  /^each corner\b/i.test(s) || /^the base year\b/i.test(s) || /\bon which no (?:one|person|candidate|friend)\b/i.test(s) || /^only one (?:person|friend|candidate|student)\b[^.]*\b(?:given|each|one) day\b/i.test(s) || /^(?:they|all of them|each of them)\b[^.]*\b\d+(?:st|nd|rd|th)\b[^.]*\b(?:each|every) month\b/i.test(s) || /^the week (?:is )?(?:start|begin)/i.test(s) || /^(?:all of them|everyone|everybody|each of them|they all)\s+(?:are\s+)?fac(?:e|es|ing)\b/i.test(s) || /^(?:one|two|three|four|only|exactly|no|any)\b[^.]*\b(?:dates?|days?)\b[^.]*\b(?:vacant|empty|free|unoccupied)\b/i.test(s) || /^(?:each|every)\s+(?:day|date)\b[^.]*\bonly one\b/i.test(s) || /^the distance between\b/i.test(s) || /^the (?:persons?|people),? who (?:sit|sits|are sitting) at the (?:side|corner)s?\b/i.test(s) || /^\w+\s+(?:people|persons)\s+(?:are\s+)?sitting\s+at\s+the\s+corners\b/i.test(s) || /^no seat is\b/i.test(s) || /^(?:the\s+)?(?:people|persons)\s+(?:sitting|seated)\s+(?:at|on)\s+the\s+corners\b/i.test(s) ||
  /^some of them (?:are )?facing\b/i.test(s) || /^each of them (?:likes?|has|have|owns?|plays?|drinks?|eats?|prefers?)\s+(?:one|a|an)\s+[a-z]+\s*\.?$/i.test(s) ||
  /^(?:not more than|at most|only) one (?:person|box|friend|student)\b[^.]*\bsame\b/i.test(s) || /^(?:each|every)\s+(?:person|one|of them|friend|student)\b[^.]*\b(?:only|exactly one)\b/i.test(s) || /^no\s+two\b/i.test(s) || /\bwith respect to\b[^.]*\bfacing\b/i.test(s) || /^\(?\s*left and right\b/i.test(s) || /^\(?\s*(?:the\s+)?(?:bottommost|lowermost|lowest|ground|topmost|position 1)\b[^.]*\b(?:numbered|is the bottom)\b/i.test(s)

/** sentences that only describe how the building is laid out ("Flat A is to the west of Flat B", "All the flats are of same size") */
const isGridFiller = (s: string): boolean =>
  /^each floor\b/i.test(s) || /^(?:all\s+(?:the\s+)?)?flats?\b[^.]*\b(?:same size|west|east)\b/i.test(s) || /^flat\s+[A-Z]\b[^.]*\bfloor\b/i.test(s) || /similarly in case of/i.test(s)

/** sentences that only describe the two-row layout ("… sitting in two parallel rows …", "The persons of row 1 face south …") */
const ROW_INTRO = /\b(?:two|2)\s+(?:parallel\s+)?rows\b|\bparallel\s+rows\b|\b(?:face|faces|facing)\s+each\s+other\b|\b(?:persons|people)\s+of\s+row\b/i

const NUMW: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

/** "a four storeyed building … Each floor has 2 flats, Flat A and Flat B … Flat A is to the west of Flat B" */
function buildingFromText(text: string, n: number): { rows: number; cols: number; flats: string[] } | { error: string } | null {
  if (!(/\bstorey(?:ed)?\b|\bstoried\b/i.test(text) && /\bflats?\b/i.test(text) && /\beach\s+floor\s+(?:has|have|contains)\b/i.test(text))) return null
  const num = (w: string) => NUMW[w.toLowerCase()] ?? Number(w)
  const st = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)[\s-]+(?:storey(?:ed)?|storied)\b/i) ?? text.match(/top floor[^.]*?numbered\s*(?:as\s*)?()(\d+)/i)
  const fl = text.match(/\beach\s+floor\s+(?:has|have|contains)\s+(one|two|three|four|five|\d+)\s+flats?\b/i)
  const rows = st ? num(st[2] && st[1] === '' ? st[2] : st[1]) : 0
  const cols = fl ? num(fl[1]) : 0
  if (!rows || !cols) return { error: 'I could not tell how many floors the building has and how many flats are on each floor.' }
  if (rows * cols !== n) return { error: `${rows} floors with ${cols} flats each is ${rows * cols} flats, but there are ${n} people — every flat must be occupied.` }
  const sentence = text.split(/(?<=[.])\s+/).find((x) => /\beach\s+floor\b/i.test(x)) ?? ''
  const letters: string[] = []
  for (const m of sentence.matchAll(/\bflats?\s+([A-Z])\b/g)) if (!letters.includes(m[1])) letters.push(m[1])
  for (let c = letters.length; c < cols; c++) letters.push(String.fromCharCode(65 + c))
  const flats = letters.slice(0, cols)
  // which letter is the westmost: "Flat A is to the west of Flat B" (default: the letters run west → east)
  const dir = text.match(/\bflat\s+([A-Z])\s+is\s+(?:to\s+the\s+)?(west|east)\s+of\s+flat\s+([A-Z])\b/i)
  if (dir && cols === 2) {
    const [a, , b] = [dir[1].toUpperCase(), dir[2], dir[3].toUpperCase()]
    const westFirst = dir[2].toLowerCase() === 'west' ? a : b
    const eastLast = westFirst === a ? b : a
    if (flats.includes(westFirst) && flats.includes(eastLast)) return { rows, cols, flats: [westFirst, eastLast] }
  }
  return { rows, cols, flats }
}

/**
 * "Eight friends are sitting in a line … I sits to the left of L …": when no list of people is given, take them from the single
 * capital letters the clues use — provided there are exactly as many as the text says.
 */
function inferPeople(sentences: string[]): { people: string[]; k: number } | null {
  const k = sentences.findIndex((x) => /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:different\s+)?(?:persons?|people|friends|students|members|boys|girls|colleagues|employees|candidates|players|participants|children|kids|workers|teachers|managers|officers|employees)\b/i.test(x))
  if (k < 0) return null
  const m = sentences[k].match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:different\s+)?(?:persons?|people|friends|students|members|boys|girls|colleagues|employees|candidates|players|participants|children|kids|workers|teachers|managers|officers|employees)\b/i) as RegExpMatchArray
  const said = NUM[m[1].toLowerCase()] ?? Number(m[1])
  const letters = new Set<string>()
  sentences.forEach((x, i) => {
    if (i === k || isBoilerplate(x)) return
    for (const l of x.matchAll(/(?<![A-Za-z0-9'])([A-Z])(?![A-Za-z0-9'])/g)) letters.add(l[1])
  })
  if (letters.size === said) return { people: [...letters].sort(), k }
  // names of two letters such as Aa, Ab, Cc (never the common two-letter words)
  const COMMON = new Set(['An', 'As', 'At', 'Be', 'By', 'Do', 'He', 'If', 'In', 'Is', 'It', 'My', 'No', 'Of', 'On', 'Or', 'So', 'To', 'Up', 'Us', 'We', 'Am', 'Go', 'Me', 'Oh', 'Ok', 'Hi'])
  const pairs = new Set<string>()
  sentences.forEach((x, i) => {
    if (i === k || isBoilerplate(x)) return
    for (const l of x.matchAll(/(?<![A-Za-z0-9'])([A-Z][a-z])(?![A-Za-z0-9'])/g)) if (!COMMON.has(l[1])) pairs.add(l[1])
  })
  return pairs.size === said ? { people: [...pairs].sort(), k } : null
}

/** the values of a category the text names only through the clues ("… the one who likes Kiwi …") */
function inferValues(sentences: string[], people: string[]): string[] {
  const out: string[] = []
  for (const x of sentences) {
    if (isBoilerplate(x)) continue
    for (const m of x.matchAll(/\b(?:likes?|prefers?|owns?|plays?|drinks?|eats?|has|have)\s+(?:the\s+)?([A-Z][a-z]{2,})\b/g)) if (!out.includes(m[1]) && !people.includes(m[1])) out.push(m[1])
  }
  return out
}

// ─── entry point ─────────────────────────────────────────────────────────────

export function parsePuzzle(raw: string): ParseResult {
  const result: ParseResult = { puzzle: null, summary: null, errors: [], warnings: [], unparsed: [], questions: [] }
  const text = normalizeText(raw).trim()
  if (!text) {
    result.errors.push('Paste the puzzle text (or add a screenshot) to begin.')
    return result
  }
  const sentences = splitSentences(text)

  // two facing rows: each row's members may be listed ("In Row 1 - A, B, C …"); otherwise one list is given and the clues say who sits where
  const tworow = /\b(?:two|2)\s+(?:parallel\s+)?rows\b|\bparallel\s+rows\b/i.test(text)
  const rowSentence = new Map<number, number>() // sentence index → the row (0 or 1) whose members it lists
  const rowPeople: string[][] = [[], []]
  let people: string[] = []
  let headerIdx = -1
  let header = ''
  if (tworow) {
    const found: { k: number; r: number; names: string[] }[] = []
    sentences.forEach((s, k) => {
      if (isBoilerplate(s) || isQuestion(s)) return
      const marks = s.match(/\brow\s*-?\s*(?:1|2|one|two)\b/gi) ?? []
      const rm = s.match(/\brow\s*-?\s*(1|2|one|two)\b/i)
      const nl = s.match(NAME_LIST)
      if (marks.length !== 1 || !rm || !nl) return
      const names = parseNames(nl[1])
      if (names.length < 3 || new Set(names).size !== names.length) return
      found.push({ k, r: /^(?:1|one)$/i.test(rm[1]) ? 0 : 1, names })
    })
    const r1 = found.find((f) => f.r === 0)
    const r2 = found.find((f) => f.r === 1)
    if (r1 && r2 && r1.names.length === r2.names.length && new Set([...r1.names, ...r2.names]).size === r1.names.length * 2) {
      rowPeople[0] = r1.names
      rowPeople[1] = r2.names
      rowSentence.set(r1.k, 0)
      rowSentence.set(r2.k, 1)
      people = [...r1.names, ...r2.names]
      headerIdx = Math.min(r1.k, r2.k)
      header = sentences.slice(0, Math.max(r1.k, r2.k) + 1).join(' ')
    }
  }
  for (let k = 0; k < sentences.length && people.length === 0; k++) {
    if (isBoilerplate(sentences[k]) || isQuestion(sentences[k])) continue
    const m = sentences[k].match(NAME_LIST)
    if (m) {
      const names = parseNames(m[1])
      // a list of months or weekdays is the setting, not the people
      if (names.length >= 3 && new Set(names).size === names.length && !names.every((nm) => MONTHS.includes(nm) || DAYS.includes(nm))) {
        people = names
        headerIdx = k
        break
      }
    }
  }
  if (people.length === 0 && !tworow) {
    const inf = inferPeople(sentences)
    if (inf) {
      people = inf.people
      headerIdx = inf.k
      result.warnings.push(`The text does not list the people, so I took them from the clues: ${people.join(', ')}.`)
    }
  }
  if (people.length === 0) {
    result.errors.push('I could not find the list of people (for example "Eight persons - A, B, C, D, E, F, G, H - live on …").')
    return result
  }
  const n = people.length
  if (n > MAX_N) {
    result.errors.push(`Up to ${MAX_N} people are supported (found ${n}).`)
    return result
  }
  if (!header) header = sentences[headerIdx]
  if (tworow && n % 2 !== 0) {
    result.errors.push(`Two facing rows must hold the same number of people, but ${n} people are listed.`)
    return result
  }

  // boxes in a vertical stack: the people are boxes and a position is a "place"; several stacks side by side are a different layout
  const boxes = /\bboxes\b/i.test(header)
  if (boxes && /\bstacks\b/i.test(text)) {
    result.errors.push('Boxes in several stacks side by side are not supported yet — only one stack, with the boxes kept one above the other.')
    return result
  }

  // a building with several flats on each floor
  const building = buildingFromText(text, n)
  if (building && 'error' in building) {
    result.errors.push(building.error)
    return result
  }


  // count words in the header must agree with the list
  const countWord = header.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:different\s+)?(?:persons?|people|friends|students|members|boys|girls|colleagues|employees|candidates|players|participants|children|kids|workers|teachers|managers|officers|employees|boxes)\b/i)
  if (countWord) {
    const said = NUM[countWord[1].toLowerCase()] ?? Number(countWord[1])
    if (said !== n) result.warnings.push(`The text says ${said} people but ${n} names are listed — using the ${n} names.`)
  }
  const bday = birthdayGrid(sentences.slice(headerIdx, headerIdx + 3).join(' '), n)
  // fewer people than the seven days of a week: some day stays vacant
  const weekSlots = !bday && n >= 2 && n < 7 ? weekLabels(text) : null
  const floorCount = building || bday ? null : header.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:different\s+)?(floors|storeys|seats|positions|months|days|weeks|years)\b/i)
  if (floorCount) {
    const said = NUM[floorCount[1].toLowerCase()] ?? Number(floorCount[1])
    if (said !== n) {
      result.errors.push(`${n} people for ${said} ${floorCount[2].toLowerCase()} is not supported yet — the number of people must equal the number of ${floorCount[2].toLowerCase()}.`)
      return result
    }
  }

  // a circular table: everyone faces the same way, so "right" is always the next seat along
  // a table with corners and sides: one person on every corner and on the middle of every side ("a pentagon shaped table")
  const SHAPES: Record<string, { corners: number; name: string }> = {
    triangular: { corners: 3, name: 'triangular' },
    triangle: { corners: 3, name: 'triangular' },
    square: { corners: 4, name: 'square' },
    pentagon: { corners: 5, name: 'pentagon-shaped' },
    pentagonal: { corners: 5, name: 'pentagon-shaped' },
    hexagon: { corners: 6, name: 'hexagonal' },
    hexagonal: { corners: 6, name: 'hexagonal' },
  }
  const shapeM = text.match(/\b(triangular|triangle|square|pentagonal|pentagon|hexagonal|hexagon)(?:[\s-]+shaped)?\s+table\b/i)
  const shape = shapeM ? SHAPES[shapeM[1].toLowerCase()] : null
  const square = !!shape
  const circle = /\b(?:circular|round)\s+table\b/i.test(text) || square
  if (/\brectangular\s+table\b/i.test(text)) {
    result.errors.push('Only circular tables and tables with equal sides (square, pentagon, hexagon) are supported so far, not rectangular ones.')
    return result
  }
  if (shape && n !== shape.corners * 2) {
    result.errors.push(`A ${shape.name} table is read as ${shape.corners} corners and ${shape.corners} side seats (${shape.corners * 2} people); ${n} people are listed.`)
    return result
  }
  // which way the people at the corners face (the people on the sides face the other way)
  const cornerFacing = text.match(/\bcorners?\b[^.]*?\bfac(?:e|es|ing)\s+(?:the\s+)?(inside|outside|centre|center|away)/i)
  const cornersIn = !!cornerFacing && /inside|centre|center/i.test(cornerFacing[1])
  let facing: 'in' | 'out' | undefined
  if (circle && !square) {
    const out = /\bfacing\s+(?:the\s+)?(?:outside|outwards?|away)\b|\bfacing\s+away\b/i.test(text)
    const inn = /\bfacing\s+(?:the\s+)?(?:inside|inwards?|centre|center)\b|\bfacing\s+towards\b/i.test(text)
    if ((out && inn) || /\b(?:some|few|half|four|three|two|one)\s+of\s+them\s+(?:are\s+)?facing\b/i.test(text)) {
      result.errors.push('A table where some people face the centre and others face outside is not supported yet — everyone must face the same way.')
      return result
    }
    facing = out ? 'out' : 'in'
  }

  // named order (months, weekdays) from a range in the header: "from May to December"
  let order: OrderInfo | null = null
  if (bday) order = bday.slots === n ? { labels: bday.labels, unit: 'date', on: 'on' } : { unit: 'place', on: 'in' }
  else if (weekSlots) order = { unit: 'place', on: 'in' }
  const range = bday || weekSlots ? null : (orderFromRange(header, n) ?? orderFromRange(text, n) ?? orderFromWeek(text, n))
  if (range && 'error' in range) {
    result.errors.push(range.error)
    return result
  }
  if (!bday && !weekSlots) order = range

  // axis and numbering direction
  const lower = text.toLowerCase()
  const floorScore = (lower.match(/floor|storey|building|above|below|topmost|lowest/g) ?? []).length
  const rowScore = (lower.match(/\brow\b|\bline\b|\bleft\b|\bright\b|\bseat|\bqueue\b|\bbench\b/g) ?? []).length
  // some people face north and some south: left / right then depend on who faces which way
  const mixedLine = !circle && !tworow ? text.match(/\bsome\b[^.]*?\bfacing\s+(north|south|east|west)\b[^.]*?\bsome\b[^.]*?\bfacing\s+(north|south|east|west)\b/i) : null
  if (mixedLine && !(new Set([mixedLine[1].toLowerCase(), mixedLine[2].toLowerCase()]).size === 2 && /north/i.test(mixedLine[0]) && /south/i.test(mixedLine[0]))) {
    result.errors.push('Only people facing north or south are supported (not east or west).')
    return result
  }
  let axisGuess: Axis = rowScore > floorScore || mixedLine ? 'row' : 'floor'
  const topDownText = /(?:topmost|top)\s+floor[^.]*?\bnumbered\s*(?:as\s*)?1\b/i.test(text) ||/numbered\s+(?:from|starting from|beginning from)\s+(?:the\s+)?top/i.test(text)

  // extra categories
  let numbered = null as { noun: string } | null // set while reading the category sentences
  let yearValues = null as number[] | null // birth years when the positions are years
  const cats: Category[] = []
  const used = new Set<number>([headerIdx])
  // "Seven persons A, B … live in different cities among Agra, Bhopal, …": the people and the first category share one sentence
  const headCat = tworow ? null : parseCategorySentence(sentences[headerIdx])
  const headYears = headCat && headCat.values.length === n ? yearOrder(headCat) : null
  if (headYears) {
    order = { labels: headYears.labels, unit: 'year', on: 'in' }
    yearValues = headYears.values
  } else if (headCat && headCat.values.length === n && new Set(headCat.values.map((v) => v.toLowerCase())).size === n && !orderFromList(headCat.values)) cats.push({ name: headCat.name, values: headCat.values })
  sentences.forEach((s, k) => {
    if (k === headerIdx || isBoilerplate(s) || isQuestion(s)) return
    const cs = parseCategorySentence(s)
    if (!cs) {
      const rr = parseRankRange(s, n)
      if (rr) {
        used.add(k)
        if ('error' in rr) result.errors.push(rr.error)
        else cats.push(rr)
      }
      return
    }
    used.add(k)
    if (cs.values.length !== n) {
      result.errors.push(`"${cs.name}" lists ${cs.values.length} values but there are ${n} people — they must match.`)
      return
    }
    if (new Set(cs.values.map((v) => v.toLowerCase())).size !== n) {
      result.errors.push(`The ${cs.name} values must all be different.`)
      return
    }
    const nm = !order && !numbered ? numberedFromList(cs.values, n, cs.name) : null
    if (nm) {
      numbered = nm // "eight different classes i.e. class 1 … class 8": the positions, numbered from the lowest
      axisGuess = 'floor'
      return
    }
    const yrs = !order ? yearOrder(cs) : null
    if (yrs) {
      order = { labels: yrs.labels, unit: 'year', on: 'in' }
      yearValues = yrs.values
      return
    }
    const asOrder = !order ? orderFromList(cs.values) : null
    if (asOrder) {
      order = asOrder // "different month - January, February, ..." names the positions, it is not an attribute
      return
    }
    cats.push({ name: cs.name, values: cs.values })
  })
  // "Each of them like one fruit." with the fruits never listed: they are the values the clues mention
  const own = sentences.findIndex((x, k) => !used.has(k) && /^each of them (?:likes?|has|have|owns?|plays?|drinks?|eats?|prefers?)\s+(?:one|a|an)\s+[a-z]+\s*\.?$/i.test(x))
  if (own >= 0) {
    const name = (sentences[own].match(/\s([a-z]+)\s*\.?$/i) as RegExpMatchArray)[1].toLowerCase()
    const vals = inferValues(sentences, people)
    if (vals.length === n) {
      cats.push({ name, values: vals })
      used.add(own)
      result.warnings.push(`The ${name}s are not listed, so I took them from the clues: ${vals.join(', ')}.`)
    } else result.warnings.push(`I found ${vals.length} ${name}s in the clues (${vals.join(', ')}) but there are ${n} people, so the ${name} clues cannot be read.`)
  }
  let dirCat: number | undefined
  if (mixedLine && !result.errors.length) {
    cats.push({ name: 'direction', values: ['north', 'south'] })
    dirCat = cats.length - 1
    result.warnings.push('Some people face north and some south: "left" and "right" are taken as seen by the person the clue is about (the one named after "of"), and seats are counted from the west end.')
  }
  if (result.errors.length) return result
  // no seating, floors or order anywhere ("live in different cities … like different bikes"): the first attribute stands in for the positions
  const arranged = /\b(?:floors?|storeys?|rows?|line|queue|seats?|table|left|right|above|below|before|after|north|south|east|west|corners?|stacks?|bench|topmost|top|bottom|lowest|highest|adjacent|between|opposite|neighbou?rs?|born|months?|days?|weeks?|ranks?)\b/i.test(text)
  let unordered = false
  if (!arranged && cats.length >= 2 && !order && !circle && !tworow && !building && !bday && dirCat === undefined) {
    const first = cats.shift() as Category
    order = { labels: first.values, unit: first.name, on: 'in' }
    unordered = true
    result.warnings.push(`There is no seating or order in this puzzle, so I matched the people with the ${first.name.replace(/y$/, 'ie')}s and the other attributes.`)
  }
  // "different months" with no names given: ordered positions that are only numbered
  if (!order) {
    const kw = header.match(/\b(?:different|distinct|separate)\s+(months|days|weeks|years)\b/i)
    if (kw) {
      order = { unit: singular(kw[1]), on: kw[1].toLowerCase() === 'days' ? 'on' : 'in' }
      result.warnings.push(`I could not tell which ${kw[1].toLowerCase()} (for example "from May to December"), so they are numbered 1 to ${n}; clues that name one will not be understood.`)
    }
  }
  // more dates than people: every person has one date, in date order, and some dates stay vacant
  let slotCat: number | undefined
  if (weekSlots && !result.errors.length) {
    cats.push({ name: 'day', values: weekSlots })
    slotCat = cats.length - 1
    result.warnings.push(`There are 7 days for ${n} people, so ${7 - n} day${7 - n === 1 ? '' : 's'} in the week stay${7 - n === 1 ? 's' : ''} vacant. The people are taken in the order of their days: "after", "before" and "between" persons count people, while "days after" and "days between" count days (the vacant one too).`)
  }
  if (bday && bday.slots > n && !result.errors.length) {
    cats.push({ name: 'date', values: bday.labels })
    slotCat = cats.length - 1
    result.warnings.push(`There are ${bday.slots} dates for ${n} people, so ${bday.slots - n} date${bday.slots - n === 1 ? ' stays' : 's stay'} vacant. The people are taken in date order: "after", "immediately after" and "between" count people, not empty dates.`)
  }
  // a row whose people all face south: their left is the east, so left / right are swapped relative to the picture
  const mirror = axisGuess === 'row' && !circle && !tworow && !building && !order && dirCat === undefined && slotCat === undefined && !unordered && /\b(?:all|everyone|everybody|each|every)\b[^.]*?\bfac(?:e|es|ing)\s+(?:towards?\s+)?(?:the\s+)?south\b/i.test(text)
  const axis: Axis = building ? 'grid' : circle ? 'circle' : tworow ? 'tworow' : order ? 'order' : axisGuess
  const rowLen = axis === 'tworow' ? n / 2 : undefined
  const topDown = axis === 'floor' && topDownText
  axisGuess = axis
  const allValues = cats.flatMap((c) => c.values.map((v) => v.toLowerCase()))
  if (new Set(allValues).size !== allValues.length) result.warnings.push('Some values appear in more than one category, which can confuse clue reading.')
  for (const v of allValues) if (people.some((p) => p.toLowerCase() === v)) result.warnings.push(`"${v}" is both a person and a value.`)

  const lex = buildLexicon(people, slotCat !== undefined ? cats.slice(0, -1) : cats, axis, topDown, order?.labels, building ? { cols: building.cols, flats: building.flats } : undefined, rowLen)
  lex.dirCat = dirCat
  const baseYear = text.match(/\bbase year\b[^.]*?\b(\d{4})\b/i)
  lex.values = yearValues ?? undefined
  lex.baseYear = baseYear ? Number(baseYear[1]) : undefined
  lex.daySlots = weekSlots ? { labels: weekSlots } : undefined
  lex.mirror = mirror
  lex.square = square
  lex.cornersIn = cornersIn
  if (bday) {
    lex.birth = { months: bday.months, dates: bday.dates, slotMode: slotCat !== undefined }
    lex.labels = undefined
    lex.posRe = null
  }
  const clues: Clue[] = []
  sentences.forEach((s, k) => {
    const listed = rowSentence.get(k)
    if (listed !== undefined && rowLen) {
      // "In Row 1 - A, B, C …": each person listed sits somewhere in that row
      const cells = Array.from({ length: rowLen }, (_, i) => listed * rowLen + i)
      clues.push({ id: clues.length + 1, text: s, atoms: rowPeople[listed].map((name) => ({ t: 'set', x: { k: 'p', i: people.indexOf(name) }, fs: cells }) as Atom) })
      return
    }
    if (axis === 'tworow' && ROW_INTRO.test(s)) return
    if (used.has(k) || isBoilerplate(s)) return
    if (isQuestion(s)) {
      result.questions.push(s)
      return
    }
    if (/^\(?[a-e]\)\s/i.test(s)) return // answer options
    if (isFiller(s) || (building && isGridFiller(s))) return
    const atoms = parseClueText(s, lex)
    if (atoms && atoms.length) clues.push({ id: clues.length + 1, text: s, atoms })
    else result.unparsed.push(s)
  })
  if (clues.length === 0) {
    result.errors.push('I could not read any clues from the text.')
    return result
  }
  const verbWord = header.match(/\b(?:were|are)\s+(?:getting\s+)?(born|seated|arranged|placed|ranked|appointed|promoted|admitted|selected|posted|scheduled|joined|divorced|married|engaged|interviewed|vaccinated|examined|tested|released|launched)\b/i)
  const lifeVerb = header.match(/\b(live|stay|work|study|reside)s?\b/i)
  const unorderedVerb = lifeVerb ? (lifeVerb[1].toLowerCase() === 'study' ? 'studies' : `${lifeVerb[1].toLowerCase()}s`) : undefined
  const extra = order ? { labels: order.labels, unit: order.unit, on: order.on, verb: slotCat !== undefined ? undefined : verbWord ? `was ${verbWord[1].toLowerCase()}` : bday ? 'was born' : unordered ? unorderedVerb : undefined, ...(bday ? { cols: bday.dates.length } : {}), ...(unordered ? { unordered: true } : {}), ...(weekSlots ? { slotUnit: 'day' } : {}) } : {}
  const stack = boxes && axis === 'floor' ? { noun: 'box', place: 'place' } : boxes ? { noun: 'box' } : {}
  result.summary = { people, axis, topDown, cats, labels: order?.labels, unit: order?.unit, facing, cols: building?.cols, flats: building?.flats, rowLen, hierarchy: numbered ? { unit: numbered.noun, up: /\bsenior\b/i.test(text) ? 'senior to' : `in a higher ${numbered.noun} than`, down: /\bjunior\b/i.test(text) ? 'junior to' : `in a lower ${numbered.noun} than` } : undefined, mirror: mirror || undefined, unordered: unordered || undefined, dates: slotCat !== undefined ? (bday ? bday.labels : weekSlots ?? undefined) : undefined, mixed: dirCat !== undefined || undefined, square: square || undefined, shape: shape?.name, cornersIn: square ? cornersIn : undefined, ...stack }
  result.puzzle = { n, axis, topDown, people, cats, clues, ...extra, ...(dirCat !== undefined ? { dirCat } : {}), ...(mirror ? { mirror: true } : {}), ...(yearValues ? { values: yearValues, ...(baseYear ? { baseYear: Number(baseYear[1]) } : {}) } : {}), ...(numbered ? { hierarchy: { unit: numbered.noun, up: /\bsenior\b/i.test(text) ? 'senior to' : `in a higher ${numbered.noun} than`, down: /\bjunior\b/i.test(text) ? 'junior to' : `in a lower ${numbered.noun} than` } } : {}), ...(slotCat !== undefined ? { slotCat } : {}), ...(circle ? { facing } : {}), ...(square ? { square: true, shape: shape?.name, cornersIn } : {}), ...(building ? { cols: building.cols, flats: building.flats } : {}), ...(rowLen ? { rowLen } : {}), ...stack }
  return result
}
