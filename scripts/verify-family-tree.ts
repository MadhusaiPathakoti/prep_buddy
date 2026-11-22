// Verifies the family-tree (blood relation) part of the Puzzle Solver: src/lib/familyTree/*.
//   - the relation vocabulary against hand-built families,
//   - the parser on many phrasings (including "who" / "and" reference rules),
//   - the example puzzle: exactly one tree, the one in the answer picture,
//   - random families: clues made from true facts must always leave the planted family among the solutions.
// Run: npx tsx scripts/verify-family-tree.ts   (RUNS=300 for more random families)

import { holds, famKey, siblings, type Gender, type World } from '../src/lib/familyTree/model'
import { describeFact, isFamilyPuzzle, parseFamily } from '../src/lib/familyTree/parse'
import { bloodRelated, clueHolds, factHolds, solveFamily, type Fact, type FamilyPuzzle } from '../src/lib/familyTree/solve'
import { analyzeFamily, refineAnalysis } from '../src/lib/familyTree/analyze'
import { layoutFamily } from '../src/lib/familyTree/layout'
import { SAMPLES } from '../src/lib/puzzleSolver/sample'

let failures = 0
let checks = 0
const fail = (msg: string) => {
  failures++
  console.error(`FAIL ${msg}`)
}
const check = (ok: boolean, msg: string) => {
  checks++
  if (!ok) fail(msg)
}

// ── hand-built family: A(M)=R(F), N(M)=T(F), T and A are brother and sister; H(M) is the son of N and T, G(F) is married to H, P(F) is the daughter of A and R
const names = ['A', 'G', 'H', 'N', 'P', 'R', 'T']
const I = (c: string) => names.indexOf(c)
const hand: World = {
  n: 7,
  names,
  gender: ['M', 'F', 'M', 'M', 'F', 'F', 'F'],
  gen: [1, 2, 2, 1, 2, 1, 1],
  spouse: [I('R'), I('H'), I('G'), I('T'), -1, I('A'), I('N')],
  father: [-1, -1, I('N'), -1, I('A'), -1, -1],
  mother: [-1, -1, I('T'), -1, I('R'), -1, -1],
  ext: [0, 3, -1, 1, -1, 2, 0],
}
const yes = (rel: string, x: string, y: string) => check(holds(hand, rel, I(x), I(y)) !== null, `${x} should be the ${rel} of ${y}`)
const no = (rel: string, x: string, y: string) => check(holds(hand, rel, I(x), I(y)) === null, `${x} should NOT be the ${rel} of ${y}`)
yes('mother', 'R', 'P'); no('father', 'R', 'P'); yes('father', 'A', 'P'); yes('daughter', 'P', 'A'); yes('son', 'H', 'T'); no('son', 'G', 'T')
yes('brother', 'A', 'T'); yes('sister', 'T', 'A'); no('brother', 'T', 'A'); yes('sibling', 'A', 'T')
yes('husband', 'N', 'T'); yes('wife', 'T', 'N'); yes('spouse', 'G', 'H')
yes('uncle', 'A', 'H'); no('uncle', 'N', 'H'); yes('uncle', 'N', 'P'); yes('aunt', 'T', 'P'); yes('maternal uncle', 'A', 'H'); no('paternal uncle', 'A', 'H')
yes('nephew', 'H', 'A'); yes('niece', 'P', 'T'); yes('cousin', 'H', 'P'); yes('cousin', 'P', 'H'); no('cousin', 'H', 'G')
yes('brother-in-law', 'N', 'A'); yes('sister-in-law', 'R', 'T'); yes('brother-in-law', 'A', 'N'); no('brother-in-law', 'N', 'T')
yes('mother-in-law', 'T', 'G'); yes('father-in-law', 'N', 'G'); yes('daughter-in-law', 'G', 'T')
no('son-in-law', 'H', 'R') // H is not married to a child of R (G's parents are outside the family)
no('grandfather', 'N', 'H')

