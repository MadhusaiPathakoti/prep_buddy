// Verifies "Learn today" (src/lib/dailyLearn.ts): each day's words are random picks from the not-yet-learned words (spread
// over the whole alphabet, not the next ones in order), a word only counts once marked learned, the day's set is stable
// until tomorrow, and separate banks keep separate progress.
// Run: npx tsx scripts/verify-daily-learn.ts

import { createLearnStore, localDateKey, pickRandomUnlearned } from '../src/lib/dailyLearn'

// minimal in-memory localStorage
const mem = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => (mem.has(k) ? (mem.get(k) as string) : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
}

let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  FAIL ${msg}`)
}
const check = (name: string, ok: boolean) => (ok ? console.log(`  ok   ${name}`) : fail(name))

const ids = Array.from({ length: 200 }, (_, i) => i + 1) // 1..200 stand for the alphabetical bank

console.log('== random pick')
{
  const picked = pickRandomUnlearned(ids, {}, 10)
  check('returns the requested number', picked.length === 10)
  check('all distinct and from the bank', new Set(picked).size === 10 && picked.every((n) => n >= 1 && n <= 200))

  const learned: Record<string, string> = {}
  for (let n = 1; n <= 150; n++) learned[n] = 'x'
  let leaked = false
  for (let t = 0; t < 300; t++) if (pickRandomUnlearned(ids, learned, 10).some((n) => learned[n])) leaked = true
  check('never picks a learned word', !leaked)
  check('picks come only from the 50 unlearned words', pickRandomUnlearned(ids, learned, 10).every((n) => n > 150))
  check('fewer left than asked -> returns what is left', pickRandomUnlearned(ids, learned, 80).length === 50)
  check('nothing left -> empty', pickRandomUnlearned(ids, Object.fromEntries(ids.map((n) => [n, 'x'])), 10).length === 0)

  // random, not alphabetical: over many days the picks cover the whole range and rarely equal "the next 10 in order"
  const seen = new Set<number>()
  let sequentialDays = 0
  const quartiles = new Set<number>()
  for (let t = 0; t < 200; t++) {
    const p = pickRandomUnlearned(ids, {}, 10)
    p.forEach((n) => {
      seen.add(n)
      quartiles.add(Math.floor((n - 1) / 50))
    })
    if ([...p].sort((a, b) => a - b).every((n, i) => n === i + 1)) sequentialDays++
  }
  check('over 200 days, picks cover nearly the whole range', seen.size >= 190)
  check('every quarter of the alphabet is reached', quartiles.size === 4)
  check('a day is essentially never just the first 10 in order', sequentialDays === 0)
  const first = pickRandomUnlearned(ids, {}, 10).join()
  let differs = false
  for (let t = 0; t < 20; t++) if (pickRandomUnlearned(ids, {}, 10).join() !== first) differs = true
  check('different picks on different draws', differs)
}

console.log('== store')
{
  const store = createLearnStore('verify-a')
  const p0 = store.getProgress()
  check('defaults: 10 words a day, nothing learned', p0.size === 10 && Object.keys(p0.learned).length === 0)
  check('setDailySize is saved', store.setDailySize(5).size === 5 && store.getProgress().size === 5)
  check('an invalid saved size falls back to the default', (() => {
    mem.set('prepbuddy:verify-a:learn', JSON.stringify({ size: 7, learned: {} }))
    return store.getProgress().size === 10
  })())
  store.setDailySize(10)

  const set1 = store.getTodaySet(ids)
  check('a day has 10 new words', set1.length === 10 && new Set(set1).size === 10)
  check('the same set all day (stable on reload)', store.getTodaySet(ids).join() === set1.join())

  // opening/viewing does nothing; only marking counts
  check('nothing is learned until marked', Object.keys(store.getProgress().learned).length === 0)
  const p1 = store.markLearned(set1[0])
  check('markLearned records the word', !!p1.learned[set1[0]])
  const stamp = p1.learned[set1[0]]
  check('marking again keeps the original time', store.markLearned(set1[0]).learned[set1[0]] === stamp)
  check('learnedOn counts today', store.learnedOn(store.getProgress()) === 1)
  check('learnedOn ignores other days', store.learnedOn(store.getProgress(), '2000-01-01') === 0)
  check('the set stays the same after marking a word', store.getTodaySet(ids).join() === set1.join())
  check('unmarkLearned takes it back', !store.unmarkLearned(set1[0]).learned[set1[0]])
  check('unmarking a word that is not learned is harmless', Object.keys(store.unmarkLearned(999).learned).length === 0)

  // mark half, ask for a fresh set: learned words are excluded
  set1.slice(0, 5).forEach((n) => store.markLearned(n))
  const set2 = store.buildTodaySet(ids, store.getProgress(), 10)
  check('a fresh set excludes learned words', set2.every((n) => !set1.slice(0, 5).includes(n)))
  check('the fresh set is remembered for the day', store.getTodaySet(ids).join() === set2.join())

  // a set from a previous day is replaced
  mem.set('prepbuddy:verify-a:learn-today', JSON.stringify({ date: '2000-01-01', ids: [1, 2, 3] }))
  const fresh = store.getTodaySet(ids)
  check('a new day builds a new random set', fresh.length === 10 && fresh.join() !== '1,2,3')
  check("the new day's set is stored with today's date", JSON.parse(mem.get('prepbuddy:verify-a:learn-today') as string).date === localDateKey())

  // ids that no longer exist in the bank are dropped from a stored set
  mem.set('prepbuddy:verify-a:learn-today', JSON.stringify({ date: localDateKey(), ids: [1, 2, 9999] }))
  check('unknown ids are dropped from a stored set', store.getTodaySet(ids).join() === '1,2')

  // learning the whole bank leaves nothing to pick
  const all = Object.fromEntries(ids.map((n) => [n, new Date().toISOString()]))
  mem.set('prepbuddy:verify-a:learn', JSON.stringify({ size: 10, learned: all }))
  mem.delete('prepbuddy:verify-a:learn-today')
  check('everything learned -> an empty set', store.getTodaySet(ids).length === 0)

  // banks are independent
  const other = createLearnStore('verify-b')
  other.markLearned(42)
  check('each bank keeps its own progress', !!other.getProgress().learned[42] && Object.keys(createLearnStore('verify-c').getProgress().learned).length === 0)
}

console.log(failures === 0 ? '\nAll Learn today checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
