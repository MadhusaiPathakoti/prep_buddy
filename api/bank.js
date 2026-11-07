// Vercel serverless function: a CDN-cached read path for the shared word banks.
//
// Why this exists: every Library / Quiz / Hub visit used to read whole Firestore collections straight from the
// browser (hundreds of document reads per visit), so a few hundred visitors a day would exhaust Firestore's free
// daily read quota. Here ONE server request reads a collection and the Vercel CDN serves the result to everybody
// for an hour (and keeps serving a stale copy while it refreshes), so reads no longer grow with traffic.
//
//   GET /api/bank?collection=idiomsCustomWords            -> { docs: [{ id, data }] }
//   GET /api/bank?collection=idiomsCustomWords&mode=count -> { count }
//
// Only the known bank collections can be read. The Firestore project config below is the same public web config
// that ships in the browser bundle; it is not a secret (access is governed by the security rules).

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'prepbuddy-564d8'
// Public web API key (also embedded in src/lib/firebase.ts). Override with FIREBASE_API_KEY if you rotate it.
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyCpfaegTQ3guibhb012YknkiN_wffPZ5Hk'

const COLLECTIONS = new Set([
  'vocabularyCustomWords', 'vocabularyHiddenSeedWords', 'vocabularyDifficultyOverrides',
  'idiomsCustomWords', 'idiomsHiddenSeedWords', 'idiomsDifficultyOverrides',
  'oneWordSubstitutionCustomWords', 'oneWordSubstitutionHiddenSeedWords', 'oneWordSubstitutionDifficultyOverrides',
  'phrasalVerbsCustomWords', 'phrasalVerbsHiddenSeedWords',
  'wordBankCustomWords', 'wordBankHiddenSeedWords', 'wordBankDifficultyOverrides',
])

const MAX_DOCS = 5000
const FIRESTORE_TIMEOUT_MS = 8000
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`

/** Firestore REST typed value -> plain JS value. */
function decode(v) {
  if (v === null || typeof v !== 'object') return null
  if ('stringValue' in v) return v.stringValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('booleanValue' in v) return v.booleanValue
  if ('timestampValue' in v) return v.timestampValue
  if ('nullValue' in v) return null
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode)
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decode(x)]))
  return null
}

async function firestoreFetch(url, init) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FIRESTORE_TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY } })
    if (!res.ok) throw new Error(`Firestore ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

async function listDocs(collection) {
  const docs = []
  let pageToken = ''
  do {
    const url = `${BASE}/${collection}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
    const page = await firestoreFetch(url, { method: 'GET' })
    for (const d of page.documents || []) {
      docs.push({ id: String(d.name).split('/').pop(), data: Object.fromEntries(Object.entries(d.fields || {}).map(([k, x]) => [k, decode(x)])) })
    }
    pageToken = page.nextPageToken || ''
  } while (pageToken && docs.length < MAX_DOCS)
  return docs
}

async function countDocs(collection) {
  const body = { structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: collection }] }, aggregations: [{ count: {}, alias: 'n' }] } }
  const out = await firestoreFetch(`${BASE}:runAggregationQuery`, { method: 'POST', body: JSON.stringify(body) })
  const n = out?.[0]?.result?.aggregateFields?.n?.integerValue
  return Number(n ?? 0)
}

// Requests that carry a cache-buster (`t`, used by a visitor who just edited the bank, so they see their own change)
// skip the CDN and hit Firestore. Cap those per visitor so the parameter can't be used to drain the read quota.
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

// Concurrent cold requests for the same collection share one Firestore read.
const inflight = new Map()

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const collection = typeof req.query.collection === 'string' ? req.query.collection : ''
  if (!COLLECTIONS.has(collection)) {
    res.status(400).json({ error: 'Unknown collection.' })
    return
  }
  const count = req.query.mode === 'count'
  const busting = typeof req.query.t === 'string'
  if (busting) {
    const ip = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
    if (!bustAllowed(ip)) {
      res.setHeader('Cache-Control', 'no-store')
      res.status(429).json({ error: 'Too many refreshes. Try again in a minute.' })
      return
    }
  }

  const key = `${collection}|${count ? 'count' : 'list'}`
  try {
    let pending = inflight.get(key)
    if (!pending || busting) {
      pending = count ? countDocs(collection).then((n) => ({ count: n })) : listDocs(collection).then((docs) => ({ docs }))
      if (!busting) {
        inflight.set(key, pending)
        pending.finally(() => inflight.delete(key)).catch(() => {})
      }
    }
    const body = await pending
    res.setHeader(
      'Cache-Control',
      busting ? 'private, no-store' : 'public, max-age=60, s-maxage=3600, stale-while-revalidate=86400',
    )
    res.status(200).json(body)
  } catch {
    // Deliberately generic: no upstream detail is passed to the browser. Never cache a failure.
    res.setHeader('Cache-Control', 'no-store')
    res.status(502).json({ error: 'The shared bank is temporarily unavailable.' })
  }
}
