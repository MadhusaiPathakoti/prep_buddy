// Medium-level arrangement generators for the Daily Dose: the Mains engine (unique-solution proof, same question
// families) with fewer attributes and fewer, more direct clues. This sits between the prelims generators (too easy
// for a Daily Dose) and the full Mains set in ./arrange.ts (too long and layered for everyday practice).
import type { Rng } from '../../rng'
import type { Group, ReasoningTopicId, TopicGenerator } from '../../types'
import { splitCount } from '../common'
import { generateMainsSet, type PuzzleSpec } from './arrQ'

type Pick = (rng: Rng) => PuzzleSpec

/** 1 extra attribute: names plus one attribute. */
const OPTS1 = { minHard: 1, maxClues: 15, minClues: 7, splitProb: 0.2 }
/** 2 extra attributes: names plus two attributes. */
const OPTS2 = { minHard: 1, maxClues: 19, minClues: 9, splitProb: 0.25 }

const ALT = [0, 1, 0, 1, 0, 1, 0, 1]

const linearSpec: Pick = (rng) => {
  const r = rng.next()
  if (r < 0.5) return { kind: 'row', g: { kind: 'row', n: 8 }, nExtra: 1, ...OPTS1 }
  if (r < 0.85) return { kind: 'tworow', g: { kind: 'tworow', n: 8 }, nExtra: 1, ...OPTS1 }
  return { kind: 'tworow', g: { kind: 'tworow', n: 8 }, nExtra: 2, ...OPTS2 }
}

const circularSpec: Pick = (rng) => {
  const r = rng.next()
  if (r < 0.5) return { kind: 'circle', g: { kind: 'circle', n: 8, facing: 'in' }, nExtra: 1, ...OPTS1 }
  if (r < 0.7) return { kind: 'circle', g: { kind: 'circle', n: 8, facing: 'out' }, nExtra: 1, ...OPTS1 }
  if (r < 0.9) return { kind: 'mixed', g: { kind: 'mixed', n: 8, pattern: ALT }, nExtra: 1, ...OPTS1 }
  return { kind: 'square', g: { kind: 'mixed', n: 8, pattern: ALT, square: true }, nExtra: 1, ...OPTS1 }
}

const floorSpec: Pick = (rng) => ({ kind: 'floor', g: { kind: 'row', n: 8 }, nExtra: 2, ...(rng.chance(0.5) ? OPTS2 : { ...OPTS2, maxClues: 17 }) })

const scheduleSpec: Pick = (rng) => ({ kind: 'schedule', g: { kind: 'row', n: rng.chance(0.5) ? 7 : 8 }, nExtra: 2, ...OPTS2 })

const boxSpec: Pick = (rng) => {
  const r = rng.next()
  if (r < 0.5) return { kind: 'stack', g: { kind: 'stacks', n: 8, stacks: 2 }, nExtra: 2, ...OPTS2 }
  if (r < 0.8) return { kind: 'stack', g: { kind: 'stacks', n: 9, stacks: 3 }, nExtra: 1, ...OPTS1, maxClues: 16 }
  return { kind: 'stack', g: { kind: 'stacks', n: 8, stacks: 1 }, nExtra: 2, ...OPTS2 }
}

function make(topic: ReasoningTopicId, pick: Pick): TopicGenerator {
  return (rng, _difficulty, count) => {
    const groups: Group[] = []
    for (const k of splitCount(count, 5)) {
      // A draw occasionally cannot yield k distinct questions; the rng has moved on, so just draw again (deterministic).
      let lastError: unknown
      let built: Group | null = null
      for (let attempt = 0; attempt < 6 && !built; attempt++) {
        try {
          built = generateMainsSet(rng, k, topic, pick(rng)).group
        } catch (e) {
          lastError = e
        }
      }
      if (!built) throw lastError
      groups.push(built)
    }
    return groups
  }
}

export const MEDIUM_ARRANGE: Partial<Record<ReasoningTopicId, TopicGenerator>> = {
  'seating-linear': make('seating-linear', linearSpec),
  'seating-circular': make('seating-circular', circularSpec),
  'puzzle-floor': make('puzzle-floor', floorSpec),
  'puzzle-schedule': make('puzzle-schedule', scheduleSpec),
  'puzzle-box': make('puzzle-box', boxSpec),
}
