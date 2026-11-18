// Syncs a signed-in user's question-bank favourites and recently played answers to Redis, so they follow the
// person from device to device. Two small hashes per user:
//   qb:u:<uid>:fav   question id -> time it was starred (ms since 1970)
//   qb:u:<uid>:prog  question id -> "<time of latest answer in ms>:<1 if right, 0 if wrong>"
//
// Two kinds of request, both POST /api/qb?action=sync with the user's sign-in token:
//   full  (once when someone opens the site signed in): the browser sends what it has not yet saved, the server merges it
//         with what Redis holds and sends back the merged lists. Starred = union; for answers the newer one wins.
//   delta (a few seconds after each change): just the changes, written blindly with no reply of data, which keeps the
//         number of Redis commands (the free plan allows 500,000 a month) tiny.

import { AuthError, authenticate } from './firebaseAuth.js'
import { rateLimit } from './guard.js'
import { redisConfigured, redisPipeline, toMap } from './redis.js'

/** Answers kept per user (the most recent). Trimmed only when this is exceeded by TRIM_SLACK, so trimming is rare. */
export const MAX_PROGRESS = 2000
export const TRIM_SLACK = 200
/** Starred questions allowed per user (the bank is far smaller than this today). */
export const MAX_FAVOURITES = 20000
const MAX_FAV_PER_REQUEST = MAX_FAVOURITES
const MAX_PROG_PER_REQUEST = 2500
const ID_RE = /^q-[0-9a-f]{20}$/
const EARLIEST_MS = Date.parse('2000-01-01T00:00:00Z')
const FUTURE_SLACK_MS = 5 * 60_000

export class BadRequest extends Error {}
class TooLarge extends Error {}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** An ISO date string -> ms, or null when it is not a usable date. A time in the future is clamped to now. */
function toMs(value, now) {
  if (typeof value !== 'string') return null
  const ms = Date.parse(value)
  if (!Number.isFinite(ms) || ms < EARLIEST_MS) return null
  return Math.min(ms, now + FUTURE_SLACK_MS)
}

/**
 * Reads the request body. A malformed request as a whole is rejected; a single bad entry (not a question id, an
 * unusable date) is skipped, so one stray item in somebody's browser can never block all their other changes.
 */
export function parseSyncBody(body, now = Date.now()) {
  if (!isPlainObject(body)) throw new BadRequest('Invalid request.')
  const favAdd = []
  const favRemove = []
  const prog = []

  if (body.favAdd !== undefined) {
    if (!isPlainObject(body.favAdd)) throw new BadRequest('Invalid request.')
    const entries = Object.entries(body.favAdd)
    if (entries.length > MAX_FAV_PER_REQUEST) throw new BadRequest('Too many items in one request.')
    for (const [id, at] of entries) {
      const ms = toMs(at, now)
      if (ID_RE.test(id) && ms !== null) favAdd.push([id, ms])
    }
  }
  if (body.favRemove !== undefined) {
    if (!Array.isArray(body.favRemove) || body.favRemove.length > MAX_FAV_PER_REQUEST) throw new BadRequest('Invalid request.')
    for (const id of body.favRemove) if (typeof id === 'string' && ID_RE.test(id)) favRemove.push(id)
  }
  if (body.prog !== undefined) {
    if (!isPlainObject(body.prog)) throw new BadRequest('Invalid request.')
    const entries = Object.entries(body.prog)
    if (entries.length > MAX_PROG_PER_REQUEST) throw new BadRequest('Too many items in one request.')
    for (const [id, record] of entries) {
      const ms = isPlainObject(record) ? toMs(record.at, now) : null
      if (ID_RE.test(id) && ms !== null && typeof record.correct === 'boolean') prog.push([id, ms, record.correct])
    }
  }
  return { full: body.full === true, favAdd, favRemove, prog }
}

export const encodeProg = ({ ms, correct }) => `${ms}:${correct ? 1 : 0}`

export function decodeProg(value) {
  const [msText, flag] = String(value).split(':')
  const ms = Number(msText)
  if (!Number.isFinite(ms) || (flag !== '0' && flag !== '1')) return null
  return { ms, correct: flag === '1' }
}

/**
 * Merges a browser's unsaved changes into what the server holds (pure, so it can be tested without Redis).
 * Starred: a new star is kept (the earlier time wins if the server already has it), an un-star removes it.
 * Answers: the newer answer wins. If more than MAX_PROGRESS answers result, only the newest are kept.
 */
