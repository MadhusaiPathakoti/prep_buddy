import type { MCQQuestion } from './generators'
import { createRng, randomSeed, type Rng } from './mocks/rng'
import { RELATIONS, holds, siblings, type Gender, type World } from './familyTree/model'
import { parseFamily } from './familyTree/parse'
import { countOf, factHolds, solveFamily, type CountKind, type Fact, type FamilyPuzzle, type FamilyRules } from './familyTree/solve'
import { treeInWords } from './familyTree/describe'

/**
 * Family Tree game (SBI / IBPS "blood relation" puzzles): a short passage about a family — "There is a family of seven people spread
 * across two generations. N is the brother-in-law of A, who has only one daughter. …" — and a question about it.
 *
 * How a question is made, so that it always has exactly one answer:
 *  1. a random family is planted (people, generations, couples, children, in-laws whose parents are outside the family);
 *  2. true statements about it are written in the wording the Puzzle Solver understands, and added one by one until the solver
 *     finds that exactly one family fits them, then any statement that turned out to be unnecessary is dropped;
 *  3. the finished text is read back by the real parser and solved again — it must give exactly the planted family;
 *  4. the question is about that family, and every wrong option is false in it.
 * The passage can be pasted into (or handed to) the Puzzle Solver, which draws the tree.
 * `scripts/verify-family-game.ts` re-derives every answer from the passage and question text.
 */

export type FamilyDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'
export type FamilyQType = 'mixed' | 'relation' | 'who' | 'count' | 'true'
type Level = 'easy' | 'medium' | 'hard'
type Kind = 'relation' | 'who' | 'count' | 'true'

// ---------- levels ----------

const EASY_RELS = ['father', 'mother', 'son', 'daughter', 'brother', 'sister', 'husband', 'wife', 'grandfather', 'grandmother', 'grandson', 'granddaughter', 'uncle', 'aunt', 'nephew', 'niece']
const IN_LAWS = ['brother-in-law', 'sister-in-law', 'father-in-law', 'mother-in-law', 'son-in-law', 'daughter-in-law']
const BASIC_RELS = [...EASY_RELS, 'cousin', ...IN_LAWS]
const GENERIC_RELS = ['parent', 'child', 'sibling', 'spouse', 'grandparent', 'grandchild']
const SIDE_RELS = ['paternal uncle', 'maternal uncle', 'paternal aunt', 'maternal aunt', 'paternal grandfather', 'maternal grandfather', 'paternal grandmother', 'maternal grandmother']

interface LevelSpec {
  /** [people, generations] choices */
  shapes: [number, number][]
  maxClues: number
  /** relation words used in the statements */
  clueRels: string[]
  /** relation words a question may ask about */
  askRels: string[]
  /** chance that an unmarried person of an older generation has children (a single parent) */
  single: number
  /** chance of each statement about the whole family ("three married couples") */
  rules: number
  /** chance that a statement carries a "who …" remark about one of its people */
  decorate: number
  weights: Record<Kind, number>
  /** chance that a "which is true" question is turned into "which is NOT true" */
  negate: number
}

const LEVELS: Record<Level, LevelSpec> = {
  easy: {
    shapes: [[6, 2]],
    maxClues: 8,
    clueRels: EASY_RELS,
    askRels: EASY_RELS,
    single: 0,
    rules: 0.35,
    decorate: 0.35,
    weights: { relation: 4, who: 3, count: 2, true: 1.5 },
    negate: 0,
  },
  medium: {
    shapes: [
      [7, 2],
      [7, 2],
      [8, 2],
    ],
    maxClues: 9,
    clueRels: [...BASIC_RELS, 'parent', 'child', 'sibling'],
    askRels: BASIC_RELS,
    single: 0.2,
    rules: 0.4,
    decorate: 0.5,
    weights: { relation: 3, who: 2.5, count: 2, true: 2.5 },
    negate: 0.2,
  },
  hard: {
    shapes: [
      [8, 3],
      [9, 3],
      [9, 3],
    ],
    maxClues: 11,
    clueRels: [...BASIC_RELS, ...GENERIC_RELS, ...SIDE_RELS],
    askRels: BASIC_RELS,
    single: 0.3,
    rules: 0.5,
    decorate: 0.65,
    weights: { relation: 2.5, who: 2, count: 2.5, true: 3 },
    negate: 0.35,
  },
}

const LEVEL_LABEL: Record<Level, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }

// ---------- small helpers ----------

const NUM_WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'fifth']
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I and O: they read like the digits 1 and 0

/** the word for a relation, as written in the options ("Brother-in-law") */
export const relLabel = (rel: string): string => rel.charAt(0).toUpperCase() + rel.slice(1)

