// The duplicate-detection fingerprint of a Quant question. Plain JS (no TypeScript) because the serverless
// functions in /api and the seed script both need exactly the same function, so a question added by a person
// and one built by the generator can never slip past each other.
import { createHash } from 'node:crypto'

const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹'

/**
 * "19²" becomes "19^2" BEFORE Unicode normalisation. Without this, normalisation turns the superscript into a plain digit
 * and "19²" would read as "192", which would make 19² + 4 and 192 + 4 look like the same question.
 */
export function explicitPowers(text) {
  return String(text).replace(/[⁰¹²³⁴-⁹]+/g, (run) => `^${[...run].map((c) => SUPERSCRIPT_DIGITS.indexOf(c)).join('')}`)
}

/**
 * Lower-case, unify look-alike symbols and quotes, and drop all whitespace. Commas, digits and operators are kept
 * on purpose: "2, 3, 5" and "23, 5" are different series, and "5 men" and "6 men" are different problems, so a loose
 * match would wrongly reject real questions. Anything fuzzier than this belongs to the near-duplicate check, which warns instead of blocking.
 */
export function normalizeText(text) {
  return explicitPowers(String(text ?? ''))
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[−–—]/g, '-')
    .replace(/[×✕⨯]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/\s+/g, '')
    .replace(/[.:;!?]+$/, '')
}

/** The same options in a different order are the same question, so the options are sorted before hashing. */
export function questionKey(stem, options) {
  const opts = (Array.isArray(options) ? options : []).map(normalizeText).sort()
  const digest = createHash('sha256').update(JSON.stringify([normalizeText(stem), opts])).digest('hex')
  return `q-${digest.slice(0, 20)}`
}
