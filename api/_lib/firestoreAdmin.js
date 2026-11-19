// Reads and writes Firestore documents from the server with the service account (set FIREBASE_SERVICE_ACCOUNT in the
// Vercel environment variables: the JSON key, or the same JSON base64-encoded). The service account is not subject to
// the browser security rules, which is exactly why new questions can only be created here, after every check.

import { createSign } from 'node:crypto'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'prepbuddy-564d8'
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`
const TIMEOUT_MS = 8000

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')

function serviceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) return null
  try {
    return JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

export const firestoreConfigured = () => {
  const sa = serviceAccount()
  return !!(sa?.client_email && sa?.private_key)
}

let tokenCache = null
async function adminToken() {
  const sa = serviceAccount()
  if (!sa?.client_email || !sa?.private_key) throw new Error('Firestore is not configured.')
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  })
  if (!res.ok) throw new Error('Could not get a Firestore access token.')
  const body = await res.json()
  tokenCache = { token: body.access_token, expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000 }
  return tokenCache.token
}

/** A JavaScript value -> Firestore's typed REST value. */
export function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null }
  if (typeof v === 'string') return { stringValue: v }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } }
  return { mapValue: { fields: encodeFields(v) } }
}
export const encodeFields = (obj) => Object.fromEntries(Object.entries(obj).map(([k, x]) => [k, encodeValue(x)]))

/** Firestore's typed REST value -> a JavaScript value. */
export function decodeValue(v) {
  if (v === null || typeof v !== 'object') return null
  if ('stringValue' in v) return v.stringValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('booleanValue' in v) return v.booleanValue
  if ('timestampValue' in v) return v.timestampValue
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue)
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decodeValue(x)]))
  return null
}
export const decodeFields = (fields) => Object.fromEntries(Object.entries(fields || {}).map(([k, x]) => [k, decodeValue(x)]))

async function request(url, init) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await adminToken()}` } })
  } finally {
    clearTimeout(timer)
  }
}

/** Creates a document only if its id is free. Returns 'created' or 'exists'. Anything else is an error. */
export async function createDoc(collection, id, data) {
  const res = await request(`${BASE}/${collection}?documentId=${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ fields: encodeFields(data) }) })
  if (res.ok) return 'created'
  if (res.status === 409) return 'exists'
  throw new Error(`Firestore create failed (${res.status})`)
}

/** Deletes a document. Returns 'deleted' (a missing document counts: the result is the same). Anything else is an error. */
export async function deleteDoc(collection, id) {
  const res = await request(`${BASE}/${collection}/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (res.ok || res.status === 404) return 'deleted'
  throw new Error(`Firestore delete failed (${res.status})`)
}

/** A secret only this server knows (derived from the service-account key), for signing short-lived tokens. Null when not configured. */
export function serverSecret() {
  const key = serviceAccount()?.private_key
  return key ? `qb-server-secret-v1|${key}` : null
}

/** Reads one document as a plain object, or null when it does not exist. */
export async function getDoc(collection, id) {
  const res = await request(`${BASE}/${collection}/${encodeURIComponent(id)}`, { method: 'GET' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Firestore read failed (${res.status})`)
  return decodeFields((await res.json()).fields)
}
