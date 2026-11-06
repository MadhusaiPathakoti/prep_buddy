// SBI PO Mains-level arrangement generators: seating (linear / circular), puzzles (floor / schedule / box) and comparison.
// Every puzzle is proved to have exactly one solution by the exhaustive solver; every answer option is a machine-checkable claim.
import type { Rng } from '../../rng'
import type { Group, MockDifficulty, ReasoningTopicId, TopicGenerator } from '../../types'
import { splitCount, type WithProof } from '../common'
import { generateMainsSet, type ArrangeProof, type PuzzleSpec } from './arrQ'
import { MAINS_COMPARISON_WITH_PROOF, type MainsCmpProof } from './cmp'

export type { ArrangeProof, MainsCmpProof }

const OPTS3 = { minHard: 3, maxClues: 22, minClues: 11, splitProb: 0.6 }
const OPTS2 = { minHard: 3, maxClues: 18, minClues: 9, splitProb: 0.6 }

type Pick = (rng: Rng) => PuzzleSpec

const nx = (n: number) => (n >= 3 ? OPTS3 : OPTS2)

/** Linear seating: one row (8 persons, 3-4 attributes) or two facing rows (8 or 10 persons). */
const linearSpec: Pick = (rng) => {
  const r = rng.next()
  if (r < 0.3) return { kind: 'row', g: { kind: 'row', n: 8 }, nExtra: 3, ...nx(3) }
  if (r < 0.4) return { kind: 'row', g: { kind: 'row', n: 8 }, nExtra: 2, ...nx(2) }
  if (r < 0.75) return { kind: 'tworow', g: { kind: 'tworow', n: 8 }, nExtra: 3, ...nx(3) }
  if (r < 0.88) return { kind: 'tworow', g: { kind: 'tworow', n: 8 }, nExtra: 2, ...nx(2) }
  return { kind: 'tworow', g: { kind: 'tworow', n: 10 }, nExtra: 2, ...nx(2) }
}

const ALT = [0, 1, 0, 1, 0, 1, 0, 1]
const PAIRS = [1, 1, 0, 0, 1, 1, 0, 0]

/** Circular seating: round tables where everybody faces the centre / outside, mixed-facing tables and square tables. */
const circularSpec: Pick = (rng) => {
  const r = rng.next()
  if (r < 0.34) return { kind: 'mixed', g: { kind: 'mixed', n: 8, pattern: ALT }, nExtra: rng.chance(0.6) ? 3 : 2, ...nx(3) }
  if (r < 0.5) return { kind: 'mixed', g: { kind: 'mixed', n: 8, pattern: PAIRS }, nExtra: 2, ...nx(2) }
  if (r < 0.7) return { kind: 'circle', g: { kind: 'circle', n: 8, facing: 'in' }, nExtra: rng.chance(0.6) ? 3 : 2, ...nx(3) }
  if (r < 0.82) return { kind: 'circle', g: { kind: 'circle', n: 8, facing: 'out' }, nExtra: 2, ...nx(2) }
  return { kind: 'square', g: { kind: 'mixed', n: 8, pattern: ALT, square: true }, nExtra: 2, ...nx(2) }
}

const floorSpec: Pick = (rng) => (rng.chance(0.8) ? { kind: 'floor', g: { kind: 'row', n: 8 }, nExtra: 3, ...nx(3) } : { kind: 'floor', g: { kind: 'row', n: 9 }, nExtra: 2, ...nx(2) })

const scheduleSpec: Pick = (rng) => ({ kind: 'schedule', g: { kind: 'row', n: rng.chance(0.55) ? 8 : 7 }, nExtra: 3, ...nx(3) })

const boxSpec: Pick = (rng) => {
  const r = rng.next()
  if (r < 0.35) return { kind: 'stack', g: { kind: 'stacks', n: 9, stacks: 3 }, nExtra: 2, ...nx(2), maxClues: 20 }
  if (r < 0.65) return { kind: 'stack', g: { kind: 'stacks', n: 10, stacks: 2 }, nExtra: 2, ...nx(2), maxClues: 24 }
  if (r < 0.85) return { kind: 'stack', g: { kind: 'stacks', n: 8, stacks: 2 }, nExtra: 3, ...nx(3) }
  return { kind: 'stack', g: { kind: 'stacks', n: 8, stacks: 1 }, nExtra: 2, ...nx(2) }
}

function run(rng: Rng, count: number, topic: ReasoningTopicId, pick: Pick): WithProof<ArrangeProof> {
  const groups: Group[] = []
  const proofs: ArrangeProof[] = []
  for (const k of splitCount(count, 5)) {
    const { group, proof } = generateMainsSet(rng, k, topic, pick(rng))
    groups.push(group)
    proofs.push(proof)
  }
  return { groups, proofs }
}

type ProofGen = (rng: Rng, d: MockDifficulty, count: number) => WithProof<unknown>

/** Same generators with their machine-checkable proof objects (used by scripts/verify-mains-rarrange.ts). */
export const MAINS_ARRANGE_WITH_PROOF: Partial<Record<ReasoningTopicId, ProofGen>> = {
  'seating-linear': (rng, _d, count) => run(rng, count, 'seating-linear', linearSpec),
  'seating-circular': (rng, _d, count) => run(rng, count, 'seating-circular', circularSpec),
  'puzzle-floor': (rng, _d, count) => run(rng, count, 'puzzle-floor', floorSpec),
  'puzzle-schedule': (rng, _d, count) => run(rng, count, 'puzzle-schedule', scheduleSpec),
  'puzzle-box': (rng, _d, count) => run(rng, count, 'puzzle-box', boxSpec),
  'puzzle-comparison': MAINS_COMPARISON_WITH_PROOF,
}

const wrap = (g: ProofGen): TopicGenerator => (rng, d, count) => g(rng, d, count).groups

export const MAINS_ARRANGE: Partial<Record<ReasoningTopicId, TopicGenerator>> = Object.fromEntries(
  (Object.keys(MAINS_ARRANGE_WITH_PROOF) as ReasoningTopicId[]).map((id) => [id, wrap(MAINS_ARRANGE_WITH_PROOF[id] as ProofGen)]),
) as Partial<Record<ReasoningTopicId, TopicGenerator>>
