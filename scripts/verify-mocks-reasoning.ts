// Verification harness for the Mocks REASONING generators.
// Every check below is written independently of the generators (own solvers / evaluators / parsers) and works from the
// RENDERED text wherever possible, so a mismatch between the text a student reads and the model that produced it is caught.
//
// Usage: npx tsx scripts/verify-mocks-reasoning.ts [--seeds N] [--topic id[,id]] [--difficulty medium|hard] [--quiet] [--no-samples]
import { createRng } from '../src/lib/mocks/rng'
import { assertGroup } from '../src/lib/mocks/validate'
import { SET_SIZE } from '../src/lib/mocks/topics'
import type { Group, MockDifficulty, ReasoningTopicId } from '../src/lib/mocks/types'
import { REASONING_WITH_PROOF } from '../src/lib/mocks/reasoning/index'
import type {
  AlphaProof, ArrangementProof, BloodProof, CmpClaim, CodingProof, ComparisonProof, DirectionProof, InequalityProof, MiscProof, RankProof,
  SentenceCodingProof, SyllogismProof,
} from '../src/lib/mocks/reasoning/index'
import { CATS } from '../src/lib/mocks/reasoning/misc'

// ------------------------------------------------------------------------------------------------ CLI
const argv = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const SEEDS = Number(flag('seeds') ?? 300)
const TOPIC_FILTER = flag('topic')?.split(',')
const DIFF_FILTER = flag('difficulty') as MockDifficulty | undefined
const QUIET = argv.includes('--quiet')
const NO_SAMPLES = argv.includes('--no-samples') || QUIET

const ALL_TOPICS = Object.keys(REASONING_WITH_PROOF) as ReasoningTopicId[]
const TOPICS = TOPIC_FILTER ? ALL_TOPICS.filter((t) => TOPIC_FILTER.includes(t)) : ALL_TOPICS
const DIFFS: MockDifficulty[] = DIFF_FILTER ? [DIFF_FILTER] : ['medium', 'hard']

const OK_EXTRA = new Set('−√≤≥≠₹→∴'.split(''))
function badChars(s: string): string[] {
  const bad: string[] = []
  for (const ch of s) {
    const c = ch.codePointAt(0) as number
    if (c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || OK_EXTRA.has(ch)) continue
    bad.push(ch)
  }
  return bad
}

