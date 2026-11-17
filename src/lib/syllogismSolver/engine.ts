// The logic behind the Syllogism Solver.
//
// A "picture" is a set of occupied Venn regions (a region = which circles it lies inside). Every statement either removes
// regions (All / No) or demands that some region is occupied (Some / Some-not / "every group named has members").
// Because those are the ONLY kinds of constraint, a picture exists exactly when "all regions that are still allowed are
// occupied" satisfies every demand — so no enumeration is needed, even with 6 groups:
//   • a conclusion FOLLOWS     ⇔ no picture makes it false  (adding "it is false" leaves the statements unsatisfiable)
//   • a conclusion is POSSIBLE ⇔ some picture makes it true
// The same machinery checks every drawn diagram (see worldIsValid), so a diagram can never show something the statements forbid.

import { closure, keyOf, proofSteps, propText, type Fact, type Form, type Stmt, type Term } from '../syllogism'
import type { ParsedQuestion, Sentence } from './parse'

export type Rel = 'DJ' | 'OV' | 'IN' | 'CT' | 'EQ' // disjoint · overlap · a inside b · a contains b · same set

export interface Literal {
  form: Form
  x: number
  y: number
  truth: boolean
}

export interface Constraint {
  kind: 'forbid' | 'need'
  set: Uint8Array
}

export interface Model {
  k: number
  n: number // 1 << k ; regions are 1 … n-1
  base: Constraint[]
}

const bit = (r: number, t: number) => ((r >> t) & 1) === 1

function regionSet(k: number, pred: (r: number) => boolean): Uint8Array {
  const n = 1 << k
  const s = new Uint8Array(n)
  for (let r = 1; r < n; r++) if (pred(r)) s[r] = 1
  return s
}

function statementConstraints(k: number, s: Sentence): Constraint[] {
  const { x, y } = s
  const xy = regionSet(k, (r) => bit(r, x) && bit(r, y))
  const xny = regionSet(k, (r) => bit(r, x) && !bit(r, y))
  if (s.few) return [{ kind: 'need', set: xy }, { kind: 'need', set: xny }]
  switch (s.form) {
    case 'A':
      return [{ kind: 'forbid', set: xny }]
    case 'E':
      return [{ kind: 'forbid', set: xy }]
    case 'I':
      return [{ kind: 'need', set: xy }]
    case 'O':
      return [{ kind: 'need', set: xny }]
  }
}

/** Statements + the exam convention that every group named in a statement has at least one member. */
export function buildModel(q: ParsedQuestion): Model {
  const k = q.terms.length
  const base: Constraint[] = []
  const used = new Set<number>()
  for (const s of q.statements) {
    base.push(...statementConstraints(k, s))
    used.add(s.x)
    used.add(s.y)
  }
  for (const t of used) base.push({ kind: 'need', set: regionSet(k, (r) => bit(r, t)) })
  return { k, n: 1 << k, base }
}

export function consistent(model: Model, extra: Constraint[] = []): boolean {
  const n = model.n
  const forbidden = new Uint8Array(n)
  for (const list of [model.base, extra]) {
    for (const c of list) if (c.kind === 'forbid') for (let r = 1; r < n; r++) if (c.set[r]) forbidden[r] = 1
  }
  for (const list of [model.base, extra]) {
    for (const c of list) {
      if (c.kind !== 'need') continue
      let ok = false
      for (let r = 1; r < n; r++) {
        if (c.set[r] && !forbidden[r]) {
          ok = true
          break
        }
      }
      if (!ok) return false
    }
  }
  return true
}

export function literalConstraint(k: number, l: Literal): Constraint {
  const xy = regionSet(k, (r) => bit(r, l.x) && bit(r, l.y))
  const xny = regionSet(k, (r) => bit(r, l.x) && !bit(r, l.y))
  // truth: A forbids x-outside-y · E forbids x∩y · I needs x∩y · O needs x-outside-y ; falsity is the mirror image
  const needs = l.truth ? l.form === 'I' || l.form === 'O' : l.form === 'A' || l.form === 'E'
  const set = l.form === 'A' || l.form === 'O' ? xny : xy
  return { kind: needs ? 'need' : 'forbid', set }
}

export function relConstraints(k: number, a: number, b: number, rel: Rel): Constraint[] {
  const ab = regionSet(k, (r) => bit(r, a) && bit(r, b))
  const aO = regionSet(k, (r) => bit(r, a) && !bit(r, b))
  const bO = regionSet(k, (r) => bit(r, b) && !bit(r, a))
  switch (rel) {
    case 'DJ':
      return [{ kind: 'forbid', set: ab }]
    case 'OV':
      return [{ kind: 'need', set: ab }, { kind: 'need', set: aO }, { kind: 'need', set: bO }]
    case 'IN':
      return [{ kind: 'forbid', set: aO }, { kind: 'need', set: bO }, { kind: 'need', set: ab }]
    case 'CT':
      return [{ kind: 'forbid', set: bO }, { kind: 'need', set: aO }, { kind: 'need', set: ab }]
    case 'EQ':
      return [{ kind: 'forbid', set: aO }, { kind: 'forbid', set: bO }, { kind: 'need', set: ab }]
  }
}

