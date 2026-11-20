// Verifies the Mnemonic Vocabulary bank and the revision-game logic: every word is complete (word, pronunciation, part
// of speech, meaning, synonyms, antonyms, two distinct examples, a picture on disk), and the question builder / favourite
// picker behave (4 distinct options incl. the answer, no distractor that could also be right, freshness window and order).
// Run: npx tsx scripts/verify-mnemonic.ts

import { existsSync, readFileSync } from 'node:fs'
import { areRelated, buildQuestions, pickRevisionWords, type MnemonicWord, type ReviseMode, type WordStat } from '../src/lib/mnemonicVocab'

let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  FAIL ${msg}`)
}

const bank = JSON.parse(readFileSync('src/data/mnemonicVocab.json', 'utf8')) as MnemonicWord[]

console.log('== data')
if (bank.length !== 1018) fail(`expected 1018 words, found ${bank.length}`)
const ids = new Set<string>()
const nums = new Set<number>()
for (const w of bank) {
  const tag = `#${w.n} ${w.word}`
  if (ids.has(w.id) || nums.has(w.n)) fail(`${tag}: duplicate id/number`)
  ids.add(w.id)
  nums.add(w.n)
  if (w.id !== `mn-${w.n}`) fail(`${tag}: id should be mn-${w.n}`)
  for (const f of ['word', 'pronunciation', 'pos', 'hindi', 'meaning', 'trick'] as const) {
    if (!w[f] || !w[f].trim()) fail(`${tag}: empty ${f}`)
  }
  if (/([ा-ौ])\1/.test(w.hindi + w.trick)) fail(`${tag}: doubled Devanagari vowel sign`)
  if (w.synonyms.length < 1) fail(`${tag}: no synonyms`)
  if (w.antonyms.length < 1) fail(`${tag}: no antonyms`)
  if (w.examples.length !== 2 || w.examples.some((e) => !e || e.length < 20)) fail(`${tag}: needs two example sentences`)
  else if (w.examples[0] === w.examples[1]) fail(`${tag}: examples are identical`)
  if (!existsSync(`public/mnemonic/img/${w.n}.webp`)) fail(`${tag}: picture missing`)
}
for (let n = 1; n <= 1018; n++) if (!nums.has(n)) fail(`number ${n} missing`)
console.log(`  ${bank.length} words checked`)

console.log('== questions')
const byWord = new Map(bank.map((w) => [w.word.toLowerCase(), w]))
const byMeaning = new Map(bank.map((w) => [w.meaning.toLowerCase(), w]))
for (const mode of ['picture', 'meaning', 'mixed'] as ReviseMode[]) {
  const qs = buildQuestions(bank, bank, mode)
  if (qs.length !== bank.length) fail(`${mode}: expected one question per word`)
  for (const q of qs) {
    const tag = `${mode} #${q.word.n}`
    if (mode !== 'mixed' && q.kind !== mode) fail(`${tag}: wrong kind ${q.kind}`)
    const expected = q.kind === 'picture' ? q.word.word : q.word.meaning
    if (q.answer !== expected) fail(`${tag}: answer is not the word's ${q.kind === 'picture' ? 'word' : 'meaning'}`)
    if (q.options.length !== 4) fail(`${tag}: ${q.options.length} options`)
    if (new Set(q.options.map((o) => o.toLowerCase())).size !== q.options.length) fail(`${tag}: duplicate options`)
    if (!q.options.includes(q.answer)) fail(`${tag}: answer missing from options`)
    for (const o of q.options) {
      if (o === q.answer) continue
      const owner = (q.kind === 'picture' ? byWord : byMeaning).get(o.toLowerCase())
      if (!owner) fail(`${tag}: option "${o}" is not from the bank`)
      else if (owner.n === q.word.n || areRelated(q.word, owner)) fail(`${tag}: distractor "${o}" could also be right`)
    }
  }
  console.log(`  ${mode}: ${qs.length} questions ok`)
}

console.log('== favourite picker')
const DAY = 24 * 60 * 60 * 1000
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()
const favs = new Map<string, string | null>([
  ['mn-1', ago(0.1)], // fresh
  ['mn-2', ago(2.5)],
  ['mn-3', ago(10)],
  ['mn-4', ago(40)],
  ['mn-5', null], // saved before dates were tracked
])
const nums_ = (ws: MnemonicWord[]) => ws.map((w) => w.n)
const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i])

const anyTime = pickRevisionWords(bank, favs, null, 'fresh', 10, {})
if (!same(nums_(anyTime), [1, 2, 3, 4, 5])) fail(`any-time/fresh order wrong: ${nums_(anyTime)} (undated favourites go last)`)
const w3 = pickRevisionWords(bank, favs, 3, 'fresh', 10, {})
if (!same(nums_(w3), [1, 2])) fail(`3-day window wrong: ${nums_(w3)}`)
const w14 = pickRevisionWords(bank, favs, 14, 'fresh', 10, {})
if (!same(nums_(w14), [1, 2, 3])) fail(`14-day window wrong: ${nums_(w14)}`)
if (pickRevisionWords(bank, favs, 1, 'fresh', 10, {}).length !== 1) fail('1-day window should hold only mn-1')
if (!same(nums_(pickRevisionWords(bank, favs, null, 'fresh', 2, {})), [1, 2])) fail('count should cut to the freshest 2')
if (pickRevisionWords(bank, new Map(), null, 'fresh', 10, {}).length !== 0) fail('no favourites should give no words')

const stats: Record<string, WordStat> = {
  1: { right: 3, wrong: 0, last: 'right', at: ago(1) },
  2: { right: 0, wrong: 1, last: 'wrong', at: ago(1) },
  3: { right: 2, wrong: 0, last: 'right', at: ago(9) },
  // 4 and 5 never asked
}
const weak = nums_(pickRevisionWords(bank, favs, null, 'weak', 10, stats))
// missed last time (2) -> never asked (4 then 5 by freshness) -> asked longest ago first (3 before 1)
if (!same(weak, [2, 4, 5, 3, 1])) fail(`weak order wrong: ${weak}`)
const random = pickRevisionWords(bank, favs, null, 'random', 10, {})
if (!same(nums_(random).sort(), [1, 2, 3, 4, 5])) fail('random should return the same set')

console.log(failures === 0 ? '\nAll mnemonic vocabulary checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