function fail(msg: string): never {
  throw new Error(msg)
}
function check(cond: unknown, msg: string): asserts cond {
  if (!cond) fail(msg)
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

// ================================================================================================ ARRANGEMENT (independent)
type HItem = readonly [number, number]
type HAtom = ArrangementProof['clues'][number]
type HGeom = ArrangementProof['geom']

const hmod = (a: number, n: number) => ((a % n) + n) % n

function hcoord(g: HGeom, p: number): { row: number; idx: number; len: number } {
  if (g.kind === 'tworow') return { row: p < g.n / 2 ? 0 : 1, idx: p % (g.n / 2), len: g.n / 2 }
  if (g.kind === 'stacks') {
    const h = g.n / g.stacks
    return { row: Math.floor(p / h), idx: p % h, len: h }
  }
  return { row: 0, idx: p, len: g.n }
}

function hEval(g: HGeom, a: HAtom, P: (i: HItem) => number): boolean {
  const n = g.n
  switch (a.t) {
    case 'not':
      return !hEval(g, a.c, P)
    case 'and':
      return a.cs.every((c) => hEval(g, c, P))
    case 'or':
      return a.cs.filter((c) => hEval(g, c, P)).length >= 1
    case 'eq':
      return P(a.x) === P(a.y)
    case 'par': {
      const floorNo = P(a.x) + 1
      return a.odd ? floorNo % 2 === 1 : floorNo % 2 === 0
    }
    case 'corner':
      return g.kind === 'square' && P(a.x) % 2 === 0
    case 'grp':
      return hcoord(g, P(a.x)).row === a.g
    case 'same':
      return hcoord(g, P(a.x)).row === hcoord(g, P(a.y)).row
    case 'pos':
      return hcoord(g, P(a.x)).idx === a.p
    case 'end': {
      const c = hcoord(g, P(a.x))
      return c.idx === 0 || c.idx === c.len - 1
    }
    case 'opp':
      return hmod(P(a.x) + n / 2, n) === P(a.y)
    case 'face': {
      const px = P(a.x)
      const py = P(a.y)
      if (g.kind === 'tworow') {
        const cx = hcoord(g, px)
        const cy = hcoord(g, py)
        return cx.row !== cy.row && cy.idx === cx.len - 1 - cx.idx
      }
      if (g.kind === 'circle') return hmod(px + n / 2, n) === py
      if (g.kind === 'square') return px % 2 === 1 && py === hmod(px + n / 2, n)
      return false
    }
    case 'off': {
      const px = P(a.x)
      const py = P(a.y)
      if (g.kind === 'circle') return hmod(py + a.d, n) === px
      if (g.kind === 'square') {
        // right neighbour of a side-middle person (odd) is index+1; of a corner person (even) it is index-1
        if (Math.abs(a.d) !== 1) return false
        const right = py % 2 === 1 ? hmod(py + 1, n) : hmod(py - 1, n)
        const left = py % 2 === 1 ? hmod(py - 1, n) : hmod(py + 1, n)
        return px === (a.d === 1 ? right : left)
      }
      const cx = hcoord(g, px)
      const cy = hcoord(g, py)
      return cx.row === cy.row && cx.idx === cy.idx + a.d
    }
    case 'lt': {
      const cx = hcoord(g, P(a.x))
      const cy = hcoord(g, P(a.y))
      return cx.row === cy.row && cx.idx < cy.idx
    }
    case 'btw': {
      const px = P(a.x)
      const py = P(a.y)
      if (g.kind === 'circle') {
        const side = a.side ?? 1
        // walk k+1 steps from x in direction `side` (+1 = to x's right)
        return hmod(px + side * (a.k + 1), n) === py
      }
      const cx = hcoord(g, px)
      const cy = hcoord(g, py)
      return cx.row === cy.row && Math.abs(cx.idx - cy.idx) - 1 === a.k
    }
    case 'adj': {
      const px = P(a.x)
      const py = P(a.y)
      if (g.kind === 'circle' || g.kind === 'square') return hmod(px + 1, n) === py || hmod(py + 1, n) === px
      const cx = hcoord(g, px)
      const cy = hcoord(g, py)
      return cx.row === cy.row && Math.abs(cx.idx - cy.idx) === 1
    }
    case 'mid': {
      const cx = hcoord(g, P(a.x))
      const cy = hcoord(g, P(a.y))
      const cz = hcoord(g, P(a.z))
      if (!(cx.row === cy.row && cy.row === cz.row)) return false
      return Math.min(cx.idx, cz.idx) < cy.idx && cy.idx < Math.max(cx.idx, cz.idx)
    }
  }
}

function hItems(a: HAtom, out: HItem[] = []): HItem[] {
  const add = (it: HItem) => {
    if (!out.some((o) => o[0] === it[0] && o[1] === it[1])) out.push(it)
  }
  switch (a.t) {
    case 'not':
      hItems(a.c, out)
      break
    case 'and':
    case 'or':
      a.cs.forEach((c) => hItems(c, out))
      break
    case 'mid':
      add(a.x)
      add(a.y)
      add(a.z)
      break
    case 'pos':
    case 'end':
    case 'grp':
    case 'corner':
    case 'par':
      add(a.x)
      break
    default:
      add(a.x)
      add(a.y)
  }
  return out
}

/** Exhaustive search for all solutions (up to `limit`) with forward checking; independent of the generator's solver. */
function hSolve(g: HGeom, nA: number, atoms: HAtom[], limit: number): number[][][] {
  const n = g.n
  const total = nA * n
  const pos = new Int16Array(total).fill(-1)
  const usedPos: boolean[][] = Array.from({ length: nA }, () => new Array<boolean>(n).fill(false))
  const atomItems = atoms.map((a) => hItems(a).map((it) => it[0] * n + it[1]))
  const byItem: number[][] = Array.from({ length: total }, () => [])
  atomItems.forEach((its, ai) => its.forEach((id) => byItem[id].push(ai)))
  const sols: number[][][] = []
  const getP = (it: HItem) => pos[it[0] * n + it[1]]
  const anchor = g.kind === 'circle' ? [0] : g.kind === 'square' ? [0, 1] : null

  const feasible = (id: number, p: number): boolean => {
    pos[id] = p
    let ok = true
    for (const ai of byItem[id]) {
      if (atomItems[ai].every((x) => pos[x] >= 0) && !hEval(g, atoms[ai], getP)) {
        ok = false
        break
      }
    }
    pos[id] = -1
    return ok
  }

  const rec = (): void => {
    if (sols.length >= limit) return
    let best = -1
    let bestCands: number[] = []
    let bestCount = 99
    for (let id = 0; id < total; id++) {
      if (pos[id] >= 0) continue
      const a = Math.floor(id / n)
      const cands: number[] = []
      for (let p = 0; p < n; p++) {
        if (usedPos[a][p]) continue
        if (id === 0 && anchor && !anchor.includes(p)) continue
        if (feasible(id, p)) cands.push(p)
      }
      if (cands.length === 0) return
      if (cands.length < bestCount) {
        best = id
        bestCount = cands.length
        bestCands = cands
        if (bestCount === 1) break
      }
    }
    if (best < 0) {
      const sol: number[][] = Array.from({ length: nA }, (_, a) => Array.from({ length: n }, (_, v) => pos[a * n + v]))
      sols.push(sol)
      return
    }
    const a = Math.floor(best / n)
    for (const p of bestCands) {
      pos[best] = p
      usedPos[a][p] = true
      rec()
      usedPos[a][p] = false
      pos[best] = -1
      if (sols.length >= limit) return
    }
  }
  rec()
  return sols
}

const ORD_WORDS = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']
const NUM_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

function parseListAfterDash(par: string): string[] {
  // "... - A, B, C - are ..." (names) or "... different colour - Red, Blue (not ..." (values)
  const m = par.match(/ - ([^()]*?)(?: - | \(|\.)/)
  check(m, `cannot parse list in "${par.slice(0, 80)}"`)
  return m[1].split(',').map((s) => s.trim())
}

function verifyArrangement(topic: ReasoningTopicId, g: Group, proof: ArrangementProof): void {
  const { geom, nA, hidden, clues, questions } = proof
  const sols = hSolve(geom, nA, clues, 2)
  check(sols.length === 1, `puzzle does not have exactly one solution (${sols.length === 0 ? 'none' : 'multiple'})`)
  const sol = sols[0]
  for (let a = 0; a < nA; a++) for (let v = 0; v < geom.n; v++) check(sol[a][v] === hidden[a][v], 'hidden arrangement differs from the unique solution')
  const P = (it: HItem) => sol[it[0]][it[1]]
  check(questions.length === g.questions.length, 'question count mismatch with proof')
  questions.forEach((q, qi) => {
    check(q.claims.length === 5, 'need five claims')
    const tr = q.claims.map((c) => hEval(geom, c, P))
    check(tr[q.answer], `keyed option claim is false in the unique solution (q${qi + 1})`)
    check(tr.filter(Boolean).length === 1, `more than one option claim is true (q${qi + 1})`)
    check(g.questions[qi].answer === q.answer, `draft answer differs from proof answer (q${qi + 1})`)
  })
  // text binding: every clue sentence mentions every item it refers to; direction / magnitude words match
  const paras = (g.stimulus?.parts[0] as { paragraphs: string[] }).paragraphs
  const intro: string[] = []
  let ci = 0
  while (ci < paras.length && !(paras.length - ci === clues.length)) {
    intro.push(paras[ci])
    ci++
  }
  check(paras.length - intro.length === clues.length, 'stimulus paragraph count != intro + clues')
  const names = parseListAfterDash(paras[0])
  check(names.length === geom.n, `intro lists ${names.length} names, expected ${geom.n}`)
  const attrVals: string[][] = []
  for (let a = 1; a < nA; a++) {
    const vals = parseListAfterDash(paras[a])
    check(vals.length === geom.n, 'attribute intro value count')
    attrVals.push(vals)
  }
  const itemName = (it: HItem) => (it[0] === 0 ? names[it[1]] : attrVals[it[0] - 1][it[1]])
  clues.forEach((c, i) => {
    const text = paras[intro.length + i]
    for (const it of hItems(c)) {
      const nm = itemName(it)
      check(text.includes(nm), `clue text "${text}" does not mention "${nm}"`)
    }
    verifyClueWords(geom, topic, c, text)
  })
  // option text <-> claim binding: an option that names a person / attribute value must be about that item,
  // and items shared by all five claims must be mentioned in the stem
  const itemKey = (it: HItem) => `${it[0]}:${it[1]}`
  questions.forEach((q, qi) => {
    const draft = g.questions[qi]
    const claimItems = q.claims.map((c) => new Set(hItems(c).map(itemKey)))
    draft.options.forEach((text, i) => {
      const parts = text.split('-')
      const wanted: string[] = []
      let all = true
      for (const part of parts) {
        const ni = names.indexOf(part)
        if (ni >= 0) wanted.push(`0:${ni}`)
        else {
          let found = false
          attrVals.forEach((vals, ai) => {
            const vi = vals.indexOf(part)
            if (vi >= 0 && !found) {
              wanted.push(`${ai + 1}:${vi}`)
              found = true
            }
          })
          if (!found) all = false
        }
      }
      if (all && wanted.length && !text.endsWith('.')) for (const w of wanted) check(claimItems[i].has(w), `option "${text}" is not about the item its claim refers to (q${qi + 1})`)
    })
    if (!q.claims.some((c) => c.t === 'and') && !draft.options.some((o) => o.endsWith('.'))) {
      const common = [...claimItems[0]].filter((k) => claimItems.every((cs) => cs.has(k)))
      for (const k of common) {
        const [a, v] = k.split(':').map(Number)
        const nm = a === 0 ? names[v] : attrVals[a - 1][v]
        check(draft.stem.includes(nm), `stem "${draft.stem}" does not mention the shared item "${nm}"`)
      }
    }
  })
}

function verifyClueWords(geom: HGeom, topic: ReasoningTopicId, c: HAtom, text: string): void {
  const t = text.toLowerCase()
  const absd = (d: number) => Math.abs(d)
  switch (c.t) {
    case 'off': {
      const k = absd(c.d)
      if (geom.kind === 'row' && topic === 'puzzle-floor') {
        check(t.includes(c.d > 0 ? 'above' : 'below'), `floor clue direction: ${text}`)
        if (k === 1) check(t.includes('immediately'), `floor clue immediacy: ${text}`)
        else check(t.includes(`${NUM_WORDS[k]} floors`), `floor clue magnitude: ${text}`)
      } else if (topic === 'puzzle-schedule') {
        check(t.includes(c.d > 0 ? 'after' : 'before'), `schedule clue direction: ${text}`)
        if (k === 1) check(t.includes('immediately'), `schedule clue immediacy: ${text}`)
        else check(t.includes(NUM_WORDS[k]), `schedule clue magnitude: ${text}`)
      } else if (topic === 'puzzle-box') {
        check(t.includes(c.d > 0 ? 'above' : 'below'), `box clue direction: ${text}`)
        if (k === 1) check(t.includes('immediately'), `box clue immediacy: ${text}`)
        else check(t.includes(NUM_WORDS[k]), `box clue magnitude: ${text}`)
      } else {
        check(t.includes(c.d > 0 ? 'right' : 'left'), `seating clue direction: ${text}`)
        if (k === 1) check(t.includes('immediate'), `seating clue immediacy: ${text}`)
        else check(t.includes(ORD_WORDS[k]), `seating clue magnitude: ${text}`)
      }
      break
    }
    case 'btw':
      check(t.includes(NUM_WORDS[c.k]), `between clue number: ${text}`)
      if (geom.kind === 'circle') check(t.includes(`counted from the ${c.side === -1 ? 'left' : 'right'}`), `circle between clue side: ${text}`)
      break
    case 'not':
      if (c.c.t !== 'corner') check(/not|neither/.test(t), `negated clue lacks negation: ${text}`)
      break
    case 'or':
      check(t.startsWith('either') && t.includes(' or '), `or clue phrasing: ${text}`)
      break
    default:
      break
  }
}

// ================================================================================================ COMPARISON (independent)
function parsePersonsList(par: string): string[] {
  const m = par.match(/ - ([^-]*?) - are compared/)
  check(m, 'cannot parse comparison persons')
  return m[1].split(',').map((s) => s.trim())
}

function verifyComparison(g: Group, proof: ComparisonProof): void {
  const { n, clues } = proof
  const paras = (g.stimulus?.parts[0] as { paragraphs: string[] }).paragraphs
  const names = parsePersonsList(paras[0])
  check(names.length === n, 'comparison names count')
  // parse the clue sentences back into edges (greater, lesser)
  const MORE = ['taller', 'heavier', 'older', 'faster', 'richer']
  const LESS = ['shorter', 'lighter', 'younger', 'slower', 'poorer']
  const parsed: string[] = []
  const nameRe = names.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  for (const s of paras.slice(1)) {
    let m: RegExpMatchArray | null
    if ((m = s.match(new RegExp(`^(${nameRe}) is (${[...MORE, ...LESS].join('|')}) than both (${nameRe}) and (${nameRe})\\.$`)))) {
      const more = MORE.includes(m[2])
      for (const o of [m[3], m[4]]) parsed.push(more ? `${m[1]}>${o}` : `${o}>${m[1]}`)
    } else if ((m = s.match(new RegExp(`^(${nameRe}) is (${LESS.join('|')}) than (${nameRe}) but (${MORE.join('|')}) than (${nameRe})\\.$`)))) {
      parsed.push(`${m[3]}>${m[1]}`, `${m[1]}>${m[5]}`)
    } else if ((m = s.match(new RegExp(`^(${nameRe}) is (${[...MORE, ...LESS].join('|')}) than (${nameRe})\\.$`)))) {
      parsed.push(MORE.includes(m[2]) ? `${m[1]}>${m[3]}` : `${m[3]}>${m[1]}`)
    } else fail(`cannot parse comparison clue: ${s}`)
  }
  const want = clues.map(([a, b]) => `${names[a]}>${names[b]}`).sort()
  check(JSON.stringify(parsed.sort()) === JSON.stringify(want), 'parsed comparison clues differ from the proof clues')
  // linear extensions (own enumeration by insertion)
  const exts: number[][] = []
  const place = (order: number[], remaining: number[]): void => {
    if (!remaining.length) {
      const rank = new Array<number>(n)
      order.forEach((p, i) => {
        rank[p] = i
      })
      exts.push(rank)
      return
    }
    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i]
      // p can be next (greatest remaining) only if no remaining person must be above it
      if (clues.some(([a, b]) => b === p && remaining.includes(a))) continue
      place([...order, p], remaining.filter((x) => x !== p))
    }
  }
  place([], Array.from({ length: n }, (_, i) => i))
  check(exts.length >= 1, 'no linear extension')
  const ev = (c: CmpClaim, r: number[]): boolean => (c.t === 'rank' ? r[c.x] === c.r : c.t === 'gt' ? r[c.x] < r[c.y] : r[c.hi] < r[c.x] && r[c.x] < r[c.lo])
  const nPeople = n
  proof.questions.forEach((q, qi) => {
    check(q.options.length === 5, 'comparison options')
    const all = q.options.map((c) => (c ? exts.every((r) => ev(c, r)) : false))
    const cannotIdx = q.options.indexOf(null)
    if (cannotIdx >= 0) {
      check(g.questions[qi].options[cannotIdx] === 'Cannot be determined', 'cannot option text')
      const real = q.options.filter((c): c is CmpClaim => c !== null)
      // the full claim family the question ranges over
      const family: CmpClaim[] = []
      if (real.every((c) => c.t === 'rank' && c.r === (real[0] as { r: number }).r)) for (let x = 0; x < nPeople; x++) family.push({ t: 'rank', x, r: (real[0] as { r: number }).r })
      else if (real.every((c) => c.t === 'rank' && c.x === (real[0] as { x: number }).x)) for (let r = 0; r < nPeople; r++) family.push({ t: 'rank', x: (real[0] as { x: number }).x, r })
      else if (real.every((c) => c.t === 'between')) for (let x = 0; x < nPeople; x++) family.push({ t: 'between', x, hi: (real[0] as { hi: number }).hi, lo: (real[0] as { lo: number }).lo })
      else fail('unrecognised comparison claim family')
      const det = family.filter((c) => exts.every((r) => ev(c, r)))
      if (q.answer === cannotIdx) check(det.length === 0, `"Cannot be determined" keyed but the answer is determined (q${qi + 1})`)
      else {
        check(all[q.answer] && all.filter(Boolean).length === 1, `keyed comparison answer not definitely true / not unique (q${qi + 1})`)
        check(det.length === 1, 'family has several definite answers')
      }
    } else {
      check(all[q.answer] && all.filter(Boolean).length === 1, `keyed statement not the unique definitely-true option (q${qi + 1})`)
    }
    check(g.questions[qi].answer === q.answer, 'comparison draft answer')
  })
}

// ================================================================================================ SYLLOGISM (independent)
const SYL_OPTIONS = [
  'Only conclusion I follows',
  'Only conclusion II follows',
  'Either conclusion I or II follows',
  'Neither conclusion I nor II follows',
  'Both conclusions I and II follow',
]

interface PStmt {
  type: 'A' | 'E' | 'I' | 'O' | 'P'
  x: string
  y: string
}
const singular = (w: string): string => {
  if (w === 'buses') return 'bus'
  if (/(ches|xes)$/.test(w)) return w.slice(0, -2)
  return w.replace(/s$/, '')
}
function parseSyl(line: string): PStmt {
  const l = line.replace(/\.$/, '')
  let m: RegExpMatchArray | null
  if ((m = l.match(/^All (\w+) are (\w+)$/))) return { type: 'A', x: singular(m[1]), y: singular(m[2]) }
  if ((m = l.match(/^Some (\w+) are not (\w+)$/))) return { type: 'O', x: singular(m[1]), y: singular(m[2]) }
  if ((m = l.match(/^Some (\w+) can be (\w+)$/))) return { type: 'P', x: singular(m[1]), y: singular(m[2]) }
  if ((m = l.match(/^Some (\w+) are (\w+)$/))) return { type: 'I', x: singular(m[1]), y: singular(m[2]) }
  if ((m = l.match(/^No (\w+) is (?:a|an) (\w+)$/))) return { type: 'E', x: m[1], y: m[2] }
  return fail(`cannot parse syllogism line: ${line}`)
}

