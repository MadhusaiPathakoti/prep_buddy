// Syncs a signed-in user's saved progress (favourites in every word bank, learned words, game history and best scores,
// grammar-rule mastery, ...) so it follows them from device to device. The question bank's own stars and answers use the
// older, separate sync in qbSync.js; everything else goes through here.
//
// Storage: ONE Redis hash per user, `usd:<uid>`. Each synced entry is one field:
//   field  "<collection>|<id>"        e.g. "fav:mnemonic-vocab|mn-17", "learn:hindu|402", "hist:tables|2026-11-20T10:00:00.000Z"
//   value  "<version>:<json>"         json is the entry, or `null` for "deleted" (a tombstone, so a removal reaches other devices)
// The version is a time in ms (an entry changed later replaces one changed earlier — last writer wins). Best scores
// ("best:*" collections) use the score itself as the version, so the highest score wins whichever device set it last.
//
// One request type, POST /api/qb?action=usersync with the user's sign-in token:
//   { full: false, set: { field: value, ... } }   push changes; the reply is just { ok }
//   { full: true,  set: { ... } }                 push what is unsaved, and get back every field the server holds
// A free Upstash database allows 500,000 commands a month, so a push costs 2 commands and opening the site costs 1-2.
//
// Writes read the stored versions first and only write entries that are newer, so an old offline device can never undo
// a newer change. The read and the write are two requests, so two devices changing the very same entry within a few
// milliseconds could still race; for favourites and progress that is harmless.

import { AuthError, authenticate } from './firebaseAuth.js'
import { rateLimit } from './guard.js'
import { redisConfigured, redisPipeline, toMap } from './redis.js'

export const MAX_FIELDS_PER_USER = 40_000
export const MAX_FIELDS_PER_REQUEST = 600
const MAX_VALUE_CHARS = 1500
const MAX_FIELD_CHARS = 220
/** A deletion marker older than this is dropped on a full sync (a device offline for longer than this could bring the entry back). */
export const TOMBSTONE_TTL_MS = 120 * 24 * 60 * 60 * 1000
const FUTURE_SLACK_MS = 5 * 60_000
const MAX_SCORE = 1_000_000_000

export class BadRequest extends Error {}
class TooLarge extends Error {}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

const COLLECTION_RE = /^(?:(?:fav|learn|hist|best):[a-z0-9-]{1,60}|stats:mnemonic|grammar:rules)$/
const ID_RE = /^[A-Za-z0-9._:-]{1,128}$/
const VALUE_RE = /^(\d{1,15}):([\s\S]*)$/

/** Splits "<collection>|<id>" and checks both halves; null when it is not an entry this server accepts. */
export function parseField(field) {
  if (typeof field !== 'string' || field.length > MAX_FIELD_CHARS) return null
  const cut = field.indexOf('|')
  if (cut < 1) return null
  const collection = field.slice(0, cut)
  const id = field.slice(cut + 1)
  if (!COLLECTION_RE.test(collection) || !ID_RE.test(id)) return null
  return { collection, id }
}

/** "<version>:<json>" -> { version, json } or null. */
export function parseValue(value) {
  if (typeof value !== 'string' || value.length > MAX_VALUE_CHARS) return null
  const m = VALUE_RE.exec(value)
  if (!m) return null
  try {
    JSON.parse(m[2])
  } catch {
    return null
  }
  return { version: Number(m[1]), json: m[2] }
}

/**
 * Reads the request. A malformed request as a whole is rejected; a single bad entry (unknown collection, unusable
 * version, oversized value) is skipped, so one stray item in somebody's browser can never block all their other changes.
 * Returns the usable entries as [field, value, version]. Times in the future are clamped to now.
 */
