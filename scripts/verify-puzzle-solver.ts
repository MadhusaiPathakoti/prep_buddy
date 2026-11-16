// Verification harness for the Puzzle Solver.  Run:  npx tsx scripts/verify-puzzle-solver.ts   (RUNS=n to change the random-puzzle count)
//
//  1. Parser: a table of exam phrasings, each compared with the English reading we expect.
//  2. Engine vs brute force: random puzzles (random hidden arrangement, random TRUE clues of every type, with and without negation)
//     are solved by the engine and by plain enumeration of every arrangement; the solution counts must be identical.
//  3. Soundness of the teaching trace: no step ever crosses out a cell of a real solution, every crossing has a reason,
//     the final arrangement satisfies every clue, and every "what if it were here instead" simulation ends in a contradiction.
import { Ctx } from '../src/lib/puzzleSolver/core'
import { enumerate } from '../src/lib/puzzleSolver/engine'
import { parsePuzzle } from '../src/lib/puzzleSolver/parse'
import { SAMPLES } from '../src/lib/puzzleSolver/sample'
import { applyEvents, buildTrace, simulate } from '../src/lib/puzzleSolver/trace'
import type { Atom, Puzzle, Solution, Term } from '../src/lib/puzzleSolver/types'

const RUNS = Number(process.env.RUNS ?? 300)
let failures = 0
const fail = (msg: string) => {
  failures++
  if (failures <= 40) console.error('FAIL', msg)
}

// ─── 1. parser table ─────────────────────────────────────────────────────────

const FLOOR_HEADER = `Eight persons - A, B, C, D, E, F, G, H - live on eight different floors of a building, such that the lowermost floor is numbered 1 and the topmost floor is numbered 8.
Each of them is from a different city - Nagpur, Delhi, Bhopal, Kolkata, Pune, Jaipur, Mumbai, Patna.
`

const ROW_HEADER = `Six friends - A, B, C, D, E and F - are sitting in a row. Each of them likes a different colour - Red, Blue, Green, Yellow, Pink, Black.
`

const FLOOR_CASES: [string, string][] = [
  ['A lives on the 3rd floor.', 'A is on floor 3'],
  ['A lives on floor 5.', 'A is on floor 5'],
  ['B lives on an odd numbered floor.', 'B is on an odd-numbered floor'],
  ['B lives on an even-numbered floor.', 'B is on an even-numbered floor'],
  ['C does not live on the topmost floor.', 'C is not on the topmost floor'],
  ["C doesn't live on the lowest floor.", 'C is not on the lowest floor'],
  ['D lives on the second floor from the top.', 'D is on floor 7'],
  ['D lives on the third floor from the bottom.', 'D is on floor 3'],
  ['E lives immediately above F.', 'E is immediately above F'],
  ['E lives directly below F.', 'E is immediately below F'],
  ['E lives just above F.', 'E is immediately above F'],
  ['E lives exactly three floors above F.', 'E is exactly 3 floors above F'],
  ['G lives two floors below H.', 'G is exactly 2 floors below H'],
  ['E lives somewhere above F.', 'E is somewhere above F'],
  ['E lives above F.', 'E is somewhere above F'],
  ['E does not live immediately above F.', 'E is not immediately above F'],
  ['E and F live on adjacent floors.', 'E and F are on neighbouring floors'],
  ['E lives next to F.', 'E and F are on neighbouring floors'],
  ['Three persons live between E and F.', 'exactly 3 people between E and F'],
  ['Exactly one person lives between E and F.', 'exactly 1 person between E and F'],
  ['No one lives between E and F.', 'exactly 0 people between E and F'],
  ['There are two persons between E and F.', 'exactly 2 people between E and F'],
  ['E lives between F and G.', 'E is between F and G'],
  ['The person from Delhi lives on the topmost floor.', 'the Delhi person is on the topmost floor'],
  ['The person who is from Delhi lives immediately above A.', 'the Delhi person is immediately above A'],
  ['The one from Delhi lives immediately above A.', 'the Delhi person is immediately above A'],
  ['A lives immediately above the person from Pune.', 'A is immediately above the Pune person'],
  ['A is from Delhi.', "A's city is Delhi"],
  ['A is not from Delhi.', "A's city is not Delhi"],
  ['A comes from Delhi.', "A's city is Delhi"],
  ['A is neither from Delhi nor from Pune.', "A's city is not Delhi ; A's city is not Pune"],
  ['A, who is from Delhi, lives on the topmost floor.', "A's city is Delhi ; A is on the topmost floor"],
  ['A lives immediately below B and is from Delhi.', "A is immediately below B ; A's city is Delhi"],
  ['A lives on the topmost floor and B lives on the lowest floor.', 'A is on the topmost floor ; B is on the lowest floor'],
  ['The person from Delhi lives two floors above the person from Pune.', 'the Delhi person is exactly 2 floors above the Pune person'],
  ['F lives on either floor 2 or floor 4.', 'F is on floor 2 or 4'],
  ['G does not live on any of the odd numbered floors.', 'G is not on an odd-numbered floor'],
  ['A lives on a floor immediately above the floor of B.', 'A is immediately above B'],
  ['A lives on either the topmost or the lowest floor.', 'A is on either the topmost or the lowest floor'],
  ['A lives on a higher floor than B.', 'A is somewhere above B'],
  ['A lives on a lower floor than B.', 'A is somewhere below B'],
  ['A lives immediately above B.', 'A is immediately above B'],
]

