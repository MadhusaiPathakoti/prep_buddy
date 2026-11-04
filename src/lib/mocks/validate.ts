import type { QuestionDraft, Group, Stimulus } from './types'

const BAD_TOKENS = /undefined|NaN|Infinity|\[object|null\b/

/** Returns an error message if the question is structurally unusable, otherwise null. Semantic correctness is each generator's job. */
export function validateDraft(q: QuestionDraft): string | null {
  if (!q || typeof q !== 'object') return 'not an object'
  if (typeof q.stem !== 'string' || q.stem.trim().length < 8) return 'stem missing/too short'
  if (typeof q.explanation !== 'string' || q.explanation.trim().length < 5) return 'explanation missing'
  if (!Array.isArray(q.options) || q.options.length !== 5) return 'options must have exactly 5 entries'
  if (!q.options.every((o) => typeof o === 'string' && o.trim() !== '')) return 'empty option'
  const norm = q.options.map((o) => o.trim().toLowerCase().replace(/\s+/g, ' '))
  if (new Set(norm).size !== 5) return 'duplicate options'
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 4) return 'answer index out of range'
  if (BAD_TOKENS.test(q.stem) || q.options.some((o) => BAD_TOKENS.test(o)) || BAD_TOKENS.test(q.explanation)) return 'contains undefined/NaN/null artefact'
  return null
}

function validateStimulus(s: Stimulus): string | null {
  if (!s || !Array.isArray(s.parts) || s.parts.length === 0) return 'stimulus has no parts'
  for (const p of s.parts) {
    if (p.kind === 'text') {
      if (!p.paragraphs.length || p.paragraphs.some((x) => typeof x !== 'string' || !x.trim())) return 'empty text paragraph'
    } else if (p.kind === 'table') {
      if (!p.columns.length || !p.rows.length || p.rows.some((r) => r.length !== p.columns.length)) return 'ragged table'
    } else if (p.kind === 'bar' || p.kind === 'line') {
      if (!p.categories.length || !p.series.length || p.series.some((x) => x.values.length !== p.categories.length || x.values.some((v) => !Number.isFinite(v)))) return 'bad chart series'
    } else if (p.kind === 'pie') {
      if (p.slices.length < 2 || p.slices.some((x) => !Number.isFinite(x.value) || x.value < 0)) return 'bad pie slices'
    } else return 'unknown stimulus part'
  }
  const json = JSON.stringify(s)
  if (BAD_TOKENS.test(json)) return 'stimulus contains undefined/NaN/null artefact'
  return null
}

/** Throws a descriptive error for the first structural problem in a group. */
export function assertGroup(g: Group, context: string): void {
  if (!g.questions.length) throw new Error(`${context}: empty group`)
  if (g.stimulus) {
    const e = validateStimulus(g.stimulus)
    if (e) throw new Error(`${context}: ${e}`)
  }
  g.questions.forEach((q, i) => {
    const e = validateDraft(q)
    if (e) throw new Error(`${context} q${i + 1}: ${e}`)
  })
}
