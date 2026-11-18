// Verifies the browser side of the favourites / recently played sync (src/lib/qbank/sync.ts) against a small in-memory
// stand-in for the server, with a fake localStorage. No network, no Redis, no Firebase.
// Run: npx tsx scripts/verify-qb-client-sync.ts

/* eslint-disable @typescript-eslint/no-explicit-any */
class MemStorage {
  m = new Map<string, string>()
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}
const local = new MemStorage()
const session = new MemStorage()
const g = globalThis as any
g.localStorage = local
g.sessionStorage = session
g.window = new EventTarget()
g.document = { visibilityState: 'visible', addEventListener() {} }

import { parseSyncBody } from '../api/_lib/qbSync.js'
import { getFavouriteMap, getProgress, recordAnswer, toggleFavouriteQuestion } from '../src/lib/qbank/userData'
import { setTokenProviderForTests, syncUser } from '../src/lib/qbank/sync'

let failures = 0
let passed = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) passed++
  else {
    failures++
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
const id = (n: number) => `q-${n.toString(16).padStart(20, '0')}`
const wait = (msec: number) => new Promise((r) => setTimeout(r, msec))

// ---- a tiny server: one store per user, merge rules as in api/_lib/qbSync.js
interface Store { fav: Map<string, string>; prog: Map<string, { at: string; correct: boolean }> }
const server = new Map<string, Store>()
const store = (uid: string) => { if (!server.has(uid)) server.set(uid, { fav: new Map(), prog: new Map() }); return server.get(uid)! }
const calls: { uid: string; full: boolean; body: any }[] = []
let online = true
let holdNextRequest: Promise<void> | null = null
let rejectToken = false

g.fetch = async (_url: string, init: any) => {
  if (!online) throw new TypeError('offline')
  const auth = String(init.headers.Authorization || '')
  const uid = auth.replace('Bearer token-', '')
  if (rejectToken || !auth.startsWith('Bearer token-')) return new Response('{}', { status: 401 })
  const body = JSON.parse(init.body)
  parseSyncBody(body) // the real validator must accept everything the client sends
  calls.push({ uid, full: body.full === true, body })
  if (holdNextRequest) { const h = holdNextRequest; holdNextRequest = null; await h }
  const s = store(uid)
  for (const [fid, at] of Object.entries<string>(body.favAdd ?? {})) if (!s.fav.has(fid)) s.fav.set(fid, at)
  for (const fid of body.favRemove ?? []) s.fav.delete(fid)
  for (const [pid, rec] of Object.entries<any>(body.prog ?? {})) { const cur = s.prog.get(pid); if (!cur || rec.at > cur.at) s.prog.set(pid, rec) }
  const reply = body.full === true ? { ok: true, favourites: Object.fromEntries(s.fav), progress: Object.fromEntries(s.prog) } : { ok: true }
  return new Response(JSON.stringify(reply), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
let currentToken: string | null = null
setTokenProviderForTests(async () => currentToken)

const favIds = () => [...getFavouriteMap().keys()].sort()
const progIds = () => [...getProgress().keys()].sort()
const reset = () => { local.clear(); session.clear(); server.clear(); calls.length = 0 }
let changedEvents = 0
g.window.addEventListener('prepbuddy:qbank-userdata', () => changedEvents++)

// ================================================================ 1. first sign-in merges guest data with another device's data
console.log('first sign-in on a browser with guest data')
{
  reset()
  // guest plays signed out
  let fav = getFavouriteMap(); fav = toggleFavouriteQuestion(id(1), fav); fav = toggleFavouriteQuestion(id(2), fav)
  recordAnswer(id(1), true); recordAnswer(id(2), false)
  // the account already has data from a phone
  const s = store('alice')
  s.fav.set(id(3), '2026-11-10T00:00:00.000Z'); s.prog.set(id(3), { at: '2026-11-10T00:00:00.000Z', correct: true })
  s.prog.set(id(1), { at: '2099-01-01T00:00:00.000Z', correct: false }) // phone answered id(1) later than the guest did

  currentToken = 'token-alice'
  changedEvents = 0
  await syncUser('alice')
  check('stars are the union of both devices', favIds().join() === [id(1), id(2), id(3)].join())
  check('answers are the union of both devices', progIds().join() === [id(1), id(2), id(3)].join())
  check('the later answer (from the phone) wins', getProgress().get(id(1))?.correct === false)
  check('the server now holds the guest data too', store('alice').fav.size === 3 && store('alice').prog.size === 3)
  check('open screens were told to re-read', changedEvents >= 1)
  check('exactly one request was needed', calls.length === 1 && calls[0].full)
}

// ================================================================ 2. changes are batched and sent
console.log('changes after sign-in are batched')
{
  calls.length = 0
  let fav = getFavouriteMap()
  fav = toggleFavouriteQuestion(id(4), fav) // star
  fav = toggleFavouriteQuestion(id(2), fav) // un-star
  recordAnswer(id(4), true)
  recordAnswer(id(4), false) // answered twice: only the latest is sent
  check('nothing is sent immediately', calls.length === 0)
  await wait(6400)
  check('one batched request went out after the delay', calls.length === 1 && !calls[0].full, `calls=${calls.length}`)
  const sent = calls[0]?.body
  check('it carries the star, the un-star and the latest answer', !!sent && Object.keys(sent.favAdd).join() === id(4) && sent.favRemove.join() === id(2) && sent.prog[id(4)]?.correct === false && Object.keys(sent.prog).length === 1)
  check('the server applied them', store('alice').fav.has(id(4)) && !store('alice').fav.has(id(2)) && store('alice').prog.get(id(4))?.correct === false)
  calls.length = 0
  await wait(6400)
  check('nothing more is sent once saved', calls.length === 0)
}

// ================================================================ 3. later visits only pull once per session
console.log('later visits')
{
  calls.length = 0
  await syncUser('alice')
  check('same session: no second pull', calls.length === 0)
  session.clear()
  await syncUser('alice')
  check('new session: pulls once', calls.length === 1 && calls[0].full)
  // another device removed a star meanwhile
  store('alice').fav.delete(id(1))
  session.clear()
  await syncUser('alice')
  check('a star removed on another device disappears here (no resurrection)', !favIds().includes(id(1)))
}

// ================================================================ 4. offline: nothing is lost
console.log('offline and failures')
{
  online = false
  let fav = getFavouriteMap()
  fav = toggleFavouriteQuestion(id(7), fav)
  recordAnswer(id(7), true)
  await wait(6400) // flush fires, fails
  check('the change is still stored locally', favIds().includes(id(7)) && getProgress().has(id(7)))
  check('and still queued for the server', JSON.parse(local.getItem('prepbuddy:qbank:sync')!).pending.favAdd[id(7)] !== undefined)
  online = true
  calls.length = 0
  session.clear()
  await syncUser('alice') // next visit sends the queue
  check('the queue is delivered on the next successful sync', store('alice').fav.has(id(7)) && store('alice').prog.has(id(7)))
  check('and the queue is empty afterwards', Object.keys(JSON.parse(local.getItem('prepbuddy:qbank:sync')!).pending.favAdd).length === 0)

  // an expired token: server says 401, client retries once with a fresh token
  rejectToken = true
  let refreshed = 0
  setTokenProviderForTests(async (force) => { if (force) { refreshed++; rejectToken = false } return currentToken })
  session.clear()
  await syncUser('alice')
  check('a 401 triggers one token refresh and a retry', refreshed === 1 && calls.length >= 1)
  setTokenProviderForTests(async () => currentToken)
}

// ================================================================ 5. changes made while a request is in flight
console.log('changes during a request')
{
  let release!: () => void
  holdNextRequest = new Promise<void>((r) => { release = r })
  session.clear()
  const syncing = syncUser('alice') // full sync, held at the server
  await wait(50)
  toggleFavouriteQuestion(id(8), getFavouriteMap()) // starred while the request is in flight
  release()
  await syncing
  check('a star made during the request is kept locally', favIds().includes(id(8)))
  await wait(6400)
  check('and it is sent afterwards', store('alice').fav.has(id(8)))
}

// ================================================================ 6. a different account on the same browser
console.log('a second account on the same browser')
{
  store('bob').fav.set(id(20), '2026-11-11T00:00:00.000Z')
  currentToken = 'token-bob'
  calls.length = 0
  await syncUser('bob')
  check("alice's local data is not mixed into bob's account", favIds().join() === id(20) && !store('bob').fav.has(id(1)) && !store('bob').fav.has(id(8)))
  check("alice's server data is untouched", store('alice').fav.has(id(8)))
  // signed out play stays queued for the same owner
  await syncUser(null)
  recordAnswer(id(21), true)
  check('signed out: the answer is stored locally', getProgress().has(id(21)))
  currentToken = 'token-bob'
  calls.length = 0
  session.clear()
  await syncUser('bob')
  check("signing back in as the same account delivers what was played while signed out", store('bob').prog.has(id(21)))
}

// ================================================================ 7. sign-out leaves local data in place
console.log('signing out')
{
  await syncUser(null)
  check('local favourites and answers stay after signing out', favIds().length >= 1 && getProgress().size >= 1)
}

console.log(failures === 0 ? `\nAll ${passed} checks passed.` : `\n${failures} check(s) FAILED (${passed} passed).`)
process.exit(failures === 0 ? 0 : 1)
