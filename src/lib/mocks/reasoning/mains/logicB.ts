// SBI PO Mains-level Reasoning generators (part B): direction-distance, coding-decoding, sentence-coding, order-ranking,
// alphanumeric-series and reasoning-misc (input-output machines + data sufficiency).
//
// Every key is computed from an explicit model and cross-checked by a second method (re-simulation, exhaustive
// enumeration of all consistent worlds, ...). Each generator also returns a "proof" object describing the model so the
// verification script (scripts/verify-mains-rlogicB.ts) can recompute the key independently.
import type { Rng } from '../../rng'
import type { Group, MockDifficulty, QuestionDraft, ReasoningTopicId, TopicGenerator } from '../../types'
import { answerLine } from '../../options'
import { ensure, need, Reject } from '../../quant/util'
import { DIRECTIONS, ordinalNum, pickGenderedNames, pickNames, splitCount } from '../common'
import { allDictionaries } from '../sentenceCoding'

export interface Proofed<P> {
  groups: Group[]
  proofs: P[]
}

// ============================================================================================================ helpers
const TOPIC_DIR: ReasoningTopicId = 'direction-distance'

/** Runs `f` until it stops throwing Reject (bounded). */
function retry<T>(max: number, what: string, f: () => T): T {
  for (let i = 0; i < max; i++) {
    try {
      return f()
    } catch (e) {
      if (!(e instanceof Reject)) throw e
    }
  }
  throw new Error(`${what}: generation failed after ${max} attempts`)
}

interface Laid {
  options: string[]
  answer: number
}

/**
 * Lays out the key at a uniformly random position among 5 options. `traps` are listed in priority order: the first two
 * distinct ones are always used, the rest are shuffled; `filler` tops up when fewer than 4 distinct wrong options exist.
 */
function layout(rng: Rng, correct: string, traps: string[], filler?: () => string): Laid {
  const seen = new Set<string>([correct.trim().toLowerCase()])
  const uniq: string[] = []
  for (const t of traps) {
    const k = t.trim().toLowerCase()
    if (k === '' || seen.has(k)) continue
    seen.add(k)
    uniq.push(t)
  }
  const wrong = [...uniq.slice(0, 2), ...rng.shuffle(uniq.slice(2))].slice(0, 4)
  let guard = 0
  while (wrong.length < 4 && filler && guard++ < 80) {
    const f = filler()
    const k = f.trim().toLowerCase()
    if (k === '' || seen.has(k)) continue
    seen.add(k)
    wrong.push(f)
  }
  need(wrong.length >= 4, 'not enough distractors')
  const answer = rng.int(0, 4)
  const options = wrong.slice(0, 4)
  options.splice(answer, 0, correct)
  return { options, answer }
}

/** Fixed-layout options (data sufficiency): the key index is given. */
function draft(topic: ReasoningTopicId, stem: string, lay: Laid, steps: string[]): QuestionDraft {
  const line = answerLine({ options: lay.options, answer: lay.answer, answerIsNone: false }, lay.options[lay.answer])
  return { topic, stem, options: lay.options, answer: lay.answer, explanation: `${steps.join('\n')}\n${line}` }
}

const L24 = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split('')
const VOWELS = 'AEIOU'
const isVowelCh = (c: string): boolean => VOWELS.includes(c)

// ============================================================================================================ DIRECTION
type Style = 'r' | 'l' | 'c90' | 'a90' | 'c270' | 'a270' | 'u' | 'd180'
/** Quarter turns clockwise. */
const STYLE_Q: Record<Style, number> = { r: 1, l: 3, c90: 1, a90: 3, c270: 3, a270: 1, u: 2, d180: 2 }
/** What a careless reader makes of it: 270° taken as 90° in the same sense. */
const STYLE_MIS: Record<Style, number> = { ...STYLE_Q, c270: 1, a270: 3 }
const STYLE_PHRASE: Record<Style, string> = {
  r: 'turns right',
  l: 'turns left',
  c90: 'turns 90° clockwise',
  a90: 'turns 90° anticlockwise',
  c270: 'turns 270° clockwise',
  a270: 'turns 270° anticlockwise',
  u: 'takes a U-turn',
  d180: 'turns 180°',
}
const STYLE_EXPL: Record<Style, string> = {
  r: 'turns right (90° clockwise)',
  l: 'turns left (90° anticlockwise)',
  c90: 'turns 90° clockwise (right)',
  a90: 'turns 90° anticlockwise (left)',
  c270: 'turns 270° clockwise (= 90° anticlockwise, i.e. left)',
  a270: 'turns 270° anticlockwise (= 90° clockwise, i.e. right)',
  u: 'takes a U-turn (180°)',
  d180: 'turns 180° (reverses direction)',
}
const STYLE_DEG: Record<Style, number> = { r: 90, l: 270, c90: 90, a90: 270, c270: 270, a270: 90, u: 180, d180: 180 }
const STYLES: Style[] = ['r', 'r', 'r', 'l', 'l', 'l', 'c90', 'a90', 'c270', 'a270', 'u', 'd180']
const HN = ['North', 'East', 'South', 'West']
const DV: [number, number][] = [[0, 1], [1, 0], [0, -1], [-1, 0]]
const DIR8 = ['North', 'North-East', 'East', 'South-East', 'South', 'South-West', 'West', 'North-West']
const DLENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 8, 8, 9, 10, 12, 12, 15, 16, 20, 24]

function compass(dx: number, dy: number): string | null {
  if (dx === 0 && dy === 0) return null
  if (dx === 0) return dy > 0 ? 'North' : 'South'
  if (dy === 0) return dx > 0 ? 'East' : 'West'
  if (Math.abs(dx) !== Math.abs(dy)) return null
  return `${dy > 0 ? 'North' : 'South'}-${dx > 0 ? 'East' : 'West'}`
}

interface DLeg {
  d: number
  /** Absolute heading of the first leg (0 = North ... 3 = West); null for later legs. */
  abs: number | null
  style: Style | null
}
interface DWalker {
  name: string
  pron: string
  poss: string
  start: [number, number]
  /** Label of the start point ('' when unnamed). */
  startLabel: string
  legs: DLeg[]
  /** labels[i] = label of the point reached after leg i ('' when unnamed). */
  labels: string[]
}
export interface DirectionProof {
  unit: string
  walkers: { start: [number, number]; legs: { abs: number | null; style: string | null; d: number }[]; shadow?: { time: 'morning' | 'evening'; side: 'left' | 'right' } }[]
  ask: { kind: 'dist' | 'dir'; a: [number, number]; b: [number, number] }
  options: string[]
  answer: number
}

function simulate(start: [number, number], legs: DLeg[], mistake: boolean): [number, number][] {
  const pts: [number, number][] = [[start[0], start[1]]]
  let h = 0
  let x = start[0]
  let y = start[1]
  legs.forEach((l, i) => {
    h = i === 0 ? (l.abs as number) : (h + (mistake ? STYLE_MIS : STYLE_Q)[l.style as Style]) % 4
    x += DV[h][0] * l.d
    y += DV[h][1] * l.d
    pts.push([x, y])
  })
  return pts
}

/** Second method: accumulate the turning angle in degrees and look the heading vector up by angle. */
function simulateDeg(start: [number, number], legs: DLeg[]): [number, number] {
  const vec: Record<number, [number, number]> = { 0: [0, 1], 90: [1, 0], 180: [0, -1], 270: [-1, 0] }
  let ang = 0
  let x = start[0]
  let y = start[1]
  legs.forEach((l, i) => {
    ang = i === 0 ? (l.abs as number) * 90 : (ang + STYLE_DEG[l.style as Style]) % 360
    x += vec[ang][0] * l.d
    y += vec[ang][1] * l.d
  })
  return [x, y]
}

/** Clean distance text for a displacement, or null when it is not a Pythagorean triple / axis / diagonal. */
function distStr(dx: number, dy: number, u: string): string | null {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax === 0 && ay === 0) return null
  if (ax === 0 || ay === 0) return `${ax + ay} ${u}`
  if (ax === ay) return `${ax}√2 ${u}`
  const c = Math.round(Math.sqrt(ax * ax + ay * ay))
  return c * c === ax * ax + ay * ay ? `${c} ${u}` : null
}

interface DPt {
  label: string
  name: string
  x: number
  y: number
  mx: number
  my: number
  w: number
  i: number
}

function buildDirection(rng: Rng): { q: QuestionDraft; proof: DirectionProof } {
  return retry(600, 'direction-distance', () => {
    const unit = rng.chance(0.5) ? 'km' : 'm'
    const scen = rng.pick(['chain', 'chain', 'same', 'diff', 'shadow'] as const)
    const labelPool = rng.shuffle(L24)
    const takeLabel = (): string => labelPool.pop() as string
    const mkLegs = (n: number, abs0: number): DLeg[] => {
      const legs: DLeg[] = []
      for (let i = 0; i < n; i++) legs.push({ d: rng.pick(DLENS), abs: i === 0 ? abs0 : null, style: i === 0 ? null : rng.pick(STYLES) })
      return legs
    }
    const walkers: DWalker[] = []
    let shadow: { time: 'morning' | 'evening'; side: 'left' | 'right' } | undefined
    let offsetNote = ''
    if (scen === 'chain' || scen === 'shadow') {
      const g = rng.int(0, 1)
      const nm = pickGenderedNames(rng, [g])[0]
      let abs0 = rng.int(0, 3)
      if (scen === 'shadow') {
        shadow = { time: rng.pick(['morning', 'evening'] as const), side: rng.pick(['left', 'right'] as const) }
        // morning: shadow falls West; evening: shadow falls East. Left of a person facing h is heading (h+3)%4, right is (h+1)%4.
        const shadowDir = shadow.time === 'morning' ? 3 : 1
        abs0 = shadow.side === 'left' ? (shadowDir + 1) % 4 : (shadowDir + 3) % 4
      }
      const n = scen === 'chain' ? rng.int(7, 9) : rng.int(6, 7)
      const legs = mkLegs(n, abs0)
      const labels = legs.map(() => '')
      const startLabel = takeLabel()
      if (scen === 'chain') legs.forEach((_l, i) => (labels[i] = takeLabel()))
      else labels[n - 1] = takeLabel()
      walkers.push({ name: nm, pron: g ? 'he' : 'she', poss: g ? 'his' : 'her', start: [0, 0], startLabel, legs, labels })
    } else {
      const gs = [rng.int(0, 1), rng.int(0, 1)]
      const names = pickGenderedNames(rng, gs)
      const pLabel = takeLabel()
      let startB: [number, number] = [0, 0]
      let qLabel = pLabel
      if (scen === 'diff') {
        qLabel = takeLabel()
        const hd = rng.int(0, 3)
        const k = rng.pick([6, 8, 9, 10, 12, 15])
        startB = [DV[hd][0] * k, DV[hd][1] * k]
        offsetNote = `Point ${qLabel} is ${k} ${unit} to the ${HN[hd]} of point ${pLabel}. `
      }
      const counts: [number, number] = scen === 'same' ? rng.pick([[4, 4], [4, 5], [5, 4], [3, 4]] as [number, number][]) : rng.pick([[3, 4], [4, 4], [4, 3]] as [number, number][])
      for (let wi = 0; wi < 2; wi++) {
        const legs = mkLegs(counts[wi], rng.int(0, 3))
        const labels = legs.map(() => takeLabel())
        walkers.push({ name: names[wi], pron: gs[wi] ? 'he' : 'she', poss: gs[wi] ? 'his' : 'her', start: wi === 0 ? [0, 0] : startB, startLabel: wi === 0 ? pLabel : qLabel, legs, labels })
      }
    }
    // ---- points
    const pts: DPt[] = []
    walkers.forEach((w, wi) => {
      const real = simulate(w.start, w.legs, false)
      const mis = simulate(w.start, w.legs, true)
      real.forEach((p, i) => {
        const label = i === 0 ? w.startLabel : w.labels[i - 1]
        if (wi === 1 && i === 0 && scen === 'same') return
        const name = label !== '' ? `point ${label}` : i === 0 ? 'the starting point' : `${w.name}'s position after leg ${i}`
        pts.push({ label, name, x: p[0], y: p[1], mx: mis[i][0], my: mis[i][1], w: wi, i })
      })
      // independent second computation of the final point
      const fin = simulateDeg(w.start, w.legs)
      ensure(fin[0] === real[real.length - 1][0] && fin[1] === real[real.length - 1][1], 'direction: angle-sum walk disagrees with heading walk')
    })
    const kind = rng.pick(['dist', 'dir'] as const)
    // candidate pairs
    const named = pts.filter((p) => p.label !== '')
    const cands: { a: DPt; b: DPt; score: number }[] = []
    for (const a of named) {
      for (const b of named) {
        if (a === b) continue
        if (a.w === b.w && Math.abs(a.i - b.i) < 2) continue
        const dx = a.x - b.x
        const dy = a.y - b.y
        if (kind === 'dist') {
          const ax = Math.abs(dx)
          const ay = Math.abs(dy)
          if (ax === 0 || ay === 0) continue
          const s = distStr(dx, dy, unit)
          if (s === null) continue
          if (ax === ay && !rng.chance(0.3)) continue
          if (a.label > b.label) continue // each unordered pair once
          cands.push({ a, b, score: (a.w !== b.w ? 2 : 0) + (a.w === b.w && Math.abs(a.i - b.i) >= 3 ? 1 : 0) })
        } else {
          if (compass(dx, dy) === null) continue
          cands.push({ a, b, score: (a.w !== b.w ? 2 : 0) + (a.w === b.w && Math.abs(a.i - b.i) >= 3 ? 1 : 0) })
        }
      }
    }
    need(cands.length > 0, 'no pair')
    const best = Math.max(...cands.map((c) => c.score))
    const pool = cands.filter((c) => c.score === best)
    const pick = rng.pick(pool)
    const { a, b } = pick
    const dx = a.x - b.x
    const dy = a.y - b.y
    const mdx = a.mx - b.mx
    const mdy = a.my - b.my
    // ---- story
    const parts: string[] = []
    if (scen === 'same') {
      parts.push(`${walkers[0].name} and ${walkers[1].name} start walking simultaneously from the same point ${walkers[0].startLabel}.`)
    } else if (scen === 'diff') {
      parts.push(`${offsetNote}${walkers[0].name} starts walking from point ${walkers[0].startLabel} and ${walkers[1].name} from point ${walkers[1].startLabel}, both at the same time.`)
    } else if (scen === 'shadow' && shadow) {
      const w0 = walkers[0]
      parts.push(`One ${shadow.time === 'morning' ? 'morning, just after sunrise' : 'evening, just before sunset'}, ${w0.name} stands at point ${w0.startLabel} with ${w0.poss} shadow falling to ${w0.poss} ${shadow.side}.`)
    }
    walkers.forEach((w, wi) => {
      const who = scen === 'chain' || scen === 'shadow' ? w.pron : w.name
      w.legs.forEach((l, i) => {
        const to = w.labels[i] !== '' ? ` to reach point ${w.labels[i]}` : ''
        const from = i === 0 ? w.startLabel : w.labels[i - 1]
        if (i === 0) {
          if (scen === 'shadow') parts.push(`${cap(w.pron)} walks ${l.d} ${unit} straight ahead${to}.`)
          else if (scen === 'chain') parts.push(`Starting from point ${w.startLabel}, ${w.name} walks ${l.d} ${unit} towards the ${HN[l.abs as number]}${to}.`)
          else parts.push(`${w.name} walks ${l.d} ${unit} towards the ${HN[l.abs as number]}${to}.`)
        } else {
          const lead = from !== '' ? `From point ${from}, ${who}` : `Then ${who}`
          parts.push(`${lead} ${STYLE_PHRASE[l.style as Style]} and walks ${l.d} ${unit}${to}.`)
        }
      })
      void wi
    })
    const stem = `${parts.join(' ')} ${kind === 'dist' ? `What is the shortest distance between ${a.name} and ${b.name}?` : `In which direction is ${a.name} with respect to ${b.name}?`}`
    // ---- answer + traps
    let correct: string
    const traps: string[] = []
    if (kind === 'dist') {
      correct = distStr(dx, dy, unit) as string
      const ax = Math.abs(dx)
      const ay = Math.abs(dy)
      const ms = distStr(mdx, mdy, unit)
      if (ms) traps.push(ms)
      traps.push(`${ax + ay} ${unit}`, `${Math.abs(ax - ay)} ${unit}`, `${Math.max(ax, ay)} ${unit}`)
      const cNum = ax === ay ? ax : Math.round(Math.sqrt(ax * ax + ay * ay))
      if (ax === ay) traps.push(`${ax} ${unit}`, `${2 * ax} ${unit}`, `${ax + 1}√2 ${unit}`, `${Math.max(1, ax - 1)}√2 ${unit}`)
      else traps.push(`${cNum + 1} ${unit}`, `${cNum - 1} ${unit}`, `${cNum + 2} ${unit}`, `${cNum - 2} ${unit}`)
    } else {
      correct = compass(dx, dy) as string
      const idx = DIR8.indexOf(correct)
      traps.push(DIR8[(idx + 4) % 8])
      const ms = compass(mdx, mdy)
      if (ms) traps.push(ms)
      traps.push(DIR8[(idx + 1) % 8], DIR8[(idx + 7) % 8], DIR8[(idx + 2) % 8], DIR8[(idx + 6) % 8])
    }
    const lay = layout(rng, correct, traps, () => (kind === 'dir' ? rng.pick(DIR8) : `${rng.int(3, 40)} ${unit}`))
    // ---- explanation
    const steps: string[] = [`Take East as +x and North as +y (all lengths in ${unit}).`]
    if (shadow) {
      const sd = shadow.time === 'morning' ? 'West' : 'East'
      const faced = HN[(walkers[0].legs[0].abs as number) % 4]
      steps.push(`In the ${shadow.time} the sun is in the ${shadow.time === 'morning' ? 'East' : 'West'}, so the shadow falls towards the ${sd}. The shadow is on ${walkers[0].poss} ${shadow.side}, so the ${sd} is on ${walkers[0].poss} ${shadow.side} ⇒ ${walkers[0].pron} faces ${faced}.`)
    }
    const nameOfPt = (wi: number, i: number): string => {
      const w = walkers[wi]
      const lb = i === 0 ? w.startLabel : w.labels[i - 1]
      return lb !== '' ? lb : i === 0 ? 'start' : `after leg ${i}`
    }
    walkers.forEach((w, wi) => {
      const real = simulate(w.start, w.legs, false)
      steps.push(`${w.name}: ${nameOfPt(wi, 0)} = ${xy(real[0])}.`)
      let h = 0
      w.legs.forEach((l, i) => {
        h = i === 0 ? (l.abs as number) : (h + STYLE_Q[l.style as Style]) % 4
        const how = i === 0 ? `walks ${l.d} ${unit} ${HN[h]}` : `${STYLE_EXPL[l.style as Style]}, now facing ${HN[h]}, and walks ${l.d} ${unit}`
        steps.push(`${nameOfPt(wi, i)} → ${nameOfPt(wi, i + 1)}: ${how} ⇒ ${xy(real[i + 1])}.`)
      })
    })
    steps.push(`${a.label !== '' ? a.label : 'A'} = ${xy([a.x, a.y])} and ${b.label !== '' ? b.label : 'B'} = ${xy([b.x, b.y])} ⇒ displacement from ${b.label} to ${a.label}: dx = ${sg(dx)}, dy = ${sg(dy)}.`)
    if (kind === 'dist') {
      const ax = Math.abs(dx)
      const ay = Math.abs(dy)
      if (ax === ay) steps.push(`Shortest distance = √(${ax}² + ${ay}²) = √(${ax * ax + ay * ay}) = ${ax}√2 ${unit}.`)
      else steps.push(`Shortest distance = √(${ax}² + ${ay}²) = √${ax * ax + ay * ay} = ${correct}.`)
    } else {
      steps.push(`${a.label} is ${dx === 0 ? '' : `${Math.abs(dx)} ${unit} to the ${dx > 0 ? 'East' : 'West'}`}${dx !== 0 && dy !== 0 ? ' and ' : ''}${dy === 0 ? '' : `${Math.abs(dy)} ${unit} to the ${dy > 0 ? 'North' : 'South'}`} of ${b.label} ⇒ ${correct}.`)
    }
    const q = draft(TOPIC_DIR, stem, lay, steps)
    const proof: DirectionProof = {
      unit,
      walkers: walkers.map((w) => ({
        start: w.start,
        legs: w.legs.map((l, i) => ({ abs: scen === 'shadow' && i === 0 ? null : l.abs, style: l.style, d: l.d })),
        ...(scen === 'shadow' && shadow ? { shadow } : {}),
      })),
      ask: { kind, a: [a.x, a.y], b: [b.x, b.y] },
      options: lay.options,
      answer: lay.answer,
    }
    return { q, proof }
  })
}

const sg = (n: number): string => (n < 0 ? `−${-n}` : String(n))
const xy = (p: readonly number[]): string => `(${sg(p[0])}, ${sg(p[1])})`

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function genDirection(rng: Rng, count: number): Proofed<DirectionProof> {
  const groups: Group[] = []
  const proofs: DirectionProof[] = []
  const seen = new Set<string>()
  for (let i = 0; i < count; i++) {
    let r = buildDirection(rng)
    for (let t = 0; t < 10 && seen.has(r.q.stem); t++) r = buildDirection(rng)
    seen.add(r.q.stem)
    groups.push({ questions: [r.q] })
    proofs.push(r.proof)
  }
  return { groups, proofs }
}