// ── parser phrasings → facts
const HEAD = 'There is a family of six people spread across two generations. '
const phr: [string, string][] = [
  ['A is the brother of B, who is a male.', 'A is the brother of B ; B is male'],
  ['A, who has only one daughter, is the uncle of B.', 'A is the uncle of B ; A has exactly one daughter'],
  ['C, who does not have any siblings is the mother of D.', 'C is the mother of D ; C has no siblings'],
  ['A is the mother-in-law of B, who is married to C.', 'A is the mother-in-law of B ; B is the spouse of C'],
  ['A and B are married.', 'A is the spouse of B'],
  ['A and B are the children of C.', 'A is the child of C ; B is the child of C'],
  ['A is the father of B and the grandfather of C.', 'A is the father of B ; A is the grandfather of C'],
  ['A is the sister of B but the aunt of C.', 'A is the sister of B ; A is the aunt of C'],
  ['A is the only child.', 'A has no siblings'],
  ['A has two sons.', 'A has exactly 2 sons'],
  ['A is not the brother of B.', 'A is not the brother of B'],
  ['A is a woman.', 'A is female'],
  ['A is the only sister of B.', 'A is the sister of B ; B has exactly one sister'],
  ['A is the aunt of B, who is the only son of C.', 'A is the aunt of B ; B is the son of C ; C has exactly one son'],
  ["A is the brother-in-law of B, who is married to C's brother.", 'A is the brother-in-law of B ; B is married to the brother of C'],
  ['A and B are of the opposite gender, and C is unmarried.', 'A and B are of opposite gender ; C is unmarried'],
  ['A and B are of the same gender.', 'A and B are of the same gender'],
  ['A is married.', 'A is married'],
  ['A is the brother in law of B.', 'A is the brother-in-law of B'],
]
for (const [s, want] of phr) {
  const r = parseFamily(HEAD + s + ' A is the father of B. B is the father of C. C is the mother of D. D is the father of E. E is the mother of F.')
  const p = r.puzzle
  if (!p) {
    fail(`parse "${s}": ${r.errors.join('; ')}`)
    continue
  }
  const flat = (x: string) => x.replace(/[-\s]+/g, ' ').replace(/\.$/, '')
  const clue = p.clues.find((c) => flat(c.text) === flat(s))
  const got = clue ? clue.facts.map((f) => describeFact(f, (i) => p.names[i])).join(' ; ') : `(unread: ${r.unparsed.join(' | ')})`
  check(got === want, `parse "${s}":\n   got      ${got}\n   expected ${want}`)
}
check(isFamilyPuzzle(SAMPLES.find((x) => x.id === 'family-tree')!.text), 'the family sample should be recognised')
check(!isFamilyPuzzle('Eight persons A, B, C, D, E, F, G, H live on eight floors. A lives above B.'), 'a floor puzzle is not a family puzzle')

// ── rules about the whole family, a listed set of people, bullets
{
  const t = `There is a family of six people (\`A, B, C, D, E, F\`) spread across two generations, with two married couples and no single parents. Every couple in the first generation has at least one child.
* A is the father of C.
* B is the wife of A.
* D is the mother of E, who is the only son of F.
* There are more males than females in the family.`
  const r = parseFamily(t)
  const p = r.puzzle
  if (!p || r.unparsed.length) fail(`rules puzzle not understood: ${r.errors.join('; ')} ${r.unparsed.join(' | ')}`)
  else {
    check(p.names.join('') === 'ABCDEF', 'listed people')
    check(JSON.stringify(p.rules) === JSON.stringify({ couples: 2, noSingleParents: true, couplesHaveChildren: [1], genderBalance: 'moreM' }), `rules read: ${JSON.stringify(p.rules)}`)
    const found = solveFamily(p)
    check(found.worlds.length > 0, 'rules puzzle should have trees')
    for (const w of found.worlds) {
      const males = w.gender.filter((g) => g === 'M').length
      const couples = w.spouse.filter((x, i) => x > i).length
      check(males > w.n - males && couples === 2, 'every tree has 2 couples and more men than women')
      check(w.gen.every((g) => g === 1 || (w.father[w.gen.indexOf(g)] !== undefined)), 'generation sanity')
      for (let i = 0; i < w.n; i++) check((w.father[i] >= 0) === (w.mother[i] >= 0), 'no single parents')
    }
  }
}