const ROW_CASES: [string, string][] = [
  ['A sits at the extreme left end.', 'A is at the leftmost seat'],
  ['F sits at the right end.', 'F is at the rightmost seat'],
  ['C does not sit at either end.', 'C is not at either the leftmost or the rightmost seat'],
  ['B sits immediately to the right of A.', 'B is immediately to the right of A'],
  ['B sits to the immediate left of C.', 'B is immediately to the left of C'],
  ['D sits second from the left end.', 'D is at seat 2'],
  ['E sits to the left of F.', 'E is somewhere to the left of F'],
  ['The one who likes Red sits two places to the right of B.', 'the Red person is exactly 2 seats to the right of B'],
  ['D likes Green.', "D's colour is Green"],
  ['Two persons sit between A and F.', 'exactly 2 people between A and F'],
  ['A and B are neighbours.', 'A and B are on neighbouring seats'],
  ['E sits between the one who likes Red and the one who likes Blue.', 'E is between the Red person and the Blue person'],
]

function runParserTable(header: string, cases: [string, string][]) {
  for (const [sentence, expected] of cases) {
    const r = parsePuzzle(`${header}\n${sentence}`)
    if (!r.puzzle) {
      fail(`parse "${sentence}": no puzzle (${r.errors.join('; ')})`)
      continue
    }
    if (r.unparsed.length) {
      fail(`parse "${sentence}": not understood`)
      continue
    }
    const ctx = new Ctx(r.puzzle)
    const got = r.puzzle.clues[0].atoms.map((a) => ctx.describeAtom(a)).join(' ; ')
    if (got !== expected) fail(`parse "${sentence}":\n      got      ${got}\n      expected ${expected}`)
  }
}
runParserTable(FLOOR_HEADER, FLOOR_CASES)
runParserTable(ROW_HEADER, ROW_CASES)

// numbering from the top
{
  const r = parsePuzzle(`Five persons - A, B, C, D, E - live on five different floors of a building, numbered from the top, so that the topmost floor is numbered 1.\nA lives on floor 1.\nB lives immediately below A.`)
  const ctx = r.puzzle ? new Ctx(r.puzzle) : null
  const set = r.puzzle?.clues[0].atoms[0]
  if (!r.puzzle || !r.puzzle.topDown || set?.t !== 'set' || set.fs[0] !== 4) fail('top-down numbering: floor 1 should be the topmost (index 4)')
  else if (ctx && ctx.describeAtom(r.puzzle.clues[1].atoms[0]) !== 'B is immediately below A') fail('top-down numbering: relative clue misread')
}

// the two built-in samples must be understood completely and have exactly one solution
for (const s of SAMPLES) {
  const r = parsePuzzle(s.text)
  if (!r.puzzle || r.unparsed.length || r.errors.length) fail(`sample "${s.title}" did not parse cleanly`)
  else {
    const e = enumerate(r.puzzle, 5)
    if (e.sols.length !== 1) fail(`sample "${s.title}" has ${e.sols.length} solutions`)
  }
}

// mistakes in the input are reported, not guessed at
for (const [label, text, needle] of [
  ['no people', 'Hello there. A lives above B.', 'list of people'],
  ['value count', 'Four persons - A, B, C, D - sit in a row. Each of them likes a different colour - Red, Blue, Green.\nA sits at the left end.', 'values'],
  ['floor count', 'Four persons - A, B, C, D - live on six different floors of a building.\nA lives on the topmost floor.', 'not supported'],
] as const) {
  const r = parsePuzzle(text)
  if (r.puzzle || !r.errors.some((e) => e.includes(needle))) fail(`error case "${label}" not reported (${JSON.stringify(r.errors)})`)
}