function sylOutcome(stem: string): number {
  const lines = stem.split('\n')
  const ci = lines.indexOf('Conclusions:')
  check(lines[0] === 'Statements:' && ci > 1, 'syllogism stem layout')
  const prem = lines.slice(1, ci).map(parseSyl)
  const concl = lines.slice(ci + 1).map((l) => parseSyl(l.replace(/^I+\.\s*/, '')))
  check(concl.length === 2, 'two conclusions expected')
  const terms: string[] = []
  for (const s of prem) for (const t of [s.x, s.y]) if (!terms.includes(t)) terms.push(t)
  for (const s of concl) for (const t of [s.x, s.y]) check(terms.includes(t), `conclusion uses an unseen term ${t}`)
  const k = terms.length
  check(k >= 3 && k <= 4, 'term count')
  const R = (1 << k) - 1
  const regions: boolean[][] = []
  for (let r = 1; r <= R; r++) regions.push(terms.map((_, t) => ((r >> t) & 1) === 1))
  const tix = (t: string) => terms.indexOf(t)
  const holds = (s: PStmt, ne: boolean[]): boolean => {
    const xi = tix(s.x)
    const yi = tix(s.y)
    let some = false
    let bad = false
    for (let r = 0; r < R; r++) {
      if (!ne[r]) continue
      const reg = regions[r]
      switch (s.type) {
        case 'A':
          if (reg[xi] && !reg[yi]) bad = true
          break
        case 'E':
          if (reg[xi] && reg[yi]) bad = true
          break
        case 'I':
        case 'P':
          if (reg[xi] && reg[yi]) some = true
          break
        case 'O':
          if (reg[xi] && !reg[yi]) some = true
          break
      }
    }
    return s.type === 'A' || s.type === 'E' ? !bad : some
  }
  let nModels = 0
  const allTrue = [true, true]
  const someTrue = [false, false]
  let eitherAlways = true
  for (let m = 1; m < 1 << R; m++) {
    const ne: boolean[] = []
    for (let r = 0; r < R; r++) ne.push(((m >> r) & 1) === 1)
    let ok = true
    for (let t = 0; t < k && ok; t++) if (!regions.some((reg, r) => ne[r] && reg[t])) ok = false
    if (!ok) continue
    if (!prem.every((p) => holds(p, ne))) continue
    nModels++
    const h = concl.map((c) => holds(c, ne))
    for (let i = 0; i < 2; i++) {
      if (!h[i]) allTrue[i] = false
      if (h[i]) someTrue[i] = true
    }
    if (!h[0] && !h[1]) eitherAlways = false
  }
  check(nModels > 0, 'premises have no model')
  const follows = concl.map((c, i) => (c.type === 'P' ? someTrue[i] : allTrue[i]))
  const sameOrdered = concl[0].x === concl[1].x && concl[0].y === concl[1].y
  const types = [concl[0].type, concl[1].type].sort().join('')
  const complementary = sameOrdered && (types === 'EI' || types === 'AO')
  if (follows[0] && follows[1]) return 4
  if (follows[0]) return 0
  if (follows[1]) return 1
  if (complementary) {
    check(eitherAlways, 'complementary pair is not exhaustive?!')
    return 2
  }
  check(!(eitherAlways && concl.every((c) => c.type !== 'P')), 'neither follows but the conclusions together cover every case without being contradictories (debatable convention)')
  return 3
}

function verifySyllogism(g: Group): number {
  const q = g.questions[0]
  check(JSON.stringify(q.options) === JSON.stringify(SYL_OPTIONS), 'syllogism options must be the standard five in fixed order')
  const out = sylOutcome(q.stem)
  check(out === q.answer, `syllogism keyed ${SYL_OPTIONS[q.answer]} but model says ${SYL_OPTIONS[out]}`)
  return out
}

// ================================================================================================ INEQUALITY (independent)
const PHRASE: Record<string, string> = {
  'A is greater than B': '>',
  'A is neither smaller than nor equal to B': '>',
  'A is smaller than B': '<',
  'A is neither greater than nor equal to B': '<',
  'A is either greater than or equal to B': '≥',
  'A is not smaller than B': '≥',
  'A is either smaller than or equal to B': '≤',
  'A is not greater than B': '≤',
  'A is equal to B': '=',
}
const holdsRel = (r: string, x: number, y: number): boolean => (r === '>' ? x > y : r === '<' ? x < y : r === '≥' ? x >= y : r === '≤' ? x <= y : x === y)

function ineqOutcome(stem: string): number {
  const lines = stem.split('\n')
  const sym: Record<string, string> = {}
  let i = 0
  const coded = lines[0].startsWith('In the following questions')
  if (coded) {
    i = 1
    while (lines[i].startsWith("'A ")) {
      const m = lines[i].match(/^'A (\S) B' means '(.+)'\.$/)
      check(m, `legend line: ${lines[i]}`)
      const rel = PHRASE[m[2]]
      check(rel, `unknown legend phrase: ${m[2]}`)
      check(!(m[1] in sym), 'legend symbol repeated')
      sym[m[1]] = rel
      i++
    }
    check(Object.keys(sym).length === 5 && new Set(Object.values(sym)).size === 5, 'legend must define five distinct symbols/relations')
  } else for (const r of ['>', '<', '≥', '≤', '=']) sym[r] = r
  check(lines[i].startsWith('Statements: '), 'statements line')
  const chains = lines[i].slice('Statements: '.length).split('; ')
  check(lines[i + 1] === 'Conclusions:', 'conclusions header')
  const concl = [lines[i + 2], lines[i + 3]].map((l, ix) => {
    const m = l.match(/^(I|II)\. (\S) (\S+) (\S)$/)
    check(m && m[1] === (ix === 0 ? 'I' : 'II'), `conclusion line ${l}`)
    check(m[3] in sym, `unknown symbol ${m[3]}`)
    return { x: m[2], rel: sym[m[3]], y: m[4] }
  })
  const letters: string[] = []
  const cons: { x: string; rel: string; y: string }[] = []
  for (const ch of chains) {
    const tok = ch.split(' ')
    check(tok.length % 2 === 1 && tok.length >= 3, `bad chain ${ch}`)
    for (let t = 0; t < tok.length; t += 2) {
      check(/^[A-Z]$/.test(tok[t]), `bad letter ${tok[t]}`)
      if (!letters.includes(tok[t])) letters.push(tok[t])
    }
    for (let t = 1; t < tok.length; t += 2) {
      check(tok[t] in sym, `unknown statement symbol ${tok[t]}`)
      cons.push({ x: tok[t - 1], rel: sym[tok[t]], y: tok[t + 1] })
    }
  }
  for (const c of concl) check(letters.includes(c.x) && letters.includes(c.y) && c.x !== c.y, 'conclusion letters')
  const k = letters.length
  check(k <= 6, 'too many letters for brute force')
  const ix = (l: string) => letters.indexOf(l)
  const vals = new Array<number>(k).fill(0)
  const total = k ** k
  let consistentCount = 0
  const allTrue = [true, true]
  let exhaustive = true
  let bothAny = false
  for (let code = 0; code < total; code++) {
    let t = code
    for (let q = 0; q < k; q++) {
      vals[q] = t % k
      t = Math.floor(t / k)
    }
    const h = concl.map((c) => holdsRel(c.rel, vals[ix(c.x)], vals[ix(c.y)]))
    if (!h[0] && !h[1]) exhaustive = false
    if (h[0] && h[1]) bothAny = true
    if (!cons.every((c) => holdsRel(c.rel, vals[ix(c.x)], vals[ix(c.y)]))) continue
    consistentCount++
    if (!h[0]) allTrue[0] = false
    if (!h[1]) allTrue[1] = false
  }
  check(consistentCount > 0, 'inequality statements are inconsistent')
  const samePair = (concl[0].x === concl[1].x && concl[0].y === concl[1].y) || (concl[0].x === concl[1].y && concl[0].y === concl[1].x)
  if (allTrue[0] && allTrue[1]) return 4
  if (allTrue[0]) return 0
  if (allTrue[1]) return 1
  if (samePair && exhaustive) {
    check(!bothAny, 'neither follows; the pair covers every case but overlaps (debatable convention)')
    return 2
  }
  return 3
}

function verifyInequality(g: Group): number {
  const q = g.questions[0]
  check(JSON.stringify(q.options) === JSON.stringify(SYL_OPTIONS), 'inequality options must be the standard five in fixed order')
  const out = ineqOutcome(q.stem)
  check(out === q.answer, `inequality keyed ${SYL_OPTIONS[q.answer]} but brute force says ${SYL_OPTIONS[out]}`)
  return out
}

// ================================================================================================ BLOOD RELATIONS (independent)
// Couple-based model: every person may belong to a "family" (couple id) as a child; a couple = two person ids.
interface Fam {
  g: number[] // -1 unknown, 0 F, 1 M, -2 dead
  fam: number[] // family (couple) this person is a child of, -1 none
  sp: number[]
  couples: [number, number][]
  named: number
}
const PRIM_G: Record<string, number> = { father: 1, son: 1, brother: 1, husband: 1, mother: 0, daughter: 0, sister: 0, wife: 0 }
const PRIM_KIND: Record<string, string> = { father: 'P', mother: 'P', son: 'C', daughter: 'C', brother: 'S', sister: 'S', husband: 'W', wife: 'W' }