// ============================================================================================================ CODING-DECODING
const TOPIC_CODE: ReasoningTopicId = 'coding-decoding'

type LM =
  | { k: 'shift'; s: number }
  | { k: 'pos'; m: number; z?: boolean }
  | { k: 'alt'; a: number; b: number }
  | { k: 'vc'; v: number; c: number }
  | { k: 'mirror' }
  | { k: 'vcyc'; c: number }
  | { k: 'ends'; e: number; m: number }
type PM = 'rev' | 'swapPairs' | 'swapEnds' | 'rotL' | 'rotR' | 'oddEven'
type Stage = { t: 'L'; m: LM } | { t: 'P'; p: PM }
export interface Pipe {
  stages: Stage[]
  /** The whole sequence of steps is applied once more to its own result. */
  twice: boolean
}
const PMS: PM[] = ['rev', 'swapPairs', 'swapEnds', 'rotL', 'rotR', 'oddEven']
const VOW_IDX = [0, 4, 8, 14, 20]
const md26 = (x: number): number => ((x % 26) + 26) % 26

function lmap(m: LM, i: number, n: number, c: number): number {
  switch (m.k) {
    case 'shift':
      return md26(c + m.s)
    case 'pos':
      return md26(c + m.m * (m.z ? i : i + 1))
    case 'alt':
      return md26(c + (i % 2 === 0 ? m.a : m.b))
    case 'vc':
      return md26(c + (VOW_IDX.includes(c) ? m.v : m.c))
    case 'mirror':
      return 25 - c
    case 'vcyc': {
      const k = VOW_IDX.indexOf(c)
      return k >= 0 ? VOW_IDX[(k + 1) % 5] : md26(c + m.c)
    }
    case 'ends':
      return md26(c + (i === 0 || i === n - 1 ? m.e : m.m))
  }
}
function permIdx(p: PM, n: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i)
  switch (p) {
    case 'rev':
      return idx.reverse()
    case 'swapPairs': {
      const o = idx.slice()
      for (let i = 0; i + 1 < n; i += 2) [o[i], o[i + 1]] = [o[i + 1], o[i]]
      return o
    }
    case 'swapEnds': {
      const o = idx.slice()
      ;[o[0], o[n - 1]] = [o[n - 1], o[0]]
      return o
    }
    case 'rotL':
      return [...idx.slice(1), idx[0]]
    case 'rotR':
      return [idx[n - 1], ...idx.slice(0, n - 1)]
    case 'oddEven':
      return [...idx.filter((i) => i % 2 === 0), ...idx.filter((i) => i % 2 === 1)]
  }
}
const permute = (p: PM, a: number[]): number[] => permIdx(p, a.length).map((j) => a[j])
const runStage = (s: Stage, a: number[]): number[] => (s.t === 'L' ? a.map((c, i) => lmap(s.m, i, a.length, c)) : permute(s.p, a))
function runPipe(p: Pipe, a: number[]): number[] {
  let cur = a
  for (let r = 0; r < (p.twice ? 2 : 1); r++) for (const s of p.stages) cur = runStage(s, cur)
  return cur
}
const toNums = (w: string): number[] => w.split('').map((c) => c.charCodeAt(0) - 65)
const toWord = (a: number[]): string => a.map((c) => String.fromCharCode(65 + c)).join('')
const encodeWord = (p: Pipe, w: string): string => toWord(runPipe(p, toNums(w)))

const PERM_CACHE = new Map<string, number[]>()
function permIdxC(p: PM, n: number): number[] {
  const key = p + n
  let v = PERM_CACHE.get(key)
  if (!v) {
    v = permIdx(p, n)
    PERM_CACHE.set(key, v)
  }
  return v
}
/** Value at position j after stages[0..k], evaluated lazily (no allocation). */
function valAt(st: Stage[], k: number, j: number, a: number[]): number {
  if (k < 0) return a[j]
  const s = st[k]
  if (s.t === 'L') return lmap(s.m, j, a.length, valAt(st, k - 1, j, a))
  return valAt(st, k - 1, permIdxC(s.p, a.length)[j], a)
}
/** Does the pipeline map `arr` to `target`? Elements are evaluated lazily with early exit. */
function pipeMatches(p: Pipe, arr: number[], target: number[]): boolean {
  const st = p.twice ? p.stages.concat(p.stages) : p.stages
  if (arr.length !== target.length) return false
  for (let j = 0; j < arr.length; j++) if (valAt(st, st.length - 1, j, arr) !== target[j]) return false
  return true
}

/** Inverse of one stage for words of length n; null when the letter map is not a bijection for that length. */
function invStage(s: Stage, a: number[]): number[] | null {
  const n = a.length
  if (s.t === 'P') {
    const idx = permIdx(s.p, n)
    const out = new Array<number>(n)
    idx.forEach((j, k) => (out[j] = a[k]))
    return out
  }
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const img = new Set<number>()
    let pre = -1
    for (let c = 0; c < 26; c++) {
      const v = lmap(s.m, i, n, c)
      img.add(v)
      if (v === a[i]) pre = c
    }
    if (img.size !== 26 || pre < 0) return null
    out.push(pre)
  }
  return out
}
function decodePipe(p: Pipe, code: number[]): number[] | null {
  let cur: number[] | null = code
  for (let r = 0; r < (p.twice ? 2 : 1); r++) {
    for (let k = p.stages.length - 1; k >= 0 && cur; k--) cur = invStage(p.stages[k], cur)
  }
  return cur
}

const fwd = (s: number): string => `${Math.abs(s)} place${Math.abs(s) === 1 ? '' : 's'} ${s > 0 ? 'forward' : 'backward'}`
const fwd0 = (s: number): string => (s === 0 ? 'is left unchanged' : `is moved ${fwd(s)}`)
function stageText(s: Stage): string {
  if (s.t === 'P') {
    switch (s.p) {
      case 'rev':
        return 'the letters are written in reverse order'
      case 'swapPairs':
        return 'the letters at positions 1 and 2, 3 and 4, 5 and 6, ... are interchanged (an unpaired last letter stays where it is)'
      case 'swapEnds':
        return 'the first and the last letters are interchanged'
      case 'rotL':
        return 'the first letter is moved to the extreme right'
      case 'rotR':
        return 'the last letter is moved to the extreme left'
      case 'oddEven':
        return 'the letters at the odd positions (1st, 3rd, 5th, ...) are written first, followed by the letters at the even positions (2nd, 4th, ...)'
    }
  }
  const m = s.m
  switch (m.k) {
    case 'shift':
      return `each letter is moved ${fwd(m.s)} in the alphabet`
    case 'pos': {
      const a = Math.abs(m.m)
      const by = a === 1 ? 'its position number in the word' : a === 2 ? 'twice its position number in the word' : `${a} times its position number in the word`
      return `each letter is moved ${m.m > 0 ? 'forward' : 'backward'} by ${by} (1st letter by ${a}, 2nd by ${2 * a}, 3rd by ${3 * a}, ...)`
    }
    case 'alt':
      return `each letter at an odd position (1st, 3rd, ...) is moved ${fwd(m.a)} and each letter at an even position (2nd, 4th, ...) is moved ${fwd(m.b)}`
    case 'vc':
      return `each vowel ${fwd0(m.v)} and each consonant ${fwd0(m.c)}`
    case 'mirror':
      return 'each letter is replaced by its opposite letter in the alphabet (A with Z, B with Y, C with X, ...)'
    case 'vcyc':
      return `each vowel is replaced by the next vowel (A→E, E→I, I→O, O→U, U→A) and each consonant is moved ${fwd(m.c)}`
    case 'ends':
      return `the first and the last letters are each moved ${fwd(m.e)} and every other letter is moved ${fwd(m.m)}`
  }
}
const pipeSteps = (p: Pipe): string =>
  p.stages.map((s, i) => `Step ${i + 1}: ${cap(stageText(s))}.`).join('\n') +
  (p.twice ? `\n(The ${p.stages.length} steps above are carried out in order and then carried out once more on the result.)` : '')

function lmCandidates(): LM[] {
  const out: LM[] = []
  for (let s = -8; s <= 8; s++) if (s !== 0) out.push({ k: 'shift', s })
  for (const m of [-3, -2, -1, 1, 2, 3]) out.push({ k: 'pos', m })
  for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) if (a !== b) out.push({ k: 'alt', a, b })
  for (let v = -4; v <= 4; v++) for (let c = -4; c <= 4; c++) if (v !== 0 || c !== 0) out.push({ k: 'vc', v, c })
  out.push({ k: 'mirror' })
  for (let c = -3; c <= 3; c++) out.push({ k: 'vcyc', c })
  for (const e of [-3, -2, -1, 1, 2, 3]) for (let m = -3; m <= 3; m++) if (e !== m) out.push({ k: 'ends', e, m })
  return out
}
const LSTAGES: Stage[] = lmCandidates().map((m) => ({ t: 'L', m }))
const PSTAGES: Stage[] = PMS.map((p) => ({ t: 'P', p }))

/** The rule family used to prove that the worked examples identify the rule: every pipeline shape the generator can emit. */
function pipeFamily(): Pipe[] {
  const out: Pipe[] = []
  for (const s of [...LSTAGES, ...PSTAGES]) out.push({ stages: [s], twice: false })
  for (const a of LSTAGES) for (const b of PSTAGES) out.push({ stages: [a, b], twice: false }, { stages: [b, a], twice: false }, { stages: [a, b, a, b], twice: false }, { stages: [b, a, b, a], twice: false })
  for (const a of PSTAGES) for (const b of PSTAGES) out.push({ stages: [a, b], twice: false })
  return out
}
const PIPE_FAMILY = pipeFamily()

/**
 * True when some pipeline of the family (single steps, any two-step combination, and the two-step mixed shapes repeated twice)
 * reproduces both worked examples yet codes the query differently from the keyed code `ans`.
 */
function familyAmbiguous(a1: number[], t1: number[], a2: number[], t2: number[], q: number[], ans: string): boolean {
  const both = (f: Pipe): boolean => pipeMatches(f, a1, t1) && pipeMatches(f, a2, t2)
  const differs = (f: Pipe): boolean => toWord(runPipe(f, q)) !== ans
  for (const f of PIPE_FAMILY) if (both(f) && differs(f)) return true
  // two letter-map steps: index the second step by the value it must map the first step's first output to
  const byX: Stage[][] = Array.from({ length: 26 }, () => [])
  for (let x = 0; x < 26; x++) for (const b of LSTAGES) if (b.t === 'L' && lmap(b.m, 0, a1.length, x) === t1[0]) byX[x].push(b)
  for (const a of LSTAGES) {
    if (a.t !== 'L') continue
    for (const b of byX[lmap(a.m, 0, a1.length, a1[0])]) {
      const f: Pipe = { stages: [a, b], twice: false }
      if (both(f) && differs(f)) return true
    }
  }
  return false
}

function randLM(rng: Rng): LM {
  const t = rng.pick(['shift', 'pos', 'alt', 'vc', 'vc', 'mirror', 'vcyc', 'ends'] as const)
  const nz = (lo: number, hi: number): number => {
    let v = 0
    while (v === 0) v = rng.int(lo, hi)
    return v
  }
  switch (t) {
    case 'shift':
      return { k: 'shift', s: nz(-5, 5) }
    case 'pos':
      return { k: 'pos', m: rng.pick([-2, -1, 1, 1, 2]) }
    case 'alt': {
      const a = rng.int(-3, 3)
      let b = rng.int(-3, 3)
      if (b === a) b = a === 3 ? -3 : a + 1
      return { k: 'alt', a, b }
    }
    case 'vc': {
      const v = rng.int(-3, 3)
      let c = rng.int(-3, 3)
      if (c === v) c = v === 0 ? 2 : -v
      return { k: 'vc', v, c }
    }
    case 'mirror':
      return { k: 'mirror' }
    case 'vcyc':
      return { k: 'vcyc', c: nz(-3, 3) }
    case 'ends': {
      const e = nz(-3, 3)
      let m = rng.int(-3, 3)
      if (m === e) m = -e
      return { k: 'ends', e, m }
    }
  }
}
const randL = (rng: Rng): Stage => ({ t: 'L', m: randLM(rng) })
const randP = (rng: Rng): Stage => ({ t: 'P', p: rng.pick(PMS) })

const CODE_WORDS = [
  'DOCTOR', 'PATIENT', 'MARKET', 'BRIDGE', 'CASTLE', 'FOREST', 'GARDEN', 'HAMMER', 'ISLAND', 'JUNGLE', 'KITTEN', 'LADDER', 'MIRROR', 'NATION', 'ORANGE', 'PENCIL',
  'SILVER', 'TEMPLE', 'WINDOW', 'YELLOW', 'BASKET', 'CANDLE', 'DINNER', 'ENGINE', 'FABRIC', 'GUITAR', 'HONEST', 'INSECT', 'JACKET', 'LEMONS', 'MONKEY', 'NOODLE',
  'OFFICE', 'PLANET', 'RABBIT', 'SCHOOL', 'TICKET', 'WALLET', 'ARTIST', 'BUTTER', 'CHAIR', 'DANCE', 'EARTH', 'FLAME', 'GRAPE', 'HOUSE', 'JUICE', 'KNIFE', 'LIGHT',
  'MONEY', 'NIGHT', 'OCEAN', 'PAPER', 'QUEEN', 'ROUND', 'STONE', 'TABLE', 'VOICE', 'WATER', 'YOUTH', 'BREAD', 'CLOUD', 'DREAM', 'FIELD', 'GREEN', 'HEART', 'MANGO',
  'PLANT', 'RADIO', 'SMILE', 'TRAIN', 'WORLD', 'MARKETS', 'CAPITAL', 'CHARITY', 'COMPANY', 'COUNTRY', 'CULTURE', 'DEFENCE', 'DIAMOND', 'ECONOMY', 'EVENING',
  'FACTORY', 'FASHION', 'FREEDOM', 'GALLERY', 'GENERAL', 'HARVEST', 'HISTORY', 'HOLIDAY', 'JOURNEY', 'KINGDOM', 'LIBRARY', 'MACHINE', 'MESSAGE', 'MORNING',
  'NETWORK', 'PASSAGE', 'PICTURE', 'PROBLEM', 'RAILWAY', 'SERVICE', 'STUDENT', 'SUPPORT', 'TRAFFIC', 'VILLAGE', 'WEATHER', 'BALANCE', 'BROTHER', 'CLIMATE', 'COMFORT',
]

export type CodingProof =
  | { k: 'rule'; mode: 'enc' | 'dec'; pipe: Pipe; query: string; options: string[]; answer: number }
  | { k: 'example'; pipe: Pipe; examples: [string, string][]; query: string; options: string[]; answer: number }
  | { k: 'mixed'; spec: M3Spec; input: string; options: string[]; answer: number }

const pickWord = (rng: Rng, lo: number, hi: number, not: string[] = []): string => {
  const pool = CODE_WORDS.filter((w) => w.length >= lo && w.length <= hi && !not.includes(w))
  return rng.pick(pool)
}

/** Wrong-rule variants of a pipeline: the answers a student gets from one classic slip. */
function pipeVariants(p: Pipe): Pipe[] {
  const out: Pipe[] = []
  const st = p.stages
  for (let k = 0; k < st.length; k++) {
    if (st.length > 1) out.push({ ...p, stages: st.filter((_, i) => i !== k) })
    const s = st[k]
    if (s.t === 'L') {
      const m = s.m
      let alt: LM | null = null
      if (m.k === 'shift') alt = { k: 'shift', s: -m.s }
      else if (m.k === 'pos') alt = { k: 'pos', m: m.m, z: true }
      else if (m.k === 'alt') alt = { k: 'alt', a: m.b, b: m.a }
      else if (m.k === 'vc') alt = { k: 'vc', v: m.c, c: m.v }
      else if (m.k === 'vcyc') alt = { k: 'vcyc', c: -m.c }
      else if (m.k === 'ends') alt = { k: 'ends', e: m.m, m: m.e }
      if (alt) out.push({ ...p, stages: st.map((x, i) => (i === k ? ({ t: 'L', m: alt as LM } as Stage) : x)) })
      if (m.k === 'pos') out.push({ ...p, stages: st.map((x, i) => (i === k ? ({ t: 'L', m: { k: 'pos', m: -m.m } } as Stage) : x)) })
    } else {
      const alt: PM = s.p === 'rotL' ? 'rotR' : s.p === 'rotR' ? 'rotL' : s.p === 'rev' ? 'swapEnds' : s.p === 'swapEnds' ? 'rev' : s.p === 'swapPairs' ? 'rev' : 'rotL'
      out.push({ ...p, stages: st.map((x, i) => (i === k ? ({ t: 'P', p: alt } as Stage) : x)) })
    }
  }
  for (let k = 0; k + 1 < st.length; k++) {
    const sw = st.slice()
    ;[sw[k], sw[k + 1]] = [sw[k + 1], sw[k]]
    out.push({ ...p, stages: sw })
  }
  if (p.twice) out.push({ ...p, twice: false })
  return out
}

function stageWorking(p: Pipe, word: string): string[] {
  const lines: string[] = []
  let cur = toNums(word)
  const rounds = p.twice ? 2 : 1
  for (let r = 0; r < rounds; r++) {
    p.stages.forEach((s, i) => {
      const next = runStage(s, cur)
      const label = p.twice ? `Round ${r + 1}, Step ${i + 1}` : `Step ${i + 1}`
      if (s.t === 'L') lines.push(`${label}: ${cur.map((c, j) => `${toWord([c])}→${toWord([next[j]])}`).join(', ')} ⇒ ${toWord(next)}`)
      else lines.push(`${label}: ${toWord(cur)} ⇒ ${toWord(next)}`)
      cur = next
    })
  }
  return lines
}

// -------- mixed (letter / digit / symbol) rule-based codes
type CondId = 'VD' | 'CS' | 'DD' | 'SA' | 'CC' | 'VV' | 'DL'
type ActId = 'swap' | 'star' | 'rev' | 'drop' | 'rot' | 'mid'
export interface M3Spec {
  va: number
  co: number
  dk: number
  sym: string
  rules: { cond: CondId; act: ActId }[]
}
const SYMS = ['@', '#', '$', '%', '&']
const CONS = 'BCDFGHJKLMNPQRSTVWXYZ'.split('')
const clsOf = (ch: string): 'V' | 'C' | 'D' | 'S' => (/[0-9]/.test(ch) ? 'D' : /[A-Z]/.test(ch) ? (isVowelCh(ch) ? 'V' : 'C') : 'S')
function m3Match(c: CondId, f: string, l: string): boolean {
  const a = clsOf(f)
  const b = clsOf(l)
  switch (c) {
    case 'VD':
      return a === 'V' && b === 'D'
    case 'CS':
      return a === 'C' && b === 'S'
    case 'DD':
      return a === 'D' && b === 'D'
    case 'SA':
      return a === 'S'
    case 'CC':
      return a === 'C' && b === 'C'
    case 'VV':
      return a === 'V' && b === 'V'
    case 'DL':
      return a === 'D' && (b === 'V' || b === 'C')
  }
}
const COND_TXT: Record<CondId, string> = {
  VD: 'the first element is a vowel and the last element is a digit',
  CS: 'the first element is a consonant and the last element is a symbol',
  DD: 'both the first and the last elements are digits',
  SA: 'the first element is a symbol',
  CC: 'both the first and the last elements are consonants',
  VV: 'both the first and the last elements are vowels',
  DL: 'the first element is a digit and the last element is a letter',
}
function actTxt(a: ActId, sym: string): string {
  switch (a) {
    case 'swap':
      return 'the first and the last elements of the coded string are interchanged'
    case 'star':
      return `both the first and the last elements of the coded string are replaced by '${sym}'`
    case 'rev':
      return 'the coded string is written in reverse order'
    case 'drop':
      return 'the first and the last elements of the coded string are deleted'
    case 'rot':
      return 'the first element of the coded string is moved to the extreme right'
    case 'mid':
      return 'the third and the fourth elements of the coded string are interchanged'
  }
}
function m3Base(spec: M3Spec, ch: string): string {
  const c = clsOf(ch)
  if (c === 'V') return String.fromCharCode(65 + md26(ch.charCodeAt(0) - 65 + spec.va))
  if (c === 'C') return String.fromCharCode(65 + md26(ch.charCodeAt(0) - 65 + spec.co))
  if (c === 'D') return String((Number(ch) + spec.dk) % 10)
  return ch
}
function m3Act(act: ActId, a: string[], sym: string): string[] {
  const n = a.length
  const o = a.slice()
  switch (act) {
    case 'swap':
      ;[o[0], o[n - 1]] = [o[n - 1], o[0]]
      return o
    case 'star':
      o[0] = sym
      o[n - 1] = sym
      return o
    case 'rev':
      return o.reverse()
    case 'drop':
      return o.slice(1, n - 1)
    case 'rot':
      return [...o.slice(1), o[0]]
    case 'mid':
      ;[o[2], o[3]] = [o[3], o[2]]
      return o
  }
}
function m3Encode(spec: M3Spec, input: string, baseSpec: M3Spec = spec): { out: string; ruleIdx: number } {
  const els = input.split('')
  const coded = els.map((c) => m3Base(baseSpec, c))
  const idx = spec.rules.findIndex((r) => m3Match(r.cond, els[0], els[els.length - 1]))
  if (idx < 0) return { out: coded.join(''), ruleIdx: -1 }
  return { out: m3Act(spec.rules[idx].act, coded, spec.sym).join(''), ruleIdx: idx }
}
function m3Sample(rng: Rng, cond: CondId): [string, string] {
  const V = VOWELS.split('')
  const D = '0123456789'.split('')
  const any = (): string => rng.pick([...V, ...CONS, ...D, ...SYMS])
  switch (cond) {
    case 'VD':
      return [rng.pick(V), rng.pick(D)]
    case 'CS':
      return [rng.pick(CONS), rng.pick(SYMS)]
    case 'DD':
      return [rng.pick(D), rng.pick(D)]
    case 'SA':
      return [rng.pick(SYMS), any()]
    case 'CC':
      return [rng.pick(CONS), rng.pick(CONS)]
    case 'VV':
      return [rng.pick(V), rng.pick(V)]
    case 'DL':
      return [rng.pick(D), rng.pick([...V, ...CONS])]
  }
}
const ROMAN = ['i', 'ii', 'iii']