// ─── 2/3. random puzzles ─────────────────────────────────────────────────────

let seed = 12345
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const ri = (n: number) => Math.floor(rnd() * n)
const shuffle = <T>(a: T[]): T[] => {
  const x = [...a]
  for (let i = x.length - 1; i > 0; i--) {
    const j = ri(i + 1)
    ;[x[i], x[j]] = [x[j], x[i]]
  }
  return x
}

/** Plain-meaning evaluation of a clue atom against a complete arrangement (shares no code with the engine). */
function holds(p: Puzzle, sol: Solution, a: Atom): boolean {
  const personOf = (t: Term): number => (t.k === 'p' ? t.i : t.k === 'v' ? sol.val[t.c].indexOf(t.i) : sol.pos.indexOf(t.f))
  const at = (t: Term): number => (t.k === 'f' ? t.f : sol.pos[personOf(t)])
  let r: boolean
  switch (a.t) {
    case 'link':
      r = personOf(a.x) === personOf(a.y)
      return a.neg ? !r : r
    case 'diff':
      r = at(a.x) - at(a.y) === a.d
      break
    case 'rank':
      r = a.hi ? at(a.x) > at(a.y) : at(a.x) < at(a.y)
      break
    case 'adj':
      r = Math.abs(at(a.x) - at(a.y)) === 1
      break
    case 'gap': {
      const lo = Math.min(at(a.x), at(a.y))
      const hi = Math.max(at(a.x), at(a.y))
      r = lo !== hi && sol.pos.filter((q) => q > lo && q < hi).length === a.k
      break
    }
    case 'btw':
      r = Math.min(at(a.y), at(a.z)) < at(a.x) && at(a.x) < Math.max(at(a.y), at(a.z))
      break
    case 'set':
      r = a.fs.includes(at(a.x))
      break
  }
  return a.neg ? !r : r
}

function permutations(n: number): number[][] {
  const out: number[][] = []
  const rec = (cur: number[], rest: number[]) => {
    if (!rest.length) out.push(cur)
    for (let i = 0; i < rest.length; i++) rec([...cur, rest[i]], [...rest.slice(0, i), ...rest.slice(i + 1)])
  }
  rec([], Array.from({ length: n }, (_, i) => i))
  return out
}

/** Highest extra-category index (+1) an atom needs, 0 when it only involves people and positions. */
function needLevel(a: Atom): number {
  const ts: Term[] = a.t === 'btw' ? [a.x, a.y, a.z] : a.t === 'set' ? [a.x] : [a.x, a.y]
  return Math.max(0, ...ts.map((t) => (t.k === 'v' ? t.c + 1 : 0)))
}

function bruteCount(p: Puzzle, cap: number): number {
  const perms = permutations(p.n)
  const byLevel: Atom[][] = Array.from({ length: p.cats.length + 1 }, () => [])
  for (const cl of p.clues) for (const a of cl.atoms) byLevel[needLevel(a)].push(a)
  let count = 0
  const rec = (level: number, vals: number[][], pos: number[]) => {
    if (count >= cap) return
    const sol: Solution = { pos, val: vals }
    if (!byLevel[level].every((a) => holds(p, sol, a))) return
    if (level === p.cats.length) {
      count++
      return
    }
    for (const perm of perms) rec(level + 1, [...vals, perm], pos)
  }
  for (const pos of perms) rec(0, [], pos)
  return count
}

function randomTerm(p: Puzzle, allowFloat: boolean): Term {
  if (allowFloat && p.cats.length && rnd() < 0.35) return { k: 'v', c: ri(p.cats.length), i: ri(p.n) }
  return { k: 'p', i: ri(p.n) }
}

