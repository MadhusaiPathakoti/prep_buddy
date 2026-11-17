// Text → syllogism question. Understands the usual exam phrasings ("All x are y", "No x is a y", "Some x are not y",
// "Only a few x are y", possibilities such as "Some x can be y") and the layout of a pasted / OCR-read question
// ("Statements:" … "Conclusions:" … I. … II. …, with answer options mixed in or left out).

import type { Form, Term } from '../syllogism'

export interface Sentence {
  form: Form
  x: number
  y: number
  /** "Only a few x are y" = Some x are y AND Some x are not y. */
  few: boolean
  /** A possibility ("Some x can be y", "Some x may not be y"): true if ONE valid picture makes it true. */
  possibility: boolean
  /** The sentence as written (cleaned). */
  text: string
}

export interface ParsedTerm extends Term {
  /** Capitalised plural used on the circles, e.g. "Clocks". */
  label: string
}

export interface ParsedQuestion {
  terms: ParsedTerm[]
  statements: Sentence[]
  conclusions: Sentence[]
  unparsed: string[]
  errors: string[]
  warnings: string[]
}

export const MAX_TERMS = 6
export const MAX_CONCLUSIONS = 4

// ---------- plural / singular ----------

const IRREGULAR: [string, string][] = [
  ['men', 'man'], ['women', 'woman'], ['children', 'child'], ['people', 'person'], ['mice', 'mouse'], ['feet', 'foot'],
  ['teeth', 'tooth'], ['geese', 'goose'], ['oxen', 'ox'], ['lives', 'life'], ['wives', 'wife'], ['knives', 'knife'],
  ['leaves', 'leaf'], ['wolves', 'wolf'], ['shelves', 'shelf'], ['loaves', 'loaf'], ['halves', 'half'], ['thieves', 'thief'],
]
const IRREG_PLURAL = new Map(IRREGULAR)
const IRREG_SINGULAR = new Map(IRREGULAR.map(([p, s]) => [s, p]))
const ES_AFTER_O = /^(mango|tomato|potato|hero|echo|volcano|mosquito|torpedo)$/

function splitLast(phrase: string): [string, string] {
  const i = phrase.lastIndexOf(' ')
  return i < 0 ? ['', phrase] : [phrase.slice(0, i + 1), phrase.slice(i + 1)]
}

/** Every singular a word could come from ("shoes" → shoe, sho). Two surface forms are the same term when these overlap. */
function candidates(phrase: string): Set<string> {
  const [pre, w] = splitLast(phrase)
  const out = new Set<string>([w])
  const irr = IRREG_PLURAL.get(w)
  if (irr) out.add(irr)
  if (w.length > 3 && w.endsWith('ies')) out.add(w.slice(0, -3) + 'y')
  if (w.length > 3 && w.endsWith('ves')) {
    out.add(w.slice(0, -3) + 'f')
    out.add(w.slice(0, -3) + 'fe')
  }
  if (w.length > 3 && w.endsWith('es')) out.add(w.slice(0, -2))
  if (w.length > 2 && w.endsWith('s') && !w.endsWith('ss')) out.add(w.slice(0, -1))
  return new Set([...out].map((c) => pre + c))
}

function pluralize(phrase: string): string {
  const [pre, w] = splitLast(phrase)
  const irr = IRREG_SINGULAR.get(w)
  if (irr) return pre + irr
  if (/(s|x|z|ch|sh)$/.test(w)) return `${pre}${w}es`
  if (/[^aeiou]y$/.test(w)) return `${pre}${w.slice(0, -1)}ies`
  if (ES_AFTER_O.test(w)) return `${pre}${w}es`
  return `${pre}${w}s`
}

function guessSingular(phrase: string): string {
  const [pre, w] = splitLast(phrase)
  const irr = IRREG_PLURAL.get(w)
  if (irr) return pre + irr
  if (w.length > 3 && w.endsWith('ies')) return `${pre}${w.slice(0, -3)}y`
  if (/(ches|shes|sses|xes|zes)$/.test(w)) return pre + w.slice(0, -2)
  if (/oes$/.test(w) && !/^(shoes|toes|foes|canoes|oboes)$/.test(w)) return pre + w.slice(0, -2)
  if (w.length > 2 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) return pre + w.slice(0, -1)
  return phrase
}

const looksPlural = (phrase: string) => guessSingular(phrase) !== phrase

