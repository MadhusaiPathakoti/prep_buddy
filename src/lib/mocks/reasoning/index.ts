// Reasoning generators for the Mocks module (IBPS/SBI PO = hard, Clerk = medium prelims).
// Every generator has a `...WithProof` twin returning machine-checkable proof objects (used by scripts/verify-mocks-reasoning.ts).
import type { Rng } from '../rng'
import type { MockDifficulty, ReasoningTopicId, TopicGenerator } from '../types'
import type { WithProof } from './common'
import { generateSeatingCircularWithProof, generateSeatingLinearWithProof } from './seating'
import { generatePuzzleBoxWithProof, generatePuzzleFloorWithProof, generatePuzzleScheduleWithProof } from './puzzles'
import { generateComparisonWithProof } from './comparison'
import { generateSyllogismWithProof } from './syllogism'
import { generateInequalityWithProof } from './inequality'
import { generateBloodWithProof } from './blood'
import { generateDirectionWithProof } from './direction'
import { generateCodingWithProof } from './coding'
import { generateSentenceCodingWithProof } from './sentenceCoding'
import { generateAlphanumericWithProof } from './alphanumeric'
import { generateRankingWithProof } from './ranking'
import { generateMiscWithProof } from './misc'

export type ProofGenerator = (rng: Rng, difficulty: MockDifficulty, count: number) => WithProof<unknown>

export const REASONING_WITH_PROOF: Record<ReasoningTopicId, ProofGenerator> = {
  'seating-linear': generateSeatingLinearWithProof,
  'seating-circular': generateSeatingCircularWithProof,
  'puzzle-floor': generatePuzzleFloorWithProof,
  'puzzle-schedule': generatePuzzleScheduleWithProof,
  'puzzle-box': generatePuzzleBoxWithProof,
  'puzzle-comparison': generateComparisonWithProof,
  syllogism: generateSyllogismWithProof,
  inequality: generateInequalityWithProof,
  'blood-relation': generateBloodWithProof,
  'direction-distance': generateDirectionWithProof,
  'coding-decoding': generateCodingWithProof,
  'sentence-coding': generateSentenceCodingWithProof,
  'alphanumeric-series': generateAlphanumericWithProof,
  'order-ranking': generateRankingWithProof,
  'reasoning-misc': generateMiscWithProof,
}

const wrap = (g: ProofGenerator): TopicGenerator => (rng, difficulty, count) => g(rng, difficulty, count).groups

export const REASONING_GENERATORS: Record<ReasoningTopicId, TopicGenerator> = Object.fromEntries(
  (Object.keys(REASONING_WITH_PROOF) as ReasoningTopicId[]).map((id) => [id, wrap(REASONING_WITH_PROOF[id])]),
) as Record<ReasoningTopicId, TopicGenerator>

export type { ArrangementProof } from './arrangeQ'
export type { ComparisonProof, CmpClaim } from './comparison'
export type { SyllogismProof, SylStmt } from './syllogism'
export type { InequalityProof } from './inequality'
export type { BloodProof } from './blood'
export type { DirectionProof } from './direction'
export type { CodingProof } from './coding'
export type { SentenceCodingProof } from './sentenceCoding'
export type { AlphaProof } from './alphanumeric'
export type { RankProof } from './ranking'
export type { MiscProof } from './misc'
export type { WithProof } from './common'