const PLURAL: Record<string, string> = {
  son: 'sons',
  daughter: 'daughters',
  child: 'children',
  brother: 'brothers',
  sister: 'sisters',
  nephew: 'nephews',
  niece: 'nieces',
  cousin: 'cousins',
  uncle: 'uncles',
  aunt: 'aunts',
  grandchild: 'grandchildren',
  grandson: 'grandsons',
  granddaughter: 'granddaughters',
  'brother-in-law': 'brothers-in-law',
  'sister-in-law': 'sisters-in-law',
  'son-in-law': 'sons-in-law',
  'daughter-in-law': 'daughters-in-law',
}
export const PLURAL_TO_REL: Record<string, string> = Object.fromEntries(Object.entries(PLURAL).map(([k, v]) => [v, k]))

const COUNT_KINDS: Record<Level, string[]> = {
  easy: ['son', 'daughter', 'child', 'brother', 'sister'],
  medium: ['son', 'daughter', 'child', 'brother', 'sister', 'nephew', 'niece', 'uncle', 'aunt', 'grandchild', 'cousin'],
  hard: ['son', 'daughter', 'child', 'brother', 'sister', 'nephew', 'niece', 'uncle', 'aunt', 'grandchild', 'grandson', 'granddaughter', 'cousin', 'brother-in-law', 'sister-in-law', 'son-in-law', 'daughter-in-law'],
}

const sentence = (s: string) => `${s}.`
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ---------- planting a family ----------

/**
 * A random family of exactly n people in G generations: a married couple or a group of brothers and sisters at the top,
 * children for the couples (or for an unmarried parent), and in-laws — people whose parents are outside the family — who marry in.
 * Returns null when this draw does not fit the size, so the caller draws again.
 */
function plantFamily(rng: Rng, n: number, G: number, single: number): World | null {
  const gender: Gender[] = []
  const gen: number[] = []
  const spouse: number[] = []
  const father: number[] = []
  const mother: number[] = []
  const ext: number[] = []
  let extNext = 0
  const full = () => gender.length >= n
  const flip = (g: Gender): Gender => (g === 'M' ? 'F' : 'M')
  const add = (g: Gender, gn: number, e: number, f = -1, m = -1): number => {
    gender.push(g)
    gen.push(gn)
    spouse.push(-1)
    father.push(f)
    mother.push(m)
    ext.push(e)
    return gender.length - 1
  }
  const marryIn = (a: number) => {
    const b = add(flip(gender[a]), gen[a], extNext++)
    spouse[a] = b
    spouse[b] = a
  }
  const randGender = (): Gender => (rng.chance(0.5) ? 'M' : 'F')

  if (rng.chance(0.4)) {
    marryIn(add(randGender(), 1, extNext++))
  } else {
    const k = rng.int(2, 3)
    const group = extNext++
    for (let i = 0; i < k; i++) add(randGender(), 1, group)
    for (let i = 0; i < k; i++) if (!full() && rng.chance(0.75)) marryIn(i)
  }

  for (let g = 1; g < G; g++) {
    const units: { f: number; m: number }[] = []
    for (let i = 0; i < gender.length; i++) {
      if (gen[i] !== g) continue
      if (spouse[i] >= 0) {
        if (gender[i] === 'M') units.push({ f: i, m: spouse[i] })
      } else if (rng.chance(single)) units.push(gender[i] === 'M' ? { f: i, m: -1 } : { f: -1, m: i })
    }
    for (const u of rng.shuffle(units)) {
      const r = rng.next()
      const kids = r < 0.12 ? 0 : r < 0.5 ? 1 : r < 0.82 ? 2 : 3
      for (let c = 0; c < kids && !full(); c++) add(randGender(), g + 1, -1, u.f, u.m)
    }
    for (let i = 0; i < gender.length; i++) if (gen[i] === g + 1 && ext[i] < 0 && spouse[i] < 0 && !full() && rng.chance(0.6)) marryIn(i)
  }

  if (gender.length !== n) return null
  for (let g = 1; g <= G; g++) if (!gen.includes(g)) return null
  return { n, names: Array(n).fill(''), gender, gen, spouse, father, mother, ext }
}

/** give the people random capital letters and put them in alphabetical order (the order the parser gives them) */
function nameFamily(rng: Rng, w: World): World {
  const letters = rng.sample(LETTERS.split(''), w.n)
  const order = Array.from({ length: w.n }, (_, i) => i).sort((a, b) => (letters[a] < letters[b] ? -1 : 1))
  const pos = new Map(order.map((old, k) => [old, k]))
  const to = (i: number) => (i < 0 ? -1 : (pos.get(i) as number))
  return {
    n: w.n,
    names: order.map((o) => letters[o]),
    gender: order.map((o) => w.gender[o]),
    gen: order.map((o) => w.gen[o]),
    spouse: order.map((o) => to(w.spouse[o])),
    father: order.map((o) => to(w.father[o])),
    mother: order.map((o) => to(w.mother[o])),
    ext: order.map((o) => w.ext[o]),
  }
}