function famBuild(rels: string[], nP: number): Fam | null {
  const F: Fam = { g: new Array(nP).fill(-1), fam: new Array(nP).fill(-1), sp: new Array(nP).fill(-1), couples: [], named: nP }
  const nn = (g: number): number => {
    F.g.push(g)
    F.fam.push(-1)
    F.sp.push(-1)
    return F.g.length - 1
  }
  const marry = (a: number, b: number) => {
    F.sp[a] = b
    F.sp[b] = a
  }
  const coupleOf = (a: number, b: number): number => {
    const same = F.couples.findIndex((c) => (c[0] === a && c[1] === b) || (c[0] === b && c[1] === a))
    if (same >= 0) return same
    F.couples.push([a, b])
    return F.couples.length - 1
  }
  const sweep = (): boolean => {
    for (let x = 0; x < F.g.length; x++) {
      const y = F.sp[x]
      if (y >= 0 && F.g[x] >= 0) {
        if (F.g[y] === F.g[x]) return false
        if (F.g[y] < 0) F.g[y] = 1 - F.g[x]
      }
    }
    return true
  }
  const absorb = (virt: number, real: number): boolean => {
    // the named person `real` turns out to be the virtual placeholder `virt`
    if (F.g[virt] >= 0 && F.g[real] >= 0 && F.g[virt] !== F.g[real]) return false
    if (F.g[real] < 0) F.g[real] = F.g[virt]
    if (F.fam[virt] >= 0) {
      if (F.fam[real] >= 0 && F.fam[real] !== F.fam[virt]) return false
      F.fam[real] = F.fam[virt]
    }
    if (F.sp[virt] >= 0) {
      if (F.sp[real] >= 0 && F.sp[real] !== F.sp[virt]) return false
      F.sp[real] = F.sp[virt]
      F.sp[F.sp[virt]] = real
    }
    for (const c of F.couples) {
      if (c[0] === virt) c[0] = real
      if (c[1] === virt) c[1] = real
      if (c[0] === c[1]) return false
    }
    for (let x = 0; x < F.g.length; x++) if (F.sp[x] === virt) F.sp[x] = real
    F.g[virt] = -2
    F.fam[virt] = -1
    F.sp[virt] = -1
    // two couples with the same two members are one family
    for (let i = 0; i < F.couples.length; i++) {
      for (let j = i + 1; j < F.couples.length; j++) {
        const [a, b] = F.couples[i]
        const [c, d] = F.couples[j]
        if (a < 0 || c < 0) continue
        if ((a === c && b === d) || (a === d && b === c)) {
          for (let x = 0; x < F.fam.length; x++) if (F.fam[x] === j) F.fam[x] = i
          F.couples[j] = [-1, -1]
        }
      }
    }
    return true
  }
  for (let i = 0; i < rels.length; i++) {
    const a = i
    const b = i + 1
    const kind = PRIM_KIND[rels[i]]
    const gg = PRIM_G[rels[i]]
    if (F.g[a] >= 0 && F.g[a] !== gg) return null
    F.g[a] = gg
    if (kind === 'P') {
      if (F.sp[a] < 0) {
        const v = nn(F.g[a] >= 0 ? 1 - F.g[a] : -1)
        marry(a, v)
      }
      if (F.fam[b] >= 0) return null
      F.fam[b] = coupleOf(a, F.sp[a])
    } else if (kind === 'C') {
      if (F.fam[a] < 0) {
        if (F.sp[b] >= 0) return null
        const v = nn(F.g[b] >= 0 ? 1 - F.g[b] : -1)
        marry(b, v)
        F.fam[a] = coupleOf(b, v)
      } else {
        const [p, q] = F.couples[F.fam[a]]
        const virt = [p, q].filter((x) => x >= F.named)
        if (!virt.length) return null
        if (!absorb(virt[0], b)) return null
      }
    } else if (kind === 'S') {
      if (F.fam[a] < 0) {
        const v1 = nn(-1)
        const v2 = nn(-1)
        marry(v1, v2)
        F.fam[a] = coupleOf(v1, v2)
      }
      if (F.fam[b] >= 0) return null
      F.fam[b] = F.fam[a]
    } else {
      if (F.sp[a] >= F.named) {
        if (!absorb(F.sp[a], b)) return null
      } else if (F.sp[a] >= 0) return null
      else marry(a, b)
    }
    if (!sweep()) return null
  }
  return F
}

function famTerm(F: Fam, u: number, v: number, male: boolean): string | null {
  if (u === v) return null
  const kids = (x: number): number[] => {
    const out: number[] = []
    F.couples.forEach((c, ci) => {
      if (c[0] === x || c[1] === x) F.fam.forEach((f, p) => f === ci && out.push(p))
    })
    return out
  }
  const parentsOf = (x: number): number[] => (F.fam[x] >= 0 ? [...F.couples[F.fam[x]]] : [])
  const sibs = (x: number): number[] => (F.fam[x] >= 0 ? F.fam.map((f, p) => (f === F.fam[x] && p !== x ? p : -1)).filter((p) => p >= 0) : [])
  const spouse = (x: number) => (x >= 0 && x < F.sp.length ? F.sp[x] : -1)
  const T = (m: string, f: string) => (male ? m : f)
  if (spouse(u) === v) return T('husband', 'wife')
  if (parentsOf(v).includes(u)) return T('father', 'mother')
  if (parentsOf(u).includes(v)) return T('son', 'daughter')
  if (sibs(u).includes(v)) return T('brother', 'sister')
  if (parentsOf(v).some((p) => parentsOf(p).includes(u))) return T('grandfather', 'grandmother')
  if (parentsOf(u).some((p) => parentsOf(p).includes(v))) return T('grandson', 'granddaughter')
  const auntOf = (x: number, y: number) => parentsOf(y).some((p) => sibs(p).includes(x) || (spouse(x) >= 0 && sibs(p).includes(spouse(x))))
  if (auntOf(u, v)) return T('uncle', 'aunt')
  if (auntOf(v, u)) return T('nephew', 'niece')
  if (parentsOf(u).some((p) => sibs(p).some((s) => kids(s).includes(v)))) return 'cousin'
  if (sibs(v).some((s) => spouse(s) === u)) return T('brother-in-law', 'sister-in-law')
  if (spouse(v) >= 0 && sibs(spouse(v)).includes(u)) return T('brother-in-law', 'sister-in-law')
  if (spouse(v) >= 0 && parentsOf(spouse(v)).includes(u)) return T('father-in-law', 'mother-in-law')
  if (spouse(u) >= 0 && parentsOf(spouse(u)).includes(v)) return T('son-in-law', 'daughter-in-law')
  return null
}

function verifyBlood(g: Group, proof: BloodProof): void {
  const q = g.questions[0]
  const stem = q.stem
  let rels: string[] = []
  let asked: [string, string]
  let people: string[] = []
  const coded = /^In a certain code language,/.test(stem)
  const nameRe = '([A-Za-z]+)'
  if (!coded) {
    const sentences = stem.split(/(?<=\.)\s+(?=[A-Z])/)
    const qline = sentences.pop() as string
    const chain: { a: string; r: string; b: string }[] = []
    for (const s of sentences) {
      const m = s.match(new RegExp(`^${nameRe} is the (father|mother|son|daughter|brother|sister|husband|wife) of ${nameRe}\\.$`))
      check(m, `cannot parse blood-relation statement: ${s}`)
      chain.push({ a: m[1], r: m[2], b: m[3] })
    }
    chain.forEach((c, i) => check(i === 0 || chain[i - 1].b === c.a, 'statement chain is not continuous'))
    rels = chain.map((c) => c.r)
    people = [chain[0].a, ...chain.map((c) => c.b)]
    const m = qline.match(new RegExp(`^How is ${nameRe} related to ${nameRe}\\?$`))
    check(m, `question line: ${qline}`)
    asked = [m[1], m[2]]
  } else {
    const [legendLine, exprLine] = stem.split('\n')
    const legend: Record<string, string> = {}
    for (const part of legendLine.replace(/^In a certain code language, /, '').replace(/\.$/, '').split('; ')) {
      const m = part.match(/^'P (\S) Q' means 'P is the (\w+) of Q'$/)
      check(m, `legend part: ${part}`)
      legend[m[1]] = m[2]
    }
    check(Object.keys(legend).length === 5 && new Set(Object.keys(legend)).size === 5, 'legend should define five operators')
    check(new Set(Object.values(legend)).size === 5, 'legend relations must be distinct')
    const m = exprLine.match(new RegExp(`^If (.+), how is ${nameRe} related to ${nameRe}\\?$`))
    check(m, `expression line: ${exprLine}`)
    const tok = m[1].split(' ')
    check(tok.length % 2 === 1, 'expression tokens')
    for (let t = 0; t < tok.length; t += 2) people.push(tok[t])
    for (let t = 1; t < tok.length; t += 2) {
      check(tok[t] in legend, `unknown operator ${tok[t]}`)
      rels.push(legend[tok[t]])
    }
    asked = [m[2], m[3]]
  }
  check(new Set(people).size === people.length, 'names repeat')
  check(rels.length === proof.hops.length && rels.every((r, i) => r === proof.hops[i].rel), 'parsed relations differ from the proof hops')
  const from = people.indexOf(asked[0])
  const to = people.indexOf(asked[1])
  check(from >= 0 && to >= 0 && from !== to, 'asked persons not in chain')
  check((from === 0 && to === people.length - 1) || (to === 0 && from === people.length - 1), 'question must relate the two ends of the chain')
  const F = famBuild(rels, people.length)
  check(F, 'statements are contradictory / ambiguous for the free model')
  let term: string
  if (F.g[from] >= 0) {
    const t = famTerm(F, from, to, F.g[from] === 1)
    check(t, 'relation not derivable from the statements ' + JSON.stringify(F) + ' from=' + from + ' to=' + to)
    term = t
  } else {
    const tm = famTerm(F, from, to, true)
    const tf = famTerm(F, from, to, false)
    check(tm && tf, 'relation not derivable for either gender')
    term = tm === tf ? tm : 'Cannot be determined'
  }
  const keyed = q.options[q.answer]
  check(keyed === term, `blood relation keyed "${keyed}" but derivation gives "${term}"`)
  check(proof.answerText === keyed, 'proof answer text')
  check(q.options.filter((o) => o === term).length === 1, 'derived term must appear exactly once')
  if (term === 'Cannot be determined') check(q.answer === 4, 'cannot-be-determined must be option E')
  check(q.options.every((o) => o === 'Cannot be determined' || /^[a-z-]+$/.test(o)), 'option format')
}

// ================================================================================================ DIRECTION & DISTANCE (independent)
const HEADV: Record<string, [number, number]> = { North: [0, 1], East: [1, 0], South: [0, -1], West: [-1, 0] }
const HEADORDER = ['North', 'East', 'South', 'West']

function verifyDirection(g: Group, proof: DirectionProof): void {
  const q = g.questions[0]
  const sents = q.stem.split(/(?<=\.|\?)\s+/)
  const question = sents.pop() as string
  const walkers = new Map<string, { x: number; y: number; h: number; legs: number }>()
  const order: string[] = []
  let cur = ''
  let unit = ''
  const name = '([A-Za-z]+)'
  for (const s of sents) {
    let m: RegExpMatchArray | null
    if ((m = s.match(new RegExp(`^${name} and ${name} start from the same point\\.$`)))) continue
    if ((m = s.match(new RegExp(`^${name} (?:starts from a point and )?walks (\\d+) (m|km) towards (North|East|South|West)\\.$`))) && !walkers.has(m[1])) {
      cur = m[1]
      order.push(cur)
      const [dx, dy] = HEADV[m[4]]
      const d = Number(m[2])
      walkers.set(cur, { x: dx * d, y: dy * d, h: HEADORDER.indexOf(m[4]), legs: 1 })
      unit = unit || m[3]
      check(unit === m[3], 'mixed units')
      continue
    }
    m = s.match(new RegExp(`^(?:Then|After that,) (${name}|he|she) (?:turns (left|right)|takes a (left|right) turn|takes a U-turn) and (?:walks|covers) (\\d+) (m|km)\\.$`))
    if (m) {
      const who = m[1] === 'he' || m[1] === 'she' ? cur : m[1]
      const w = walkers.get(who)
      check(w, `unknown walker in "${s}"`)
      cur = who
      const side = m[3] ?? m[4]
      if (/U-turn/.test(s)) w.h = (w.h + 2) % 4
      else if (side === 'left') w.h = (w.h + 3) % 4
      else if (side === 'right') w.h = (w.h + 1) % 4
      else fail(`turn side: ${s}`)
      const d = Number(m[5])
      w.x += HEADV[HEADORDER[w.h]][0] * d
      w.y += HEADV[HEADORDER[w.h]][1] * d
      w.legs++
      continue
    }
    m = s.match(new RegExp(`^Then (${name}|he|she) walks (\\d+) (m|km) towards (North|East|South|West)\\.$`))
    if (m) {
      const who = m[1] === 'he' || m[1] === 'she' ? cur : m[1]
      const w = walkers.get(who)
      check(w, `unknown walker in "${s}"`)
      cur = who
      w.h = HEADORDER.indexOf(m[5])
      const d = Number(m[3])
      w.x += HEADV[m[5]][0] * d
      w.y += HEADV[m[5]][1] * d
      w.legs++
      check(unit === m[4], 'mixed units')
      continue
    }
    fail(`cannot parse direction sentence: ${s}`)
  }
  const compass = (dx: number, dy: number): string | null => {
    if (dx === 0 && dy === 0) return null
    if (dx === 0) return dy > 0 ? 'North' : 'South'
    if (dy === 0) return dx > 0 ? 'East' : 'West'
    if (Math.abs(dx) !== Math.abs(dy)) return null
    return `${dy > 0 ? 'North' : 'South'}-${dx > 0 ? 'East' : 'West'}`
  }
  let expect: string
  let m: RegExpMatchArray | null
  const W = (n: string) => walkers.get(n) as { x: number; y: number }
  if ((m = question.match(new RegExp(`^In which direction is ${name} now with respect to the starting point\\?$`)))) {
    const w = W(m[1])
    const c = compass(w.x, w.y)
    check(c, 'displacement is not a clean compass direction')
    expect = c
  } else if ((m = question.match(new RegExp(`^In which direction is the starting point with respect to ${name}'s present position\\?$`)))) {
    const w = W(m[1])
    const c = compass(-w.x, -w.y)
    check(c, 'displacement is not a clean compass direction')
    expect = c
  } else if ((m = question.match(new RegExp(`^What is the shortest distance between ${name}'s final position and the starting point\\?$`)))) {
    const w = W(m[1])
    const d = Math.hypot(w.x, w.y)
    check(Number.isInteger(d) && d > 0, 'distance not a clean integer')
    expect = `${d} ${unit}`
  } else if ((m = question.match(new RegExp(`^In which direction is ${name} with respect to ${name} now\\?$`)))) {
    const a = W(m[2])
    const b = W(m[1])
    const c = compass(b.x - a.x, b.y - a.y)
    check(c, 'relative displacement is not a clean compass direction')
    expect = c
  } else if ((m = question.match(new RegExp(`^What is the shortest distance between the final positions of ${name} and ${name}\\?$`)))) {
    const a = W(m[1])
    const b = W(m[2])
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    check(Number.isInteger(d) && d > 0, 'distance between walkers not a clean integer')
    expect = `${d} ${unit}`
  } else return fail(`cannot parse direction question: ${question}`)
  check(q.options[q.answer] === expect, `direction keyed "${q.options[q.answer]}" but coordinates give "${expect}"`)
  check(q.options.filter((o) => o === expect).length === 1, 'answer appears more than once')
  check(proof.answerText === expect, 'proof answer text')
  const expectedWalkers = order.length
  check(expectedWalkers === proof.walkers.length, 'walker count')
}

