// Verification for the Family Tree game.  Run:  npx tsx scripts/verify-family-game.ts   (RUNS=n to change the number of rounds)
//
// Every answer is recomputed from the TEXT the player sees: the passage is parsed again with the Puzzle Solver's own parser and solved
// from scratch (it must give exactly one family, the planted one), then the question and its options are read back and checked
// against that family. Also checks the passage is recognised as a family puzzle (so the Puzzle Solver opens its tree view).
import { createRng } from '../src/lib/mocks/rng'
import { holds, siblings, type World } from '../src/lib/familyTree/model'
import { isFamilyPuzzle, parseFamily } from '../src/lib/familyTree/parse'
import { solveFamily } from '../src/lib/familyTree/solve'
import { PLURAL_TO_REL, generateFamilyQuestions, genStats, relLabel, type FamilyDifficulty, type FamilyQType } from '../src/lib/familyTreeGame'

const RUNS = Number(process.env.RUNS ?? 36)
const PER = Number(process.env.PER ?? 6)
let failures = 0
let checked = 0
const fail = (msg: string) => {
  failures++
  if (failures <= 30) console.error('FAIL', msg)
}

const LEVELS: FamilyDifficulty[] = ['easy', 'medium', 'hard', 'mixed']
const TYPES: FamilyQType[] = ['mixed', 'relation', 'who', 'count', 'true']
const NUM_WORDS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
const ORDINALS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 }

const same = (a: World, b: World): boolean => {
  for (let i = 0; i < a.n; i++) {
    if (a.names[i] !== b.names[i] || a.gender[i] !== b.gender[i] || a.gen[i] !== b.gen[i] || a.spouse[i] !== b.spouse[i] || a.father[i] !== b.father[i] || a.mother[i] !== b.mother[i]) return false
    for (let j = 0; j < a.n; j++) if (siblings(a, i, j) !== siblings(b, i, j)) return false
  }
  return true
}

/** the answer to a "How many …" question, counted straight from the family */
function countAnswer(u: World, stem: string): number | null {
  const idx = (c: string) => u.names.indexOf(c)
  const all = Array.from({ length: u.n }, (_, i) => i)
  if (stem === 'How many men are there in the family?') return all.filter((i) => u.gender[i] === 'M').length
  if (stem === 'How many women are there in the family?') return all.filter((i) => u.gender[i] === 'F').length
  if (stem === 'How many married couples are there in the family?') return all.filter((i) => u.gender[i] === 'M' && u.spouse[i] >= 0).length
  if (stem === 'How many people in the family are unmarried?') return all.filter((i) => u.spouse[i] < 0).length
  let m = stem.match(/^How many people belong to the (\w+) generation\?$/)
  if (m) return all.filter((i) => u.gen[i] === ORDINALS[m![1]]).length
  m = stem.match(/^How many (.+) does ([A-Z]) have\?$/)
  if (m) {
    const rel = PLURAL_TO_REL[m[1]]
    const y = idx(m[2])
    if (!rel || y < 0) return null
    return all.filter((x) => x !== y && holds(u, rel, x, y) !== null).length
  }
  return null
}

const stats = { questions: 0, clues: 0, byKind: { relation: 0, who: 0, count: 0, true: 0 } as Record<string, number>, notTrueVariant: 0, redundant: 0, prunable: 0 }
const t0 = Date.now()

