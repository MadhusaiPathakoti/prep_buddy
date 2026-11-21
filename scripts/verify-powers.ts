// Verification harness for the Powers game.  Run:  npx tsx scripts/verify-powers.ts
// Checks the pool (every chosen base × every power in range, nothing outside 2 to 10), that every answer is exact
// (compared with repeated multiplication in BigInt, which cannot round), and the session size and uniqueness.
import { BASES, buildPool, formatAnswer, generatePowerQuestions, parseAnswer, powerText, superscript } from '../src/lib/powers'

let failures = 0
const fail = (msg: string) => {
  failures++
  if (failures <= 25) console.error('FAIL', msg)
}

// 1. the whole range: 9 bases × 9 powers, each answer equals repeated multiplication
const all = buildPool(BASES, 2, 10)
if (all.length !== 81) fail(`full pool should be 81, got ${all.length}`)
for (const q of all) {
  let exact = 1n
  for (let i = 0; i < q.exp; i++) exact *= BigInt(q.base)
  if (BigInt(q.answer) !== exact) fail(`${q.base}^${q.exp}: ${q.answer} is not ${exact}`)
  if (!Number.isSafeInteger(q.answer)) fail(`${q.base}^${q.exp} is beyond exact integers`)
  if (q.base < 2 || q.base > 10 || q.exp < 2 || q.exp > 10) fail(`out of range: ${q.base}^${q.exp}`)
}
if (all[all.length - 1].answer !== 10_000_000_000) fail('10^10 should be 10,000,000,000')
if (new Set(all.map((q) => q.id)).size !== all.length) fail('duplicate ids')

// 2. chosen bases and a power range
const some = buildPool([7, 3, 3, 12, 1], 5, 4) // unsorted, repeated, out-of-range bases, reversed powers
if (some.map((q) => `${q.base}^${q.exp}`).join(',') !== '3^4,3^5,7^4,7^5') fail(`filtering/sorting wrong: ${some.map((q) => `${q.base}^${q.exp}`)}`)
if (buildPool([], 2, 10).length !== 0) fail('no bases means no questions')
if (buildPool([2], 1, 20).length !== 9) fail('powers are limited to 2 to 10')

// 3. sessions
for (let run = 0; run < 300; run++) {
  const count = [1, 10, 20, 30, 81, 200][run % 6]
  const qs = generatePowerQuestions(BASES, 2, 10, count)
  if (qs.length !== Math.min(count, 81)) fail(`session of ${count} had ${qs.length}`)
  if (new Set(qs.map((q) => q.id)).size !== qs.length) fail('a question repeated within a session')
}

// 4. text
if (powerText(2, 8) !== '2⁸' || powerText(10, 10) !== '10¹⁰' || superscript(9) !== '⁹') fail('superscripts')
if (formatAnswer(10_000_000_000) !== '10,000,000,000' || formatAnswer(256) !== '256') fail('answer formatting')
if (parseAnswer('256') !== 256 || parseAnswer(' 1,024 ') !== 1024 || parseAnswer('') !== null || parseAnswer('2a') !== null || parseAnswer('-4') !== null || parseAnswer('1.5') !== null) fail('parseAnswer')

console.log(`${failures === 0 ? 'OK' : 'FAILED'}: ${all.length} questions checked against exact multiplication; sessions, filtering and text checked`)
process.exit(failures === 0 ? 0 : 1)