// ================================================================================================ CODING-DECODING (independent rule family)
interface HRule {
  name: string
  f: (w: string) => string
}
const sh1 = (c: string, s: number): string => String.fromCharCode(65 + ((((c.charCodeAt(0) - 65 + s) % 26) + 26) % 26))
const letterPos = (c: string) => c.charCodeAt(0) - 64
const mirrorCh = (c: string) => String.fromCharCode(155 - c.charCodeAt(0))
function buildFamily(): HRule[] {
  const out: HRule[] = []
  const add = (name: string, f: (w: string) => string) => out.push({ name, f })
  const rev = (w: string) => w.split('').reverse().join('')
  const vow = (c: string) => 'AEIOU'.includes(c)
  add('rev', rev)
  add('mirror', (w) => w.split('').map(mirrorCh).join(''))
  add('mirrorRev', (w) => rev(w.split('').map(mirrorCh).join('')))
  add('swapEnds', (w) => (w.length < 2 ? w : w[w.length - 1] + w.slice(1, -1) + w[0]))
  add('posNum', (w) => w.split('').map((c) => String(letterPos(c))).join(''))
  add('posSum', (w) => String(w.split('').reduce((s, c) => s + letterPos(c), 0)))
  add('posNumRev', (w) => rev(w).split('').map((c) => String(letterPos(c))).join(''))
  add('posDiffSum', (w) => String(w.split('').reduce((s, c) => s + letterPos(c), 0) * 2))
  for (let s = -25; s <= 25; s++) {
    if (s === 0) continue
    add(`shift${s}`, (w) => w.split('').map((c) => sh1(c, s)).join(''))
    add(`shiftRev${s}`, (w) => rev(w.split('').map((c) => sh1(c, s)).join('')))
    add(`swapShift${s}`, (w) => (w.length < 2 ? w : [...(w[w.length - 1] + w.slice(1, -1) + w[0])].map((c) => sh1(c, s)).join('')))
  }
  for (let a = -12; a <= 12; a++) {
    for (let b = -12; b <= 12; b++) {
      if (a === b) continue
      add(`alt${a},${b}`, (w) => w.split('').map((c, i) => sh1(c, i % 2 === 0 ? a : b)).join(''))
      if (Math.abs(a) <= 6 && Math.abs(b) <= 6) add(`altRev${a},${b}`, (w) => rev(w.split('').map((c, i) => sh1(c, i % 2 === 0 ? a : b)).join('')))
    }
  }
  for (let s = -5; s <= 5; s++) {
    if (s === 0) continue
    add(`prog${s}`, (w) => w.split('').map((c, i) => sh1(c, s * (i + 1))).join(''))
    add(`progRev${s}`, (w) => rev(w.split('').map((c, i) => sh1(c, s * (i + 1))).join('')))
    add(`progBack${s}`, (w) => w.split('').map((c, i) => sh1(c, s * (w.length - i))).join(''))
    add(`vowelShift${s}`, (w) => w.split('').map((c) => (vow(c) ? sh1(c, s) : c)).join(''))
    add(`consShift${s}`, (w) => w.split('').map((c) => (vow(c) ? c : sh1(c, s))).join(''))
    add(`lenShift${s}`, (w) => w.split('').map((c) => sh1(c, s * w.length)).join(''))
  }
  for (let s = 1; s <= 3; s++) {
    add(`alt3-${s}`, (w) => w.split('').map((c, i) => sh1(c, [s, -s, 0][i % 3])).join(''))
    add(`mirrorShift${s}`, (w) => w.split('').map((c) => sh1(mirrorCh(c), s)).join(''))
    add(`mirrorShift-${s}`, (w) => w.split('').map((c) => sh1(mirrorCh(c), -s)).join(''))
  }
  return out
}
const H_FAMILY = buildFamily()

function verifyCoding(g: Group, proof: CodingProof): void {
  const q = g.questions[0]
  let m: RegExpMatchArray | null
  const enc = q.stem.match(/^In [a-z ]+, '([A-Z]+)' is written as '([A-Z0-9]+)'\. How is '([A-Z]+)' written in that code\?$/)
  const dec = q.stem.match(/^In [a-z ]+, '([A-Z]+)' is written as '([A-Z0-9]+)'\. What does '([A-Z0-9]+)' stand for in that code\?$/)
  m = enc ?? dec
  check(m, `cannot parse coding stem: ${q.stem}`)
  const [w1, c1, query] = [m[1], m[2], m[3]]
  const fits = H_FAMILY.filter((r) => r.f(w1) === c1)
  check(fits.length >= 1, 'no rule of the independent family reproduces the example')
  const keyed = q.options[q.answer]
  if (enc) {
    for (const r of fits) {
      const out = r.f(query)
      check(out === keyed, `rule ${r.name} fits the example but encodes '${query}' as '${out}', keyed '${keyed}'`)
    }
  } else {
    for (const r of fits) {
      const decodes = q.options.filter((o) => r.f(o) === query)
      check(decodes.length === 1 && decodes[0] === keyed, `rule ${r.name} fits the example but decodes options to [${decodes.join(',')}], keyed '${keyed}'`)
    }
  }
  check(q.options.filter((o) => o === keyed).length === 1, 'duplicate keyed option')
  check(proof.answerText === keyed, 'proof answer text')
}

// ================================================================================================ SENTENCE CODING (independent)
function verifySentenceCoding(g: Group, proof: SentenceCodingProof): void {
  const paras = (g.stimulus?.parts[0] as { paragraphs: string[] }).paragraphs.slice(1)
  const sentences = paras.map((p) => {
    const m = p.match(/^'([a-z ]+)' is coded as '([a-z ]+)'$/)
    check(m, `cannot parse coded sentence: ${p}`)
    return { words: m[1].split(' '), codes: m[2].split(' ') }
  })
  check(sentences.length === proof.sentences.length, 'sentence count')
  const words = [...new Set(sentences.flatMap((s) => s.words))]
  const codes = [...new Set(sentences.flatMap((s) => s.codes))]
  check(words.length === codes.length, 'word/code count differ')
  check(sentences.every((s) => s.words.length === s.codes.length && new Set(s.words).size === s.words.length), 'sentence shape')
  // all bijections via permutation of the code list
  const dicts: Record<string, string>[] = []
  const assign: string[] = new Array(words.length)
  const usedC = new Set<string>()
  const full = (i: number): void => {
    if (i === words.length) {
      const d: Record<string, string> = {}
      words.forEach((w, ix) => {
        d[w] = assign[ix]
      })
      // every sentence's code set must equal the image of its word set
      const ok = sentences.every((s) => {
        const img = s.words.map((w) => d[w]).sort().join(',')
        return img === [...s.codes].sort().join(',')
      })
      if (ok) dicts.push(d)
      return
    }
    for (const c of codes) {
      if (usedC.has(c)) continue
      usedC.add(c)
      assign[i] = c
      full(i + 1)
      usedC.delete(c)
    }
  }
  full(0)
  check(dicts.length >= 1, 'no consistent dictionary')
  g.questions.forEach((q, qi) => {
    const keyed = q.options[q.answer]
    let m: RegExpMatchArray | null
    if ((m = q.stem.match(/^What is the code for '([a-z]+)' in the given code language\?$/))) {
      const w = m[1]
      check(words.includes(w), 'asked word not in sentences')
      const vals = new Set(dicts.map((d) => d[w]))
      check(vals.size === 1 && vals.has(keyed), `code for '${w}' not uniquely '${keyed}' (possible: ${[...vals].join(',')})`)
      check(q.options.every((o, i) => i === q.answer || !vals.has(o)), 'wrong option equals the code')
    } else if ((m = q.stem.match(/^What does the code '([a-z]+)' stand for in the given code language\?$/))) {
      const c = m[1]
      const vals = new Set(dicts.map((d) => words.find((w) => d[w] === c) as string))
      check(vals.size === 1 && vals.has(keyed), `meaning of '${c}' not uniquely '${keyed}'`)
    } else if ((m = q.stem.match(/^What is the code for '([a-z ]+)' in the given code language\? \(The order of the code words may vary\.\)$/))) {
      const ws = m[1].split(' ')
      const imgs = new Set(dicts.map((d) => ws.map((w) => d[w]).sort().join(' ')))
      const key = keyed.split(' ').sort().join(' ')
      check(imgs.size === 1 && imgs.has(key), 'phrase code not unique / not keyed')
      const optKeys = q.options.map((o) => o.split(' ').sort().join(' '))
      check(optKeys.filter((k) => k === key).length === 1, 'phrase option set appears more than once')
    } else if ((m = q.stem.match(/^Which of the following may be the code for '([a-z]+)' in the given code language\?$/))) {
      const w = m[1]
      const feas = new Set(dicts.map((d) => d[w]))
      check(feas.has(keyed), 'keyed code is not feasible')
      const others = q.options.filter((o, i) => i !== q.answer && feas.has(o))
      check(others.length === 0, `another option is also feasible: ${others.join(',')}`)
      check(feas.size >= 1, 'feasible set')
    } else fail(`cannot parse sentence-coding question: ${q.stem}`)
    check(q.options.filter((o) => o === keyed).length === 1, `duplicate keyed option in sentence coding q${qi + 1}`)
  })
}