function sameFamily(a: World, b: World): boolean {
  if (a.n !== b.n) return false
  for (let i = 0; i < a.n; i++) {
    if (a.names[i] !== b.names[i] || a.gender[i] !== b.gender[i] || a.gen[i] !== b.gen[i] || a.spouse[i] !== b.spouse[i] || a.father[i] !== b.father[i] || a.mother[i] !== b.mother[i]) return false
    for (let j = 0; j < a.n; j++) if (siblings(a, i, j) !== siblings(b, i, j)) return false
  }
  return true
}

// ---------- statements ----------

interface Cand {
  text: string
  facts: Fact[]
  people: number[]
}

function remap(f: Fact, m: number[]): Fact {
  switch (f.t) {
    case 'rel':
    case 'opposite':
    case 'marriedTo':
      return { ...f, x: m[f.x], y: m[f.y] }
    default:
      return { ...f, x: m[f.x] }
  }
}

/** read one statement with the real parser; keep it only if it is understood and true in the planted family */
function readCandidate(text: string, w: World): Cand | null {
  const r = parseFamily(text)
  const p = r.puzzle
  if (!p || r.errors.length || r.unparsed.length || p.clues.length !== 1) return null
  const map = p.names.map((l) => w.names.indexOf(l))
  if (map.some((m) => m < 0)) return null
  const facts = p.clues[0].facts.map((f) => remap(f, map))
  if (!facts.every((f) => factHolds(w, f))) return null
  return { text, facts, people: [...new Set(map)] }
}

const COUNT_OF: CountKind[] = ['son', 'daughter', 'child', 'brother', 'sister', 'sibling']
const KIND_PLURAL: Record<string, string> = { son: 'sons', daughter: 'daughters', child: 'children', brother: 'brothers', sister: 'sisters', sibling: 'siblings' }
const MARRIED_RELS = ['brother', 'sister', 'father', 'mother', 'son', 'daughter', 'uncle', 'aunt', 'nephew', 'niece']

/** what can be said, in the parser's wording, about one person ("has only one daughter", "is unmarried" …) */
function remarks(w: World, p: number, withGender: boolean, tail: boolean, others: number[]): string[] {
  const nm = (i: number) => w.names[i]
  const out: string[] = []
  for (const kind of COUNT_OF) {
    const c = countOf(w, p, kind)
    if (c === 1) out.push(`has only one ${kind}`)
    else if (c === 0) out.push(kind === 'sibling' ? 'does not have any siblings' : `has no ${KIND_PLURAL[kind]}`)
    else if (c <= 4) out.push(`has ${NUM_WORD[c]} ${KIND_PLURAL[kind]}`)
  }
  if (withGender) out.push(w.gender[p] === 'M' ? 'is a male' : 'is a female')
  const s = w.spouse[p]
  if (s < 0) out.push('is unmarried')
  else {
    out.push(`is married to ${nm(s)}`)
    for (const q of others) {
      if (q === s || q === p) continue
      for (const rel of MARRIED_RELS) if (holds(w, rel, s, q)) out.push(`is married to ${nm(q)}'s ${rel}`)
    }
  }
  // "is the REL of Z" is understood after the second person only
  if (tail) for (const q of others) if (q !== p) for (const rel of ['father', 'mother', 'brother', 'sister', 'son', 'daughter', 'uncle', 'aunt', 'nephew', 'niece']) if (holds(w, rel, p, q)) out.push(`is the ${rel} of ${nm(q)}`)
  return out
}

