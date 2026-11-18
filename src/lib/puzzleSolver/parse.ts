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
const COUNT_NOUN = '(?:persons?|people|ones?|floors?|seats?|boxes|box|others?|friends?|students?|members?|boys?|girls?|men|women|individuals?)'
const ENT = '@(\\d+)'
const ARTICLE_NOUNS = new Set(['person', 'man', 'woman', 'boy', 'girl', 'friend', 'student', 'floor', 'seat', 'row', 'few', 'couple', 'number', 'different', 'certain', 'particular', 'lot', 'building', 'group', 'member', 'colleague', 'child'])

// ─── text clean-up and sentence splitting ────────────────────────────────────

function normalizeText(raw: string): string {
  return raw
    .replace(/\r/g, '')
    .replace(/[‐-―−]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
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
  if (s.endsWith('s') && !s.endsWith('ss')) return s.slice(0, -1)
  return s
}

interface CatSentence {
  name: string
  values: string[]
}

function parseCategorySentence(s: string): CatSentence | null {
  const m = s.match(/\bdifferent\s+([a-z][a-z' ]*?)\s*(?:-|:|\()\s*(.+)$/i)
  if (!m) return null
  let rest = m[2].replace(/\([^)]*\)/g, ' ').replace(/[.)]+\s*$/, '')
  rest = rest.replace(/\s+/g, ' ').trim()
  rest = rest.replace(/[,;]?\s*(?:but\s+)?not\s+(?:necessarily\s+)?in\s+the\s+same\s+order\.?\s*$/i, '').trim() // "… but not in the same order"
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
}

const isVar = (t: Term): t is VarTerm => t.k !== 'r'

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function buildLexicon(people: string[], cats: Category[], axis: Axis, topDown: boolean, labels?: string[], building?: { cols: number; flats: string[] }, rowLen?: number): Lexicon {
  const valueIndex = new Map<string, { c: number; i: number }>()
  const all: string[] = []
  cats.forEach((cat, c) =>
    cat.values.forEach((v, i) => {
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

function norm(t: string, ments?: Term[], axis?: Axis): string {
  let s = t.toLowerCase()
  s = s.replace(/\b(north|south)[\s-]*(east|west)\b/g, '$1$2')
  s = s.replace(/\bit is not (?:true|the case) that\b/g, ' not ')
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
  s = s.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b(?=\s+(?:floors?|places?|seats?|positions?|boxes|box|months?|days?|weeks?|years?|persons?|people|steps?|others?|friends?|students?|members?|boys?|girls?))/g, (w) => String(NUM[w]))
  s = s.replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/g, (w) => `#${ORD[w]}`)
  s = s.replace(/\b(\d+)(?:st|nd|rd|th)\b/g, '#$1')
  s = s.replace(/'s\b/g, '')
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

function interpretClause(s: string, ments: Term[], lex: Lexicon): Atom[] | null {
  const M = (k: string): Term => ments[Number(k)]
  const neg = /\bnot\b/.test(s) || undefined
  const grid = lex.axis === 'grid'
  if (grid) {
    const g = interpretGrid(s, ments)
    if (g) return g
  }
  if (!grid) {

  // "The number of persons between x and y is (not) the same as the number of persons between z and w"
  let m = s.match(new RegExp(`number of (?:[a-z]+\\s+){1,3}?between\\s+${ENT}\\s+and\\s+${ENT}\\s+(?:(?:is|are)\\s+)?(not\\s+)?(?:the\\s+)?same as\\s+(?:the\\s+)?number of (?:[a-z]+\\s+){1,3}?between\\s+${ENT}\\s+and\\s+${ENT}`))
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

  // "The number of persons to the left of x is the same as the number of persons to the right of y"
  m = s.match(new RegExp(`number of (?:[a-z]+\\s+){1,3}?(left|right) of\\s+${ENT}\\s+(?:(?:is|are)\\s+)?(not\\s+)?(?:the\\s+)?same as\\s+(?:the\\s+)?number of (?:[a-z]+\\s+){1,3}?(left|right) of\\s+${ENT}`))
  if (m) {
    if (lex.axis === 'circle') return null
    return [{ t: 'cnt', x: M(m[2]), xs: m[1] === 'left' ? 'l' : 'r', y: M(m[5]), ys: m[4] === 'left' ? 'l' : 'r', neg: m[3] || neg ? true : undefined }]
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

  // "x sits exactly opposite y" (round table: across the table; two rows: the person facing x)
  m = s.match(new RegExp(`${ENT}\\s+(?:[a-z]+\\s+){0,4}?opposite\\s+${ENT}`))
  if (m) return lex.axis === 'circle' ? [{ t: 'diff', x: M(m[1]), y: M(m[2]), d: lex.n / 2, neg }] : lex.axis === 'tworow' ? [{ t: 'opp', x: M(m[1]), y: M(m[2]), neg }] : null

  // "x faces y": on a round table, the person across the table
  m = s.match(new RegExp(`${ENT}\\s+(?:[a-z]+\\s+){0,3}?faces?\\s+${ENT}`))
  if (m) return lex.axis === 'circle' ? [{ t: 'diff', x: M(m[1]), y: M(m[2]), d: lex.n / 2, neg }] : lex.axis === 'tworow' ? [{ t: 'opp', x: M(m[1]), y: M(m[2]), neg }] : null

  // exactly k people between x and y
  m = s.match(new RegExp(`(?:(?:exactly|only)\\s+)?(?:there (?:are|is)\\s+)?(?:(?:exactly|only)\\s+)?(\\d+|no)\\s+${COUNT_NOUN}\\s+(?:[a-z]+\\s+){0,3}?(?:exactly\\s+)?(?:in\\s+)?between\\s+${ENT}\\s+and\\s+${ENT}`))
  if (m) return [{ t: 'gap', x: M(m[2]), y: M(m[3]), k: m[1] === 'no' ? 0 : Number(m[1]), neg }]
  m = s.match(new RegExp(`${ENT}\\s+and\\s+${ENT}\\s+(?:have|has)\\s+(\\d+|no)\\s+${COUNT_NOUN}\\s+between\\s+them`))
  if (m) return [{ t: 'gap', x: M(m[1]), y: M(m[2]), k: m[3] === 'no' ? 0 : Number(m[3]), neg }]

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
  m = s.match(new RegExp(`${ENT}\\s+(?:[a-z]+\\s+){0,8}?(?:(immediately)\\s+)?(?:#?(\\d+)\\s+(?:(?:floors?|places?|seats?|positions?|boxes|box|steps?|months?|days?|weeks?|years?)\\s+)?)?(above|below|over|under|higher than|lower than|left of|right of|taller than|shorter than|after|before|later than|earlier than)\\s+(?:(?:the\\s+)?(?:floor|seat|month|day) of\\s+)?${ENT}`))
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
  m = s.match(new RegExp(`${ENT}\\s+(?:[a-z]+\\s+){0,6}?(?:next to|adjacent to|beside|neighbou?r of|neighbouring|adjoining)\\s+${ENT}`))
  if (m) return [{ t: 'adj', x: M(m[1]), y: M(m[2]), neg }]
  m = s.match(new RegExp(`${ENT}\\s+and\\s+${ENT}\\s+(?:[a-z]+\\s+){0,4}?(?:adjacent|neighbou?rs?|next to each other|beside each other)`))
  if (m) return [{ t: 'adj', x: M(m[1]), y: M(m[2]), neg }]

  }

  const count = (s.match(/@\d+/g) ?? []).length

  // "Neither A nor B lives on the top floor", "Both A and B live on odd floors", "A and B do not live on the lowest floor"
  const listed = s.match(/(?:^|\s)(?:neither\s+|both\s+)?((?:@\d+)(?:\s+(?:and|nor)\s+@\d+)+)(?=\s)/)
  if (count >= 2 && listed && (listed[1].match(/@/g) ?? []).length === count) {
    const who = (s.match(/@(\d+)/g) ?? []).map((t) => M(t.slice(1)))
    if (who.every((t) => t.k !== 'f')) {
      const fs = positionSet(s, lex)
      if (fs && fs !== 'bad' && fs.length) {
        const no = neg || /\bneither\b/.test(s) ? true : undefined
        return who.map((x) => ({ t: 'set', x, fs, neg: no }) as Atom)
      }
    }
  }

  // a person / value and one or more named positions: "V was born in July", "not in May or June"
  {
    const all = (s.match(/@(\d+)/g) ?? []).map((t) => M(t.slice(1)))
    const named = all.filter((t): t is Extract<Term, { k: 'f' }> => t.k === 'f')
    const others = all.filter((t) => t.k !== 'f')
    const chain = others.every(isVar) && (others.length === 1 || /(?:^|\s)(?:neither\s+|both\s+)?@\d+(?:\s+(?:and|nor)\s+@\d+)+\s/.test(s))
    if (named.length >= 1 && others.length >= 1 && chain) {
      const fs = [...new Set(named.map((t) => t.f))].sort((a, b) => a - b)
      const either = /\b(?:either|neither)\b/.test(s)
      return others.map((x) => (fs.length === 1 && !either ? { t: 'link', x, y: named[0], neg } : { t: 'set', x, fs, neg: neg || (/\bneither\b/.test(s) ? true : undefined) }) as Atom)
    }
  }

  // one person / value and a position: "topmost", "floor 3", "either the topmost or the lowest", "an odd-numbered floor" …
  if (count === 1 && lex.axis !== 'circle') {
    const x = M((s.match(/@(\d+)/) as RegExpMatchArray)[1])
    const fs = positionSet(s, lex)
    if (fs === 'bad') return null
    if (fs && fs.length) return [{ t: 'set', x, fs, neg: neg || (/\bneither\b/.test(s) ? true : undefined) }]
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

function positionSet(sIn: string, lex: Lexicon): number[] | 'bad' | null {
  if (lex.axis === 'grid') return gridCells(sIn, lex)
  if (lex.axis === 'tworow') return twoRowCells(sIn, lex)
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
    if (/\b(?:either end|both ends|one of the ends|extreme ends)\b/.test(s)) {
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
  if (ments.length === 0) return null
  const atoms: Atom[] = []
  // "A, who is from Kolkata, lives on …" → a link plus the rest
  const rest = text.replace(
    new RegExp(`${ENT}\\s*,\\s*(?:who|which|that)\\s+(?:[a-z]+\\s+){1,6}?(?:(?:a|an|the)\\s+)?${ENT}(?:\\s+(?:old|per\\s+(?:month|year|annum)))?\\s*(?:,|$)`, 'gi'),
    (_m, a: string, b: string) => {
      const x = ments[Number(a)]
      const y = ments[Number(b)]
      if (!isVar(x) || !isVar(y)) return `@${a} `
      const cx = x.k === 'p' ? -1 : x.k === 'v' ? x.c : -2
      const cy = y.k === 'p' ? -1 : y.k === 'v' ? y.c : -2
      if (cx !== cy) atoms.push({ t: 'link', x, y })
      return `@${a} `
    },
  )
  const s = norm(rest, ments, lex.axis)
  if (s) {
    const compound = compoundClause(s, ments, lex)
    if (compound) return [...atoms, ...compound]
    // "E lives in flat A but not on floor number 1": the second half borrows the subject of the first
    const but = s.split(/\s+but\s+/)
    if (but.length === 2 && !/^not both\b/.test(but[1])) {
      const subject = but[0].match(/@\d+/)?.[0]
      const a1 = interpretClause(but[0], ments, lex)
      const a2 = subject || /^@\d+/.test(but[1]) ? interpretClause(/^@\d+/.test(but[1]) ? but[1] : `${subject} ${but[1]}`, ments, lex) : null
      if (a1 && a2) return [...atoms, ...a1, ...a2]
    }
    // "A lives immediately below B and is from Delhi": the second half starts with a verb, so it is a second statement about A
    const verbSplit = s.split(/\s+and\s+(?=(?:is|are|lives?|stays?|sits?|stands?|likes?|has|have|works?|comes?|belongs?|placed|kept|situated|located)\b)/)
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
  /^(?:each|every)\s+(?:person|one|of them|friend|student)\b[^.]*\b(?:only|exactly one)\b/i.test(s) || /^no\s+two\b/i.test(s) || /\bwith respect to\b[^.]*\bfacing\b/i.test(s) || /^\(?\s*left and right\b/i.test(s) || /^\(?\s*(?:the\s+)?(?:bottommost|lowermost|lowest|ground|topmost|position 1)\b[^.]*\b(?:numbered|is the bottom)\b/i.test(s)

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
      if (names.length >= 3 && new Set(names).size === names.length) {
        people = names
        headerIdx = k
        break
      }
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
  const countWord = header.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:different\s+)?(?:persons?|people|friends|students|members|boys|girls|colleagues|employees|boxes)\b/i)
  if (countWord) {
    const said = NUM[countWord[1].toLowerCase()] ?? Number(countWord[1])
    if (said !== n) result.warnings.push(`The text says ${said} people but ${n} names are listed — using the ${n} names.`)
  }
  const floorCount = building ? null : header.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:different\s+)?(floors|storeys|seats|positions|months|days|weeks|years)\b/i)
  if (floorCount) {
    const said = NUM[floorCount[1].toLowerCase()] ?? Number(floorCount[1])
    if (said !== n) {
      result.errors.push(`${n} people for ${said} ${floorCount[2].toLowerCase()} is not supported yet — the number of people must equal the number of ${floorCount[2].toLowerCase()}.`)
      return result
    }
  }

  // a circular table: everyone faces the same way, so "right" is always the next seat along
  const circle = /\b(?:circular|round)\s+table\b/i.test(text)
  if (/\b(?:square|rectangular|hexagonal|triangular)\s+table\b/i.test(text)) {
    result.errors.push('Only circular tables are supported so far (not square or rectangular ones).')
    return result
  }
  let facing: 'in' | 'out' | undefined
  if (circle) {
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
  const range = orderFromRange(header, n) ?? orderFromRange(text, n)
  if (range && 'error' in range) {
    result.errors.push(range.error)
    return result
  }
  order = range

  // axis and numbering direction
  const lower = text.toLowerCase()
  const floorScore = (lower.match(/floor|storey|building|above|below|topmost|lowest/g) ?? []).length
  const rowScore = (lower.match(/\brow\b|\bline\b|\bleft\b|\bright\b|\bseat|\bqueue\b|\bbench\b/g) ?? []).length
  let axisGuess: Axis = rowScore > floorScore ? 'row' : 'floor'
  const topDownText = /(?:topmost|top)\s+floor[^.]*?\bnumbered\s*(?:as\s*)?1\b/i.test(text) ||/numbered\s+(?:from|starting from|beginning from)\s+(?:the\s+)?top/i.test(text)

  // extra categories
  const cats: Category[] = []
  const used = new Set<number>([headerIdx])
  sentences.forEach((s, k) => {
    if (k === headerIdx || isBoilerplate(s) || isQuestion(s)) return
    const cs = parseCategorySentence(s)
    if (!cs) return
    used.add(k)
    if (cs.values.length !== n) {
      result.errors.push(`"${cs.name}" lists ${cs.values.length} values but there are ${n} people — they must match.`)
      return
    }
    if (new Set(cs.values.map((v) => v.toLowerCase())).size !== n) {
      result.errors.push(`The ${cs.name} values must all be different.`)
      return
    }
    const asOrder = !order ? orderFromList(cs.values) : null
    if (asOrder) {
      order = asOrder // "different month - January, February, ..." names the positions, it is not an attribute
      return
    }
    cats.push({ name: cs.name, values: cs.values })
  })
  if (result.errors.length) return result
  // "different months" with no names given: ordered positions that are only numbered
  if (!order) {
    const kw = header.match(/\b(?:different|distinct|separate)\s+(months|days|weeks|years)\b/i)
    if (kw) {
      order = { unit: singular(kw[1]), on: kw[1].toLowerCase() === 'days' ? 'on' : 'in' }
      result.warnings.push(`I could not tell which ${kw[1].toLowerCase()} (for example "from May to December"), so they are numbered 1 to ${n}; clues that name one will not be understood.`)
    }
  }
  const axis: Axis = building ? 'grid' : circle ? 'circle' : tworow ? 'tworow' : order ? 'order' : axisGuess
  const rowLen = axis === 'tworow' ? n / 2 : undefined
  const topDown = axis === 'floor' && topDownText
  axisGuess = axis
  const allValues = cats.flatMap((c) => c.values.map((v) => v.toLowerCase()))
  if (new Set(allValues).size !== allValues.length) result.warnings.push('Some values appear in more than one category, which can confuse clue reading.')
  for (const v of allValues) if (people.some((p) => p.toLowerCase() === v)) result.warnings.push(`"${v}" is both a person and a value.`)

  const lex = buildLexicon(people, cats, axis, topDown, order?.labels, building ? { cols: building.cols, flats: building.flats } : undefined, rowLen)
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
  const verbWord = header.match(/\b(?:were|are)\s+(born|seated|arranged|placed|ranked|appointed|promoted|admitted|selected|posted|scheduled|joined)\b/i)
  const extra = order ? { labels: order.labels, unit: order.unit, on: order.on, verb: verbWord ? `was ${verbWord[1].toLowerCase()}` : undefined } : {}
  const stack = boxes && axis === 'floor' ? { noun: 'box', place: 'place' } : boxes ? { noun: 'box' } : {}
  result.summary = { people, axis, topDown, cats, labels: order?.labels, unit: order?.unit, facing, cols: building?.cols, flats: building?.flats, rowLen, ...stack }
  result.puzzle = { n, axis, topDown, people, cats, clues, ...extra, ...(circle ? { facing } : {}), ...(building ? { cols: building.cols, flats: building.flats } : {}), ...(rowLen ? { rowLen } : {}), ...stack }
  return result
}