// ================================================================================================ ALPHANUMERIC SERIES (independent)
function clsTest(word: string): (ch: string) => boolean {
  const L = (c: string) => /^[A-Z]$/.test(c)
  const D = (c: string) => /^[0-9]$/.test(c)
  switch (word) {
    case 'letter':
    case 'letters':
      return L
    case 'vowel':
    case 'vowels':
      return (c) => L(c) && 'AEIOU'.includes(c)
    case 'consonant':
    case 'consonants':
      return (c) => L(c) && !'AEIOU'.includes(c)
    case 'number':
    case 'numbers':
      return D
    case 'even number':
    case 'even numbers':
      return (c) => D(c) && Number(c) % 2 === 0
    case 'odd number':
    case 'odd numbers':
      return (c) => D(c) && Number(c) % 2 === 1
    case 'symbol':
    case 'symbols':
      return (c) => !L(c) && !D(c)
  }
  return fail(`unknown class word ${word}`)
}

function verifyAlpha(g: Group, proof: AlphaProof): void {
  const series = (g.stimulus?.parts[0] as { paragraphs: string[] }).paragraphs[0].split(' ')
  check(JSON.stringify(series) === JSON.stringify(proof.series), 'series text differs from proof')
  check(new Set(series).size === series.length, 'series elements must be distinct')
  const n = series.length
  const ordNum = (s: string) => Number(s.replace(/(st|nd|rd|th)$/, ''))
  const LBL = ['None', 'One', 'Two', 'Three', 'More than three']
  g.questions.forEach((q, qi) => {
    const keyed = q.options[q.answer]
    let m: RegExpMatchArray | null
    if ((m = q.stem.match(/^How many such ([a-z ]+) are there in the above arrangement, each of which is immediately preceded by (?:a|an) ([a-z ]+) and immediately followed by (?:a|an) ([a-z ]+)\?$/))) {
      const cur = clsTest(m[1])
      const prev = clsTest(m[2])
      const next = clsTest(m[3])
      let c = 0
      for (let i = 1; i < n - 1; i++) if (cur(series[i]) && prev(series[i - 1]) && next(series[i + 1])) c++
      check(keyed === LBL[Math.min(c, 4)] && JSON.stringify(q.options) === JSON.stringify(LBL), `pattern count ${c} but keyed "${keyed}"`)
    } else if ((m = q.stem.match(/^How many ([a-z ]+) are there in the above arrangement which are immediately (preceded|followed) by (?:a|an) ([a-z ]+)\?$/))) {
      const cur = clsTest(m[1])
      const other = clsTest(m[3])
      let c = 0
      for (let i = 0; i < n; i++) {
        const j = m[2] === 'preceded' ? i - 1 : i + 1
        if (j >= 0 && j < n && cur(series[i]) && other(series[j])) c++
      }
      check(keyed === LBL[Math.min(c, 4)], `one-sided pattern count ${c} but keyed "${keyed}"`)
    } else if ((m = q.stem.match(/^(If the series is reversed \(written from right to left\), |In the above series, )which element is the (\d+(?:st|nd|rd|th)) to the (left|right) of the (\d+(?:st|nd|rd|th)) element from the (left|right) end(?: of the new series)?\?$/))) {
      const arr = m[1].startsWith('If') ? series.slice().reverse() : series
      const j = ordNum(m[2])
      const i = ordNum(m[4])
      const base = m[5] === 'left' ? i - 1 : n - i
      const idx = m[3] === 'right' ? base + j : base - j
      check(idx >= 0 && idx < n, 'index out of the series')
      check(keyed === arr[idx], `nth element is ${arr[idx]} but keyed "${keyed}"`)
    } else if ((m = q.stem.match(/^How many elements are there between (\S) and (\S) in the above series\?$/))) {
      const c = Math.abs(series.indexOf(m[1]) - series.indexOf(m[2])) - 1
      check(series.includes(m[1]) && series.includes(m[2]) && keyed === String(c), `between count ${c} but keyed "${keyed}"`)
    } else if ((m = q.stem.match(/^Which element is exactly in the middle of (\S) and (\S) in the above series\?$/))) {
      const ia = series.indexOf(m[1])
      const ib = series.indexOf(m[2])
      check(ia >= 0 && ib >= 0 && (ia + ib) % 2 === 0, 'middle element undefined')
      check(keyed === series[(ia + ib) / 2], 'middle element mismatch')
    } else fail(`cannot parse alphanumeric question: ${q.stem}`)
    check(q.options.filter((o) => o === keyed).length === 1, `duplicate keyed option in alphanumeric q${qi + 1}`)
  })
  check(proof.questions.length === g.questions.length, 'alpha proof count')
}

// ================================================================================================ ORDER & RANKING (independent brute force over N)
function verifyRanking(g: Group, proof: RankProof): void {
  const q = g.questions[0]
  const keyed = q.options[q.answer]
  const answers = new Set<number>()
  for (const f of [...proof.facts, ...proof.afterFacts]) {
    if ('n' in f) check(q.stem.includes(String(f.n)), `fact number ${f.n} missing from the stem`)
  }
  for (let N = 2; N <= 200; N++) {
    const totalFact = proof.facts.find((f) => f.k === 'total')
    if (totalFact && totalFact.k === 'total' && totalFact.n !== N) continue
    const cands: number[][] = []
    for (let p = 0; p < proof.nPersons; p++) {
      const list: number[] = []
      for (let pos = 1; pos <= N; pos++) {
        let ok = true
        for (const f of proof.facts) {
          if (f.k === 'fromLeft' && f.who === p && pos !== f.n) ok = false
          if (f.k === 'fromRight' && f.who === p && pos !== N - f.n + 1) ok = false
        }
        if (ok) list.push(pos)
      }
      cands.push(list)
    }
    const rec = (p: number, chosen: number[]): void => {
      if (p === proof.nPersons) {
        if (new Set(chosen).size !== chosen.length) return
        for (const f of proof.facts) {
          if (f.k === 'between' && Math.abs(chosen[f.a] - chosen[f.b]) - 1 !== f.n) return
          if (f.k === 'leftOf' && !(chosen[f.a] < chosen[f.b])) return
        }
        const row: number[] = new Array(N).fill(-1)
        chosen.forEach((pos, who) => {
          row[pos - 1] = who
        })
        for (const op of proof.ops) {
          const at = (who: number) => row.indexOf(who)
          if (op.k === 'swap') {
            const ia = at(op.a)
            const ib = at(op.b)
            ;[row[ia], row[ib]] = [row[ib], row[ia]]
          } else if (op.k === 'removeLeft') {
            const i = at(op.who)
            if (i < op.count) return
            row.splice(i - op.count, op.count)
          } else for (let t = 0; t < op.count; t++) row.push(-1)
        }
        for (const f of proof.afterFacts) {
          if (f.k === 'fromLeft' && row.indexOf(f.who) + 1 !== f.n) return
          if (f.k === 'fromRight' && row.length - row.indexOf(f.who) !== f.n) return
        }
        const a = proof.ask
        if (a.k === 'total') answers.add(row.length)
        else if (a.k === 'between') answers.add(Math.abs(row.indexOf(a.a) - row.indexOf(a.b)) - 1)
        else if (a.k === 'fromLeft') answers.add(row.indexOf(a.who) + 1)
        else answers.add(row.length - row.indexOf(a.who))
        return
      }
      for (const pos of cands[p]) rec(p + 1, [...chosen, pos])
    }
    rec(0, [])
  }
  check(answers.size === 1, `ranking facts give ${answers.size} possible answers`)
  const val = [...answers][0]
  check(String(val) === keyed && val === proof.answerValue, `ranking keyed "${keyed}" but brute force gives ${val}`)
  check(q.options.filter((o) => o === keyed).length === 1, 'duplicate keyed option')
}

// ================================================================================================ MISC (independent)
const LBL5 = ['None', 'One', 'Two', 'Three', 'More than three']
const multi = (s: string): Record<string, number> => {
  const r: Record<string, number> = {}
  for (const c of s) r[c] = (r[c] ?? 0) + 1
  return r
}
const formable = (src: string, w: string): boolean => {
  const a = multi(src)
  const b = multi(w)
  return Object.keys(b).every((c) => (a[c] ?? 0) >= b[c])
}
const isPrimeH = (n: number) => n > 1 && Array.from({ length: Math.floor(Math.sqrt(n)) - 1 }, (_, i) => i + 2).every((d) => n % d !== 0)
const dsH = (n: number) => String(n).split('').reduce((s, c) => s + Number(c), 0)
const NUM_FAM_H: ((n: number) => boolean)[] = [
  isPrimeH,
  (n) => Number.isInteger(Math.sqrt(n)),
  (n) => Math.round(Math.cbrt(n)) ** 3 === n,
  ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((d) => (n: number) => n % d === 0),
  (n) => String(n) === String(n).split('').reverse().join(''),
  (n) => dsH(n) % 2 === 0,
  (n) => dsH(n) % 3 === 0,
  (n) => dsH(n) % 9 === 0,
  (n) => dsH(n) > 10,
  (n) => n < 100,
  (n) => n > 50,
  (n) => n > 100,
  (n) => n > 150,
  (n) => n > 200,
  (n) => String(n).split('').every((c) => Number(c) % 2 === 1),
  (n) => String(n).split('').every((c) => Number(c) % 2 === 0),
  (n) => n % 3 === 1,
  (n) => n % 3 === 2,
  (n) => n % 4 === 1,
  (n) => n % 4 === 3,
  (n) => n % 5 === 1,
  (n) => n % 7 === 1,
  (n) => isPrimeH(dsH(n)),
]
const LET_FAM_H: ((p: string) => boolean)[] = [
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((gp) => (p: string) => Math.abs(letterPos(p[0]) - letterPos(p[1])) === gp),
  (p) => 'AEIOU'.includes(p[0]) && 'AEIOU'.includes(p[1]),
  (p) => !'AEIOU'.includes(p[0]) && !'AEIOU'.includes(p[1]),
  (p) => 'AEIOU'.includes(p[0]) || 'AEIOU'.includes(p[1]),
  (p) => 'AEIOU'.includes(p[0]),
  (p) => 'AEIOU'.includes(p[1]),
  (p) => (letterPos(p[0]) + letterPos(p[1])) % 2 === 0,
  (p) => (letterPos(p[0]) + letterPos(p[1])) % 2 === 1,
  (p) => letterPos(p[0]) < letterPos(p[1]),
  (p) => letterPos(p[0]) + letterPos(p[1]) > 26,
  (p) => letterPos(p[0]) + letterPos(p[1]) > 20,
  (p) => letterPos(p[0]) <= 13 && letterPos(p[1]) <= 13,
  (p) => letterPos(p[0]) > 13 && letterPos(p[1]) > 13,
  (p) => letterPos(p[0]) % 2 === 0,
  (p) => letterPos(p[1]) % 2 === 0,
  (p) => letterPos(p[0]) % 2 === 1,
  (p) => letterPos(p[1]) % 2 === 1,
  (p) => letterPos(p[0]) % 3 === 0,
  (p) => letterPos(p[1]) % 3 === 0,
]
function oddIndexOf(flags: boolean[]): number | null {
  const t = flags.filter(Boolean).length
  return t === 1 ? flags.indexOf(true) : t === 4 ? flags.indexOf(false) : null
}
const CLOSE_CATS: [string, string][] = [['fruits', 'vegetables'], ['animals', 'birds'], ['vehicles', 'furniture']]
const AMBIGUOUS_WORDS = new Set(['tomato', 'orange', 'mercury', 'lead', 'jaguar', 'python', 'pumpkin', 'cucumber', 'tin', 'bat', 'crane', 'mouse'])

