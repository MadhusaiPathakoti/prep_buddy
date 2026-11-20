// Types for qbQuadratic.js, which the browser (live preview) and the server (what gets stored) both import.

export class QuadraticError extends Error {}

export interface QuadraticStepText {
  title: string
  lines: string[]
}

export interface QuadraticSolved {
  /** The variable of equation I and of equation II (normally x and y). */
  vars: [string, string]
  /** The two equations as they appear in the question (neat spacing, a real minus sign, ²). */
  equations: string[]
  /** The full question text: the instruction line, then "I. …" and "II. …". */
  stem: string
  /** Always five options: x > y, x ≥ y, x < y, x ≤ y, x = y or relationship cannot be established. */
  options: string[]
  answerIndex: number
  steps: QuadraticStepText[]
  /** "Step 1: …" blocks and a closing "Correct answer: (C) x < y" line, as the bank stores a solution. */
  solution: string
  /** The two equations in a typing-independent form; the question id is a hash of this. */
  canonical: string
  difficulty: 'medium' | 'hard'
  /** The exact roots of each equation, e.g. [["√6/6", "2√6/3"], ["3√7/4", "2√7"]] (empty when there are none). */
  roots: string[][]
}

export const STEM_HEADER: string
export function parseQuadraticInput(text: string): string[]
export function solveQuadraticPair(text: string): QuadraticSolved
export function canonicalOfStem(stem: string): string | null
