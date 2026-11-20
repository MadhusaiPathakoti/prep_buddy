// Verifies The Hindu Vocabulary bank and its practice game: every word is complete (Hindi + English meaning, five synonyms,
// five antonyms, two distinct examples) and each question type builds well-formed questions — 4 distinct options including
// the answer, and no distractor that could also be right.
// Run: npx tsx scripts/verify-hindu-vocab.ts

import { readFileSync } from 'node:fs'
import { areRelated, buildHinduQuestions, fillSentence, isFillable, type HinduMode, type HinduWord } from '../src/lib/hinduVocab'

let failures = 0
const fail = (msg: string) => {
  failures++
  if (failures <= 40) console.error(`  FAIL ${msg}`)
}

const bank = JSON.parse(readFileSync('src/data/hinduVocab.json', 'utf8')) as HinduWord[]
const norm = (s: string) => s.trim().toLowerCase()

console.log('== data')
if (bank.length !== 1787) fail(`expected 1787 words, found ${bank.length}`)
const ids = new Set<string>()
const words = new Set<string>()
for (const w of bank) {
  const tag = `#${w.n} ${w.word}`
  if (ids.has(w.id)) fail(`${tag}: duplicate id`)
  ids.add(w.id)
  if (words.has(norm(w.word))) fail(`${tag}: duplicate word`)
  words.add(norm(w.word))
  if (w.id !== `hv-${w.n}`) fail(`${tag}: id should be hv-${w.n}`)
  for (const f of ['word', 'pos', 'hindi', 'meaning'] as const) if (!w[f] || !w[f].trim()) fail(`${tag}: empty ${f}`)
  if (/[A-Za-z]/.test(w.hindi)) fail(`${tag}: Latin letters in the Hindi meaning`)
  if (/\.$/.test(w.meaning)) fail(`${tag}: meaning ends with a full stop`)
  if (w.synonyms.length !== 5 || w.antonyms.length !== 5) fail(`${tag}: needs 5 synonyms and 5 antonyms`)
  if (new Set(w.synonyms.map(norm)).size !== 5 || new Set(w.antonyms.map(norm)).size !== 5) fail(`${tag}: repeated synonym/antonym`)
  const both = w.synonyms.filter((s) => w.antonyms.map(norm).includes(norm(s)))
  if (both.length) fail(`${tag}: ${both.join(', ')} listed as both synonym and antonym`)
  if (w.synonyms.map(norm).includes(norm(w.word)) || w.antonyms.map(norm).includes(norm(w.word))) fail(`${tag}: lists itself`)
  if (w.examples.length !== 2 || w.examples.some((e) => !e || e.length < 20)) fail(`${tag}: needs two example sentences`)
  else if (w.examples[0] === w.examples[1]) fail(`${tag}: examples identical`)
}
for (let n = 1; n <= 1787; n++) if (!ids.has(`hv-${n}`)) fail(`number ${n} missing`)
const fillable = bank.filter(isFillable).length
console.log(`  ${bank.length} words checked; ${fillable} can make a fill-in-the-blank`)
if (fillable < bank.length * 0.5) fail('fewer than half the words can make a fill-in-the-blank')

console.log('== questions')
const byWord = new Map(bank.map((w) => [norm(w.word), w]))
const modes: HinduMode[] = ['meaning', 'hindi', 'synonym', 'antonym', 'fill', 'mixed']
for (const mode of modes) {
  const pool = mode === 'fill' ? bank.filter(isFillable) : bank
  const qs = buildHinduQuestions(bank, pool, mode)
  if (qs.length !== pool.length) fail(`${mode}: expected ${pool.length} questions, got ${qs.length}`)
  const kinds: Record<string, number> = {}
  for (const q of qs) {
    const w = bank.find((x) => x.id === q.id) as HinduWord
    const tag = `${mode} ${w.id} ${w.word}`
    kinds[q.instruction ?? '?'] = (kinds[q.instruction ?? '?'] ?? 0) + 1
    if (q.options.length !== 4) fail(`${tag}: ${q.options.length} options`)
    if (new Set(q.options.map(norm)).size !== q.options.length) fail(`${tag}: duplicate options`)
    if (!q.options.includes(q.correctMeaning)) fail(`${tag}: answer missing from options`)
    const wrong = q.options.filter((o) => o !== q.correctMeaning)
    switch (q.instruction) {
      case 'Choose the meaning':
        if (q.correctMeaning !== w.meaning) fail(`${tag}: wrong answer`)
        for (const o of wrong) if (norm(o) === norm(w.meaning)) fail(`${tag}: wrong option equals the answer`)
        break
      case 'Which English word means this?':
        if (q.term !== w.hindi || q.correctMeaning !== w.word) fail(`${tag}: hindi question malformed`)
        for (const o of wrong) {
          const x = byWord.get(norm(o))
          if (!x) fail(`${tag}: option "${o}" not in the bank`)
          else if (areRelated(w, x)) fail(`${tag}: distractor "${o}" could also be right`)
        }
        break
      case 'Pick the synonym':
        if (!w.synonyms.includes(q.correctMeaning)) fail(`${tag}: answer is not a synonym`)
        for (const o of wrong) if (w.synonyms.map(norm).includes(norm(o)) || norm(o) === norm(w.word)) fail(`${tag}: distractor "${o}" is also a synonym`)
        if (!wrong.some((o) => w.antonyms.map(norm).includes(norm(o)))) fail(`${tag}: no antonym trap among the options`)
        break
      case 'Pick the antonym':
        if (!w.antonyms.includes(q.correctMeaning)) fail(`${tag}: answer is not an antonym`)
        for (const o of wrong) if (w.antonyms.map(norm).includes(norm(o)) || norm(o) === norm(w.word)) fail(`${tag}: distractor "${o}" is also an antonym`)
        if (!wrong.some((o) => w.synonyms.map(norm).includes(norm(o)))) fail(`${tag}: no synonym trap among the options`)
        break
      case 'Fill in the blank': {
        const blanks = q.term.split('_____').length - 1
        if (blanks !== 1) fail(`${tag}: ${blanks} blanks`)
        if (norm(q.correctMeaning) !== norm(w.word)) fail(`${tag}: blank answer is not the word`)
        const filled = q.term.replace('_____', q.correctMeaning)
        if (!w.examples.some((e) => e === filled)) fail(`${tag}: filled sentence is not one of the examples`)
        for (const o of wrong) {
          const x = byWord.get(norm(o))
          if (!x) fail(`${tag}: option "${o}" not in the bank`)
          else if (areRelated(w, x)) fail(`${tag}: distractor "${o}" could also be right`)
        }
        break
      }
      default:
        fail(`${tag}: unknown question type ${q.instruction}`)
    }
  }
  console.log(`  ${mode}: ${qs.length} questions ok`, mode === 'mixed' ? JSON.stringify(kinds) : '')
}

// the blank must be exactly where the word was
const sample = bank.find((w) => fillSentence(w))
if (!sample) fail('no fillable word at all')

console.log(failures === 0 ? '\nAll Hindu vocabulary checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