// ── the 11-person puzzle: read completely; its clues contradict each other, and the reference picture breaks four statements
{
  const t = `There is a family of eleven people (\`B, C, D, F, J, K, L, M, Q, V, W\`) spread across three generations, with four married couples and no single parents. Every couple in the first two generations has at least one child.

* W is the grandfather of Q, who is the only sister of D.
* C is the sister-in-law of K, who has no siblings.
* L is the mother-in-law of M, who is the father of D.
* B is the aunt of F, who is the only son of V.
* J is the brother-in-law of V, who is married to B's brother.
* K and W are of the opposite gender, and Q is unmarried.
* There are more females than males in the family.`
  const r = parseFamily(t)
  const p = r.puzzle
  if (!p || r.unparsed.length) fail(`11-person puzzle not understood: ${r.errors.join('; ')} ${r.unparsed.join(' | ')}`)
  else {
    check(p.names.length === 11 && p.gens === 3 && p.clues.length === 6, '11-person puzzle: people, generations, clues')
    check(p.rules?.couples === 4 && p.rules.noSingleParents === true && JSON.stringify(p.rules.couplesHaveChildren) === '[1,2]' && p.rules.genderBalance === 'moreF', '11-person puzzle: rules')
    const strict = solveFamily(p, { deadlineMs: 20000 })
    check(strict.complete && strict.worlds.length === 0, '11-person puzzle: no tree fits the usual meanings')
    const wide = solveFamily(p, { relaxed: true, deadlineMs: 20000 })
    check(wide.complete && wide.worlds.length === 0, '11-person puzzle: no tree fits the wider in-law meanings either')
    // the reference picture: W=L with sons M and J; M=K; J=C; V=B with son F; Q and D children of M and K
    const I = (c: string) => p.names.indexOf(c)
    const n = p.names.length
    const w: World = { n, names: p.names, gender: Array(n).fill('M'), gen: Array(n).fill(2), spouse: Array(n).fill(-1), father: Array(n).fill(-1), mother: Array(n).fill(-1), ext: Array(n).fill(-1), relaxed: true }
    for (const c of 'LKCBQ') w.gender[I(c)] = 'F'
    for (const c of 'WL') w.gen[I(c)] = 1
    for (const c of 'QDF') w.gen[I(c)] = 3
    const marry = (a: string, b: string) => ((w.spouse[I(a)] = I(b)), (w.spouse[I(b)] = I(a)))
    marry('W', 'L'); marry('M', 'K'); marry('J', 'C'); marry('V', 'B')
    for (const c of 'MJ') ((w.father[I(c)] = I('W')), (w.mother[I(c)] = I('L')))
    for (const c of 'QD') ((w.father[I(c)] = I('M')), (w.mother[I(c)] = I('K')))
    w.father[I('F')] = I('V'); w.mother[I('F')] = I('B')
    let e = 0
    for (let i = 0; i < n; i++) if (w.father[i] < 0 && w.mother[i] < 0) w.ext[i] = e++
    const failed = p.clues.flatMap((c) => c.facts.filter((f) => !factHolds(w, f)).map((f) => describeFact(f, (i) => p.names[i])))
    check(failed.join(' | ') === 'L is the mother-in-law of M | B is the aunt of F | J is the brother-in-law of V | V is married to the brother of B', `reference picture breaks: ${failed.join(' | ')}`)
    const a = analyzeFamily(p)
    check(a.status === 'none' && a.searchedAll, '11-person puzzle analysis: contradiction')
    let last = a
    for (const x of refineAnalysis(p, a)) last = x
    check(!last.pending && last.culpritFacts.some((c) => c.fact === 'C is the sister-in-law of K'), `11-person puzzle: the clash is named (${JSON.stringify(last.culpritFacts)})`)
  }
}

