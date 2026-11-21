// Verification for the Letter Pairs game.  Run:  npx tsx scripts/verify-letter-pairs.ts   (RUNS=n to change the number of rounds)
//
// Every answer is recomputed from the question TEXT by following the exam wording literally: count the letters that sit between
// two letters in the word and between them in the alphabet string, and compare. Also checks the options and the fixed example.
import { createRng } from '../src/lib/mocks/rng'
import { generateLetterPairs, pairsIn, type PairDifficulty, type PairType } from '../src/lib/letterPairs'

const RUNS = Number(process.env.RUNS ?? 300)
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
let failures = 0
let checked = 0
const fail = (msg: string) => {
  failures++
  if (failures <= 30) console.error('FAIL', msg)
}

/** Letters between positions i<j in the word, versus letters between the two letters in the alphabet (either direction). */
function qualifies(word: string, i: number, j: number): boolean {
  if (word[i] === word[j]) return false
  const inWord = word.slice(i + 1, j).length
  const a = ALPHABET.indexOf(word[i])
  const b = ALPHABET.indexOf(word[j])
  const inAlphabet = ALPHABET.slice(Math.min(a, b) + 1, Math.max(a, b)).length
  return inWord === inAlphabet
}

const COUNT = ['None', 'One', 'Two', 'Three', 'More than three']
const countLabel = (c: number) => COUNT[Math.min(c, 4)]

// the example given by the user: FINANCIAL has two such pairs (A…C and C…A)
{
  const w = 'FINANCIAL'
  let c = 0
  for (let i = 0; i < w.length; i++) for (let j = i + 1; j < w.length; j++) if (qualifies(w, i, j)) c++
  if (c !== 2 || pairsIn(w).length !== 2) fail(`FINANCIAL should have 2 pairs, got ${c} / ${pairsIn(w).length}`)
}

const LEVELS: PairDifficulty[] = ['easy', 'medium', 'hard', 'mixed']
const TYPES: PairType[] = ['mixed', 'pairs', 'which', 'sorted']
const kinds = new Set<string>()

for (let r = 0; r < RUNS; r++) {
  const difficulty = LEVELS[r % 4]
  const type = TYPES[(r >> 2) % 4]
  const qs = generateLetterPairs(difficulty, type, 20, createRng(5000 + r))
  const words = new Set<string>()
  for (const q of qs) {
    checked++
    kinds.add(q.kind)
    const tag = `[${difficulty}/${type}] ${q.word} (${q.kind})`
    if (words.has(q.word)) fail(`${tag}: word repeated within a session`)
    words.add(q.word)
    if (new Set(q.options).size !== q.options.length || q.options.length !== 5) fail(`${tag}: options ${q.options.join('|')}`)
    const given = q.options[q.answer]

    if (q.kind === 'pairs') {
      let c = 0
      for (let i = 0; i < q.word.length; i++) for (let j = i + 1; j < q.word.length; j++) if (qualifies(q.word, i, j)) c++
      if (given !== countLabel(c)) fail(`${tag}: game says ${given}, recount says ${countLabel(c)} (${c})`)
    } else if (q.kind === 'which') {
      const matching: string[] = []
      for (let i = 0; i < q.word.length; i++) for (let j = i + 1; j < q.word.length; j++) if (qualifies(q.word, i, j)) matching.push([q.word[i], q.word[j]].sort().join(''))
      if (new Set(matching).size !== 1) fail(`${tag}: ${new Set(matching).size} distinct qualifying pairs`)
      if (given !== matching[0]) fail(`${tag}: game says ${given}, recount says ${matching[0]}`)
      // every wrong option must be a real pair of letters from the word, and must not qualify at any places
      for (const [k, opt] of q.options.entries()) {
        if (k === q.answer) continue
        let present = false
        let bad = false
        for (let i = 0; i < q.word.length; i++) {
          for (let j = i + 1; j < q.word.length; j++) {
            if ([q.word[i], q.word[j]].sort().join('') !== opt) continue
            present = true
            if (qualifies(q.word, i, j)) bad = true
          }
        }
        if (!present) fail(`${tag}: option ${opt} is not a pair in the word`)
        if (bad) fail(`${tag}: wrong option ${opt} also qualifies`)
      }
    } else {
      const reverse = /reverse alphabetical/.test(q.term)
      const sorted = q.word.split('').sort((a, b) => (reverse ? (a < b ? 1 : a > b ? -1 : 0) : a < b ? -1 : a > b ? 1 : 0)).join('')
      let c = 0
      for (let i = 0; i < q.word.length; i++) if (q.word[i] === sorted[i]) c++
      if (given !== countLabel(c)) fail(`${tag}: game says ${given}, recount says ${countLabel(c)} (${c})`)
    }
    if (!q.explanation || !q.hint) fail(`${tag}: missing explanation/hint`)
  }
}

if (kinds.size !== 3) fail(`only saw kinds: ${[...kinds].join(',')}`)
console.log(`${checked} questions checked over ${RUNS} rounds; kinds seen: ${[...kinds].join(', ')}.`)
if (failures) {
  console.error(`${failures} failure(s)`)
  process.exit(1)
}
console.log('OK')
