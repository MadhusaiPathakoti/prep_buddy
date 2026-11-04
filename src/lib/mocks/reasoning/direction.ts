// Direction & distance: coordinate walks with turns; answers computed from coordinates.
import type { Rng } from '../rng'
import type { Group, MockDifficulty, QuestionDraft } from '../types'
import { pickGenderedNames, pickNames, placeCorrect, splitCount, type WithProof } from './common'

export type Turn = 'L' | 'R' | 'U' | 'N' | 'E' | 'S' | 'W'
export interface Leg {
  turn: Turn
  d: number
}
export interface Walker {
  legs: Leg[]
}
export type AskKind = 'dirFromStart' | 'dist' | 'startFromEnd' | 'dirBFromA' | 'distAB'
export interface DirectionProof {
  walkers: Walker[]
  ask: AskKind
  unit: 'm' | 'km'
  answerText: string
  /** 'dirs' options are compass names; 'dist' options are numbers. */
  answer: number
}

const HEADS: [number, number][] = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
]
const HEAD_NAMES = ['North', 'East', 'South', 'West']
export const DIR8 = ['North', 'North-East', 'East', 'South-East', 'South', 'South-West', 'West', 'North-West']

export function compass(dx: number, dy: number): string | null {
  if (dx === 0 && dy === 0) return null
  if (dx === 0) return dy > 0 ? 'North' : 'South'
  if (dy === 0) return dx > 0 ? 'East' : 'West'
  if (Math.abs(dx) !== Math.abs(dy)) return null
  return `${dy > 0 ? 'North' : 'South'}-${dx > 0 ? 'East' : 'West'}`
}

export function walk(w: Walker): { pts: [number, number][]; end: [number, number] } {
  let h = 0
  let x = 0
  let y = 0
  const pts: [number, number][] = [[0, 0]]
  w.legs.forEach((l, i) => {
    if (i === 0 || l.turn === 'N' || l.turn === 'E' || l.turn === 'S' || l.turn === 'W') {
      if (l.turn === 'N' || l.turn === 'E' || l.turn === 'S' || l.turn === 'W') h = 'NESW'.indexOf(l.turn)
    } else if (l.turn === 'L') h = (h + 3) % 4
    else if (l.turn === 'R') h = (h + 1) % 4
    else h = (h + 2) % 4
    x += HEADS[h][0] * l.d
    y += HEADS[h][1] * l.d
    pts.push([x, y])
  })
  return { pts, end: [x, y] }
}

const isTriple = (a: number, b: number): number | null => {
  const c = Math.round(Math.sqrt(a * a + b * b))
  return c * c === a * a + b * b ? c : null
}

function randLegs(rng: Rng, n: number, hard: boolean): Leg[] {
  const dists = hard ? [2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 16, 20] : [2, 3, 4, 5, 6, 8, 10, 12, 15]
  const legs: Leg[] = []
  for (let i = 0; i < n; i++) {
    let turn: Turn
    if (i === 0) turn = rng.pick<Turn>(['N', 'E', 'S', 'W'])
    else {
      const r = rng.next()
      if (hard && r < 0.12) turn = 'U'
      else if (hard && r < 0.28) turn = rng.pick<Turn>(['N', 'E', 'S', 'W'])
      else turn = rng.chance(0.5) ? 'L' : 'R'
    }
    legs.push({ turn, d: rng.pick(dists) })
  }
  return legs
}

function legText(l: Leg, i: number, unit: string, who: string, pron: string, rng: Rng): string {
  const d = `${l.d} ${unit}`
  if (i === 0) {
    const name = HEAD_NAMES['NESW'.indexOf(l.turn)]
    return rng.pick([`${who} walks ${d} towards ${name}.`, `${who} starts from a point and walks ${d} towards ${name}.`])
  }
  switch (l.turn) {
    case 'L':
      return rng.pick([`Then ${pron} turns left and walks ${d}.`, `Then ${pron} takes a left turn and walks ${d}.`, `After that, ${pron} turns left and covers ${d}.`])
    case 'R':
      return rng.pick([`Then ${pron} turns right and walks ${d}.`, `Then ${pron} takes a right turn and walks ${d}.`, `After that, ${pron} turns right and covers ${d}.`])
    case 'U':
      return `Then ${pron} takes a U-turn and walks ${d}.`
    default:
      return `Then ${pron} walks ${d} towards ${HEAD_NAMES['NESW'.indexOf(l.turn)]}.`
  }
}

function explainWalk(w: Walker, who: string, unit: string): string {
  const { pts } = walk(w)
  const pos = pts.map((p) => `(${p[0]}, ${p[1]})`)
  return `${who}: start (0, 0) -> ${pos.slice(1).join(' -> ')} (taking East as +x and North as +y, in ${unit}).`
}

function dirOptions(rng: Rng, correct: string): { options: string[]; answer: number } {
  const idx = DIR8.indexOf(correct)
  const near = [DIR8[(idx + 1) % 8], DIR8[(idx + 7) % 8], DIR8[(idx + 4) % 8]]
  const others = DIR8.filter((d) => d !== correct && !near.includes(d))
  const pool = [...rng.shuffle(near).slice(0, rng.chance(0.5) ? 3 : 2), ...rng.shuffle(others)]
  const chosen = [...new Set(pool)].slice(0, 4)
  const { items, answer } = placeCorrect(rng, correct, chosen)
  return { options: items, answer }
}

