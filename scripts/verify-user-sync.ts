// Verifies the cross-device sync of saved progress (src/lib/sync/*, api/_lib/userSync.js): which localStorage keys are
// synced and how they map to entries, the server's validation and "newest wins" merge, and the browser engine — including
// several simulated devices, an account created AFTER local data existed, offline changes, and a second account on the
// same browser. No network, Redis or Firebase: the server runs the real validation/merge code against an in-memory store.
// Run: npx tsx scripts/verify-user-sync.ts

/* eslint-disable @typescript-eslint/no-explicit-any */
import { parseField, parseUserSyncBody, parseValue, isNewer, isStaleTombstone, syncUserData, TOMBSTONE_TTL_MS, MAX_FIELDS_PER_USER } from '../api/_lib/userSync.js'
import { collectionForKey, HISTORY_CAP, keyForCollection, parseCollection, serializeCollection } from '../src/lib/sync/collections'
import { createUserDataSync, type Applied, type SyncStorage, type UserDataSync } from '../src/lib/sync/userDataSync'

let failures = 0
let passed = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) passed++
  else {
    failures++
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
const section = (name: string) => console.log(`== ${name}`)

class MemStorage implements SyncStorage {
  m = new Map<string, string>()
  get length() { return this.m.size }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  getItem(k: string) { return this.m.has(k) ? (this.m.get(k) as string) : null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
}

const NOW = Date.now()
const HOUR = 3600_000
const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * HOUR).toISOString()

/* ------------------------------------------------------------------ collections */
section('what is synced')
{
  const synced: [string, string][] = [
    ['prepbuddy:favorites:vocabulary', 'fav:vocabulary'],
    ['prepbuddy:favorites:mnemonic-vocab', 'fav:mnemonic-vocab'],
    ['prepbuddy:favorites:hindu-vocab', 'fav:hindu-vocab'],
    ['prepbuddy:favorites:word-bank', 'fav:word-bank'],
    ['prepbuddy:mnemonic:learn', 'learn:mnemonic'],
    ['prepbuddy:hindu:learn', 'learn:hindu'],
    ['prepbuddy:vocabulary:history', 'hist:vocabulary'],
    ['prepbuddy:tables:history', 'hist:tables'],
    ['prepbuddy:grammar-fresh:history', 'hist:grammar-fresh'],
    ['prepbuddy:mnemonic-vocab:history', 'hist:mnemonic-vocab'],
    ['prepbuddy:flash-chain:best:60', 'best:flash-chain-60'],
    ['prepbuddy:mnemonic:stats', 'stats:mnemonic'],
    ['prepbuddy:grammar-rules:progress', 'grammar:rules'],
  ]
  for (const [key, col] of synced) {
    check(`${key} -> ${col}`, collectionForKey(key) === col, String(collectionForKey(key)))
    check(`${col} -> ${key}`, keyForCollection(col) === key, String(keyForCollection(col)))
    check(`server accepts collection ${col}`, parseField(`${col}|x1`) !== null)
  }
  const notSynced = [
    'prepbuddy:favorites:quant-bank', // the question bank has its own sync
    'prepbuddy:qbank:progress',
    'prepbuddy:qbank:sync',
    'prepbuddy:theme',
    'prepbuddy:phonetic:abate',
    'prepbuddy:mnemonic:learn-today',
    'prepbuddy:daily:paper:2026-11-20:quant',
    'prepbuddy:mocks:index',
    'prepbuddy:puzzle-solver:draft',
    'prepbuddy:usersync:state',
    'prepbuddy:grammar-fresh:sentences',
    'something-else',
  ]
  for (const key of notSynced) check(`${key} is not synced`, collectionForKey(key) === null)
  check('unknown collection has no key', keyForCollection('fav:quant-bank') === null && keyForCollection('nope:x') === null && keyForCollection('best:x') === null)
}

section('collections: parse and serialize')
{
  // favourites: new object format, legacy list, undated
  let e = parseCollection('fav:vocabulary', JSON.stringify({ a: iso(2), b: null }))!
  check('fav parse: dated + undated', e.size === 2 && e.get('a')!.version === Date.parse(iso(2)) && e.get('b')!.value === '' && e.get('b')!.version === 1)
  e = parseCollection('fav:vocabulary', JSON.stringify(['x', 'y']))!
  check('fav parse: legacy list of ids', e.size === 2 && e.get('x')!.value === '')
  check('fav parse: unreadable text -> null (never "all deleted")', parseCollection('fav:vocabulary', '{not json') === null)
  check('fav parse: missing key -> empty', parseCollection('fav:vocabulary', null)!.size === 0)

  const roundtrip = (col: string, raw: string) => {
    const entries = parseCollection(col, raw)!
    return JSON.parse(serializeCollection(col, entries, raw) as string)
  }
  const favRaw = JSON.stringify({ a: iso(2), b: null })
  check('fav round trip keeps dates and undated', JSON.stringify(roundtrip('fav:vocabulary', favRaw)) === favRaw)
  const favEntries = parseCollection('fav:vocabulary', favRaw)!
  favEntries.delete('a')
  favEntries.set('c', { value: iso(1), version: Date.parse(iso(1)) })
  check('fav serialize: removes and adds', JSON.stringify(JSON.parse(serializeCollection('fav:vocabulary', favEntries, favRaw) as string)) === JSON.stringify({ b: null, c: iso(1) }))
  check('fav serialize: nothing and no key -> no key', serializeCollection('fav:vocabulary', new Map(), null) === null)

  // learned words keep the daily-size setting
  const learnRaw = JSON.stringify({ size: 15, learned: { '5': iso(3), '9': iso(2) } })
  const learnEntries = parseCollection('learn:mnemonic', learnRaw)!
  check('learn parse', learnEntries.size === 2 && learnEntries.get('5')!.value === iso(3))
  learnEntries.set('11', { value: iso(1), version: Date.parse(iso(1)) })
  learnEntries.delete('5')
  const learnOut = JSON.parse(serializeCollection('learn:mnemonic', learnEntries, learnRaw) as string)
  check('learn serialize keeps size, applies entries', learnOut.size === 15 && Object.keys(learnOut.learned).sort().join() === '11,9')
  check('learn serialize from nothing has no size (default applies)', JSON.parse(serializeCollection('learn:hindu', learnEntries, null) as string).size === undefined)

  // history: newest first, capped
  const records = Array.from({ length: 40 }, (_, i) => ({ date: new Date(NOW - i * HOUR).toISOString(), correct: i, wrongAttempts: 0, skipped: 0, total: 10, timeMs: 1000 }))
  const histEntries = parseCollection('hist:tables', JSON.stringify(records.slice(0, 5)))!
  check('hist parse keyed by date', histEntries.size === 5 && histEntries.has(records[0].date))
  const allHist = new Map([...parseCollection('hist:tables', JSON.stringify(records))!])
  const merged = JSON.parse(serializeCollection('hist:tables', allHist, null) as string)
  check(`hist serialize keeps the newest ${HISTORY_CAP}, newest first`, merged.length === HISTORY_CAP && merged[0].date === records[0].date && merged[HISTORY_CAP - 1].date === records[HISTORY_CAP - 1].date)

  // best score: highest wins, version is the score
  const best = parseCollection('best:flash-chain-60', '42')!
  check('best parse: version is the score', best.get('v')!.value === 42 && best.get('v')!.version === 42)
  check('best parse: 0 / junk -> no entry', parseCollection('best:flash-chain-60', '0')!.size === 0 && parseCollection('best:flash-chain-60', 'abc')!.size === 0)
  check('best serialize: the higher of local and remote', serializeCollection('best:flash-chain-60', new Map([['v', { value: 30, version: 30 }]]), '42') === '42' && serializeCollection('best:flash-chain-60', new Map([['v', { value: 50, version: 50 }]]), '42') === '50')

  // stats and grammar
  const stats = { '7': { right: 2, wrong: 1, last: 'right', at: iso(4) } }
  check('stats round trip', JSON.stringify(roundtrip('stats:mnemonic', JSON.stringify(stats))) === JSON.stringify(stats))
  const gram = { '12': { box: 2, learned: true, seen: 3, right: 2, wrong: 1, lastWrong: false, lastSeen: NOW - HOUR, due: NOW + HOUR } }
  const gramEntries = parseCollection('grammar:rules', JSON.stringify(gram))!
  check('grammar parse: version is lastSeen', gramEntries.get('12')!.version === NOW - HOUR)
  check('grammar round trip', JSON.stringify(roundtrip('grammar:rules', JSON.stringify(gram))) === JSON.stringify(gram))
}

/* ------------------------------------------------------------------ the server */
section('server: validation')
{
  check('field: ok', parseField('fav:vocabulary|custom-my-word') !== null && parseField('hist:tables|2026-11-20T10:00:00.000Z') !== null)
  check('field: rejects other collections / bad ids / no separator', parseField('evil:x|1') === null && parseField('fav:vocabulary|bad id') === null && parseField('fav:vocabulary') === null && parseField('fav:Upper|1') === null && parseField(42 as any) === null)
  check('value: ok', parseValue('1700000000000:"2026"')?.version === 1700000000000 && parseValue('5:null')?.json === 'null')
  check('value: rejects junk', parseValue('abc') === null && parseValue('12:{bad') === null && parseValue('1:' + 'x'.repeat(2000)) === null && parseValue(7 as any) === null)

  const body = {
    full: true,
    set: {
      'fav:vocabulary|good': `${NOW - HOUR}:"${iso(1)}"`,
      'fav:vocabulary|future': `${NOW + 10 * 24 * HOUR}:"x"`,
      'nope:x|1': `${NOW}:"x"`,
      'fav:vocabulary|zero': `0:"x"`,
      'best:tables-60|v': `55:55`,
      'best:tables-60|w': `999999999999:1`,
    },
  }
  const parsed = parseUserSyncBody(body, NOW)
  const byField = new Map(parsed.set.map(([f, v, ver]: any) => [f, { v, ver }]))
  check('body: full flag', parsed.full === true && parseUserSyncBody({}).full === false)
  check('body: bad entries are skipped, the rest kept', byField.has('fav:vocabulary|good') && !byField.has('nope:x|1') && !byField.has('fav:vocabulary|zero') && !byField.has('best:tables-60|w'))
  check('body: a future time is clamped to about now', byField.get('fav:vocabulary|future')!.ver <= NOW + 6 * 60_000)
  check('body: a best score is kept as the version', byField.get('best:tables-60|v')!.ver === 55)
  let threw = false
  try { parseUserSyncBody('nope') } catch { threw = true }
  check('body: not an object is rejected as a whole', threw)
  threw = false
  try { parseUserSyncBody({ set: Object.fromEntries(Array.from({ length: 700 }, (_, i) => [`fav:vocabulary|k${i}`, `${NOW}:"x"`])) }) } catch { threw = true }
  check('body: too many entries in one request is rejected', threw)
  check('isNewer: only strictly newer', isNewer('5:"a"', 6) && !isNewer('5:"a"', 5) && !isNewer('5:"a"', 4) && isNewer(undefined, 1) && isNewer('garbage', 1))
  check('stale tombstones are only old deletion markers', isStaleTombstone(`${NOW - TOMBSTONE_TTL_MS - HOUR}:null`, NOW) && !isStaleTombstone(`${NOW - HOUR}:null`, NOW) && !isStaleTombstone(`${NOW - TOMBSTONE_TTL_MS - HOUR}:"x"`, NOW))
}

/** An in-memory stand-in for Redis, with the same three operations the real store offers. */
function memStore() {
  const hashes = new Map<string, Map<string, string>>()
  const h = (k: string) => { if (!hashes.has(k)) hashes.set(k, new Map()); return hashes.get(k)! }
  return {
    hashes,
    async read(key: string, fields: string[]) {
      const out = new Map<string, string>()
      for (const f of fields) if (h(key).has(f)) out.set(f, h(key).get(f)!)
      return out
    },
    async commit(key: string, pairs: [string, string][], wantAll: boolean) {
      for (const [f, v] of pairs) h(key).set(f, v)
      return { all: wantAll ? new Map(h(key)) : null, size: h(key).size }
    },
    async remove(key: string, fields: string[]) { for (const f of fields) h(key).delete(f) },
  }
}

section('server: newest wins')
{
  const store = memStore()
  const req = (set: Record<string, string>, full = false) => parseUserSyncBody({ full, set }, NOW)
  await syncUserData('u1', req({ 'fav:vocabulary|a': `${NOW - 3 * HOUR}:"${iso(3)}"` }), store, NOW)
  let r: any = await syncUserData('u1', req({ 'fav:vocabulary|a': `${NOW - 5 * HOUR}:null` }), store, NOW)
  check('an older deletion does not undo a newer star', r.written === 0 && store.hashes.get('usd:u1')!.get('fav:vocabulary|a') === `${NOW - 3 * HOUR}:"${iso(3)}"`)
  r = await syncUserData('u1', req({ 'fav:vocabulary|a': `${NOW - 1 * HOUR}:null` }), store, NOW)
  check('a newer deletion replaces it', r.written === 1 && store.hashes.get('usd:u1')!.get('fav:vocabulary|a') === `${NOW - HOUR}:null`)
  r = await syncUserData('u1', req({ 'fav:vocabulary|a': `${NOW - 1 * HOUR}:"${iso(1)}"` }), store, NOW)
  check('the same version never rewrites (idempotent)', r.written === 0)
  await syncUserData('u1', req({ 'best:tables-60|v': `40:40` }), store, NOW)
  await syncUserData('u1', req({ 'best:tables-60|v': `55:55` }), store, NOW)
  await syncUserData('u1', req({ 'best:tables-60|v': `47:47` }), store, NOW)
  check('a lower best score never replaces a higher one', store.hashes.get('usd:u1')!.get('best:tables-60|v') === '55:55')

  r = await syncUserData('u1', req({}, true), store, NOW)
  check('full: returns what the server holds', r.fields['best:tables-60|v'] === '55:55' && Object.keys(r.fields).length === 2)
  check('another user has their own data', ((await syncUserData('u2', req({}, true), store, NOW)) as any).fields && Object.keys(((await syncUserData('u2', req({}, true), store, NOW)) as any).fields).length === 0)

  await syncUserData('u1', req({ 'fav:vocabulary|old': `${NOW - TOMBSTONE_TTL_MS - 2 * HOUR}:null`, 'fav:vocabulary|recent': `${NOW - HOUR}:null` }), store, NOW)
  r = await syncUserData('u1', req({}, true), store, NOW)
  check('full: forgets very old deletion markers, keeps recent ones', !('fav:vocabulary|old' in r.fields) && 'fav:vocabulary|recent' in r.fields && !store.hashes.get('usd:u1')!.has('fav:vocabulary|old'))

  const small = memStore()
  small.hashes.set('usd:big', new Map(Array.from({ length: MAX_FIELDS_PER_USER }, (_, i) => [`fav:vocabulary|k${i}`, `1:"x"`])))
  let tooLarge = false
  try { await syncUserData('big', req({ 'fav:vocabulary|one-more': `${NOW}:"x"` }), small, NOW) } catch { tooLarge = true }
  check('a user cannot store unlimited entries', tooLarge)
}

/* ------------------------------------------------------------------ the browser engine */
const serverStore = memStore()
let online = true
const requests: { uid: string; full: boolean; fields: number }[] = []

async function fakeFetch(_url: any, init: any): Promise<Response> {
  if (!online) throw new TypeError('offline')
  const auth = String(init.headers.Authorization || '')
  if (!auth.startsWith('Bearer token-')) return new Response('{}', { status: 401 })
  const uid = auth.replace('Bearer token-', '')
  const request = parseUserSyncBody(JSON.parse(init.body), Date.now()) // the real validator must accept what the client sends
  requests.push({ uid, full: request.full, fields: request.set.length })
  const reply = await syncUserData(uid, request, serverStore)
  return new Response(JSON.stringify(reply), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

interface Device {
  name: string
  storage: MemStorage
  session: MemStorage
  sync: UserDataSync
  applied: Applied[]
}
function device(name: string, storage = new MemStorage(), session = new MemStorage()): Device {
  const applied: Applied[] = []
  const sync = createUserDataSync({
    storage,
    fetch: fakeFetch as any,
    getToken: async () => (currentUid.get(name) ? `token-${currentUid.get(name)}` : null),
    timers: false,
    onApplied: (a) => applied.push(a),
  })
  return { name, storage, session, sync, applied }
}
const currentUid = new Map<string, string | null>()
async function signIn(d: Device, uid: string) {
  currentUid.set(d.name, uid)
  await d.sync.setUser(uid)
}
/** Simulate the app writing to localStorage, then the engine noticing (the real page does this through installStorageWatcher). */
function write(d: Device, key: string, value: unknown) {
  d.storage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
  d.sync.notifyKeyChanged(key)
}
const read = (d: Device, key: string) => d.storage.getItem(key)
const json = (d: Device, key: string): any => { const r = d.storage.getItem(key); return r === null ? null : JSON.parse(r) }
const FAV_V = 'prepbuddy:favorites:vocabulary'
const FAV_M = 'prepbuddy:favorites:mnemonic-vocab'
const LEARN_M = 'prepbuddy:mnemonic:learn'
const HIST_T = 'prepbuddy:tables:history'
const BEST = 'prepbuddy:flash-chain:best:60'
const GRAM = 'prepbuddy:grammar-rules:progress'
const STATS = 'prepbuddy:mnemonic:stats'
const QFAV = 'prepbuddy:favorites:quant-bank'

section('engine: an account created after local data already existed')
const phone = device('phone')
{
  // data saved before accounts existed (nothing watching, nobody signed in)
  phone.storage.setItem(FAV_V, JSON.stringify({ abandon: iso(50), abase: null }))
  phone.storage.setItem(FAV_M, JSON.stringify({ 'mn-1': iso(40), 'mn-2': iso(39) }))
  phone.storage.setItem(LEARN_M, JSON.stringify({ size: 5, learned: { '1': iso(30), '2': iso(29) } }))
  phone.storage.setItem(HIST_T, JSON.stringify([{ date: iso(10), correct: 8, wrongAttempts: 2, skipped: 0, total: 10, timeMs: 30000 }]))
  phone.storage.setItem(BEST, '37')
  phone.storage.setItem(GRAM, JSON.stringify({ '3': { box: 1, learned: true, seen: 1, right: 1, wrong: 0, lastWrong: false, lastSeen: NOW - 20 * HOUR, due: NOW } }))
  phone.storage.setItem(STATS, JSON.stringify({ '1': { right: 1, wrong: 0, last: 'right', at: iso(25) } }))
  phone.storage.setItem(QFAV, JSON.stringify({ [`q-${'a'.repeat(20)}`]: iso(5) })) // the question bank syncs separately
  phone.storage.setItem('prepbuddy:theme', 'dark')

  // changes made while nobody is signed in are not queued (the first sign-in takes the whole local copy)
  write(phone, FAV_V, JSON.stringify({ abandon: iso(50), abase: null, abate: iso(1) }))
  check('before any sign-in nothing is queued', phone.sync.pendingCount() === 0)

  await signIn(phone, 'alice')
  const held = serverStore.hashes.get('usd:alice')!
  const fields = [...held.keys()]
  check('every existing local entry reached the server on first sign-in', ['fav:vocabulary|abandon', 'fav:vocabulary|abase', 'fav:vocabulary|abate', 'fav:mnemonic-vocab|mn-1', 'fav:mnemonic-vocab|mn-2', 'learn:mnemonic|1', 'learn:mnemonic|2', `hist:tables|${iso(10)}`, 'best:flash-chain-60|v', 'grammar:rules|3', 'stats:mnemonic|1'].every((f) => held.has(f)), fields.join(', '))
  check('nothing else was uploaded (theme, question bank)', fields.length === 11, `${fields.length}: ${fields.join(', ')}`)
  check('the undated favourite is stored (oldest version)', held.get('fav:vocabulary|abase') === '1:""')
  check('nothing is left unsent', phone.sync.pendingCount() === 0)
  check('the phone keeps its own data untouched', JSON.stringify(json(phone, FAV_V)) === JSON.stringify({ abandon: iso(50), abase: null, abate: iso(1) }) && read(phone, BEST) === '37' && read(phone, 'prepbuddy:theme') === 'dark')
  check('first sync was sent as full', requests.some((r) => r.uid === 'alice' && r.full))
}

section('engine: a second device signs in to the same account')
const laptop = device('laptop')
{
  laptop.storage.setItem(FAV_V, JSON.stringify({ abandon: iso(50), 'laptop-only': iso(8) }))
  laptop.storage.setItem(LEARN_M, JSON.stringify({ learned: { '3': iso(7) } }))
  laptop.storage.setItem(BEST, '51')
  await signIn(laptop, 'alice')
  check('laptop gets the phone favourites and keeps its own', JSON.stringify(Object.keys(json(laptop, FAV_V)).sort()) === JSON.stringify(['abandon', 'abase', 'abate', 'laptop-only'].sort()))
  check('undated favourite stays undated', json(laptop, FAV_V).abase === null)
  check('another bank arrives on a device that never had it', Object.keys(json(laptop, FAV_M)).sort().join() === 'mn-1,mn-2')
  check('learned words are merged (union)', Object.keys(json(laptop, LEARN_M).learned).sort().join() === '1,2,3' && json(laptop, LEARN_M).size === undefined)
  check('history comes across', json(laptop, HIST_T).length === 1 && json(laptop, HIST_T)[0].correct === 8)
  check('the higher best score wins (laptop had 51 > 37)', read(laptop, BEST) === '51')
  check('grammar mastery and revise stats come across', json(laptop, GRAM)['3'].learned === true && json(laptop, STATS)['1'].right === 1)
  check('the laptop pushed its own entries too', serverStore.hashes.get('usd:alice')!.has('fav:vocabulary|laptop-only') && serverStore.hashes.get('usd:alice')!.get('best:flash-chain-60|v') === '51:51')
  check('first pull on the laptop is flagged initial with changes', laptop.applied.length === 1 && laptop.applied[0].initial && laptop.applied[0].changed > 0)
  check('the laptop does not get the quant-bank key or the phone theme', read(laptop, QFAV) === null && read(laptop, 'prepbuddy:theme') === null)

  await phone.sync.syncNow(true)
  check('the phone then gets the laptop-only favourite and the higher best score', 'laptop-only' in json(phone, FAV_V) && read(phone, BEST) === '51')
  check('and the learned word marked on the laptop', Object.keys(json(phone, LEARN_M).learned).sort().join() === '1,2,3' && json(phone, LEARN_M).size === 5)
}

section('engine: a removal on one device reaches the other')
{
  // laptop un-stars "abandon" and un-learns word 2
  const fav = json(laptop, FAV_V); delete fav.abandon
  write(laptop, FAV_V, fav)
  const learn = json(laptop, LEARN_M); delete learn.learned['2']
  write(laptop, LEARN_M, learn)
  laptop.sync.scan()
  check('the removals are queued as deletions', laptop.sync.pendingCount() === 2)
  await laptop.sync.syncNow(false)
  check('queue is empty after sending', laptop.sync.pendingCount() === 0)
  await phone.sync.syncNow(true)
  check('the phone no longer has the favourite', !('abandon' in json(phone, FAV_V)) && 'abase' in json(phone, FAV_V))
  check('the phone no longer has the learned word, but keeps its size setting', !('2' in json(phone, LEARN_M).learned) && json(phone, LEARN_M).size === 5)
}

section('engine: an old offline change cannot undo a newer one')
{
  const k = 'abate'
  // phone goes offline and un-stars "abate"; meanwhile the laptop re-saves it later and syncs
  online = false
  const pf = json(phone, FAV_V); delete pf[k]
  write(phone, FAV_V, pf)
  phone.sync.scan()
  const ok = await phone.sync.syncNow(false)
  check('offline: the sync fails and the change stays queued', ok === false && phone.sync.pendingCount() === 1)
  online = true
  const lf = json(laptop, FAV_V); lf[k] = new Date(Date.now() + 2000).toISOString() // starred later than the phone's un-star
  write(laptop, FAV_V, lf)
  laptop.sync.scan()
  await laptop.sync.syncNow(false)
  await phone.sync.syncNow(true)
  check('the newer star wins on both devices', k in json(phone, FAV_V) && k in json(laptop, FAV_V))
  check('the phone has nothing left unsent', phone.sync.pendingCount() === 0)
}

section('engine: queued changes survive a restart and are sent when back online')
{
  online = false
  const pf = json(phone, FAV_V); pf['saved-offline'] = new Date().toISOString()
  write(phone, FAV_V, pf)
  phone.sync.scan()
  await phone.sync.syncNow(false)
  const restarted = device('phone', phone.storage) // same browser storage, fresh engine (page reloaded)
  check('queued change is still there after a restart', restarted.sync.pendingCount() === 1)
  online = true
  await signIn(restarted, 'alice') // on load the app tells the engine who is signed in, which also sends anything unsent
  check('and is delivered', restarted.sync.pendingCount() === 0 && serverStore.hashes.get('usd:alice')!.has('fav:vocabulary|saved-offline'))
  await laptop.sync.syncNow(true)
  check('the other device receives it', 'saved-offline' in json(laptop, FAV_V))
}

section('engine: refreshing the page on another device shows the newest data')
{
  // The laptop tab has been open (and already synced); the phone then learns a word and stars another. Refreshing the laptop
  // tab keeps its sessionStorage and was last synced a moment ago — it must still pull, and tell the screen to re-read.
  const lap = device('henry-laptop')
  const ph = device('henry-phone')
  await signIn(lap, 'henry')
  await signIn(ph, 'henry')
  write(ph, LEARN_M, JSON.stringify({ size: 10, learned: { '42': new Date().toISOString() } }))
  write(ph, FAV_M, JSON.stringify({ 'mn-42': new Date().toISOString() }))
  ph.sync.scan()
  await ph.sync.syncNow(false)

  requests.length = 0
  const refreshed = device('henry-laptop', lap.storage, lap.session) // a refresh: same browser storage, but a brand-new page (engine)
  await signIn(refreshed, 'henry')
  check('the refreshed laptop asks the server (a full sync) even though it synced a moment ago', requests.some((r) => r.uid === 'henry' && r.full))
  check('and now has the word learned on the phone', json(refreshed, LEARN_M)?.learned?.['42'] !== undefined)
  check('and the word starred on the phone', json(refreshed, FAV_M)?.['mn-42'] !== undefined)
  check('the screen on display is told to re-read (first sync of this page load)', refreshed.applied.some((a) => a.initial && a.changed > 0), JSON.stringify(refreshed.applied))

  // a later pull in the same page load updates storage but is not "initial" (it must not rebuild a screen mid-quiz)
  write(ph, FAV_M, JSON.stringify({ 'mn-42': new Date().toISOString(), 'mn-43': new Date().toISOString() }))
  ph.sync.scan()
  await ph.sync.syncNow(false)
  refreshed.applied.length = 0
  await refreshed.sync.syncNow(true)
  check('a later pull brings the data but is not flagged initial', 'mn-43' in json(refreshed, FAV_M) && refreshed.applied.length === 1 && !refreshed.applied[0].initial)
}

section('engine: history merges, best scores only go up')
{
  const rec = (h: number, correct: number) => ({ date: iso(h), correct, wrongAttempts: 0, skipped: 0, total: 10, timeMs: 1000 })
  write(phone, HIST_T, [rec(1, 9), ...json(phone, HIST_T)])
  write(laptop, HIST_T, [rec(2, 7), ...json(laptop, HIST_T)])
  write(phone, BEST, '60')
  write(laptop, BEST, '10'.slice(0, 2)) // a lower number can't happen in the app, but must never lower the server's
  for (const d of [phone, laptop, phone]) { d.sync.scan(); await d.sync.syncNow(true) }
  const ph = json(phone, HIST_T), lp = json(laptop, HIST_T)
  check('both devices end up with all three sessions, newest first', ph.length === 3 && JSON.stringify(ph) === JSON.stringify(lp) && ph[0].correct === 9 && ph[2].correct === 8)
  check('best is the highest ever set (60) on both', read(phone, BEST) === '60' && read(laptop, BEST) === '60')
}

section('engine: syncing again changes nothing')
{
  const before = JSON.stringify([...phone.storage.m.entries()].filter(([k]) => collectionForKey(k)))
  phone.applied.length = 0
  await phone.sync.syncNow(true)
  await phone.sync.syncNow(true)
  check('no spurious local writes', JSON.stringify([...phone.storage.m.entries()].filter(([k]) => collectionForKey(k))) === before)
  check('the screens are told nothing changed', phone.applied.every((a) => a.changed === 0), JSON.stringify(phone.applied))
  check('nothing queued', phone.sync.pendingCount() === 0)
}

section('engine: safety')
{
  // a key that cannot be read must not be treated as "everything deleted"
  const d = device('careful')
  d.storage.setItem(FAV_V, JSON.stringify({ keep: iso(3), keep2: iso(2) }))
  await signIn(d, 'bob')
  check('bob has two favourites on the server', serverStore.hashes.get('usd:bob')!.size === 2)
  d.storage.setItem(FAV_V, '{corrupted')
  d.sync.notifyKeyChanged(FAV_V)
  d.sync.scan()
  await d.sync.syncNow(true)
  check('a corrupted local key sends no deletions', d.sync.pendingCount() === 0 && serverStore.hashes.get('usd:bob')!.size === 2 && !([...serverStore.hashes.get('usd:bob')!.values()].some((v) => v.endsWith(':null'))))
  check('and is left as it was', read(d, FAV_V) === '{corrupted')

  // clearing a key on purpose does delete
  d.storage.setItem(FAV_V, JSON.stringify({ keep: iso(3), keep2: iso(2) }))
  d.sync.scan()
  d.storage.removeItem(FAV_V)
  d.sync.notifyKeyChanged(FAV_V)
  d.sync.scan()
  await d.sync.syncNow(false)
  check('removing the key removes the entries on the server', [...serverStore.hashes.get('usd:bob')!.values()].filter((v) => v.endsWith(':null')).length === 2)

  // a stray entry the server would refuse never blocks the rest
  const e = device('stray')
  e.storage.setItem(FAV_V, JSON.stringify({ 'ok-word': iso(1), 'bad id with spaces': iso(1), ['x'.repeat(200)]: iso(1) }))
  await signIn(e, 'carol')
  check('only the valid entry is synced, the others stay local', serverStore.hashes.get('usd:carol')!.size === 1 && Object.keys(json(e, FAV_V)).length === 3)
  await e.sync.syncNow(true)
  check('a later pull keeps the local-only entries', Object.keys(json(e, FAV_V)).length === 3)
}

section('engine: a different account on the same browser')
{
  const shared = device('shared')
  shared.storage.setItem(FAV_V, JSON.stringify({ 'dave-fav': iso(2) }))
  await signIn(shared, 'dave')
  check("dave's favourite is on the server", serverStore.hashes.get('usd:dave')!.has('fav:vocabulary|dave-fav'))
  currentUid.set('shared', null)
  await shared.sync.setUser(null)
  shared.applied.length = 0
  shared.storage.setItem('prepbuddy:theme', 'light')
  await signIn(shared, 'erin') // someone else signs in on dave's browser
  check("dave's data is not mixed into erin's account", !serverStore.hashes.has('usd:erin') || ![...serverStore.hashes.get('usd:erin')!.keys()].some((f) => f.includes('dave-fav')))
  check("dave's local copy is cleared", read(shared, FAV_V) === null)
  check("dave's data is still safe on the server", serverStore.hashes.get('usd:dave')!.has('fav:vocabulary|dave-fav'))
  check('device settings are left alone', read(shared, 'prepbuddy:theme') === 'light')
  check('open screens are told to refresh', shared.applied.some((a) => a.initial && a.changed > 0))
  await signIn(shared, 'dave')
  check('dave signing back in gets his data back', 'dave-fav' in (json(shared, FAV_V) ?? {}))
}

section('engine: a brand-new account with no local data, and signed-out behaviour')
{
  const fresh = device('fresh')
  await signIn(fresh, 'frank')
  check('nothing to upload, nothing to download', fresh.sync.pendingCount() === 0 && [...fresh.storage.m.keys()].filter((k) => collectionForKey(k)).length === 0)
  write(fresh, FAV_V, JSON.stringify({ w1: new Date().toISOString() }))
  fresh.sync.scan()
  await fresh.sync.syncNow(false)
  check('later changes sync as normal', serverStore.hashes.get('usd:frank')!.has('fav:vocabulary|w1'))
  // sign out, keep playing, sign back in
  currentUid.set('fresh', null)
  await fresh.sync.setUser(null)
  write(fresh, FAV_V, JSON.stringify({ w1: json(fresh, FAV_V).w1, w2: new Date().toISOString() }))
  check('changes made while signed out are recorded for the same account', fresh.sync.pendingCount() === 1)
  await signIn(fresh, 'frank')
  check('and sent when they sign back in', serverStore.hashes.get('usd:frank')!.has('fav:vocabulary|w2') && fresh.sync.pendingCount() === 0)
}

section('engine: a big first upload is split into batches')
{
  const big = device('big')
  const favs: Record<string, string> = {}
  for (let i = 0; i < 1500; i++) favs[`w${i}`] = new Date(NOW - i * 1000).toISOString()
  big.storage.setItem(FAV_V, JSON.stringify(favs))
  requests.length = 0
  await signIn(big, 'gina')
  const mine = requests.filter((r) => r.uid === 'gina')
  check('all 1500 favourites reached the server', serverStore.hashes.get('usd:gina')!.size === 1500)
  check('sent in several requests, each within the limit', mine.length >= 4 && mine.every((r) => r.fields <= 600), JSON.stringify(mine))
  check('only the last one asks for the full reply', mine.filter((r) => r.full).length === 1 && mine[mine.length - 1].full)
}

console.log(failures === 0 ? `\nAll ${passed} user-data sync checks passed.` : `\n${failures} check(s) FAILED (${passed} passed).`)
process.exit(failures === 0 ? 0 : 1)