function candidatePool(rng: Rng, w: World, spec: LevelSpec): Cand[] {
  const nm = (i: number) => w.names[i]
  const texts = new Set<string>()
  const all = Array.from({ length: w.n }, (_, i) => i)
  const bases: { x: number; y: number; rel: string }[] = []
  for (const x of all) for (const y of all) if (x !== y) for (const rel of spec.clueRels) if (holds(w, rel, x, y)) bases.push({ x, y, rel })
  for (const b of rng.sample(bases, 70)) {
    const X = nm(b.x)
    const Y = nm(b.y)
    texts.add(sentence(`${X} is the ${b.rel} of ${Y}`))
    if (['son', 'daughter', 'brother', 'sister', 'child'].includes(b.rel) && countOf(w, b.y, b.rel as CountKind) === 1) texts.add(sentence(`${X} is the only ${b.rel} of ${Y}`))
    if (rng.chance(spec.decorate)) {
      const before = remarks(w, b.x, !RELATIONS[b.rel].gender, false, all).filter((r) => !r.startsWith('is married to') || rng.chance(0.5))
      if (before.length) texts.add(sentence(`${X}, who ${rng.pick(before)}, is the ${b.rel} of ${Y}`))
    }
    if (rng.chance(spec.decorate)) {
      const after = remarks(w, b.y, true, true, all)
      if (after.length) texts.add(sentence(`${X} is the ${b.rel} of ${Y}, who ${rng.pick(after)}`))
    }
    if (rng.chance(0.25)) {
      const more = bases.filter((o) => o.x === b.x && o.y !== b.y)
      if (more.length) {
        const o = rng.pick(more)
        texts.add(sentence(`${X} is the ${b.rel} of ${Y} ${rng.chance(0.25) ? 'but' : 'and'} the ${o.rel} of ${nm(o.y)}`))
      }
    }
  }
  for (const x of all) {
    const y = w.spouse[x]
    if (y > x) texts.add(sentence(`${nm(x)} and ${nm(y)} are married`))
    for (const z of all) {
      if (z <= x) continue
      if (siblings(w, x, z)) {
        texts.add(sentence(`${nm(x)} and ${nm(z)} are ${w.gender[x] === w.gender[z] ? (w.gender[x] === 'M' ? 'brothers' : 'sisters') : 'siblings'}`))
      }
      if (rng.chance(0.15)) texts.add(sentence(`${nm(x)} and ${nm(z)} are of the ${w.gender[x] === w.gender[z] ? 'same' : 'opposite'} gender`))
      for (const p of all) if (p !== x && p !== z && (w.father[x] === p || w.mother[x] === p) && (w.father[z] === p || w.mother[z] === p)) texts.add(sentence(`${nm(x)} and ${nm(z)} are the children of ${nm(p)}`))
    }
  }
  const out: Cand[] = []
  for (const t of texts) {
    const c = readCandidate(t, w)
    if (c) out.push(c)
  }
  return out
}

/** statements about the whole family that are true here */
function ruleStatements(rng: Rng, w: World, spec: LevelSpec): { texts: string[]; rules: FamilyRules } {
  const texts: string[] = []
  const rules: FamilyRules = {}
  const couples = w.spouse.filter((s, i) => s > i).length
  if (couples >= 1 && rng.chance(spec.rules)) {
    rules.couples = couples
    texts.push(couples === 1 ? 'There is one married couple in the family.' : `There are ${NUM_WORD[couples]} married couples in the family.`)
  }
  if (rng.chance(spec.rules) && w.father.every((f, i) => (f >= 0) === (w.mother[i] >= 0))) {
    rules.noSingleParents = true
    texts.push('There are no single parents in the family.')
  }
  const women = w.gender.filter((g) => g === 'F').length
  if (women !== w.n - women && rng.chance(spec.rules * 0.6)) {
    rules.genderBalance = women > w.n - women ? 'moreF' : 'moreM'
    texts.push(women > w.n - women ? 'There are more women than men in the family.' : 'There are more men than women in the family.')
  }
  return { texts, rules }
}

// ---------- making the statements pin the family down ----------

type Uniq = 'unique' | 'many' | 'unknown' | 'bad'

function uniqueness(w: World, G: number, clues: Cand[], rules: FamilyRules, nodeCap: number, deadlineMs: number): Uniq {
  const p: FamilyPuzzle = { names: w.names, gens: G, clues: clues.map((c, i) => ({ id: i + 1, text: c.text, facts: c.facts })), ...(Object.keys(rules).length ? { rules } : {}) }
  const r = solveFamily(p, { limit: 2, nodeCap, deadlineMs })
  if (r.worlds.length >= 2) return 'many'
  if (!r.complete) return 'unknown'
  return r.worlds.length === 1 ? 'unique' : 'bad'
}

/**
 * Add true statements until exactly one family fits. Each round the solver shows other families that still fit; the next statement
 * is one that is true in the planted family but false in as many of those as possible, so every statement removes something.
 */
