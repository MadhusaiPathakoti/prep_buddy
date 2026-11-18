// "Is this the same question again?" beyond the exact match (api/_lib/qbankKey.js catches identical text).
// Two questions are called similar when they use exactly the same numbers AND mostly the same words, which is what
// a retyped, re-worded or screenshot-misread copy of one question looks like. The numbers must match exactly because
// "5 men finish in 10 days" and "6 men finish in 10 days" are different problems that read almost alike.
// A question's fingerprint is two short strings, small enough to keep one per question in the index.

import { createHash } from 'node:crypto'
import { explicitPowers } from './qbankKey.js'

const NUMBER_RE = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g
/** Words that carry no meaning for matching (question boilerplate and function words). */
const STOP = new Set([
  'the', 'an', 'of', 'in', 'is', 'are', 'was', 'were', 'to', 'and', 'or', 'by', 'for', 'on', 'at', 'as', 'it', 'its', 'that', 'this', 'be', 'than', 'then', 'if',
  'what', 'which', 'who', 'whom', 'how', 'find', 'calculate', 'determine', 'value', 'following', 'question', 'given', 'from', 'with', 'will', 'can', 'has', 'have', 'had',
])
/** Most word hashes kept per question (the smallest ones, a "bottom-k" sketch); short questions keep all their words. */
const SKETCH_SIZE = 24
const SIMILAR_WITH_NUMBERS = 0.65
const SIMILAR_WITHOUT_NUMBERS = 0.85

/** The numbers in a text, sorted, as one string: "14,20,30". Thousands separators are understood ("1,000" is one number). */
export function numbersOf(text) {
  const found = explicitPowers(String(text ?? '')).normalize('NFKC').match(NUMBER_RE) || []
  return found
    .map((s) => Number(s.replace(/,/g, '')))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
    .join(',')
}

function wordsOf(text) {
  const words = String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}]+/gu, ' ')
    .split(' ')
    .filter((w) => w.length > 1 && !STOP.has(w))
  return [...new Set(words)]
}

const hash16 = (word) => parseInt(createHash('sha1').update(word).digest('hex').slice(0, 4), 16)

/** { n: the numbers in the question text, w: a sketch of its words (4 hex digits per word) } */
export function signatureOf(stem) {
  const hashes = [...new Set(wordsOf(stem).map(hash16))].sort((a, b) => a - b).slice(0, SKETCH_SIZE)
  return { n: numbersOf(stem), w: hashes.map((h) => h.toString(16).padStart(4, '0')).join('') }
}

function sketchOf(w) {
  const out = []
  for (let i = 0; i + 4 <= w.length; i += 4) out.push(parseInt(w.slice(i, i + 4), 16))
  return out
}

/** Share of words two questions have in common, 0 to 1. */
export function wordOverlap(wa, wb) {
  const a = new Set(sketchOf(wa))
  const b = new Set(sketchOf(wb))
  if (!a.size || !b.size) return 0
  const union = [...new Set([...a, ...b])].sort((x, y) => x - y)
  const smallest = union.slice(0, Math.min(SKETCH_SIZE, union.length))
  let both = 0
  for (const h of smallest) if (a.has(h) && b.has(h)) both++
  return both / smallest.length
}

export function isSimilar(a, b) {
  if (a.n !== b.n) return false
  return wordOverlap(a.w, b.w) >= (a.n === '' ? SIMILAR_WITHOUT_NUMBERS : SIMILAR_WITH_NUMBERS)
}

/** Finds an earlier question that is similar to a new one. Questions are bucketed by their numbers, so a lookup is cheap. */
export class SimilarIndex {
  constructor() {
    this.buckets = new Map()
    this.size = 0
  }

  add(id, sig) {
    if (!sig || typeof sig.n !== 'string' || typeof sig.w !== 'string') return
    const list = this.buckets.get(sig.n) ?? []
    list.push({ id, w: sig.w })
    this.buckets.set(sig.n, list)
    this.size++
  }

  /** The id of a similar earlier question, or null. */
  find(sig) {
    for (const other of this.buckets.get(sig.n) ?? []) {
      if (isSimilar(sig, { n: sig.n, w: other.w })) return other.id
    }
    return null
  }
}
