// Cleans and checks what a person submits when adding a question. Everything a person types is untrusted: it is
// length-limited, stripped of control characters and links, and only ever shown as plain text.

export class BadInput extends Error {
  constructor(message) {
    super(message)
    this.name = 'BadInput'
  }
}

export const STEM_MIN = 15
export const STEM_MAX = 1200
export const OPTION_MAX = 200
export const EXAM_TYPES = ['PO', 'Clerk', 'General']
export const DEFAULT_EXAM_NAME = 'Unknown'
export const DEFAULT_EXAM_TYPE = 'General'
export const GENERATED_EXAM_NAME = 'Practice (generated)'
export const EXAM_NAME_SUGGESTIONS = ['SBI PO', 'IBPS PO', 'RBI Assistant', 'SBI Clerk', 'IBPS Clerk', 'RRB Officer Scale-I', 'RRB Office Assistant']
const MIN_YEAR = 2000

// eslint-disable-next-line no-control-regex -- control characters are exactly what is being removed
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g
const LINK = /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|in|org|net|io|co)\b/i

/**
 * Plain text from a string: normalised line breaks, no control or direction-changing characters, tidy spaces.
 * Uses NFC, not NFKC: NFKC would turn "19²" into "192" and "½" into "1⁄2", silently changing a maths question.
 */
function tidy(value, { multiline }) {
  let s = String(value ?? '').normalize('NFC').replace(/\r\n?/g, '\n').replace(CONTROL, '')
  s = s.replace(/[^\S\n]+/g, ' ') // any run of spaces, tabs or odd space characters (such as no-break spaces)
  s = multiline ? s.replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n') : s.replace(/\s*\n\s*/g, ' ')
  return s.trim()
}

/** If every option starts with a label such as "A)", "(b)" or "C." (as copied from a paper), the labels are dropped. */
export function stripOptionLabels(options) {
  const label = /^\(?([A-Ea-e])[).:]\s+/
  if (options.length >= 2 && options.every((o, i) => label.exec(o)?.[1].toUpperCase() === 'ABCDE'[i])) return options.map((o) => o.replace(label, ''))
  return options
}

export function canonicalExamName(raw) {
  const name = tidy(raw, { multiline: false }).slice(0, 60)
  if (!name) return DEFAULT_EXAM_NAME
  if (!/^[\p{L}\p{N} .,&/()'-]+$/u.test(name) || LINK.test(name)) throw new BadInput('The exam name has characters that are not allowed.')
  const known = EXAM_NAME_SUGGESTIONS.find((s) => s.toLowerCase() === name.toLowerCase())
  if (known) return known
  if (name.toLowerCase() === GENERATED_EXAM_NAME.toLowerCase() || name.toLowerCase() === DEFAULT_EXAM_NAME.toLowerCase()) return DEFAULT_EXAM_NAME
  return name
}

/**
 * Turns the request body into a clean, validated question, or throws BadInput with a message fit to show the person.
 * `answer` is the optional correct option the person says it is (0-based); the solvers decide whether to believe it.
 */
export function cleanQuestionInput(body, now = Date.now()) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadInput('Invalid request.')

  const stem = tidy(body.stem, { multiline: true })
  if (stem.length < STEM_MIN) throw new BadInput(`Type the whole question (at least ${STEM_MIN} characters).`)
  if (stem.length > STEM_MAX) throw new BadInput(`The question is too long (${STEM_MAX} characters at most).`)
  if (LINK.test(stem)) throw new BadInput('Links are not allowed in a question.')

  if (!Array.isArray(body.options)) throw new BadInput('Add the answer options.')
  const options = stripOptionLabels(body.options.map((o) => tidy(o, { multiline: false })))
  if (options.length < 4 || options.length > 5) throw new BadInput('A question needs 4 or 5 options.')
  if (options.some((o) => !o)) throw new BadInput('Fill in every option, or remove the empty one.')
  if (options.some((o) => o.length > OPTION_MAX)) throw new BadInput(`An option is too long (${OPTION_MAX} characters at most).`)
  if (options.some((o) => LINK.test(o))) throw new BadInput('Links are not allowed in an option.')
  if (new Set(options.map((o) => o.toLowerCase().replace(/\s+/g, ''))).size !== options.length) throw new BadInput('Two options are the same.')

  let answer = null
  if (body.answer !== undefined && body.answer !== null && body.answer !== '') {
    if (!Number.isInteger(body.answer) || body.answer < 0 || body.answer >= options.length) throw new BadInput('The correct answer must be one of the options.')
    answer = body.answer
  }

  return { stem, options, answer, ...cleanTags(body, now), allowSimilar: body.allowSimilar === true }
}

/** The optional exam name, exam type and year that go with any added question. */
function cleanTags(body, now) {
  const examName = canonicalExamName(body.examName)
  const examType = EXAM_TYPES.includes(body.examType) ? body.examType : DEFAULT_EXAM_TYPE

  let year = null
  if (body.year !== undefined && body.year !== null && body.year !== '') {
    const y = Number(body.year)
    const max = new Date(now).getUTCFullYear() + 1
    if (!Number.isInteger(y) || y < MIN_YEAR || y > max) throw new BadInput(`The year must be between ${MIN_YEAR} and ${max}.`)
    year = y
  }
  return { examName, examType, year }
}

export const QUADRATIC_TEXT_MAX = 400

/** What a person submits to the quadratic bank: the two pasted equations, plus the same optional tags. */
export function cleanQuadraticInput(body, now = Date.now()) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadInput('Invalid request.')
  const text = tidy(body.text, { multiline: true })
  if (text.length < 5) throw new BadInput('Paste the two equations (I. and II.).')
  if (text.length > QUADRATIC_TEXT_MAX) throw new BadInput(`That is too long for two equations (${QUADRATIC_TEXT_MAX} characters at most).`)
  if (LINK.test(text)) throw new BadInput('Links are not allowed in a question.')
  return { text, ...cleanTags(body, now) }
}