function pickClues(rng: Rng, w: World, G: number, pool: Cand[], rules: FamilyRules, spec: LevelSpec): Cand[] | null {
  const covered = new Set<number>()
  const chosen: Cand[] = []
  const rest = [...pool]
  const holdsIn = (u: World, c: Cand) => c.facts.every((f) => factHolds(u, f))
  while (chosen.length < spec.maxClues && rest.length) {
    const p: FamilyPuzzle = { names: w.names, gens: G, clues: chosen.map((c, i) => ({ id: i + 1, text: c.text, facts: c.facts })), ...(Object.keys(rules).length ? { rules } : {}) }
    const r = solveFamily(p, { limit: 6, nodeCap: 40_000, deadlineMs: 25 })
    let others = r.worlds.filter((u) => !sameFamily(u, w))
    if (r.complete && !others.length) {
      if (r.worlds.length !== 1) return null
      if (covered.size === w.n) return chosen
    }
    // one round may add several statements: keep choosing until every family shown is ruled out
    let added = 0
    do {
      let best = -1
      let bestScore = -1
      for (let k = 0; k < rest.length; k++) {
        const c = rest[k]
        const kills = others.filter((u) => !holdsIn(u, c)).length
        if (added > 0 && !kills) continue
        const touches = covered.size === 0 || c.people.some((q) => covered.has(q))
        const fresh = c.people.filter((q) => !covered.has(q)).length
        const score = kills * 10 + (touches ? 4 : 0) + fresh + rng.next() * 3
        if (score > bestScore) {
          bestScore = score
          best = k
        }
      }
      if (best < 0) break
      const [c] = rest.splice(best, 1)
      chosen.push(c)
      added++
      c.people.forEach((q) => covered.add(q))
      others = others.filter((u) => holdsIn(u, c))
    } while (others.length > 0 && chosen.length < spec.maxClues && rest.length)
  }
  return null
}

function prune(rng: Rng, w: World, G: number, chosen: Cand[], rules: FamilyRules): Cand[] {
  let cur = chosen
  for (const c of rng.shuffle(chosen)) {
    const next = cur.filter((x) => x !== c)
    if (next.length < 2 || new Set(next.flatMap((x) => x.people)).size < w.n) continue
    if (uniqueness(w, G, next, rules, 120_000, 60) === 'unique') cur = next
  }
  return cur
}

/** connected reading order: each statement shares a person with one before it, when possible */
function readingOrder(rng: Rng, clues: Cand[]): Cand[] {
  const rest = rng.shuffle(clues)
  const out: Cand[] = [rest.shift() as Cand]
  const seen = new Set(out[0].people)
  while (rest.length) {
    let k = rest.findIndex((c) => c.people.some((p) => seen.has(p)))
    if (k < 0) k = 0
    const [c] = rest.splice(k, 1)
    out.push(c)
    c.people.forEach((p) => seen.add(p))
  }
  return out
}

// ---------- the puzzle ----------

interface Puzzle {
  text: string
  world: World
  /** relation facts the statements give directly: "x>y" for every pair that is named in one */
  stated: Set<string>
  level: Level
}

/** how draws ended, for the verification script and for tuning */
export const genStats = { draws: 0, noClues: 0, notRead: 0, notUnique: 0, ok: 0, pick: 0, prune: 0, final: 0 }

function makePuzzle(rng: Rng, level: Level): Puzzle | null {
  genStats.draws++
  const spec = LEVELS[level]
  const [n, G] = rng.pick(spec.shapes)
  let planted: World | null = null
  for (let t = 0; t < 400 && !planted; t++) planted = plantFamily(rng, n, G, spec.single)
  if (!planted) return null
  const w = nameFamily(rng, planted)
  const { texts, rules } = ruleStatements(rng, w, spec)
  const pool = candidatePool(rng, w, spec)
  let t0 = Date.now()
  const first = pickClues(rng, w, G, pool, rules, spec)
  genStats.pick += Date.now() - t0
  if (!first) {
    genStats.noClues++
    return null
  }
  t0 = Date.now()
  const clues = readingOrder(rng, prune(rng, w, G, first, rules))
  genStats.prune += Date.now() - t0
  t0 = Date.now()
  const header = `There is a family of ${NUM_WORD[n]} people spread across ${NUM_WORD[G]} generations.`
  const text = [[header, ...texts].join(' '), ...clues.map((c) => c.text)].join('\n')

  // the real pipeline: parse the finished text, solve it, and compare with what was planted
  const parsed = parseFamily(text)
  const p = parsed.puzzle
  if (!p || parsed.errors.length || parsed.unparsed.length || p.names.join('') !== w.names.join('')) {
    genStats.notRead++
    return null
  }
  const found = solveFamily(p, { limit: 3, nodeCap: 3_000_000, deadlineMs: 4000 })
  if (!found.complete || found.worlds.length !== 1 || !sameFamily(found.worlds[0], w)) {
    genStats.notUnique++
    return null
  }
  genStats.final += Date.now() - t0
  genStats.ok++

  const stated = new Set<string>()
  for (const c of p.clues) for (const f of c.facts) if (f.t === 'rel' && !f.neg) stated.add(`${f.x}>${f.y}`).add(`${f.y}>${f.x}`)
  return { text, world: w, stated, level }
}

// ---------- questions ----------

