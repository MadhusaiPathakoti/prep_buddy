import { shuffle } from './generators'
import type { PhraseSentenceSeed } from './phraseRearrangementApi'

const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const
export const NO_REARRANGEMENT = 'No rearrangement required'

export interface PhraseSegment {
  label: string
  text: string
}

export interface PhraseRearrangementQuestion {
  id: string
  topic: string
  /** The 5 parts in the order they're shown to the player, each labeled A-E positionally. */
  segments: PhraseSegment[]
  /** 5 choices: 4 letter-permutation strings plus the fixed "No rearrangement required", in that order. */
  options: string[]
  correctOption: string
  correctSentence: string
  timeLimitSec: number
}

function randomPermutationKey(): string {
  const arr: string[] = [...LETTERS]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.join('')
}

/** A random permutation of [0..4] that is NOT the identity (so the stem is always visibly shuffled when one is needed). */
function randomDisplayOrder(): number[] {
  const arr = [0, 1, 2, 3, 4]
  do {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
  } while (arr.every((v, i) => v === i))
  return arr
}

function buildQuestion(seed: PhraseSentenceSeed, timeLimitSec: number, index: number): PhraseRearrangementQuestion {
  const parts = seed.parts
  // About 1 in 5 questions is already in correct order, making "No rearrangement required" the answer.
  const noRearrangementNeeded = Math.random() < 0.2
  const displayOrder = noRearrangementNeeded ? [0, 1, 2, 3, 4] : randomDisplayOrder()

  const segments: PhraseSegment[] = displayOrder.map((origIndex, pos) => ({ label: LETTERS[pos], text: parts[origIndex] }))

  // The correct reading order is original parts 0,1,2,3,4 in sequence — find which label each one landed on.
  const labelForOrigIndex: string[] = []
  displayOrder.forEach((origIndex, pos) => {
    labelForOrigIndex[origIndex] = LETTERS[pos]
  })
  const correctPermutation = labelForOrigIndex.join('')

  // "ABCDE" is excluded from the lettered pool either way — when it IS the correct answer, that
  // meaning is already covered by the fixed "No rearrangement required" choice.
  const neededWrongCount = noRearrangementNeeded ? 4 : 3
  const wrongPermutations = new Set<string>()
  let guard = 0
  while (wrongPermutations.size < neededWrongCount && guard < 300) {
    guard += 1
    const candidate = randomPermutationKey()
    if (candidate === 'ABCDE' || candidate === correctPermutation) continue
    wrongPermutations.add(candidate)
  }

  const letteredPool = noRearrangementNeeded ? [...wrongPermutations] : [correctPermutation, ...wrongPermutations]
  const options = [...shuffle(letteredPool), NO_REARRANGEMENT]
  const correctOption = noRearrangementNeeded ? NO_REARRANGEMENT : correctPermutation

  return {
    id: `phrase-${index}-${Math.random().toString(36).slice(2, 8)}`,
    topic: seed.topic,
    segments,
    options,
    correctOption,
    correctSentence: parts.join(' '),
    timeLimitSec,
  }
}

export function buildPhraseRearrangementQuestions(seeds: PhraseSentenceSeed[], timeLimitSec: number): PhraseRearrangementQuestion[] {
  return seeds.map((seed, index) => buildQuestion(seed, timeLimitSec, index))
}

/** Reconstructs the sentence text that a given option (a letter-permutation or "No rearrangement required") produces. */
export function sentenceFromOption(question: PhraseRearrangementQuestion, option: string): string {
  if (option === NO_REARRANGEMENT) return question.segments.map((s) => s.text).join(' ')
  const textByLabel = new Map(question.segments.map((s) => [s.label, s.text]))
  return option
    .split('')
    .map((letter) => textByLabel.get(letter) ?? '')
    .join(' ')
}
