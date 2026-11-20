// The launch questions' ids and similarity fingerprints (written by `npm run build:qbank` into seedSigs.json), so a new
// question can be checked against them without loading the questions themselves.

import { readFileSync } from 'node:fs'
import { SimilarIndex } from './qbSimilar.js'

let cached = null

export function loadSeed() {
  if (cached) return cached
  const ids = new Set()
  const similar = new SimilarIndex()
  try {
    const rows = JSON.parse(readFileSync(new URL('./seedSigs.json', import.meta.url), 'utf8'))
    for (const [id, n, w] of rows) {
      ids.add(id)
      similar.add(id, { n, w })
    }
  } catch (err) {
    console.error('[qb] could not read seedSigs.json:', err?.message)
  }
  cached = { has: (id) => ids.has(id), similar, size: ids.size }
  return cached
}

let cachedQuad = null

/**
 * The launch quadratic questions the equation solver can read, as canonical-form id -> that question's own id (written by
 * `npm run build:quadkeys` into seedQuadKeys.json). A pasted pair of equations that matches one of them is a duplicate however it was typed.
 */
export function loadSeedQuadKeys() {
  if (cachedQuad) return cachedQuad
  const map = new Map()
  try {
    for (const [canonId, seedId] of JSON.parse(readFileSync(new URL('./seedQuadKeys.json', import.meta.url), 'utf8'))) map.set(canonId, seedId)
  } catch (err) {
    console.error('[qb] could not read seedQuadKeys.json:', err?.message)
  }
  cachedQuad = map
  return cachedQuad
}
