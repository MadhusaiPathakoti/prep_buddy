// Text → family-tree puzzle: "There is a family of seven people spread across two generations. N is the brother-in-law of A,
// who has only one daughter. R, who does not have any siblings is the mother of P. …"
//
// People are single capital letters. "who / whom / whose" refers to the person named just before it, "and / but" to the first
// person of the sentence (the usual blood-relation rule). Anything that is not understood is listed, never guessed at.

import { RELATION_ALIASES, RELATION_WORDS, RELATIONS } from './model'
import type { CountKind, Fact, FamilyClue, FamilyPuzzle } from './solve'

export interface FamilyParse {
  puzzle: FamilyPuzzle | null
  errors: string[]
  warnings: string[]
  unparsed: string[]
  /** the sizes stated in the text */
  header: { people?: number; generations?: number }
}

const NUMS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10 }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const RELRE = `(?:${RELATION_WORDS.map(escapeRe).join('|')})`
const KIN_WORD = new RegExp(`\\b${RELRE.slice(0, -1)}|married|husband|wife)\\b`, 'g')

function normalize(raw: string): string {
  let t = raw
    .replace(/\r/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  t = t.replace(/\b(brother|sister|father|mother|son|daughter)[\s-]+in[\s-]+law\b/gi, (_m, a: string) => `${a.toLowerCase()}-in-law`)
  for (const [from, to] of Object.entries(RELATION_ALIASES)) t = t.replace(new RegExp(`\\b${escapeRe(from)}\\b`, 'gi'), to)
  return t
}

function splitSentences(t: string): string[] {
  return t
    .split(/(?<=[.!?])\s+(?=[A-Z])|\n+/)
    .map((x) => x.trim().replace(/[.!]+$/, '').trim())
    .filter(Boolean)
}

/** is this the text of a family-tree puzzle? */
export function isFamilyPuzzle(raw: string): boolean {
  const t = normalize(raw).toLowerCase()
  const hits = new Set(t.match(KIN_WORD) ?? [])
  if (/\bgenerations?\b/.test(t) && hits.size >= 1) return true
  if (/\bfamily\b/.test(t) && hits.size >= 2) return true
  return hits.size >= 3 && /\bis the (?:[a-z-]+ )?(?:[a-z-]+) of [a-z]\b/i.test(t)
}

export function describeFact(f: Fact, nm: (i: number) => string): string {
  switch (f.t) {
    case 'rel':
      return `${nm(f.x)} is ${f.neg ? 'not ' : ''}the ${f.rel} of ${nm(f.y)}`
    case 'gender':
      return `${nm(f.x)} is ${f.g === 'M' ? 'male' : 'female'}`
    case 'count': {
      const word = f.what === 'child' ? 'child' : f.what
      if (f.n === 0) return `${nm(f.x)} has no ${word === 'child' ? 'children' : `${word}s`}`
      const plural = f.n === 1 ? word : word === 'child' ? 'children' : `${word}s`
      return `${nm(f.x)} has ${f.atLeast ? 'at least' : 'exactly'} ${f.n === 1 ? 'one' : f.n} ${plural}`
    }
  }
}

const COUNT_WORDS = '(sons?|daughters?|child|brothers?|sisters?|sibling)'
const singularCount = (w: string): CountKind => w.replace(/s$/, '') as CountKind

export function parseFamily(raw: string): FamilyParse {
  const out: FamilyParse = { puzzle: null, errors: [], warnings: [], unparsed: [], header: {} }
  const text = normalize(raw)
  if (!text) {
    out.errors.push('Paste the puzzle text to begin.')
    return out
  }
  const sentences = splitSentences(text)
  const isHeader = (s: string) => /\b(?:family|generations?)\b/i.test(s) && /\b(?:people|persons|members|generations?)\b/i.test(s) && !/\bis the\b/i.test(s)
  const headerIdx = sentences.findIndex(isHeader)
  if (headerIdx >= 0) {
    const h = sentences[headerIdx]
    const pm = h.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+(?:people|persons|members)\b/i)
    const gm = h.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+generations?\b/i)
    if (pm) out.header.people = NUMS[pm[1].toLowerCase()] ?? Number(pm[1])
    if (gm) out.header.generations = NUMS[gm[1].toLowerCase()] ?? Number(gm[1])
  }
  const body = sentences.filter((_, i) => i !== headerIdx)
  const letters = new Set<string>()
  for (const s of body) for (const l of s.matchAll(/(?<![A-Za-z0-9'])([A-Z])(?![A-Za-z0-9'])/g)) letters.add(l[1])
  const names = [...letters].sort()
  if (names.length < 2) {
    out.errors.push('I could not find the people — in these puzzles they are single capital letters (A, B, C …) used in the clues.')
    return out
  }
  if (out.header.people !== undefined && out.header.people !== names.length) {
    out.errors.push(`The text says ${out.header.people} people, but the clues name ${names.length} (${names.join(', ')}).`)
    return out
  }
  let gens = out.header.generations
  if (gens === undefined) {
    gens = 3
    out.warnings.push('The text does not say how many generations there are, so I allowed up to 3.')
  }
  if (gens < 1 || gens > 5) {
    out.errors.push('Between 1 and 5 generations are supported.')
    return out
  }
  if (names.length > 10) {
    out.errors.push('Up to 10 people are supported in a family-tree puzzle.')
    return out
  }
  const idx = new Map(names.map((nm, i) => [nm, i]))

  const clues: FamilyClue[] = []
  for (const s of body) {
    const marked = s.replace(/(?<![A-Za-z0-9'])([A-Z])(?![A-Za-z0-9'])/g, (_m, l: string) => `@${idx.get(l)}`).toLowerCase().replace(/\bchildren\b/g, 'child').replace(/\bsiblings\b/g, 'sibling')
    const facts = parseSentence(marked)
    if (facts && facts.length) clues.push({ id: clues.length + 1, text: s, facts })
    else out.unparsed.push(s)
  }
  if (!clues.length) {
    out.errors.push('I could not read any clues from the text.')
    return out
  }
  out.puzzle = { names, gens, clues }
  return out
}

