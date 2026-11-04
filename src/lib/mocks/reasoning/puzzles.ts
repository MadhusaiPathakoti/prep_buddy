import type { Rng } from '../rng'
import type { MockDifficulty } from '../types'
import type { PuzzleSpec } from './arrangeQ'
import { runArrangement } from './seating'

function floorSpec(rng: Rng, difficulty: MockDifficulty): PuzzleSpec {
  return { kind: 'floor', g: { kind: 'row', n: difficulty === 'hard' ? 8 : rng.pick([7, 8]) }, nExtra: difficulty === 'hard' ? 2 : 1 }
}

function scheduleSpec(rng: Rng, difficulty: MockDifficulty): PuzzleSpec {
  return { kind: 'schedule', g: { kind: 'row', n: rng.chance(0.5) ? 7 : 8 }, nExtra: difficulty === 'hard' ? 2 : 1 }
}

function boxSpec(rng: Rng, difficulty: MockDifficulty): PuzzleSpec {
  const r = rng.next()
  const nExtra = difficulty === 'hard' ? 2 : 1
  if (r < 0.4) return { kind: 'stack', g: { kind: 'stacks', n: 8, stacks: 2 }, nExtra }
  if (r < 0.7) return { kind: 'stack', g: { kind: 'stacks', n: 9, stacks: 3 }, nExtra }
  return { kind: 'stack', g: { kind: 'stacks', n: 8, stacks: 1 }, nExtra }
}

export const generatePuzzleFloorWithProof = (rng: Rng, d: MockDifficulty, count: number) => runArrangement(rng, d, count, 'puzzle-floor', 5, floorSpec)
export const generatePuzzleScheduleWithProof = (rng: Rng, d: MockDifficulty, count: number) => runArrangement(rng, d, count, 'puzzle-schedule', 5, scheduleSpec)
export const generatePuzzleBoxWithProof = (rng: Rng, d: MockDifficulty, count: number) => runArrangement(rng, d, count, 'puzzle-box', 5, boxSpec)