/** Does `form(x, y)` hold in a drawn picture, given the zones (non-empty regions) it contains? */
export function holdsIn(zones: number[], form: Form, x: number, y: number): boolean {
  const some = zones.some((z) => bit(z, x) && bit(z, y))
  const someNot = zones.some((z) => bit(z, x) && !bit(z, y))
  switch (form) {
    case 'I':
      return some
    case 'E':
      return !some
    case 'O':
      return someNot
    case 'A':
      return !someNot
  }
}

/**
 * A diagram of the circles `focus` whose non-empty zones are `zones` is valid when it is the "shadow" of a full picture of all
 * the groups that obeys every statement: no region outside the drawn zones is occupied, and every drawn zone really can be.
 */
export function worldIsValid(model: Model, focus: number[], zones: number[], lits: Literal[]): boolean {
  for (const l of lits) if (holdsIn(zones, l.form, l.x, l.y) !== l.truth) return false
  const fm = focus.reduce((m, t) => m | (1 << t), 0)
  const have = new Set(zones)
  const extra: Constraint[] = [{ kind: 'forbid', set: regionSet(model.k, (r) => (r & fm) !== 0 && !have.has(r & fm)) }]
  for (const z of zones) extra.push({ kind: 'need', set: regionSet(model.k, (r) => (r & fm) === z) })
  return consistent(model, extra)
}

// ---------- verdicts ----------

export interface Verdict {
  /** Definite conclusion: true in every picture. Possibility: true in at least one. */
  follows: boolean
  /** True in at least one picture. */
  possible: boolean
}

export function verdictOf(model: Model, c: Sentence): Verdict {
  const possible = consistent(model, [literalConstraint(model.k, { form: c.form, x: c.x, y: c.y, truth: true })])
  if (c.possibility) return { follows: possible, possible }
  const canFail = consistent(model, [literalConstraint(model.k, { form: c.form, x: c.x, y: c.y, truth: false })])
  return { follows: !canFail, possible }
}

const sameTerms = (a: Sentence, b: Sentence) => (a.x === b.x && a.y === b.y) || (a.x === b.y && a.y === b.x)

/** "Either I or II": opposite statements about the same two groups (Some ↔ No, or All ↔ Some-not). */
export function isComplementary(a: Sentence, b: Sentence): boolean {
  if (a.possibility || b.possibility || a.few || b.few) return false
  if ((a.form === 'I' && b.form === 'E') || (a.form === 'E' && b.form === 'I')) return sameTerms(a, b)
  if ((a.form === 'A' && b.form === 'O') || (a.form === 'O' && b.form === 'A')) return a.x === b.x && a.y === b.y
  return false
}

export const OPTION_TEXT = [
  'Only conclusion I follows',
  'Only conclusion II follows',
  'Either conclusion I or II follows',
  'Neither conclusion I nor II follows',
  'Both conclusions I and II follow',
] as const
export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const

export function correctOption(v1: boolean, v2: boolean, either: boolean): number {
  if (either) return 2
  if (v1 && v2) return 4
  if (v1) return 0
  if (v2) return 1
  return 3
}

// ---------- written proofs (rule chains) ----------

export interface Reasoning {
  stmts: Stmt[]
  facts: Map<string, Fact>
  terms: Term[]
}

export function buildReasoning(q: ParsedQuestion): Reasoning {
  const stmts: Stmt[] = q.statements.map((s) =>
    s.few ? { few: true, props: [{ form: 'I', x: s.x, y: s.y }, { form: 'O', x: s.x, y: s.y }] } : { few: false, props: [{ form: s.form, x: s.x, y: s.y }] },
  )
  return { stmts, facts: closure(stmts), terms: q.terms }
}

/** The chain of statements that proves `form(x,y)`, [] when it is simply stated, null when the rules cannot derive it. */
export function proofOf(rs: Reasoning, form: Form, x: number, y: number): string[] | null {
  const key = keyOf({ form, x, y })
  if (!rs.facts.has(key)) return null
  return proofSteps(key, rs.facts, rs.stmts, rs.terms)
}

/** A derived fact that contradicts `form(x,y)` — the reason a conclusion can never be true. */
export function blockerOf(rs: Reasoning, form: Form, x: number, y: number): { text: string; lines: string[] } | null {
  const get = (f: Form) => rs.facts.get(keyOf({ form: f, x, y }))
  const fact = form === 'A' ? (get('O') ?? get('E')) : form === 'E' ? (get('I') ?? get('A')) : form === 'I' ? get('E') : get('A')
  if (!fact) return null
  return { text: propText(fact.p, rs.terms), lines: proofSteps(keyOf(fact.p), rs.facts, rs.stmts, rs.terms) }
}

export const formText = (form: Form, x: number, y: number, terms: Term[]) => propText({ form, x, y }, terms)