function distOptions(rng: Rng, correct: number, dx: number, dy: number, unit: string): { options: string[]; answer: number } | null {
  const cand = new Set<number>()
  cand.add(Math.abs(dx) + Math.abs(dy))
  cand.add(Math.abs(Math.abs(dx) - Math.abs(dy)))
  cand.add(Math.max(Math.abs(dx), Math.abs(dy)))
  for (const k of [1, 2, 3, 4, 5, 6, -1, -2, -3]) cand.add(correct + k)
  cand.add(correct * 2)
  cand.delete(correct)
  const pool = [...cand].filter((v) => v > 0)
  if (pool.length < 4) return null
  const picked = rng.sample(pool, 4)
  const { items, answer } = placeCorrect(rng, correct, picked)
  return { options: items.map((v) => `${v} ${unit}`), answer }
}

function build(rng: Rng, difficulty: MockDifficulty): { q: QuestionDraft; proof: DirectionProof } {
  const hard = difficulty === 'hard'
  for (let attempt = 0; attempt < 20000; attempt++) {
    const unit: 'm' | 'km' = rng.chance(0.5) ? 'm' : 'km'
    const ask: AskKind = hard
      ? rng.pick<AskKind>(['startFromEnd', 'dirBFromA', 'dirBFromA', 'distAB', 'dist', 'dirFromStart'])
      : rng.pick<AskKind>(['dirFromStart', 'dist', 'startFromEnd', 'dist'])
    const two = ask === 'dirBFromA' || ask === 'distAB'
    const nameStyle = rng.chance(0.4)
    const walkers: Walker[] = []
    const legCounts = two ? [rng.int(3, 4), rng.int(3, 4)] : [hard ? rng.int(5, 6) : rng.int(3, 4)]
    for (const nl of legCounts) walkers.push({ legs: randLegs(rng, nl, hard) })
    const ends = walkers.map((w) => walk(w).end)
    let dx: number
    let dy: number
    if (two) {
      dx = ends[1][0] - ends[0][0]
      dy = ends[1][1] - ends[0][1]
    } else {
      dx = ends[0][0]
      dy = ends[0][1]
    }
    if (dx === 0 && dy === 0) continue
    let answerText: string
    let built: { options: string[]; answer: number } | null
    if (ask === 'dist' || ask === 'distAB') {
      const c = isTriple(Math.abs(dx), Math.abs(dy))
      if (c === null) continue
      if (hard && (dx === 0 || dy === 0)) continue
      if (!hard && rng.chance(0.5) && (dx === 0 || dy === 0)) continue
      if (c > 40) continue
      answerText = `${c} ${unit}`
      built = distOptions(rng, c, dx, dy, unit)
    } else {
      let cdx = dx
      let cdy = dy
      if (ask === 'startFromEnd') {
        cdx = -dx
        cdy = -dy
      }
      const nm = compass(cdx, cdy)
      if (!nm) continue
      if (hard && (dx === 0 || dy === 0) && rng.chance(0.7)) continue
      answerText = nm
      built = dirOptions(rng, nm)
    }
    if (!built) continue
    // names
    let names: string[]
    let prons: string[]
    if (nameStyle) {
      const gs = walkers.map(() => (rng.chance(0.5) ? 1 : 0))
      names = pickGenderedNames(rng, gs)
      prons = walkers.length > 1 ? names : gs.map((g) => (g === 1 ? 'he' : 'she'))
    } else {
      names = pickNames(rng, walkers.length, 'letters')
      prons = walkers.length > 1 ? names : walkers.map(() => 'he')
    }
    const parts: string[] = []
    if (two) {
      parts.push(`${names[0]} and ${names[1]} start from the same point.`)
      walkers.forEach((w, wi) => {
        w.legs.forEach((l, i) => parts.push(legText(l, i, unit, names[wi], prons[wi], rng).replace('starts from a point and walks', 'walks')))
      })
    } else {
      walkers[0].legs.forEach((l, i) => parts.push(legText(l, i, unit, names[0], prons[0], rng)))
    }
    let question: string
    switch (ask) {
      case 'dirFromStart':
        question = `In which direction is ${names[0]} now with respect to the starting point?`
        break
      case 'startFromEnd':
        question = `In which direction is the starting point with respect to ${names[0]}'s present position?`
        break
      case 'dist':
        question = `What is the shortest distance between ${names[0]}'s final position and the starting point?`
        break
      case 'dirBFromA':
        question = `In which direction is ${names[1]} with respect to ${names[0]} now?`
        break
      case 'distAB':
        question = `What is the shortest distance between the final positions of ${names[0]} and ${names[1]}?`
        break
    }
    // multi-person: the second walker's legs read "Then he ..." — prefix persons clearly
    const stem = `${parts.join(' ')} ${question}`
    const explanation = `${walkers.map((w, i) => explainWalk(w, names[i], unit)).join(' ')} ${two ? `Position of ${names[1]} relative to ${names[0]}: (${dx}, ${dy}).` : `Final position relative to the start: (${dx}, ${dy}).`} Answer: ${answerText}.`
    const q: QuestionDraft = { topic: 'direction-distance', stem, options: built.options, answer: built.answer, explanation }
    return { q, proof: { walkers, ask, unit, answerText, answer: built.answer } }
  }
  throw new Error('direction-distance: generation failed')
}

export function generateDirectionWithProof(rng: Rng, difficulty: MockDifficulty, count: number): WithProof<DirectionProof> {
  const groups: Group[] = []
  const proofs: DirectionProof[] = []
  for (const _k of splitCount(count, 1)) {
    void _k
    const { q, proof } = build(rng, difficulty)
    groups.push({ questions: [q] })
    proofs.push(proof)
  }
  return { groups, proofs }
}