export function parseUserSyncBody(body, now = Date.now()) {
  if (!isPlainObject(body)) throw new BadRequest('Invalid request.')
  const set = []
  if (body.set !== undefined) {
    if (!isPlainObject(body.set)) throw new BadRequest('Invalid request.')
    const entries = Object.entries(body.set)
    if (entries.length > MAX_FIELDS_PER_REQUEST) throw new BadRequest('Too many items in one request.')
    for (const [field, raw] of entries) {
      const f = parseField(field)
      const v = parseValue(raw)
      if (!f || !v) continue
      let version = v.version
      if (f.collection.startsWith('best:')) {
        if (version > MAX_SCORE) continue // the score is the version
      } else {
        if (version < 1) continue
        version = Math.min(version, now + FUTURE_SLACK_MS)
      }
      set.push([field, `${version}:${v.json}`, version])
    }
  }
  return { full: body.full === true, set }
}

/** Should an incoming entry replace the stored one? Only when it is strictly newer (or nothing usable is stored). */
export function isNewer(storedValue, incomingVersion) {
  const stored = parseValue(storedValue ?? undefined)
  return !stored || incomingVersion > stored.version
}

/** True for a stored deletion marker that is old enough to be forgotten. */
export function isStaleTombstone(value, now = Date.now()) {
  const v = parseValue(value)
  return !!v && v.json === 'null' && v.version < now - TOMBSTONE_TTL_MS
}

/**
 * The whole sync, against a `store` (Redis in production, a plain in-memory object in tests):
 *   store.read(key, fields)            -> Map field -> stored value, for the fields that exist
 *   store.commit(key, pairs, wantAll)  -> { all: Map | null, size }   writes [field, value] pairs, then (optionally) reads everything
 *   store.remove(key, fields)          -> deletes fields
 */
export async function syncUserData(uid, request, store, now = Date.now()) {
  const key = `usd:${uid}`
  const stored = request.set.length ? await store.read(key, request.set.map(([field]) => field)) : new Map()
  const toWrite = request.set.filter(([field, , version]) => isNewer(stored.get(field), version)).map(([field, value]) => [field, value])
  if (!toWrite.length && !request.full) return { ok: true, written: 0 }

  const { all, size } = await store.commit(key, toWrite, request.full)
  if (size > MAX_FIELDS_PER_USER) throw new TooLarge()
  if (!request.full) return { ok: true, written: toWrite.length }

  const fields = {}
  const stale = []
  for (const [field, value] of all ?? []) {
    if (isStaleTombstone(value, now)) stale.push(field)
    else fields[field] = value
  }
  if (stale.length) await store.remove(key, stale)
  return { ok: true, written: toWrite.length, fields }
}

export function redisStore() {
  return {
    async read(key, fields) {
      const [reply] = await redisPipeline([['HMGET', key, ...fields]])
      const out = new Map()
      if (Array.isArray(reply)) reply.forEach((value, i) => value !== null && value !== undefined && out.set(fields[i], String(value)))
      return out
    },
    async commit(key, pairs, wantAll) {
      const commands = []
      if (pairs.length) commands.push(['HSET', key, ...pairs.flat()])
      const lenAt = commands.push(['HLEN', key]) - 1
      const allAt = wantAll ? commands.push(['HGETALL', key]) - 1 : -1
      const results = await redisPipeline(commands)
      return { all: allAt >= 0 ? toMap(results[allAt]) : null, size: Number(results[lenAt]) || 0 }
    },
    async remove(key, fields) {
      await redisPipeline([['HDEL', key, ...fields]])
    },
  }
}

export default async function handleUserSync(req, res) {
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
  if (!(await rateLimit(req, res, { name: `usersync-${user.uid}`, limit: 40 }))) return

  try {
    const request = parseUserSyncBody(req.body)
    res.status(200).json(await syncUserData(user.uid, request, redisStore()))
  } catch (err) {
    if (err instanceof BadRequest) res.status(400).json({ error: err.message })
    else if (err instanceof TooLarge) res.status(413).json({ error: 'You have saved too many items.' })
    else res.status(502).json({ error: 'Sync is temporarily unavailable.' })
  }
}