function buildMixed(rng: Rng): { q: QuestionDraft; proof: CodingProof } {
  return retry(300, 'coding-decoding(mixed)', () => {
    const conds = rng.sample(['VD', 'CS', 'DD', 'SA', 'CC', 'VV', 'DL'] as CondId[], 3)
    const acts = rng.sample(['swap', 'star', 'rev', 'drop', 'rot', 'mid'] as ActId[], 3)
    const spec: M3Spec = {
      va: rng.pick([1, 2, -1]),
      co: rng.pick([-1, -2, 1, 2]),
      dk: rng.pick([2, 3, 4, 6, 7]),
      sym: rng.pick(SYMS),
      rules: conds.map((c, i) => ({ cond: c, act: acts[i] })),
    }
    const target = rng.int(0, 2)
    const [f, l] = m3Sample(rng, conds[target])
    const mid: string[] = []
    const pools = ['V', 'C', 'D', 'S', 'C', 'D']
    for (let i = 0; i < 4; i++) {
      const k = rng.pick(pools)
      mid.push(k === 'V' ? rng.pick(VOWELS.split('')) : k === 'C' ? rng.pick(CONS) : k === 'D' ? String(rng.int(0, 9)) : rng.pick(SYMS))
    }
    const input = [f, ...mid, l].join('')
    const { out, ruleIdx } = m3Encode(spec, input)
    need(ruleIdx >= 0, 'no rule matched')
    // second computation: apply the matched action to the raw string first, then code element-wise (the actions commute with the
    // element-wise map; the symbol written by 'star' is never altered by that map)
    const els = input.split('')
    const alt = m3Act(spec.rules[ruleIdx].act, els, spec.sym).map((c) => m3Base(spec, c)).join('')
    ensure(alt === out, 'mixed code: action-then-map disagrees with map-then-action')
    const noAct = els.map((c) => m3Base(spec, c)).join('')
    need(noAct !== out, 'action invisible')
    const traps: string[] = [noAct, m3Act(spec.rules[ruleIdx].act, els, spec.sym).join('')]
    spec.rules.forEach((r, i) => {
      if (i !== ruleIdx) traps.push(m3Act(r.act, noAct.split(''), spec.sym).join(''))
    })
    traps.push(m3Encode(spec, input, { ...spec, va: -spec.va, co: -spec.co }).out)
    traps.push(m3Encode(spec, input, { ...spec, dk: (10 - spec.dk) % 10 }).out)
    const lay = layout(rng, out, traps, () => {
      const o = out.split('')
      const k = rng.int(0, o.length - 1)
      const c = clsOf(o[k])
      o[k] = c === 'D' ? String((Number(o[k]) + rng.int(1, 8)) % 10) : c === 'S' ? rng.pick(SYMS) : String.fromCharCode(65 + md26(o[k].charCodeAt(0) - 65 + rng.int(1, 5)))
      return o.join('')
    })
    const stem =
      `In a certain code, an input string of letters, digits and symbols is converted to its code as follows.\n` +
      `(a) Every vowel is moved ${fwd(spec.va)} in the alphabet, every consonant is moved ${fwd(spec.co)}, every digit is increased by ${spec.dk} (only the last digit of the sum is kept, e.g. 7 + 4 gives 1) and every symbol is left unchanged.\n` +
      `The following conditions are then checked on the ORIGINAL input, in the order given; only the first one that holds is applied to the string obtained in (a). If none holds, the string obtained in (a) is the code.\n` +
      `${spec.rules.map((r, i) => `(${ROMAN[i]}) If ${COND_TXT[r.cond]}, ${actTxt(r.act, spec.sym)}.`).join('\n')}\n` +
      `What is the code for the input '${input}'?`
    const steps = [
      `Rule (a), element by element: ${els.map((c, i) => `${c}→${noAct[i]}`).join(', ')} ⇒ ${noAct}.`,
      `Check the conditions on the original input ${input} (first = ${f}, last = ${l}): ${spec.rules.map((r, i) => `(${ROMAN[i]}) ${m3Match(r.cond, f, l) ? 'holds' : 'does not hold'}`).join('; ')}.`,
      `The first condition that holds is (${ROMAN[ruleIdx]}): ${actTxt(spec.rules[ruleIdx].act, spec.sym)}.`,
      `Applying it to ${noAct} gives ${out}.`,
    ]
    return { q: draft(TOPIC_CODE, stem, lay, steps), proof: { k: 'mixed', spec, input, options: lay.options, answer: lay.answer } }
  })
}

function buildRuleBased(rng: Rng): { q: QuestionDraft; proof: CodingProof } {
  return retry(300, 'coding-decoding(rule)', () => {
    const n4 = rng.chance(0.3)
    const shape = rng.pick(['LPL', 'PLL', 'LLP', 'LPL'])
    const stages: Stage[] = shape.split('').map((c) => (c === 'L' ? randL(rng) : randP(rng)))
    if (n4) stages.push(rng.chance(0.5) ? randP(rng) : randL(rng))
    const twice = !n4 && rng.chance(0.2)
    const pipe: Pipe = { stages: twice ? stages.slice(0, 2) : stages, twice }
    const mode: 'enc' | 'dec' = rng.chance(0.3) ? 'dec' : 'enc'
    const w = pickWord(rng, 6, 7)
    const code = encodeWord(pipe, w)
    need(code !== w, 'identity')
    const rules = pipeSteps(pipe)
    const work = stageWorking(pipe, w)
    ensure(work[work.length - 1].endsWith(`⇒ ${code}`), 'coding: stage replay disagrees')
    let correct: string
    let query: string
    let traps: string[]
    let filler: () => string
    let stem: string
    let steps: string[]
    if (mode === 'enc') {
      correct = code
      query = w
      traps = pipeVariants(pipe).map((v) => encodeWord(v, w))
      filler = () => {
        const o = toNums(code)
        o[rng.int(0, o.length - 1)] = rng.int(0, 25)
        return toWord(o)
      }
      stem = `In a certain code language, a word is converted into its code by the following steps, carried out in the given order:\n${rules}\nWhat is the code for '${w}'?`
      steps = [`Apply the steps in order to ${w}.`, ...work]
    } else {
      const dec = decodePipe(pipe, toNums(code))
      need(dec !== null, 'not invertible')
      ensure(toWord(dec) === w, 'coding: inverse disagrees')
      correct = w
      query = code
      const pool = CODE_WORDS.filter((x) => x.length === w.length && x !== w)
      const wrongWords = rng.shuffle(pool).slice(0, 8)
      for (const x of wrongWords) need(encodeWord(pipe, x) !== code, 'ambiguous decode')
      traps = wrongWords
      filler = () => rng.pick(pool)
      stem = `In a certain code language, a word is converted into its code by the following steps, carried out in the given order:\n${rules}\nWhich of the following words has the code '${code}'?`
      steps = [`Apply the steps to the correct word and compare with the code ${code}:`, ...work, `${w} → ${code}, the given code (no other option produces it).`]
    }
    const lay = layout(rng, correct, traps, filler)
    if (mode === 'dec') for (const o of lay.options) ensure((encodeWord(pipe, o) === code) === (o === correct), 'coding: decode options not unique')
    return { q: draft(TOPIC_CODE, stem, lay, steps), proof: { k: 'rule', mode, pipe, query, options: lay.options, answer: lay.answer } }
  })
}

function buildExample(rng: Rng): { q: QuestionDraft; proof: CodingProof } {
  return retry(400, 'coding-decoding(example)', () => {
    const shape = rng.pick(['LP', 'PL', 'LL', 'LL', 'LPt', 'PLt'])
    const twice = shape.endsWith('t')
    const stages: Stage[] = shape.replace('t', '').split('').map((c) => (c === 'L' ? randL(rng) : randP(rng)))
    const pipe: Pipe = { stages, twice }
    const w1 = pickWord(rng, 6, 7)
    const w2 = pickWord(rng, 6, 7, [w1])
    const w3 = pickWord(rng, 6, 7, [w1, w2])
    const c1 = encodeWord(pipe, w1)
    const c2 = encodeWord(pipe, w2)
    const ans = encodeWord(pipe, w3)
    need(c1 !== w1 && c2 !== w2 && ans !== w3, 'identity')
    // identification: every pipeline of the family that reproduces both examples must give the same code for the query
    const a1 = toNums(w1)
    const a2 = toNums(w2)
    const t1 = toNums(c1)
    const t2 = toNums(c2)
    need(!familyAmbiguous(a1, t1, a2, t2, toNums(w3), ans), 'ambiguous rule')
    const traps = pipeVariants(pipe).map((v) => encodeWord(v, w3))
    const lay = layout(rng, ans, traps, () => {
      const o = toNums(ans)
      o[rng.int(0, o.length - 1)] = rng.int(0, 25)
      return toWord(o)
    })
    const stem = `In a certain code language, '${w1}' is written as '${c1}' and '${w2}' is written as '${c2}'. How is '${w3}' written in that code language?`
    const steps = [
      `Compare ${w1} with ${c1}: the code is produced by ${pipe.stages.length === 1 ? 'one step' : `${pipe.stages.length} steps`}${twice ? ' carried out twice' : ''}.`,
      ...pipeSteps(pipe).split('\n').map((l) => (l.startsWith('Step') ? `Rule found: ${l}` : l)),
      `Check on ${w1}:`,
      ...stageWorking(pipe, w1),
      `Check on ${w2}: ${w2} → ${c2} (the same rule, consistent).`,
      `Apply the rule to ${w3}:`,
      ...stageWorking(pipe, w3),
    ]
    return { q: draft(TOPIC_CODE, stem, lay, steps), proof: { k: 'example', pipe, examples: [[w1, c1], [w2, c2]], query: w3, options: lay.options, answer: lay.answer } }
  })
}

export function genCoding(rng: Rng, count: number): Proofed<CodingProof> {
  const groups: Group[] = []
  const proofs: CodingProof[] = []
  const seen = new Set<string>()
  let order: ('rule' | 'example' | 'mixed')[] = []
  const one = (kind: 'rule' | 'example' | 'mixed') => (kind === 'rule' ? buildRuleBased(rng) : kind === 'example' ? buildExample(rng) : buildMixed(rng))
  for (let i = 0; i < count; i++) {
    if (!order.length) order = rng.shuffle(['rule', 'example', 'mixed', 'rule', 'example'] as const).slice()
    const kind = order.pop() as 'rule' | 'example' | 'mixed'
    let r = one(kind)
    for (let t = 0; t < 8 && seen.has(r.q.stem); t++) r = one(kind)
    seen.add(r.q.stem)
    groups.push({ questions: [r.q] })
    proofs.push(r.proof)
  }
  return { groups, proofs }
}

// ============================================================================================================ SENTENCE-CODING
const TOPIC_SC: ReasoningTopicId = 'sentence-coding'
const joinAnd = (a: (string | number)[]): string => (a.length <= 1 ? String(a[0]) : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)

interface CSent {
  words: string[]
  codes: string[]
}
export interface SentenceProof {
  sentences: CSent[]
  questions: { kind: 'code' | 'word' | 'phrase' | 'phraseWord' | 'may'; query: string[]; options: string[]; answer: number }[]
}
const SC_VOCAB = [
  'sky', 'blue', 'bird', 'flies', 'high', 'red', 'rose', 'sweet', 'green', 'tree', 'tall', 'big', 'house', 'nice', 'boys', 'play', 'cricket', 'good', 'girls', 'read',
  'books', 'new', 'old', 'fast', 'car', 'road', 'long', 'water', 'cold', 'fresh', 'morning', 'sun', 'shines', 'bright', 'market', 'busy', 'city', 'clean', 'rain', 'falls',
  'small', 'river', 'flows', 'train', 'late', 'milk', 'pure', 'farmer', 'grows', 'wheat', 'plan', 'work', 'hard', 'team', 'wins', 'game',
]
const SC_CONS = 'bcdfghjklmnprstvz'.split('')
const SC_VOW = 'aeiou'.split('')

interface Derivation {
  w: string
  c: string
  round: number
  why: string
}

/** Human-style propagation: direct intersection first, then elimination rounds. Returns when nothing more can be fixed. */
function propagate(ss: CSent[], words: string[], codes: string[]): Derivation[] {
  const cand = new Map<string, Set<string>>()
  for (const w of words) {
    const inS = ss.filter((s) => s.words.includes(w))
    cand.set(w, new Set(codes.filter((c) => inS.every((s) => s.codes.includes(c)))))
  }
  const assigned = new Map<string, string>()
  const usedCodes = new Set<string>()
  const log: Derivation[] = []
  for (let round = 1; round <= 12; round++) {
    const found = new Map<string, { c: string; why: string }>()
    for (const w of words) {
      if (assigned.has(w)) continue
      const cs = [...(cand.get(w) as Set<string>)]
      if (cs.length === 1) {
        const idx = ss.map((s, i) => (s.words.includes(w) ? i + 1 : 0)).filter(Boolean)
        const why =
          round === 1
            ? idx.length >= 2
              ? `'${w}' occurs in sentences ${joinAnd(idx)}; the only code common to them is '${cs[0]}'.`
              : `'${w}' is the only word of sentence ${idx[0]} left undecided, so it takes the remaining code '${cs[0]}'.`
            : `Removing the codes already fixed (${[...usedCodes].map((x) => `'${x}'`).join(', ')}), the only code left for '${w}' in its sentence${idx.length > 1 ? 's' : ''} ${joinAnd(idx)} is '${cs[0]}'.`
        found.set(w, { c: cs[0], why })
      }
    }
    ss.forEach((s, i) => {
      const un = s.words.filter((w) => !assigned.has(w))
      if (un.length !== 1 || found.has(un[0])) return
      const left = s.codes.filter((c) => !usedCodes.has(c))
      if (left.length === 1 && (cand.get(un[0]) as Set<string>).has(left[0])) found.set(un[0], { c: left[0], why: `In sentence ${i + 1}, all words except '${un[0]}' are already decoded, so '${un[0]}' = '${left[0]}'.` })
    })
    for (const c of codes) {
      if (usedCodes.has(c)) continue
      const ws = words.filter((w) => !assigned.has(w) && (cand.get(w) as Set<string>).has(c))
      if (ws.length === 1 && !found.has(ws[0])) found.set(ws[0], { c, why: `The code '${c}' can belong to '${ws[0]}' only (no other undecided word can take it).` })
    }
    if (found.size === 0) break
    for (const [w, f] of found) {
      if (usedCodes.has(f.c)) continue // two words competing for one code cannot both be fixed in a round
      assigned.set(w, f.c)
      usedCodes.add(f.c)
      log.push({ w, c: f.c, round, why: f.why })
    }
    for (const w of words) if (!assigned.has(w)) for (const c of usedCodes) (cand.get(w) as Set<string>).delete(c)
  }
  return log
}

function scStructure(rng: Rng): { ss: CSent[]; words: string[]; codes: string[]; dict: Map<string, string>; sols: Map<string, string>[]; log: Derivation[] } | null {
  const nw = rng.int(8, 9)
  const words = rng.sample(SC_VOCAB, nw)
  const codeSet = new Set<string>()
  while (codeSet.size < nw) codeSet.add(rng.pick(SC_CONS) + rng.pick(SC_VOW))
  const codes = [...codeSet]
  const dict = new Map<string, string>()
  const shuf = rng.shuffle(codes)
  words.forEach((w, i) => dict.set(w, shuf[i]))
  const sizes = rng.pick([[3, 3, 4, 4], [3, 4, 4, 4], [4, 4, 4, 3], [3, 3, 3, 4, 4]])
  const ss: CSent[] = sizes.map((m) => {
    const ws = rng.sample(words, m)
    return { words: ws, codes: rng.shuffle(ws.map((w) => dict.get(w) as string)) }
  })
  if (new Set(ss.flatMap((s) => s.words)).size < nw) return null
  const keys = ss.map((s) => [...s.words].sort().join('|'))
  if (new Set(keys).size !== keys.length) return null
  const sols = allDictionaries(ss)
  if (!sols.length) return null
  const log = propagate(ss, words, codes)
  return { ss, words, codes, dict, sols, log }
}

export function genSentence(rng: Rng, count: number): Proofed<SentenceProof> {
  const groups: Group[] = []
  const proofs: SentenceProof[] = []
  for (const k of splitCount(count, 5)) {
    let done: { g: Group; p: SentenceProof } | null = null
    for (let attempt = 0; attempt < 3000 && !done; attempt++) {
      const st = scStructure(rng)
      if (!st) continue
      const { ss, words, codes, dict, sols, log } = st
      // soundness of the human derivation against exhaustive enumeration
      let sound = true
      for (const d of log) if (!sols.every((s) => s.get(d.w) === d.c)) sound = false
      ensure(sound, 'sentence-coding: propagation fixed a word that is not unique over all dictionaries')
      const depth = new Map(log.map((d) => [d.w, d.round]))
      const deep = words.filter((w) => (depth.get(w) ?? 0) >= 2)
      const det = words.filter((w) => depth.has(w))
      const feas = (w: string): Set<string> => new Set(sols.map((s) => s.get(w) as string))
      const undet = words.filter((w) => feas(w).size > 1)
      if (deep.length < 3 || det.length < 5) continue
      const codeOf = (w: string): string => dict.get(w) as string
      const wordOf = (c: string): string => words.find((w) => dict.get(w) === c) as string
      const lines = (maxRound: number): string[] => log.filter((d) => d.round <= maxRound).map((d, i) => `Step ${i + 1}: ${d.why}`)
      const used = new Set<string>()
      const qs: QuestionDraft[] = []
      const props: SentenceProof['questions'] = []
      const planKinds: ('code' | 'word' | 'phrase' | 'phraseWord' | 'may')[] = rng.shuffle(['code', 'word', 'phrase', 'phraseWord', 'may'] as const).slice()
      let ok = true
      let deepUsed = 0
      for (const kind0 of planKinds.slice(0, k)) {
        let kind = kind0
        if (kind === 'may' && undet.length === 0) kind = 'code'
        let made = false
        for (let t = 0; t < 60 && !made; t++) {
          const needDeep = deepUsed < 3 && deep.length > 0
          const poolW = needDeep ? deep : det
          let stem = ''
          let lay: Laid
          let steps: string[]
          let query: string[]
          try {
            if (kind === 'code') {
              const w = rng.pick(poolW)
              const c = codeOf(w)
              ensure(sols.every((s) => s.get(w) === c), 'sc code not unique')
              const near = ss.filter((s) => s.codes.includes(c)).flatMap((s) => s.codes).filter((x) => x !== c)
              lay = layout(rng, c, [...rng.shuffle(near), ...rng.shuffle(codes.filter((x) => x !== c))])
              stem = `What is the code for '${w}' in the given code language?`
              steps = [...lines(depth.get(w) as number), `So the code for '${w}' is '${c}'.`]
              query = [w]
            } else if (kind === 'word') {
              const w = rng.pick(poolW)
              const c = codeOf(w)
              ensure(sols.every((s) => s.get(w) === c), 'sc word not unique')
              const near = ss.filter((s) => s.words.includes(w)).flatMap((s) => s.words).filter((x) => x !== w)
              lay = layout(rng, w, [...rng.shuffle(near), ...rng.shuffle(words.filter((x) => x !== w))])
              stem = `What does the code '${c}' stand for in the given code language?`
              steps = [...lines(depth.get(w) as number), `So '${c}' stands for '${w}'.`]
              query = [c]
            } else if (kind === 'phrase') {
              const n = rng.pick([2, 3])
              const base = needDeep ? [rng.pick(deep)] : []
              const ws = [...base, ...rng.sample(det.filter((x) => !base.includes(x)), n - base.length)]
              if (ws.length !== n) throw new Reject('few')
              const cs = ws.map(codeOf)
              const target = new Set(cs)
              const keyOf = (a: string[]): string => [...a].sort().join('|')
              const seen = new Set([keyOf(cs)])
              const wrongSets: string[][] = []
              for (let g = 0; g < 80 && wrongSets.length < 6; g++) {
                const keep = rng.int(1, n - 1)
                const c2 = [...rng.sample(cs, keep), ...rng.sample(codes.filter((x) => !target.has(x)), n - keep)]
                if (seen.has(keyOf(c2))) continue
                seen.add(keyOf(c2))
                wrongSets.push(c2)
              }
              const correctText = rng.shuffle(cs).join(' ')
              lay = layout(rng, correctText, wrongSets.map((x) => rng.shuffle(x).join(' ')))
              const maxR = Math.max(...ws.map((w) => depth.get(w) as number))
              stem = `What is the code for '${rng.shuffle(ws).join(' ')}' in the given code language? (The order of the code words in an option may differ.)`
              steps = [...lines(maxR), `${ws.map((w) => `'${w}' = '${codeOf(w)}'`).join(', ')}, so the phrase is coded with ${cs.map((c) => `'${c}'`).join(', ')} (in any order).`]
              query = ws
            } else if (kind === 'phraseWord') {
              const n = 2
              const base = needDeep ? [rng.pick(deep)] : []
              const ws = [...base, ...rng.sample(det.filter((x) => !base.includes(x)), n - base.length)]
              if (ws.length !== n) throw new Reject('few')
              const cs = ws.map(codeOf)
              const keyOf = (a: string[]): string => [...a].sort().join('|')
              const seen = new Set([keyOf(ws)])
              const wrongSets: string[][] = []
              for (let g = 0; g < 80 && wrongSets.length < 6; g++) {
                const w2 = [rng.pick(ws), rng.pick(words.filter((x) => !ws.includes(x)))]
                if (seen.has(keyOf(w2))) continue
                seen.add(keyOf(w2))
                wrongSets.push(w2)
              }
              lay = layout(rng, rng.shuffle(ws).join(' '), wrongSets.map((x) => rng.shuffle(x).join(' ')))
              const maxR = Math.max(...ws.map((w) => depth.get(w) as number))
              stem = `Which of the following is the meaning of the code '${rng.shuffle(cs).join(' ')}' in the given code language? (The order of the words in an option may differ.)`
              steps = [...lines(maxR), `${cs.map((c) => `'${c}' = '${wordOf(c)}'`).join(', ')}, so the meaning is '${ws.join(' ')}' (in any order).`]
              query = cs
            } else {
              const w = rng.pick(undet)
              const f = [...feas(w)]
              const correct = rng.pick(f)
              const impossible = codes.filter((c) => !f.includes(c))
              if (impossible.length < 4) throw new Reject('few impossible')
              lay = layout(rng, correct, rng.shuffle(impossible))
              stem = `Which of the following may be the code for '${w}' in the given code language?`
              steps = [
                ...lines(Math.max(0, ...log.map((d) => d.round))),
                `The sentences do not fix the code of '${w}' uniquely: of the codes still unassigned it can only be ${f.map((c) => `'${c}'`).join(' or ')}.`,
                `Every other code is either already fixed for a different word or excluded by the sentences, so only ${f.map((c) => `'${c}'`).join(' / ')} can be correct.`,
              ]
              query = [w]
            }
          } catch (e) {
            if (e instanceof Reject) continue
            throw e
          }
          if (used.has(stem)) continue
          used.add(stem)
          if (kind !== 'may') deepUsed += 1
          qs.push(draft(TOPIC_SC, stem, lay, steps))
          props.push({ kind, query, options: lay.options, answer: lay.answer })
          made = true
        }
        if (!made) {
          ok = false
          break
        }
      }
      if (!ok) continue
      const paras = ['In a certain code language, the following sentences are coded as shown:', ...ss.map((s) => `'${rng.shuffle(s.words).join(' ')}' is coded as '${s.codes.join(' ')}'`)]
      done = { g: { stimulus: { directions: DIRECTIONS, parts: [{ kind: 'text', paragraphs: paras }] }, questions: qs }, p: { sentences: ss, questions: props } }
    }
    if (!done) throw new Error('sentence-coding: generation failed')
    groups.push(done.g)
    proofs.push(done.p)
  }
  return { groups, proofs }
}