interface Built {
  stem: string
  options: string[]
  answer: number
  hint: string
  explanation: string
  kind: Kind
}

const nameOf = (w: World) => (i: number) => w.names[i]
const familyLines = (w: World) => `The family: ${treeInWords(w).join(' · ')}.`
const trueRels = (w: World, x: number, y: number, rels: readonly string[]) => rels.filter((r) => holds(w, r, x, y) !== null)

function placeAnswer(rng: Rng, correct: string, wrong: string[]): { options: string[]; answer: number } {
  const options = rng.shuffle([correct, ...wrong])
  return { options, answer: options.indexOf(correct) }
}

function askRelation(rng: Rng, pz: Puzzle, spec: LevelSpec): Built | null {
  const w = pz.world
  const nm = nameOf(w)
  const pairs: { x: number; y: number; rel: string; fresh: boolean }[] = []
  for (let x = 0; x < w.n; x++)
    for (let y = 0; y < w.n; y++) {
      if (x === y) continue
      const t = trueRels(w, x, y, spec.askRels)
      if (t.length === 1) pairs.push({ x, y, rel: t[0], fresh: !pz.stated.has(`${x}>${y}`) })
    }
  const fresh = pairs.filter((p) => p.fresh)
  const pick = rng.pick(fresh.length ? fresh : pairs.length ? pairs : [null as never])
  if (!pick) return null
  const wrongPool = spec.askRels.filter((r) => r !== pick.rel && holds(w, r, pick.x, pick.y) === null)
  // near misses first: the same sex as the answer and the same generation gap look most like it
  const asked = RELATIONS[pick.rel]
  const score = (r: string) => (RELATIONS[r].gender === asked.gender ? 1 : 0) + (RELATIONS[r].genDiff === asked.genDiff ? 1 : 0) + rng.next()
  const wrong = [...wrongPool].sort((a, b) => score(b) - score(a)).slice(0, 4)
  if (wrong.length < 4) return null
  const { options, answer } = placeAnswer(rng, relLabel(pick.rel), wrong.map(relLabel))
  const why = holds(w, pick.rel, pick.x, pick.y, nm) as string
  return {
    kind: 'relation',
    stem: `How is ${nm(pick.x)} related to ${nm(pick.y)}?`,
    options,
    answer,
    hint: `Read it as “${nm(pick.x)} is the ___ of ${nm(pick.y)}”. Find both on the tree, then follow the links between them.`,
    explanation: `${nm(pick.x)} is the ${pick.rel} of ${nm(pick.y)}: ${why}. ${familyLines(w)}`,
  }
}

function askWho(rng: Rng, pz: Puzzle, spec: LevelSpec): Built | null {
  const w = pz.world
  const nm = nameOf(w)
  const items: { x: number; y: number; rel: string; fresh: boolean }[] = []
  for (let y = 0; y < w.n; y++)
    for (const rel of spec.askRels) {
      const holders = Array.from({ length: w.n }, (_, x) => x).filter((x) => x !== y && holds(w, rel, x, y) !== null)
      if (holders.length === 1) items.push({ x: holders[0], y, rel, fresh: !pz.stated.has(`${holders[0]}>${y}`) })
    }
  const fresh = items.filter((i) => i.fresh)
  const list = fresh.length ? fresh : items
  if (!list.length) return null
  const it = rng.pick(list)
  const others = Array.from({ length: w.n }, (_, i) => i).filter((i) => i !== it.x && i !== it.y)
  const sameSex = others.filter((i) => w.gender[i] === w.gender[it.x])
  const wrong = [...rng.shuffle(sameSex), ...rng.shuffle(others.filter((i) => !sameSex.includes(i)))].slice(0, 4)
  if (wrong.length < 4) return null
  const picked = [it.x, ...wrong].sort((a, b) => a - b)
  return {
    kind: 'who',
    stem: `Who is the ${it.rel} of ${nm(it.y)}?`,
    options: picked.map(nm),
    answer: picked.indexOf(it.x),
    hint: `Find ${nm(it.y)} on the tree, then look for the person who is the ${it.rel}.`,
    explanation: `${nm(it.x)} is the ${it.rel} of ${nm(it.y)}: ${holds(w, it.rel, it.x, it.y, nm)}. ${familyLines(w)}`,
  }
}