// ── one sentence ──

const P = (s: string) => Number(s.slice(1))

function parseSentence(s: string): Fact[] | null {
  s = s.replace(/\s+/g, ' ').replace(/^(?:also|further|moreover),?\s+/, '').trim()
  let m: RegExpMatchArray | null

  // "@a and @b are married / brothers / the children of @c"
  m = s.match(/^(@\d+) and (@\d+) (?:are|were) (?:a\s+)?(?:married(?: couple)?|husband and wife|couple)$/)
  if (m) return [{ t: 'rel', rel: 'spouse', x: P(m[1]), y: P(m[2]) }]
  m = s.match(/^(@\d+) and (@\d+) (?:are|were) (?:the\s+)?(brothers|sisters|sibling|brother and sister|cousins)$/)
  if (m) {
    const x = P(m[1])
    const y = P(m[2])
    if (m[3] === 'cousins') return [{ t: 'rel', rel: 'cousin', x, y }]
    const f: Fact[] = [{ t: 'rel', rel: 'sibling', x, y }]
    if (m[3] === 'brothers') f.push({ t: 'gender', x, g: 'M' }, { t: 'gender', x: y, g: 'M' })
    if (m[3] === 'sisters') f.push({ t: 'gender', x, g: 'F' }, { t: 'gender', x: y, g: 'F' })
    return f
  }
  m = s.match(new RegExp(`^(@\\d+) and (@\\d+) (?:are|were) (?:the\\s+)?(${RELRE}) of (@\\d+)(.*)$`))
  if (m) {
    const tail = tailFacts(P(m[1]), P(m[4]), m[5])
    if (!tail) return null
    return [{ t: 'rel', rel: m[3], x: P(m[1]), y: P(m[4]) }, { t: 'rel', rel: m[3], x: P(m[2]), y: P(m[4]) }, ...tail]
  }

  // "@a (, who …) is the REL of @b (, who …) (and the REL of @c)"
  m = s.match(new RegExp(`^(@\\d+)(.*?)\\b(?:is|was|are|were)\\s+(?:the\\s+|a\\s+|an\\s+)?(${RELRE})\\s+of\\s+(@\\d+)(.*)$`))
  if (m) {
    const x = P(m[1])
    const y = P(m[4])
    const facts: Fact[] = [{ t: 'rel', rel: m[3], x, y }]
    const mid = m[2].trim().replace(/^[,;]\s*/, '').replace(/[,;]\s*$/, '')
    if (mid) {
      const clause = mid.replace(/^(?:who|whose|which)\s+/, '')
      const f = clauseFacts(x, clause)
      if (!f) return null
      facts.push(...f)
    }
    const tail = tailFacts(x, y, m[5])
    if (!tail) return null
    return [...facts, ...tail]
  }

  // "@a (, who …) is married to @b (, who …)"
  m = s.match(/^(@\d+)(.*?)\b(?:is|was|are|were)\s+married\s+to\s+(@\d+)(.*)$/)
  if (m) {
    const x = P(m[1])
    const y = P(m[3])
    const facts: Fact[] = [{ t: 'rel', rel: 'spouse', x, y }]
    const mid = m[2].trim().replace(/^[,;]\s*/, '').replace(/[,;]\s*$/, '')
    if (mid) {
      const f = clauseFacts(x, mid.replace(/^(?:who|whose|which)\s+/, ''))
      if (!f) return null
      facts.push(...f)
    }
    const tail = tailFacts(x, y, m[4])
    if (!tail) return null
    return [...facts, ...tail]
  }

  // "@a (, who …) has only one daughter", "@a is male", "@a, who is a male, …"
  m = s.match(/^(@\d+)\s*,?\s*(?:who\s+|whose\s+)?(.+)$/)
  if (m) return clauseFacts(P(m[1]), m[2])
  return null
}

