// Verification for the clue-by-clue build-up of a family tree (src/lib/familyTree/steps.ts).  Run:  npx tsx scripts/verify-family-steps.ts   (RUNS=n)
//
// For puzzles made by the Family Tree game (each has exactly one family) and for the example puzzle, every step is checked:
//   - nothing reported as certain differs from the final family,
//   - it really is certain: where the families that fit the first k clues can all be listed, they all agree on it,
//   - what is certain never shrinks from one step to the next,
//   - after the last clue everything is certain (the family is fully fixed).
import { createRng } from '../src/lib/mocks/rng'
import { siblings } from '../src/lib/familyTree/model'
import { parseFamily } from '../src/lib/familyTree/parse'
import { solveFamily } from '../src/lib/familyTree/solve'
import { familySteps, type FamilyStep } from '../src/lib/familyTree/steps'
import { generateFamilyQuestions, type FamilyDifficulty } from '../src/lib/familyTreeGame'
import { SAMPLES } from '../src/lib/puzzleSolver/sample'

const RUNS = Number(process.env.RUNS ?? 9)
let failures = 0
let puzzles = 0
let stepsChecked = 0
let proved = 0
let maxMs = 0
const fail = (msg: string) => {
  failures++
  if (failures <= 30) console.error('FAIL', msg)
}

function check(text: string, tag: string) {
  const p = parseFamily(text).puzzle
  if (!p) return fail(`${tag}: not parsed`)
  const found = solveFamily(p, { limit: 2, nodeCap: 6_000_000, deadlineMs: 8000 })
  if (found.worlds.length !== 1 || !found.complete) return fail(`${tag}: not a unique puzzle`)
  const w = found.worlds[0]
  const n = p.names.length
  const t0 = Date.now()
  let steps: FamilyStep[] = []
  for (const s of familySteps(p, w)) steps = s
  maxMs = Math.max(maxMs, Date.now() - t0)
  puzzles++
  if (steps.length !== p.clues.length + 1) return fail(`${tag}: ${steps.length} steps for ${p.clues.length} clues`)
  for (const s of steps) {
    stepsChecked++
    const t = `${tag} k=${s.k}`
    const kn = s.known
    for (let i = 0; i < n; i++) {
      if (kn.gender[i] && kn.gender[i] !== w.gender[i]) fail(`${t}: gender of ${p.names[i]} contradicts the family`)
      if (kn.gen[i] !== null && kn.gen[i] !== w.gen[i]) fail(`${t}: generation of ${p.names[i]} contradicts the family`)
      if (kn.spouse[i] !== null && kn.spouse[i] !== w.spouse[i]) fail(`${t}: spouse of ${p.names[i]} contradicts the family`)
      for (let j = 0; j < n; j++) if (kn.sibs[i][j] && !siblings(w, i, j)) fail(`${t}: ${p.names[i]}, ${p.names[j]} are not brothers or sisters`)
    }
    // really certain? list every family that fits the first k clues (when that is feasible)
    const all = solveFamily({ ...p, clues: p.clues.slice(0, s.k) }, { limit: 4000, nodeCap: 8_000_000, deadlineMs: 6000 })
    if (all.complete && all.worlds.length) {
      for (let i = 0; i < n; i++) {
        if (kn.gender[i] && !all.worlds.every((x) => x.gender[i] === kn.gender[i])) fail(`${t}: gender of ${p.names[i]} is not certain`)
        else if (kn.gender[i]) proved++
        if (kn.gen[i] !== null && !all.worlds.every((x) => x.gen[i] === kn.gen[i])) fail(`${t}: generation of ${p.names[i]} is not certain`)
        else if (kn.gen[i] !== null) proved++
        if (kn.spouse[i] !== null && !all.worlds.every((x) => x.spouse[i] === kn.spouse[i])) fail(`${t}: spouse of ${p.names[i]} is not certain`)
        else if (kn.spouse[i] !== null) proved++
        if (kn.parents[i] && !all.worlds.every((x) => x.father[i] === w.father[i] && x.mother[i] === w.mother[i])) fail(`${t}: parents of ${p.names[i]} are not certain`)
        for (let j = 0; j < n; j++) if (kn.sibs[i][j] && !all.worlds.every((x) => siblings(x, i, j))) fail(`${t}: ${p.names[i]}, ${p.names[j]} not certainly siblings`)
      }
      if (s.k > 0 && !s.many && s.trees !== all.worlds.length) fail(`${t}: ${s.trees} families reported, ${all.worlds.length} fit`)
    }
    if (s.k > 0) {
      const prev = steps[s.k - 1].known
      for (let i = 0; i < n; i++) {
        if (prev.gender[i] && !kn.gender[i]) fail(`${t}: gender of ${p.names[i]} was taken back`)
        if (prev.gen[i] !== null && kn.gen[i] === null) fail(`${t}: generation of ${p.names[i]} was taken back`)
        if (prev.spouse[i] !== null && kn.spouse[i] === null) fail(`${t}: spouse of ${p.names[i]} was taken back`)
        if (prev.parents[i] && !kn.parents[i]) fail(`${t}: parents of ${p.names[i]} were taken back`)
      }
    }
  }
  const last = steps[steps.length - 1]
  if (last.trees !== 1 || last.many) fail(`${tag}: ${last.trees} families after the last clue`)
  for (let i = 0; i < n; i++) if (!last.known.gender[i] || last.known.gen[i] === null || last.known.spouse[i] === null || !last.known.parents[i]) fail(`${tag}: ${p.names[i]} is not fully fixed after the last clue`)
}

check(SAMPLES.find((s) => s.id === 'family-tree')!.text, 'example')
const LEVELS: FamilyDifficulty[] = ['easy', 'medium', 'hard']
for (let r = 0; r < RUNS; r++) {
  const lv = LEVELS[r % 3]
  for (const q of generateFamilyQuestions(lv, 'mixed', 2, createRng(5300 + r))) check(q.text, `[${lv}] ${q.text.split('\n')[1]}`)
}

console.log(`${puzzles} puzzles, ${stepsChecked} steps checked; ${proved} certain facts re-proved by listing every family; slowest puzzle took ${(maxMs / 1000).toFixed(1)}s`)
if (failures) {
  console.error(`${failures} failure(s)`)
  process.exit(1)
}
console.log('OK')