interface RawTerm {
  surfaces: string[]
  cands: Set<string>
}

class TermRegistry {
  raw: RawTerm[] = []

  index(phrase: string): number {
    const c = candidates(phrase)
    for (let i = 0; i < this.raw.length; i++) {
      for (const x of c) {
        if (this.raw[i].cands.has(x)) {
          if (!this.raw[i].surfaces.includes(phrase)) this.raw[i].surfaces.push(phrase)
          for (const y of c) this.raw[i].cands.add(y)
          return i
        }
      }
    }
    this.raw.push({ surfaces: [phrase], cands: c })
    return this.raw.length - 1
  }

  finish(): ParsedTerm[] {
    return this.raw.map(({ surfaces }) => {
      let singular: string
      let plural: string
      if (surfaces.length > 1) {
        const sorted = [...surfaces].sort((a, b) => a.length - b.length)
        singular = sorted[0]
        plural = sorted[sorted.length - 1]
      } else if (looksPlural(surfaces[0])) {
        plural = surfaces[0]
        singular = guessSingular(surfaces[0])
      } else {
        singular = surfaces[0]
        plural = pluralize(surfaces[0])
      }
      return { singular, plural, label: plural.charAt(0).toUpperCase() + plural.slice(1) }
    })
  }
}

// ---------- sentences ----------

const ART = '(?:(?:a|an|the)\\s+)?'
const OF = '(?:of\\s+(?:the\\s+)?)?'

const RE_POSSIBLE = new RegExp(`^(some|all|every)\\s+${OF}(.+?)\\s+(?:can|could|may|might)\\s+(not\\s+)?(?:also\\s+)?be\\s+${ART}(.+)$`)
const RE_ONLY_FEW = new RegExp(`^only\\s+(?:a\\s+)?few\\s+${OF}(.+?)\\s+(?:are|is)\\s+(not\\s+)?${ART}(.+)$`)
const RE_FEW = new RegExp(`^(?:a\\s+)?few\\s+${OF}(.+?)\\s+(?:are|is)\\s+(not\\s+)?${ART}(.+)$`)
const RE_ALL = new RegExp(`^(?:all|every|each|any)\\s+(?:the\\s+)?(.+?)\\s+(?:are|is)\\s+(not\\s+)?${ART}(.+)$`)
const RE_NO = new RegExp(`^(?:no|none\\s+of\\s+the)\\s+(.+?)\\s+(?:are|is)\\s+${ART}(.+)$`)
const RE_NOT_ALL = new RegExp(`^not\\s+all\\s+(?:the\\s+)?(.+?)\\s+(?:are|is)\\s+${ART}(.+)$`)
const RE_SOME = new RegExp(`^(?:some|several|many|certain|at\\s+least\\s+some)\\s+${OF}(.+?)\\s+(?:are|is)\\s+(not\\s+)?${ART}(.+)$`)

interface Shape {
  form: Form
  x: string
  y: string
  few: boolean
  possibility: boolean
  warn?: string
}

