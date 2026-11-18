// Read paths for questions people have added (the launch questions are static files and need no server):
//   GET /api/qb?action=index                 -> { entries: [...] }   the list, cached by the CDN for a minute
//   GET /api/qb?action=question&id=q-...     -> the full question      cached for an hour (a question never changes)

import { firestoreConfigured, getDoc } from './firestoreAdmin.js'
import { loadUserEntries, publicEntry } from './qbIndex.js'
import { redisConfigured } from './redis.js'

const ID_RE = /^q-[0-9a-f]{20}$/

// A visitor who has just added a question skips the CDN copy (`t` parameter) so they see it straight away. Cap that
// per visitor, so the parameter cannot be used to hammer Redis.
const BUST_LIMIT = 6
const BUST_WINDOW_MS = 60_000
const bustHits = new Map()
function bustAllowed(ip) {
  const now = Date.now()
  const recent = (bustHits.get(ip) || []).filter((t) => now - t < BUST_WINDOW_MS)
  if (recent.length >= BUST_LIMIT) {
    bustHits.set(ip, recent)
    return false
  }
  recent.push(now)
  bustHits.set(ip, recent)
  if (bustHits.size > 5000) for (const k of bustHits.keys()) { bustHits.delete(k); if (bustHits.size < 2500) break }
  return true
}

export async function handleIndex(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const busting = typeof req.query?.t === 'string'
  if (busting) {
    const ip = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
    if (!bustAllowed(ip)) {
      res.setHeader('Cache-Control', 'no-store')
      res.status(429).json({ error: 'Too many refreshes. Try again in a minute.' })
      return
    }
  }
  if (!redisConfigured()) {
    // nobody can have added questions without it, so the honest answer is an empty list (briefly cached)
    res.setHeader('Cache-Control', 'public, s-maxage=60')
    res.status(200).json({ entries: [] })
    return
  }
  try {
    const entries = (await loadUserEntries()).map(publicEntry)
    res.setHeader('Cache-Control', busting ? 'private, no-store' : 'public, max-age=30, s-maxage=60, stale-while-revalidate=600')
    res.status(200).json({ entries })
  } catch {
    res.setHeader('Cache-Control', 'no-store')
    res.status(502).json({ error: 'The added questions are temporarily unavailable.' })
  }
}

export async function handleQuestion(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const id = typeof req.query?.id === 'string' ? req.query.id : ''
  if (!ID_RE.test(id)) {
    res.status(400).json({ error: 'Unknown question.' })
    return
  }
  if (!firestoreConfigured()) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(503).json({ error: 'Added questions are not available on this server.' })
    return
  }
  try {
    const doc = await getDoc('quantQuestions', id)
    if (!doc) {
      res.setHeader('Cache-Control', 'no-store')
      res.status(404).json({ error: 'That question is not in the bank.' })
      return
    }
    // who added it is not shown to others
    const { addedBy: _addedBy, ...question } = doc
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600')
    res.status(200).json(question)
  } catch {
    res.setHeader('Cache-Control', 'no-store')
    res.status(502).json({ error: 'That question is temporarily unavailable.' })
  }
}