/** what follows the second person: ", who has …" (about that person), "and the REL of @c", "and is …" (about the first person) */
function tailFacts(subject: number, last: number, tailIn: string): Fact[] | null {
  let rest = tailIn.trim()
  let who = last
  const facts: Fact[] = []
  let guard = 0
  while (rest && guard++ < 6) {
    rest = rest.replace(/^[,;]\s*/, '').trim()
    if (!rest) break
    let m = rest.match(/^(?:who|whom|whose|which)\s+(.+)$/)
    if (m) {
      const f = clauseFacts(who, m[1])
      if (!f) return null
      facts.push(...f)
      return facts
    }
    m = rest.match(new RegExp(`^(?:and|but)\\s+(?:is\\s+|was\\s+)?(?:the\\s+|a\\s+|an\\s+)?(${RELRE})\\s+of\\s+(@\\d+)(.*)$`))
    if (m) {
      facts.push({ t: 'rel', rel: m[1], x: subject, y: P(m[2]) })
      who = P(m[2])
      rest = m[3].trim()
      continue
    }
    m = rest.match(/^(?:and|but)\s+(.+)$/)
    if (m) {
      const f = clauseFacts(subject, m[1])
      if (!f) return null
      facts.push(...f)
      return facts
    }
    return null
  }
  return facts
}

/** statements about one person: "is a male", "has only one daughter", "does not have any siblings", "is married to @q" … (joined by "and") */
function clauseFacts(p: number, textIn: string): Fact[] | null {
  const text = textIn.trim().replace(/[,;]\s*$/, '')
  const pieces = text.split(/\s*,?\s+(?:and|but)\s+(?=(?:is|was|has|have|does|do|doesn't|don't|also)\b)/)
  const facts: Fact[] = []
  for (const raw of pieces) {
    const c = raw.trim().replace(/^also\s+/, '').replace(/^,\s*/, '')
    let m: RegExpMatchArray | null
    if ((m = c.match(/^(?:is|was)\s+(?:a\s+|an\s+)?(male|man|boy|female|woman|girl)$/))) {
      facts.push({ t: 'gender', x: p, g: /^(?:male|man|boy)$/.test(m[1]) ? 'M' : 'F' })
      continue
    }
    if ((m = c.match(/^(?:is|was)\s+(not\s+)?married\s+to\s+(@\d+)$/))) {
      facts.push({ t: 'rel', rel: 'spouse', x: p, y: P(m[2]), neg: !!m[1] })
      continue
    }
    if ((m = c.match(new RegExp(`^(?:is|was)\\s+(not\\s+)?(?:the\\s+|a\\s+|an\\s+)?(${RELRE})\\s+of\\s+(@\\d+)$`)))) {
      facts.push({ t: 'rel', rel: m[2], x: p, y: P(m[3]), neg: !!m[1] })
      continue
    }
    if ((m = c.match(new RegExp(`^(?:has|have)\\s+(?:only\\s+|exactly\\s+)?(one|two|three|four|[1-4])\\s+${COUNT_WORDS}$`)))) {
      facts.push({ t: 'count', x: p, what: singularCount(m[2]), n: NUMS[m[1]] })
      continue
    }
    if ((m = c.match(new RegExp(`^(?:has|have)\\s+(?:no|not any)\\s+${COUNT_WORDS}$`))) || (m = c.match(new RegExp(`^(?:does|do)\\s+not\\s+have\\s+(?:any\\s+)?${COUNT_WORDS}$`))) || (m = c.match(new RegExp(`^(?:doesn't|don't)\\s+have\\s+(?:any\\s+)?${COUNT_WORDS}$`)))) {
      facts.push({ t: 'count', x: p, what: singularCount(m[1]), n: 0 })
      continue
    }
    if ((m = c.match(/^(?:is|was)\s+the\s+only\s+(child|son|daughter)$/))) {
      facts.push({ t: 'count', x: p, what: 'sibling', n: 0 })
      if (m[1] !== 'child') facts.push({ t: 'gender', x: p, g: m[1] === 'son' ? 'M' : 'F' })
      continue
    }
    return null
  }
  return facts
}

/** the relation words the parser understands (for the instructions panel) */
export const FAMILY_RELATIONS = Object.keys(RELATIONS)