export function mergeFull(serverFav, serverProg, request) {
  const fav = new Map(serverFav)
  const favSet = []
  const favDel = []
  for (const [id, ms] of request.favAdd) {
    if (!fav.has(id)) {
      fav.set(id, ms)
      favSet.push([id, ms])
    }
  }
  for (const id of request.favRemove) if (fav.delete(id)) favDel.push(id)

  const prog = new Map(serverProg)
  const progSet = new Map()
  for (const [id, ms, correct] of request.prog) {
    const current = prog.get(id)
    if (!current || ms > current.ms) {
      prog.set(id, { ms, correct })
      progSet.set(id, { ms, correct })
    }
  }
  const progDel = []
  if (prog.size > MAX_PROGRESS) {
    const newestFirst = [...prog.entries()].sort((a, b) => b[1].ms - a[1].ms)
    for (const [id] of newestFirst.slice(MAX_PROGRESS)) {
      prog.delete(id)
      progSet.delete(id)
      if (serverProg.has(id)) progDel.push(id)
    }
  }
  return { fav, prog, favSet: favSet.filter(([id]) => fav.has(id)), favDel, progSet: [...progSet], progDel }
}

const favKey = (uid) => `qb:u:${uid}:fav`
const progKey = (uid) => `qb:u:${uid}:prog`
const flat = (pairs, encode) => pairs.flatMap(([id, value]) => [id, encode(value)])

export async function syncFull(uid, request) {
  const [favReply, progReply] = await redisPipeline([['HGETALL', favKey(uid)], ['HGETALL', progKey(uid)]])
  const serverFav = new Map()
  for (const [id, value] of toMap(favReply)) if (Number.isFinite(Number(value))) serverFav.set(id, Number(value))
  const serverProg = new Map()
  for (const [id, value] of toMap(progReply)) {
    const record = decodeProg(value)
    if (record) serverProg.set(id, record)
  }
  const merged = mergeFull(serverFav, serverProg, request)
  if (merged.fav.size > MAX_FAVOURITES) throw new TooLarge()

  const writes = []
  if (merged.favSet.length) writes.push(['HSET', favKey(uid), ...flat(merged.favSet, String)])
  if (merged.favDel.length) writes.push(['HDEL', favKey(uid), ...merged.favDel])
  if (merged.progSet.length) writes.push(['HSET', progKey(uid), ...flat(merged.progSet, encodeProg)])
  if (merged.progDel.length) writes.push(['HDEL', progKey(uid), ...merged.progDel])
  if (writes.length) await redisPipeline(writes)

  return {
    ok: true,
    favourites: Object.fromEntries([...merged.fav].map(([id, ms]) => [id, new Date(ms).toISOString()])),
    progress: Object.fromEntries([...merged.prog].map(([id, p]) => [id, { at: new Date(p.ms).toISOString(), correct: p.correct }])),
  }
}

/** Drops the oldest answers beyond MAX_PROGRESS. Only runs when the hash has grown well past the limit. */
async function trimProgress(uid) {
  const [reply] = await redisPipeline([['HGETALL', progKey(uid)]])
  const entries = []
  for (const [id, value] of toMap(reply)) {
    const record = decodeProg(value)
    entries.push([id, record ? record.ms : 0])
  }
  const extra = entries.sort((a, b) => b[1] - a[1]).slice(MAX_PROGRESS).map(([id]) => id)
  if (extra.length) await redisPipeline([['HDEL', progKey(uid), ...extra]])
}

export async function syncDelta(uid, request) {
  const commands = []
  if (request.favAdd.length) commands.push(['HSET', favKey(uid), ...flat(request.favAdd, String)])
  if (request.favRemove.length) commands.push(['HDEL', favKey(uid), ...request.favRemove])
  const progLenAt = request.prog.length ? commands.push(['HSET', progKey(uid), ...flat(request.prog.map(([id, ms, correct]) => [id, { ms, correct }]), encodeProg)], ['HLEN', progKey(uid)]) - 1 : -1
  const favLenAt = request.favAdd.length ? commands.push(['HLEN', favKey(uid)]) - 1 : -1
  if (!commands.length) return { ok: true }
  const results = await redisPipeline(commands)
  if (progLenAt >= 0 && Number(results[progLenAt]) > MAX_PROGRESS + TRIM_SLACK) await trimProgress(uid)
  if (favLenAt >= 0 && Number(results[favLenAt]) > MAX_FAVOURITES) throw new TooLarge()
  return { ok: true }
}

export default async function handleSync(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  let user
  try {
    user = await authenticate(req)
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: 'Please sign in again.' })
    } else {
      res.status(503).json({ error: 'Sign-in could not be checked right now.' })
    }
    return
  }
  if (!redisConfigured()) {
    res.status(503).json({ error: 'Sync is not set up on this server.' })
    return
  }
  if (!(await rateLimit(req, res, { name: `qbsync-${user.uid}`, limit: 30 }))) return

  try {
    const request = parseSyncBody(req.body)
    res.status(200).json(request.full ? await syncFull(user.uid, request) : await syncDelta(user.uid, request))
  } catch (err) {
    if (err instanceof BadRequest) res.status(400).json({ error: err.message })
    else if (err instanceof TooLarge) res.status(413).json({ error: 'You have saved too many items.' })
    else res.status(502).json({ error: 'Sync is temporarily unavailable.' })
  }
}
