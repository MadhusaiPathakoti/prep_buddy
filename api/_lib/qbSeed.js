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