// ============================================================================================================ ORDER-RANKING
const TOPIC_RK: ReasoningTopicId = 'order-ranking'

// ------------------------------------------------------------------ row model (swaps / persons joining or leaving)
type RF = { k: 'L'; t: number; p: number; n: number } | { k: 'R'; t: number; p: number; n: number } | { k: 'B'; t: number; a: number; b: number; n: number } | { k: 'T'; t: number; n: number }
type ROp = { k: 'swap'; a: number; b: number } | { k: 'lL'; n: number } | { k: 'lR'; n: number } | { k: 'jL'; n: number } | { k: 'jR'; n: number }
type RAsk = { k: 'L'; t: number; p: number } | { k: 'R'; t: number; p: number } | { k: 'B'; t: number; a: number; b: number } | { k: 'T'; t: number }
interface RSt {
  N: number
  pos: number[]
}
export interface RowProof {
  persons: string[]
  anchors: { p: number; side: 'L' | 'R'; n: number }[]
  ops: ROp[]
  facts: RF[]
  ask: RAsk
  value: number
}
export interface SectionProof {
  a: number
  b: number
  rel: { kind: 'diff'; k: number } | { kind: 'ratio'; m: number; n: number }
  /** Number shifted from P to Q (null when it has to be found from `after`). */
  moved: number | null
  /** Ratio P : Q after the shift, when the number shifted is unknown. */
  after: [number, number] | null
  left: number
  ask: 'P' | 'Q' | 'total' | 'moved'
  value: number
}
export type OClue =
  | { k: 'rank'; x: number; r: number }
  | { k: 'above'; x: number; y: number }
  | { k: 'adj'; x: number; y: number }
  | { k: 'gap'; x: number; y: number; m: number }
  | { k: 'mid'; x: number; y: number; z: number }
  | { k: 'ext'; x: number }
export type OAsk = { k: 'who'; r: number } | { k: 'between'; x: number; y: number } | { k: 'higher'; x: number } | { k: 'lower'; x: number } | { k: 'below'; x: number }
export interface OrderProof {
  persons: string[]
  clues: OClue[]
  ask: OAsk
  value: string
}
export type RankProof =
  | { k: 'row'; row: RowProof; options: string[]; answer: number }
  | { k: 'sections'; sec: SectionProof; options: string[]; answer: number }
  | { k: 'order'; ord: OrderProof; options: string[]; answer: number }

function rowSim(N: number, pos0: number[], ops: ROp[]): RSt[] | null {
  const out: RSt[] = [{ N, pos: pos0.slice() }]
  let cur = out[0]
  for (const op of ops) {
    const pos = cur.pos.slice()
    let n = cur.N
    switch (op.k) {
      case 'swap':
        ;[pos[op.a], pos[op.b]] = [pos[op.b], pos[op.a]]
        break
      case 'lL':
        if (pos.some((p) => p <= op.n)) return null
        for (let i = 0; i < pos.length; i++) pos[i] -= op.n
        n -= op.n
        break
      case 'lR':
        if (pos.some((p) => p > n - op.n)) return null
        n -= op.n
        break
      case 'jL':
        for (let i = 0; i < pos.length; i++) pos[i] += op.n
        n += op.n
        break
      case 'jR':
        n += op.n
        break
    }
    cur = { N: n, pos }
    out.push(cur)
  }
  return out
}
const rfHolds = (f: RF, st: RSt[]): boolean => {
  const s = st[f.t]
  switch (f.k) {
    case 'L':
      return s.pos[f.p] === f.n
    case 'R':
      return s.N - s.pos[f.p] + 1 === f.n
    case 'B':
      return Math.abs(s.pos[f.a] - s.pos[f.b]) - 1 === f.n
    case 'T':
      return s.N === f.n
  }
}
const askValue = (a: RAsk, st: RSt[]): number => {
  const s = st[a.t]
  switch (a.k) {
    case 'L':
      return s.pos[a.p]
    case 'R':
      return s.N - s.pos[a.p] + 1
    case 'B':
      return Math.abs(s.pos[a.a] - s.pos[a.b]) - 1
    case 'T':
      return s.N
  }
}
/** All values the question can take over every row length / starting arrangement consistent with the statement. */
function rowSolve(anchors: RowProof['anchors'], ops: ROp[], facts: RF[], ask: RAsk): Set<number> {
  const vals = new Set<number>()
  for (let N = 2; N <= 140; N++) {
    const pos0 = anchors.map((a) => (a.side === 'L' ? a.n : N - a.n + 1))
    if (pos0.some((p) => p < 1 || p > N) || new Set(pos0).size !== pos0.length) continue
    const st = rowSim(N, pos0, ops)
    if (!st || !facts.every((f) => rfHolds(f, st))) continue
    vals.add(askValue(ask, st))
  }
  return vals
}

// symbolic positions a + b*N (explanations, and a second derivation of every state)
interface E {
  a: number
  b: number
}
const eTxt = (e: E): string => (e.b === 0 ? String(e.a) : e.a === 0 ? 'x' : e.a > 0 ? `x + ${e.a}` : `x − ${-e.a}`)
const eVal = (e: E, N: number): number => e.a + e.b * N
interface ESt {
  T: E
  pos: E[]
}
function symSim(anchors: RowProof['anchors'], ops: ROp[]): ESt[] {
  const T: E = { a: 0, b: 1 }
  let cur: ESt = { T, pos: anchors.map((x) => (x.side === 'L' ? { a: x.n, b: 0 } : { a: 1 - x.n, b: 1 })) }
  const out = [cur]
  for (const op of ops) {
    const pos = cur.pos.map((e) => ({ ...e }))
    const t = { ...cur.T }
    if (op.k === 'swap') [pos[op.a], pos[op.b]] = [pos[op.b], pos[op.a]]
    else if (op.k === 'lL') {
      pos.forEach((e) => (e.a -= op.n))
      t.a -= op.n
    } else if (op.k === 'lR') t.a -= op.n
    else if (op.k === 'jL') {
      pos.forEach((e) => (e.a += op.n))
      t.a += op.n
    } else t.a += op.n
    cur = { T: t, pos }
    out.push(cur)
  }
  return out
}
const fromRightE = (s: ESt, p: number): E => ({ a: s.T.a - s.pos[p].a + 1, b: s.T.b - s.pos[p].b })

function opText(op: ROp, nm: string[], things: string): string {
  switch (op.k) {
    case 'swap':
      return `${nm[op.a]} and ${nm[op.b]} interchange their positions`
    case 'lL':
      return `${op.n} ${things} standing at the left end of the row leave`
    case 'lR':
      return `${op.n} ${things} standing at the right end of the row leave`
    case 'jL':
      return `${op.n} new ${things} join the row at the left end`
    case 'jR':
      return `${op.n} new ${things} join the row at the right end`
  }
}
function opExpl(op: ROp, nm: string[]): string {
  switch (op.k) {
    case 'swap':
      return `${nm[op.a]} and ${nm[op.b]} exchange places`
    case 'lL':
      return `${op.n} leave from the left end: every position from the left falls by ${op.n} and the total falls by ${op.n}`
    case 'lR':
      return `${op.n} leave from the right end: positions from the left do not change, the total falls by ${op.n}`
    case 'jL':
      return `${op.n} join at the left end: every position from the left rises by ${op.n} and the total rises by ${op.n}`
    case 'jR':
      return `${op.n} join at the right end: positions from the left do not change, the total rises by ${op.n}`
  }
}
function factText(f: RF, nm: string[], things: string): string {
  switch (f.k) {
    case 'L':
      return `${nm[f.p]} is now ${ordinalNum(f.n)} from the left end`
    case 'R':
      return `${nm[f.p]} is now ${ordinalNum(f.n)} from the right end`
    case 'B':
      return `there are now ${f.n === 0 ? 'no' : f.n} ${things} between ${nm[f.a]} and ${nm[f.b]}`
    case 'T':
      return `the row now has ${f.n} ${things}`
  }
}
function askText(a: RAsk, nm: string[], things: string): string {
  switch (a.k) {
    case 'L':
      return `What is ${nm[a.p]}'s position from the left end now?`
    case 'R':
      return `What is ${nm[a.p]}'s position from the right end now?`
    case 'B':
      return `How many ${things} are there between ${nm[a.a]} and ${nm[a.b]} now?`
    case 'T':
      return `How many ${things} are there in the row now?`
  }
}

function buildRow(rng: Rng): { q: QuestionDraft; proof: RankProof } {
  return retry(800, 'order-ranking(row)', () => {
    const np = rng.pick([2, 3, 3])
    const nm = pickNames(rng, np)
    const things = rng.pick(['students', 'persons', 'boys', 'people'])
    const N = rng.int(32, 62)
    const pos0: number[] = []
    while (pos0.length < np) {
      const p = rng.int(9, N - 9)
      if (pos0.every((q) => Math.abs(q - p) >= 3)) pos0.push(p)
    }
    const anchors: RowProof['anchors'] = pos0.map((p, i) => {
      const side = rng.chance(0.5) ? 'L' : 'R'
      return { p: i, side, n: side === 'L' ? p : N - p + 1 }
    })
    const flowOp = (): ROp => {
      const k = rng.pick(['lL', 'lR', 'jL', 'jR'] as const)
      return { k, n: k === 'lL' || k === 'lR' ? rng.int(3, 8) : rng.int(4, 9) }
    }
    const swapOp = (): ROp => {
      const a = rng.int(0, np - 1)
      let b = rng.int(0, np - 1)
      while (b === a) b = rng.int(0, np - 1)
      return { k: 'swap', a, b }
    }
    const style = rng.pick(['swap', 'flow', 'mix', 'mix'] as const)
    const ops: ROp[] = []
    if (style === 'swap') {
      ops.push(swapOp(), swapOp())
      if (np === 3 && rng.chance(0.4)) ops.push(swapOp())
    } else if (style === 'flow') {
      ops.push(flowOp(), flowOp())
      if (rng.chance(0.35)) ops.push(flowOp())
    } else {
      ops.push(swapOp(), flowOp())
      if (rng.chance(0.5)) ops.splice(rng.int(0, 2), 0, rng.chance(0.5) ? swapOp() : flowOp())
    }
    for (let i = 0; i + 1 < ops.length; i++) {
      const p = ops[i]
      const q = ops[i + 1]
      need(!(p.k === 'swap' && q.k === 'swap' && Math.min(p.a, p.b) === Math.min(q.a, q.b) && Math.max(p.a, p.b) === Math.max(q.a, q.b)), 'cancelling swaps')
    }
    const st = rowSim(N, pos0, ops)
    need(st !== null, 'invalid ops')
    const sym = symSim(anchors, ops)
    // second derivation of every state
    st.forEach((s, t) => {
      s.pos.forEach((p, i) => ensure(eVal(sym[t].pos[i], N) === p, 'row: symbolic position disagrees with simulation'))
      ensure(eVal(sym[t].T, N) === s.N, 'row: symbolic total disagrees with simulation')
    })
    const tEnd = ops.length
    // question at the final state
    const askKinds: RAsk[] = []
    for (let p = 0; p < np; p++) askKinds.push({ k: 'L', t: tEnd, p }, { k: 'R', t: tEnd, p })
    for (let a = 0; a < np; a++) for (let b = a + 1; b < np; b++) askKinds.push({ k: 'B', t: tEnd, a, b })
    if (st[tEnd].N !== N) askKinds.push({ k: 'T', t: tEnd }, { k: 'T', t: tEnd })
    const ask = rng.pick(askKinds)
    const value = askValue(ask, st)
    need(value >= (ask.k === 'B' ? 2 : 1), 'trivial value')
    // later facts
    const pool: RF[] = []
    for (let t = 1; t <= tEnd; t++) {
      for (let p = 0; p < np; p++) {
        pool.push({ k: 'L', t, p, n: st[t].pos[p] }, { k: 'R', t, p, n: st[t].N - st[t].pos[p] + 1 })
      }
      for (let a = 0; a < np; a++) for (let b = a + 1; b < np; b++) pool.push({ k: 'B', t, a, b, n: Math.abs(st[t].pos[a] - st[t].pos[b]) - 1 })
      if (st[t].N !== N) pool.push({ k: 'T', t, n: st[t].N })
    }
    const sameAsAsk = (f: RF): boolean => f.t === ask.t && f.k === ask.k && (f.k === 'L' || f.k === 'R' ? (ask as { p: number }).p === f.p : f.k === 'B' ? (ask as { a: number }).a === f.a && (ask as { b: number }).b === f.b : true)
    const usable = pool.filter((f) => !sameAsAsk(f) && !(f.k === 'B' && f.n < 1))
    need(usable.length >= 2, 'no facts')
    const nFacts = rng.chance(0.65) ? 1 : 2
    const facts = rng.sample(usable, nFacts).sort((x, y) => x.t - y.t)
    const solve = (fs: RF[]): Set<number> => rowSolve(anchors, ops, fs, ask)
    const full = solve(facts)
    need(full.size === 1 && full.has(value), 'not unique')
    for (let i = 0; i < facts.length; i++) {
      const rest = facts.filter((_, j) => j !== i)
      const s = solve(rest)
      need(!(s.size === 1 && s.has(value)), 'redundant fact')
    }
    need(solve([]).size > 1, 'unconstrained question is already determined')
    // ---- story
    const first = anchors.map((a) => `${nm[a.p]} is ${ordinalNum(a.n)} from the ${a.side === 'L' ? 'left' : 'right'} end`)
    const parts: string[] = [`In a row of ${things} all facing the same direction, ${first.slice(0, -1).join(', ')} and ${first[first.length - 1]}.`]
    for (let t = 1; t <= tEnd; t++) {
      const ft = facts.filter((f) => f.t === t)
      const tail = ft.length ? `, and ${ft.map((f) => factText(f, nm, things)).join(', and ')}` : ''
      parts.push(`${cap(opText(ops[t - 1], nm, things))}${tail}.`)
    }
    const stem = `${parts.join(' ')} ${askText(ask, nm, things)}`
    // ---- explanation
    const steps: string[] = [`Let the original number of ${things} in the row be x. A position from the right end is (total − position from the left + 1).`]
    steps.push(`Initially (positions from the left): ${nm.map((x, i) => `${x} = ${eTxt(sym[0].pos[i])}`).join(', ')}; total = x.`)
    for (let t = 1; t <= tEnd; t++) {
      steps.push(`Step ${t}: ${opExpl(ops[t - 1], nm)} ⇒ ${nm.map((x, i) => `${x} = ${eTxt(sym[t].pos[i])}`).join(', ')}; total = ${eTxt(sym[t].T)}.`)
    }
    const cands: number[][] = []
    for (const f of facts) {
      const s = sym[f.t]
      let e: E
      let sign = 1
      if (f.k === 'L') e = s.pos[f.p]
      else if (f.k === 'R') e = fromRightE(s, f.p)
      else if (f.k === 'T') e = s.T
      else {
        const d: E = { a: s.pos[f.a].a - s.pos[f.b].a, b: s.pos[f.a].b - s.pos[f.b].b }
        sign = eVal(d, N) >= 0 ? 1 : -1
        e = { a: sign * d.a - 1, b: sign * d.b }
      }
      const eqTxt = f.k === 'B' ? `|${eTxt({ a: s.pos[f.a].a - s.pos[f.b].a, b: s.pos[f.a].b - s.pos[f.b].b })}| − 1 = ${f.n}` : `${eTxt(e)} = ${f.n}`
      const sol: number[] = []
      if (e.b !== 0) {
        sol.push((f.n - e.a) / e.b)
        if (f.k === 'B') {
          const e2: E = { a: -(e.a + 1) - 1, b: -e.b }
          sol.push((f.n - e2.a) / e2.b)
        }
      }
      cands.push(sol)
      steps.push(`Given: ${factText(f, nm, things)} (after step ${f.t}) ⇒ ${eqTxt}${sol.length ? ` ⇒ x = ${[...new Set(sol)].join(' or ')}` : ' (this condition does not involve x)'}.`)
    }
    let common = [...new Set(cands.filter((c) => c.length).flat())]
    for (const c of cands) if (c.length) common = common.filter((v) => c.includes(v))
    ensure(common.includes(N), 'row: explanation candidate set lost the true N')
    steps.push(`${common.length === 1 ? '' : 'The positions must lie inside the row and satisfy every given condition, which leaves '}x = ${N}.`)
    const fs = sym[tEnd]
    let lastLine: string
    if (ask.k === 'L') lastLine = `${nm[ask.p]}'s final position from the left = ${eTxt(fs.pos[ask.p])} = ${value}.`
    else if (ask.k === 'R') lastLine = `${nm[ask.p]}'s final position from the right = total − position + 1 = (${eTxt(fs.T)}) − (${eTxt(fs.pos[ask.p])}) + 1 = ${value}.`
    else if (ask.k === 'T') lastLine = `Total now = ${eTxt(fs.T)} = ${value}.`
    else lastLine = `Persons between ${nm[ask.a]} and ${nm[ask.b]} = |${eVal(fs.pos[ask.a], N)} − ${eVal(fs.pos[ask.b], N)}| − 1 = ${value}.`
    steps.push(lastLine)
    // ---- options: classic slips
    const traps: number[] = []
    const stT = st[tEnd]
    if (ask.k === 'L') traps.push(stT.N - stT.pos[ask.p] + 1, st[0].pos[ask.p])
    else if (ask.k === 'R') traps.push(stT.pos[ask.p], st[0].N - st[0].pos[ask.p] + 1, stT.N - stT.pos[ask.p])
    else if (ask.k === 'T') traps.push(N, N + ops.reduce((s, o) => s + (o.k === 'jL' || o.k === 'jR' ? o.n : 0), 0), N - ops.reduce((s, o) => s + (o.k === 'lL' || o.k === 'lR' ? o.n : 0), 0))
    else traps.push(Math.abs(st[0].pos[ask.a] - st[0].pos[ask.b]) - 1, Math.abs(stT.pos[ask.a] - stT.pos[ask.b]))
    traps.push(value + 1, value - 1, value + 2, value - 2, value + 10)
    const lay = layout(
      rng,
      String(value),
      traps.filter((v) => v > 0).map(String),
      () => String(value + rng.int(3, 9) * (rng.chance(0.5) ? 1 : -1)),
    )
    return { q: draft(TOPIC_RK, stem, lay, steps), proof: { k: 'row', row: { persons: nm, anchors, ops, facts, ask, value }, options: lay.options, answer: lay.answer } }
  })
}