function verifyMisc(g: Group, proof: MiscProof): void {
  const q = g.questions[0]
  const keyed = q.options[q.answer]
  const quoted = (s: string): string => (s.match(/'([A-Za-z]+)'/) as RegExpMatchArray)[1]
  switch (proof.k) {
    case 'pairs': {
      const w = quoted(q.stem)
      check(w === proof.word, 'pairs: word mismatch')
      let c = 0
      for (let i = 0; i < w.length; i++) for (let j = i + 1; j < w.length; j++) if (w[i] !== w[j] && j - i === Math.abs(letterPos(w[i]) - letterPos(w[j]))) c++
      check(keyed === LBL5[Math.min(c, 4)] && JSON.stringify(q.options) === JSON.stringify(LBL5), `pairs: count ${c} but keyed ${keyed}`)
      break
    }
    case 'formWhich': {
      const src = quoted(q.stem)
      const can = q.options.filter((o) => formable(src, o))
      check(can.length === 1 && can[0] === keyed, `formWhich: formable options are [${can.join(',')}], keyed ${keyed}`)
      check(q.options.every((o) => /^[A-Z]{3,}$/.test(o)), 'formWhich: option shape')
      break
    }
    case 'formCount': {
      const src = quoted(q.stem)
      const words = q.stem.split('\n')[1].split(', ')
      check(words.length === 5 && new Set(words).size === 5, 'formCount: word list')
      const c = words.filter((w) => formable(src, w)).length
      check(keyed === LBL5[Math.min(c, 4)], `formCount: count ${c} but keyed ${keyed}`)
      break
    }
    case 'odd': {
      const items = q.options
      if (proof.family === 'num') {
        const nums = items.map(Number)
        check(nums.every((n) => Number.isInteger(n)) && new Set(nums).size === 5, 'odd(num): items')
        let explained = false
        for (const P of NUM_FAM_H) {
          const odd = oddIndexOf(nums.map(P))
          if (odd === null) continue
          check(odd === q.answer, `odd(num): another property singles out ${items[odd]} instead of ${keyed}`)
          explained = true
        }
        check(explained, 'odd(num): no property explains the grouping')
      } else if (proof.family === 'letters') {
        check(items.every((p) => /^[A-Z]{2}$/.test(p)) && new Set(items).size === 5, 'odd(letters): items')
        let explained = false
        for (const P of LET_FAM_H) {
          const odd = oddIndexOf(items.map(P))
          if (odd === null) continue
          check(odd === q.answer, `odd(letters): another property singles out ${items[odd]} instead of ${keyed}`)
          explained = true
        }
        check(explained, 'odd(letters): no property explains the grouping')
      } else {
        const catOf = (w: string): string[] => Object.keys(CATS).filter((c) => CATS[c].includes(w.toLowerCase()))
        const cats = items.map(catOf)
        check(cats.every((c) => c.length === 1), 'odd(words): every word needs exactly one category')
        check(items.every((w) => !AMBIGUOUS_WORDS.has(w.toLowerCase())), 'odd(words): ambiguous word used')
        const names = cats.map((c) => c[0])
        const counts: Record<string, number> = {}
        names.forEach((c) => (counts[c] = (counts[c] ?? 0) + 1))
        const keys = Object.keys(counts)
        check(keys.length === 2 && Object.values(counts).sort().join() === '1,4', 'odd(words): need a 4-1 category split')
        const oddCat = names[q.answer]
        check(counts[oddCat] === 1, 'odd(words): keyed word is not the singleton category')
        check(!CLOSE_CATS.some(([a, b]) => keys.includes(a) && keys.includes(b)), 'odd(words): semantically close categories combined')
      }
      break
    }
    case 'alphaSame': {
      const w = quoted(q.stem)
      const sorted = [...w].sort().join('')
      let c = 0
      for (let i = 0; i < w.length; i++) if (w[i] === sorted[i]) c++
      check(keyed === LBL5[Math.min(c, 4)], `alphaSame: count ${c} but keyed ${keyed}`)
      break
    }
    case 'alphaNth': {
      const w = quoted(q.stem)
      const m = q.stem.match(/will be (\d+)(?:st|nd|rd|th) from the (left|right) end\?$/)
      check(m, 'alphaNth: stem')
      const sorted = [...w].sort()
      const n = Number(m[1])
      const letter = m[2] === 'left' ? sorted[n - 1] : sorted[sorted.length - n]
      check(keyed === letter, `alphaNth: ${letter} but keyed ${keyed}`)
      break
    }
    case 'swapNth': {
      const w = quoted(q.stem)
      const m = q.stem.match(/the (\d+)(?:st|nd|rd|th) and the (\d+)(?:st|nd|rd|th) letters .* which letter will be (\d+)(?:st|nd|rd|th) from the right end/)
      check(m, 'swapNth: stem')
      const arr = [...w]
      const i = Number(m[1]) - 1
      const j = Number(m[2]) - 1
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
      check(keyed === arr[arr.length - Number(m[3])], 'swapNth: letter mismatch')
      break
    }
  }
}

// ================================================================================================ WORDING CONSISTENCY
// One drawn entity (name, attribute value, unit, pronoun, adjective family) must be spelled identically in the stimulus,
// the stem, the options and the explanation. Every capitalised entity word of the explanation must come from the stimulus/stem/options.
const EXPL_OK = new Set([
  'Final', 'Row', 'Stack', 'Floor', 'Hence', 'Rule', 'Series', 'Reversed', 'Statement', 'Statements', 'Given', 'Decoded', 'The', 'Answer', 'So', 'Total',
  'Position', 'Persons', 'Exactly', 'In', 'After', 'Original', 'Word', 'Pairs', 'Alphabetical', 'New', 'Other', 'Matching', 'Count', 'Q', 'I', 'II', 'A', 'No',
  'Venn', 'Comparing', 'Conclusions', 'Reversing', 'Elements', 'Letters', 'Some', 'All', 'Both', 'Either', 'Only', 'Neither', 'Conclusion', 'Note', 'It', 'This', 'That',
  'North', 'South', 'East', 'West', 'Taking', 'Box', 'Which', 'Not', 'Four', 'One', 'Two', 'Three', 'Five', 'Six', 'Seven', 'Eight', 'Persons', 'After', 'Middle',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
])
const LETTER_TOPICS = new Set(['syllogism', 'inequality', 'coding-decoding', 'reasoning-misc', 'alphanumeric-series'])

function verifyConsistency(topic: ReasoningTopicId, g: Group): void {
  const stimText: string[] = []
  if (g.stimulus) for (const p of g.stimulus.parts) if (p.kind === 'text') stimText.push(...p.paragraphs)
  const isArr = ARRANGEMENT_TOPICS.includes(topic)
  for (const q of g.questions) {
    const source = [...stimText, q.stem, ...q.options].join(' ')
    // 1. entity words of the explanation must exist in the problem text
    const words = q.explanation.match(/\b[A-Z][A-Za-z]*\b/g) ?? []
    for (const w of words) {
      if (EXPL_OK.has(w)) continue
      if (LETTER_TOPICS.has(topic) && (w.length === 1 || /^[A-Z]+$/.test(w))) continue
      check(new RegExp(`\\b${w}\\b`).test(source), `explanation entity "${w}" does not occur in the stimulus/stem/options (${topic})`)
    }
    // 2. arrangement puzzles: the explanation lists every person and every attribute value exactly as in the stimulus
    if (isArr) {
      const names = parseListAfterDash(stimText[0])
      for (const nm of names) check(new RegExp(`\\b${nm}\\b`).test(q.explanation), `explanation arrangement lacks person "${nm}"`)
      let a = 1
      while (a < stimText.length && /^Each (of them|box) /.test(stimText[a])) {
        for (const v of parseListAfterDash(stimText[a])) check(q.explanation.includes(v), `explanation arrangement lacks value "${v}"`)
        a++
      }
      const clues = stimText.slice(a)
      if (topic === 'puzzle-box') {
        check(!/^Who\b/.test(q.stem), 'box questions must say "Which box"')
        for (const p of clues) check(/\bboxe?s?\b/i.test(p), `box clue does not talk about boxes: ${p}`)
      } else check(!/\bbox\b/i.test(q.stem + q.explanation), 'stray box wording in a non-box puzzle')
      if (topic === 'puzzle-floor') for (const p of clues) check(!/\bsits?\b/.test(p), `seating verb in a floor puzzle: ${p}`)
      if (topic === 'seating-linear' || topic === 'seating-circular') for (const p of clues) check(!/\b(lives?|born|kept)\b/.test(p), `non-seating verb in a seating puzzle: ${p}`)
    }
    // 3. direction: unit and pronoun consistency
    if (topic === 'direction-distance') {
      const units = new Set((q.stem.match(/\d+ (m|km)\b/g) ?? []).map((x) => x.split(' ')[1]))
      check(units.size === 1, 'mixed units in the stem')
      const unit = [...units][0]
      check(q.explanation.includes(`in ${unit})`), 'explanation unit differs from the stem unit')
      if (q.options.some((o) => /\d/.test(o))) check(q.options.every((o) => o.endsWith(` ${unit}`)), 'option unit differs from the stem unit')
      check(new Set(q.stem.match(/\b(he|she)\b/g) ?? []).size <= 1, 'both he and she used for one walker')
    }
    // 4. comparison: the adjective family of the stem matches the explanation noun
    if (topic === 'puzzle-comparison') {
      const fam: [RegExp, string][] = [[/tall|short/, 'height'], [/heav|light/, 'weight'], [/old|young/, 'age'], [/fast|slow/, 'speed'], [/rich|poor/, 'wealth']]
      const noun = (stimText[0].match(/on the basis of their (\w+)/) as RegExpMatchArray)[1]
      for (const [re, n] of fam) if (re.test(q.stem) && n !== noun) fail(`stem adjective family implies ${n} but the stimulus says ${noun}`)
      check(q.explanation.includes(`(${noun})`), 'explanation noun differs from the stimulus noun')
    }
    // 5. coding / alphanumeric / sentence coding: quoted tokens of the explanation come from the problem text
    if (topic === 'coding-decoding') for (const m of q.explanation.match(/'[A-Z0-9]+'/g) ?? []) check(q.stem.includes(m) || q.options.includes(m.slice(1, -1)), `explanation token ${m} not in the stem/options`)
    if (topic === 'alphanumeric-series') {
      const series = stimText[0]
      check(q.explanation.includes(series) || q.explanation.includes(series.split(' ').reverse().join(' ')), 'explanation series differs from the stimulus series')
    }
    if (topic === 'sentence-coding') for (const m of q.explanation.match(/'[a-z ]+'/g) ?? []) for (const tok of m.slice(1, -1).split(' ')) check(stimText.join(' ').includes(tok), `explanation token '${tok}' not in the coded sentences`)
  }
}

// ================================================================================================ MAIN
function splitCountH(count: number, size: number): number[] {
  const out: number[] = []
  let left = count
  while (left > 0) {
    out.push(Math.min(size, left))
    left -= Math.min(size, left)
  }
  return out
}