// ── the example: exactly the tree of the answer picture
{
  const s = SAMPLES.find((x) => x.id === 'family-tree')!
  const r = parseFamily(s.text)
  const p = r.puzzle
  if (!p || r.unparsed.length) fail('family sample not understood')
  else {
    const found = solveFamily(p)
    check(found.worlds.length === 1 && found.complete, `family sample: expected one tree, got ${found.worlds.length}`)
    const w = found.worlds[0]
    if (w) {
      const nm = (i: number) => p.names[i]
      const show = (xs: number[]) => xs.map(nm).join('')
      check(show(w.gender.map((g, i) => (g === 'M' ? i : -1)).filter((i) => i >= 0)) === 'AHN', 'family sample: the men are A, H, N')
      check(w.spouse[p.names.indexOf('A')] === p.names.indexOf('R') && w.spouse[p.names.indexOf('N')] === p.names.indexOf('T') && w.spouse[p.names.indexOf('H')] === p.names.indexOf('G'), 'family sample: couples A=R, N=T, H=G')
      check(w.father[p.names.indexOf('P')] === p.names.indexOf('A') && w.mother[p.names.indexOf('P')] === p.names.indexOf('R'), 'family sample: P is the child of A and R')
      check(w.father[p.names.indexOf('H')] === p.names.indexOf('N') && w.mother[p.names.indexOf('H')] === p.names.indexOf('T'), 'family sample: H is the child of N and T')
      check(siblings(w, p.names.indexOf('A'), p.names.indexOf('T')), 'family sample: A and T are brother and sister')
      const a0 = analyzeFamily(p)
      let a = a0
      for (const x of refineAnalysis(p, a0)) a = x
      check(a.status === 'unique' && a.clues.length === 4 && !a.pending && a.clues.every((c) => c.without >= 0), 'family sample analysis')
      check(a.clues.every((c) => c.facts.every((f) => f.fact.length > 0)), 'family sample: every fact described')
      const L = layoutFamily(w)
      check(L.nodes.length === 7 && L.marriages.length === 3 && L.sibGroups.length === 1 && L.rows === 2, 'family sample: layout')
      const xs = (c: string) => L.nodes[p.names.indexOf(c)].x
      check(Math.abs(xs('T') - xs('A')) < Math.abs(xs('N') - xs('A')), 'family sample: the sister and brother are drawn next to each other')
    }
    // a contradiction is reported with the clues that cause it
    const bad = parseFamily(s.text + ' G is the father of H.').puzzle
    if (bad) {
      const a = analyzeFamily(bad)
      check(a.status === 'none', 'a contradictory clue should leave no tree')
    }
  }
}

// ── random families
let seed = Number(process.env.SEED ?? 12345)
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 2 ** 32
}
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]

function randomWorld(n: number, G: number): World | null {
  const gender: Gender[] = Array.from({ length: n }, () => (rnd() < 0.5 ? 'M' : 'F'))
  const gen = Array.from({ length: n }, (_, i) => (i < G ? i + 1 : 1 + Math.floor(rnd() * G)))
  const spouse = Array(n).fill(-1)
  const father = Array(n).fill(-1)
  const mother = Array(n).fill(-1)
  const ext = Array(n).fill(-1)
  const w: World = { n, names: Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i)), gender, gen, spouse, father, mother, ext }
  // marriages
  for (let k = 0; k < n; k++) {
    const i = Math.floor(rnd() * n)
    const j = Math.floor(rnd() * n)
    if (i === j || spouse[i] >= 0 || spouse[j] >= 0 || gen[i] !== gen[j] || gender[i] === gender[j] || rnd() < 0.3) continue
    spouse[i] = j
    spouse[j] = i
  }
  // parents (processed top-down so each choice sees the ones above)
  let nextExt = 0
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => gen[a] - gen[b])
  const extOf = new Map<number, number[]>()
  for (const i of order) {
    const opts: (() => void)[] = []
    if (gen[i] > 1) {
      for (let f = 0; f < n; f++) if (gen[f] === gen[i] - 1 && gender[f] === 'M' && spouse[f] >= 0) opts.push(() => ((father[i] = f), (mother[i] = spouse[f])))
      for (let x = 0; x < n; x++) if (gen[x] === gen[i] - 1 && spouse[x] < 0) opts.push(() => (gender[x] === 'M' ? (father[i] = x) : (mother[i] = x)))
    }
    if (opts.length && rnd() < 0.8) pick(opts)()
    else {
      const groups = extOf.get(gen[i]) ?? []
      ext[i] = groups.length && rnd() < 0.4 ? pick(groups) : nextExt++
      if (!groups.includes(ext[i])) extOf.set(gen[i], [...groups, ext[i]])
    }
  }
  // every generation used, spouses not blood relatives, connected
  for (let g = 1; g <= G; g++) if (!gen.includes(g)) return null
  const root = Array.from({ length: n }, (_, i) => i)
  const find = (a: number): number => (root[a] === a ? a : (root[a] = find(root[a])))
  for (let i = 0; i < n; i++) {
    if (spouse[i] >= 0) root[find(i)] = find(spouse[i])
    for (const p of [father[i], mother[i]]) if (p >= 0) root[find(i)] = find(p)
    for (let j = 0; j < n; j++) if (siblings(w, i, j)) root[find(i)] = find(j)
  }
  for (let i = 1; i < n; i++) if (find(i) !== find(0)) return null
  for (let i = 0; i < n; i++) if (spouse[i] > i && bloodRelated(w, i, spouse[i])) return null
  return w
}