// ------------------------------------------------------------------ two sections
function buildSections(rng: Rng): { q: QuestionDraft; proof: RankProof } {
  return retry(400, 'order-ranking(sections)', () => {
    const name = pickNames(rng, 1, 'names')[0]
    const variant = rng.pick(['diff', 'ratio'] as const)
    let rel: SectionProof['rel']
    let Np: number
    let Nq: number
    if (variant === 'diff') {
      Np = rng.int(8, 22) + rng.int(8, 24) - 1
      const k = rng.int(3, 12)
      const more = rng.chance(0.5)
      Nq = more ? Np + k : Np - k
      rel = { kind: 'diff', k: more ? k : -k }
    } else {
      const [m, n] = rng.pick([[5, 4], [4, 3], [6, 5], [7, 6], [3, 4], [4, 5], [5, 6], [3, 2], [2, 3]] as [number, number][])
      const u = rng.int(4, 9)
      Np = m * u
      Nq = n * u
      rel = { kind: 'ratio', m, n }
    }
    need(Np >= 20 && Nq >= 12, 'sizes')
    const a = rng.int(6, Np - 8)
    const b = Np - a + 1
    const moved = rng.int(3, 9)
    const left = rng.int(2, 8)
    const unknownMoved = rng.chance(0.55)
    need(Nq + moved - left > 5 && Np - moved > 5, 'sizes')
    const Np2 = Np - moved
    const Nq2 = Nq + moved - left
    let after: [number, number] | null = null
    if (unknownMoved) {
      const g = gcdInt(Np2, Nq + moved)
      after = [Np2 / g, (Nq + moved) / g]
      need(after[0] <= 15 && after[1] <= 15 && after[0] !== after[1], 'ratio too large')
    }
    const ask: SectionProof['ask'] = unknownMoved ? rng.pick(['moved', 'Q', 'total', 'P'] as const) : rng.pick(['P', 'Q', 'total'] as const)
    const value = ask === 'P' ? Np2 : ask === 'Q' ? Nq2 : ask === 'moved' ? moved : Np2 + Nq2
    // second derivation: enumerate the class size consistent with the two ranks (and the number shifted, when it is unknown)
    const sizes: number[] = []
    for (let n = 1; n <= 300; n++) if (a <= n && n - a + 1 === b) sizes.push(n)
    ensure(sizes.length === 1 && sizes[0] === Np, 'sections: class size not unique')
    if (after) {
      const cands: number[] = []
      for (let s = 0; s <= Np; s++) if ((Np - s) * after[1] === after[0] * (Nq + s)) cands.push(s)
      ensure(cands.length === 1 && cands[0] === moved, 'sections: shifted number not unique')
    }
    const relTxt = rel.kind === 'diff' ? `Section Q has ${Math.abs(rel.k)} ${rel.k > 0 ? 'more' : 'fewer'} students than Section P.` : `The ratio of the number of students in Section P to that in Section Q is ${rel.m} : ${rel.n}.`
    const moveTxt = after
      ? `Later, some students are shifted from Section P to Section Q, after which the ratio of the number of students in P to that in Q becomes ${after[0]} : ${after[1]}. Then ${left} students of Section Q leave the school.`
      : `Later, ${moved} students are shifted from Section P to Section Q, and then ${left} students of Section Q leave the school.`
    const askTxt =
      ask === 'P'
        ? 'How many students are there in Section P now?'
        : ask === 'Q'
          ? 'How many students are there in Section Q now?'
          : ask === 'moved'
            ? 'How many students were shifted from Section P to Section Q?'
            : 'How many students are there in the two sections together now?'
    const stem = `A class has two sections, P and Q. ${name} ranks ${ordinalNum(a)} from the top and ${ordinalNum(b)} from the bottom in Section P. ${relTxt} ${moveTxt} ${askTxt}`
    const steps = [
      `Students in Section P = (rank from top) + (rank from bottom) − 1 = ${a} + ${b} − 1 = ${Np}.`,
      rel.kind === 'diff' ? `Section Q = ${Np} ${rel.k > 0 ? '+' : '−'} ${Math.abs(rel.k)} = ${Nq}.` : `P : Q = ${rel.m} : ${rel.n}, so Q = ${Np} × ${rel.n}/${rel.m} = ${Nq}.`,
    ]
    if (after) {
      steps.push(`Let s students be shifted: (${Np} − s) : (${Nq} + s) = ${after[0]} : ${after[1]} ⇒ ${after[1]}(${Np} − s) = ${after[0]}(${Nq} + s).`)
      steps.push(`${after[1] * Np} − ${after[1]}s = ${after[0] * Nq} + ${after[0]}s ⇒ ${after[0] + after[1]}s = ${after[1] * Np - after[0] * Nq} ⇒ s = ${moved}.`)
    }
    steps.push(`After shifting ${moved} students: P = ${Np} − ${moved} = ${Np2}, Q = ${Nq} + ${moved} = ${Nq + moved}.`)
    steps.push(`After ${left} students leave Q: Q = ${Nq + moved} − ${left} = ${Nq2}.`)
    steps.push(ask === 'total' ? `Total now = ${Np2} + ${Nq2} = ${value}.` : `Required number = ${value}.`)
    const traps: number[] = [value + 1, value - 1]
    if (ask === 'P') traps.push(Np, a + b - moved, Np2 + left)
    else if (ask === 'Q') traps.push(Nq + moved, Nq - moved - left, Nq2 + left * 2)
    else if (ask === 'total') traps.push(Np + Nq - left, Np2 + Nq + moved, Np + Nq)
    else if (after) traps.push(Math.abs(Math.round((after[0] * Np - after[1] * Nq) / (after[0] + after[1]))), Math.abs(Math.round((Np - Nq) / 2)), Math.round((after[1] * Np - after[0] * Nq) / (after[0] + after[1])) + left)
    traps.push(value + moved, value - left)
    const lay = layout(rng, String(value), traps.filter((v) => v > 0).map(String), () => String(value + rng.int(2, 9) * (rng.chance(0.5) ? 1 : -1)))
    return {
      q: draft(TOPIC_RK, stem, lay, steps),
      proof: { k: 'sections', sec: { a, b, rel, moved: unknownMoved ? null : moved, after, left, ask, value }, options: lay.options, answer: lay.answer },
    }
  })
}

function gcdInt(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcdInt(b, a % b)
}

// ------------------------------------------------------------------ ordering of 8-10 people from mixed clues
interface Theme {
  noun: string
  cmp: string
  opp: string
  sup: string
  inf: string
}
const THEMES: Theme[] = [
  { noun: 'height', cmp: 'taller', opp: 'shorter', sup: 'tallest', inf: 'shortest' },
  { noun: 'age', cmp: 'older', opp: 'younger', sup: 'oldest', inf: 'youngest' },
  { noun: 'weight', cmp: 'heavier', opp: 'lighter', sup: 'heaviest', inf: 'lightest' },
  { noun: 'marks in the test', cmp: 'higher in marks', opp: 'lower in marks', sup: 'highest scorer', inf: 'lowest scorer' },
]

/** All position assignments (person -> 1-based position) with the given persons fixed. Flat array, n values per world. */
function makeWorlds(n: number, fixed: [number, number][]): { data: Uint8Array; M: number } {
  const fixedP = new Set(fixed.map((f) => f[0]))
  const fixedPos = new Set(fixed.map((f) => f[1]))
  const freePersons: number[] = []
  for (let i = 0; i < n; i++) if (!fixedP.has(i)) freePersons.push(i)
  const freePos: number[] = []
  for (let p = 1; p <= n; p++) if (!fixedPos.has(p)) freePos.push(p)
  let M = 1
  for (let i = 2; i <= freePersons.length; i++) M *= i
  const data = new Uint8Array(M * n)
  const cur = new Uint8Array(n)
  for (const [p, pos] of fixed) cur[p] = pos
  const used = new Uint8Array(freePos.length)
  let w = 0
  const rec = (i: number): void => {
    if (i === freePersons.length) {
      data.set(cur, w * n)
      w++
      return
    }
    for (let j = 0; j < freePos.length; j++) {
      if (used[j]) continue
      used[j] = 1
      cur[freePersons[i]] = freePos[j]
      rec(i + 1)
      used[j] = 0
    }
  }
  rec(0)
  return { data, M }
}
function clueHolds(c: OClue, d: Uint8Array, o: number, n: number): boolean {
  switch (c.k) {
    case 'rank':
      return d[o + c.x] === c.r
    case 'above':
      return d[o + c.x] < d[o + c.y]
    case 'adj':
      return d[o + c.y] === d[o + c.x] + 1
    case 'gap':
      return Math.abs(d[o + c.x] - d[o + c.y]) - 1 === c.m
    case 'mid': {
      const y = d[o + c.y]
      const x = d[o + c.x]
      const z = d[o + c.z]
      return (x < y && y < z) || (z < y && y < x)
    }
    case 'ext':
      return d[o + c.x] !== 1 && d[o + c.x] !== n
  }
}
function askCode(a: OAsk, d: Uint8Array, o: number, n: number): number {
  const who = (pos: number): number => {
    for (let i = 0; i < n; i++) if (d[o + i] === pos) return i
    return -1
  }
  switch (a.k) {
    case 'who':
      return who(a.r)
    case 'between':
      return Math.abs(d[o + a.x] - d[o + a.y]) - 1
    case 'higher':
      return d[o + a.x] - 1
    case 'lower':
      return n - d[o + a.x]
    case 'below':
      return who(d[o + a.x] + 1)
  }
}
const askIsPerson = (a: OAsk): boolean => a.k === 'who' || a.k === 'below'
function clueText(c: OClue, nm: string[], th: Theme, n: number): string {
  const sup = (r: number): string => (r === 1 ? `the ${th.sup}` : r === n ? `the ${th.inf}` : r <= n / 2 ? `the ${ordinalNum(r)} ${th.sup}` : `the ${ordinalNum(n - r + 1)} ${th.inf}`)
  switch (c.k) {
    case 'rank':
      return `${nm[c.x]} is ${sup(c.r)}`
    case 'above':
      return `${nm[c.x]} is ${th.cmp} than ${nm[c.y]}`
    case 'adj':
      return `${nm[c.x]} is ${th.cmp} than ${nm[c.y]} and no one stands between them in the order`
    case 'gap':
      return `Exactly ${c.m} ${c.m === 1 ? 'person' : 'persons'} ${c.m === 1 ? 'is' : 'are'} between ${nm[c.x]} and ${nm[c.y]} in the order`
    case 'mid':
      return `In the order of ${th.noun}, ${nm[c.y]} lies between ${nm[c.x]} and ${nm[c.z]}`
    case 'ext':
      return `${nm[c.x]} is neither the ${th.sup} nor the ${th.inf}`
  }
}
function orderAskText(a: OAsk, nm: string[], th: Theme, n: number): string {
  switch (a.k) {
    case 'who':
      return a.r === 1 ? `Who is the ${th.sup} of all?` : a.r === n ? `Who is the ${th.inf} of all?` : a.r <= n / 2 ? `Who is the ${ordinalNum(a.r)} ${th.sup}?` : `Who is the ${ordinalNum(n - a.r + 1)} ${th.inf}?`
    case 'between':
      return `How many persons are there between ${nm[a.x]} and ${nm[a.y]} in the order of ${th.noun}?`
    case 'higher':
      return `How many persons are ${th.cmp} than ${nm[a.x]}?`
    case 'lower':
      return `How many persons are ${th.opp} than ${nm[a.x]}?`
    case 'below':
      return `Who is immediately ${th.opp} than ${nm[a.x]}?`
  }
}

function buildOrder(rng: Rng): { q: QuestionDraft; proof: RankProof } {
  return retry(120, 'order-ranking(order)', () => {
    const n = rng.pick([8, 8, 8, 9, 9, 10])
    const nm = pickNames(rng, n, 'letters')
    const th = rng.pick(THEMES)
    const truth = rng.shuffle(Array.from({ length: n }, (_, i) => i)) // truth[pos-1] = person
    const posOf = new Array<number>(n)
    truth.forEach((p, i) => (posOf[p] = i + 1))
    // the question
    const askKind = rng.pick(['who', 'who', 'between', 'higher', 'lower', 'below'] as const)
    let ask: OAsk
    const px = rng.int(0, n - 1)
    if (askKind === 'who') ask = { k: 'who', r: rng.int(2, n - 1) }
    else if (askKind === 'between') {
      let py = rng.int(0, n - 1)
      while (py === px || Math.abs(posOf[px] - posOf[py]) < 3) py = rng.int(0, n - 1)
      ask = { k: 'between', x: px, y: py }
    } else if (askKind === 'higher') ask = { k: 'higher', x: px }
    else if (askKind === 'lower') ask = { k: 'lower', x: px }
    else {
      need(posOf[px] < n, 'last has no one below')
      ask = { k: 'below', x: px }
    }
    const asked = new Set<number>()
    if (ask.k === 'who') asked.add(truth[ask.r - 1])
    else if (ask.k === 'between') {
      asked.add(ask.x)
      asked.add(ask.y)
    } else asked.add(ask.x)
    if (ask.k === 'below') asked.add(truth[posOf[ask.x]])
    // two absolute clues on persons not involved in the question
    const others = rng.shuffle(Array.from({ length: n }, (_, i) => i).filter((i) => !asked.has(i)))
    const nFixed = n >= 9 ? 3 : 2
    const base: OClue[] = others.slice(0, nFixed).map((x) => ({ k: 'rank', x, r: posOf[x] }))
    const { data, M } = makeWorlds(
      n,
      others.slice(0, nFixed).map((x) => [x, posOf[x]] as [number, number]),
    )
    const ac = new Uint8Array(M)
    for (let w = 0; w < M; w++) {
      const c = askCode(ask, data, w * n, n)
      ac[w] = c < 0 ? 15 : c
    }
    const trueCode = askCode(ask, Uint8Array.from(posOf), 0, n)
    const codesOf = (idx: ArrayLike<number>): number[] => {
      const flag = new Uint8Array(16)
      for (let i = 0; i < idx.length; i++) flag[ac[idx[i]]] = 1
      const out: number[] = []
      for (let c = 0; c < 16; c++) if (flag[c]) out.push(c)
      return out
    }
    const filter = (idx: number[], c: OClue): number[] => {
      const out: number[] = []
      for (const w of idx) if (clueHolds(c, data, w * n, n)) out.push(w)
      return out
    }
    // random true clues
    const randomClue = (): OClue | null => {
      const t = rng.pick(['above', 'above', 'above', 'gap', 'gap', 'adj', 'mid', 'mid', 'ext', 'rank'] as const)
      const x = rng.int(0, n - 1)
      let y = rng.int(0, n - 1)
      while (y === x) y = rng.int(0, n - 1)
      if (t === 'above') return posOf[x] < posOf[y] ? { k: 'above', x, y } : { k: 'above', x: y, y: x }
      if (t === 'gap') {
        const m = Math.abs(posOf[x] - posOf[y]) - 1
        return m >= 1 && m <= 4 ? { k: 'gap', x, y, m } : null
      }
      if (t === 'adj') return posOf[y] === posOf[x] + 1 ? { k: 'adj', x, y } : posOf[x] === posOf[y] + 1 ? { k: 'adj', x: y, y: x } : null
      if (t === 'mid') {
        let z = rng.int(0, n - 1)
        while (z === x || z === y) z = rng.int(0, n - 1)
        const arr = [x, y, z].sort((p, q) => posOf[p] - posOf[q])
        return rng.chance(0.5) ? { k: 'mid', x: arr[0], y: arr[1], z: arr[2] } : { k: 'mid', x: arr[2], y: arr[1], z: arr[0] }
      }
      if (t === 'ext') return posOf[x] !== 1 && posOf[x] !== n && !asked.has(x) ? { k: 'ext', x } : null
      return asked.has(x) ? null : { k: 'rank', x, r: posOf[x] }
    }
    let active: number[] = Array.from({ length: M }, (_, i) => i)
    const chosen: OClue[] = []
    let guard = 0
    while (codesOf(active).length > 1 && chosen.length < 12 && guard++ < 300) {
      const c = randomClue()
      if (!c) continue
      const next = filter(active, c)
      if (next.length === active.length) continue // no information
      chosen.push(c)
      active = next
    }
    need(codesOf(active).length === 1 && codesOf(active)[0] === trueCode, 'not determined')
    // masks of the chosen clues over all worlds, then drop every clue that is not needed
    const mask = new Map<OClue, Uint8Array>()
    for (const c of chosen) {
      const m = new Uint8Array(M)
      for (let w = 0; w < M; w++) m[w] = clueHolds(c, data, w * n, n) ? 1 : 0
      mask.set(c, m)
    }
    const codesWith = (cs: OClue[]): number[] => {
      const flag = new Uint8Array(16)
      const ms = cs.map((c) => mask.get(c) as Uint8Array)
      for (let w = 0; w < M; w++) {
        let ok = true
        for (let i = 0; i < ms.length; i++) {
          if (!ms[i][w]) {
            ok = false
            break
          }
        }
        if (ok) flag[ac[w]] = 1
      }
      const out: number[] = []
      for (let c = 0; c < 16; c++) if (flag[c]) out.push(c)
      return out
    }
    let kept = chosen.slice()
    for (const c of rng.shuffle(chosen)) {
      const rest = kept.filter((x) => x !== c)
      if (codesWith(rest).length === 1) kept = rest
    }
    const total = kept.length + nFixed
    need(total >= 6 && total <= 11, 'clue count')
    need(new Set(kept.map((c) => c.k)).size >= 3, 'not enough variety')
    const slips = new Set<number>()
    for (const c of kept) for (const v of codesWith(kept.filter((x) => x !== c))) if (v !== trueCode && v !== 15) slips.add(v)
    const str = (c: number): string => (askIsPerson(ask) ? nm[c] : String(c))
    const trueVal = str(trueCode)
    // present: the two absolute clues, then the others in random order (the stem lists them in a shuffled order)
    const clues = [...base, ...rng.shuffle(kept)]
    const stemClues = rng.shuffle(clues).map((c, j) => `(${j + 1}) ${cap(clueText(c, nm, th, n))}.`)
    const intro = `${n} persons ${nm.join(', ')} are ranked by ${th.noun} (no two are equal). The following facts are known:`
    const stem = `${intro}\n${stemClues.join('\n')}\n${orderAskText(ask, nm, th, n)}`
    // explanation: narrowing of the answer clue by clue
    const steps: string[] = [`Arrange the ${n} persons from the ${th.sup} (position 1) to the ${th.inf} (position ${n}).`]
    steps.push(`Fix the definite positions first: ${base.map((c) => `${clueText(c, nm, th, n)} (position ${(c as { r: number }).r})`).join('; ')}.`)
    let idx: number[] = Array.from({ length: M }, (_, i) => i)
    for (const c of base) idx = filter(idx, c)
    clues.slice(nFixed).forEach((c) => {
      idx = filter(idx, c)
      const s = codesOf(idx).map(str)
      steps.push(`Use "${clueText(c, nm, th, n)}": ${s.length === 1 ? `the answer is now fixed: ${s[0]}.` : `the answer can still be ${s.length <= 6 ? s.join(', ') : 'any of several values'}.`}`)
    })
    const fin = codesOf(idx)
    ensure(fin.length === 1 && fin[0] === trueCode, 'order: replay of clues does not fix the answer')
    steps.push(`One complete arrangement satisfying every fact (position 1 to ${n}): ${truth.map((p) => nm[p]).join(' > ')}. Every valid arrangement gives the same answer: ${trueVal}.`)
    let traps: string[]
    if (askIsPerson(ask)) {
      const at = ask.k === 'who' ? ask.r : posOf[(ask as { x: number }).x] + 1
      const nearby = [truth[Math.max(0, at - 2)], truth[Math.min(n - 1, at)]].map((p) => nm[p])
      traps = [...[...slips].map(str), ...nearby, ...rng.shuffle(nm)]
    } else {
      const tv = trueCode
      traps = [...[...slips].map(str), String(tv + 1), String(tv - 1), String(tv + 2), String(tv - 2)].filter((v) => Number(v) >= 0 && Number(v) <= n - 1)
    }
    const lay = layout(rng, trueVal, traps, () => (askIsPerson(ask) ? nm[rng.int(0, n - 1)] : String(rng.int(0, n - 1))))
    return {
      q: draft(TOPIC_RK, stem, lay, steps),
      proof: { k: 'order', ord: { persons: nm, clues: [...base, ...kept], ask, value: trueVal }, options: lay.options, answer: lay.answer },
    }
  })
}

export function genRanking(rng: Rng, count: number): Proofed<RankProof> {
  const groups: Group[] = []
  const proofs: RankProof[] = []
  const seen = new Set<string>()
  let order: ('row' | 'sections' | 'order')[] = []
  const one = (k: 'row' | 'sections' | 'order') => (k === 'row' ? buildRow(rng) : k === 'sections' ? buildSections(rng) : buildOrder(rng))
  for (let i = 0; i < count; i++) {
    if (!order.length) order = rng.shuffle(['row', 'order', 'sections', 'row', 'order'] as const).slice()
    const kind = order.pop() as 'row' | 'sections' | 'order'
    let r = one(kind)
    for (let t = 0; t < 6 && seen.has(r.q.stem); t++) r = one(kind)
    seen.add(r.q.stem)
    groups.push({ questions: [r.q] })
    proofs.push(r.proof)
  }
  return { groups, proofs }
}

