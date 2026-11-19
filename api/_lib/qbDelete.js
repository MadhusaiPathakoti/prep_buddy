// Deleting a question people have added. Two steps, both checked on the server:
//   1. POST /api/qb?action=delete-start  { id }                    -> a small sum ("47 + 38") and a signed token
//   2. POST /api/qb?action=delete        { id, token, answer }     -> deletes only if the sum is answered correctly
// Who may delete: the person who added the question (and anyone listed in QB_ADMIN_UIDS, a comma-separated list of
// Firebase user ids, if the site owner sets it). The launch questions can never be deleted here.
// The sum is a deliberate pause ("are you sure?"), not the security: signing in and being the owner is. The token is bound
// to the person and the question, expires after two minutes, and cannot be forged without the server's secret.

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { AuthError, authenticate } from './firebaseAuth.js'
import { deleteDoc, firestoreConfigured, getDoc, serverSecret } from './firestoreAdmin.js'
import { rateLimit } from './guard.js'
import { removeIndexEntry } from './qbIndex.js'
import { loadSeed } from './qbSeed.js'
import { redisConfigured } from './redis.js'

const ID_RE = /^q-[0-9a-f]{20}$/
export const CHALLENGE_TTL_MS = 2 * 60_000

/** A sum of two two-digit numbers: add them or subtract the smaller from the larger. */
export function makeChallenge(rand = randomInt) {
  const op = rand(0, 2) === 0 ? '+' : '-'
  let a = rand(10, 100)
  let b = rand(10, 100)
  if (op === '-' && a < b) [a, b] = [b, a]
  if (op === '-' && a === b) {
    // never a plain zero, and still two digits
    if (a < 99) a += 1
    else b = 98
  }
  return { a, b, op }
}

export const answerOf = ({ a, b, op }) => (op === '+' ? a + b : a - b)

const macOf = (secret, uid, id, a, b, op, exp) => createHmac('sha256', secret).update(`delete|${uid}|${id}|${a}|${b}|${op}|${exp}`).digest('base64url')

/** The signed token that goes with a challenge: the numbers and expiry, plus a signature tied to this person and question. */
export function signChallenge(secret, uid, id, challenge, exp) {
  const { a, b, op } = challenge
  return `${Buffer.from(JSON.stringify({ a, b, op, exp })).toString('base64url')}.${macOf(secret, uid, id, a, b, op, exp)}`
}

/** Checks a token and an answer. Returns 'ok', 'wrong', or 'invalid' (forged, for someone else, or expired). */
export function checkChallenge(secret, uid, id, token, answer, now) {
  if (typeof token !== 'string' || token.length > 400) return 'invalid'
  const [body, mac, ...rest] = token.split('.')
  if (!body || !mac || rest.length) return 'invalid'
  let parts
  try {
    parts = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return 'invalid'
  }
  const { a, b, op, exp } = parts ?? {}
  if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(exp) || (op !== '+' && op !== '-')) return 'invalid'
  const expected = Buffer.from(macOf(secret, uid, id, a, b, op, exp))
  const given = Buffer.from(mac)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'invalid'
  if (exp < now) return 'invalid'
  const typed = typeof answer === 'number' ? answer : typeof answer === 'string' && /^-?\d{1,5}$/.test(answer.trim()) ? Number(answer.trim()) : NaN
  return typed === answerOf({ a, b, op }) ? 'ok' : 'wrong'
}

const adminIds = () => String(process.env.QB_ADMIN_UIDS || '').split(',').map((s) => s.trim()).filter(Boolean)

/**
 * Whether this person may delete this question. Returns null when allowed, or { status, body } to send back.
 * deps: { seed, getDoc(id) }
 */
async function mayDelete(user, id, deps) {
  if (!ID_RE.test(id)) return { status: 400, body: { code: 'invalid', message: 'Unknown question.' } }
  if (deps.seed.has(id)) return { status: 403, body: { code: 'launch', message: 'The questions that came with the app cannot be deleted.' } }
  const doc = await deps.getDoc(id)
  if (!doc) return { status: 404, body: { code: 'missing', message: 'That question is not in the bank (it may already be deleted).' } }
  const owner = doc.addedBy === user.uid
  const admin = (deps.adminUids ?? []).includes(user.uid)
  if (!owner && !admin) return { status: 403, body: { code: 'not-owner', message: 'Only the person who added this question can delete it.' } }
  return null
}

/** Step 1: hand out a sum. deps: { seed, getDoc, secret, now, rand } */
export async function startDelete(user, id, deps) {
  const refusal = await mayDelete(user, id, deps)
  if (refusal) return refusal
  const challenge = makeChallenge(deps.rand)
  return { status: 200, body: { ...challenge, token: signChallenge(deps.secret, user.uid, id, challenge, deps.now() + CHALLENGE_TTL_MS) } }
}

/** Step 2: delete if the sum is right. deps: as above plus { removeIndex(id), deleteDoc(id) } */
export async function confirmDelete(user, id, token, answer, deps) {
  const refusal = await mayDelete(user, id, deps)
  if (refusal) return refusal
  const verdict = checkChallenge(deps.secret, user.uid, id, token, answer, deps.now())
  if (verdict === 'invalid') return { status: 400, body: { code: 'expired', message: 'That check has expired. Start again.' } }
  if (verdict === 'wrong') {
    const next = makeChallenge(deps.rand)
    return { status: 400, body: { code: 'wrong-answer', message: 'That is not the right answer. Here is a new one.', ...next, token: signChallenge(deps.secret, user.uid, id, next, deps.now() + CHALLENGE_TTL_MS) } }
  }
  // the list first, so a question never shows in the table while it can no longer be opened
  await deps.removeIndex(id)
  await deps.deleteDoc(id)
  return { status: 200, body: { ok: true, id } }
}

export default async function handleDelete(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  let user
  try {
    user = await authenticate(req)
  } catch (err) {
    if (err instanceof AuthError) res.status(401).json({ code: 'sign-in', message: 'Please sign in to delete a question.' })
    else res.status(503).json({ message: 'Sign-in could not be checked right now.' })
    return
  }
  const confirming = req.query?.action === 'delete'
  const secret = serverSecret()
  if (!secret || !firestoreConfigured() || !redisConfigured()) {
    res.status(503).json({ code: 'unavailable', message: 'Deleting questions is not set up on this server yet.' })
    return
  }
  if (!(await rateLimit(req, res, { name: `qbdel-${user.uid}`, limit: 30, windowMs: 3_600_000 }))) return

  const id = typeof req.body?.id === 'string' ? req.body.id : ''
  const deps = { seed: loadSeed(), getDoc: (docId) => getDoc('quantQuestions', docId), secret, now: Date.now, rand: randomInt, adminUids: adminIds(), removeIndex: removeIndexEntry, deleteDoc: (docId) => deleteDoc('quantQuestions', docId) }
  try {
    const result = confirming ? await confirmDelete(user, id, req.body?.token, req.body?.answer, deps) : await startDelete(user, id, deps)
    res.status(result.status).json(result.body)
  } catch (err) {
    console.error('[qb] delete failed:', err?.message)
    res.status(502).json({ code: 'error', message: 'Something went wrong. Nothing was deleted, or it was only partly deleted: please try again.' })
  }
}