function askCount(rng: Rng, pz: Puzzle, spec: LevelSpec): Built | null {
  const w = pz.world
  const nm = nameOf(w)
  const all = Array.from({ length: w.n }, (_, i) => i)
  type C = { stem: string; value: number; why: string; hint: string }
  const cands: C[] = []
  const men = all.filter((i) => w.gender[i] === 'M')
  const women = all.filter((i) => w.gender[i] === 'F')
  cands.push({ stem: 'How many men are there in the family?', value: men.length, why: `the men are ${men.map(nm).join(', ') || 'nobody'}`, hint: 'Mark each person as a man or a woman on the tree, then count.' })
  cands.push({ stem: 'How many women are there in the family?', value: women.length, why: `the women are ${women.map(nm).join(', ') || 'nobody'}`, hint: 'Mark each person as a man or a woman on the tree, then count.' })
  const couples = all.filter((i) => w.spouse[i] > i)
  cands.push({ stem: 'How many married couples are there in the family?', value: couples.length, why: `the couples are ${couples.map((i) => `${nm(i)} and ${nm(w.spouse[i])}`).join(', ')}`, hint: 'Each couple is one man and one woman of the same generation.' })
  if (spec === LEVELS.medium || spec === LEVELS.hard) {
    const single = all.filter((i) => w.spouse[i] < 0)
    cands.push({ stem: 'How many people in the family are unmarried?', value: single.length, why: `the unmarried people are ${single.map(nm).join(', ') || 'nobody'}`, hint: 'Count everyone who is not part of a couple.' })
  }
  const gens = [...new Set(w.gen)].sort((a, b) => a - b)
  const g = rng.pick(gens)
  const inGen = all.filter((i) => w.gen[i] === g)
  cands.push({ stem: `How many people belong to the ${ORDINAL[g]} generation?`, value: inGen.length, why: `the ${ORDINAL[g]} generation is ${inGen.map(nm).join(', ')}`, hint: 'The oldest generation is the first; their children are the second.' })
  const level: Level = spec === LEVELS.easy ? 'easy' : spec === LEVELS.medium ? 'medium' : 'hard'
  for (const rel of COUNT_KINDS[level]) {
    for (const y of all) {
      const who = all.filter((x) => x !== y && holds(w, rel, x, y) !== null)
      if (who.length >= 1 && who.length <= 4) cands.push({ stem: `How many ${PLURAL[rel]} does ${nm(y)} have?`, value: who.length, why: `${nm(y)}'s ${PLURAL[rel]}: ${who.map(nm).join(', ')}`, hint: `Find ${nm(y)} on the tree and count only the ${PLURAL[rel]}.` })
    }
  }
  // questions about a person's relatives are the more interesting ones: ask them most of the time
  const aboutRelatives = cands.filter((x) => /does .* have\?$/.test(x.stem))
  const c = aboutRelatives.length && rng.chance(0.7) ? rng.pick(aboutRelatives) : rng.pick(cands)
  const max = Math.max(c.value + 3, 4)
  const pool = Array.from({ length: max + 1 }, (_, v) => v).filter((v) => v !== c.value)
  const near = pool.sort((a, b) => Math.abs(a - c.value) - Math.abs(b - c.value) + (rng.next() - 0.5))
  const picked = [c.value, ...near.slice(0, 4)].sort((a, b) => a - b)
  return { kind: 'count', stem: c.stem, options: picked.map(String), answer: picked.indexOf(c.value), hint: c.hint, explanation: `${cap1(c.why)}, so the answer is ${c.value}. ${familyLines(w)}` }
}

interface Stmt {
  x: number
  y: number
  rel: string
}
const stmtText = (w: World, s: Stmt) => `${w.names[s.x]} is the ${s.rel} of ${w.names[s.y]}`

function askTrue(rng: Rng, pz: Puzzle, spec: LevelSpec): Built | null {
  const w = pz.world
  const nm = nameOf(w)
  const truths: Stmt[] = []
  const falses: Stmt[] = []
  for (let x = 0; x < w.n; x++)
    for (let y = 0; y < w.n; y++) {
      if (x === y) continue
      const t = trueRels(w, x, y, spec.askRels)
      for (const rel of t) truths.push({ x, y, rel })
      // near misses: the pair the wrong way round, or a different relation between the same two people
      for (const rel of spec.askRels) if (!t.includes(rel) && (holds(w, rel, y, x) !== null || t.length > 0)) falses.push({ x, y, rel })
    }
  const negate = rng.chance(spec.negate)
  const need = (k: number, from: Stmt[]): Stmt[] | null => {
    const out: Stmt[] = []
    const usedPairs = new Set<string>()
    for (const s of rng.shuffle(from)) {
      const pair = `${Math.min(s.x, s.y)}-${Math.max(s.x, s.y)}`
      if (usedPairs.has(pair)) continue
      usedPairs.add(pair)
      out.push(s)
      if (out.length === k) return out
    }
    return null
  }
  const freshTruths = truths.filter((s) => !pz.stated.has(`${s.x}>${s.y}`))
  const odd = negate ? need(1, falses) : need(1, freshTruths.length >= 3 ? freshTruths : truths)
  const rest = negate ? need(4, truths) : need(4, falses)
  if (!odd || !rest) return null
  const all = [...odd, ...rest]
  if (new Set(all.map((s) => stmtText(w, s))).size !== 5) return null
  const shuffled = rng.shuffle(all)
  const target = shuffled.indexOf(odd[0])
  const o = odd[0]
  const explanation = negate
    ? `“${stmtText(w, o)}” is not true: the tree gives no such link between ${nm(o.x)} and ${nm(o.y)}. The other four are true. ${familyLines(w)}`
    : `${stmtText(w, o)}: ${holds(w, o.rel, o.x, o.y, nm)}. The other four are not true in this family. ${familyLines(w)}`
  return {
    kind: 'true',
    stem: negate ? 'Which of the following statements is NOT true?' : 'Which of the following statements is true?',
    options: shuffled.map((s) => stmtText(w, s)),
    answer: target,
    hint: 'Check each statement against the tree, and cross out the ones that fail.',
    explanation,
  }
}