// ============================================================================================================ ALPHANUMERIC SERIES
const TOPIC_AN: ReasoningTopicId = 'alphanumeric-series'

type Cls = 'letter' | 'vowel' | 'consonant' | 'digit' | 'even' | 'odd' | 'prime' | 'symbol'
interface Cond {
  dir: 'prev' | 'next'
  cls: Cls
  neg: boolean
}
type Pick = { cls: Cls; from: 'L' | 'R'; i: number }
export type ASpec =
  | { k: 'count'; cur: Cls; conds: Cond[] }
  | { k: 'sum'; cur: 'even' | 'odd' | 'prime' | 'digit'; conds: Cond[] }
  | { k: 'delNth'; del: Cls; from: 'L' | 'R'; i: number; dir: 'L' | 'R'; j: number }
  | { k: 'between'; count: Cls; a: Pick; b: Pick }
  | { k: 'nthOf'; a: Pick; dir: 'L' | 'R'; j: number }
export interface AlphaProof {
  series: string[]
  questions: { spec: ASpec; options: string[]; answer: number }[]
}
const SYM7 = ['@', '#', '$', '%', '&', '*', '©']
const ALL_CLS: Cls[] = ['letter', 'vowel', 'consonant', 'digit', 'even', 'odd', 'prime', 'symbol']

function isCls(ch: string, c: Cls): boolean {
  const L = /^[A-Z]$/.test(ch)
  const D = /^[0-9]$/.test(ch)
  switch (c) {
    case 'letter':
      return L
    case 'vowel':
      return L && VOWELS.includes(ch)
    case 'consonant':
      return L && !VOWELS.includes(ch)
    case 'digit':
      return D
    case 'even':
      return D && Number(ch) % 2 === 0
    case 'odd':
      return D && Number(ch) % 2 === 1
    case 'prime':
      return D && [2, 3, 5, 7].includes(Number(ch))
    case 'symbol':
      return !L && !D
  }
}
const CLS_NOUN: Record<Cls, [string, string]> = {
  letter: ['letter', 'letters'],
  vowel: ['vowel', 'vowels'],
  consonant: ['consonant', 'consonants'],
  digit: ['number', 'numbers'],
  even: ['even number', 'even numbers'],
  odd: ['odd number', 'odd numbers'],
  prime: ['prime number', 'prime numbers'],
  symbol: ['symbol', 'symbols'],
}
const clsArt = (c: Cls): string => (c === 'even' || c === 'odd' ? 'an' : 'a')
const noun1 = (c: Cls): string => `${clsArt(c)} ${CLS_NOUN[c][0]}`

function condMatches(series: string[], i: number, c: Cond, vacuous: boolean): boolean {
  const j = i + (c.dir === 'prev' ? -1 : 1)
  const has = j >= 0 && j < series.length
  if (c.neg) return has ? !isCls(series[j], c.cls) : vacuous
  return has && isCls(series[j], c.cls)
}
function matchIdx(series: string[], cur: Cls, conds: Cond[], vacuous: boolean): number[] {
  const out: number[] = []
  for (let i = 0; i < series.length; i++) {
    if (!isCls(series[i], cur)) continue
    if (conds.every((c) => condMatches(series, i, c, vacuous))) out.push(i)
  }
  return out
}
function condPhrase(conds: Cond[]): string {
  const verb = (c: Cond): string => `immediately ${c.dir === 'next' ? 'followed' : 'preceded'} by ${noun1(c.cls)}`
  const pos = conds.filter((c) => !c.neg)
  const neg = conds.filter((c) => c.neg)
  const a = pos.map(verb).join(' and ')
  const b = neg.length ? `${pos.length ? 'but ' : ''}not ${neg.map(verb).join(' or ')}` : ''
  return [a, b].filter(Boolean).join(' ')
}
const ordSup = (i: number, c: Cls): string => `${ordinalNum(i)} ${CLS_NOUN[c][0]}`

/** Index of the i-th element of class c counted from `from`; -1 when there are fewer. */
function pickIdx(series: string[], p: Pick): number {
  const idxs: number[] = []
  series.forEach((ch, k) => {
    if (isCls(ch, p.cls)) idxs.push(k)
  })
  if (p.i > idxs.length) return -1
  return p.from === 'L' ? idxs[p.i - 1] : idxs[idxs.length - p.i]
}

function makeSeries40(rng: Rng): string[] {
  const n = 40
  const nl = rng.int(14, 16)
  const nd = rng.int(12, 14)
  const ns = n - nl - nd
  const nv = rng.int(4, 6)
  const vowels = rng.sample(VOWELS.split(''), Math.min(nv, 5))
  const cons = rng.sample('BCDFGHJKLMNPQRSTVWXYZ'.split(''), nl - vowels.length)
  const digits = Array.from({ length: nd }, () => String(rng.int(1, 9)))
  const syms = Array.from({ length: ns }, () => rng.pick(SYM7))
  return rng.shuffle([...vowels, ...cons, ...digits, ...syms])
}

function buildAlphaSet(rng: Rng, k: number): { group: Group; proof: AlphaProof } {
  return retry(200, 'alphanumeric-series', () => {
    const series = makeSeries40(rng)
    const shown = series.join(' ')
    const plan: ('count' | 'count2' | 'sum' | 'delNth' | 'pos')[] = rng.shuffle(['count', 'count2', 'sum', 'delNth', 'pos'] as const).slice()
    const qs: QuestionDraft[] = []
    const props: AlphaProof['questions'] = []
    const stems = new Set<string>()
    const pushQ = (q: QuestionDraft, spec: ASpec, lay: Laid): void => {
      stems.add(q.stem)
      qs.push(q)
      props.push({ spec, options: lay.options, answer: lay.answer })
    }
    for (const kind of plan.slice(0, k)) {
      let ok = false
      for (let t = 0; t < 300 && !ok; t++) {
        if (kind === 'count' || kind === 'count2') {
          const cur = rng.pick(ALL_CLS.filter((c) => c !== 'letter' && c !== 'digit'))
          const nc = kind === 'count' ? 2 : 3
          const conds: Cond[] = []
          const used = new Set<string>()
          for (let i = 0; i < nc; i++) {
            const dir = i < 2 ? (i === 0 ? rng.pick(['prev', 'next'] as const) : conds[0].dir === 'prev' ? 'next' : 'prev') : rng.pick(['prev', 'next'] as const)
            const cls = rng.pick(ALL_CLS)
            const key = `${dir}${cls}`
            if (used.has(key)) continue
            used.add(key)
            conds.push({ dir, cls, neg: false })
          }
          if (conds.length < nc) continue
          // the last condition is a "but not" one
          conds[conds.length - 1].neg = true
          if (kind === 'count2' && rng.chance(0.5)) conds[0].neg = true
          const a = matchIdx(series, cur, conds, true)
          const b = matchIdx(series, cur, conds, false)
          if (a.length !== b.length || a.length < 1 || a.length > 7) continue
          // variants a student gets by overlooking one condition / one direction
          const variant = (f: (c: Cond[]) => Cond[]): number => matchIdx(series, cur, f(conds), true).length
          const slips = [
            ...conds.map((_, i) => variant((cs) => cs.filter((_x, j) => j !== i))),
            variant((cs) => cs.map((c) => ({ ...c, neg: false }))),
            variant((cs) => cs.map((c) => ({ ...c, dir: c.dir === 'prev' ? 'next' : 'prev' }))),
          ]
          const value = a.length
          if (new Set(slips.filter((v) => v !== value)).size < 2) continue
          const stem = `How many ${CLS_NOUN[cur][1]} are there in the above series each of which is ${condPhrase(conds)}?`
          if (stems.has(stem)) continue
          const lay = layout(rng, String(value), [...slips, value + 1, value - 1, value + 2].filter((v) => v >= 0 && v !== value).map(String), () => String(rng.int(0, 9)))
          const triples = a.map((i) => `${series[i - 1] ?? '·'} ${series[i]} ${series[i + 1] ?? '·'}`)
          const steps = [
            `Series: ${shown}`,
            `Look at every ${CLS_NOUN[cur][0]} and check its neighbours: it must be ${condPhrase(conds)}.`,
            `Elements that satisfy all the conditions (shown as previous, element, next): ${triples.join('; ')}.`,
            `Required count = ${value}.`,
          ]
          pushQ(draft(TOPIC_AN, stem, lay, steps), { k: 'count', cur, conds }, lay)
          ok = true
        } else if (kind === 'sum') {
          const cur = rng.pick(['even', 'odd', 'prime'] as const)
          const dirA = rng.pick(['prev', 'next'] as const)
          const conds: Cond[] = [
            { dir: dirA, cls: rng.pick(['letter', 'vowel', 'consonant', 'symbol'] as Cls[]), neg: false },
            { dir: dirA === 'prev' ? 'next' : 'prev', cls: rng.pick(['letter', 'vowel', 'consonant', 'symbol', 'digit'] as Cls[]), neg: true },
          ]
          const a = matchIdx(series, cur, conds, true)
          const b = matchIdx(series, cur, conds, false)
          if (a.length !== b.length || a.length < 2 || a.length > 6) continue
          const value = a.reduce((s, i) => s + Number(series[i]), 0)
          const slips = [
            matchIdx(series, cur, [conds[0]], true).reduce((s, i) => s + Number(series[i]), 0),
            matchIdx(series, cur, [{ ...conds[1], neg: false }], true).reduce((s, i) => s + Number(series[i]), 0),
            matchIdx(series, cur, conds.map((c) => ({ ...c, dir: c.dir === 'prev' ? ('next' as const) : ('prev' as const) })), true).reduce((s, i) => s + Number(series[i]), 0),
            value + series[a[0]].length * Number(series[a[0]]),
          ]
          if (new Set(slips.filter((v) => v !== value)).size < 2) continue
          const stem = `What is the sum of all those ${CLS_NOUN[cur][1]} in the above series, each of which is ${condPhrase(conds)}?`
          if (stems.has(stem)) continue
          const lay = layout(rng, String(value), [...slips, value + 1, value - 1, value + 2, value - 2].filter((v) => v > 0 && v !== value).map(String), () => String(value + rng.int(1, 9)))
          const steps = [
            `Series: ${shown}`,
            `Pick the ${CLS_NOUN[cur][1]} that are ${condPhrase(conds)}: ${a.map((i) => `${series[i - 1] ?? '·'} ${series[i]} ${series[i + 1] ?? '·'}`).join('; ')}.`,
            `Sum = ${a.map((i) => series[i]).join(' + ')} = ${value}.`,
          ]
          pushQ(draft(TOPIC_AN, stem, lay, steps), { k: 'sum', cur, conds }, lay)
          ok = true
        } else if (kind === 'delNth') {
          const del = rng.pick(['symbol', 'vowel', 'even', 'digit', 'consonant'] as Cls[])
          const rest = series.filter((ch) => !isCls(ch, del))
          const from = rng.pick(['L', 'R'] as const)
          const dir = rng.pick(['L', 'R'] as const)
          const i = rng.int(4, rest.length - 5)
          const j = rng.int(2, 6)
          const base = from === 'L' ? i - 1 : rest.length - i
          const idx = dir === 'R' ? base + j : base - j
          if (idx < 0 || idx >= rest.length) continue
          const value = rest[idx]
          // slip: counting in the original series
          const baseO = from === 'L' ? i - 1 : series.length - i
          const idxO = dir === 'R' ? baseO + j : baseO - j
          const slips = [series[idxO] ?? '', rest[idx - 1] ?? '', rest[idx + 1] ?? '', rest[idx - 2] ?? '', rest[idx + 2] ?? '']
          const stem = `If all the ${CLS_NOUN[del][1]} are deleted from the above series, which element will be ${ordinalNum(j)} to the ${dir === 'L' ? 'left' : 'right'} of the ${ordinalNum(i)} element from the ${from === 'L' ? 'left' : 'right'} end of the new series?`
          if (stems.has(stem)) continue
          const lay = layout(rng, value, [...slips, ...rng.shuffle(series)].filter((v) => v !== '' && v !== value), () => rng.pick(series))
          const steps = [
            `Series: ${shown}`,
            `After deleting all ${CLS_NOUN[del][1]}: ${rest.join(' ')} (${rest.length} elements).`,
            `The ${ordinalNum(i)} element from the ${from === 'L' ? 'left' : 'right'} end is ${rest[base]}.`,
            `The ${ordinalNum(j)} element to its ${dir === 'L' ? 'left' : 'right'} is ${value}.`,
          ]
          pushQ(draft(TOPIC_AN, stem, lay, steps), { k: 'delNth', del, from, i, dir, j }, lay)
          ok = true
        } else {
          // positional: either count between two class-picked elements, or the j-th to the side of a class-picked element
          if (rng.chance(0.55)) {
            const cnt = rng.pick(['symbol', 'consonant', 'vowel', 'digit', 'odd'] as Cls[])
            const ca = rng.pick(['digit', 'symbol', 'consonant', 'vowel', 'even'] as Cls[])
            const cb = rng.pick(['digit', 'symbol', 'consonant', 'vowel', 'odd'] as Cls[])
            const a: Pick = { cls: ca, from: 'L', i: rng.int(2, 5) }
            const b: Pick = { cls: cb, from: 'R', i: rng.int(2, 5) }
            const ia = pickIdx(series, a)
            const ib = pickIdx(series, b)
            if (ia < 0 || ib < 0 || Math.abs(ia - ib) < 8) continue
            const lo = Math.min(ia, ib)
            const hi = Math.max(ia, ib)
            const inside = series.slice(lo + 1, hi).filter((ch) => isCls(ch, cnt))
            const value = inside.length
            if (value < 1 || value > 9) continue
            const incl = series.slice(lo, hi + 1).filter((ch) => isCls(ch, cnt)).length
            const slips = [incl, value + 1, value - 1, pickIdx(series, { ...a, i: a.i + 1 }) >= 0 ? series.slice(Math.min(pickIdx(series, { ...a, i: a.i + 1 }), ib) + 1, Math.max(pickIdx(series, { ...a, i: a.i + 1 }), ib)).filter((ch) => isCls(ch, cnt)).length : value + 2]
            const stem = `How many ${CLS_NOUN[cnt][1]} are there between the ${ordSup(a.i, ca)} from the left end and the ${ordSup(b.i, cb)} from the right end of the above series?`
            if (stems.has(stem)) continue
            const lay = layout(rng, String(value), [...slips, value + 2, value - 2].filter((v) => v >= 0 && v !== value).map(String), () => String(rng.int(0, 9)))
            const steps = [
              `Series: ${shown}`,
              `The ${ordSup(a.i, ca)} from the left end is ${series[ia]} (position ${ia + 1}); the ${ordSup(b.i, cb)} from the right end is ${series[ib]} (position ${ib + 1}).`,
              `Elements strictly between them (positions ${lo + 2} to ${hi}): ${series.slice(lo + 1, hi).join(' ')}.`,
              `${CLS_NOUN[cnt][1].replace(/^./, (x) => x.toUpperCase())} among them: ${inside.join(' ')} ⇒ ${value}.`,
            ]
            pushQ(draft(TOPIC_AN, stem, lay, steps), { k: 'between', count: cnt, a, b }, lay)
            ok = true
          } else {
            const ca = rng.pick(['consonant', 'vowel', 'digit', 'symbol', 'even'] as Cls[])
            const a: Pick = { cls: ca, from: rng.pick(['L', 'R'] as const), i: rng.int(2, 6) }
            const dir = rng.pick(['L', 'R'] as const)
            const j = rng.int(3, 7)
            const ia = pickIdx(series, a)
            if (ia < 0) continue
            const idx = dir === 'R' ? ia + j : ia - j
            if (idx < 0 || idx >= series.length) continue
            const value = series[idx]
            const slips = [series[idx - 1] ?? '', series[idx + 1] ?? '', series[dir === 'R' ? ia - j : ia + j] ?? '', series[idx - 2] ?? '', series[idx + 2] ?? '']
            const stem = `Which element is ${ordinalNum(j)} to the ${dir === 'L' ? 'left' : 'right'} of the ${ordSup(a.i, ca)} from the ${a.from === 'L' ? 'left' : 'right'} end of the above series?`
            if (stems.has(stem)) continue
            const lay = layout(rng, value, [...slips, ...rng.shuffle(series)].filter((v) => v !== '' && v !== value), () => rng.pick(series))
            const steps = [
              `Series: ${shown}`,
              `The ${ordSup(a.i, ca)} from the ${a.from === 'L' ? 'left' : 'right'} end is ${series[ia]} (position ${ia + 1} from the left).`,
              `The ${ordinalNum(j)} element to its ${dir === 'L' ? 'left' : 'right'} is at position ${idx + 1}: ${value}.`,
            ]
            pushQ(draft(TOPIC_AN, stem, lay, steps), { k: 'nthOf', a, dir, j }, lay)
            ok = true
          }
        }
      }
      if (!ok) throw new Reject('could not place a question')
    }
    return {
      group: { stimulus: { directions: 'Study the following arrangement carefully and answer the questions given below:', parts: [{ kind: 'text', paragraphs: [shown] }] }, questions: qs },
      proof: { series, questions: props },
    }
  })
}

export function genAlpha(rng: Rng, count: number): Proofed<AlphaProof> {
  const groups: Group[] = []
  const proofs: AlphaProof[] = []
  for (const k of splitCount(count, 5)) {
    const r = buildAlphaSet(rng, k)
    groups.push(r.group)
    proofs.push(r.proof)
  }
  return { groups, proofs }
}

// ============================================================================================================ REASONING-MISC
const TOPIC_MISC: ReasoningTopicId = 'reasoning-misc'

// ------------------------------------------------------------------ input-output machine
interface KeyDef {
  id: string
  kind: 'num' | 'word'
  /** Total order used by the rule: negative when a comes before b ("first" = least). */
  cmp: (a: string, b: string) => number
  /** Description of the element that comes first / last under cmp. */
  first: string
  last: string
  /** Description of the arrangement in which cmp-smaller elements stand on the left. */
  order: string
}
const dsumStr = (s: string): number => s.split('').reduce((t, c) => t + Number(c), 0)
const vowelCount = (s: string): number => s.split('').filter((c) => 'aeiou'.includes(c)).length
function numKey(id: string, attr: string, f: (s: string) => number, dir: 1 | -1, withTie: boolean): KeyDef {
  const lo = dir === 1 ? 'smallest' : 'largest'
  const hi = dir === 1 ? 'largest' : 'smallest'
  const tieF = withTie ? ' (if tied, the smaller number)' : ''
  const tieL = withTie ? ' (if tied, the larger number)' : ''
  return {
    id,
    kind: 'num',
    cmp: (a, b) => dir * (f(a) - f(b)) || Number(a) - Number(b),
    first: attr === 'value' ? `the ${lo} number` : `the number with the ${lo} ${attr}${tieF}`,
    last: attr === 'value' ? `the ${hi} number` : `the number with the ${hi} ${attr}${tieL}`,
    order: attr === 'value' ? `${dir === 1 ? 'increasing' : 'decreasing'} order of value` : `${dir === 1 ? 'increasing' : 'decreasing'} order of the ${attr}${withTie ? ' (ties: the smaller number first)' : ''}`,
  }
}
function wordKey(id: string, attr: string, f: (s: string) => number | string, dir: 1 | -1, kind: 'alpha' | 'len' | 'last' | 'vow'): KeyDef {
  const cmpv = (a: string, b: string): number => {
    const x = f(a)
    const y = f(b)
    return x < y ? -1 : x > y ? 1 : 0
  }
  const names: Record<string, [string, string]> = {
    alpha: ['comes first in alphabetical order', 'comes last in alphabetical order'],
    len: ['has the fewest letters', 'has the most letters'],
    last: ['has the earliest last letter in the alphabet', 'has the latest last letter in the alphabet'],
    vow: ['has the fewest vowels', 'has the most vowels'],
  }
  const [lo, hi] = dir === 1 ? names[kind] : [names[kind][1], names[kind][0]]
  const tie = kind === 'alpha' ? '' : dir === 1 ? ' (if tied, the alphabetically earlier word)' : ' (if tied, the alphabetically earlier word)'
  const tieL = kind === 'alpha' ? '' : ' (if tied, the alphabetically later word)'
  return {
    id,
    kind: 'word',
    cmp: (a, b) => dir * cmpv(a, b) || (a < b ? -1 : a > b ? 1 : 0),
    first: `the word that ${lo}${tie}`,
    last: `the word that ${hi}${tieL}`,
    order: kind === 'alpha' ? `${dir === 1 ? 'alphabetical' : 'reverse alphabetical'} order` : `${dir === 1 ? 'increasing' : 'decreasing'} order of ${attr}${kind === 'last' ? '' : ''} (ties: alphabetical order)`,
  }
}
const NUM_KEYS: KeyDef[] = [
  numKey('val+', 'value', (s) => Number(s), 1, false),
  numKey('val-', 'value', (s) => Number(s), -1, false),
  numKey('ds+', 'sum of digits', dsumStr, 1, true),
  numKey('ds-', 'sum of digits', dsumStr, -1, true),
  numKey('ud+', 'unit digit', (s) => Number(s) % 10, 1, true),
  numKey('ud-', 'unit digit', (s) => Number(s) % 10, -1, true),
  numKey('td+', 'tens digit', (s) => Math.floor(Number(s) / 10), 1, true),
  numKey('td-', 'tens digit', (s) => Math.floor(Number(s) / 10), -1, true),
]
const WORD_KEYS: KeyDef[] = [
  wordKey('al+', 'alphabet', (s) => s, 1, 'alpha'),
  wordKey('al-', 'alphabet', (s) => s, -1, 'alpha'),
  wordKey('ln+', 'number of letters', (s) => s.length, 1, 'len'),
  wordKey('ln-', 'number of letters', (s) => s.length, -1, 'len'),
  wordKey('ll+', 'last letter', (s) => s[s.length - 1], 1, 'last'),
  wordKey('ll-', 'last letter', (s) => s[s.length - 1], -1, 'last'),
  wordKey('vw+', 'number of vowels', vowelCount, 1, 'vow'),
  wordKey('vw-', 'number of vowels', vowelCount, -1, 'vow'),
]
const KEY_BY_ID = new Map<string, KeyDef>([...NUM_KEYS, ...WORD_KEYS].map((k) => [k.id, k]))
const MACHINE_WORDS = [
  'tree', 'book', 'lamp', 'door', 'bird', 'milk', 'ship', 'rain', 'moon', 'farm', 'gold', 'wind', 'cake', 'fish', 'nest', 'road', 'sand', 'wolf', 'bell', 'coin',
  'desk', 'echo', 'frog', 'goat', 'hill', 'iron', 'jar', 'kite', 'lion', 'mint', 'oak', 'pond', 'quilt', 'rose', 'sun', 'tent', 'urn', 'vase', 'wax', 'yarn',
  'apple', 'bread', 'chair', 'dance', 'eagle', 'flame', 'grape', 'house', 'ivory', 'joker', 'knife', 'lemon', 'mango', 'night', 'ocean', 'paper', 'queen', 'river', 'stone', 'table',
]

