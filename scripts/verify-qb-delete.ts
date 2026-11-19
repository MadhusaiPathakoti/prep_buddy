// Verifies deleting an added question without any network: the two-digit sum, the signed token (forged, expired, for
// someone else's question), who may delete, and that nothing is deleted unless every check passes.
// Run: npx tsx scripts/verify-qb-delete.ts

import { CHALLENGE_TTL_MS, answerOf, checkChallenge, confirmDelete, makeChallenge, signChallenge, startDelete } from '../api/_lib/qbDelete.js'

let failures = 0
let passed = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) passed++
  else {
    failures++
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

type Reply = { status: number; body: Record<string, unknown> }
const SECRET = 'test-secret'
const ID = 'q-0123456789abcdef0123'
const OTHER_ID = 'q-fedcba9876543210fedc'
const SEED_ID = 'q-aaaaaaaaaaaaaaaaaaaa'
const owner = { uid: 'owner-1' }
const stranger = { uid: 'stranger-2' }
let clock = 1_700_000_000_000

function fakes(over: Record<string, unknown> = {}) {
  const calls: string[] = []
  const deps = {
    seed: { has: (id: string) => id === SEED_ID },
    getDoc: async (id: string) => (id === ID || id === OTHER_ID ? { id, addedBy: 'owner-1', source: 'user' } : null),
    secret: SECRET,
    now: () => clock,
    rand: undefined as undefined | ((a: number, b: number) => number),
    adminUids: [] as string[],
    removeIndex: async (id: string) => {
      calls.push(`index:${id}`)
    },
    deleteDoc: async (id: string) => {
      calls.push(`doc:${id}`)
    },
    ...over,
  }
  return { deps, calls }
}

console.log('the sum')
{
  let twoDigit = true
  let positive = true
  const ops = new Set<string>()
  for (let i = 0; i < 3000; i++) {
    const c = makeChallenge()
    ops.add(c.op)
    if (c.a < 10 || c.a > 99 || c.b < 10 || c.b > 99) twoDigit = false
    if (answerOf(c) <= 0) positive = false
  }
  check('both numbers are always two-digit', twoDigit)
  check('a subtraction is never zero or negative', positive)
  check('both adding and subtracting come up', ops.has('+') && ops.has('-'))
  check('99 − 99 is nudged to a positive two-digit sum', (() => { const c = makeChallenge((lo: number) => (lo === 0 ? 1 : 99)); return c.op === '-' && c.a >= 10 && c.a <= 99 && c.b >= 10 && c.b <= 99 && answerOf(c) > 0 })())
  check('answerOf adds and subtracts', answerOf({ a: 47, b: 38, op: '+' }) === 85 && answerOf({ a: 47, b: 38, op: '-' }) === 9)
  check('equal numbers are nudged so a subtraction is not zero', (() => { const c = makeChallenge((lo: number) => (lo === 0 ? 1 : 55)); return c.op === '-' && answerOf(c) > 0 })())
}

console.log('the token')
{
  const c = { a: 47, b: 38, op: '+' as const }
  const token = signChallenge(SECRET, 'u1', ID, c, clock + 1000)
  check('right answer, as text', checkChallenge(SECRET, 'u1', ID, token, '85', clock) === 'ok')
  check('right answer, as a number', checkChallenge(SECRET, 'u1', ID, token, 85, clock) === 'ok')
  check('right answer with spaces', checkChallenge(SECRET, 'u1', ID, token, ' 85 ', clock) === 'ok')
  check('wrong answer', checkChallenge(SECRET, 'u1', ID, token, '86', clock) === 'wrong')
  check('empty or text answer is wrong', checkChallenge(SECRET, 'u1', ID, token, '', clock) === 'wrong' && checkChallenge(SECRET, 'u1', ID, token, 'eighty-five', clock) === 'wrong')
  check('expired', checkChallenge(SECRET, 'u1', ID, token, '85', clock + 2000) === 'invalid')
  check('another person cannot use it', checkChallenge(SECRET, 'u2', ID, token, '85', clock) === 'invalid')
  check('another question cannot use it', checkChallenge(SECRET, 'u1', OTHER_ID, token, '85', clock) === 'invalid')
  check('signed with another secret', checkChallenge('other', 'u1', ID, token, '85', clock) === 'invalid')
  const [body] = token.split('.')
  const forged = Buffer.from(JSON.stringify({ a: 47, b: 38, op: '-', exp: clock + 1000 })).toString('base64url')
  check('changing the sum breaks the signature', checkChallenge(SECRET, 'u1', ID, `${forged}.${token.split('.')[1]}`, '9', clock) === 'invalid')
  check('a longer expiry breaks the signature', checkChallenge(SECRET, 'u1', ID, `${Buffer.from(JSON.stringify({ a: 47, b: 38, op: '+', exp: clock + 9e9 })).toString('base64url')}.${token.split('.')[1]}`, '85', clock) === 'invalid')
  check('garbage tokens are invalid', ['', 'x', 'a.b', `${body}.`, '.', 'a.b.c', `${body}.${'z'.repeat(60)}`, null, 12, {}].every((t) => checkChallenge(SECRET, 'u1', ID, t as string, '85', clock) === 'invalid'))
}

console.log('who may start')
{
  const { deps } = fakes()
  const ok = (await startDelete(owner, ID, deps)) as Reply
  check('the person who added it gets a sum and a token', ok.status === 200 && typeof ok.body.token === 'string' && Number.isInteger(ok.body.a) && (ok.body.op === '+' || ok.body.op === '-'))
  check('the token lasts two minutes', checkChallenge(SECRET, owner.uid, ID, ok.body.token, answerOf(ok.body as never), clock + CHALLENGE_TTL_MS - 1) === 'ok' && checkChallenge(SECRET, owner.uid, ID, ok.body.token, answerOf(ok.body as never), clock + CHALLENGE_TTL_MS + 1) === 'invalid')
  const no = (await startDelete(stranger, ID, deps)) as Reply
  check('someone else is refused', no.status === 403 && no.body.code === 'not-owner' && !('token' in no.body))
  check('a launch question is refused', ((await startDelete(owner, SEED_ID, deps)) as Reply).body.code === 'launch')
  check('a question that is not there is 404', ((await startDelete(owner, 'q-bbbbbbbbbbbbbbbbbbbb', deps)) as Reply).status === 404)
  check('a malformed id is 400', ((await startDelete(owner, 'nope', deps)) as Reply).status === 400 && ((await startDelete(owner, '', deps)) as Reply).status === 400)
  const admin = (await startDelete(stranger, ID, fakes({ adminUids: ['stranger-2'] }).deps)) as Reply
  check('a listed admin may delete anyone\'s', admin.status === 200)
}

console.log('deleting')
{
  const start = async (f: ReturnType<typeof fakes>) => (await startDelete(owner, ID, f.deps)) as Reply
  {
    const f = fakes()
    const s = await start(f)
    const r = (await confirmDelete(owner, ID, s.body.token, String(answerOf(s.body as never)), f.deps)) as Reply
    check('right answer deletes', r.status === 200 && r.body.ok === true)
    check('the list entry goes first, then the question', f.calls.join(',') === `index:${ID},doc:${ID}`, f.calls.join(','))
  }
  {
    const f = fakes()
    const s = await start(f)
    const r = (await confirmDelete(owner, ID, s.body.token, String(answerOf(s.body as never) + 1), f.deps)) as Reply
    check('wrong answer deletes nothing and gives a new sum', r.status === 400 && r.body.code === 'wrong-answer' && f.calls.length === 0 && typeof r.body.token === 'string')
    const again = (await confirmDelete(owner, ID, r.body.token, String(answerOf(r.body as never)), f.deps)) as Reply
    check('the new sum works', again.status === 200 && f.calls.length === 2)
  }
  {
    const f = fakes()
    const s = await start(f)
    clock += CHALLENGE_TTL_MS + 5
    const r = (await confirmDelete(owner, ID, s.body.token, String(answerOf(s.body as never)), f.deps)) as Reply
    clock -= CHALLENGE_TTL_MS + 5
    check('an expired check deletes nothing', r.status === 400 && r.body.code === 'expired' && f.calls.length === 0)
  }
  {
    const f = fakes()
    const s = await start(f)
    const r = (await confirmDelete(owner, OTHER_ID, s.body.token, String(answerOf(s.body as never)), f.deps)) as Reply
    check('a check for one question cannot delete another', r.status === 400 && f.calls.length === 0)
  }
  {
    const f = fakes()
    const s = await start(f)
    const r = (await confirmDelete(stranger, ID, s.body.token, String(answerOf(s.body as never)), f.deps)) as Reply
    check('someone else cannot use the owner\'s token', r.status === 403 && f.calls.length === 0)
  }
  {
    const f = fakes()
    const r = (await confirmDelete(owner, ID, undefined, '5', f.deps)) as Reply
    check('no token deletes nothing', r.status === 400 && f.calls.length === 0)
  }
  {
    const f = fakes()
    const r = (await confirmDelete(owner, SEED_ID, signChallenge(SECRET, owner.uid, SEED_ID, { a: 20, b: 20, op: '+' }, clock + 1000), '40', f.deps)) as Reply
    check('a launch question cannot be deleted even with a valid token', r.status === 403 && f.calls.length === 0)
  }
  {
    const f = fakes({
      removeIndex: async () => {
        throw new Error('redis down')
      },
    })
    const s = await start(f)
    let threw = false
    try {
      await confirmDelete(owner, ID, s.body.token, String(answerOf(s.body as never)), f.deps)
    } catch {
      threw = true
    }
    check('if the list cannot be updated, the question itself is left alone', threw && !f.calls.some((c) => c.startsWith('doc:')))
  }
}

console.log(failures === 0 ? `\nAll ${passed} checks passed.` : `\n${failures} of ${passed + failures} checks FAILED.`)
process.exit(failures === 0 ? 0 : 1)