const ARRANGEMENT_TOPICS: ReasoningTopicId[] = ['seating-linear', 'seating-circular', 'puzzle-floor', 'puzzle-schedule', 'puzzle-box']

function verifyGroupProof(topic: ReasoningTopicId, g: Group, proof: unknown, dist: number[]): void {
  if (ARRANGEMENT_TOPICS.includes(topic)) return verifyArrangement(topic, g, proof as ArrangementProof)
  switch (topic) {
    case 'puzzle-comparison':
      return verifyComparison(g, proof as ComparisonProof)
    case 'syllogism': {
      const out = verifySyllogism(g)
      check((proof as SyllogismProof).answer === out, 'syllogism proof answer')
      dist[out]++
      return
    }
    case 'inequality': {
      const out = verifyInequality(g)
      check((proof as InequalityProof).answer === out, 'inequality proof answer')
      dist[out]++
      return
    }
    case 'blood-relation':
      return verifyBlood(g, proof as BloodProof)
    case 'direction-distance':
      return verifyDirection(g, proof as DirectionProof)
    case 'coding-decoding':
      return verifyCoding(g, proof as CodingProof)
    case 'sentence-coding':
      return verifySentenceCoding(g, proof as SentenceCodingProof)
    case 'alphanumeric-series':
      return verifyAlpha(g, proof as AlphaProof)
    case 'order-ranking':
      return verifyRanking(g, proof as RankProof)
    case 'reasoning-misc':
      return verifyMisc(g, proof as MiscProof)
    default:
      return fail(`no verifier for ${topic}`)
  }
}

function renderGroup(g: Group): string {
  const out: string[] = []
  if (g.stimulus) {
    if (g.stimulus.directions) out.push(`  [${g.stimulus.directions}]`)
    for (const p of g.stimulus.parts) if (p.kind === 'text') for (const para of p.paragraphs) out.push(`  | ${para}`)
  }
  g.questions.forEach((q, i) => {
    out.push(`  Q${i + 1}. ${q.stem.split('\n').join('\n      ')}`)
    out.push(`      ${q.options.map((o, k) => `(${'ABCDE'[k]}) ${o}`).join('   ')}`)
    out.push(`      Ans: ${'ABCDE'[q.answer]}   ${q.explanation}`)
  })
  return out.join('\n')
}

interface Row {
  topic: string
  diff: string
  calls: number
  questions: number
  failures: number
  avgMs: number
  maxMs: number
  hist: number[]
  dupRate: number
  longestKeyRate: number
  dist?: number[]
  timeFail: boolean
}

const rows: Row[] = []
let totalFailures = 0
const t00 = Date.now()
const OUTCOME_NAMES = ['only I', 'only II', 'either', 'neither', 'both']

function runLocal(): void {
for (const topic of TOPICS) {
  const gen = REASONING_WITH_PROOF[topic]
  const setSize = SET_SIZE[topic]
  for (const diff of DIFFS) {
    const hist = [0, 0, 0, 0, 0]
    const dist = [0, 0, 0, 0, 0]
    const stems = new Map<string, number>()
    const msList: number[] = []
    let questions = 0
    let failures = 0
    let longest = 0
    const failMsgs: string[] = []
    const counts = setSize ? [setSize, 1, 3, 7, setSize, 12] : [1, 1, 3, 2, 1, 4]
    for (let seed = 1; seed <= SEEDS; seed++) {
      const count = counts[seed % counts.length]
      const rng = createRng(seed * 7919 + TOPICS.indexOf(topic) * 131 + (diff === 'hard' ? 17 : 0))
      try {
        // CPU time of this process (immune to scheduler contention from other processes on the machine)
        const c0 = process.cpuUsage()
        const res = gen(rng, diff, count)
        const c1 = process.cpuUsage(c0)
        const ms = (c1.user + c1.system) / 1000
        msList.push(ms)
        check(res.groups.length === res.proofs.length, 'groups/proofs length mismatch')
        const total = res.groups.reduce((s, g) => s + g.questions.length, 0)
        check(total === count, `generated ${total} questions, requested ${count}`)
        if (setSize) {
          const want = splitCountH(count, setSize)
          check(JSON.stringify(res.groups.map((g) => g.questions.length)) === JSON.stringify(want), `group sizes ${res.groups.map((g) => g.questions.length)} != ${want}`)
          check(res.groups.every((g) => g.stimulus), 'set groups need a stimulus')
        } else {
          check(res.groups.every((g) => g.questions.length === 1 && !g.stimulus), 'single-question topics must return one-question groups without stimulus')
        }
        res.groups.forEach((g, gi) => {
          assertGroup(g, `${topic}/${diff}/seed${seed}/g${gi}`)
          const texts: string[] = []
          if (g.stimulus) for (const p of g.stimulus.parts) if (p.kind === 'text') texts.push(...p.paragraphs)
          for (const q of g.questions) {
            check(q.topic === topic, `question topic ${q.topic} != ${topic}`)
            texts.push(q.stem, q.explanation, ...q.options)
          }
          const bad = texts.flatMap(badChars)
          check(bad.length === 0, `characters outside Latin-1/allowed set: ${[...new Set(bad)].join(' ')}`)
          for (const q of g.questions) {
            questions++
            hist[q.answer]++
            const key = norm(q.stem + '|' + q.options.join('|') + (g.stimulus ? JSON.stringify(g.stimulus.parts) : ''))
            stems.set(key, (stems.get(key) ?? 0) + 1)
            const lens = q.options.map((o) => o.length)
            if (lens[q.answer] === Math.max(...lens) && lens.filter((l) => l === lens[q.answer]).length === 1) longest++
          }
          verifyConsistency(topic, g)
          verifyGroupProof(topic, g, res.proofs[gi], dist)
        })
      } catch (e) {
        failures++
        if (failMsgs.length < 4) failMsgs.push(`seed ${seed} (count ${count}): ${(e as Error).message}${(e as Error).name === "TypeError" ? " " + (e as Error).stack : ""}`)
      }
    }
    totalFailures += failures
    const avg = msList.reduce((a, b) => a + b, 0) / Math.max(1, msList.length)
    const max = Math.max(0, ...msList)
    const dups = [...stems.values()].reduce((s, c) => s + (c - 1), 0)
    const timeFail = avg > 150 || max > 2000
    if (timeFail) totalFailures++
    rows.push({
      topic, diff, calls: msList.length, questions, failures, avgMs: avg, maxMs: max, hist, dupRate: questions ? dups / questions : 0,
      longestKeyRate: questions ? longest / questions : 0, dist: topic === 'syllogism' || topic === 'inequality' ? dist : undefined, timeFail,
    })
    if (!QUIET || failures || timeFail) {
      console.log(`${failures || timeFail ? 'FAIL' : 'ok  '} ${topic.padEnd(20)} ${diff.padEnd(6)} calls=${msList.length} q=${questions} fail=${failures} avg=${avg.toFixed(1)}ms max=${max.toFixed(0)}ms`)
    }
    for (const m of failMsgs) console.log(`      ! ${m}`)
    if (!NO_SAMPLES) {
      for (const sd of [1, 2]) {
        const rng = createRng(1000 + sd * 31 + TOPICS.indexOf(topic))
        const res = gen(rng, diff, setSize ? setSize : 3)
        console.log(`--- sample ${sd}: ${topic} (${diff}) ---`)
        for (const g of res.groups.slice(0, 1)) console.log(renderGroup(g))
        if (!setSize) for (const g of res.groups.slice(1)) console.log(renderGroup(g))
      }
    }
  }
}
}

function printSummary(allRows: Row[]): void {
  console.log('\n==================== SUMMARY ====================')
  console.log('topic                diff   calls  quest  fail  avg ms  max ms  A  B  C  D  E   dupStem  longestKey')
  for (const r of allRows) {
    const h = r.hist.map((x) => String(x).padStart(3)).join('')
    console.log(
      `${r.topic.padEnd(20)} ${r.diff.padEnd(6)} ${String(r.calls).padStart(5)}  ${String(r.questions).padStart(5)} ${String(r.failures).padStart(5)} ${r.avgMs.toFixed(1).padStart(7)} ${r.maxMs.toFixed(0).padStart(7)} ${h}  ${(r.dupRate * 100).toFixed(1).padStart(6)}%  ${(r.longestKeyRate * 100).toFixed(0).padStart(5)}%${r.timeFail ? '  TIME-FAIL' : ''}`,
    )
  }
  for (const r of allRows) {
    if (r.dist) console.log(`outcome distribution ${r.topic}/${r.diff}: ${r.dist.map((c, i) => `${OUTCOME_NAMES[i]}=${c}`).join(', ')}`)
  }
}

const IS_CHILD = argv.includes('--child')
const PARENT = !TOPIC_FILTER && !IS_CHILD && !argv.includes('--serial')
const NL = String.fromCharCode(10)

async function main(): Promise<void> {
  if (PARENT) {
    const { spawn } = await import('node:child_process')
    const os = await import('node:os')
    const pass = argv.filter((x, i) => x !== '--child' && !(argv[i - 1] === '--topic'))
    const outputs = new Map<string, string>()
    const allRows: Row[] = []
    let failures = 0
    const queue = [...TOPICS]
    const worker = async (): Promise<void> => {
      for (;;) {
        const t = queue.shift()
        if (!t) return
        await new Promise<void>((resolve) => {
          const child = spawn(process.execPath, [...process.execArgv, process.argv[1], ...pass, '--topic', t, '--child'], { stdio: ['ignore', 'pipe', 'inherit'] })
          let buf = ''
          child.stdout.on('data', (d: Buffer) => {
            buf += d.toString()
          })
          child.on('close', () => {
            const lines = buf.split(NL)
            const rowsLine = lines.find((l) => l.startsWith('@@ROWS '))
            const totalLine = lines.find((l) => l.startsWith('@@TOTAL '))
            if (rowsLine) allRows.push(...(JSON.parse(rowsLine.slice(7)) as Row[]))
            failures += totalLine ? Number(totalLine.slice(8)) : 1
            if (!totalLine) console.error(`FAIL ${t}: worker crashed or produced no result`)
            outputs.set(t, lines.filter((l) => !l.startsWith('@@')).join(NL))
            console.error(`[done] ${t}`)
            resolve()
          })
        })
      }
    }
    const nWorkers = Math.max(1, Math.min(4, Math.floor((os.cpus().length || 2) / 2)))
    await Promise.all(Array.from({ length: nWorkers }, () => worker()))
    for (const t of TOPICS) console.log(outputs.get(t) ?? '')
    allRows.sort((x, y) => TOPICS.indexOf(x.topic as ReasoningTopicId) - TOPICS.indexOf(y.topic as ReasoningTopicId) || (x.diff < y.diff ? -1 : 1))
    printSummary(allRows)
    console.log(`${NL}Total failures: ${failures}   (elapsed ${((Date.now() - t00) / 1000).toFixed(0)}s)`)
    if (failures > 0) process.exit(1)
    return
  }
  runLocal()
  if (IS_CHILD) {
    console.log(`@@ROWS ${JSON.stringify(rows)}`)
    console.log(`@@TOTAL ${totalFailures}`)
    return
  }
  printSummary(rows)
  console.log(`${NL}Total failures: ${totalFailures}   (elapsed ${((Date.now() - t00) / 1000).toFixed(0)}s)`)
  if (totalFailures > 0) process.exit(1)
}

void main()