type MPat = 'selL' | 'selLx' | 'selR' | 'alt' | 'bubble' | 'swapK'
export interface MRule {
  pat: MPat
  key: string | null
  k: number
}
const ROMAN_STEP = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

function stepRule(r: MRule, a: string[], t: number): string[] {
  const n = a.length
  const o = a.slice()
  const key = r.key ? (KEY_BY_ID.get(r.key) as KeyDef) : null
  switch (r.pat) {
    case 'selL':
    case 'selLx': {
      const cmp = (key as KeyDef).cmp
      const i = t - 1
      if (i >= n - 1) return o
      let m = i
      for (let j = i + 1; j < n; j++) if (cmp(o[j], o[m]) < 0) m = j
      if (r.pat === 'selL') {
        const [x] = o.splice(m, 1)
        o.splice(i, 0, x)
      } else [o[i], o[m]] = [o[m], o[i]]
      return o
    }
    case 'selR': {
      const cmp = (key as KeyDef).cmp
      const i = n - t
      if (i <= 0) return o
      let m = 0
      for (let j = 1; j <= i; j++) if (cmp(o[j], o[m]) > 0) m = j
      const [x] = o.splice(m, 1)
      o.splice(i, 0, x)
      return o
    }
    case 'alt': {
      const cmp = (key as KeyDef).cmp
      const odd = t % 2 === 1
      const lp = odd ? (t - 1) / 2 : t / 2
      const rp = odd ? (t - 1) / 2 : t / 2 - 1
      const lo = lp
      const hi = n - 1 - rp
      if (lo >= hi) return o
      let m = lo
      for (let j = lo + 1; j <= hi; j++) if (odd ? cmp(o[j], o[m]) < 0 : cmp(o[j], o[m]) > 0) m = j
      const [x] = o.splice(m, 1)
      o.splice(odd ? lo : hi, 0, x)
      return o
    }
    case 'bubble': {
      const cmp = (key as KeyDef).cmp
      for (let i = 0; i + 1 < n; i++) if (cmp(o[i], o[i + 1]) > 0) [o[i], o[i + 1]] = [o[i + 1], o[i]]
      return o
    }
    case 'swapK': {
      const i = t - 1
      const j = i + r.k
      if (j >= n) return o
      ;[o[i], o[j]] = [o[j], o[i]]
      return o
    }
  }
}
const sameArr = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i])
/** states[t] = arrangement after step t, up to the last step that changes anything. `clean`: no step before that one is a no-op. */
function trajectory(r: MRule, init: string[]): { states: string[][]; L: number; clean: boolean } {
  const n = init.length
  const maxT = r.pat === 'swapK' ? n - r.k : n - 1
  const states: string[][] = [init]
  let cur = init
  let last = 0
  let clean = true
  let sawNoop = false
  for (let t = 1; t <= maxT; t++) {
    const nx = stepRule(r, cur, t)
    if (sameArr(nx, cur)) sawNoop = true
    else {
      if (sawNoop) clean = false
      last = t
    }
    states.push(nx)
    cur = nx
  }
  return { states: states.slice(0, last + 1), L: last, clean }
}
function ruleText(r: MRule): string {
  const key = r.key ? (KEY_BY_ID.get(r.key) as KeyDef) : null
  switch (r.pat) {
    case 'selL':
      return `In step t, ${(key as KeyDef).first} among the elements from the t-th position onwards is moved to the t-th position from the left (the other elements keep their relative order).`
    case 'selLx':
      return `In step t, ${(key as KeyDef).first} among the elements from the t-th position onwards is interchanged with the element at the t-th position from the left.`
    case 'selR':
      return `In step t, ${(key as KeyDef).last} among the elements up to the t-th position from the right end is moved to the t-th position from the right (the other elements keep their relative order).`
    case 'alt':
      return `In the odd steps, ${(key as KeyDef).first} among the elements not yet fixed is moved to the left end of the unfixed part; in the even steps, ${(key as KeyDef).last} among them is moved to the right end of the unfixed part (the other elements keep their relative order).`
    case 'bubble':
      return `In every step the elements are compared in pairs from left to right (1st with 2nd, then 2nd with 3rd, and so on, using the updated arrangement) and a pair is interchanged whenever its elements are not in ${(key as KeyDef).order}.`
    case 'swapK':
      return `In step t, the element at the t-th position from the left is interchanged with the element ${r.k} places to its right (position t + ${r.k}).`
  }
}
function machineFamily(kind: 'num' | 'word'): MRule[] {
  const keys = kind === 'num' ? NUM_KEYS : WORD_KEYS
  const out: MRule[] = []
  for (const p of ['selL', 'selLx', 'selR', 'alt', 'bubble'] as MPat[]) for (const k of keys) out.push({ pat: p, key: k.id, k: 0 })
  out.push({ pat: 'swapK', key: null, k: 2 }, { pat: 'swapK', key: null, k: 3 })
  return out
}
const FAM_NUM = machineFamily('num')
const FAM_WORD = machineFamily('word')

export interface MachineProof {
  kind: 'num' | 'word'
  rule: MRule
  example: string[]
  shown: string[][]
  questions: { type: 'step' | 'count' | 'pos' | 'sum'; input: string[]; step: number; from: 'L' | 'R'; j: number; options: string[]; answer: number }[]
}

function randElems(rng: Rng, kind: 'num' | 'word', n: number): string[] {
  if (kind === 'num') {
    const s = new Set<number>()
    while (s.size < n) s.add(rng.int(11, 98))
    return rng.shuffle([...s].map(String))
  }
  return rng.sample(MACHINE_WORDS, n)
}

function buildMachine(rng: Rng, k: number): { group: Group; proof: MachineProof } {
  return retry(120, 'reasoning-misc(machine)', () => {
    const kind: 'num' | 'word' = rng.chance(0.7) ? 'num' : 'word'
    const keys = kind === 'num' ? NUM_KEYS : WORD_KEYS
    const fam = kind === 'num' ? FAM_NUM : FAM_WORD
    const pat = rng.pick(['selL', 'selLx', 'selR', 'alt', 'alt', 'bubble', 'swapK'] as MPat[])
    const rule: MRule = pat === 'swapK' ? { pat, key: null, k: rng.pick([2, 3]) } : { pat, key: rng.pick(keys).id, k: 0 }
    const n = kind === 'num' ? rng.int(6, 8) : 6
    const example = randElems(rng, kind, n)
    const tr = trajectory(rule, example)
    need(tr.clean && tr.L >= 3, 'example trajectory unsuitable')
    // the rule must be identifiable from the two shown steps
    const consistent = fam.filter((r) => {
      const t = trajectory(r, example)
      return t.L >= 2 && sameArr(t.states[1], tr.states[1]) && sameArr(t.states[2], tr.states[2])
    })
    ensure(consistent.some((r) => r.pat === rule.pat && r.key === rule.key && r.k === rule.k), 'machine: the true rule is not in its own family')
    const inputs: string[][] = []
    const trajs: ReturnType<typeof trajectory>[] = []
    for (let q = 0; q < 3; q++) {
      let found = false
      for (let t = 0; t < 40 && !found; t++) {
        const inp = randElems(rng, kind, kind === 'num' ? rng.int(6, 8) : rng.int(5, 6))
        const tj = trajectory(rule, inp)
        if (!tj.clean || tj.L < 3) continue
        if (consistent.some((r) => { const t2 = trajectory(r, inp); return t2.states.length !== tj.states.length || t2.states.some((s, i) => !sameArr(s, tj.states[i])) })) continue
        inputs.push(inp)
        trajs.push(tj)
        found = true
      }
      need(found, 'no identifying input')
    }
    const show = (a: string[]): string => a.join(' ')
    const qs: QuestionDraft[] = []
    const props: MachineProof['questions'] = []
    const rest = (tj: ReturnType<typeof trajectory>, t: number, inp: string[]): string[] => {
      const lines: string[] = []
      for (let i = 1; i <= Math.min(t, tj.L); i++) lines.push(`Step ${ROMAN_STEP[i]}: ${show(tj.states[i])}`)
      lines.unshift(`Input: ${show(inp)}`)
      return lines
    }
    const ruleLines = [`Rule (from the two steps shown): ${ruleText(rule)}`, `Check: Input ${show(example)} → Step I ${show(tr.states[1])} → Step II ${show(tr.states[2])}, exactly as in the illustration.`]
    // ---- Q1: a given step of a new input
    {
      const tj = trajs[0]
      const st = rng.int(2, Math.min(tj.L, 4))
      const correct = show(tj.states[st])
      const traps: string[] = [show(tj.states[st - 1]), show(tj.states[Math.min(tj.L, st + 1)])]
      for (const r of rng.shuffle(fam)) {
        if (traps.length > 10) break
        if (r.pat === rule.pat || r.key === rule.key) {
          const t2 = trajectory(r, inputs[0])
          if (t2.states[st]) traps.push(show(t2.states[st]))
        }
      }
      const arr = tj.states[st].slice()
      const i = rng.int(0, arr.length - 2)
      ;[arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]
      traps.push(show(arr))
      const lay = layout(rng, correct, traps, () => {
        const a = tj.states[st].slice()
        const x = rng.int(0, a.length - 1)
        const y = rng.int(0, a.length - 1)
        ;[a[x], a[y]] = [a[y], a[x]]
        return show(a)
      })
      qs.push(draft(TOPIC_MISC, `Which of the following will be Step ${ROMAN_STEP[st]} for the input: ${show(inputs[0])}?`, lay, [...ruleLines, `Apply the rule to the new input:`, ...rest(tj, st, inputs[0])]))
      props.push({ type: 'step', input: inputs[0], step: st, from: 'L', j: 0, options: lay.options, answer: lay.answer })
    }
    // ---- Q2: number of steps
    {
      const tj = trajs[1]
      const value = tj.L
      const traps = [String(inputs[1].length - 1), String(value + 1), String(value - 1), String(value + 2), String(inputs[1].length)].filter((v) => Number(v) > 0)
      const lay = layout(rng, String(value), traps, () => String(rng.int(2, 9)))
      qs.push(draft(TOPIC_MISC, `How many steps will be required to complete the arrangement for the input: ${show(inputs[1])}? (The machine stops when a further step would change nothing.)`, lay, [...ruleLines, `Apply the rule to the new input until nothing changes:`, ...rest(tj, tj.L, inputs[1]), `The last change happens in Step ${ROMAN_STEP[tj.L]}, so ${value} steps are required.`]))
      props.push({ type: 'count', input: inputs[1], step: 0, from: 'L', j: 0, options: lay.options, answer: lay.answer })
    }
    // ---- Q3: an element of a step, or a sum (numbers)
    {
      const tj = trajs[2]
      const inp = inputs[2]
      const useSum = kind === 'num' && rng.chance(0.4)
      if (useSum) {
        const last = tj.states[tj.L]
        const value = Number(last[0]) + Number(last[last.length - 1])
        const prev = tj.states[tj.L - 1]
        const traps = [Number(prev[0]) + Number(prev[prev.length - 1]), Number(inp[0]) + Number(inp[inp.length - 1]), Number(last[0]) + Number(last[1]), Number(last[last.length - 1]) + Number(last[last.length - 2]), value + 10, value - 10].map(String)
        const lay = layout(rng, String(value), traps, () => String(value + rng.int(1, 30) * (rng.chance(0.5) ? 1 : -1)))
        qs.push(draft(TOPIC_MISC, `What is the sum of the first (leftmost) and the last (rightmost) numbers in the last step for the input: ${show(inp)}?`, lay, [...ruleLines, `Apply the rule to the new input until the last step:`, ...rest(tj, tj.L, inp), `Last step: ${show(last)}; first + last = ${last[0]} + ${last[last.length - 1]} = ${value}.`]))
        props.push({ type: 'sum', input: inp, step: 0, from: 'L', j: 0, options: lay.options, answer: lay.answer })
      } else {
        const st = rng.int(2, tj.L)
        const from = rng.pick(['L', 'R'] as const)
        const j = rng.int(2, inp.length - 1)
        const arr = tj.states[st]
        const value = from === 'L' ? arr[j - 1] : arr[arr.length - j]
        const other = from === 'L' ? arr[arr.length - j] : arr[j - 1]
        const traps = [other, tj.states[st - 1][from === 'L' ? j - 1 : arr.length - j], tj.states[Math.min(tj.L, st + 1)][from === 'L' ? j - 1 : arr.length - j], arr[from === 'L' ? j : arr.length - j - 1] ?? '', arr[from === 'L' ? j - 2 : arr.length - j + 1] ?? '', ...inp]
        const lay = layout(rng, value, traps, () => rng.pick(inp))
        qs.push(draft(TOPIC_MISC, `Which element is ${ordinalNum(j)} from the ${from === 'L' ? 'left' : 'right'} end in Step ${ROMAN_STEP[st]} of the input: ${show(inp)}?`, lay, [...ruleLines, `Apply the rule to the new input up to Step ${ROMAN_STEP[st]}:`, ...rest(tj, st, inp), `Step ${ROMAN_STEP[st]}: ${show(arr)}; the ${ordinalNum(j)} from the ${from === 'L' ? 'left' : 'right'} is ${value}.`]))
        props.push({ type: 'pos', input: inp, step: st, from, j, options: lay.options, answer: lay.answer })
      }
    }
    const paras = [
      `A machine rearranges a line of ${kind === 'num' ? 'numbers' : 'words'} by a fixed rule, one step at a time, until no further change is possible. The following is an illustration of an input and the first two steps of its rearrangement:`,
      `Input: ${show(example)}`,
      `Step I: ${show(tr.states[1])}`,
      `Step II: ${show(tr.states[2])}`,
      'The same rule is applied in every later step. Find the rule and answer the questions that follow.',
    ]
    return {
      group: { stimulus: { directions: 'Study the following input and its steps of rearrangement carefully and answer the questions given below:', parts: [{ kind: 'text', paragraphs: paras }] }, questions: qs.slice(0, k) },
      proof: { kind, rule, example, shown: [tr.states[1], tr.states[2]], questions: props.slice(0, k) },
    }
  })
}

// ------------------------------------------------------------------ data sufficiency
const DS_OPTIONS = [
  'The data in statement I alone are sufficient to answer the question, while the data in statement II alone are not sufficient to answer the question',
  'The data in statement II alone are sufficient to answer the question, while the data in statement I alone are not sufficient to answer the question',
  'The data either in statement I alone or in statement II alone are sufficient to answer the question',
  'The data even in both statements I and II together are not sufficient to answer the question',
  'The data in both statements I and II together are necessary to answer the question',
]
interface DSClue {
  text: string
  mask: Uint8Array
  spec: unknown
}
interface DSWorld {
  kind: 'order' | 'circle' | 'dir' | 'family'
  W: number
  ansCode: Uint16Array
  codeStr: string[]
  clues: DSClue[]
  bg: string
  question: string
  /** Everything the verifier needs besides the statements. */
  proof: Record<string, unknown>
  allowSingle: boolean
}
export interface DSProof {
  world: Record<string, unknown>
  kind: string
  stmts: unknown[][]
  cls: number
  options: string[]
  answer: number
}
export type MiscProof = { k: 'machine'; m: MachineProof } | { k: 'ds'; d: DSProof }

function dsWorlds(w: DSWorld, cs: DSClue[]): number[] {
  const out: number[] = []
  for (let i = 0; i < w.W; i++) {
    let ok = true
    for (const c of cs) {
      if (!c.mask[i]) {
        ok = false
        break
      }
    }
    if (ok) out.push(i)
  }
  return out
}
const dsCodes = (w: DSWorld, idx: number[]): number[] => [...new Set(idx.map((i) => w.ansCode[i]))].sort((a, b) => a - b)
const dsSuff = (w: DSWorld, cs: DSClue[]): boolean => dsCodes(w, dsWorlds(w, cs)).length === 1
function dsClassify(w: DSWorld, s1: DSClue[], s2: DSClue[]): number {
  const a = dsSuff(w, s1)
  const b = dsSuff(w, s2)
  if (a && !b) return 0
  if (!a && b) return 1
  if (a && b) return 2
  return dsSuff(w, [...s1, ...s2]) ? 4 : 3
}
function dsGreedy(rng: Rng, w: DSWorld, pool: DSClue[], maxClues: number): DSClue[] | null {
  let cur: number[] = dsWorlds(w, [])
  const chosen: DSClue[] = []
  while (dsCodes(w, cur).length > 1 && chosen.length < maxClues) {
    const cand: DSClue[] = []
    for (const c of rng.shuffle(pool)) {
      if (chosen.includes(c)) continue
      let cnt = 0
      for (const i of cur) if (c.mask[i]) cnt++
      if (cnt < cur.length) cand.push(c)
      if (cand.length >= 6) break
    }
    if (!cand.length) return null
    const c = rng.pick(cand)
    chosen.push(c)
    cur = cur.filter((i) => c.mask[i] === 1)
  }
  if (dsCodes(w, cur).length !== 1) return null
  // prune clues that are not needed
  let kept = chosen.slice()
  for (const c of rng.shuffle(chosen)) {
    const rest = kept.filter((x) => x !== c)
    if (rest.length && dsSuff(w, rest)) kept = rest
  }
  return kept
}
function dsSolve(rng: Rng, w: DSWorld, target: number): { s1: DSClue[]; s2: DSClue[] } | null {
  const minSuff = w.allowSingle ? 1 : 2
  const pool = w.clues
  for (let attempt = 0; attempt < 40; attempt++) {
    let s1: DSClue[] | null = null
    let s2: DSClue[] | null = null
    const insuff = (): DSClue[] | null => {
      for (let t = 0; t < 12; t++) {
        const s = rng.sample(pool, rng.int(1, 3))
        if (s.length && !dsSuff(w, s)) return s
      }
      return null
    }
    const suffS = (): DSClue[] | null => {
      const g = dsGreedy(rng, w, pool, 5)
      if (!g || g.length < minSuff) return null
      if (w.allowSingle && g.length === 1 && rng.chance(0.5)) {
        const extra = rng.pick(pool.filter((c) => c !== g[0]))
        return rng.chance(0.5) ? [g[0], extra] : g
      }
      return g
    }
    if (target === 0 || target === 1) {
      const a = suffS()
      const b = insuff()
      if (!a || !b) continue
      ;[s1, s2] = target === 0 ? [a, b] : [b, a]
    } else if (target === 2) {
      const a = suffS()
      const b = suffS()
      if (!a || !b || (a.length === b.length && a.every((c) => b.includes(c)))) continue
      ;[s1, s2] = [a, b]
    } else if (target === 3) {
      const a = insuff()
      const b = insuff()
      if (!a || !b) continue
      ;[s1, s2] = [a, b]
    } else {
      const g = dsGreedy(rng, w, pool, 5)
      if (!g || g.length < 2) continue
      const sh = rng.shuffle(g)
      const cut = rng.int(1, sh.length - 1)
      ;[s1, s2] = [sh.slice(0, cut), sh.slice(cut)]
      if (rng.chance(0.5)) [s1, s2] = [s2, s1]
    }
    if (s1 && s2 && dsClassify(w, s1, s2) === target) return { s1, s2 }
  }
  return null
}

