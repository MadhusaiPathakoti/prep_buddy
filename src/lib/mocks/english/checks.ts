// Deterministic checks and duplicate tracking for the English pipeline (no network, no storage).

import type { EnglishTopicId, Group, MockDifficulty, QuestionDraft } from '../types'
import { validateDraft } from '../validate'

// ---------------------------------------------------------------------------------------------------
// Text utilities
// ---------------------------------------------------------------------------------------------------

export const normKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9À-ÿ]+/g, ' ')
    .trim()

export function jaccard(a: string, b: string): number {
  const sa = new Set(normKey(a).split(' '))
  const sb = new Set(normKey(b).split(' '))
  let inter = 0
  for (const x of sa) if (sb.has(x)) inter++
  const union = sa.size + sb.size - inter
  return union === 0 ? 0 : inter / union
}

export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0)
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Latin-1 plus the extra symbols and typography the PDF writer maps (see types.ts). */
const ALLOWED_TEXT = /^[\n\x20-\x7e\xa1-\xff−√≤≥≠₹→∴‘’“”–—•]*$/
const HYGIENE =
  /```|`|\*|<\/?[a-z][^>]*>|as an ai\b|language model|\bTODO\b|\bTBD\b|lorem ipsum|\[\s*(?:insert|blank|placeholder|option|passage|your)|\{\{|\}\}|\bundefined\b|\bNaN\b|\[object/i

export function textProblem(s: unknown, allowBlank = false): string | null {
  if (typeof s !== 'string' || !s.trim()) return 'empty text'
  if (!ALLOWED_TEXT.test(s)) return 'unsupported character'
  if (HYGIENE.test(s)) return 'placeholder or markdown text'
  if (!allowBlank && /_{2,}/.test(s)) return 'stray blank marker'
  return null
}

// ---------------------------------------------------------------------------------------------------
// Per-topic format checks
// ---------------------------------------------------------------------------------------------------

const ED_OPTIONS = ['(a)', '(b)', '(c)', '(d)', 'No error']
const NO_INTERCHANGE = 'No interchange required'
const NO_CORRECTION = 'No correction required'
export const VOCAB_STEM = /^Which of the following words is most (?:similar|opposite) in meaning to the word “([^”]+)” as used in the passage\?$/
/** Wide on purpose: the prompt asks for 380-450 / 250-320 words, but a sound passage 20% short is still sound. */
export const RC_RANGE: Record<MockDifficulty, [number, number]> = { hard: [250, 560], medium: [170, 420] }
const CLOZE_WORDS: [number, number] = [90, 300]

export const passageText = (g: Group): string =>
  (g.stimulus?.parts ?? [])
    .map((p) => (p.kind === 'text' ? p.paragraphs.join('\n\n') : ''))
    .filter(Boolean)
    .join('\n\n')

export const contentOf = (stem: string): string => {
  const i = stem.indexOf('\n\n')
  return i >= 0 ? stem.slice(i + 2) : stem
}

function checkErrorDetection(q: QuestionDraft): string | null {
  if (q.options[4] === 'No error') {
    if (q.options.some((o, i) => o !== ED_OPTIONS[i])) return 'error-detection options must be (a)(b)(c)(d) and No error in order'
    const pos = ['(a) ', '(b) ', '(c) ', '(d) '].map((m) => q.stem.indexOf(m))
    if (pos.some((p, i) => p < 0 || (i > 0 && p <= pos[i - 1]))) return 'error-detection stem must show parts (a)-(d) in order'
    const parts = q.stem.slice(pos[0]).split(/\([a-d]\) /).slice(1).map((p) => p.trim())
    if (parts.length !== 4 || parts.some((p) => wordCount(p) < 2)) return 'error-detection needs 4 parts of at least 2 words'
    const joined = parts.join(' ')
    if (!/^[A-Z"'\u201c\u2018]/.test(joined) || !/[.!?]["'\u201d\u2019]?$/.test(joined)) return 'error-detection parts do not form one complete sentence'
    return null
  }
  if (!/^Which of the following sentences/.test(q.stem)) return 'error-detection sentence variant must ask which sentence is correct'
  if (q.options.some((o) => wordCount(o) < 6)) return 'error-detection sentence options too short'
  return null
}

function checkParaJumble(q: QuestionDraft): string | null {
  const rows = [...q.stem.matchAll(/^([A-F])\. (.+)$/gm)]
  const n = rows.length
  if (n < 5 || n > 6) return 'para-jumble needs 5 or 6 labelled sentences'
  const letters = rows.map((r) => r[1]).join('')
  if (letters !== 'ABCDEF'.slice(0, n)) return 'para-jumble sentence letters must be contiguous from A'
  if (new Set(rows.map((r) => normKey(r[2]))).size !== n) return 'para-jumble repeats a sentence'
  if (q.options.every((o) => /^[A-F]{5,6}$/.test(o))) {
    const sorted = letters.split('').sort().join('')
    if (q.options.some((o) => o.length !== n || o.split('').sort().join('') !== sorted)) return 'para-jumble options must be permutations of the same letters'
    return null
  }
  if (q.options.every((o) => o.length === 1 && letters.includes(o))) {
    if (!/\b(?:FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH)\b/.test(q.stem)) return 'para-jumble position question does not name a position'
    return null
  }
  return 'para-jumble options are neither orders nor sentence letters'
}

function checkFillers(q: QuestionDraft): string | null {
  const body = contentOf(q.stem)
  const blanks = body.match(/______/g)?.length ?? 0
  if (/_{7,}/.test(body) || /_(?!_)/.test(body.replace(/______/g, ''))) return 'fillers has a malformed blank'
  if (blanks === 1) {
    if (/\([AB]\)/.test(body)) return 'single filler must not label its blank'
    if (q.options.some((o) => o.includes(',') || wordCount(o) > 3)) return 'single filler options must be short single words'
    return null
  }
  if (blanks === 2) {
    if (body.indexOf('(A) ______') < 0 || body.indexOf('(B) ______') < body.indexOf('(A) ______')) return 'double filler blanks must be (A) then (B)'
    if (!q.options.every((o) => /^[^,]+, [^,]+$/.test(o))) return 'double filler options must be word pairs'
    return null
  }
  return 'fillers needs one or two blanks'
}

function checkWordSwap(q: QuestionDraft): string | null {
  const body = contentOf(q.stem)
  let last = -1
  for (const k of [1, 2, 3, 4]) {
    const matches = body.match(new RegExp(`\\(${k}\\)[A-Za-z]`, 'g'))
    const at = body.search(new RegExp(`\\(${k}\\)[A-Za-z]`))
    if (!matches || matches.length !== 1 || at <= last) return 'word-swap markers (1)-(4) must each appear once, in order'
    last = at
  }
  if (q.options[4] !== NO_INTERCHANGE) return 'word-swap last option must be "No interchange required"'
  const seen = new Set<string>()
  for (const o of q.options.slice(0, 4)) {
    const m = /^\(([1-4])\) and \(([1-4])\)$/.exec(o)
    if (!m || Number(m[1]) >= Number(m[2])) return 'word-swap options must be "(i) and (j)" with i < j'
    seen.add(o)
  }
  return seen.size === 4 ? null : 'word-swap pair options repeat'
}

function checkPhrase(q: QuestionDraft): string | null {
  const body = contentOf(q.stem)
  if (body.includes('______')) {
    if ((body.match(/______/g) ?? []).length !== 1) return 'phrase usage needs exactly one blank'
    if (q.options.some((o) => o === NO_CORRECTION)) return 'phrase usage must not offer "No correction required"'
    return null
  }
  if (q.options[4] !== NO_CORRECTION) return 'phrase-replacement last option must be "No correction required"'
  if (!/\b[A-Z][A-Z'-]+\b/.test(body)) return 'phrase-replacement stem has no capitalised phrase'
  if (q.options.slice(0, 4).some((o) => normKey(o) === normKey(NO_CORRECTION))) return 'phrase-replacement repeats "No correction required"'
  return null
}

function checkMatchColumn(q: QuestionDraft): string | null {
  const i1 = q.stem.indexOf('Column I\n')
  const i2 = q.stem.indexOf('Column II\n')
  if (i1 < 0 || i2 < i1) return 'match-column stem needs Column I and Column II'
  const col1 = [...q.stem.slice(i1, i2).matchAll(/^([1-4])\. (.+)$/gm)].map((m) => m[1]).join('')
  const col2 = [...q.stem.slice(i2).matchAll(/^([A-D])\. (.+)$/gm)].map((m) => m[1]).join('')
  if (col1 !== '1234' || col2 !== 'ABCD') return 'match-column columns must list 1-4 and A-D'
  for (const o of q.options) {
    const m = /^1-([A-D]), 2-([A-D]), 3-([A-D]), 4-([A-D])$/.exec(o)
    if (!m || new Set(m.slice(1)).size !== 4) return 'match-column options must be one-to-one matchings'
  }
  return null
}

const BARE_BOOL = /^(?:true|false|yes|no)[.!]?$/i

/** Shape of a non-vocabulary RC question: a real question / completion stem (not a statement), no bare True/False/Yes/No
 *  options, homogeneous options, and a stem that is not a sentence lifted from the passage. */
export function rcQuestionShape(stem: string, options: string[], passage: string): string | null {
  if (/[.!]\s*$/.test(stem)) return 'rc stem is a statement, not a question'
  if (options.some((o) => BARE_BOOL.test(o))) return 'rc options contain a bare True/False/Yes/No'
  const wcs = options.map(wordCount)
  const lo = Math.min(...wcs)
  const hi = Math.max(...wcs)
  if ((lo <= 2 && hi >= 7) || (lo <= 3 && hi >= 4 * lo && hi >= 8)) return 'rc options are not homogeneous (single words next to sentences)'
  const stemWords = normKey(stem).split(' ')
  const norm = normKey(passage)
  for (const sent of passage.split(/(?<=[.!?])\s+/)) if (wordCount(sent) >= 8 && jaccard(stem, sent) >= 0.8) return 'rc stem restates a passage sentence'
  for (let i = 0; i + 12 <= stemWords.length; i++) if (norm.includes(stemWords.slice(i, i + 12).join(' '))) return 'rc stem restates a passage sentence'
  return null
}

function checkRcQuestion(q: QuestionDraft, passage: string): string | null {
  const v = VOCAB_STEM.exec(q.stem)
  if (v) {
    const target = v[1]
    if (!new RegExp(`(?<![A-Za-z'-])${escRe(target)}(?![A-Za-z'-])`, 'i').test(passage)) return 'vocabulary target word is not in the passage'
    if (q.options.some((o) => wordCount(o) > 3 || normKey(o) === normKey(target))) return 'vocabulary options must be short and exclude the target'
    return null
  }
  if (/as used in the passage/i.test(q.stem)) return 'vocabulary-style stem is malformed'
  if (q.stem.length < 20) return 'rc stem too short'
  const shape = rcQuestionShape(q.stem, q.options, passage)
  if (shape) return shape
  if (/\b(?:all|none) of the above\b/i.test(q.options.join(' | '))) return 'rc option refers to other options'
  return null
}

/** Returns the questions of `g` that pass the topic's deterministic checks, plus reasons for rejections. A group
 *  whose stimulus is unusable (or, for cloze, any unusable blank) is rejected whole. */
export function checkEnglishGroup(topic: EnglishTopicId, difficulty: MockDifficulty, g: Group): { group: Group | null; reasons: string[] } {
  const reasons: string[] = []
  const fail = (why: string) => {
    reasons.push(why)
    return { group: null, reasons }
  }
  if (!g || !Array.isArray(g.questions) || g.questions.length === 0) return fail('empty group')
  const isSet = topic === 'rc' || topic === 'cloze'

  if (!isSet) {
    if (g.stimulus) return fail('standalone topic must not have a stimulus')
    if (g.questions.length !== 1) return fail('standalone topic group must hold one question')
  } else {
    const st = g.stimulus
    if (!st || !Array.isArray(st.parts) || st.parts.length !== 1 || st.parts[0].kind !== 'text') return fail('passage topic needs one text stimulus part')
    if (st.directions !== undefined && textProblem(st.directions)) return fail('bad directions text')
    const paras = st.parts[0].paragraphs
    const bad = paras.map((p) => textProblem(p, topic === 'cloze')).find(Boolean)
    if (bad) return fail(`passage: ${bad}`)
  }

  const qBad = (q: QuestionDraft): string | null => {
    const base = validateDraft(q)
    if (base) return base
    if (q.topic !== topic) return 'question topic does not match'
    const parts = [q.stem, q.explanation, ...q.options]
    for (const p of parts) {
      const t = textProblem(p, true)
      if (t) return t
    }
    if (/_{2,}/.test(q.explanation) || q.options.some((o) => /_{2,}/.test(o))) return 'blank marker in options or explanation'
    return null
  }

  if (topic === 'cloze') {
    const text = passageText(g)
    const wc = wordCount(text.replace(/\(\d{1,2}\) ______/g, 'x'))
    if (wc < CLOZE_WORDS[0] || wc > CLOZE_WORDS[1]) return fail(`cloze passage length ${wc}`)
    const nums = [...text.matchAll(/\((\d{1,2})\) ______/g)].map((m) => Number(m[1]))
    if (nums.length !== g.questions.length || nums.some((n, i) => n !== i + 1)) return fail('cloze blank numbers must be contiguous 1..N and match the questions')
    if (text.replace(/\(\d{1,2}\) ______/g, '').includes('__')) return fail('cloze has a malformed blank')
    for (let i = 0; i < g.questions.length; i++) {
      const q = g.questions[i]
      const why = qBad(q)
      if (why) return fail(`cloze blank ${i + 1}: ${why}`)
      if (q.stem !== `Select the most appropriate word to fill blank (${i + 1}).`) return fail(`cloze blank ${i + 1}: stem does not name its blank`)
      if (q.options.some((o) => wordCount(o) > 3)) return fail(`cloze blank ${i + 1}: option too long`)
    }
    return { group: g, reasons }
  }

  if (topic === 'rc') {
    const text = passageText(g)
    const [lo, hi] = RC_RANGE[difficulty]
    const wc = wordCount(text)
    if (wc < lo || wc > hi) return fail(`rc passage length ${wc} outside ${lo}-${hi}`)
    if (g.questions.length > 12) return fail('rc passage has too many questions')
    const kept: QuestionDraft[] = []
    const stems: string[] = []
    const targets = new Set<string>()
    for (const q of g.questions) {
      const why = qBad(q) || checkRcQuestion(q, text)
      if (why) {
        reasons.push(`rc q: ${why}`)
        continue
      }
      const v = VOCAB_STEM.exec(q.stem)
      if (v) {
        const t = v[1].toLowerCase()
        if (targets.has(t)) {
          reasons.push('rc q: repeated vocabulary word')
          continue
        }
        targets.add(t)
      } else {
        if (stems.some((s) => jaccard(s, q.stem) >= 0.9)) {
          reasons.push('rc q: near-duplicate stem')
          continue
        }
        stems.push(q.stem)
      }
      kept.push(q)
    }
    return kept.length ? { group: { stimulus: g.stimulus, questions: kept }, reasons } : fail('rc: no question passed')
  }

  const q = g.questions[0]
  const why =
    qBad(q) ||
    (topic === 'error-detection'
      ? checkErrorDetection(q)
      : topic === 'para-jumble'
        ? checkParaJumble(q)
        : topic === 'fillers'
          ? checkFillers(q)
          : topic === 'word-swap'
            ? checkWordSwap(q)
            : topic === 'phrase-replacement'
              ? checkPhrase(q)
              : checkMatchColumn(q))
  return why ? fail(why) : { group: g, reasons }
}

// ---------------------------------------------------------------------------------------------------
// Duplicate tracking
// ---------------------------------------------------------------------------------------------------

/** Text that identifies a question's content (directions stripped, options included for sentence-type questions). */
export function dedupeText(q: QuestionDraft): string | null {
  if (q.topic === 'cloze') return null
  const v = VOCAB_STEM.exec(q.stem)
  if (v) return `vocab ${v[1].toLowerCase()}`
  return `${contentOf(q.stem)} ${q.options.join(' ')}`
}

/** Stable identity of a group's content, used by the bank and for removing consumed groups. */
export function groupKey(g: Group): string {
  const p = passageText(g)
  if (p) return `p:${normKey(p).slice(0, 220)}`
  const t = dedupeText(g.questions[0])
  return `q:${normKey(t ?? g.questions[0].stem).slice(0, 300)}`
}

export class SeenIndex {
  private passages: string[] = []
  private texts: string[] = []
  private keys = new Set<string>()

  /** true when the group (or, for set topics, its passage) is new. */
  isNewGroup(g: Group): boolean {
    const p = passageText(g)
    if (p) {
      if (this.keys.has(groupKey(g))) return false
      return !this.passages.some((x) => jaccard(x, p) >= 0.6)
    }
    return g.questions.every((q) => this.isNewQuestion(q))
  }

  private isNewQuestion(q: QuestionDraft): boolean {
    const t = dedupeText(q)
    if (!t) return true
    if (this.keys.has(`q:${normKey(t)}`)) return false
    return normKey(t).split(' ').length < 8 || !this.texts.some((x) => jaccard(x, t) >= 0.85)
  }

  add(g: Group) {
    const p = passageText(g)
    if (p) {
      this.keys.add(groupKey(g))
      this.passages.push(p)
    }
    for (const q of g.questions) {
      const t = dedupeText(q)
      if (!t) continue
      this.keys.add(`q:${normKey(t)}`)
      this.texts.push(t)
    }
  }
}