const ASK: Record<Kind, (rng: Rng, pz: Puzzle, spec: LevelSpec) => Built | null> = { relation: askRelation, who: askWho, count: askCount, true: askTrue }

function chooseKind(rng: Rng, spec: LevelSpec, wanted: FamilyQType, skip: Set<Kind>): Kind {
  if (wanted !== 'mixed') return wanted
  const kinds = (Object.keys(spec.weights) as Kind[]).filter((k) => !skip.has(k))
  const total = kinds.reduce((s, k) => s + spec.weights[k], 0)
  let r = rng.next() * total
  for (const k of kinds) {
    r -= spec.weights[k]
    if (r <= 0) return k
  }
  return kinds[kinds.length - 1]
}

export interface FamilyTreeQuestion extends Built {
  level: Level
  /** the passage: the header sentence and one statement per line */
  text: string
  world: World
}

/** one question: plant a family, write the passage, ask about it (null if this draw did not work out) */
function oneQuestion(rng: Rng, level: Level, type: FamilyQType): FamilyTreeQuestion | null {
  const pz = makePuzzle(rng, level)
  if (!pz) return null
  const spec = LEVELS[level]
  const skip = new Set<Kind>()
  for (let k = 0; k < 4; k++) {
    const kind = chooseKind(rng, spec, type, skip)
    const built = ASK[kind](rng, pz, spec)
    if (built) return { ...built, level, text: pz.text, world: pz.world }
    if (type !== 'mixed') return null
    skip.add(kind)
  }
  return null
}

const LEVEL_ORDER: Level[] = ['easy', 'medium', 'hard']

/** the next question to add (null when this draw failed or repeats a passage already used) */
function nextQuestion(rng: Rng, difficulty: FamilyDifficulty, type: FamilyQType, seen: Set<string>): FamilyTreeQuestion | null {
  const level: Level = difficulty === 'mixed' ? rng.pick(LEVEL_ORDER) : difficulty
  const q = oneQuestion(rng, level, type)
  if (!q || seen.has(q.text)) return null
  seen.add(q.text)
  return q
}

export function generateFamilyQuestions(difficulty: FamilyDifficulty, type: FamilyQType, count: number, rng: Rng): FamilyTreeQuestion[] {
  const out: FamilyTreeQuestion[] = []
  const seen = new Set<string>()
  for (let guard = 0; out.length < count && guard < count * 60; guard++) {
    const q = nextQuestion(rng, difficulty, type, seen)
    if (q) out.push(q)
  }
  return out
}

/** the passage as plain text the Puzzle Solver can read */
export const familyQuestionText = (q: MCQQuestion): string => q.context ?? ''

function toMcq(qs: FamilyTreeQuestion[]): MCQQuestion[] {
  const run = randomSeed().toString(36)
  return qs.map((q, i) => ({
    id: `family-${run}-${i}`,
    instruction: `Family tree · ${LEVEL_LABEL[q.level]}`,
    context: q.text,
    term: q.stem,
    termSmall: true,
    correctMeaning: q.options[q.answer],
    options: q.options,
    hint: q.hint,
    explanation: q.explanation,
    noPronounce: true,
  }))
}

/** builds the questions a few at a time, giving the page a chance to repaint in between (a hard question can take a fifth of a second) */
export async function generateFamilyTreeQuestions(difficulty: FamilyDifficulty, type: FamilyQType, count: number): Promise<MCQQuestion[]> {
  const rng = createRng(randomSeed())
  const out: FamilyTreeQuestion[] = []
  const seen = new Set<string>()
  for (let guard = 0; out.length < count && guard < count * 60; guard++) {
    const q = nextQuestion(rng, difficulty, type, seen)
    if (q) out.push(q)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return toMcq(out)
}