function cleanPhrase(p: string): string {
  return p
    .replace(/^(?:the|a|an)\s+/, '')
    .replace(/[^a-z0-9' -]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function shapeOf(sentence: string): Shape | null {
  const s = sentence
    .toLowerCase()
    .replace(/[.;!,]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  let m: RegExpMatchArray | null
  if ((m = s.match(RE_POSSIBLE))) {
    const [, q, x, not, y] = m
    const some = q === 'some'
    return { form: some ? (not ? 'O' : 'I') : not ? 'E' : 'A', x, y, few: false, possibility: true }
  }
  if ((m = s.match(RE_ONLY_FEW))) return { form: 'I', x: m[1], y: m[3], few: true, possibility: false }
  if ((m = s.match(RE_FEW))) return { form: m[2] ? 'O' : 'I', x: m[1], y: m[3], few: false, possibility: false }
  if ((m = s.match(RE_NOT_ALL))) return { form: 'O', x: m[1], y: m[2], few: false, possibility: false }
  if ((m = s.match(RE_NO))) return { form: 'E', x: m[1], y: m[2], few: false, possibility: false }
  if ((m = s.match(RE_ALL))) {
    return m[2]
      ? { form: 'E', x: m[1], y: m[3], few: false, possibility: false, warn: `"${sentence.trim()}" was read as "No ${m[1]} is ${m[3]}".` }
      : { form: 'A', x: m[1], y: m[3], few: false, possibility: false }
  }
  if ((m = s.match(RE_SOME))) return { form: m[2] ? 'O' : 'I', x: m[1], y: m[3], few: false, possibility: false }
  return null
}

// ---------- the whole question ----------

const OPTION_LINE = /^\(?[a-e][).:]\s+\S/i
const BOILERPLATE = /(commonly known facts|at variance|decide which of the (?:given )?conclusions|give answer|logically follow|^directions?\b|^instructions?\b|^note\b)/i
const ROMAN_LABEL = /^\(?(?:i{1,3}|iv|v)[).:]\s+/i
const ANY_LABEL = /^\(?(?:i{1,3}|iv|v|[1-9]|[a-d])[).:]\s+/i
const OPTION_WORDS = /\b(?:only|either|neither|both|none)\b.*\b(?:conclusions?|follows?)\b|\bconclusions?\b.*\bfollows?\b/i

export function parseQuestion(text: string): ParsedQuestion {
  const out: ParsedQuestion = { terms: [], statements: [], conclusions: [], unparsed: [], errors: [], warnings: [] }
  const lines = text
    .replace(/\r/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  let section: 'stmt' | 'conc' = 'stmt'
  const stmtLines: string[] = []
  const concLines: string[] = []
  for (let line of lines) {
    if (OPTION_LINE.test(line) && OPTION_WORDS.test(line)) continue
    if (BOILERPLATE.test(line) && !/^(?:all|no|some|only|every)\b/i.test(line)) continue
    const head = line.match(/^(statements?|conclusions?)\s*[:\-–]?\s*(.*)$/i)
    if (head) {
      section = /^s/i.test(head[1]) ? 'stmt' : 'conc'
      line = head[2].trim()
      if (!line) continue
    } else if (section === 'stmt' && ROMAN_LABEL.test(line) && /^\(?(?:i{1,3}|iv|v)[).:]/i.test(line) && !/^i\s/i.test(line)) {
      section = 'conc' // a heading-less "I. …" line: the conclusions have started
    }
    if (section === 'stmt') {
      line = line.replace(/^\(?\d+[).]\s*/, '')
      for (const part of line.split(/(?<=[.;])\s+(?=[A-Za-z])/)) if (part.trim()) stmtLines.push(part.trim())
    } else {
      // "I. … II. …" on one line: split before each label
      for (const part of line.split(/\s+(?=(?:i{1,3}|iv|v)[.)]\s)/i)) if (part.trim()) concLines.push(part.trim().replace(ANY_LABEL, ''))
    }
  }

  const reg = new TermRegistry()
  const read = (line: string): Sentence | null => {
    const shape = shapeOf(line)
    if (!shape) return null
    const x = cleanPhrase(shape.x)
    const y = cleanPhrase(shape.y)
    if (!x || !y) return null
    if (shape.warn) out.warnings.push(shape.warn)
    const xi = reg.index(x)
    const yi = reg.index(y)
    if (xi === yi) return null
    return { form: shape.form, x: xi, y: yi, few: shape.few, possibility: shape.possibility, text: line.replace(/\s+/g, ' ').replace(/[.;]+$/, '').trim() }
  }

  for (const l of stmtLines) {
    const s = read(l)
    if (!s) out.unparsed.push(l)
    else if (s.possibility) {
      out.unparsed.push(l)
      out.warnings.push(`"${l}" is a possibility — those are only used in conclusions, so it was ignored as a statement.`)
    } else out.statements.push(s)
  }
  for (const l of concLines) {
    const s = read(l)
    if (!s) out.unparsed.push(l)
    else out.conclusions.push(s)
  }

  out.terms = reg.finish()
  if (out.terms.length > MAX_TERMS) out.errors.push(`This question has ${out.terms.length} different groups — I can draw up to ${MAX_TERMS}.`)
  if (out.statements.length === 0) out.errors.push('I could not find any statement. Write them one per line, like “All clocks are keys.”')
  if (out.conclusions.length === 0) out.errors.push('I could not find any conclusion. Put them after a “Conclusions:” line, as “I. …”, “II. …”.')
  if (out.conclusions.length > MAX_CONCLUSIONS) {
    out.warnings.push(`Only the first ${MAX_CONCLUSIONS} conclusions are used.`)
    out.conclusions.length = MAX_CONCLUSIONS
  }
  return out
}