for (let r = 0; r < RUNS; r++) {
  const difficulty = LEVELS[r % 4]
  const type = TYPES[(r >> 2) % 5]
  const qs = generateFamilyQuestions(difficulty, type, PER, createRng(9100 + r))
  if (qs.length < PER) fail(`[${difficulty}/${type}] only ${qs.length} of ${PER} questions were made`)
  for (const q of qs) {
    checked++
    const tag = `[${difficulty}/${type}/${q.level}] "${q.stem}"`
    stats.questions++
    stats.byKind[q.kind]++

    // shape of the question
    if (q.options.length !== 5 || new Set(q.options).size !== 5) fail(`${tag}: options ${q.options.join(' | ')}`)
    if (q.answer < 0 || q.answer >= q.options.length) fail(`${tag}: answer index ${q.answer}`)
    if (!q.hint || !q.explanation) fail(`${tag}: missing hint/explanation`)
    if (!isFamilyPuzzle(q.text)) fail(`${tag}: the passage is not recognised as a family puzzle:\n${q.text}`)

    // the passage: read again, solved from scratch
    const parsed = parseFamily(q.text)
    const p = parsed.puzzle
    if (!p || parsed.errors.length || parsed.unparsed.length) {
      fail(`${tag}: passage not understood: ${parsed.errors.join('; ')} ${parsed.unparsed.join(' | ')}\n${q.text}`)
      continue
    }
    const header = q.text.split('\n')[0].match(/family of (\w+) people spread across (\w+) generations/)
    if (!header || NUM_WORDS[header[1]] !== p.names.length || NUM_WORDS[header[2]] !== p.gens) fail(`${tag}: header does not match the people named (${p.names.join('')}, ${p.gens})`)
    if (p.names.some((l) => l === 'I' || l === 'O')) fail(`${tag}: a person is called I or O`)
    const found = solveFamily(p, { limit: 5, nodeCap: 6_000_000, deadlineMs: 8000 })
    if (!found.complete || found.worlds.length !== 1) {
      fail(`${tag}: ${found.worlds.length} families fit${found.complete ? '' : ' (search incomplete)'}\n${q.text}`)
      continue
    }
    const u = found.worlds[0]
    if (!same(u, q.world)) fail(`${tag}: the solved family is not the planted one\n${q.text}`)
    stats.clues += p.clues.length

    // every statement should matter (the generator drops unneeded ones within a search budget; count what it kept)
    for (const c of p.clues) {
      const rest = solveFamily({ ...p, clues: p.clues.filter((x) => x.id !== c.id) }, { limit: 2, nodeCap: 1_500_000, deadlineMs: 3000 })
      if (rest.complete && rest.worlds.length === 1) stats.redundant++
    }

    // the question, read back from its text
    const text = q.stem
    const label = (s: string) => s
    const opts = q.options.map(label)
    let m: RegExpMatchArray | null
    if ((m = text.match(/^How is ([A-Z]) related to ([A-Z])\?$/))) {
      const x = u.names.indexOf(m[1])
      const y = u.names.indexOf(m[2])
      const truths = opts.map((o, k) => ({ o, k, ok: holds(u, o.toLowerCase(), x, y) !== null }))
      const right = truths.filter((t) => t.ok)
      if (right.length !== 1 || right[0].k !== q.answer) fail(`${tag}: options true for ${m[1]}→${m[2]}: ${right.map((t) => t.o).join(', ') || 'none'}; game says ${opts[q.answer]}`)
      if (opts.some((o) => o !== relLabel(o.toLowerCase()))) fail(`${tag}: label format ${opts.join('|')}`)
    } else if ((m = text.match(/^Who is the (.+) of ([A-Z])\?$/))) {
      const rel = m[1]
      const y = u.names.indexOf(m[2])
      const holders = u.names.map((_, i) => i).filter((i) => i !== y && holds(u, rel, i, y) !== null)
      const picked = opts.filter((o) => holders.includes(u.names.indexOf(o)))
      if (holders.length !== 1 || picked.length !== 1 || picked[0] !== opts[q.answer]) fail(`${tag}: holders ${holders.map((i) => u.names[i]).join(',')}; options ${opts.join('')}; game says ${opts[q.answer]}`)
      if (opts.includes(m[2])) fail(`${tag}: the person asked about is an option`)
    } else if (text.startsWith('How many ')) {
      const want = countAnswer(u, text)
      if (want === null) fail(`${tag}: could not read the count question`)
      else if (opts[q.answer] !== String(want)) fail(`${tag}: game says ${opts[q.answer]}, recount says ${want}`)
      else if (opts.map(Number).some((v, k, a) => v < 0 || (k > 0 && v <= a[k - 1]))) fail(`${tag}: options not ascending distinct non-negative: ${opts.join(',')}`)
    } else if ((m = text.match(/^Which of the following statements is (NOT )?true\?$/))) {
      const negate = !!m[1]
      if (negate) stats.notTrueVariant++
      const verdicts = opts.map((o) => {
        const s = o.match(/^([A-Z]) is the (.+) of ([A-Z])$/)
        return s ? holds(u, s[2], u.names.indexOf(s[1]), u.names.indexOf(s[3])) !== null : null
      })
      if (verdicts.includes(null)) fail(`${tag}: could not read a statement in ${opts.join(' | ')}`)
      const odd = verdicts.map((v, k) => ({ v, k })).filter((e) => e.v === !negate)
      if (odd.length !== 1 || odd[0].k !== q.answer) fail(`${tag}: ${odd.length} statements fit; game says #${q.answer}; verdicts ${verdicts.join(',')}`)
    } else fail(`${tag}: unknown question shape`)
  }
}

const sec = ((Date.now() - t0) / 1000).toFixed(1)
console.log(`${checked} questions checked over ${RUNS} rounds in ${sec}s (${stats.questions} questions; ${Object.entries(stats.byKind).map(([k, v]) => `${k} ${v}`).join(', ')}; NOT-true ${stats.notTrueVariant}).`)
console.log(`average ${(stats.clues / stats.questions).toFixed(1)} clues per passage; ${stats.redundant} clue(s) not needed in ${stats.questions} passages; draws ${JSON.stringify(genStats)}`)
if (failures) {
  console.error(`${failures} failure(s)`)
  process.exit(1)
}
console.log('OK')
