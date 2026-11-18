// Verifies the question bank's server side: sign-in token checking, request parsing, the favourites/recents merge,
// and (when Redis is configured) a real round trip against Upstash using a throwaway user that is deleted afterwards.
// Run: npx tsx --env-file=.env.local scripts/verify-qb-sync.ts

import { X509Certificate, createSign } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AuthError, PROJECT_ID, verifyWithCerts } from '../api/_lib/firebaseAuth.js'
import { redisConfigured, redisPipeline } from '../api/_lib/redis.js'
import handleSync, { BadRequest, MAX_PROGRESS, TRIM_SLACK, mergeFull, parseSyncBody, syncDelta, syncFull } from '../api/_lib/qbSync.js'

let failures = 0
let passed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++
  else {
    failures++
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
function throwsAs(name: string, fn: () => unknown, kind: new (...a: never[]) => Error) {
  try {
    fn()
    check(name, false, 'did not throw')
  } catch (err) {
    check(name, err instanceof kind, `threw ${err instanceof Error ? err.message : err}`)
  }
}

const id = (n: number) => `q-${n.toString(16).padStart(20, '0')}`
const ms = (iso: string) => Date.parse(iso)

// ------------------------------------------------------------------ 1. sign-in tokens
console.log('sign-in token checks')
const dir = mkdtempSync(join(tmpdir(), 'qb-verify-'))
try {
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-subj', '/CN=test', '-days', '2'], { stdio: 'ignore' })
  const privateKey = readFileSync(join(dir, 'k.pem'), 'utf8')
  const cert = readFileSync(join(dir, 'c.pem'), 'utf8')
  const certs = { kid1: cert }
  const now = Date.parse('2026-11-18T12:00:00Z')
  const sec = Math.floor(now / 1000)
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const goodClaims = { iss: `https://securetoken.google.com/${PROJECT_ID}`, aud: PROJECT_ID, sub: 'user_ABC-123', iat: sec - 60, exp: sec + 3000, email: 'a@b.co', email_verified: true }
  const sign = (claims: object, header: object = { alg: 'RS256', kid: 'kid1' }) => {
    const unsigned = `${b64(header)}.${b64(claims)}`
    return `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url')}`
  }
  const verify = (token: string) => verifyWithCerts(token, certs, { now })

  const ok = verify(sign(goodClaims))
  check('valid token accepted', ok.uid === 'user_ABC-123' && ok.email === 'a@b.co' && ok.emailVerified === true)
  throwsAs('expired token rejected', () => verify(sign({ ...goodClaims, exp: sec - 1 })), AuthError)
  throwsAs('token from the future rejected', () => verify(sign({ ...goodClaims, iat: sec + 3600 })), AuthError)
  throwsAs('wrong audience rejected', () => verify(sign({ ...goodClaims, aud: 'other-project' })), AuthError)
  throwsAs('wrong issuer rejected', () => verify(sign({ ...goodClaims, iss: 'https://securetoken.google.com/other-project' })), AuthError)
  throwsAs('empty subject rejected', () => verify(sign({ ...goodClaims, sub: '' })), AuthError)
  throwsAs('subject with odd characters rejected', () => verify(sign({ ...goodClaims, sub: 'a:b/../c' })), AuthError)
  throwsAs('missing expiry rejected', () => verify(sign({ ...goodClaims, exp: undefined })), AuthError)
  throwsAs('unknown key id rejected', () => verify(sign(goodClaims, { alg: 'RS256', kid: 'nope' })), AuthError)
  throwsAs('alg none rejected', () => verify(`${b64({ alg: 'none', kid: 'kid1' })}.${b64(goodClaims)}.x`), AuthError)
  throwsAs('HS256 rejected', () => verify(sign(goodClaims, { alg: 'HS256', kid: 'kid1' })), AuthError)
  const valid = sign(goodClaims)
  const [h, p, s] = valid.split('.')
  throwsAs('tampered payload rejected', () => verify(`${h}.${b64({ ...goodClaims, sub: 'someone-else' })}.${s}`), AuthError)
  throwsAs('tampered signature rejected', () => verify(`${h}.${p}.${s.slice(0, -4)}AAAA`), AuthError)
  throwsAs('garbage rejected', () => verify('not-a-token'), AuthError)
  throwsAs('empty rejected', () => verify(''), AuthError)
  // a token signed by a different key must not verify against our certificate
  const other = mkdtempSync(join(tmpdir(), 'qb-verify2-'))
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(other, 'k.pem'), '-out', join(other, 'c.pem'), '-subj', '/CN=evil', '-days', '2'], { stdio: 'ignore' })
    const evilKey = readFileSync(join(other, 'k.pem'), 'utf8')
    const unsigned = `${b64({ alg: 'RS256', kid: 'kid1' })}.${b64(goodClaims)}`
    const forged = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(evilKey, 'base64url')}`
    throwsAs('token signed with a different key rejected', () => verify(forged), AuthError)
  } finally {
    rmSync(other, { recursive: true, force: true })
  }
} catch (err) {
  check('token tests could run', false, err instanceof Error ? err.message : String(err))
} finally {
  rmSync(dir, { recursive: true, force: true })
}

// Google's real certificates must parse (this is what production uses).
try {
  const res = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com')
  const live = (await res.json()) as Record<string, string>
  const kids = Object.keys(live)
  check("Google's live certificates load and parse", res.ok && kids.length > 0 && kids.every((k) => new X509Certificate(live[k]).publicKey.asymmetricKeyType === 'rsa'), `${kids.length} certs`)
} catch (err) {
  console.warn(`  (skipped live certificate check: ${err instanceof Error ? err.message : err})`)
}

// ------------------------------------------------------------------ 2. request parsing
console.log('request parsing')
{
  const now = Date.parse('2026-11-18T12:00:00Z')
  const good = parseSyncBody(
    { full: true, favAdd: { [id(1)]: '2026-11-18T10:00:00Z', 'not-an-id': '2026-11-18T10:00:00Z', [id(2)]: 'garbage' }, favRemove: [id(3), 'x', 5], prog: { [id(4)]: { at: '2026-11-18T11:00:00Z', correct: true }, [id(5)]: { at: '2026-11-18T11:00:00Z', correct: 'yes' }, bad: { at: '2026-11-18T11:00:00Z', correct: true } } },
    now,
  )
  check('full flag read', good.full === true)
  check('bad ids and dates skipped, good kept', good.favAdd.length === 1 && good.favAdd[0][0] === id(1) && good.favRemove.length === 1 && good.prog.length === 1 && good.prog[0][0] === id(4))
  check('future timestamps are clamped', parseSyncBody({ favAdd: { [id(1)]: '2999-01-01T00:00:00Z' } }, now).favAdd[0][1] <= now + 5 * 60_000)
  check('dates before 2000 are skipped', parseSyncBody({ favAdd: { [id(1)]: '1970-01-01T00:00:00Z' } }, now).favAdd.length === 0)
  check('empty body is a delta with nothing in it', (() => { const r = parseSyncBody({}, now); return !r.full && !r.favAdd.length && !r.favRemove.length && !r.prog.length })())
  throwsAs('non-object body rejected', () => parseSyncBody('hello'), BadRequest)
  throwsAs('array body rejected', () => parseSyncBody([]), BadRequest)
  throwsAs('favAdd of wrong type rejected', () => parseSyncBody({ favAdd: [1, 2] }), BadRequest)
  throwsAs('too many answers rejected', () => parseSyncBody({ prog: Object.fromEntries(Array.from({ length: 2600 }, (_, i) => [id(i), { at: '2026-11-18T11:00:00Z', correct: true }])) }), BadRequest)
}

// ------------------------------------------------------------------ 3. merge rules
console.log('merge rules')
{
  const t = (iso: string) => ms(iso)
  const serverFav = new Map([[id(1), t('2026-11-01T00:00:00Z')], [id(2), t('2026-11-02T00:00:00Z')]])
  const serverProg = new Map([[id(1), { ms: t('2026-11-10T00:00:00Z'), correct: false }], [id(2), { ms: t('2026-11-12T00:00:00Z'), correct: true }]])
  const merged = mergeFull(serverFav, serverProg, {
    full: true,
    favAdd: [[id(2), t('2026-11-20T00:00:00Z')], [id(3), t('2026-11-03T00:00:00Z')]],
    favRemove: [id(1)],
    prog: [[id(1), t('2026-11-11T00:00:00Z'), true], [id(2), t('2026-11-11T00:00:00Z'), false], [id(9), t('2026-11-05T00:00:00Z'), false]],
  })
  check('stars: union, un-star removes', [...merged.fav.keys()].sort().join() === [id(2), id(3)].sort().join())
  check('existing star keeps its earlier time', merged.fav.get(id(2)) === t('2026-11-02T00:00:00Z'))
  check('only new stars are written', merged.favSet.length === 1 && merged.favSet[0][0] === id(3) && merged.favDel.join() === id(1))
  check('newer answer replaces older', merged.prog.get(id(1))?.correct === true && merged.prog.get(id(1))?.ms === t('2026-11-11T00:00:00Z'))
  check('older answer does not replace newer', merged.prog.get(id(2))?.correct === true)
  check('unknown answer is added', merged.prog.has(id(9)) && merged.progSet.length === 2)

  const addThenRemove = mergeFull(new Map(), new Map(), { full: true, favAdd: [[id(1), 1e12 + 5]], favRemove: [id(1)], prog: [] })
  check('star added and removed in one request ends up absent and unwritten', addThenRemove.fav.size === 0 && addThenRemove.favSet.length === 0)

  const many = new Map(Array.from({ length: MAX_PROGRESS + 50 }, (_, i) => [id(i), { ms: 1e12 + i, correct: true }] as const))
  const trimmed = mergeFull(new Map(), new Map(many.entries()), { full: true, favAdd: [], favRemove: [], prog: [] })
  check('answers beyond the limit are trimmed, oldest first', trimmed.prog.size === MAX_PROGRESS && !trimmed.prog.has(id(0)) && trimmed.prog.has(id(MAX_PROGRESS + 49)) && trimmed.progDel.length === 50)
}

// ------------------------------------------------------------------ 4. handler guards (no Redis, no network)
console.log('request handler guards')
{
  const fakeRes = () => {
    const r = { code: 0, body: undefined as unknown, headers: {} as Record<string, string>, setHeader(k: string, v: string) { r.headers[k] = v }, status(c: number) { r.code = c; return r }, json(b: unknown) { r.body = b } }
    return r
  }
  const get = fakeRes()
  await handleSync({ method: 'GET', headers: {}, query: {} } as never, get as never)
  check('GET is refused', get.code === 405)
  const anon = fakeRes()
  await handleSync({ method: 'POST', headers: {}, body: {}, query: {} } as never, anon as never)
  check('no token is refused with 401', anon.code === 401)
  const bad = fakeRes()
  await handleSync({ method: 'POST', headers: { authorization: 'Bearer abc.def.ghi' }, body: {}, query: {} } as never, bad as never)
  check('a made-up token is refused with 401', bad.code === 401)
  check('responses are never cached', bad.headers['Cache-Control'] === 'no-store')
}

// ------------------------------------------------------------------ 5. real Redis round trip
console.log('Redis round trip')
if (!redisConfigured()) {
  console.warn('  (skipped: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set)')
} else {
  const uid = `verify-${Date.now().toString(36)}`
  const favKey = `qb:u:${uid}:fav`
  const progKey = `qb:u:${uid}:prog`
  try {
    const request = (over: object) => parseSyncBody({ full: true, ...over }, Date.now())
    const first = await syncFull(uid, request({ favAdd: { [id(1)]: '2026-11-18T10:00:00Z', [id(2)]: '2026-11-18T10:01:00Z' }, prog: { [id(1)]: { at: '2026-11-18T10:05:00Z', correct: false } } }))
    check('first full sync returns what was sent', Object.keys(first.favourites).length === 2 && first.progress[id(1)]?.correct === false)

    const second = await syncFull(uid, request({ favRemove: [id(1)], favAdd: { [id(3)]: '2026-11-18T10:02:00Z' }, prog: { [id(1)]: { at: '2026-11-18T10:06:00Z', correct: true }, [id(2)]: { at: '2026-11-18T10:07:00Z', correct: true } } }))
    check('second full sync merges (un-star, new star, newer answers)', Object.keys(second.favourites).sort().join() === [id(2), id(3)].sort().join() && second.progress[id(1)]?.correct === true && Object.keys(second.progress).length === 2)

    await syncDelta(uid, request({ full: false, favAdd: { [id(4)]: '2026-11-18T10:03:00Z' }, favRemove: [id(2)], prog: { [id(5)]: { at: '2026-11-18T10:08:00Z', correct: false } } }))
    const third = await syncFull(uid, request({}))
    check('delta changes are kept and a bare full sync reads them back', Object.keys(third.favourites).sort().join() === [id(3), id(4)].sort().join() && third.progress[id(5)]?.correct === false)

    // trimming: push the answer list well past the limit in one delta and check it is cut back to the newest MAX_PROGRESS
    const total = MAX_PROGRESS + TRIM_SLACK + 80
    const bigProg = Object.fromEntries(Array.from({ length: total }, (_, i) => [id(1000 + i), { at: new Date(Date.parse('2026-11-18T00:00:00Z') + i * 1000).toISOString(), correct: i % 2 === 0 }]))
    await syncDelta(uid, request({ full: false, prog: bigProg }))
    const [len] = await redisPipeline([['HLEN', progKey]])
    check('answer list is trimmed back to the limit', Number(len) === MAX_PROGRESS, `length ${len}`)
    const afterTrim = await syncFull(uid, request({}))
    check('the newest answers survive trimming', afterTrim.progress[id(1000 + total - 1)] !== undefined && afterTrim.progress[id(1000)] === undefined)
  } catch (err) {
    check('Redis round trip ran', false, err instanceof Error ? err.message : String(err))
  } finally {
    await redisPipeline([['DEL', favKey, progKey]]).catch(() => {})
    const [left] = await redisPipeline([['EXISTS', favKey, progKey]]).catch(() => [-1])
    check('test data was cleaned up', Number(left) === 0, `exists=${left}`)
  }
}

console.log(failures === 0 ? `\nAll ${passed} checks passed.` : `\n${failures} check(s) FAILED (${passed} passed).`)
process.exit(failures === 0 ? 0 : 1)