function randomAtom(p: Puzzle, hidden: Solution): Atom {
  for (;;) {
    const x = randomTerm(p, true)
    let y = randomTerm(p, true)
    let z = randomTerm(p, true)
    const personOf = (t: Term): number => (t.k === 'p' ? t.i : hidden.val[t.c].indexOf(t.i))
    let guard = 0
    while (personOf(y) === personOf(x) && guard++ < 20) y = randomTerm(p, true)
    guard = 0
    while ((personOf(z) === personOf(x) || personOf(z) === personOf(y)) && guard++ < 20) z = randomTerm(p, true)
    const kind = ri(8)
    let atom: Atom
    if (kind === 0) atom = { t: 'diff', x, y, d: (ri(2) ? 1 : -1) * (1 + ri(3)) }
    else if (kind === 1) atom = { t: 'rank', x, y, hi: rnd() < 0.5 }
    else if (kind === 2) atom = { t: 'adj', x, y }
    else if (kind === 3) atom = { t: 'gap', x, y, k: ri(4) }
    else if (kind === 4) atom = { t: 'btw', x, y, z }
    else if (kind === 5) atom = { t: 'set', x, fs: shuffle(Array.from({ length: p.n }, (_, i) => i)).slice(0, 1 + ri(3)).sort((a, b) => a - b) }
    else if (kind === 6 && p.cats.length) {
      const c = ri(p.cats.length)
      atom = { t: 'link', x: { k: 'p', i: ri(p.n) }, y: { k: 'v', c, i: ri(p.n) } }
    } else atom = { t: 'diff', x, y, d: ri(2) ? 1 : -1 }
    const truth = holds(p, hidden, atom)
    // make it true: negate a false clue (only sensible for some kinds, so keep it for rarely-negated kinds too)
    if (!truth) atom = { ...atom, neg: true } as Atom
    if (!holds(p, hidden, atom)) continue
    if (atom.t === 'link' && atom.neg && rnd() < 0.5) continue
    return atom
  }
}

function randomPuzzle(n: number, nCats: number, nClues: number): { puzzle: Puzzle; hidden: Solution } {
  const people = 'ABCDEFGHIJ'.slice(0, n).split('')
  const cats = Array.from({ length: nCats }, (_, c) => ({ name: `cat${c}`, values: Array.from({ length: n }, (_, i) => `v${c}${i}`) }))
  const hidden: Solution = { pos: shuffle(Array.from({ length: n }, (_, i) => i)), val: cats.map(() => shuffle(Array.from({ length: n }, (_, i) => i))) }
  const puzzle: Puzzle = { n, axis: 'floor', topDown: false, people, cats, clues: [] }
  for (let k = 0; k < nClues; k++) puzzle.clues.push({ id: k + 1, text: `random clue ${k + 1}`, atoms: [randomAtom(puzzle, hidden)] })
  return { puzzle, hidden }
}

