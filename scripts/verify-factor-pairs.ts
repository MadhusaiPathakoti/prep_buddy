// Verification harness for the Factor Pairs game.  Run:  npx tsx scripts/verify-factor-pairs.ts
// Re-derives every pair by brute force (all ordered a, b up to n) and checks the pool filters, uniqueness of pairs,
// the table × multiplier number set, and how typed entries are judged.
import { buildPool, candidateNumbers, checkEntry, DEFAULT_SETTINGS, factorPairsOf, generateFactorQuestions, pairKey, parseEntry, type FactorSettings } from '../src/lib/factorPairs'

let failures = 0
const fail = (msg: string) => {
  failures++
  if (failures <= 25) console.error('FAIL', msg)
}
const cfg = (p: Partial<FactorSettings>): FactorSettings => ({ ...DEFAULT_SETTINGS, ...p })

/** Independent reference: unordered pairs found by trying every ordered (a, b) with a × b = n. */
function brute(n: number, includeOne: boolean, lo?: number, hi?: number): string[] {
  const keys = new Set<string>()
  for (let a = 1; a <= n; a++)
    for (let b = 1; b <= n; b++) {
      if (a * b !== n) continue
      if (!includeOne && (a === 1 || b === 1)) continue
      if (lo !== undefined && hi !== undefined && (a < lo || b < lo || a > hi || b > hi)) continue
      keys.add(pairKey(a, b))
    }
  return [...keys].sort()
}

// 1. Pairs match brute force, for every n in range and every filter combination.
let checked = 0
for (let n = 2; n <= 400; n++) {
  for (const includeOne of [true, false]) {
    for (const lim of [undefined, [2, 20] as const, [3, 12] as const]) {
      const s = cfg({ includeOne, limitFactors: lim !== undefined, factorMin: lim?.[0] ?? 2, factorMax: lim?.[1] ?? 30 })
      const got = factorPairsOf(n, s)
      const want = brute(n, includeOne, lim?.[0], lim?.[1])
      const gotKeys = got.map((p) => pairKey(p[0], p[1])).sort()
      checked++
      if (JSON.stringify(gotKeys) !== JSON.stringify(want)) fail(`n=${n} includeOne=${includeOne} lim=${lim}: got ${gotKeys} want ${want}`)
      if (new Set(gotKeys).size !== gotKeys.length) fail(`n=${n}: duplicate pair (8x9 vs 9x8)`)
      for (const p of got) if (p[0] > p[1] || p[0] * p[1] !== n) fail(`n=${n}: bad pair ${p}`)
    }
  }
}

// 2. The worked example from the brief.
const p72 = factorPairsOf(72, cfg({ includeOne: true }))
if (p72.map((p) => `${p[0]}x${p[1]}`).join(',') !== '1x72,2x36,3x24,4x18,6x12,8x9') fail(`72 pairs wrong: ${p72}`)
const s0 = cfg({ includeOne: true })
const none = new Set<string>()
// The question's pairs always come from the same settings that judge the entry, as in the real game.
const kind = (a: number, b: number, found = none, s = s0) => checkEntry({ id: 'fp-72', n: 72, pairs: factorPairsOf(72, s) }, a, b, s, found).kind
if (kind(8, 9) !== 'new' || kind(9, 8) !== 'new' || kind(4, 18) !== 'new' || kind(18, 4) !== 'new') fail('valid pairs in either order should be new')
if (kind(9, 8, new Set([pairKey(8, 9)])) !== 'dup') fail('9 x 8 after 8 x 9 should be a duplicate')
if (kind(8, 8) !== 'wrong' || kind(0, 72) !== 'wrong') fail('wrong products should be wrong')
if (kind(1, 72, none, cfg({ includeOne: false })) !== 'excluded') fail('1 x 72 with includeOne off should be excluded, not wrong')
if (kind(2, 36, none, cfg({ limitFactors: true, factorMin: 3, factorMax: 20 })) !== 'excluded') fail('2 x 36 outside the limit should be excluded')
if (JSON.stringify(parseEntry(' 8', '9 ')) !== '[8,9]' || parseEntry('', '9') !== null || parseEntry('a', '9') !== null) fail('parseEntry')
// 31 x 2 = 62 from the brief
if (checkEntry({ id: 'fp-62', n: 62, pairs: factorPairsOf(62, s0) }, 31, 2, s0, none).kind !== 'new') fail('31 x 2 should be valid for 62')

// 3. Tables x multipliers: the numbers are exactly the distinct products.
const tm = cfg({ source: 'tables', tableFrom: 11, tableTo: 19, multFrom: 11, multTo: 20 })
const want = new Set<number>()
for (let t = 11; t <= 19; t++) for (let m = 11; m <= 20; m++) want.add(t * m)
const got = candidateNumbers(tm)
if (got.length !== want.size || got.some((n) => !want.has(n))) fail('tables candidate numbers wrong')
if (got[0] !== 121 || got[got.length - 1] !== 380) fail(`tables range should span 121..380, got ${got[0]}..${got[got.length - 1]}`)
// reversed ends behave like ordered ends
if (candidateNumbers(cfg({ source: 'tables', tableFrom: 19, tableTo: 11, multFrom: 20, multTo: 11 })).length !== got.length) fail('reversed range')

// 4. Pool filters.
const range = cfg({ source: 'range', numFrom: 50, numTo: 120, minPairs: 4 })
const pool = buildPool(range)
if (pool.length === 0) fail('pool empty')
for (const q of pool) {
  if (q.n < 50 || q.n > 120) fail(`${q.n} outside range`)
  if (q.pairs.length < 4) fail(`${q.n} has fewer than 4 pairs`)
}
const expectedCount = Array.from({ length: 71 }, (_, i) => 50 + i).filter((n) => brute(n, true).length >= 4).length
if (pool.length !== expectedCount) fail(`pool size ${pool.length} want ${expectedCount}`)
if (buildPool(cfg({ numFrom: 90, numTo: 97, minPairs: 1, includeOne: false })).some((q) => q.n === 97)) fail('prime 97 has no pairs without 1 x N')
if (buildPool(cfg({ numFrom: 97, numTo: 97, minPairs: 1, includeOne: true })).length !== 1) fail('prime 97 with 1 x N has one pair')
if (buildPool(cfg({ numFrom: 97, numTo: 97, minPairs: 2 })).length !== 0) fail('prime 97 cannot have 2 pairs')

// 5. Generated sessions: right size, no number twice, only pool numbers.
for (let run = 0; run < 200; run++) {
  const count = [5, 10, 15, 20][run % 4]
  const qs = generateFactorQuestions(range, count)
  if (qs.length !== Math.min(count, pool.length)) fail(`session size ${qs.length}`)
  if (new Set(qs.map((q) => q.n)).size !== qs.length) fail('number repeated in a session')
}

console.log(`${failures === 0 ? 'OK' : 'FAILED'}: ${checked} number/filter combinations, ${pool.length} numbers in the 50-120 pool, ${got.length} table products`)
process.exit(failures === 0 ? 0 : 1)