const signature = (w: World): string => {
  const extMin = (i: number) => (w.father[i] < 0 && w.mother[i] < 0 ? Math.min(...Array.from({ length: w.n }, (_, j) => j).filter((j) => famKey(w, j) === famKey(w, i))) : -1)
  return JSON.stringify([w.gender, w.gen, w.spouse, w.father, w.mother, w.names.map((_, i) => extMin(i))])
}

const RELS = ['father', 'mother', 'son', 'daughter', 'brother', 'sister', 'husband', 'wife', 'uncle', 'aunt', 'nephew', 'niece', 'cousin', 'brother-in-law', 'sister-in-law', 'mother-in-law', 'father-in-law', 'son-in-law', 'daughter-in-law', 'grandfather', 'grandmother', 'grandson', 'granddaughter']
let planted = 0
let uniqueCount = 0
let capped = 0
const RUNS = Number(process.env.RUNS ?? 60)
for (let run = 0; run < RUNS * 20 && planted < RUNS; run++) {
  const n = 5 + Math.floor(rnd() * 3)
  const G = 2 + (rnd() < 0.3 ? 1 : 0)
  const w = randomWorld(n, G)
  if (!w) continue
  // true facts of this family
  const pool: Fact[] = []
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      if (x === y) continue
      for (const rel of RELS) if (holds(w, rel, x, y)) pool.push({ t: 'rel', rel, x, y })
    }
    pool.push({ t: 'gender', x, g: w.gender[x] })
  }
  if (pool.length < 6) continue
  const facts: Fact[] = []
  for (let k = 0; k < 8 + Math.floor(rnd() * 5); k++) facts.push(pick(pool))
  const puzzle: FamilyPuzzle = { names: w.names, gens: G, clues: facts.map((f, i) => ({ id: i + 1, text: describeFact(f, (j) => w.names[j]), facts: [f] })) }
  planted++
  // the planted family must satisfy every clue (checked directly) and be found by the search
  puzzle.clues.forEach((c) => check(clueHolds(w, c), `run ${run}: planted family fails its own clue "${c.text}"`))
  const found = solveFamily(puzzle, { limit: 400, nodeCap: 6_000_000 })
  if (!found.complete) {
    capped++
    continue
  }
  const sig = signature(w)
  check(found.worlds.some((x) => signature(x) === sig), `run ${run}: the planted family was not among the ${found.worlds.length} solutions\n   ${puzzle.clues.map((c) => c.text).join('; ')}`)
  for (const x of found.worlds) puzzle.clues.forEach((c) => check(clueHolds(x, c), `run ${run}: a returned family fails "${c.text}"`))
  if (found.worlds.length === 1) uniqueCount++
}
console.log(`phrasings ${phr.length}, random families ${planted} (${uniqueCount} with a unique answer, ${capped} hit the search cap), ${checks} checks`)
if (failures) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('OK')