let compared = 0
const kinds: Record<string, number> = {}
let trials = 0
let uniqueTraced = 0
let multiple = 0
let whatIfs = 0
let eliminations = 0
for (let run = 0; run < RUNS; run++) {
  const n = 4 + (run % 3) // 4..6
  const nCats = n === 6 ? 1 : run % 3 === 0 ? 0 : 1 + (run % 2)
  const nClues = run % 5 === 0 ? 3 + ri(n) : 3 * n + ri(2 * n)
  const { puzzle, hidden } = randomPuzzle(n, nCats, nClues)
  const where = `run ${run} (n=${n}, cats=${nCats}, clues=${nClues})`

  const limit = 40
  const res = enumerate(puzzle, limit)
  const brute = bruteCount(puzzle, limit)
  compared++
  if (!res.complete || res.sols.length !== brute) fail(`${where}: engine found ${res.sols.length} solutions, brute force ${brute}`)
  const complete = res.sols.length < limit
  const hiddenFound = res.sols.some((s) => s.pos.every((v, i) => v === hidden.pos[i]) && s.val.every((row, c) => row.every((v, i) => v === hidden.val[c][i])))
  if (complete && !hiddenFound) {
    fail(`${where}: hidden arrangement missing from the engine's solutions`)
    // pinpoint the clue: the first prefix of clues after which the hidden arrangement is no longer found
    for (let k = 1; k <= puzzle.clues.length; k++) {
      const sub: Puzzle = { ...puzzle, clues: puzzle.clues.slice(0, k) }
      const r = enumerate(sub, 100000)
      const kept = r.sols.some((s) => s.pos.every((v, i) => v === hidden.pos[i]) && s.val.every((row, c) => row.every((v, i) => v === hidden.val[c][i])))
      if (!kept) {
        console.error('   culprit clue', k, JSON.stringify(puzzle.clues[k - 1].atoms), 'hidden pos', JSON.stringify(hidden.pos), 'val', JSON.stringify(hidden.val))
        break
      }
    }
  }

  // the teaching trace
  const trace = buildTrace(puzzle)
  const expectStatus = brute === 0 ? 'none' : brute === 1 ? 'unique' : 'multiple'
  if (trace.status !== expectStatus) fail(`${where}: trace status ${trace.status}, expected ${expectStatus}`)
  if (trace.status === 'multiple') multiple++
  for (const st of trace.steps) kinds[st.kind] = (kinds[st.kind] ?? 0) + 1
  for (const st of trace.steps) trials += st.trials.length
  const ctx = new Ctx(puzzle)

  // soundness: nothing a real solution uses is ever crossed out
  for (const [key, info] of trace.elim) {
    eliminations++
    const [a, i, b, j] = key.split('.').map(Number)
    if (!info.why.text) fail(`${where}: crossing ${key} has no reason`)
    for (const sol of res.sols) {
      const itemOf = (cat: number, idx: number) => (cat === 0 ? idx : cat === 1 ? sol.pos[idx] : null)
      // (a,i)-(b,j) belongs to the solution when they denote the same person-slot
      const personWith = (cat: number, idx: number): number => (cat === 0 ? idx : cat === 1 ? sol.pos.indexOf(idx) : sol.val[cat - 2].indexOf(idx))
      void itemOf
      if (personWith(a, i) === personWith(b, j)) fail(`${where}: step ${info.step + 1} crossed out ${ctx.pair(a, i, b, j)}, which holds in a real solution (${info.why.text})`)
    }
  }
  // the animated board is driven by replaying events, so a step's events must reproduce its saved result exactly
  for (const s of trace.steps) {
    for (let k = 0; k < s.pre.length; k++) if ((s.post[k] & ~s.pre[k]) !== 0) fail(`${where}: step ${s.idx + 1} added candidates back`)
    const replayed = applyEvents(s.pre, ctx, s.beats.flatMap((b) => b.evs))
    if (replayed.m.some((v, k) => v !== s.post[k])) fail(`${where}: step ${s.idx + 1} events do not reproduce its end state`)
  }
  if (trace.status === 'unique') {
    uniqueTraced++
    const f = trace.final
    if (!f || !f.pos.every((v, i) => v === res.sols[0].pos[i]) || !f.val.every((row, c) => row.every((v, i) => v === res.sols[0].val[c][i]))) fail(`${where}: trace final arrangement differs from the unique solution`)
    // every crossed-out pairing, replayed as a supposition, must end in a contradiction
    let tested = 0
    for (const key of trace.elim.keys()) {
      if (tested >= 40) break
      const [a, i, b, j] = key.split('.').map(Number)
      const sim = simulate(trace, { a, i, b, j })
      tested++
      whatIfs++
      if (!sim) fail(`${where}: no simulation for ${key}`)
      else if (!sim.proven) fail(`${where}: what-if "${ctx.pair(a, i, b, j)}" at step ${sim.stepIdx + 1} did not end in a contradiction: ${sim.clash}`)
      else if (!sim.beats.length || sim.beats[sim.beats.length - 1].tone !== 'clash') fail(`${where}: what-if "${ctx.pair(a, i, b, j)}" has no closing contradiction beat`)
    }
  }
}

// the built-in samples go through the same trace checks
for (const s of SAMPLES) {
  const r = parsePuzzle(s.text)
  if (!r.puzzle) continue
  const trace = buildTrace(r.puzzle)
  if (trace.status !== 'unique' || !trace.final) fail(`sample "${s.title}": trace did not end with a unique solution`)
  for (const st of trace.steps) {
    const replayed = applyEvents(st.pre, trace.ctx, st.beats.flatMap((b) => b.evs))
    if (replayed.m.some((v, k) => v !== st.post[k])) fail(`sample "${s.title}": step ${st.idx + 1} events do not reproduce its end state`)
  }
  for (const key of trace.elim.keys()) {
    const [a, i, b, j] = key.split('.').map(Number)
    const sim = simulate(trace, { a, i, b, j })
    whatIfs++
    if (!sim?.proven) fail(`sample "${s.title}": what-if ${key} not refuted (${sim?.clash})`)
  }
}

console.log(`parser: ${FLOOR_CASES.length + ROW_CASES.length} phrasings checked`)
console.log(`engine vs brute force: ${compared} random puzzles (${uniqueTraced} with a unique answer traced, ${multiple} with several answers)`)
console.log(`step kinds: ${JSON.stringify(kinds)}; ${trials} case-analysis trials`)
console.log(`teaching trace: ${eliminations} crossings checked for soundness, ${whatIfs} what-if simulations refuted`)
if (failures) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('OK')