// ---------- world: linear ordering
function orderDSWorld(rng: Rng): DSWorld {
  const n = rng.chance(0.8) ? 6 : 7
  const nm = pickNames(rng, n, 'letters')
  const th = rng.pick(THEMES)
  const truth = rng.shuffle(Array.from({ length: n }, (_, i) => i))
  const posOf = new Array<number>(n)
  truth.forEach((p, i) => (posOf[p] = i + 1))
  const { data, M } = makeWorlds(n, [])
  // background clue (true, not decisive)
  const bx = rng.int(0, n - 1)
  let by = rng.int(0, n - 1)
  while (by === bx) by = rng.int(0, n - 1)
  const bgClue: OClue = posOf[bx] < posOf[by] ? { k: 'above', x: bx, y: by } : { k: 'above', x: by, y: bx }
  const valid: number[] = []
  for (let i = 0; i < M; i++) if (clueHolds(bgClue, data, i * n, n)) valid.push(i)
  // question
  const askKinds: OAsk[] = [{ k: 'who', r: 1 }, { k: 'who', r: 2 }, { k: 'who', r: n - 1 }, { k: 'who', r: n }, { k: 'higher', x: rng.int(0, n - 1) }, { k: 'below', x: truth[rng.int(0, n - 2)] }]
  if (n === 7) askKinds.push({ k: 'who', r: 4 })
  const ask = rng.pick(askKinds)
  const asked = new Set<number>()
  if (ask.k === 'who') asked.add(truth[ask.r - 1])
  else asked.add(ask.x)
  if (ask.k === 'below') asked.add(truth[posOf[ask.x]])
  const W = valid.length
  const ansCode = new Uint16Array(W)
  valid.forEach((wi, i) => {
    const c = askCode(ask, data, wi * n, n)
    ansCode[i] = c < 0 ? 15 : c
  })
  const codeStr: string[] = []
  for (let c = 0; c < 16; c++) codeStr.push(askIsPerson(ask) ? (nm[c] ?? (c === 15 ? 'nobody' : '')) : String(c))
  // candidate clues, true in the truth world
  const all: OClue[] = []
  for (let x = 0; x < n; x++) {
    all.push({ k: 'ext', x })
    for (let r = 1; r <= n; r++) all.push({ k: 'rank', x, r })
    for (let y = 0; y < n; y++) {
      if (x === y) continue
      all.push({ k: 'above', x, y }, { k: 'adj', x, y })
      if (x < y) for (let m = 1; m <= 3; m++) all.push({ k: 'gap', x, y, m })
      for (let z = 0; z < n; z++) if (z !== x && z !== y && x < z) all.push({ k: 'mid', x, y, z })
    }
  }
  const tpos = Uint8Array.from(posOf)
  const clues: DSClue[] = []
  for (const c of all) {
    if (!clueHolds(c, tpos, 0, n)) continue
    if (c.k === 'rank' && (asked.has(c.x) || (ask.k === 'who' && c.r === ask.r))) continue
    if (c.k === 'ext' && asked.has(c.x)) continue
    if (c.k === 'above' && c.x === bgClue.x && c.y === (bgClue as { y: number }).y) continue
    const mask = new Uint8Array(W)
    for (let i = 0; i < W; i++) mask[i] = clueHolds(c, data, valid[i] * n, n) ? 1 : 0
    clues.push({ text: cap(clueText(c, nm, th, n)), mask, spec: c })
  }
  return {
    kind: 'order',
    W,
    ansCode,
    codeStr,
    clues,
    bg: `${n} persons ${nm.join(', ')} are compared by ${th.noun} (no two are equal). ${cap(clueText(bgClue, nm, th, n))}.`,
    question: orderAskText(ask, nm, th, n),
    proof: { n, persons: nm, bg: bgClue, ask },
    allowSingle: false,
  }
}

// ---------- world: circular seating (everyone faces the centre; "left" = the direction in which seat numbers increase)
type CClue = { k: 'off'; x: number; y: number; d: number } | { k: 'nb'; x: number; y: number } | { k: 'nnb'; x: number; y: number }
function circleHolds(c: CClue, seat: ArrayLike<number>, n: number): boolean {
  const diff = (((seat[c.y] - seat[c.x]) % n) + n) % n
  switch (c.k) {
    case 'off':
      return diff === (((c.d % n) + n) % n)
    case 'nb':
      return diff === 1 || diff === n - 1
    case 'nnb':
      return diff !== 1 && diff !== n - 1
  }
}
function circleText(c: CClue, nm: string[], n: number): string {
  if (c.k === 'nb') return `${nm[c.x]} and ${nm[c.y]} sit next to each other`
  if (c.k === 'nnb') return `${nm[c.x]} and ${nm[c.y]} are not neighbours`
  if (n % 2 === 0 && c.d === n / 2) return `${nm[c.y]} sits opposite ${nm[c.x]}`
  const a = Math.abs(c.d)
  const side = c.d > 0 ? 'left' : 'right'
  return `${nm[c.y]} sits ${a === 1 ? 'immediately' : a === 2 ? 'second' : 'third'} to the ${side} of ${nm[c.x]}`
}
function circleDSWorld(rng: Rng): DSWorld {
  const n = rng.pick([6, 6, 7, 8])
  const nm = pickNames(rng, n, 'letters')
  // all arrangements with person 0 on seat 0
  let M = 1
  for (let i = 2; i < n; i++) M *= i
  const data = new Uint8Array(M * n)
  const cur = new Uint8Array(n)
  const used = new Uint8Array(n)
  used[0] = 1
  let w = 0
  const rec = (i: number): void => {
    if (i === n) {
      data.set(cur, w * n)
      w++
      return
    }
    for (let s = 1; s < n; s++) {
      if (used[s]) continue
      used[s] = 1
      cur[i] = s
      rec(i + 1)
      used[s] = 0
    }
  }
  rec(1)
  const truthIdx = rng.int(0, M - 1)
  const tseat = data.subarray(truthIdx * n, truthIdx * n + n)
  const xA = rng.int(0, n - 1)
  const dChoices = n % 2 === 0 ? [1, -1, 2, -2, n / 2] : [1, -1, 2, -2, 3]
  const dA = rng.pick(dChoices)
  const ansCode = new Uint16Array(M)
  for (let i = 0; i < M; i++) {
    const target = (((data[i * n + xA] + dA) % n) + n) % n
    for (let p = 0; p < n; p++) if (data[i * n + p] === target) ansCode[i] = p
  }
  const clues: DSClue[] = []
  const all: CClue[] = []
  for (let x = 0; x < n; x++)
    for (let y = 0; y < n; y++) {
      if (x === y) continue
      for (const d of dChoices) all.push({ k: 'off', x, y, d })
      if (x < y) all.push({ k: 'nb', x, y }, { k: 'nnb', x, y })
    }
  for (const c of all) {
    if (!circleHolds(c, tseat, n)) continue
    if (c.k === 'off' && c.x === xA && c.d === dA) continue
    const mask = new Uint8Array(M)
    for (let i = 0; i < M; i++) mask[i] = circleHolds(c, data.subarray(i * n, i * n + n), n) ? 1 : 0
    clues.push({ text: cap(circleText(c, nm, n)), mask, spec: c })
  }
  const codeStr = Array.from({ length: 16 }, (_, c) => nm[c] ?? '')
  const qSide = n % 2 === 0 && dA === n / 2 ? `opposite ${nm[xA]}` : `${Math.abs(dA) === 1 ? 'immediately' : Math.abs(dA) === 2 ? 'second' : 'third'} to the ${dA > 0 ? 'left' : 'right'} of ${nm[xA]}`
  return {
    kind: 'circle',
    W: M,
    ansCode,
    codeStr,
    clues,
    bg: `${n} friends ${nm.join(', ')} are sitting around a circular table, all facing the centre.`,
    question: `Who sits ${qSide}?`,
    proof: { n, persons: nm, ask: { x: xA, d: dA } },
    allowSingle: false,
  }
}

// ---------- world: directions between three points
const DIR8_SIGN: [number, number][] = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]]
const dirIdx = (dx: number, dy: number): number => DIR8_SIGN.findIndex((s) => s[0] === Math.sign(dx) && s[1] === Math.sign(dy))
type DClue = { k: 'axis'; x: number; y: number; h: number; d: number } | { k: 'rel'; x: number; y: number; dir: number } | { k: 'dist'; x: number; y: number; d2: number }
function dirHolds(c: DClue, p: ArrayLike<number>): boolean {
  const dx = p[2 * c.y] - p[2 * c.x]
  const dy = p[2 * c.y + 1] - p[2 * c.x + 1]
  switch (c.k) {
    case 'axis':
      return dx === c.d * DV[c.h][0] && dy === c.d * DV[c.h][1]
    case 'rel':
      return dirIdx(dx, dy) === c.dir && !(dx === 0 && dy === 0)
    case 'dist':
      return dx * dx + dy * dy === c.d2
  }
}
function dirDSWorld(rng: Rng): DSWorld {
  const nm = pickNames(rng, 3, 'letters')
  const R = 4
  const coords: number[] = []
  for (let bx = -R; bx <= R; bx++)
    for (let by = -R; by <= R; by++)
      for (let cx = -R; cx <= R; cx++)
        for (let cy = -R; cy <= R; cy++) {
          if ((bx === 0 && by === 0) || (cx === 0 && cy === 0) || (bx === cx && by === cy) || Math.abs(bx - cx) > 4 || Math.abs(by - cy) > 4) continue
          coords.push(0, 0, bx, by, cx, cy)
        }
  const W = coords.length / 6
  const tIdx = rng.int(0, W - 1)
  const pts = (i: number): number[] => coords.slice(i * 6, i * 6 + 6)
  const truth = pts(tIdx)
  const ax = rng.int(0, 2)
  let ay = rng.int(0, 2)
  while (ay === ax) ay = rng.int(0, 2)
  const ansCode = new Uint16Array(W)
  for (let i = 0; i < W; i++) ansCode[i] = dirIdx(coords[i * 6 + 2 * ay] - coords[i * 6 + 2 * ax], coords[i * 6 + 2 * ay + 1] - coords[i * 6 + 2 * ax + 1])
  const all: DClue[] = []
  for (let x = 0; x < 3; x++)
    for (let y = 0; y < 3; y++) {
      if (x === y) continue
      for (let h = 0; h < 4; h++) for (let d = 1; d <= R; d++) all.push({ k: 'axis', x, y, h, d })
      for (let dir = 0; dir < 8; dir++) all.push({ k: 'rel', x, y, dir })
      if (x < y) for (const d2 of [1, 2, 4, 5, 8, 9, 10, 13, 16, 17, 18, 20, 25]) all.push({ k: 'dist', x, y, d2 })
    }
  const text = (c: DClue): string => {
    if (c.k === 'axis') return `${nm[c.y]} is ${c.d} km towards the ${HN[c.h]} of ${nm[c.x]}`
    if (c.k === 'rel') return DIR8[c.dir].includes('-') ? `${nm[c.y]} is to the ${DIR8[c.dir]} of ${nm[c.x]}` : `${nm[c.y]} is exactly ${DIR8[c.dir]} of ${nm[c.x]}`
    const r = Math.sqrt(c.d2)
    return `The distance between ${nm[c.x]} and ${nm[c.y]} is ${Number.isInteger(r) ? r : `√${c.d2}`} km`
  }
  const clues: DSClue[] = []
  for (const c of all) {
    if (!dirHolds(c, truth)) continue
    if (c.k === 'rel' && ((c.x === ax && c.y === ay) || (c.x === ay && c.y === ax))) continue
    const mask = new Uint8Array(W)
    for (let i = 0; i < W; i++) mask[i] = dirHolds(c, coords.slice(i * 6, i * 6 + 6)) ? 1 : 0
    clues.push({ text: text(c), mask, spec: c })
  }
  return {
    kind: 'dir',
    W,
    ansCode,
    codeStr: DIR8.slice(),
    clues,
    bg: `${nm[0]}, ${nm[1]} and ${nm[2]} are three different points on a level ground (North is towards the top). Along the East-West and North-South directions the points lie at whole numbers of km from one another, and no two points are more than 4 km apart in either of these two directions.`,
    question: `In which direction is ${nm[ay]} with respect to ${nm[ax]}?`,
    proof: { persons: nm, ask: { x: ax, y: ay } },
    allowSingle: false,
  }
}

// ---------- world: family (genders unknown)
interface FamShape {
  id: string
  n: number
  spouses: [number, number][]
  bg: (nm: string[]) => string
  /** [person, male term, female term, other person]: "person is the <term> of other". */
  terms: [number, string, string, number][]
  /** [x, y, male term, female term]: "How is x related to y?" (x must be in a married pair so that the partner's statements matter). */
  asks: [number, number, string, string][]
}
const FAM_SHAPES: FamShape[] = [
  {
    id: 'F1',
    n: 5,
    spouses: [[1, 3]],
    bg: (n) => `${n[0]} is the parent of ${n[1]} and ${n[2]}. ${n[1]} is married to ${n[3]}, and ${n[1]} and ${n[3]} are the parents of ${n[4]}. (The genders of the persons are not known.)`,
    terms: [
      [0, 'father', 'mother', 2], [0, 'grandfather', 'grandmother', 4], [0, 'father-in-law', 'mother-in-law', 3],
      [1, 'son', 'daughter', 0], [1, 'brother', 'sister', 2], [1, 'husband', 'wife', 3], [1, 'father', 'mother', 4],
      [2, 'son', 'daughter', 0], [2, 'brother', 'sister', 1], [2, 'uncle', 'aunt', 4],
      [3, 'husband', 'wife', 1], [3, 'father', 'mother', 4], [3, 'son-in-law', 'daughter-in-law', 0], [3, 'brother-in-law', 'sister-in-law', 2],
      [4, 'son', 'daughter', 1], [4, 'son', 'daughter', 3], [4, 'nephew', 'niece', 2], [4, 'grandson', 'granddaughter', 0],
    ],
    asks: [[1, 4, 'father', 'mother'], [3, 4, 'father', 'mother'], [3, 0, 'son-in-law', 'daughter-in-law'], [1, 2, 'brother', 'sister'], [3, 2, 'brother-in-law', 'sister-in-law'], [1, 0, 'son', 'daughter']],
  },
  {
    id: 'F2',
    n: 6,
    spouses: [[1, 3]],
    bg: (n) => `${n[0]} is the parent of ${n[1]} and ${n[2]}. ${n[1]} is married to ${n[3]} and they have a child ${n[4]}. ${n[2]} has a child ${n[5]}. (The genders of the persons are not known.)`,
    terms: [
      [0, 'father', 'mother', 1], [0, 'grandfather', 'grandmother', 5], [0, 'father-in-law', 'mother-in-law', 3],
      [1, 'son', 'daughter', 0], [1, 'husband', 'wife', 3], [1, 'father', 'mother', 4], [1, 'brother', 'sister', 2], [1, 'uncle', 'aunt', 5],
      [2, 'son', 'daughter', 0], [2, 'brother', 'sister', 1], [2, 'father', 'mother', 5], [2, 'uncle', 'aunt', 4],
      [3, 'husband', 'wife', 1], [3, 'father', 'mother', 4], [3, 'son-in-law', 'daughter-in-law', 0], [3, 'brother-in-law', 'sister-in-law', 2],
      [4, 'son', 'daughter', 1], [4, 'son', 'daughter', 3], [4, 'nephew', 'niece', 2], [4, 'grandson', 'granddaughter', 0],
      [5, 'son', 'daughter', 2], [5, 'nephew', 'niece', 1], [5, 'grandson', 'granddaughter', 0],
    ],
    asks: [[1, 5, 'uncle', 'aunt'], [3, 4, 'father', 'mother'], [3, 0, 'son-in-law', 'daughter-in-law'], [1, 2, 'brother', 'sister'], [3, 2, 'brother-in-law', 'sister-in-law'], [1, 4, 'father', 'mother']],
  },
]
function familyDSWorld(rng: Rng): DSWorld {
  const shape = rng.pick(FAM_SHAPES)
  const nm = pickNames(rng, shape.n, 'names')
  const worlds: number[] = []
  for (let g = 0; g < 1 << shape.n; g++) if (shape.spouses.every(([a, b]) => ((g >> a) & 1) !== ((g >> b) & 1))) worlds.push(g)
  const W = worlds.length
  const truthG = rng.pick(worlds)
  const [ax, ay, tm, tf] = rng.pick(shape.asks)
  const ansCode = new Uint16Array(W)
  worlds.forEach((g, i) => (ansCode[i] = (g >> ax) & 1))
  const clues: DSClue[] = []
  for (const [p, m, f, q] of shape.terms) {
    const male = ((truthG >> p) & 1) === 1
    const term = male ? m : f
    const mask = new Uint8Array(W)
    worlds.forEach((g, i) => (mask[i] = ((g >> p) & 1) === (male ? 1 : 0) ? 1 : 0))
    clues.push({ text: `${nm[p]} is the ${term} of ${nm[q]}`, mask, spec: { p, male } })
  }
  return {
    kind: 'family',
    W,
    ansCode,
    codeStr: [tf, tm],
    clues,
    bg: shape.bg(nm),
    question: `How is ${nm[ax]} related to ${nm[ay]}?`,
    proof: { shape: shape.id, n: shape.n, ask: { x: ax, y: ay }, spouses: shape.spouses },
    allowSingle: true,
  }
}

function buildDS(rng: Rng): { q: QuestionDraft; proof: DSProof } {
  return retry(60, 'reasoning-misc(ds)', () => {
    const target = rng.int(0, 4)
    const kinds: ('order' | 'circle' | 'dir' | 'family')[] = target === 4 ? ['order', 'order', 'circle', 'dir', 'dir'] : ['order', 'order', 'circle', 'dir', 'family', 'family']
    const kind = rng.pick(kinds)
    const w = kind === 'order' ? orderDSWorld(rng) : kind === 'circle' ? circleDSWorld(rng) : kind === 'dir' ? dirDSWorld(rng) : familyDSWorld(rng)
    need(w.clues.length >= 6, 'few clues')
    const sol = dsSolve(rng, w, target)
    need(sol !== null, 'class not reachable')
    const { s1, s2 } = sol
    const cls = dsClassify(w, s1, s2)
    ensure(cls === target, 'ds: classification mismatch')
    const stmt = (s: DSClue[]): string => s.map((c) => `${c.text}.`).join(' ')
    const stem = `Each question below consists of a question and two statements numbered I and II. Decide whether the data in the statements are sufficient to answer the question.\n${w.bg}\nQuestion: ${w.question}\nI. ${stmt(s1)}\nII. ${stmt(s2)}`
    const show = (idx: number[]): string => {
      const codes = dsCodes(w, idx)
      return codes.length <= 6 ? codes.map((c) => w.codeStr[c]).join(', ') : `${codes.length} different answers`
    }
    const i1 = dsWorlds(w, s1)
    const i2 = dsWorlds(w, s2)
    const i12 = dsWorlds(w, [...s1, ...s2])
    const verdict = (idx: number[]): string => (dsCodes(w, idx).length === 1 ? 'a single answer, so it is sufficient' : 'more than one possible answer, so it is not sufficient')
    const conclusion = ['Only statement I is sufficient.', 'Only statement II is sufficient.', 'Either statement alone is sufficient.', 'Even together the statements do not fix the answer.', 'Neither statement alone is sufficient, but both together are needed and sufficient.'][cls]
    const pl = (n: number): string => `${n} possibilit${n === 1 ? 'y' : 'ies'}`
    const steps = [
      `Consider every arrangement/possibility consistent with the given information (${w.W} in all).`,
      `Statement I (${pl(i1.length)} left): the answer can be ${show(i1)} ⇒ ${verdict(i1)}.`,
      `Statement II (${pl(i2.length)} left): the answer can be ${show(i2)} ⇒ ${verdict(i2)}.`,
      `I and II together (${pl(i12.length)} left): the answer can be ${show(i12)} ⇒ ${verdict(i12)}.`,
      conclusion,
    ]
    const lay: Laid = { options: DS_OPTIONS.slice(), answer: cls }
    const stmts = [s1.map((c) => c.spec), s2.map((c) => c.spec)]
    return { q: draft(TOPIC_MISC, stem, lay, steps), proof: { world: { ...w.proof, kind: w.kind }, kind: w.kind, stmts, cls, options: lay.options, answer: lay.answer } }
  })
}

export function genMisc(rng: Rng, count: number): Proofed<MiscProof> {
  const groups: Group[] = []
  const proofs: MiscProof[] = []
  let rem = count
  const seen = new Set<string>()
  while (rem > 0) {
    if (rng.chance(0.5)) {
      const k = Math.min(3, rem)
      const r = buildMachine(rng, k)
      groups.push(r.group)
      proofs.push({ k: 'machine', m: r.proof })
      rem -= k
    } else {
      let r = buildDS(rng)
      for (let t = 0; t < 6 && seen.has(r.q.stem); t++) r = buildDS(rng)
      seen.add(r.q.stem)
      groups.push({ questions: [r.q] })
      proofs.push({ k: 'ds', d: r.proof })
      rem -= 1
    }
  }
  return { groups, proofs }
}

// ============================================================================================================ registry
/** The generators together with the proof objects the verification script re-checks. */
export const LOGIC_B_WITH_PROOF = {
  'direction-distance': genDirection,
  'coding-decoding': genCoding,
  'sentence-coding': genSentence,
  'order-ranking': genRanking,
  'alphanumeric-series': genAlpha,
  'reasoning-misc': genMisc,
}

const wrap =
  (f: (rng: Rng, count: number) => { groups: Group[] }): TopicGenerator =>
  (rng: Rng, _difficulty: MockDifficulty, count: number): Group[] =>
    f(rng, count).groups

/** SBI PO Mains-level generators (the difficulty argument is ignored: always mains level). */
export const MAINS_LOGIC_B: Partial<Record<ReasoningTopicId, TopicGenerator>> = {
  'direction-distance': wrap(genDirection),
  'coding-decoding': wrap(genCoding),
  'sentence-coding': wrap(genSentence),
  'order-ranking': wrap(genRanking),
  'alphanumeric-series': wrap(genAlpha),
  'reasoning-misc': wrap(genMisc),
}
