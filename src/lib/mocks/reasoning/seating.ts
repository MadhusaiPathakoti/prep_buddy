import type { Rng } from '../rng'
import type { MockDifficulty, MockTopicId } from '../types'
import { splitCount, type WithProof } from './common'
import { generateArrangementSet, type ArrangementProof, type PuzzleSpec } from './arrangeQ'

export function runArrangement(
  rng: Rng,
  difficulty: MockDifficulty,
  count: number,
  topic: MockTopicId,
  size: number,
  pickSpec: (rng: Rng, difficulty: MockDifficulty) => PuzzleSpec,
): WithProof<ArrangementProof> {
  const groups = []
  const proofs: ArrangementProof[] = []
  for (const k of splitCount(count, size)) {
    const { group, proof } = generateArrangementSet(rng, difficulty, k, topic, pickSpec(rng, difficulty))
    groups.push(group)
    proofs.push(proof)
  }
  return { groups, proofs }
}

function linearSpec(rng: Rng, difficulty: MockDifficulty): PuzzleSpec {
  if (difficulty === 'medium') {
    if (rng.chance(0.7)) {
      return { kind: 'row', g: { kind: 'row', n: rng.pick([7, 8]) }, nExtra: rng.chance(0.3) ? 1 : 0 }
    }
    return { kind: 'tworow', g: { kind: 'tworow', n: 8 }, nExtra: rng.chance(0.3) ? 1 : 0 }
  }
  const r = rng.next()
  if (r < 0.35) return { kind: 'row', g: { kind: 'row', n: 8 }, nExtra: 1 }
  if (r < 0.85) return { kind: 'tworow', g: { kind: 'tworow', n: 8 }, nExtra: 1 }
  return { kind: 'tworow', g: { kind: 'tworow', n: 10 }, nExtra: 0 }
}

function circularSpec(rng: Rng, difficulty: MockDifficulty): PuzzleSpec {
  if (difficulty === 'medium') {
    return { kind: 'circle', g: { kind: 'circle', n: 8, facing: 'in' }, nExtra: rng.chance(0.3) ? 1 : 0 }
  }
  const r = rng.next()
  if (r < 0.35) return { kind: 'circle', g: { kind: 'circle', n: 8, facing: 'in' }, nExtra: 1 }
  if (r < 0.6) return { kind: 'circle', g: { kind: 'circle', n: 8, facing: 'out' }, nExtra: rng.chance(0.5) ? 1 : 0 }
  return { kind: 'square', g: { kind: 'square', n: 8 }, nExtra: rng.chance(0.5) ? 1 : 0 }
}

export const generateSeatingLinearWithProof = (rng: Rng, d: MockDifficulty, count: number) => runArrangement(rng, d, count, 'seating-linear', 5, linearSpec)
export const generateSeatingCircularWithProof = (rng: Rng, d: MockDifficulty, count: number) => runArrangement(rng, d, count, 'seating-circular', 5, circularSpec)
